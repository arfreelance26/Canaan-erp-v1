# Canaan ERP — Security Report

Date: 2026-07-05 (baseline) · **Updated 2026-08-03 (enterprise hardening pass)**
Scope: full stack (FastAPI backend + Next.js frontend)

---

## 0. Enterprise hardening pass — 2026-08-03

Implemented ahead of production go-live. Addresses the findings in
`SECURITY_PLAN.md` (see its §0 status table). Highlights:

- **Authenticated file downloads (was CRITICAL):** `GET /files/...` now requires a
  valid token — sent as an `Authorization` header **or** a `?token=` query param so
  `<img>` tags still render. No token → `401`. This closes the previously public,
  enumerable access to Aadhaar / licence / PAN / vehicle-compliance documents.
  Every access to a regulated document is written to the audit trail.
- **Upload validation:** 25 MB cap **plus magic-byte content sniffing** against an
  allowlist (PDF/JPG/PNG/WEBP/GIF). The client-supplied content-type and file
  extension are no longer trusted; non-image files are served as `attachment` with
  `Content-Security-Policy: sandbox` so a stored HTML/SVG payload cannot execute.
- **Admin backdoor removed / fail-closed:** no more `admin`/`admin` default. In
  `APP_ENV=production` the app refuses to start unless a strong `SECRET_KEY` and
  `ADMIN_PASSWORD` are set. Credential comparison is constant-time
  (`secrets.compare_digest`).
- **CORS from environment:** origins come from `CORS_ORIGINS`; wildcard only when
  explicitly configured (development).
- **Brute-force keyed on IP + username:** prevents an attacker from locking out a
  legitimate user by spamming their username, while still throttling credential
  stuffing from a single source.
- ~~**Global rate limiting**~~ — removed. With 50+ concurrent users behind a shared office IP, per-IP limits were impractical without Redis-backed per-user tracking.
- **JWT revocation + real logout:** tokens carry a `jti`; `POST /auth/logout`
  revokes the token server-side (denylist enforced on HTTP, WebSocket **and** file
  requests), so a stolen-but-unexpired token can't be reused after logout.
- **Security headers:** added `Content-Security-Policy`, `Permissions-Policy`, and
  `Strict-Transport-Security` (HSTS gated behind `ENABLE_HSTS=1`, enable once TLS is
  end-to-end).
- **Generic error responses:** database/exception details are logged server-side
  only; clients get safe, generic messages (no schema/data leakage).
- **Password policy:** staff passwords must meet length + complexity rules and are
  checked against a weak-password denylist.
- **Append-only audit trail:** new `audit_logs` table + `record_audit()` helper,
  wired to login success/failure, logout, and regulated-document access.

> **New env vars** (documented in `backend/.env.example`): `APP_ENV`, `ENABLE_HSTS`,
> `MIN_PASSWORD_LENGTH`, `RATE_LIMIT_PER_MIN`, `RATE_LIMIT_SENSITIVE_PER_MIN`.
> **Still infrastructure-dependent:** Redis-backed limiter/lockout/denylist for
> multi-worker; SIEM shipping; secrets manager; MFA; encrypted object storage.

---

## 1. Authentication — JWT tokens on every API request

**Before:** the entire API was open. Anyone who could reach the backend URL could read, modify, or delete any data without logging in. The login endpoint existed but nothing enforced it.

**Now:**
- On login, the backend issues a signed **JWT access token** (`HS256`, signed with `SECRET_KEY` from `.env`), containing the user's id, name, role, and staff ID.
- **Every business endpoint requires a valid token** (`Authorization: Bearer <token>`). Requests without one get `401 Unauthorized`.
- Tokens **expire after 12 hours** (configurable via `ACCESS_TOKEN_EXPIRE_HOURS`).
- The frontend attaches the token automatically to all API calls, Excel downloads, and file uploads, and **auto-redirects to the login page** whenever the backend answers 401 (expired/invalid session).

