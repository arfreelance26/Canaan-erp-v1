from datetime import date
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
import models
from excel_utils import build_excel_response
from security import PENDING_AUDIT_ROLES, get_current_user, require_roles, TokenUser

router = APIRouter(prefix="/exports", tags=["Exports"])
IST = ZoneInfo("Asia/Kolkata")


# ---------------------------------------------------------------------------
# Administration
# ---------------------------------------------------------------------------

@router.get("/branches")
def export_branches(db: Session = Depends(get_db)):
    rows = db.query(models.Branch).order_by(models.Branch.name).all()
    headers = ["Branch Name",
               "Company Halt Fee (20ft)", "Company Halt Fee (40ft)", "Company Halt Fee (2x20)", "Company Halt Fee (Open Load)",
               "Customer Halt Fee (20ft)", "Customer Halt Fee (40ft)", "Customer Halt Fee (2x20)", "Customer Halt Fee (Open Load)",
               "Driver Halt Day %",
               "Cleaner Batta Fee (20ft)", "Cleaner Batta Fee (40ft)", "Cleaner Batta Fee (2x20)", "Cleaner Batta Fee (Open Load)",
               "On Workshop Batta Fee"]
    data = [[r.name,
             r.halt_day_fee_20ft, r.halt_day_fee_40ft, r.halt_day_fee_2x20, r.halt_day_fee_open_load,
             r.party_halt_fee_20ft, r.party_halt_fee_40ft, r.party_halt_fee_2x20, r.party_halt_fee_open_load,
             r.driver_halt_day_percentage,
             r.cleaner_batta_fee_20ft, r.cleaner_batta_fee_40ft, r.cleaner_batta_fee_2x20, r.cleaner_batta_fee_open_load,
             r.workshop_batta_fee] for r in rows]
    return build_excel_response([("Branches", headers, data)], "branches.xlsx")


@router.get("/repair-types")
def export_repair_types(db: Session = Depends(get_db)):
    rows = db.query(models.RepairType).order_by(models.RepairType.name).all()
    headers = ["Repair Type", "Default Cost"]
    data = [[r.name, r.default_cost] for r in rows]
    return build_excel_response([("Repair Types", headers, data)], "repair_types.xlsx")


@router.get("/sac-codes")
def export_sac_codes(db: Session = Depends(get_db)):
    rows = db.query(models.SacCode).order_by(models.SacCode.code).all()
    headers = ["SAC Code", "Description", "GST Rate (%)"]
    data = [[r.code, r.description, r.gst_rate] for r in rows]
    return build_excel_response([("SAC Codes", headers, data)], "sac_codes.xlsx")


# ---------------------------------------------------------------------------
# Resource Hub
# ---------------------------------------------------------------------------

# The old full driver and staff lists (/exports/drivers, /exports/staff) are
# gone: they printed Aadhaar, PAN and bank numbers in full and any signed-in
# user could pull them. Our Drivers / Our Staff → View (resource_report.py)
# replaced them, with IDs masked and Our Staff limited to Admin.


