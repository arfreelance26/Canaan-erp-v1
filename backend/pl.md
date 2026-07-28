# P&L Summary — Calculations, Formulas & Filter Algorithms

## 1. Data Pipeline

### Trip Sheet → Trip → Customer Join

Each trip sheet in the period is enriched via two sequential batch joins executed after the main sheet query:

```
trip_sheets.trip_id  →  trips.id          (1-to-1 unique FK, NOT NULL)
trips.customer_id    →  customers.id      (FK, nullable)
```

**Pre-loading strategy (avoids N+1):**
1. Collect all distinct `trip_id` values from every `TripSheet` in the period.
2. One `SELECT … WHERE id IN (…)` fetches all related `Trip` rows → stored in `trips_meta: dict[int, Trip]`.
3. Collect all distinct `customer_id` values from those Trip rows.
4. One `SELECT … WHERE id IN (…)` fetches all `Customer` rows → stored in `customers_meta: dict[int, Customer]`.
5. Per-row lookup is O(1) dict access.

**Fields added to each `trip_row`:**

| Field | Source | Notes |
|---|---|---|
| `customer_name` | `customers.name` | Empty string if trip has no customer |
| `trip_category` | `trips.trip_category` | LOCAL / LOCAL CFS / OUTSTATION / SHIFTING / RETURN TRIP |
| `cargo_classification` | `trips.cargo_classification` | IMPORT / EXPORT / EMPTY / CFS LADEN / OPEN LOAD / COASTAL / RETURN TRIP |
| `container_specification` | `trips.container_specification` | 20 FT CONTAINER / 40 FT CONTAINER / 2 X 20 FEET CONTAINERS / OPEN LOAD CARGO |

Note: `TripSheet` has denormalized `trip_type` and `container_type` plain-string columns, but these are NOT used for filtering because they lack Enum constraints and may contain inconsistent values. The canonical Enum columns on `trips` are always preferred.

---

## 2. P&L Calculations

### Trip P&L (per individual trip row)
```
Trip P&L = hire_amount − total_expense
```
- `hire_amount`: amount billed to customer for the trip (`trip_sheets.hire_amount`)
- `total_expense`: sum of all cost columns recorded on the trip sheet

A positive Trip P&L means the trip covered its direct costs; negative means the trip ran at a loss before overhead.

### Gross Trip P&L (per truck, for the period)
```
Gross Trip P&L = Σ hire_amount − Σ total_expense   (all trip sheets for the truck in period)
```

### EMI Share (per truck)
```
EMI Share = Σ  (emi_amount × overlap_days / 30)
           for each EmiRecord where [emi_start_date, emi_end_date] ∩ [start_date, end_date] ≠ ∅
```
- `overlap_days` = number of days in the intersection of the loan's active window and the report period.
- Division by 30 normalises the monthly EMI to a day rate.
- Only EMI records with a non-zero period overlap contribute.

### Monthly Finance Cost (per EMI record)
```
Monthly Finance Cost = emi_amount / tenure_months
```
Stored on the `EmiRecord` row. Represents the amortised per-month financing cost of the loan — the share of each monthly EMI instalment that is attributable to a single month of the tenure. Distinct from `emi_amount` (the full cash outflow per month, which includes principal repayment).

### Daily Finance Cost (per EMI record)
```
Daily Finance Cost = Monthly Finance Cost / 26
```
Stored on the `EmiRecord` row. Divides the monthly finance cost by 26 working days to give a per-day financing burden. Used for trip-level cost attribution when needed.

### Period Finance Cost (per EMI record, derived at query time)
```
Period Finance Cost = Monthly Finance Cost × (overlap_days / 30)
```
Computed in `pl_summary.py` alongside `EMI Share`, using the same `_emi_share` helper function but applied to `monthly_finance_cost` instead of `emi_amount`. Represents the amortised financing cost attributable specifically to the report period.

All three finance cost fields are returned inside each `emi_details` entry in the API response and displayed per loan in the Truck Detail panel.

### Maintenance Expenses (per truck)
```
Maintenance Expenses = Σ cost
                       for all MaintenanceRecord rows where date ∈ [start_date, end_date]
```
Uses actual recorded costs in the period — no averaging or amortisation.

