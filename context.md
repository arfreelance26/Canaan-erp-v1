# ERP V2 — Session Context

## Project Stack
- **Backend**: FastAPI + SQLAlchemy 2 + Pydantic 2 + MySQL
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **Database**: MySQL
- **Key convention**: All API communication goes through a snake_case ↔ camelCase transformer in `frontend/src/lib/api.ts`

---

## All Features Implemented (this full conversation)

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

## Key Architectural Patterns

| Pattern | Description |
|---|---|
| `initKeyRef` | In `TripSheetDialog`, prevents auto-refresh from resetting the form. Key = `${trip.id}::${existingSheet?.tripSheetNo ?? "new"}` |
| `useAutoRefresh` | 5s polling hook used in all pages to refresh data |
| snake_case ↔ camelCase | All API responses transformed in `api.ts` via `toXxx` functions |
| Parallel-change rule | Every user-facing change is applied across: DB model → backend schema/router → frontend types/api/component |
| Admin page pattern | Follows Branch Management: table + inline Dialog, `useAutoRefresh`, `confirmDelete` |
| Truck odometer | `trucks.odometer` = "current odometer". Only updated from `end_km` of trip sheet saves. Never goes backward. |

---

## Critical File Map

### Backend
| File | Purpose |
|---|---|
| `backend/models.py` | SQLAlchemy models — `RepairType`, `Truck` (with `odometer`), etc. |
| `backend/schemas.py` | Pydantic schemas — `RepairTypeCreate/Update/Out`, `FuelStats` (with `cost_per_km`) |
| `backend/routers/repair_types.py` | CRUD router at `/repair-types` |
| `backend/routers/trips.py` | `upsert_trip_sheet` — updates `truck.odometer` from `end_km` |
| `backend/routers/maintenance.py` | `get_fuel_stats` — computes `cost_per_km` |
| `backend/main.py` | Registers routers; seeds default repair types on startup |

### Frontend
| File | Purpose |
|---|---|
| `frontend/src/types/repair-type.ts` | `RepairType` type |
| `frontend/src/types/fuel-log.ts` | `FuelStats` with `costPerKm` |
| `frontend/src/types/trip.ts` | Full `Trip` type (all fields) |
| `frontend/src/types/trip-closure.ts` | `TripClosureData` type |
| `frontend/src/lib/api.ts` | All API calls — `repairTypesApi`, `tripsApi.close`, `toFuelStats`, etc. |
| `frontend/src/lib/nav-config.ts` | Sidebar nav — "Repairs Management" in Administration |
| `frontend/src/app/admin/repairs/page.tsx` | Repairs Management admin page |
| `frontend/src/app/trips/reconciliation/page.tsx` | Trip Reconciliation — now has both Booking Sheet + Trip Sheet actions |
| `frontend/src/components/trips/TripSheetDialog.tsx` | Trip Sheet form — repair chips, km validations, advance paid calc |
| `frontend/src/components/trips/BookingSheetDialog.tsx` | NEW — full Booking Sheet view/edit dialog |
| `frontend/src/components/trips/CloseTripDialog.tsx` | Close Trip form (unchanged — used from Completed Trips page) |
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
```

---

## Key API Functions (tripsApi)
```ts
tripsApi.list(status?)          // GET /trips?status=...
tripsApi.create(trip)           // POST /trips
tripsApi.update(id, trip)       // PUT /trips/{id}
tripsApi.updateStatus(id, s)    // PATCH /trips/{id}/status
tripsApi.cancel(id)             // PATCH /trips/{id}/status → Cancelled
tripsApi.close(id, data)        // POST /trips/{id}/close  ← upserts closure
tripsApi.getClosure(id)         // GET /trips/{id}/closure
tripsApi.getSheet(id)           // GET /trips/{id}/sheet
tripsApi.upsertSheet(id, data)  // POST /trips/{id}/sheet
```

---

## What's NOT Pending
All requested features have been implemented. No pending tasks.
