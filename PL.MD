# P&L (Profit & Loss) Code Audit Report

**Audit Date:** 2026-08-08  
**Branch:** `seed-and-db-config`  
**Scope:** All uncommitted changes relating to profit/loss calculation, reporting, and the running cost calculator

---

## 1. Summary of P&L Changes

| Area | Change Type | File(s) |
|---|---|---|
| P&L Per Trip page | Bug fix (promise chain) | `frontend/src/app/trips/pnl-mileage/page.tsx` |
| P&L Summary (Insights) | **New page** | `frontend/src/app/insights/pl-summary/page.tsx` |
| P&L Summary backend | **New router** | `backend/routers/pl_summary.py` |
| Running Cost Calculator | **New page** | `frontend/src/app/insights/running-cost-calculator/page.tsx` |
| Running Cost backend | **New router** | `backend/routers/running_cost.py` |
| Running Cost DB models | **5 new tables** | `backend/models.py` |
| Running Cost schemas | **New Pydantic models** | `backend/schemas.py` |
| Operating Cost Calculator | **Deleted** | `backend/routers/operating_costs.py`, `frontend/src/app/insights/operating-cost-calculator/page.tsx` |
| TyreBaseRate model | **Deleted** | `backend/models.py`, `backend/schemas.py` |
| Dashboard | Removed maintenance alerts | `backend/routers/dashboard.py` |
| Exports | Added maintenance-types export; removed `condition` from tyre export | `backend/routers/exports.py` |
| Customer Analytics | New page (trip-summary dir) | `frontend/src/app/insights/trip-summary/page.tsx` |
| DB migrations | ALTER TABLE for running cost mode columns | `backend/main.py` |

---

## 2. P&L Formulas Implemented

### 2.1 Trip-Level Gross P&L (`trips/pnl-mileage` page)

Simple gross margin view from trip sheets:

```
Trip P&L = Hire Amount − Total Expense
```

- Source data: `TripSheetData` (`hireAmount`, `totalExpense`, `totalKm`)
- Only trips with `hasSheet = true` are included
- No EMI or maintenance deductions — this is gross trip P&L only
- Sorted: descending by date, then descending by P&L within same date

**Summary cards shown:**
- Total trips count (with sheets)
- Total Hire Revenue
- Net P&L (sum across all filtered trips)

---

### 2.2 Full P&L Summary (`insights/pl-summary` page + `/pl-summary` backend)

Two-tab report (Trip Profitability + Truck Profitability) over a user-selected date range.

#### Trip P&L (both tabs share the same source data)

```
Gross Trip P&L = Hire Amount − Trip Expenses
```

#### Truck Net P&L (Truck tab detail panel)

```
Net Truck P&L = Gross Trip P&L − EMI Share − Maintenance Expenses
```

The frontend note at the bottom of the Truck tab reads:
> *Net Truck P&L = Gross Trip P&L (Hire − Trip Expenses) − EMI Share for Period − Maintenance Expenses in Period.*

#### Backend full cost model (`backend/routers/pl_summary.py`)

The backend computes a more complete cost model that **includes document amortisation** (not surfaced in the frontend Truck detail panel UI):

```
Revenue        = Σ hire_amount  (trip_sheets where trip_sheet_date ∈ [start, end])
Trip Expenses  = Σ total_expense (same sheets)
Maintenance    = Σ maintenance cost records where date ∈ [start, end]

EMI Share      = Σ (emi_amount × overlap_days / 30)
                 for each active EMI record overlapping [start, end]

Document Share = Σ amortised share of each compliance document cost
                 Documents: RC, FC, Road Tax, Insurance, National Permit,
                             Local Permit, Pollution Certificate
                 Formula: cost × (overlap_days / validity_days)

Total Cost     = Trip Expenses + Maintenance + EMI Share + Document Share
Net P&L        = Revenue − Total Cost
```

The backend returns all fields including `document_share` and `document_breakdown`, but the frontend Truck detail panel only deducts EMI and Maintenance from the displayed Net P&L — document amortisation is computed but not shown in the UI.

#### EMI Period Pro-rating

```
EMI Share for Period = EMI Monthly Amount × (overlap_days / 30)

Where overlap_days = min(end_date, emi_end_date) − max(start_date, emi_start_date) + 1
```

#### Document Cost Amortisation

```
Document Share = document_cost × (overlap_days / validity_days)

Where:
  validity_days = expiry_date − issue_date (days)
  overlap_days  = overlap of [start,end] with [issue_date, expiry_date]
```

