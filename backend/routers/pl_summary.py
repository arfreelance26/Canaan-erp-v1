from datetime import date as date_type
from calendar import monthrange
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
import models

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
    """
    trucks_q = db.query(models.Truck)
    if truck_id:
        trucks_q = trucks_q.filter(models.Truck.truck_id == truck_id)
    trucks = trucks_q.all()

    # ── Pre-load related data ──────────────────────────────────────────────

    # EMI records keyed by truck registration number
    emi_by_reg: dict = {}
    for e in db.query(models.EmiRecord).all():
        reg = (e.truck_registration or "").strip()
        emi_by_reg.setdefault(reg, []).append(e)

    # Maintenance records within period, keyed by trucks.id (integer PK)
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

    # Trip sheets within period, keyed by vehicle_id (varchar like "CGI-T001")
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

    # ── Per-truck calculation ──────────────────────────────────────────────

    results = []
    for truck in trucks:

        # Document amortisation
        # Insurance: no issue date stored → assume 1-year validity ending at expiry
        ins_issue = _add_years(truck.insurance_expiry_date, -1) if truck.insurance_expiry_date else None
        # Road Tax: no expiry stored → assume 1-year validity from issue date
        road_tax_expiry = _add_years(truck.road_tax_date, 1) if truck.road_tax_date else None
        # National / Local Permit: 1-year validity from issue
        np_expiry = _add_years(truck.national_permit_date, 1) if truck.national_permit_date else None
        lp_expiry = _add_years(truck.local_permit_date, 1) if truck.local_permit_date else None
        # Pollution Certificate: 6-month validity from issue
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
                emi_details.append({
                    "emi_name": e.emi_name,
                    "bank_name": e.bank_name or "",
                    "monthly_emi": float(e.emi_amount or 0),
                    "share_for_period": round(share, 2),
                })
        emi_total = round(emi_total, 2)

        # Maintenance cost in period
        maintenance_total = round(
            sum(float(m.cost or 0) for m in maint_by_truck.get(truck.id, [])), 2
        )

        # Trip revenue and expenses
        truck_sheets = sheets_by_vehicle.get((truck.truck_id or "").strip(), [])
        # Sort sheets by date ascending
        truck_sheets_sorted = sorted(truck_sheets, key=lambda s: s.trip_sheet_date or date_type.min)
        hire_total = round(sum(float(s.hire_amount or 0) for s in truck_sheets_sorted), 2)
        trip_expense_total = round(sum(float(s.total_expense or 0) for s in truck_sheets_sorted), 2)
        total_km = round(sum(float(s.total_km or 0) for s in truck_sheets_sorted), 1)

        total_cost = round(trip_expense_total + maintenance_total + emi_total + total_doc_share, 2)
        net_pl = round(hire_total - total_cost, 2)

        # Per-trip detail rows
        trip_rows = [
            {
                "trip_sheet_date": s.trip_sheet_date.isoformat() if s.trip_sheet_date else None,
                "trip_sheet_no": s.trip_sheet_no or "",
                "booking_reference_no": s.booking_reference_no or "",
                "from_location": s.from_location or "",
                "to_location": s.to_location or "",
                "hire_amount": float(s.hire_amount or 0),
                "total_expense": float(s.total_expense or 0),
                "total_km": float(s.total_km or 0),
            }
            for s in truck_sheets_sorted
        ]

        # Maintenance detail rows
        maint_rows = [
            {
                "date": m.date.isoformat() if m.date else None,
                "maintenance_type": m.maintenance_type or "",
                "description": m.description or "",
                "cost": float(m.cost or 0),
            }
            for m in sorted(maint_by_truck.get(truck.id, []), key=lambda m: m.date or date_type.min)
        ]

        results.append({
            "truck_id": truck.truck_id,
            "registration_number": truck.registration_number,
            "trip_count": len(truck_sheets_sorted),
            "total_hire_amount": hire_total,
            "trip_expenses": trip_expense_total,
            "maintenance_expenses": maintenance_total,
            "emi_share": emi_total,
            "document_share": total_doc_share,
            "document_breakdown": doc_breakdown,
            "emi_details": emi_details,
            "total_cost": total_cost,
            "net_pl": net_pl,
            # Extra detail fields
            "total_km": total_km,
            "revenue_per_km": round(hire_total / total_km, 2) if total_km > 0 else 0,
            "maintenance_count": len(maint_rows),
            "trip_rows": trip_rows,
            "maintenance_rows": maint_rows,
        })

    return results
