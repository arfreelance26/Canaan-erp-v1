# ERP V2 — Session Context

## Project Stack
- **Backend**: FastAPI + SQLAlchemy 2 + Pydantic 2 + MySQL
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **Database**: MySQL
- **Key convention**: All API communication goes through a snake_case ↔ camelCase transformer in `frontend/src/lib/api.ts`

---

## All Features Implemented (cumulative across all sessions)

### 1. Repairs Management Page (`/admin/repairs`)
Admin CRUD page for managing repair types (name + default cost).

**Backend:**
- `backend/models.py` — Added `RepairType` model (`repair_types` table: id, name, default_cost, created_at, updated_at)
- `backend/schemas.py` — Added `RepairTypeCreate`, `RepairTypeUpdate`, `RepairTypeOut`
- `backend/routers/repair_types.py` — New file: GET list, POST create (duplicate check), PUT update, DELETE
- `backend/main.py` — Imports + registers `repair_types` router; seeds 10 defaults on startup if table is empty

**Default seed values:**
```
"Tyre Puncture", "Tyre Replacement", "Engine Oil Change", "Brake Repair",
"Battery Replacement", "Clutch Repair", "Engine Repair", "Gearbox Repair",
"Radiator / Cooling System Repair", "Suspension Repair"
```

**Frontend:**
- `frontend/src/types/repair-type.ts` — `RepairType` type: `{ id, name, defaultCost }`
- `frontend/src/lib/api.ts` — `toRepairType` transformer, `repairTypesApi` (list, create, update, delete)
- `frontend/src/app/admin/repairs/page.tsx` — Full admin page (follows Branch Management pattern)
- `frontend/src/lib/nav-config.ts` — Added `{ label: "Repairs Management", href: "/admin/repairs", icon: Wrench }` to Administration section

---

### 2. Dynamic Repair Chips in TripSheetDialog
- `frontend/src/components/trips/TripSheetDialog.tsx`
- Replaced hardcoded `QUICK_REPAIRS` constant with `repairTypesApi.list()` fetch on mount
- Chips pre-fill repair name + `defaultCost` when clicked

---

### 3. End Km Validation in TripSheetDialog
- Inline red error below "End km" field when `endKm > 0 && startKm > 0 && endKm <= startKm`
- Text: "End Km must be greater than Start Km."

---

### 4. Cost Per Kilometer Stat in FuelHistoryViewDialog
**Backend:**
- `backend/schemas.py` — Added `cost_per_km: Decimal` to `FuelStats`
- `backend/routers/maintenance.py` — `get_fuel_stats`: calculates `cost_per_km = total_cost / total_distance` using only non-baseline logs (`distance > 0`)

**Frontend:**
- `frontend/src/types/fuel-log.ts` — Added `costPerKm: string` to `FuelStats`
- `frontend/src/lib/api.ts` — Added `costPerKm: String(b.cost_per_km ?? "")` to `toFuelStats`
- `frontend/src/components/fleet/FuelHistoryViewDialog.tsx` — Added `IndianRupee` icon import, "Cost Per Kilometer" StatCard

---

### 5. Start Km Odometer Warning (TripSheetDialog ONLY)
- `frontend/src/components/trips/TripSheetDialog.tsx`
- `startKmTooLow = !ro && !!currentTruck && n(form.startKm) > 0 && n(form.startKm) < Number(currentTruck.odometer)`
- Inline warning: "Below current odometer ({N} km). Please Check the Value."
- **Explicitly NOT applied** to `MaintenanceRecordFormDialog`, `ManageTyresDialog`, or `fuel-history` page

---

### 6. Remove "Current Odometer" from FuelHistoryTable
- `frontend/src/components/maintenance/FuelHistoryTable.tsx`
- Removed "Current Odometer" from `columns` array and its `<td>` from the row render

---

### 7. Truck Odometer Auto-Update on Trip Sheet Save
**Backend — `backend/routers/trips.py` (`upsert_trip_sheet`):**
```python
vehicle_id = payload.vehicle_id or trip.vehicle_id
truck = db.query(models.Truck).filter(models.Truck.truck_id == vehicle_id).first() if vehicle_id else None
if truck and payload.end_km:
    end_km_val = int(payload.end_km)
    if end_km_val > int(truck.odometer or 0):
        truck.odometer = end_km_val
        db.commit()
```
- Only advances, never goes backward
- `trucks.odometer` is updated from `end_km` when a trip sheet is saved