Document validity assumptions:
| Document | Validity window |
|---|---|
| Road Tax | road_tax_date to road_tax_date + 1 year |
| Insurance | insurance_expiry_date − 1 year to insurance_expiry_date |
| National Permit | national_permit_date to national_permit_date + 1 year |
| Local Permit | local_permit_date to local_permit_date + 1 year |
| Pollution Cert | pollution_certificate_date to + 6 months |
| RC / FC | issue date to expiry date (as stored) |

---

### 2.3 Running Cost Per Km (`insights/running-cost-calculator` page)

```
Total Running Cost / km =
    EMI / km
  + Mileage Cost / km
  + AdBlue Charges / km
  + Tyre Charges / km
  + Maintenance / km
```

**Component formulas:**

| Component | Formula | Inputs |
|---|---|---|
| EMI / km | `(EMI Amount ÷ 26) ÷ Km per Day` | EMI Amount (manual), Km/Day (from Run Details) |
| Mileage Cost / km | `Cost per Litre ÷ Mileage (L/km)` | Fuel price (manual), Mileage (manual) |
| AdBlue Charges / km | `AdBlue (L/km) × AdBlue Price per Litre` | Consumption (manual), Manufacturer price (manual) — or direct override |
| Tyre Charges / km | `(Tyre Cost ÷ Expected Range) × Tyre Count` | Tyre cost/range from Tyre Details; count parsed from layout string (e.g. "10+1" = 11) |
| Maintenance / km | Direct manual entry | — |

**Km per Day** is derived from:
```
Km / Day = Km / Month ÷ 26    (assuming 26 working days)
```
or entered directly (back-calculates Km/Month = Km/Day × 26).

**AdBlue override behaviour:** If the user types a direct `AdBlue Charges (Per/KM)` override, the L/km and manufacturer input columns are hidden. Clearing the override restores them.

---

## 3. New Database Tables (Running Cost)

Five tables added to support the multi-mode running cost calculator:

| Table | Purpose | Key columns |
|---|---|---|
| `running_cost_config` | One row per mode — fuel cost | `mode`, `cost_per_litre` |
| `running_cost_tyre_entries` | Per mode, per tyre type — cost & range | `mode`, `tyre_type`, `cost_per_tyre`, `expected_range_km` |
| `running_cost_layout_entries` | Per mode, per tyre layout — km targets | `mode`, `tyre_layout`, `km_per_month`, `km_per_day` |
| `running_cost_adblue_entries` | Per mode, per AdBlue manufacturer | `mode`, `manufacturer_id`, `price_per_litre` |
| `running_cost_truck_metrics` | Per mode, per truck — all per-truck inputs | `mode`, `truck_id`, `emi_amount`, `mileage`, `adblue_consume_l_per_km`, `adblue_manufacturer_id`, `adblue_per_km`, `tyre_type`, `maintenance_per_km` |

**Modes supported:** `Manual`, `Basic`, `Advanced`  
(Advanced mode UI is a placeholder — "coming soon" state in the info modal)

**DB migrations** (run at startup in `backend/main.py`): Added `mode` column + unique index `(mode, <dimension>)` to all running cost tables, replacing single-column unique indexes.

---

## 4. Deleted Components

### 4.1 Operating Cost Calculator (replaced)

The old `backend/routers/operating_costs.py` had:
- `GET /operating-costs/tyre-rates` — 4 fixed tyre types (Radial, Tubeless, Nylon, Retread)
- `PUT /operating-costs/tyre-rates/{tyre_type}` — admin configures base price and expected range
- `TyreBaseRate` model with a global (non-mode-specific) rate per tyre type

This entire approach was removed and replaced by the `RunningCostTyreEntry` model which is per-mode and reads tyre types from the dynamic `TyreRangeConfig` table rather than a fixed enum.

The frontend `operating-cost-calculator` page was also deleted.

### 4.2 Dashboard Maintenance Alerts (removed)

The `backend/routers/dashboard.py` previously computed `maintenance_alerts` by comparing current odometer against a hardcoded `MAINTENANCE_SCHEDULE` (10k/20k/40k/80k km intervals). This was removed:
- `MAINTENANCE_SCHEDULE` constant deleted
- `UPCOMING_WINDOW_KM = 1000` constant deleted
- `maintenance_alerts` key removed from `/dashboard/overview` response