### Document Amortisation (informational only — excluded from primary Net P&L)
```
Doc Share = Σ doc_amount × (overlap_days / validity_days)
            for each compliance document (FC, Insurance, Road Tax, Permits, PUC)
```
Each document's expense is spread linearly over its validity window. The overlap of that window with the report period determines the amortised share. Available in `document_breakdown` per document type.

### Net Truck P&L (primary metric shown in UI)
```
Net Truck P&L = Gross Trip P&L − EMI Share − Maintenance Expenses
```
Document amortisation is intentionally excluded from this calculation (available separately for reference). This gives a cash-reality view: actual trips earned, actual loan payments made, actual repairs done — no accounting estimates.

---

## 3. Filter System

All filtering is performed **client-side** in the browser after the full period dataset is fetched. The backend returns all enriched trip rows; the frontend applies filters interactively.

### 3.1 Basic Filters (Multi-Select Pills)

Five independently selectable filter dimensions:

| Dimension | Field | Type |
|---|---|---|
| Cargo | `cargoClassification` | Enum: IMPORT, EXPORT, EMPTY, CFS LADEN, OPEN LOAD, COASTAL, RETURN TRIP |
| Trip Type | `tripCategory` | Enum: LOCAL, LOCAL CFS, OUTSTATION, SHIFTING, RETURN TRIP |
| Container | `containerSpecification` | Enum: 20 FT CONTAINER, 40 FT CONTAINER, 2 X 20 FEET CONTAINERS, OPEN LOAD CARGO |
| Customer | `customerName` | Free text from customers table |
| Truck | `truckId` | Vehicle ID string (e.g. CGI-T001) |

**Logic within a dimension:** OR (selecting "Import" and "Export" shows trips of either type).