Files: `backend/security.py` (new), `backend/routers/auth.py`, `backend/main.py`, `frontend/src/lib/api.ts`, `frontend/src/context/AuthContext.tsx`.

Public endpoints (by design):
| Endpoint | Why public |
|---|---|
| `POST /auth/login` | entry point |
| `GET /` | health check used by the login page's "Connected" badge |

> **Updated 2026-08-03:** `GET /files/...` is **no longer public**. It now requires a
> valid token, accepted as an `Authorization` header or a `?token=` query param (the
> latter so `<img src>` tags — which cannot send headers — can still authenticate).
> File **uploads** (`POST /files/...`) require a valid login and pass magic-byte
> content validation.

## 2. Role-Based Access Control (RBAC)

Roles come from the staff member's *Software Designation* and are embedded in the signed token — a user cannot forge or change their own role.

- **Finance endpoints** (`/finance/*`, `/pl-summary/*`): only **Finance Manager** and **Admin**. Other roles receive `403 Forbidden` with a clear message.
- **Deleting staff accounts**: **Admin only**.
- All other endpoints: any authenticated user.
- `require_roles(...)` in `security.py` makes adding more per-endpoint rules a one-line change.

## 3. Brute-force protection on login

- **5 failed attempts** for a username → that username is **locked out for 15 minutes** (`429 Too Many Requests` with a countdown message).
- Successful login clears the failure counter.

## 4. Secrets moved to `.env`

**Before:** the admin credentials were hardcoded in source (`admin@canaan.com` / `admin`), and there was no signing key.

**Now** (`backend/.env`, template in `backend/.env.example`):
| Variable | Purpose |
|---|---|
| `SECRET_KEY` | JWT signing key — a random 64-hex-char key was generated and added to your `.env` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | built-in admin account credentials |
| `ACCESS_TOKEN_EXPIRE_HOURS` | session length (default 12) |
| `CORS_ORIGINS` | allowed frontend origins |
| `DB_*` | database credentials (already existed) |

> **ACTION REQUIRED:** `ADMIN_PASSWORD` still falls back to `admin` if unset. Uncomment and set a strong value in `backend/.env` before going live.

## 5. CORS restriction

CORS allowed origins now come from `CORS_ORIGINS` in `.env` (comma-separated). Default stays `*` for development; set your real frontend URL in production so browsers refuse cross-site calls to the API.

## 6. Security headers

Every response now carries:
- `X-Content-Type-Options: nosniff` — blocks MIME-sniffing attacks
- `X-Frame-Options: DENY` — blocks clickjacking via iframes
- `Referrer-Policy: no-referrer` — URLs never leak to third parties
- `Cache-Control: no-store` — API responses aren't cached by proxies/browsers

## 7. Already in place (previous hardening, unchanged)

- **Password hashing:** bcrypt via passlib for staff and driver passwords; plain passwords are never stored or returned by any endpoint.
- **SQL injection:** all queries go through SQLAlchemy ORM parameter binding.
- **Concurrency / duplicate protection:** `SELECT FOR UPDATE` row locks, optimistic-lock `version` columns, unique DB constraints with a global IntegrityError → 409 handler.

---

## 8. Realtime updates (WebSocket)

- `GET /ws?token=<jwt>` — connection is **rejected (1008)** without a valid, unexpired JWT.
- Live connections are **closed (4001)** when the token expires mid-session; the client reconnects after re-login.
- **Connection cap** (500) prevents connection-flood exhaustion; excess connections get `1013 Try Again Later`.
- Server broadcasts only a lightweight `{resource, path}` notification on data changes — **no business data travels over the socket**, so a leaked frame reveals nothing sensitive. Clients refetch through the authenticated REST API.
- Broadcasts are **debounced (250ms per resource)** server-side and refreshes debounced (300ms) client-side, so bulk operations cannot trigger client refetch storms.
- Frontend auto-reconnects with exponential backoff (1s→30s) and sends a 30s heartbeat so proxies don't drop idle connections. If the socket is down, pages **fall back to polling automatically** — the app never goes stale.