---

### 8. "Advance Paid" Auto-Calculation in TripSheetDialog
- `frontend/src/components/trips/TripSheetDialog.tsx`
- On form init: `sheet.driverAdvanceAmount = String((Number(closure?.driverAdvance || 0) + Number(closure?.additionalDriverAdvance || 0)).toFixed(2))`
- Field is **read-only** with note: "Driver Advance + Additional Driver Advance from trip closure."

---

### 9. BookingSheetDialog (View + Edit)
**New file:** `frontend/src/components/trips/BookingSheetDialog.tsx`

The "Booking Sheet" = Trip form (assign page) + Close Trip form combined into one read/edit dialog.

**Props:** `open, trip, closure, driver, truck, customers, readOnly, onClose, onSubmit`

**Part 1 — Trip Information (from TripFormDialog — ALWAYS read-only):**
- Booking Information: Booking Ref No, Booking Date, Trip Category, Movement Category
- Customer Information: Customer name (resolved from `customers` array by `trip.customerId`), Shipper/Consignee
- Cargo Information: Container Spec, Container Number(s) / Cargo Reference (spec-aware), Cargo Classification, Release Order Ref, Cargo Weight
- Route: Origin, Destination
- Shipping: Shipping Line, Vessel Name
- Vehicle & Assignment: Transport Method, Scheduled Date, Assigned Vehicle (reg number), Assigned Driver
- Payment & Advances: Bill To, Payment Type, Customer Cash Advance, Customer Fuel Advance (₹ + Litres)
- Driver Compensation: Comp Type, Payment Method, Driver Advance, Driver Batta Amount
- Transport Cost: Transport Hire Amount, Transport Crossing Amount
- Operational Notes: Internal Remarks, Booking Instructions

**Part 2 — Closure Information (from CloseTripDialog — editable in edit mode):**
- Closure — Billing: Trip Completed Date, Movement Category (closure), Hire Amount, Transport Amount, Billing Amount, Customer Advance Amount, Driver Advance (read-only), Additional Driver Advance, Payment Mode, Bill To (closure)
- Closure — Halt Information: Company Halt Days, Party Halt Days, Halt Remarks, Halt Compensation summary card (auto-calculated from branch rate)

**On save (edit mode):** calls `tripsApi.close(tripId, data)` → `POST /trips/{id}/close` (backend upserts closure)

---

### 10. Reconciliation Page — Booking Sheet Actions
- `frontend/src/app/trips/reconciliation/page.tsx`
- Added `bookingSheetTrip: Trip | null` and `bookingSheetReadOnly: boolean` state
- Added `openBookingSheet(trip, readOnly)` and `handleBookingSheetSubmit` (updates closures Map in-memory)
- Actions column restructured to show two stacked groups:
  - **Booking Sheet:** View (gray) | Edit (purple)
  - **Trip Sheet:** View (gray) | Edit (blue) | ADD (blue, when no sheet yet)
- `BookingSheetDialog` mounted at the bottom with `customers` passed through

---

### 11. Leave Requests Page for Trip Sheet Coordinator
- `frontend/src/components/layout/Sidebar.tsx` — Added `/attendance/leave-requests` to `"Trip Sheet Coordinator"` role's `ROLE_HREFS`
- Trip Sheet Coordinators can now submit and track leave requests from their own sidebar

---

### 12. WebSocket Infrastructure (Full Real-Time)
**New files:**
- `backend/websocket_manager.py` — `ConnectionManager` singleton + `emit()` helper for broadcasting from sync route handlers using `asyncio.run_coroutine_threadsafe`
- `frontend/src/context/WebSocketContext.tsx` — `WebSocketProvider` (single WS connection per session, auto-reconnects after 3s, `subscribe()` method)
- `frontend/src/hooks/useWebSocketEvent.ts` — `useWebSocketEvent(eventType, handler)` hook using `handlerRef` pattern to avoid stale closures

**`backend/main.py` additions:**
- `@app.on_event("startup")` captures the async event loop via `set_event_loop()`
- `GET /ws` WebSocket endpoint — authenticates via `?token=<JWT>` query param, then keeps alive
- `WebSocketProvider` wraps `<AuthProvider>` in `layout.tsx`