@router.get("/trucks")
def export_trucks(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD — keeps trucks with a compliance document expiring on/after this date"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD — keeps trucks with a compliance document expiring on/before this date"),
    db: Session = Depends(get_db),
):
    q = db.query(models.Truck)
    # With a range, keep trucks where ANY compliance document's expiry/validity
    # date falls inside it (the Truck Compliance Record's "what expires when" view).
    # No range = the full fleet, as the Our Fleet download expects.
    if from_date or to_date:
        expiry_cols = [
            models.Truck.rc_validity_date, models.Truck.fc_expiry_date, models.Truck.road_tax_date,
            models.Truck.national_permit_date, models.Truck.local_permit_date,
            models.Truck.pollution_certificate_date, models.Truck.insurance_expiry_date,
        ]
        in_range = []
        for col in expiry_cols:
            cond = col.isnot(None)
            if from_date:
                cond = cond & (col >= from_date)
            if to_date:
                cond = cond & (col <= to_date)
            in_range.append(cond)
        q = q.filter(or_(*in_range))
    rows = q.order_by(models.Truck.truck_id).all()
    headers = [
        "Truck ID", "Registration Number", "Branch", "Manufacturer", "Model", "Type",
        "Chassis Number", "Year of Manufacture", "Tyre Layout",
        "Fuel Capacity", "Odometer at Purchase", "Current Odometer",
        "RC Date", "RC Validity Date", "RC Expenses",
        "FC Date", "FC Expiry Date", "FC Expenses",
        "Road Tax Date", "Road Tax Number", "Road Tax Expenses",
        "Insurance Expiry Date", "Insurance Expenses",
        "National Permit Number", "National Permit Date", "National Permit Expenses",
        "Local Permit Number", "Local Permit Date", "Local Permit Expenses",
        "Pollution Certificate Date", "Pollution Certificate Number", "Pollution Certificate Expenses",
    ]
    data = [
        [
            r.truck_id, r.registration_number, r.branch_registered_to, r.manufacturer, r.model_name, r.truck_type,
            r.chassis_number, r.year_of_manufacture, r.tyre_layout,
            r.fuel_capacity, r.odometer_during_purchase, r.odometer,
            r.rc_date, r.rc_validity_date, r.rc_expenses,
            r.fc_date, r.fc_expiry_date, r.fc_expenses,
            r.road_tax_date, r.road_tax_number, r.road_tax_expenses,
            r.insurance_expiry_date, r.insurance_expenses,
            r.national_permit_number, r.national_permit_date, r.national_permit_expenses,
            r.local_permit_number, r.local_permit_date, r.local_permit_expenses,
            r.pollution_certificate_date, r.pollution_certificate_number, r.pollution_certificate_expenses,
        ]
        for r in rows
    ]
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Fleet", headers, data)], f"fleet{suffix}.xlsx")


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Attendance & HR
# ---------------------------------------------------------------------------

@router.get("/pending-audit", dependencies=[Depends(require_roles(*PENDING_AUDIT_ROLES))])
def export_pending_audit(
    from_date: Optional[date] = Query(None, description="Range start YYYY-MM-DD (inclusive, filters by scheduled date)"),
    to_date: Optional[date] = Query(None, description="Range end YYYY-MM-DD (inclusive, filters by scheduled date)"),
    db: Session = Depends(get_db),
):
    from routers.trips import pending_audit_rows
    rows = pending_audit_rows(db)
    if from_date or to_date:
        rows = [r for r in rows if r["scheduled_date"]
                and (not from_date or r["scheduled_date"] >= from_date)
                and (not to_date or r["scheduled_date"] <= to_date)]
    headers = ["Trip ID", "Driver", "Truck", "Origin", "Destination", "Date"]
    data = [[r["trip_id_str"], r["driver_name"], r["truck_registration"] or r["vehicle_id"],
             r["origin"], r["destination"], r["scheduled_date"]] for r in rows]
    return build_excel_response([("Pending Audit", headers, data)], "pending_audit_trips.xlsx")


