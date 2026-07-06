# Canaan ERP — Realtime Notifications & Reminders System

Technical documentation. Last updated: 2026-07-06.
Scope: WebSocket realtime layer, persistent notifications, computed reminders (renewals / EMI / payments), Yard Staff alert flow, timezone handling.

---

## 1. Overview

The notification system has **three delivery layers**, so a notification is never lost regardless of network conditions, proxy limitations, or when the recipient logs in:

| Layer | Latency | Survives socket down? | Survives page refresh? | Survives late login? |
|---|---|---|---|---|
| 1. WebSocket push | instant (sub-second) | ✗ | ✗ | ✗ |
| 2. REST polling (10 s) + tab-focus refetch | ≤ 10 s | ✓ | ✓ | ✓ |
| 3. Database persistence (`notifications` table) | — | ✓ | ✓ | ✓ |

Event notifications (e.g. "trip sheet not received") are **written to the database in the same transaction** as the business change, then broadcast over WebSocket for instant delivery. Clients poll the REST API as a fallback and mark notifications read server-side, so state is consistent across tabs, refreshes, and devices.

**Reminders** (renewals, EMI, recurring payments, licenses) are *computed live* from business data on every request — there is nothing to sync and they disappear automatically once the underlying date is updated.

---

## 2. Architecture

```
                         ┌────────────────────────────────────────┐
   mutating request      │              FastAPI backend           │
  (POST/PUT/PATCH/DELETE)│                                        │
  ───────────────────────►  realtime_broadcast middleware         │
                         │      │ emits "data_changed"            │
                         │      ▼                                 │
   business event        │  websocket_manager (in-memory,         │
   e.g. unmark-sheet ────►  debounced 250ms, cap 500 conns)       │
        │                │      │                                 │
        │ same txn       │      │ broadcast JSON frames           │
        ▼                │      ▼                                 │
   notifications table   │   GET /ws?token=<jwt>                  │
        ▲                └──────┬─────────────────────────────────┘
        │ REST                  │ WSS
        │                       ▼
┌───────┴───────────────────────────────────────────┐
│                Next.js frontend                   │
│                                                   │
│  WebSocketContext ──┐        realtime.ts singleton│
│  (Topbar events)    │        (useAutoRefresh)     │
│                     ▼                             │
│            NotificationContext                    │
│   • fetch on login • poll 10s • refetch on focus  │
│   • refetch on WS data_changed / sheet_* events   │
│                     │                             │
│                     ▼                             │
│           Topbar bell (badge + panel)             │
└───────────────────────────────────────────────────┘
```

---

## 3. Backend

### 3.1 WebSocket endpoint — `GET /ws?token=<jwt>`  (`backend/main.py`)

- Connection **rejected with close code 1008** if the JWT is missing/invalid.
- Live connections **closed with code 4001** when the token expires mid-session.
- Client sends `"ping"` every 30 s; server answers `{"type":"pong"}` (keeps cPanel/LiteSpeed proxies from dropping idle connections).
- Frame format: `{"type": "<event>", "payload": {...}, "ts": <unix>}`.

### 3.2 Connection manager (`backend/websocket_manager.py`)

- In-memory, **per-process** (`--workers 1` required in production).
- `MAX_CONNECTIONS = 500` — excess connections closed with 1013 (try again later).
- `DEBOUNCE_SECONDS = 0.25` — bursts of writes coalesce into one broadcast per event/resource key.
- `emit(event_type, payload)` — thread-safe entry point usable from synchronous route handlers (`loop.call_soon_threadsafe`).

### 3.3 Broadcast middleware (`backend/main.py`)

Every successful mutating request (`POST/PUT/PATCH/DELETE`, status < 400, path not under `/auth` or `/ws`) broadcasts:

```json
{"type": "data_changed", "payload": {"resource": "trips", "path": "/trips/12/unmark-sheet"}}
```

No business data travels over the socket — clients refetch through the authenticated REST API.

### 3.4 Persistent notifications