**Events emitted per router:**

| Router | Events |
|---|---|
| `trips.py` | `trip_created`, `trip_updated`, `trip_closed`, `sheet_collected`, `sheet_unmarked`, `sheet_alert` |
| `attendance.py` | `leave_request_created`, `leave_request_updated`, `attendance_updated` |
| `trucks.py` | `truck_updated` |
| `drivers.py` | `driver_updated` |
| `customers.py` | `customer_updated` |
| `vendors.py` | `vendor_updated` |
| `maintenance.py` | `maintenance_updated`, `fuel_updated`, `tyre_updated` |
| `finance.py` | `finance_updated` |

**Frontend wiring:** All 30+ pages and 5 dashboard components use `useWebSocketEvent` to reload data on relevant events. Two patterns used:
- **Named load function pattern**: pages with `loadData()` pass it directly → `useWebSocketEvent("event", loadData)`
- **`refreshKey` counter pattern**: anonymous `useEffect` pages → `useState(0)` + `refreshKey` in deps + `setRefreshKey(k => k+1)` in WS handler

---

### 13. Admin Notification Bell
- `frontend/src/components/layout/Topbar.tsx` — Full notification bell implementation
- **Two notification types:**
  1. **Leave Requests** (blue, Admin only): Shows pending leave requests from all roles. Clicking navigates to `/attendance/leave-approvals`.
  2. **Trip Sheet Alerts** (orange, Admin + Fleet Manager): Shows sheet-not-received alerts. Admin → `/trips/sheet-collection`; Fleet Manager → `/trips/current`.
- Badge count: `leaveRequests.length + sheetAlerts.length` (Admin) or `sheetAlerts.length` (Fleet Manager)
- Initial load: `attendanceApi.listLeaveRequests("Pending")` on mount (admin only)
- WS events consumed:
  - `leave_request_created` → adds to pending list (admin only)
  - `leave_request_updated` → removes from pending list (admin only)
  - `sheet_unmarked` → adds SheetAlert (admin + fleet manager)
  - `sheet_alert` → adds SheetAlert (admin + fleet manager)

---

### 14. "Trip Sheet Not Yet Received" Button Alert
- `frontend/src/app/trips/sheet-collection/page.tsx` — "Trip Sheet Not Yet Received" button calls `tripsApi.flagSheetMissing(trip.id)`
- `frontend/src/lib/api.ts` — `flagSheetMissing: (dbId) => POST /trips/{dbId}/flag-sheet-missing`
- `backend/routers/trips.py` — New endpoint `POST /{trip_id}/flag-sheet-missing`:
  - If trip was collected but not reconciled → undoes collection + emits `sheet_unmarked`
  - Always emits `sheet_alert` with `{trip_db_id, trip_id_str, booking_reference_no}`
  - Roles: Trip Sheet Coordinator + Admin
- Topbar `sheet_alert` handler adds notification: "Trip sheet not yet received — Booking ref: {X}. Please follow up immediately."
- **Note:** "Not Found" error on button click = backend server needs restart to load the new endpoint (server is running old compiled `.pyc`)

---

### 15. Trip Sheet Coordinator as Leave Category
**Problem:** TSC staff were mapped to "Staff" category in leave requests. They now have their own category.

**Backend:**
- `backend/models.py` — `LeaveRequest.category` ENUM now includes `"Trip Sheet Coordinator"`
- `backend/schemas.py` — `LeaveCategory` Literal now includes `"Trip Sheet Coordinator"`
- `backend/routers/attendance.py` — `lookup_applicant` returns `"Trip Sheet Coordinator"` category for TSC staff (not `"Staff"`)
- `backend/main.py` — Added migration: `ALTER TABLE leave_requests MODIFY COLUMN category ENUM('Driver','Fleet Manager','Tyre Manager','Staff','Trip Sheet Coordinator') NOT NULL`

**Frontend:**
- `frontend/src/types/leave-request.ts` — `LeaveApplicantCategory` includes `"Trip Sheet Coordinator"`
- `frontend/src/lib/leave-request-data.ts` — `LEAVE_CATEGORIES` array includes `"Trip Sheet Coordinator"`
- `frontend/src/app/attendance/leave-approvals/page.tsx` — `categoryLabels` maps it to `"Sheet Coordinators"`; `pendingCounts` initializer includes the key