## Deployment checklist

1. `backend/.env`: set a strong `ADMIN_PASSWORD`, set `CORS_ORIGINS` to the real frontend URL. (`SECRET_KEY` already generated.)
2. Restart the backend. **All users must log in again once** (old sessions have no token).
3. Serve the backend over **HTTPS** in production (tokens travel in headers; TLS protects them in transit). The WebSocket then runs over **WSS** automatically.
4. Assign the correct *Software Designation* to each staff member — it now controls real API permissions, not just menu visibility.
5. **cPanel/GoDaddy specifics:** run uvicorn behind the Apache/LiteSpeed proxy with WebSocket proxying enabled (`.htaccess`: `RewriteCond %{HTTP:Upgrade} websocket [NC]` → proxy `/ws` to the uvicorn port with `ws://`). Run a **single uvicorn worker** (`--workers 1`) — the in-memory connection manager and login-lockout tracker are per-process; multiple workers would fragment broadcasts. One worker comfortably handles hundreds of concurrent ERP users.

## Known limitations / future work

- ~~File **downloads** are unauthenticated~~ → **Fixed 2026-08-03**: downloads now
  require a token (header or `?token=`). The token still travels in the query
  string for `<img>` — mitigated by short expiry + revocation; short-lived HMAC
  signed URLs are the next refinement.
- ~~Login lockout is per-username~~ → **Fixed 2026-08-03**: keyed on IP + username.
  It remains **in-memory** (resets on restart, per-worker) — move to Redis when
  running more than one worker.
- Rate limiting, brute-force counters, and the JWT revocation denylist are all
  **in-memory / single-worker**. Run uvicorn with `--workers 1` (as the deployment
  checklist already requires) or migrate this shared state to Redis before scaling out.
- Tokens are stored in `sessionStorage` (per-tab, cleared when the tab closes — each
  tab is an independent session). An XSS vulnerability could still read them; React
  escapes output by default, but avoid `dangerouslySetInnerHTML` with user data.
- ~~No audit log~~ → **Fixed 2026-08-03**: append-only `audit_logs` table covering
  logins, logout, and regulated-document access. Extending coverage to all
  deletes/privileged actions and shipping to a SIEM/immutable store is future work.
- Secrets are validated fail-closed but still live in a flat `.env`. Move to a
  secrets manager (Vault / AWS / GCP) with rotation for full enterprise posture.
- No MFA yet for Admin/privileged roles.

---

## Security Fixes — Real Scenarios

### 🔴 CRITICAL-1 — Public Document Downloads

**Scenario:** Sunder is logged into the ERP. Without this fix, anyone who figured out the URL pattern (e.g. `/files/staff/5/aadhaar`) could paste it directly into their browser and download any driver's Aadhaar card, licence, or PAN — without logging in at all. No hacking needed, just guessing a URL.

**Fix:** The file server now checks your login token before serving anything. No token = no file. Every sensitive download is also recorded in a log (who accessed what, when).

---

### 🟠 HIGH-1 — Unvalidated File Upload

**Scenario:** A malicious user renames a file `virus.exe` → `photo.jpg` and uploads it as their profile photo. Without this fix, the server trusts the name and stores it. Later, someone opens it and the executable runs.

**Fix:** The server now reads the actual first few bytes of the file (the "magic bytes") to determine what it truly is, regardless of the filename. A `.exe` pretending to be a `.jpg` is rejected immediately.

---

### 🟠 HIGH-2 — Wildcard CORS

**Scenario:** You're logged into the ERP at `erp.canaan.com`. You visit a malicious website in another tab. That site's JavaScript silently sends requests to the ERP API using your login session and reads the response — trip data, staff records, etc. This is called a CSRF/CORS attack.