The frontend dashboard stat card that consumed `maintenance_alerts` must also be updated (not in scope of this audit's file set, but the backend field no longer exists).

---

## 5. Issues & Findings

### 5.1 CONFIRMED — Frontend/Backend Net P&L Mismatch

**File:** `frontend/src/app/insights/pl-summary/page.tsx` — `TruckDetailPanel` component  
**Lines:** 488, 720–721, 1007

The `TruckDetailPanel` shows and calculates:
```tsx
netTruckPl = totalHireAmount - tripExpenses - emiShare - maintenanceExpenses
```
The frontend footnote (line 1007) confirms this:
> *Net Truck P&L = Gross Trip P&L (Hire − Trip Expenses) − EMI Share for Period − Maintenance Expenses in Period.*

However the backend computes and returns:
```python
net_pl = hire_total - (trip_expense_total + maintenance_total + emi_total + total_doc_share)
```

The backend `net_pl` field is returned in the API response but the frontend uses `totalHireAmount - tripExpenses - emiShare - maintenanceExpenses` (re-derived client-side). This means **document amortisation is silently excluded from the frontend Net P&L display**, even though the backend computes and returns it.

**Impact:** For trucks with RC, FC, road tax, insurance, or permit costs, the displayed Net P&L will be higher (more optimistic) than the true figure by the amount of document amortisation.

**Fix:** Either use `entry.net_pl` (or `entry.netPl`) from the API directly instead of re-deriving, or explicitly add `documentShare` to the deduction block in the UI.

---

### 5.2 CONFIRMED — EMI Pro-rating Uses Fixed 30-Day Month

**File:** `backend/routers/pl_summary.py` — `_emi_share()`, line 96

```python
return round(amt * overlap_days / 30, 2)
```

A fixed 30-day divisor means:
- For a full month of January (31 days), EMI share = EMI × 31/30 = 3.3% over
- For a full month of February (28 days), EMI share = EMI × 28/30 = 6.7% under

**Impact:** Slight over/under-counting of EMI per period. For cross-month date ranges the error self-corrects somewhat, but for single-month reports it can be materially wrong (up to ~6.7%).

**Fix options:**
1. Use actual calendar days in the month: `calendar.monthrange(year, month)[1]`
2. Use the standard 26-working-day assumption already used elsewhere in the app (matching the EMI/Day formula in the Running Cost Calculator)

---

### 5.3 CONFIRMED — Closures Loaded But Unused in P&L Calculation

**File:** `frontend/src/app/trips/pnl-mileage/page.tsx` — `useEffect`, lines 56–68

The page loads `TripClosureData` for all trips with `hasClosure = true` and stores them in a `closures` Map. The closures are only passed to `TripSheetDialog` for the read-only popup (line 313). They contribute **nothing** to the P&L calculation or display — `pnl = hire - expense` uses only `TripSheetData`.

If closure data is meant to represent the final/reconciled amounts (overriding sheet values), this is a logic gap.

**Impact:** If a trip has been closed/reconciled with different amounts than the original sheet, the P&L page still shows the original sheet figures. The closure amounts are fetched (network cost) but never applied.

**Fix:** Decide whether closure amounts should override sheet amounts for P&L. If yes, apply them in the `useMemo` rows computation.

---

### 5.4 CONFIRMED — `trip-summary` Page Name Does Not Match Content

**File:** `frontend/src/app/insights/trip-summary/page.tsx`

The page at this path is named `CustomerProfitabilityAnalyticsPage` and displays **customer-wise route cards** (origin → destination per customer). It has no trip P&L data. The directory name `trip-summary` is misleading — based on the component's title ("Customer Profitability Analytics") it belongs under a `customer-analytics` or `customer-routes` path.

**Impact:** Navigation confusion; future developers looking for a trip summary will land on a customer route page.

---

### 5.5 PLAUSIBLE — AdBlue Override Clear Does Not Restore State

**File:** `frontend/src/app/insights/running-cost-calculator/page.tsx` — `adbluePerKm` input `onChange`, lines 296–298

```tsx
if (!v) {
  onMetricChange("adblueConsumeLKm", metrics["adblueConsumeLKm"] ?? "");
}
```

When the user clears the `adbluePerKm` override, the handler re-sets `adblueConsumeLKm` to its own current value — which is a no-op. The columns become visible again (because `hasAdblueOverride` becomes false), but if the user had previously typed values in them *before* typing the override, those values are still in state and will display correctly. The restore is only a no-op; it does not corrupt data.

**Impact:** Low — the visual restore works correctly; only the redundant setter call is wasted.

---

### 5.6 PLAUSIBLE — `pl_summary` Backend N+1 Risk on Large Trip Sets

**File:** `backend/routers/pl_summary.py`, lines 163–180

The backend pre-loads trip metadata with a batch query (`Trip.id.in_(list(all_trip_ids))`). However, `all_trip_ids` is built by iterating all sheets in the period. If the fleet is large and the period is long, `all_trip_ids` could be a very large list, leading to an oversized `IN` clause.

**Impact:** Potential slowdown or database error on large datasets. For typical fleet sizes (< 50 trucks, < 1000 trips/month) this is unlikely to cause issues.

---

## 6. API Endpoints Added / Removed

### Added

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/pl-summary` | Finance | Per-truck P&L breakdown for date range |
| `GET` | `/running-cost/state` | Auth | Fetch all three modes' saved calculator data |
| `PUT` | `/running-cost/state` | Auth | Save all three modes' calculator data |
| `GET` | `/exports/maintenance-types` | Auth | Excel export of maintenance types |

### Removed

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/operating-costs/tyre-rates` | List base tyre rates (4 fixed types) |
| `PUT` | `/operating-costs/tyre-rates/{tyre_type}` | Update base tyre rate |

### Modified

| Method | Path | Change |
|---|---|---|
| `GET` | `/dashboard/overview` | Removed `maintenance_alerts` field from response |
| `GET` | `/exports/tyre-inventory` | Removed `condition` column from Excel output |

---

## 7. Running Cost Calculator State Persistence

The calculator uses a **dual-write strategy**:

1. **localStorage** — written immediately on every change (`persistState()`)
2. **Backend** (`PUT /running-cost/state`) — debounced 1500ms after last change

On load, backend state takes priority over localStorage. If the backend call fails, localStorage is used as fallback. All three modes are loaded and saved atomically in a single GET/PUT.

**Migration path:** The localStorage migration code (lines 33–40 in the page) handles upgrading from the old flat format (pre-mode) to the new `{Manual, Basic, Advanced}` keyed format.

---

## 8. Filtering Capabilities

### P&L Summary — Trip Tab

| Filter Type | Dimensions |
|---|---|
| Basic (OR within, AND across) | Cargo, Trip Type, Container, Customer, Truck |
| Advanced (all AND) | Profitable Trips only, Profitable Customers only, Profitable Trip Types only, Profitable Cargo only, Profitable Container types only |
| Text search | Truck ID, Registration, Sheet No, Booking Ref, Route, Customer |
| Sort | Date, Hire, Expense, Trip P&L (asc/desc) |

### P&L Summary — Truck Tab

| Filter Type | Dimensions |
|---|---|
| Basic (OR within, AND across) | Cargo (from trip rows), Trip Type (from trip rows), EMI Status (With EMI / No EMI) |
| Advanced (all AND) | Net Profitable, Trip Profitable, EMI Active, Has Maintenance, Active (≥1 trip) |
| Text search | Truck ID, Registration Number |

### P&L Per Trip (pnl-mileage)

| Filter | Type |
|---|---|
| Date From / To | Scheduled date range |
| Text search | Trip ID, Vehicle ID, Origin, Destination |

---

## 9. Affected Frontend Pages & Routes

| Route | Status | P&L Relevance |
|---|---|---|
| `/trips/pnl-mileage` | Modified | Core gross trip P&L view |
| `/insights/pl-summary` | **New** | Full profitability report (trip + truck tabs) |
| `/insights/running-cost-calculator` | **New** | Per-km cost breakdown calculator |
| `/insights/trip-summary` | **New** | Customer route analytics (misnamed) |
| `/insights/fleet-summary` | **New** | (contents not in P&L scope) |
| `/insights/operating-cost-calculator` | **Deleted** | Replaced by running-cost-calculator |

---

## 10. Recommendations

1. **[Critical] Fix document amortisation display** — Either use `entry.net_pl` from the API or add a "Document Costs" row to the `TruckDetailPanel` overhead deductions block, so the displayed Net P&L matches the backend's computed figure.

2. **[High] Fix EMI pro-rating divisor** — Use actual days in the relevant month(s) rather than the fixed 30-day constant. This affects the accuracy of per-period P&L reports.

3. **[Medium] Decide closure vs. sheet P&L** — Define whether the `pnl-mileage` page should use closure amounts (final reconciled figures) when available, or always use sheet amounts. Currently closures are fetched but ignored for P&L.

4. **[Low] Rename `trip-summary` directory** — Rename to `customer-analytics` or `customer-routes` to reflect the actual page content and avoid confusion with the P&L trip tab.

5. **[Low] Remove redundant closure load** — If closures are confirmed to not affect P&L calculation on the `pnl-mileage` page, remove the closure pre-fetching loop (lines 56–68) to eliminate unnecessary network requests.

6. **[Low] Add Advanced Mode** — The Running Cost Calculator's Advanced mode shows a "coming soon" placeholder. The `CalcInfoModal` already detects the mode and shows an appropriate message, so the UI handles it gracefully.