**Model** (`backend/models.py` → table `notifications`, auto-created by `Base.metadata.create_all` at startup):

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `event_type` | varchar(50) | e.g. `sheet_not_received`, `sheet_missing` |
| `title` | varchar(200) | |
| `message` | text | full human-readable message |
| `trip_id_str` | varchar(30) | display id, e.g. `TRP-1024` |
| `booking_reference_no` | varchar(100) | |
| `target_roles` | varchar(200) | comma-separated, e.g. `Admin,Fleet Manager` |
| `created_by` / `created_by_role` | varchar | reporter |
| `is_read` | bool | |
| `created_at` | datetime | **Python-side UTC default** — see §6 Timezones |

**Router** (`backend/routers/notifications.py`, registered with auth dependency):

| Endpoint | Method | Description |
|---|---|---|
| `/notifications?unread_only=true` | GET | Unread notifications where `target_roles` contains the caller's role. Newest first, max 50. |
| `/notifications/{id}/read` | POST | Mark one read. |
| `/notifications/read-all` | POST | Mark all of the caller's role-targeted notifications read. |
| `/notifications/reminders` | GET | Computed reminders — see §3.5. |

**Producers** (`backend/routers/trips.py`):

- `POST /trips/{id}/unmark-sheet` ("Mark as Not Received", any authenticated user):
  - Guards: 404 if trip missing; **400 if a trip sheet has already been entered** (locked); 400 if not currently marked delivered.
  - Clears `trip_sheet_collected` / `trip_sheet_collected_at`, **inserts a `Notification` row (target `Admin,Fleet Manager`) in the same commit**, then emits `sheet_unmarked` and `sheet_not_received_alert` over WebSocket.
- `POST /trips/{id}/flag-sheet-missing` (Yard Staff): undoes delivery if applicable, persists a `sheet_missing` notification, emits `sheet_alert`.

### 3.5 Computed reminders — `GET /notifications/reminders`

Recomputed from live data on every call; sorted by urgency (`days_left` ascending). Returns `[]` for roles other than Admin / Fleet Manager.

| Source | Fields scanned | Window | Visible to |
|---|---|---|---|
| Trucks | insurance expiry, FC expiry, RC validity, road tax, national permit, local permit, pollution certificate | 30 days (`DOC_WINDOW_DAYS`) | Admin + Fleet Manager |
| Drivers | `license_expiry_date` | 30 days | Admin + Fleet Manager |
| EMI records | `emi_payment_date` rolled forward to the current month's occurrence; loans past `emi_end_date` skipped | 7 days (`PAY_WINDOW_DAYS`) | Admin only |
| Recurring payments | `next_due_date` (status = Active) | 7 days | Admin only |

Response item shape:

```json
{
  "kind": "insurance | fc | rc | road_tax | national_permit | local_permit | pollution | license | emi | recurring",
  "severity": "overdue | due_soon",
  "title": "Insurance expiring",
  "detail": "KA-01-AB-1234 — Insurance expires on 2026-07-20",
  "entity": "KA-01-AB-1234",
  "due_date": "2026-07-20",
  "days_left": 14,
  "href": "/maintenance/compliance"
}
```

`href` is the frontend route the bell navigates to on click: `/maintenance/compliance`, `/resources/drivers`, or `/finance/emi-tracking`.

---

## 4. Frontend

### 4.1 WebSocket clients

Two clients share the same backend `/ws` endpoint:

1. **`src/context/WebSocketContext.tsx`** — provider used by `useWebSocketEvent(eventType, handler)`. Reconnects every 3 s while a token exists. Used by the Topbar and pages for named business events (`sheet_unmarked`, `leave_request_created`, `edit_approval_created`, …).
2. **`src/lib/realtime.ts`** — module singleton used by `useAutoRefresh` and `NotificationContext`. Exponential backoff (1 s → 30 s), 30 s heartbeat, `subscribeRealtime()` / `isRealtimeConnected()` / `disconnectRealtime()` (called on logout).

Both read the JWT from `sessionStorage` key `canaan_erp_user` (per-tab sessions — two users can work in two tabs of one browser).

### 4.2 `NotificationContext` (`src/context/NotificationContext.tsx`)

Mounted in `app/layout.tsx` inside `AuthProvider` → `WebSocketProvider`. Exposes:

```ts
{ sheetAlerts, reminders, pushSheetAlert, dismissSheetAlert, clearSheetAlerts }
```

Behaviour (only when the user is Admin or Fleet Manager):

- **Initial fetch on login** of unread notifications + reminders.
- **Poll every 10 s** (`POLL_MS`).
- **Refetch on window focus** — switching to the Admin tab updates instantly.
- **Refetch on WebSocket signal** — any `data_changed` or `sheet_*` event triggers a reload, debounced 1.5 s against bursts.
- **Merge/dedupe** — server rows (carrying `serverId`) replace matching locally-pushed alerts (matched on `tripIdStr` + `bookingRef`); local alerts are kept only until their server copy arrives.
- `dismissSheetAlert(i)` calls `POST /notifications/{id}/read` when the alert is server-backed, so dismissal persists across refreshes and tabs.

### 4.3 Topbar bell (`src/components/layout/Topbar.tsx`)

Panel sections (top to bottom):

| Section | Colour | Audience | Source |
|---|---|---|---|
| Trip Sheet Alerts | orange | Admin + Fleet Manager | `NotificationContext.sheetAlerts` |
| Renewals & Payments | red (overdue) / amber (due soon) | Admin (+ FM for documents) | `NotificationContext.reminders` |
| Leave Requests | blue | Admin | REST + `leave_request_created` WS |
| Edit Requests | purple | Admin | REST + `edit_approval_created` WS |
| Edit Access Approved | green | Trip Sheet Coordinator | `edit_approval_updated` WS |

- Badge count = sheet alerts + reminders + role-specific items (leave/edit requests for Admin, edit approvals for Trip Sheet Coordinator).
- Sheet alerts show reporter name, relative time ("5m ago") **and absolute IST time** ("05 Jul, 06:34 pm").
- Reminder rows show a countdown: "Due today", "N days left", or "Overdue by N days".
- Clicking a row dismisses it (server-side for persisted ones) and navigates to the relevant page.
- Topbar also listens on `sheet_unmarked` / `sheet_alert` / `sheet_not_received_alert` WS events and pushes into the shared context for instant display.

### 4.4 Reconciliation page (`src/app/trips/reconciliation/page.tsx`)

- Lists only trips with `tripSheetCollected === true` (gated by the Yard Staff).
- "Mark as Not Received" button → `POST /trips/{id}/unmark-sheet`; on success removes the row, shows a toast, and pushes a local sheet alert (instant feedback for the clicker).
- Button replaced by a grey **Locked** badge once a trip sheet has been entered (backend enforces the same rule with a 400).
- Admin/Manager sessions on this page also get a SweetAlert popup via the `sheet_not_received_alert` WS event.

### 4.5 API client (`src/lib/api.ts`)

```ts
notificationsApi.list(unreadOnly?)   // → ServerNotification[]
notificationsApi.markRead(id)
notificationsApi.markAllRead()
remindersApi.list()                  // → Reminder[]
tripsApi.collectSheet(dbId) / unmarkSheet(dbId) / flagSheetMissing(dbId)
```

---

## 5. WebSocket event catalogue

| Event | Emitted by | Payload highlights | Consumed by |
|---|---|---|---|
| `data_changed` | middleware (every mutation) | `resource`, `path` | `useAutoRefresh` (all pages), `NotificationContext` |
| `sheet_collected` | collect-sheet | trip id, collected flag | reconciliation, sheet-collection pages |
| `sheet_unmarked` | unmark-sheet, flag-sheet-missing | trip ids, booking ref, `reported_by` | Topbar, reconciliation page |
| `sheet_not_received_alert` | unmark-sheet | + `reported_by_role`, `message` | Topbar, reconciliation page (SweetAlert) |
| `sheet_alert` | flag-sheet-missing | trip ids, booking ref | Topbar |
| `leave_request_created` / `leave_request_updated` | attendance router | request fields | Topbar (Admin) |
| `edit_approval_created` / `edit_approval_updated` | edit-approvals router | request fields, `staff_db_id`, `status` | Topbar (Admin / Trip Sheet Coordinator) |
| `trip_created` / `trip_updated` / `trip_closed` | trips router | trip ids | trip pages |