**Fix:** The API now only accepts requests from the specific frontend URL you configure. Requests from any other website are blocked by the browser.

---

### 🟠 HIGH-3 — Admin Backdoor

**Short version:** If no password was set in `.env`, anyone could log in as admin with `admin`/`admin`.

**Fix:** Default removed, app refuses to start in production without a strong password set, and the comparison is constant-time so the password can't be guessed character-by-character by timing responses.

---

### 🟡 MEDIUM-1 — No Rate Limiting

**Scenario:** A bot hammers the login page — 10,000 password guesses per minute. Or someone bulk-downloads every document file by looping through IDs. Without limits, the server tries to handle all of it and either crashes or leaks data.

**Status: Removed.** Per-IP rate limiting was implemented but removed because Canaan has 50+ concurrent users all sharing a single office public IP address. A shared IP budget would block legitimate staff during busy periods. A proper solution requires per-user (token-based) rate limiting backed by Redis — flagged as future work if needed.

---

### 🟡 MEDIUM-2 — No JWT Revocation

**Scenario:** Thanamani uses the ERP on a shared office computer and forgets to log out. She leaves for the day. Her colleague picks up the session. Even if she logs out from her phone later, the old token sitting in that browser was still valid for 12 hours — anyone with it could keep using the system.

**Fix:** Clicking logout now kills the token on the server. Even if someone copies the token from a browser, it becomes invalid the moment logout is clicked.

---

### 🟡 MEDIUM-3 — Username-Only Lockout

**Scenario:** An attacker knows Sunder's email. They intentionally make 5 wrong login attempts — now Sunder is locked out even though he did nothing wrong. The attacker just needs to repeat this to permanently block Sunder from working.

**Fix:** Lockout is now tied to IP address + username together. The attacker's machine gets locked, but Sunder can still log in from his own computer. The Admin can also manually reset any lockout instantly from the Security Log page (e.g. if someone gets a new computer with a new IP and needs immediate access).

---

### 🟡 MEDIUM-4 — Missing HSTS/CSP

**Scenario (CSP):** An old part of the app accidentally displays unsanitized user input containing `<script>alert('hacked')</script>`. Without CSP, that script runs in every user's browser.

**Scenario (HSTS):** A user types `erp.canaan.com` (HTTP, not HTTPS). Without HSTS, a network attacker can intercept that first request before it redirects to HTTPS and steal the session.

**Fix:** CSP tells the browser "only run scripts from our own domain." HSTS tells the browser "always use HTTPS, never HTTP, even on the first visit."

---

### 🟡 MEDIUM-5 — Verbose DB Errors

**Scenario:** Latha enters something unexpected in a form. The server crashes and returns: `ERROR: column 'trip_id' of relation 'trips' does not exist (PostgreSQL 14.2)`. Now an attacker knows your database type, version, and table/column names — a roadmap for crafting SQL attacks.

**Fix:** The user sees "An error occurred, please try again." The real error is logged privately on the server where only you can see it.

---

### 🟡 MEDIUM-6 — No Audit Trail

**Scenario:** Someone logs into Kumar's account at 2 AM and changes hire amounts on several trips. Next morning nobody knows who did it or when, because there's no record of logins or changes.

**Fix:** Every login, logout, and sensitive document access is now written to an `audit_logs` table with the timestamp, user, IP address, and what was accessed — a tamper-evident paper trail. Viewable by Admin from the Security Log page.

---

### 🔵 LOW-2 — No Password Policy

**Scenario:** When creating a new staff account for Antony, you set his password as `1234`. It gets guessed in seconds.

**Fix (disabled — pending client confirmation):** When re-enabled, passwords must be at least 10 characters, contain uppercase + lowercase + a number + a symbol, and cannot be common passwords like `password123` or `admin@123`. The system rejects weak passwords at creation time.
