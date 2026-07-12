@AGENTS.md

# Canaan ERP — Client Requirements & Implementation Guide

This file tracks all client-requested features from the WhatsApp brief (canaan.md). Use it as the source of truth when implementing features.

---

## Role Reference

| Role in System | Real Person |
|---|---|
| Commercial Manager | Kumar |
| Assistant Commercial Manager | Shibu |
| Yard Supervisor | Antony |
| Trip Sheet Register (Docs 1 & 2) | Latha, Siva |
| Maintenance | Jebarson |
| Accounts | Sunder, Thanamani |

---

## Feature Requirements

### 1. Trip Assignment Form (Kumar — Commercial Manager)

**Container Number Validation**
- Must be exactly 4 alpha characters + 7 numerical characters (e.g. `ABCD1234567`)
- Reject anything shorter, longer, or in wrong format
- Apply to all 3 container fields (containerNumber, containerNumber1, containerNumber2)

**"Self" Customer Logic** (when customer/billing party is "Self" / CGI)
- Billing to customer: NOT applicable (hide/freeze billing section)
- Payment terms: force "Credit" only (non-editable)
- Invoice type: force "Transport Memo" (no GST)
- Cash advance, Fuel advance, Fuel cash advance: freeze/hide (not needed)
- CHA name: auto-fill "CGI" and lock it (non-editable)
- Currently: billing message exists for SHIFTING trips but not for "Self" customer generically

**Trip Date vs Booking Date**
- If booking/assigned date = today → trip (scheduled) date must default to tomorrow
- Field remains changeable by user but default must be tomorrow when booking same day

**Hire Amount Editability**
- Hire amount must NOT be editable except when trip type is "Return" or "Open"
- All other trip types: lock the hire amount field after initial entry

**Approximate KM Field**
- Add a new field for Kumar to enter approximate KM when assigning a trip
- This becomes the baseline for the ±10% KM validation in the trip sheet
- Store as `approx_km` on the Trip model

**Lift-On Amount Rules**
- Auto-display lift-on amount for standard trip types (pull from rate table)
- For Shifting, Empty, Open: allow manual entry
- For Coastal trips: lift-on must always be zero (lock at 0)
- If lift-on is edited: open a mandatory remarks box (entered by Docs staff, not Kumar)

**From/To Locations**
- Replace watermark/placeholder text with proper dropdowns
- Use predefined location list, not free-text input

---

### 2. Yard Supervisor Screen — Sheet Collection (Antony)

**Column Order** (currently wrong — must be):
`Vehicle No. → Driver → Container No. → From → To`

**Advance Paid to Driver Verification**
- Show advance amount paid to driver on each trip row
- Checkbox: ✓ = correct, ✗ = incorrect
- If incorrect: open remarks box + field to enter correct amount
- This data must be saved and visible to Admin

**Received Trip Sheet Date**
- Show "TS (Trip sheet) Received" date (non-editable) prominently in front
- Auto date pickup for "TS Delivered" date (non-editable)

**Download & Print by Date**
- Add date-range filter to the existing PDF export
- User can select date range → download TS received / TS delivered report for that period

**Popup Alert**
- If a trip sheet received by Docs 1 & 2 is NOT entered within 1 day → show popup in Antony's screen

**Remove**
- Front side small box (whatever the current small indicator box is — remove it)

**Sticky Headers + Pagination**
- Table headers must be frozen/sticky (do not scroll away)
- 10 trips per page with page navigation

---

### 3. Trip Sheet Register Screen — Reconciliation (Latha, Siva — Docs 1 & 2)

**Column Order** (must be):
`Vehicle No. → Driver → Container No. → From → To`

**Received Trip Sheet in Front**
- "Received trip sheet" status/date must be the most prominent field shown

**Flagged for Re-checking**
- Add a "Flag for Re-checking" button/toggle on each trip
- Flagged trips show a visual indicator and can be filtered
- Allows Docs staff to keep a trip pending if something needs verification before confirming

**Trip Sheet Entered Date**
- Auto-set to today's date when trip sheet is first opened for entry
- Must be non-editable after that (cannot backdate)

**Diesel Entry in Trip Sheet**
- Add diesel quantity (litres), diesel rate (₹/litre), diesel total fields inside trip sheet — placed after the KM section
- This data must auto-replicate to the Fuel Log (vehicle-wise, KM, date, litres, rate, total)
- If diesel entered is ±5% of the approximate expected value → show popup requiring a remarks box entry before saving
- If KM between locations is ±10% of the `approx_km` set by Kumar → show popup requiring a remarks box entry before saving

**Edit/Correction Flow**
- Any correction to be sent to Kumar (Commercial Manager) with a reason box
- Admin must approve before the change is made
- (This is the existing EditApprovalRequest system — ensure it covers Trip Sheet edits)