---

## 6. Timezones

**Rule: everything stored and transported as UTC; converted to IST only at render time.**

- Backend writes timestamps with `datetime.now(timezone.utc)` (never `datetime.utcnow()`, never `func.now()` for API-visible fields — `func.now()` uses the *database server's* clock, which caused notifications to display hours off).
- `schemas.OrmBase.model_post_init` stamps naive MySQL `DATETIME` values with `tzinfo=UTC`, so JSON serializes with an explicit `+00:00` offset.
- Frontend renders with `toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })` (`fmtIST` helpers in Topbar and sheet-collection page). Relative times (`timeAgo`) append `Z` to any naive string defensively before parsing.
- Rows created before this fix carry DB-server-local times and will display shifted; dismiss them once — new rows are correct.

---

## 7. Security

- WS handshake requires a valid, unexpired JWT (`?token=`); expiry enforced mid-session (close 4001).
- Notification listing is filtered server-side by the caller's **role from the signed token** — a client cannot request another role's notifications.
- Reminders endpoint returns data only for Admin / Fleet Manager (finance items Admin-only).
- Only `{resource, path}` metadata travels over the socket; business data always goes through authenticated REST.
- Connection cap (500) + server-side (250 ms) and client-side (300 ms / 1.5 s) debouncing prevent flood/refetch storms.

See `SECURITY.md` §8 for the full WebSocket security review.

---

## 8. Deployment notes (GoDaddy cPanel)

1. **Restart the backend** after deploying — the `notifications` table is auto-created at startup.
2. Run **one uvicorn worker** (`--workers 1`): the connection manager is per-process; multiple workers would fragment broadcasts.
3. Proxy `/ws` with WebSocket upgrade in `.htaccess`:
   ```apache
   RewriteEngine On
   RewriteCond %{HTTP:Upgrade} websocket [NC]
   RewriteCond %{REQUEST_URI} ^/ws [NC]
   RewriteRule ^ws(.*)$ ws://127.0.0.1:<port>/ws$1 [P,L]
   ```
4. Serve over HTTPS → the socket runs as WSS automatically (`API_URL.replace(/^http/, "ws")`).
5. **If the WS proxy is not configured, the system still works** — delivery degrades gracefully to the 10 s poll + focus refetch. Instant (sub-second) delivery requires the proxy rule.

---

## 9. Failure modes & guarantees

| Scenario | Behaviour |
|---|---|
| WebSocket blocked by proxy | Alerts arrive within ≤ 10 s via polling; instantly on tab focus. |
| Backend restarts | WS clients auto-reconnect (3 s / exponential backoff). Persisted notifications unaffected. |
| Admin not logged in when event fires | Notification waits unread in DB; delivered on next login. |
| Duplicate WS event + poll result | Deduped on `tripIdStr` + `bookingRef`; server copy wins. |
| Burst of mutations (bulk collect) | Server coalesces broadcasts (250 ms); clients debounce refetch (300 ms pages / 1.5 s notifications). |
| Same user action in clicking tab | Local push gives instant feedback without waiting for any network round-trip. |
| Token expires mid-session | WS closed 4001; REST returns 401 → redirect to login; socket reconnects after re-login with the new token. |

---

## 10. Extending the system

**New persistent notification type:**
1. `db.add(models.Notification(event_type="...", title="...", message="...", target_roles="Admin", ...))` inside the producing endpoint's transaction.
2. Optionally `emit("your_event", {...})` for instant push.
3. Frontend: consume via `NotificationContext` (extend the fetch/render if it needs its own section) or `useWebSocketEvent("your_event", ...)` for page-level reactions.

**New reminder source:** add a scan block in `list_reminders()` (`backend/routers/notifications.py`) returning the standard reminder shape with an appropriate `href` — the Topbar renders it automatically.

**Tuning:** `DOC_WINDOW_DAYS` / `PAY_WINDOW_DAYS` (backend), `POLL_MS` / `REALTIME_DEBOUNCE_MS` (`NotificationContext`), `MAX_CONNECTIONS` / `DEBOUNCE_SECONDS` (`websocket_manager.py`).
