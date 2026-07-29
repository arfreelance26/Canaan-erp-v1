from datetime import date as date_type
from calendar import monthrange
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from database import get_db, engine
import models


def _ensure_emi_finance_columns() -> None:
    """Add monthly_finance_cost / daily_finance_cost to emi_records if absent.

    Runs at module import time so a uvicorn --reload picks it up immediately,
    and also called defensively inside the endpoint on OperationalError.
    Each ALTER TABLE is in its own connection so a 'Duplicate column' error
    on the second column never blocks the first.
    """
    for col, defn in [
        ("monthly_finance_cost", "DECIMAL(10,2) NOT NULL DEFAULT 0"),
        ("daily_finance_cost",   "DECIMAL(10,4) NOT NULL DEFAULT 0"),
    ]:
        try:
            with engine.begin() as _conn:
                _conn.execute(text(f"ALTER TABLE emi_records ADD COLUMN {col} {defn}"))
        except Exception:
            pass


_ensure_emi_finance_columns()

router = APIRouter(prefix="/pl-summary", tags=["P&L Summary"])


# ── Date helpers ──────────────────────────────────────────────────────────────

def _add_years(d: date_type, years: int) -> date_type:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, day=28)


def _add_months(d: date_type, months: int) -> date_type:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date_type(year, month, day)


# ── Cost calculators ──────────────────────────────────────────────────────────

def _doc_share(
    expense,
    issue: Optional[date_type],
    expiry: Optional[date_type],
    start: date_type,
    end: date_type,
) -> float:
    """Amortise a document expense over its validity window, returning the share
    that falls within [start, end]."""
    if not expense or not issue or not expiry:
        return 0.0
    amt = float(expense)
    if amt <= 0 or expiry <= issue:
        return 0.0
    ov_start = max(start, issue)
    ov_end = min(end, expiry)
    if ov_start > ov_end:
        return 0.0
    validity_days = (expiry - issue).days
    if validity_days <= 0:
        return 0.0
    overlap_days = (ov_end - ov_start).days + 1
    return round(amt * overlap_days / validity_days, 2)