**Logic across dimensions:** AND (Cargo="Import" AND Customer="XYZ" shows only XYZ's Import trips).

**Empty selection = no filter on that dimension** (show all values). Pills for a dimension are only rendered if ≥ 2 distinct values exist in the period.

### 3.2 Advanced Filters (Profitability-Based Toggles)

Each toggle is a boolean — active means only trips satisfying that profitability condition are shown. Multiple active toggles are ANDed.

---

**Profitable Trips**
```
Show trip t if:  t.hireAmount − t.totalExpense > 0
```
Identifies trips that were profitable at the individual trip level (hire covered direct expenses).

---

**Profitable Customers**
```
For each unique customerName c:
  customerPL(c) = Σ (hireAmount − totalExpense)  for all trips with customerName = c in period

Profitable customers = { c : customerPL(c) > 0 }

Show trip t if:  t.customerName ∈ profitable_customers
```
Groups every trip in the period by customer, sums their P&L, and identifies which customers are net profitable. Only trips from those profitable customers are shown.

---

**Profitable Trip Type**
```
For each unique tripCategory k:
  categoryPL(k) = Σ (hireAmount − totalExpense)  for all trips with tripCategory = k in period

Profitable categories = { k : categoryPL(k) > 0 }

Show trip t if:  t.tripCategory ∈ profitable_categories
```

---

**Profitable Cargo**
```
For each unique cargoClassification g:
  cargoPL(g) = Σ (hireAmount − totalExpense)  for all trips with cargoClassification = g in period

Profitable cargos = { g : cargoPL(g) > 0 }

Show trip t if:  t.cargoClassification ∈ profitable_cargos
```

---

**Profitable Container**
```
For each unique containerSpecification s:
  containerPL(s) = Σ (hireAmount − totalExpense)  for all trips with containerSpecification = s in period

Profitable containers = { s : containerPL(s) > 0 }

Show trip t if:  t.containerSpecification ∈ profitable_containers
```

---

### 3.3 Filter Composition

All filters are applied sequentially in the following order:

1. **Text search** — matches truck ID, registration, sheet no, booking ref, from/to location, customer name (case-insensitive substring).
2. **Basic filters** — each active dimension further narrows the set.
3. **Advanced filters** — each active toggle further narrows the set.

**Critical design decision:** The profitable-group sets (for Customers, Trip Type, Cargo, Container) are **always computed from the full trip dataset for the period**, not from the already-filtered subset. This ensures consistent groupings — e.g., enabling "Profitable Customers" shows all trips from profitable customers regardless of which basic filters are also active.

### 3.4 Active Filter Count

```
Total active filters = |selected_cargo| + |selected_category| + |selected_container|
                     + |selected_customer| + |selected_truck|
                     + count(active advanced toggles)
```

Displayed as a badge on the filter panel header. A "Clear all" button appears when any filter is active, resetting all basic and advanced filter state simultaneously.

---

## 4. Truck Profitability Filter System

All filtering is performed **client-side** on the `EnrichedTruck[]` array. The backend returns all trucks with their enriched `trip_rows`; no additional backend requests are needed.

### 4.1 Basic Filters (Multi-Select Pills)

Three dimensions — each supports multi-select (OR within, AND across):

| Dimension | Source | Values |
|---|---|---|
| Cargo | Aggregate of `tripRows[].cargoClassification` per truck | IMPORT, EXPORT, EMPTY, CFS LADEN, OPEN LOAD, COASTAL, RETURN TRIP |
| Trip Type | Aggregate of `tripRows[].tripCategory` per truck | LOCAL, LOCAL CFS, OUTSTATION, SHIFTING, RETURN TRIP |
| EMI Status | `emiShare > 0 ? "With EMI" : "No EMI"` | "With EMI", "No EMI" |

**Cargo / Trip Type match logic — truck-level OR:**
A truck passes a Cargo or Trip Type filter if **at least one** of its trip rows matches any selected value.
```
truck passes Cargo filter if:
  ∃ t ∈ truck.tripRows :  t.cargoClassification ∈ selected_cargo
```
This correctly handles trucks that carry mixed cargo types across their trips.

**EMI Status logic:**
```
truck passes EMI filter if:
  selected_emi contains (truck.emiShare > 0 ? "With EMI" : "No EMI")
```

**Option visibility:** A pill row is rendered only when at least one unique value exists in the period (≥ 1 distinct value). The EMI pill only shows "With EMI" if any truck has `emiShare > 0`, and "No EMI" if any truck has `emiShare = 0`.

### 4.2 Advanced Filters (Profitability-Based Toggles)

Five boolean toggles — each active toggle further narrows the truck list (AND logic):

---

**Net Profitable**
```
Show truck t if:  t.netTruckPl > 0
  where  netTruckPl = totalHireAmount − tripExpenses − emiShare − maintenanceExpenses
```
Identifies trucks that are net profitable after all overhead deductions.

---

**Trip Profitable**
```
Show truck t if:  t.tripPl > 0
  where  tripPl = totalHireAmount − tripExpenses
```
Identifies trucks whose direct trip operations are profitable, before EMI and maintenance overhead. Useful for separating operational efficiency from financing burden.

---

**EMI Active**
```
Show truck t if:  t.emiShare > 0
```
Narrows to trucks that have active loan obligations in the period. Pair with Net Profitable to see which EMI-burdened trucks are still profitable.

---

**Has Maintenance**
```
Show truck t if:  t.maintenanceExpenses > 0
```
Narrows to trucks with at least one maintenance record in the period. Useful for isolating repair-heavy trucks and understanding their P&L impact.

---

**Active Trucks**
```
Show truck t if:  t.tripCount > 0
```
Excludes trucks with no trip sheets in the period (idle fleet). Useful for fleet utilisation analysis — removing idle trucks gives a cleaner view of actively operating vehicles.

### 4.3 Filter Composition

Applied sequentially:
1. **Text search** — matches truck ID or registration number (case-insensitive substring).
2. **Basic filters** — each active dimension further narrows the set.
3. **Advanced filters** — each active toggle further narrows the set.

### 4.4 Active Filter Count

```
Total active truck filters = |selected_cargo| + |selected_category| + |selected_emi|
                           + count(active advanced toggles)
```

The fleet footer row always reflects the **filtered** set, so totals (hire, expenses, EMI, maintenance, net P&L) update live as filters change.