**Sticky Headers + Pagination**
- Same as Yard Supervisor: sticky headers, 10 per page

---

### 4. Assistant Commercial Manager — Shibu

- Must be able to view and calculate P&L per trip
- Must be able to view and calculate Mileage per trip
- Must be able to update Truck master data
- Has same access as Commercial Manager (already implemented)

---

### 5. Dashboard — All Users

**Clickable Stat Cards**
- Clicking a number on any stat card (e.g. "12 Active Trips") must open the filtered trip list showing those trips
- Applies to Admin dashboard stat cards and Commercial Manager dashboard

**Active Bookings Visible to All**
- Once Kumar assigns a booking, it must be visible in ALL users' dashboards with current trip status
- Must remain visible until invoicing is complete

---

### 6. Global UI Changes

**Pagination — 10 per page**
- ALL trip list screens must show 10 trips per page with page navigation controls
- Affects: /trips/assign, /trips/current, /trips/completed, /trips/history, /trips/sheet-collection, /trips/reconciliation, /trips/verification, /trips/finalization

**Sticky/Frozen Headers**
- All table headers across all screens must be sticky (freeze on scroll)
- Only the data rows should scroll; headers stay at the top

**LR (Lorry Receipt / Consignment Note) Generation**
- Based on trip number, generate an LR document
- Not yet implemented anywhere — needs new backend endpoint + PDF template + frontend button

---

## Implementation Status

| Feature | Status |
|---|---|
| Transport Memo invoice (no GST) | ✅ Implemented |
| Shifting trip billing restriction | ✅ Implemented |
| Role renames (Fleet Mgr → Commercial Mgr etc.) | ✅ Implemented |
| Delete request flow (Commercial Mgr → Admin) | ✅ Implemented |
| Edit request flow (Docs → Admin) | ✅ Implemented |
| Container number 4+7 validation | ✅ Implemented |
| "Self" customer full logic (billing freeze, Credit, advances, CHA=CGI) | ✅ Implemented |
| Trip date = tomorrow when booked today | ✅ Implemented |
| Hire amount lock (except Return/Open) | ✅ Implemented |
| Approximate KM field on assignment | ✅ Implemented |
| Lift-on auto/manual/coastal rules | ✅ Implemented |
| Pagination (10 per page) — all trip list screens | ✅ Implemented |
| Sticky headers — all trip list screens | ✅ Implemented |
| Column order: Vehicle, Driver, Container, From-To | ✅ Implemented |
| Trip sheet date auto-today (non-editable) | ✅ Implemented — read-only display, auto-set on first open |
| Flagged for re-checking (Docs reconciliation) | ✅ Implemented — flag/unflag button, orange badge, "Flagged" filter card |
| Advance paid verification (Yard — checkbox + remarks) | ✅ Implemented — Verify/Correct/Mismatch flow with correct amount + remark fields |
| 1-day entry popup for Antony | ✅ Implemented — popup on sheet-collection load if received sheet not entered within 24h |
| Clickable stat cards (Admin + Commercial Mgr dashboard) | ✅ Implemented — Admin Active Trips/Fleet on Road → /trips/current; Commercial Mgr cards → respective trip list pages |
| Diesel entry in trip sheet (litres, rate, total) | ✅ Implemented — Diesel Entry section in TripSheetDialog after KM section |
| Diesel → Fuel log auto-sync | ✅ Implemented — upsert FuelLog record on trip sheet save (keyed by trip_id) |
| ±5% diesel variance popup | ✅ Implemented — SweetAlert with mandatory remark before save |
| ±10% KM variance popup | ✅ Implemented — SweetAlert with mandatory remark before save (compares totalKm to approxKm) |
| Download by date range (Yard PDF) | ✅ Implemented — date-from/to inputs beside Download PDF button; PDF filters by tripSheetCollectedAt |
| Active bookings visible on all user dashboards | ✅ Implemented — ActiveBookingsWidget added to Staff, Yard Supervisor, Maintenance, Accounts dashboards; shows all non-invoiced trips with live status |
| From/To predefined dropdown list (replace free-text) | ✅ Implemented — 25 standard Chennai port/logistics locations always appear in origin/destination dropdowns (merged with customer-specific and history options) |
| LR / Consignment Note generation | ✅ Implemented — "LR" button (FileText icon) in every trip row; generates professional A4 PDF via jsPDF with all trip/cargo/driver/freight details |
| P&L and Mileage per-trip calc for Shibu | ✅ Implemented — P&L & Mileage table visible only to Assistant Commercial Manager; shows Hire − Expense = P&L and km/L mileage per trip |