---

## Key Architectural Patterns

| Pattern | Description |
|---|---|
| `initKeyRef` | In `TripSheetDialog`, prevents auto-refresh from resetting the form. Key = `${trip.id}::${existingSheet?.tripSheetNo ?? "new"}` |
| `useAutoRefresh` | 5s polling hook used in all pages to refresh data |
| `useWebSocketEvent` | Real-time hook — subscribes to a WS event type, calls handler on receipt. Uses `handlerRef` to avoid stale closures. |
| `refreshKey` pattern | For pages with anonymous `useEffect` load: `useState(0)` + `refreshKey` in deps + `setRefreshKey(k=>k+1)` from WS handler |
| snake_case ↔ camelCase | All API responses transformed in `api.ts` via `toXxx` functions |
| Parallel-change rule | Every user-facing change is applied across: DB model → backend schema/router → frontend types/api/component |
| Admin page pattern | Follows Branch Management: table + inline Dialog, `useAutoRefresh`, `confirmDelete` |
| Truck odometer | `trucks.odometer` = "current odometer". Only updated from `end_km` of trip sheet saves. Never goes backward. |
| Schema migrations | Enum/column changes that `create_all` can't handle go in `_run_schema_migrations()` in `main.py` as idempotent `ALTER TABLE` stmts |

---

## Critical File Map

### Backend
| File | Purpose |
|---|---|
| `backend/models.py` | SQLAlchemy models — `RepairType`, `Truck`, `LeaveRequest` (with TSC category), etc. |
| `backend/schemas.py` | Pydantic schemas — `RepairTypeCreate/Update/Out`, `FuelStats`, `LeaveCategory` (includes TSC) |
| `backend/websocket_manager.py` | WS `ConnectionManager` + `emit()` — thread-safe broadcast via `run_coroutine_threadsafe` |
| `backend/routers/repair_types.py` | CRUD router at `/repair-types` |
| `backend/routers/trips.py` | `upsert_trip_sheet` (odometer update), `flag_sheet_missing` endpoint |
| `backend/routers/maintenance.py` | `get_fuel_stats` — computes `cost_per_km` |
| `backend/routers/attendance.py` | Leave requests CRUD + `lookup_applicant` (returns TSC category) |
| `backend/main.py` | Startup: `create_all`, `_run_schema_migrations()`, seed repair types, WS loop capture, `/ws` endpoint |

### Frontend
| File | Purpose |
|---|---|
| `frontend/src/context/WebSocketContext.tsx` | WS provider — single connection, `subscribe()`, auto-reconnect |
| `frontend/src/hooks/useWebSocketEvent.ts` | `useWebSocketEvent(event, handler)` — handlerRef pattern |
| `frontend/src/types/repair-type.ts` | `RepairType` type |
| `frontend/src/types/fuel-log.ts` | `FuelStats` with `costPerKm` |
| `frontend/src/types/trip.ts` | Full `Trip` type (all fields) |
| `frontend/src/types/trip-closure.ts` | `TripClosureData` type |
| `frontend/src/types/leave-request.ts` | `LeaveApplicantCategory` (includes TSC), `LeaveRequest` type |
| `frontend/src/lib/api.ts` | All API calls — `repairTypesApi`, `tripsApi` (incl. `flagSheetMissing`), `attendanceApi`, etc. |
| `frontend/src/lib/nav-config.ts` | Sidebar nav — "Repairs Management" in Administration |
| `frontend/src/lib/leave-request-data.ts` | `LEAVE_CATEGORIES` array (includes TSC) |
| `frontend/src/app/layout.tsx` | Root layout — `AuthProvider > WebSocketProvider > TripWorkflowProvider > ...` |
| `frontend/src/app/admin/repairs/page.tsx` | Repairs Management admin page |
| `frontend/src/app/trips/reconciliation/page.tsx` | Trip Reconciliation — Booking Sheet + Trip Sheet actions |
| `frontend/src/app/trips/sheet-collection/page.tsx` | Sheet Collection — "Trip Sheet Not Yet Received" button triggers alert |
| `frontend/src/app/attendance/leave-approvals/page.tsx` | Leave Approvals — TSC tab ("Sheet Coordinators") added |
| `frontend/src/components/layout/Topbar.tsx` | Notification bell — leave requests (admin) + sheet alerts (admin+FM) |
| `frontend/src/components/layout/Sidebar.tsx` | TSC role now includes `/attendance/leave-requests` |
| `frontend/src/components/trips/TripSheetDialog.tsx` | Trip Sheet form — repair chips, km validations, advance paid calc |
| `frontend/src/components/trips/BookingSheetDialog.tsx` | Booking Sheet view/edit dialog |
| `frontend/src/components/trips/CloseTripDialog.tsx` | Close Trip form (unchanged) |
| `frontend/src/components/trips/TripFormDialog.tsx` | Assign Trip form (unchanged) |
| `frontend/src/components/fleet/FuelHistoryViewDialog.tsx` | Fuel history stats — includes Cost Per Km card |
| `frontend/src/components/maintenance/FuelHistoryTable.tsx` | Fuel history table — "Current Odometer" column removed |