@router.get("/leave-requests")
def export_leave_requests(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    scope: Optional[str] = Query(None, pattern="^(mine|all)$", description="mine = only requests I filed. Non-admins always get 'mine'."),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    from routers.attendance import leave_mine_filter

    q = db.query(models.LeaveRequest)
    if current_user.role != "Admin" or scope == "mine":
        q = leave_mine_filter(q, current_user)
    if from_date:
        q = q.filter(models.LeaveRequest.from_date >= from_date)
    if to_date:
        q = q.filter(models.LeaveRequest.from_date <= to_date)
    rows = q.order_by(models.LeaveRequest.applied_at.desc()).all()
    headers = ["Category", "Applicant Code", "Applicant Name", "From Date", "To Date", "Reason", "Status", "Applied At"]
    data = [
        [r.category, r.applicant_code, r.applicant_name, r.from_date, r.to_date, r.reason, r.status, r.applied_at]
        for r in rows
    ]
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Leave Requests", headers, data)], f"leave_requests{suffix}.xlsx")


# ---------------------------------------------------------------------------
# Finance
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

@router.get("/maintenance-records")
def export_maintenance_records(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    truck_id: Optional[int] = Query(None, description="Only this truck (trucks.id) — the per-truck Maintenance Record dialog"),
    vendor_id: Optional[int] = Query(None, description="Only this vendor's jobs — Our Vendors → View Record"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.MaintenanceRecord)
        .join(models.Truck, models.Truck.id == models.MaintenanceRecord.truck_id)
    )
    if truck_id:
        q = q.filter(models.MaintenanceRecord.truck_id == truck_id)
    if vendor_id:
        q = q.filter(or_(
            models.MaintenanceRecord.vendor_id == vendor_id,
            models.MaintenanceRecord.id.in_(
                db.query(models.MaintenanceRecordItem.record_id).filter(models.MaintenanceRecordItem.vendor_id == vendor_id)
            ),
        ))
    if from_date:
        q = q.filter(models.MaintenanceRecord.date >= from_date)
    if to_date:
        q = q.filter(models.MaintenanceRecord.date <= to_date)
    records = q.order_by(models.MaintenanceRecord.date.desc()).all()
    proof_counts = dict(
        db.query(models.MaintenanceProof.record_id, func.count(models.MaintenanceProof.id))
        .filter(models.MaintenanceProof.record_id.in_([r.id for r in records]))
        .group_by(models.MaintenanceProof.record_id)
        .all()
    ) if records else {}
    # One row per repair (a record can hold several, each with its own cost,
    # place, vendor and invoice); the record's own total sits on each row.
    headers = ["Truck ID", "Registration Number", "Start Date", "End Date", "Maintenance Type", "Repair Type",
               "Compliant", "Location", "Maintenance By", "Invoice Number", "Invoice Date", "Remarks", "Odometer", "User Modified", "Source",
               "Repair Cost", "Record Total", "Proof of Payment Files"]
    data = []
    for r in records:
        for line in r.repair_lines:
            get = (lambda k: line.get(k)) if isinstance(line, dict) else (lambda k: getattr(line, k))
            if vendor_id and r.items and get("vendor_id") != vendor_id:  # only that vendor's repairs
                continue
            data.append([r.truck.truck_id, r.truck.registration_number, r.date, r.maintenance_end_date, r.maintenance_type,
                         get("repair_type"), r.compliant, get("maintenance_location"), get("maintenance_by"), get("invoice_number"),
                         get("invoice_date"), r.description, r.odometer, r.entered_by_name, r.source, get("cost"), r.cost,
                         int(proof_counts.get(r.id, 0))])
    truck_part = f"_{records[0].truck.registration_number}" if truck_id and records else ""
    if vendor_id:
        v = db.get(models.Vendor, vendor_id)
        if v:
            truck_part += "_" + "".join(c if c.isalnum() else "_" for c in v.name).strip("_")
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Maintenance Records", headers, data)], f"maintenance_records{truck_part}{suffix}.xlsx")


# Who can open each page's report — the same roles as the page (lib/nav-config.ts
# ROLE_HREFS), so Reports Center and the pages agree. Admin always passes.
MAINTENANCE_REPORT = [Depends(require_roles("Maintenance"))]                          # Truck Maintenance
FUEL_REPORT = [Depends(require_roles("Maintenance", "Trip Sheet Register"))]          # Truck's Fuel History
TRIP_REPORT = [Depends(require_roles("Commercial Manager", "Assistant Commercial Manager", "Accounts"))]  # Trip History
# Attendance: drivers for the Commercial Managers (Driver Attendance, Attendance Report); staff is Admin only.
ATTENDANCE_ROLES = {"driver": ("Admin", "Commercial Manager", "Assistant Commercial Manager"), "staff": ("Admin",)}


def _report_dates(from_date: Optional[str], to_date: Optional[str]):
    try:
        start = date.fromisoformat(from_date) if from_date else None
        end = date.fromisoformat(to_date) if to_date else None
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD.")
    if start and end and start > end:
        raise HTTPException(400, "The From date is after the To date.")
    return start, end


@router.get("/maintenance-report", dependencies=MAINTENANCE_REPORT)
def export_maintenance_report(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive, by the work's start date)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    search: str = Query("", max_length=100, description="Truck Maintenance's search box (registration or truck ID)"),
    truck_id: Optional[int] = Query(None, description="One truck (trucks.id) — its View Record dialog"),
    db: Session = Depends(get_db),
):
    """Truck Maintenance → View → Excel: the truck-wise report (maintenance_report.py)."""
    from fastapi.responses import Response
    import maintenance_report
    start, end = _report_dates(from_date, to_date)
    data, filename, _, _ = maintenance_report.build(db, start, end, search, truck_id)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/maintenance-report/preview", dependencies=MAINTENANCE_REPORT)
def preview_maintenance_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    search: str = Query("", max_length=100),
    truck_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """The report's sheets for the in-app preview, plus its figures for the PDF
    (lib/maintenance-report-pdf.ts) — so the PDF and the Excel always agree."""
    import maintenance_report
    start, end = _report_dates(from_date, to_date)
    _, filename, sheets, report = maintenance_report.build(db, start, end, search, truck_id)
    return {"filename": filename, "sheets": sheets, "report": report}


@router.get("/fuel-report", dependencies=FUEL_REPORT)
def export_fuel_report(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive, by fill date)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    search: str = Query("", max_length=100, description="Truck's Fuel History's search box (registration or truck ID)"),
    truck_id: Optional[int] = Query(None, description="One truck (trucks.id)"),
    db: Session = Depends(get_db),
):
    """Truck's Fuel History → View → Excel: the truck-wise fuel report (fuel_report.py)."""
    from fastapi.responses import Response
    import fuel_report
    start, end = _report_dates(from_date, to_date)
    data, filename, _, _ = fuel_report.build(db, start, end, search, truck_id)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/fuel-report/preview", dependencies=FUEL_REPORT)