def _emi_share(
    emi_amount,
    emi_start: Optional[date_type],
    emi_end: Optional[date_type],
    start: date_type,
    end: date_type,
) -> float:
    """Pro-rate a monthly EMI for the overlap of [start,end] with the EMI active window."""
    if not emi_amount or not emi_start or not emi_end:
        return 0.0
    amt = float(emi_amount)
    ov_start = max(start, emi_start)
    ov_end = min(end, emi_end)
    if ov_start > ov_end:
        return 0.0
    overlap_days = (ov_end - ov_start).days + 1
    return round(amt * overlap_days / 30, 2)


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("")
def get_pl_summary(
    start_date: date_type = Query(...),
    end_date: date_type = Query(...),
    truck_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return per-truck P&L breakdown for the given date range.

    Revenue  = sum of hire_amount from trip_sheets (trip_sheet_date in range)
    Cost     = trip_expenses + maintenance + EMI share + document amortisation share
    Net P&L  = Revenue - Cost

    Each trip_row is enriched with customer_name, trip_category, cargo_classification,
    and container_specification (joined from trips and customers tables) to support
    client-side profitability filtering.
    """
    trucks_q = db.query(models.Truck)
    if truck_id:
        trucks_q = trucks_q.filter(models.Truck.truck_id == truck_id)
    trucks = trucks_q.all()

    # ── Pre-load related data ──────────────────────────────────────────────

    emi_by_reg: dict = {}
    try:
        emi_records = db.query(models.EmiRecord).all()
    except OperationalError as _exc:
        if "monthly_finance_cost" in str(_exc) or "daily_finance_cost" in str(_exc):
            db.rollback()
            _ensure_emi_finance_columns()
            emi_records = db.query(models.EmiRecord).all()
        else:
            raise
    for e in emi_records:
        reg = (e.truck_registration or "").strip()
        emi_by_reg.setdefault(reg, []).append(e)

    maint_by_truck: dict = {}
    for m in (
        db.query(models.MaintenanceRecord)
        .filter(
            models.MaintenanceRecord.date >= start_date,
            models.MaintenanceRecord.date <= end_date,
        )
        .all()
    ):
        maint_by_truck.setdefault(m.truck_id, []).append(m)

    sheets_by_vehicle: dict = {}
    for s in (
        db.query(models.TripSheet)
        .filter(
            models.TripSheet.trip_sheet_date >= start_date,
            models.TripSheet.trip_sheet_date <= end_date,
        )
        .all()
    ):
        vid = (s.vehicle_id or "").strip()
        sheets_by_vehicle.setdefault(vid, []).append(s)

    # ── Pre-load Trip metadata for filter enrichment ───────────────────────
    # Batch-load all Trip rows for sheets in the period (avoids N+1 queries)
    all_trip_ids = {
        s.trip_id
        for sheets in sheets_by_vehicle.values()
        for s in sheets
        if s.trip_id
    }
    trips_meta: dict = {}
    if all_trip_ids:
        for t in db.query(models.Trip).filter(models.Trip.id.in_(list(all_trip_ids))).all():
            trips_meta[t.id] = t

    # Batch-load Customer names for those trips
    cust_ids = {t.customer_id for t in trips_meta.values() if t.customer_id}
    customers_meta: dict = {}
    if cust_ids:
        for c in db.query(models.Customer).filter(models.Customer.id.in_(list(cust_ids))).all():
            customers_meta[c.id] = c

    # ── Per-truck calculation ──────────────────────────────────────────────

    results = []
    for truck in trucks:

        # Document amortisation
        ins_issue = _add_years(truck.insurance_expiry_date, -1) if truck.insurance_expiry_date else None
        road_tax_expiry = _add_years(truck.road_tax_date, 1) if truck.road_tax_date else None
        np_expiry = _add_years(truck.national_permit_date, 1) if truck.national_permit_date else None
        lp_expiry = _add_years(truck.local_permit_date, 1) if truck.local_permit_date else None
        pc_expiry = _add_months(truck.pollution_certificate_date, 6) if truck.pollution_certificate_date else None

        doc_breakdown = {
            "rc":                    _doc_share(truck.rc_expenses, truck.rc_date, truck.rc_validity_date, start_date, end_date),
            "fc":                    _doc_share(truck.fc_expenses, truck.fc_date, truck.fc_expiry_date, start_date, end_date),
            "road_tax":              _doc_share(truck.road_tax_expenses, truck.road_tax_date, road_tax_expiry, start_date, end_date),
            "insurance":             _doc_share(truck.insurance_expenses, ins_issue, truck.insurance_expiry_date, start_date, end_date),
            "national_permit":       _doc_share(truck.national_permit_expenses, truck.national_permit_date, np_expiry, start_date, end_date),
            "local_permit":          _doc_share(truck.local_permit_expenses, truck.local_permit_date, lp_expiry, start_date, end_date),
            "pollution_certificate": _doc_share(truck.pollution_certificate_expenses, truck.pollution_certificate_date, pc_expiry, start_date, end_date),
        }
        total_doc_share = round(sum(doc_breakdown.values()), 2)

        # EMI share for period
        emi_total = 0.0
        emi_details = []
        for e in emi_by_reg.get((truck.registration_number or "").strip(), []):
            share = _emi_share(e.emi_amount, e.emi_start_date, e.emi_end_date, start_date, end_date)
            if share > 0:
                emi_total += share
                monthly_fc = float(e.monthly_finance_cost or 0)
                daily_fc   = float(e.daily_finance_cost or 0)
                # Pro-rate monthly_finance_cost over the period overlap (same day-fraction logic)
                period_fc  = round(_emi_share(monthly_fc, e.emi_start_date, e.emi_end_date, start_date, end_date), 2)
                emi_details.append({
                    "emi_name":             e.emi_name,
                    "bank_name":            e.bank_name or "",
                    "monthly_emi":          float(e.emi_amount or 0),
                    "share_for_period":     round(share, 2),
                    "monthly_finance_cost": monthly_fc,
                    "daily_finance_cost":   daily_fc,
                    "period_finance_cost":  period_fc,
                })
        emi_total = round(emi_total, 2)

        # Maintenance cost in period
        maintenance_total = round(
            sum(float(m.cost or 0) for m in maint_by_truck.get(truck.id, [])), 2
        )

        # Trip revenue and expenses
        truck_sheets = sheets_by_vehicle.get((truck.truck_id or "").strip(), [])
        truck_sheets_sorted = sorted(truck_sheets, key=lambda s: s.trip_sheet_date or date_type.min)
        hire_total = round(sum(float(s.hire_amount or 0) for s in truck_sheets_sorted), 2)
        trip_expense_total = round(sum(float(s.total_expense or 0) for s in truck_sheets_sorted), 2)
        total_km = round(sum(float(s.total_km or 0) for s in truck_sheets_sorted), 1)

        total_cost = round(trip_expense_total + maintenance_total + emi_total + total_doc_share, 2)
        net_pl = round(hire_total - total_cost, 2)

        # Per-trip detail rows — enriched with Trip metadata for client-side filtering
        trip_rows = []
        for s in truck_sheets_sorted:
            trip_meta = trips_meta.get(s.trip_id) if s.trip_id else None
            cust_name = ""
            if trip_meta and trip_meta.customer_id:
                cust = customers_meta.get(trip_meta.customer_id)
                cust_name = cust.name if cust else ""

            # Canonical enum fields from Trip; fall back to TripSheet plain-string
            # fields for trips where the enum columns were not populated.
            trip_cat = str(trip_meta.trip_category or "").strip() if trip_meta else ""
            if not trip_cat:
                trip_cat = str(s.trip_type or "").strip()

            container_spec = str(trip_meta.container_specification or "").strip() if trip_meta else ""
            if not container_spec:
                container_spec = str(s.container_type or "").strip()

            cargo_class = str(trip_meta.cargo_classification or "").strip() if trip_meta else ""

            trip_rows.append({
                "trip_sheet_date":          s.trip_sheet_date.isoformat() if s.trip_sheet_date else None,
                "trip_sheet_no":            s.trip_sheet_no or "",
                "booking_reference_no":     s.booking_reference_no or "",
                "from_location":            s.from_location or "",
                "to_location":              s.to_location or "",
                "hire_amount":              float(s.hire_amount or 0),
                "total_expense":            float(s.total_expense or 0),
                "total_km":                 float(s.total_km or 0),
                # Joined from trips + customers — used for client-side profitability filters
                "customer_name":            cust_name,
                "trip_category":            trip_cat,
                "cargo_classification":     cargo_class,
                "container_specification":  container_spec,
            })

        # Maintenance detail rows
        maint_rows = [
            {
                "date":             m.date.isoformat() if m.date else None,
                "maintenance_type": m.maintenance_type or "",
                "description":      m.description or "",
                "cost":             float(m.cost or 0),
            }
            for m in sorted(maint_by_truck.get(truck.id, []), key=lambda m: m.date or date_type.min)
        ]

        results.append({
            "truck_id":            truck.truck_id,
            "registration_number": truck.registration_number,
            "trip_count":          len(truck_sheets_sorted),
            "total_hire_amount":   hire_total,
            "trip_expenses":       trip_expense_total,
            "maintenance_expenses": maintenance_total,
            "emi_share":           emi_total,
            "document_share":      total_doc_share,
            "document_breakdown":  doc_breakdown,
            "emi_details":         emi_details,
            "total_cost":          total_cost,
            "net_pl":              net_pl,
            "total_km":            total_km,
            "revenue_per_km":      round(hire_total / total_km, 2) if total_km > 0 else 0,
            "maintenance_count":   len(maint_rows),
            "trip_rows":           trip_rows,
            "maintenance_rows":    maint_rows,
        })

    return results