---

## Trip Lifecycle
```
Assigned → Started → Loaded → On-Transit → Reached → Unloaded → Completed
                                                                     ↓
                                                              Close Trip (CloseTripDialog)
                                                              → status stays "Completed"
                                                              → hasClosure = true
                                                                     ↓
                                                      Reconciliation Page (hasClosure = true)
                                                      → View/Edit Booking Sheet (BookingSheetDialog)
                                                      → Add/View/Edit Trip Sheet (TripSheetDialog)
                                                                     ↓
                                                      Sheet Collection Page
                                                      → Mark as Collected (Trip Sheet Coordinator)
                                                      → Flag as Missing → notifies Admin + Fleet Manager
```

---

## WebSocket Event Reference

| Event | Emitted by | Consumed by |
|---|---|---|
| `trip_created` | trips.py create | dashboard, trips pages |
| `trip_updated` | trips.py update/status | dashboard, trips pages |
| `trip_closed` | trips.py close | dashboard, trips pages, sheet-collection |
| `sheet_collected` | trips.py collect-sheet | sheet-collection, dashboard |
| `sheet_unmarked` | trips.py unmark-sheet + flag-sheet-missing | all pages (data reload) + Topbar (SheetAlert) |
| `sheet_alert` | trips.py flag-sheet-missing | Topbar only (notification, no data reload) |
| `leave_request_created` | attendance.py create | leave pages + Topbar (admin pending list) |
| `leave_request_updated` | attendance.py approve/reject | leave pages + Topbar (removes from pending) |
| `attendance_updated` | attendance.py mark/update | attendance pages |
| `truck_updated` | trucks.py mutations | fleet pages, dashboard |
| `driver_updated` | drivers.py mutations | driver pages |
| `customer_updated` | customers.py mutations | customer pages |
| `vendor_updated` | vendors.py mutations | vendor pages |
| `maintenance_updated` | maintenance.py record mutations | maintenance pages |
| `fuel_updated` | maintenance.py fuel mutations | fuel pages |
| `tyre_updated` | maintenance.py tyre mutations | tyre pages |
| `finance_updated` | finance.py mutations | finance pages |

---

## Key API Functions (tripsApi)
```ts
tripsApi.list(status?)              // GET /trips?status=...
tripsApi.create(trip)               // POST /trips
tripsApi.update(id, trip)           // PUT /trips/{id}
tripsApi.updateStatus(id, s)        // PATCH /trips/{id}/status
tripsApi.cancel(id)                 // PATCH /trips/{id}/status → Cancelled
tripsApi.close(id, data)            // POST /trips/{id}/close  ← upserts closure
tripsApi.getClosure(id)             // GET /trips/{id}/closure
tripsApi.getSheet(id)               // GET /trips/{id}/sheet
tripsApi.upsertSheet(id, data)      // POST /trips/{id}/sheet
tripsApi.collectSheet(dbId)         // POST /trips/{dbId}/collect-sheet
tripsApi.unmarkSheet(dbId)          // POST /trips/{dbId}/unmark-sheet
tripsApi.flagSheetMissing(dbId)     // POST /trips/{dbId}/flag-sheet-missing
```

---

## What's NOT Pending
All requested features have been implemented. No pending tasks.