def preview_fuel_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    search: str = Query("", max_length=100),
    truck_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """The fuel report's sheets for the preview, plus its figures for the PDF (lib/fuel-report-pdf.ts)."""
    import fuel_report
    start, end = _report_dates(from_date, to_date)
    _, filename, sheets, report = fuel_report.build(db, start, end, search, truck_id)
    return {"filename": filename, "sheets": sheets, "report": report}


def _trip_report(db, from_date, to_date, search, trip_category, card, current_user):
    import trip_report
    start, end = _report_dates(from_date, to_date)
    show_invoice = current_user.role not in trip_report.NO_INVOICE_ROLES
    # Trip Summary (hire − expenses) is a profit figure: Admin only.
    show_profit = current_user.role == "Admin"
    return trip_report.build(db, start, end, search, trip_category or "", card or "All", show_invoice, show_profit)


@router.get("/trip-report", dependencies=TRIP_REPORT)
def export_trip_report(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive, by scheduled date)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    search: str = Query("", max_length=100, description="Trip History's search box"),
    trip_category: Optional[str] = Query(None, description="Comma-separated categories, e.g. 'RETURN TRIP'"),
    card: str = Query("All", description="Trip History's stage card: All, Assigned, Current, Completed, Invoiced, Waived Invoice, Cancelled"),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Trip History → View → Excel: the category-wise trip report (trip_report.py)."""
    from fastapi.responses import Response
    data, filename, _, _ = _trip_report(db, from_date, to_date, search, trip_category, card, current_user)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/trip-report/preview", dependencies=TRIP_REPORT)
def preview_trip_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    search: str = Query("", max_length=100),
    trip_category: Optional[str] = Query(None),
    card: str = Query("All"),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """The trip report's sheets for the preview, plus its figures for the PDF (lib/trip-report-pdf.ts)."""
    _, filename, sheets, report = _trip_report(db, from_date, to_date, search, trip_category, card, current_user)
    return {"filename": filename, "sheets": sheets, "report": report}


def _attendance_report(db, category, from_date, to_date, search, current_user):
    import attendance_report
    if category not in ("driver", "staff"):
        raise HTTPException(400, "category must be 'driver' or 'staff'")
    if current_user.role not in ATTENDANCE_ROLES[category]:
        raise HTTPException(403, f"Your role ({current_user.role}) can't open this report.")
    start, end = _report_dates(from_date, to_date)
    if not start or not end:
        raise HTTPException(400, "Pick a From and a To date.")
    if (end - start).days > 366:
        raise HTTPException(400, "Pick a period of a year or less.")
    return attendance_report.build(db, category, start, end, search)


@router.get("/attendance-report")
def export_attendance_report(
    category: str = Query(..., description="'driver' or 'staff'"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    search: str = Query("", max_length=100, description="The page's search box (name or code)"),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Driver / Staff Attendance and the Attendance Report → View → Excel (attendance_report.py)."""
    from fastapi.responses import Response
    data, filename, _, _ = _attendance_report(db, category, from_date, to_date, search, current_user)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/attendance-report/preview")
def preview_attendance_report(
    category: str = Query(...),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """The attendance report's sheets for the preview, plus its figures for the PDF (lib/attendance-report-pdf.ts)."""
    _, filename, sheets, report = _attendance_report(db, category, from_date, to_date, search, current_user)
    return {"filename": filename, "sheets": sheets, "report": report}


def _approvals_report(db, kind, from_date, to_date, search, tab, current_user):
    import approvals_report
    if kind not in approvals_report.KINDS:
        raise HTTPException(400, "kind must be leave, edit, deletion or maintenance")
    if current_user.role not in approvals_report.ROLES[kind]:
        raise HTTPException(403, "You don't have access to this report.")
    start, end = _report_dates(from_date, to_date)
    return approvals_report.build(db, kind, start, end, search, tab or "")


@router.get("/approvals-report")
def export_approvals_report(
    kind: str = Query(..., description="leave, edit, deletion or maintenance"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    search: str = Query("", max_length=100),
    tab: str = Query("", max_length=40, description="The page's tab / filter"),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Leave / Edit / Deletion / Maintenance Approvals → View → Excel (approvals_report.py). Same roles as each page."""
    from fastapi.responses import Response
    data, filename, _, _ = _approvals_report(db, kind, from_date, to_date, search, tab, current_user)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/approvals-report/preview")
def preview_approvals_report(
    kind: str = Query(...),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    search: str = Query("", max_length=100),
    tab: str = Query("", max_length=40),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """The approvals report's sheets for the preview, plus its figures for the PDF (lib/approvals-report-pdf.ts)."""
    _, filename, sheets, report = _approvals_report(db, kind, from_date, to_date, search, tab, current_user)
    return {"filename": filename, "sheets": sheets, "report": report}


def _resource_opts(kind, current_user, from_date, to_date, year, resource_type, stage="", trip_category=""):
    import resource_report
    if kind not in resource_report.KINDS:
        raise HTTPException(400, "Unknown report.")
    allowed = resource_report.KIND_ROLES.get(kind)
    if allowed and current_user.role not in allowed:
        raise HTTPException(403, f"Your role ({current_user.role}) can't open this report.")
    start, end = _report_dates(from_date, to_date)
    if year is not None and not 2000 <= year <= 2100:
        raise HTTPException(400, "Year out of range.")
    # stage / category: the trip pages' pills and Trip Category (trip_pages_report.py); user_id:
    # Trip Reconciliation shows a Trip Sheet Register their own edit requests, as the page does.
    return {"start": start, "end": end, "year": year, "rtype": resource_type or "",
            "stage": stage or "", "category": trip_category or "", "user_id": current_user.id}


@router.get("/resource-report")
def export_resource_report(
    kind: str = Query(..., description="fleet, drivers, customers, vendors, staff, archive, payments or holidays"),
    search: str = Query("", max_length=100, description="The page's search box"),
    from_date: Optional[str] = Query(None, description="payments: range start YYYY-MM-DD (the day asked)"),
    to_date: Optional[str] = Query(None, description="payments: range end YYYY-MM-DD"),
    year: Optional[int] = Query(None, description="holidays: the year shown"),
    resource_type: Optional[str] = Query(None, max_length=30, description="archive: one record type; detention: one status"),
    stage: str = Query("", max_length=40, description="trip pages: one of the page's pills"),
    trip_category: str = Query("", max_length=20, description="trip pages: one trip category"),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Resource Hub, Finance Hub and the trip pages → View → Excel (resource_report.py)."""
    from fastapi.responses import Response
    import resource_report
    opts = _resource_opts(kind, current_user, from_date, to_date, year, resource_type, stage, trip_category)
    data, filename, _, _ = resource_report.build(db, kind, search, current_user.role, **opts)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/resource-report/preview")
def preview_resource_report(
    kind: str = Query(...),
    search: str = Query("", max_length=100),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    resource_type: Optional[str] = Query(None, max_length=30),
    stage: str = Query("", max_length=40),
    trip_category: str = Query("", max_length=20),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """The resource report's sheets for the preview, plus its figures for the PDF (lib/resource-report-pdf.ts)."""
    import resource_report
    opts = _resource_opts(kind, current_user, from_date, to_date, year, resource_type, stage, trip_category)
    _, filename, sheets, report = resource_report.build(db, kind, search, current_user.role, **opts)
    return {"filename": filename, "sheets": sheets, "report": report}


@router.get("/tyre-report-counts")
def tyre_report_counts(
    search: str = Query("", max_length=100),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    stage: str = Query("", max_length=40, description="a Tyre Inventory status"),
    resource_type: str = Query("", max_length=100, description="a brand"),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Reports Center's Tyre Inventory window: tyres per status (within the
    chosen brand) and per brand (within the chosen status) — tyre_reports.inventory_counts."""
    import tyre_reports
    o = _resource_opts("tyre_inventory", current_user, from_date, to_date, None, resource_type, stage, "")
    return tyre_reports.inventory_counts(db, start=o["start"], end=o["end"], search=search, status=o["stage"], brand=o["rtype"])


@router.get("/trip-report-counts")
def trip_report_counts(
    kind: str = Query(..., description="A trip page's report kind, e.g. trips_available"),
    search: str = Query("", max_length=100),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    stage: str = Query("", max_length=40),
    trip_category: str = Query("", max_length=20),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Reports Center's trip windows: how many trips each pill and each Trip
    Category would give — pills counted within the chosen category, categories
    within the chosen pill, as the pages count them (trip_pages_report.counts)."""
    import trip_pages_report
    if kind not in trip_pages_report.PILLS:
        raise HTTPException(400, "Unknown trip report.")
    o = _resource_opts(kind, current_user, from_date, to_date, None, None, stage, trip_category)
    return trip_pages_report.counts(db, kind, start=o["start"], end=o["end"], search=search, stage=o["stage"],
                                    category=o["category"], role=current_user.role, user_id=current_user.id)


@router.get("/vendor-retreads")
def export_vendor_retreads(
    vendor_id: int = Query(..., description="Our Vendors → View Record → Tyre Retreads"),
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    from routers.vendors import retread_rows
    v = db.get(models.Vendor, vendor_id)
    if not v:
        raise HTTPException(404, "Vendor not found")
    headers = ["Date", "Tyre Number", "Brand", "Tyre Size", "Tyre Type", "Retread Count", "Expected Range (km)",
               "Invoice Number", "Invoice Date", "Proof of Payment", "Moved By", "Retread Cost"]
    data = [[ev.created_at.date(), t.tyre_number, t.brand, t.size, t.tyre_type, ev.retread_count, ev.expected_range,
             ev.invoice_number, ev.invoice_date, ev.proof_file_name or "", ev.actor_name, ev.retread_cost]
            for ev, t in retread_rows(db, vendor_id, from_date, to_date)]
    name = "".join(c if c.isalnum() else "_" for c in v.name).strip("_")
    suffix = f"_{from_date or ''}_to_{to_date or ''}" if from_date or to_date else ""
    return build_excel_response([("Tyre Retreads", headers, data)], f"vendor_retreads_{name}{suffix}.xlsx")


