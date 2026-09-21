from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models
from excel_utils import build_excel_response
from security import get_current_user, TokenUser

router = APIRouter(prefix="/exports", tags=["Exports"])


def _live_emi_figures(db: Session, records: list["models.EmiRecord"]):
    """Recomputes Amount Paid / Remaining EMI Payable fresh, as of today —
    mirroring EmiFormDialog's creation-anchored formula — instead of reading
    values saved at record-creation time. They shrink/grow by one EMI Amount
    on every elapsed Auto-Debit Date, so an export taken months after the
    last edit still reflects that. Daily Finance Cost / EMI Cost per KM are
    also included here (EMI Amount ÷ 26, and that ÷ the truck's km/day) so
    the export doesn't need a second lookup pass for them.
    Returns a dict keyed by record id -> (amount_paid, remaining, daily_finance_cost, emi_cost_per_km).
    """
    trucks_by_reg = {t.registration_number.strip().upper(): t for t in db.query(models.Truck).all()}
    km_per_day_by_layout = {c.tyre_layout: float(c.km_per_day or 0) for c in db.query(models.TruckRunConfig).all()}

    today = date.today()
    out: dict[int, tuple[float, float, float, float]] = {}
    for r in records:
        emi_amount = float(r.emi_amount or 0)
        tenure = r.tenure_months or 0
        if emi_amount <= 0 or tenure <= 0:
            out[r.id] = (0.0, 0.0, 0.0, 0.0)
            continue

        created = r.created_at.date() if r.created_at else r.emi_start_date
        if created is None:
            out[r.id] = (0.0, tenure * emi_amount, 0.0, 0.0)
            continue

        auto_debit_day = r.auto_debit_date.day if r.auto_debit_date else created.day
        months_since_creation = (today.year - created.year) * 12 + (today.month - created.month)
        if today.day < auto_debit_day:
            months_since_creation -= 1
        months_since_creation = max(0, months_since_creation)
        paid_months = min(tenure, months_since_creation + 1)

        amount_paid = paid_months * emi_amount
        remaining = max(0.0, (tenure - paid_months) * emi_amount)
        # Daily Finance Cost = EMI Amount ÷ 26 — EMI Amount is already the
        # monthly installment, matching EmiFormDialog's formula.
        daily_finance_cost = emi_amount / 26

        truck = trucks_by_reg.get((r.truck_registration or "").strip().upper())
        km_per_day = km_per_day_by_layout.get(truck.tyre_layout, 0) if truck else 0
        emi_cost_per_km = (daily_finance_cost / km_per_day) if km_per_day > 0 else 0.0

        out[r.id] = (round(amount_paid, 2), round(remaining, 2), round(daily_finance_cost, 2), round(emi_cost_per_km, 6))
    return out


# ---------------------------------------------------------------------------
# Administration
# ---------------------------------------------------------------------------

@router.get("/branches")
def export_branches(db: Session = Depends(get_db)):
    rows = db.query(models.Branch).order_by(models.Branch.name).all()
    headers = ["Branch Name", "Halt Day Fee (20ft)", "Halt Day Fee (40ft)", "Driver Halt Day %", "Cleaner Batta Fee"]
    data = [[r.name, r.halt_day_fee_20ft, r.halt_day_fee_40ft, r.driver_halt_day_percentage, r.cleaner_batta_fee] for r in rows]
    return build_excel_response([("Branches", headers, data)], "branches.xlsx")


@router.get("/repair-types")
def export_repair_types(db: Session = Depends(get_db)):
    rows = db.query(models.RepairType).order_by(models.RepairType.name).all()
    headers = ["Repair Type", "Default Cost"]
    data = [[r.name, r.default_cost] for r in rows]
    return build_excel_response([("Repair Types", headers, data)], "repair_types.xlsx")


@router.get("/maintenance-types")
def export_maintenance_types(db: Session = Depends(get_db)):
    rows = db.query(models.MaintenanceType).order_by(models.MaintenanceType.interval_km, models.MaintenanceType.name).all()
    headers = ["Maintenance Type", "KM Interval"]
    data = [[r.name, r.interval_km] for r in rows]
    return build_excel_response([("Maintenance Types", headers, data)], "maintenance_types.xlsx")


@router.get("/sac-codes")
def export_sac_codes(db: Session = Depends(get_db)):
    rows = db.query(models.SacCode).order_by(models.SacCode.code).all()
    headers = ["SAC Code", "Description", "GST Rate (%)"]
    data = [[r.code, r.description, r.gst_rate] for r in rows]
    return build_excel_response([("SAC Codes", headers, data)], "sac_codes.xlsx")


# ---------------------------------------------------------------------------
# Resource Hub
# ---------------------------------------------------------------------------

@router.get("/drivers")
def export_drivers(db: Session = Depends(get_db)):
    rows = db.query(models.Driver).filter(models.Driver.deleted_at.is_(None)).order_by(models.Driver.name).all()
    headers = [
        "Driver ID", "Name", "Date of Birth", "Date of Joining",
        "Contact Number", "Email", "Address",
        "Aadhaar Number", "License Number", "License Expiry Date",
        "Form 11", "ESI Number", "PAN Number", "Agreement Signed",
        "Bank Name", "Bank Branch", "Account Number", "IFSC Code",
        "Username",
    ]
    data = [
        [
            r.driver_id, r.name, r.date_of_birth, r.date_of_joining,
            r.contact_number, r.email, r.address,
            r.aadhaar_number, r.license_number, r.license_expiry_date,
            r.form_11, r.esi_number, r.pan_number, r.agreement_signed,
            r.bank_name, r.bank_branch_name, r.account_number, r.ifsc_code,
            r.username,
        ]
        for r in rows
    ]
    return build_excel_response([("Drivers", headers, data)], "drivers.xlsx")


@router.get("/staff")
def export_staff(db: Session = Depends(get_db)):
    rows = db.query(models.Staff).order_by(models.Staff.name).all()
    headers = [
        "Staff ID", "Name", "Department", "Designation", "Software Designation",
        "Date of Birth", "Date of Joining", "Contact Number", "Email",
        "Address", "Branch", "Aadhar Number", "Username",
    ]
    data = [
        [
            r.staff_id, r.name, r.department, r.designation, r.software_designation,
            r.date_of_birth, r.date_of_joining, r.contact_number, r.email,
            r.address, r.branch, r.aadhar_number, r.username,
        ]
        for r in rows
    ]
    return build_excel_response([("Staff", headers, data)], "staff.xlsx")


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


@router.get("/vendors")
def export_vendors(db: Session = Depends(get_db)):
    rows = db.query(models.Vendor).order_by(models.Vendor.name).all()
    headers = ["Name", "Category", "Contact Number", "GSTIN", "PAN", "Email", "Address", "Status"]
    data = [[r.name, r.category, r.contact_number, r.gstin, r.pan, r.email, r.address, r.status] for r in rows]
    return build_excel_response([("Vendors", headers, data)], "vendors.xlsx")


@router.get("/customers")
def export_customers(db: Session = Depends(get_db)):
    customers = db.query(models.Customer).order_by(models.Customer.name).all()
    customer_map = {c.id: c.name for c in customers}

    cust_headers = [
        "Name", "GSTIN", "Contact Person", "Phone", "Email",
        "Address", "Customer Type", "Is GTA", "Applicable for E-Invoice",
    ]
    cust_data = [
        [r.name, r.gstin, r.contact_personnel_name, r.phone, r.email,
         r.address, r.customer_type, r.is_gta, r.applicable_for_e_invoice]
        for r in customers
    ]

    destinations = db.query(models.CustomerDestination).all()
    dest_headers = ["Customer", "Destination Name", "Destination State", "Destination Address", "Status"]
    dest_data = [
        [customer_map.get(r.customer_id, ""), r.destination_name, r.destination_state, r.destination_address, r.status]
        for r in destinations
    ]

    # Cargo / container / weight live on the linked destination row (a price is matched
    # to a specific CustomerDestination), not on the pricing row itself.
    dest_by_id = {d.id: d for d in destinations}
    pricing = db.query(models.CustomerPricing).all()
    pricing_headers = ["Customer", "Destination", "Cargo Classification", "Container Type", "Weight", "Rate", "Status"]
    pricing_data = []
    for r in pricing:
        d = dest_by_id.get(r.customer_destination_id)
        pricing_data.append([
            customer_map.get(r.customer_id, ""), r.customer_destination,
            d.cargo_classification if d else "", d.container_type if d else "", d.weight_in_tons if d else "",
            r.rate, r.status,
        ])

    return build_excel_response(
        [
            ("Customer List", cust_headers, cust_data),
            ("Destinations", dest_headers, dest_data),
            ("Pricing", pricing_headers, pricing_data),
        ],
        "customers.xlsx",
    )


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------

@router.get("/trips")
def export_trips(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive, filters by scheduled date)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive, filters by scheduled date)"),
    status: Optional[str] = Query(None, description="Comma-separated trip statuses to keep, e.g. 'Assigned' — lets a page export just the trips it lists"),
    has_closure: Optional[bool] = Query(None, description="true = only trips with a booking-sheet closure, false = only trips without one"),
    is_invoiced: Optional[bool] = Query(None, description="true = only invoiced trips, false = only trips not yet invoiced"),
    invoice_waived: Optional[bool] = Query(None, description="true = only trips whose invoice was waived, false = only trips not waived"),
    db: Session = Depends(get_db),
):
    q = db.query(models.Trip)
    if invoice_waived is not None:
        q = q.filter(models.Trip.invoice_waived.is_(invoice_waived))
    if is_invoiced is not None:
        q = q.filter(models.Trip.is_invoiced.is_(is_invoiced))
    if has_closure is not None:
        q = q.filter(models.Trip.closure.has() if has_closure else ~models.Trip.closure.has())
    if status:
        wanted = [x.strip() for x in status.split(",") if x.strip()]
        # A status-scoped export mirrors a page's list, which never shows deleted trips.
        q = q.filter(models.Trip.status.in_(wanted), models.Trip.deleted_at.is_(None))
    if from_date:
        q = q.filter(models.Trip.scheduled_date >= from_date)
    if to_date:
        q = q.filter(models.Trip.scheduled_date <= to_date)
    trips = q.order_by(models.Trip.booking_created_date.desc()).all()
    customer_map = {c.id: c.name for c in db.query(models.Customer).all()}
    driver_map = {d.driver_id: d.name for d in db.query(models.Driver).all()}
    truck_map = {t.truck_id: t.registration_number for t in db.query(models.Truck).all()}

    headers = [
        "Trip ID", "Status", "Booking Reference No", "Booking Created Date",
        "Scheduled Date", "Assigned Date", "Trip Category", "Movement Category",
        "Customer", "Shipper / Consignee", "Cargo Classification", "Container Specification",
        "Container Number", "Cargo Weight", "Origin", "Destination",
        "Shipping Line", "Vessel Name", "Transport Method",
        "Driver ID", "Driver Name", "Vehicle ID", "Registration Number",
        "Bill To", "Payment Type",
        "Customer Cash Advance", "Customer Fuel Advance (Amount)", "Customer Fuel Advance (Litres)",
        "Driver Advance Amount", "Driver Compensation Type",
        "Rate Per Ton", "Transport Hire Amount", "Transport Crossing Amount",
        "Internal Remarks", "Booking Instructions",
        "Verification Status", "Is Invoiced", "Invoice Required",
        "Trip Sheet Collected", "Trip Sheet Received", "Trip Sheet Received Date"
    ]
    data = [
        [
            t.trip_id, t.status, t.booking_reference_no, t.booking_created_date,
            t.scheduled_date, t.assigned_date, t.trip_category, t.movement_category,
            customer_map.get(t.customer_id, ""), t.shipper_consignee,
            t.cargo_classification, t.container_specification,
            t.container_number, t.cargo_weight, t.origin, t.destination,
            t.shipping_line, t.vessel_name, t.transport_method,
            t.driver_id, driver_map.get(t.driver_id, ""),
            t.vehicle_id, truck_map.get(t.vehicle_id, ""),
            t.bill_to, t.payment_type,
            t.customer_cash_advance, t.customer_fuel_advance_amount, t.customer_fuel_advance_litres,
            t.driver_advance_amount, t.driver_compensation_type,
            t.rate_per_ton, t.transport_hire_amount, t.transport_crossing_amount,
            t.internal_remarks, t.booking_instructions,
            t.verification_status,
            "Yes" if t.is_invoiced else "No",
            "Yes" if t.invoice_required else "No",
            "Yes" if t.trip_sheet_collected else "No",
            "Yes" if t.trip_sheet_received else "No",
            t.trip_sheet_received_at.strftime("%d-%m-%Y %H:%M:%S") if t.trip_sheet_received_at else "",
        ]
        for t in trips
    ]
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Trips", headers, data)], f"trips{suffix}.xlsx")


@router.get("/driver-assignments")
def export_driver_assignments(db: Session = Depends(get_db)):
    assignments = (
        db.query(models.DriverAssignment)
        .join(models.Driver, models.Driver.driver_id == models.DriverAssignment.driver_id)
        .order_by(models.Driver.name)
        .all()
    )
    truck_map = {t.truck_id: t.registration_number for t in db.query(models.Truck).all()}
    headers = ["Driver ID", "Driver Name", "Vehicle ID", "Assigned Vehicle Number"]
    data = [
        [a.driver_id, a.driver.name if a.driver else "", a.vehicle_id, truck_map.get(a.vehicle_id, "")]
        for a in assignments
    ]
    return build_excel_response([("Driver Assignments", headers, data)], "driver_assignments.xlsx")


# ---------------------------------------------------------------------------
# Attendance & HR
# ---------------------------------------------------------------------------

@router.get("/driver-attendance")
def export_driver_attendance(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.DriverAttendance)
        .join(models.Driver, models.Driver.driver_id == models.DriverAttendance.driver_id)
    )
    if from_date:
        q = q.filter(models.DriverAttendance.date >= from_date)
    if to_date:
        q = q.filter(models.DriverAttendance.date <= to_date)
    records = q.order_by(models.DriverAttendance.date.asc(), models.Driver.name).all()
    headers = ["Driver ID", "Driver Name", "Date", "Status", "Check In Time"]
    data = [
        [r.driver_id, r.driver.name if r.driver else "", r.date, r.status, r.check_in_time]
        for r in records
    ]
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Driver Attendance", headers, data)], f"driver_attendance{suffix}.xlsx")


@router.get("/staff-attendance")
def export_staff_attendance(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.StaffAttendance)
        .join(models.Staff, models.Staff.id == models.StaffAttendance.staff_id)
    )
    if from_date:
        q = q.filter(models.StaffAttendance.date >= from_date)
    if to_date:
        q = q.filter(models.StaffAttendance.date <= to_date)
    records = q.order_by(models.StaffAttendance.date.asc(), models.Staff.name).all()
    headers = ["Staff ID", "Staff Name", "Date", "Status", "Check In Time", "Source"]
    data = [
        [r.staff.staff_id if r.staff else "", r.staff.name if r.staff else "",
         r.date, r.status, r.check_in_time, r.source]
        for r in records
    ]
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Staff Attendance", headers, data)], f"staff_attendance{suffix}.xlsx")


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

@router.get("/emi")
def export_emi(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD — keeps EMIs still running on/after this date"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD — keeps EMIs that had started on/before this date"),
    db: Session = Depends(get_db),
):
    q = db.query(models.EmiRecord)
    # An EMI is in range when its tenure overlaps [from_date, to_date]; a missing
    # start/end date is treated as open-ended rather than excluded.
    if from_date:
        q = q.filter((models.EmiRecord.emi_end_date.is_(None)) | (models.EmiRecord.emi_end_date >= from_date))
    if to_date:
        q = q.filter((models.EmiRecord.emi_start_date.is_(None)) | (models.EmiRecord.emi_start_date <= to_date))
    rows = q.order_by(models.EmiRecord.emi_name).all()
    live = _live_emi_figures(db, rows)
    headers = [
        "EMI Name", "Truck Registration", "Bank Name",
        "EMI Amount", "Amount Paid", "Remaining EMI Payable", "Tenure (Months)", "Cost Per Month",
        "Monthly Finance Cost", "Daily Finance Cost", "EMI Cost Per KM",
        "EMI Start Date", "EMI End Date", "Auto-Debit Date",
    ]
    data = []
    for r in rows:
        amount_paid, remaining, daily_finance_cost, emi_cost_per_km = live[r.id]
        data.append([
            r.emi_name, r.truck_registration, r.bank_name,
            r.emi_amount, amount_paid, remaining, r.tenure_months, r.cost_per_month,
            r.monthly_finance_cost, daily_finance_cost, emi_cost_per_km,
            r.emi_start_date, r.emi_end_date, r.auto_debit_date,
        ])
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("EMI Records", headers, data)], f"emi_records{suffix}.xlsx")


@router.get("/recurring-payments")
def export_recurring_payments(db: Session = Depends(get_db)):
    rows = db.query(models.RecurringPayment).order_by(models.RecurringPayment.title).all()
    headers = ["Title", "Category", "Amount", "Frequency", "Next Due Date", "Status"]
    data = [[r.title, r.category, r.amount, r.frequency, r.next_due_date, r.status] for r in rows]
    return build_excel_response([("Recurring Payments", headers, data)], "recurring_payments.xlsx")


@router.get("/driver-compensation")
def export_driver_compensation(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    try:
        start = date.fromisoformat(from_date) if from_date else None
        end = date.fromisoformat(to_date) if to_date else None
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD.")
    q = db.query(models.CompensationTransaction).filter(models.CompensationTransaction.person_type == "driver")
    if start:
        q = q.filter(models.CompensationTransaction.date >= start)
    if end:
        q = q.filter(models.CompensationTransaction.date <= end)
    records = q.order_by(models.CompensationTransaction.date.desc(), models.CompensationTransaction.id.desc()).all()
    driver_map = {d.id: (d.driver_id, d.name) for d in db.query(models.Driver).all()}
    headers = ["Driver ID", "Driver Name", "Type", "Amount", "Date", "Note", "Trip Number"]
    data = [
        [
            driver_map.get(r.person_id, ("", ""))[0],
            driver_map.get(r.person_id, ("", ""))[1],
            r.type, r.amount, r.date, r.note, r.trip_number,
        ]
        for r in records
    ]
    suffix = f"_{from_date or ''}_to_{to_date or ''}" if from_date or to_date else ""
    return build_excel_response([("Driver Compensation", headers, data)], f"driver_compensation{suffix}.xlsx")


@router.get("/staff-compensation")
def export_staff_compensation(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    try:
        start = date.fromisoformat(from_date) if from_date else None
        end = date.fromisoformat(to_date) if to_date else None
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD.")
    q = db.query(models.CompensationTransaction).filter(models.CompensationTransaction.person_type == "staff")
    if start:
        q = q.filter(models.CompensationTransaction.date >= start)
    if end:
        q = q.filter(models.CompensationTransaction.date <= end)
    records = q.order_by(models.CompensationTransaction.date.desc(), models.CompensationTransaction.id.desc()).all()
    staff_map = {s.id: (s.staff_id, s.name) for s in db.query(models.Staff).all()}
    headers = ["Staff ID", "Staff Name", "Type", "Amount", "Date", "Note", "Trip Number"]
    data = [
        [
            staff_map.get(r.person_id, ("", ""))[0],
            staff_map.get(r.person_id, ("", ""))[1],
            r.type, r.amount, r.date, r.note, r.trip_number,
        ]
        for r in records
    ]
    suffix = f"_{from_date or ''}_to_{to_date or ''}" if from_date or to_date else ""
    return build_excel_response([("Staff Compensation", headers, data)], f"staff_compensation{suffix}.xlsx")


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

@router.get("/maintenance-records")
def export_maintenance_records(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.MaintenanceRecord)
        .join(models.Truck, models.Truck.id == models.MaintenanceRecord.truck_id)
    )
    if from_date:
        q = q.filter(models.MaintenanceRecord.date >= from_date)
    if to_date:
        q = q.filter(models.MaintenanceRecord.date <= to_date)
    records = q.order_by(models.MaintenanceRecord.date.desc()).all()
    headers = ["Truck ID", "Registration Number", "Date", "Odometer", "Maintenance Type", "Description", "Cost"]
    data = [
        [r.truck.truck_id, r.truck.registration_number, r.date, r.odometer, r.maintenance_type, r.description, r.cost]
        for r in records
    ]
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Maintenance Records", headers, data)], f"maintenance_records{suffix}.xlsx")


@router.get("/tyre-inventory")
def export_tyre_inventory(
    from_date: Optional[str] = Query(None, description="Purchase date range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Purchase date range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    q = db.query(models.TyreInventory)
    if from_date:
        q = q.filter(models.TyreInventory.purchase_date >= from_date)
    if to_date:
        q = q.filter(models.TyreInventory.purchase_date <= to_date)
    rows = q.order_by(models.TyreInventory.brand).all()
    headers = [
        "Brand", "Tyre Type", "Tyre Number", "Size", "Range (KM)",
        "Cost", "Purchase Date", "Retread Cost", "Retread Count",
    ]
    data = [
        [r.brand, r.tyre_type, r.tyre_number, r.size, r.range_km,
         r.cost, r.purchase_date, r.retread_cost, r.retread_count]
        for r in rows
    ]
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Tyre Inventory", headers, data)], f"tyre_inventory{suffix}.xlsx")


@router.get("/fuel-logs")
def export_fuel_logs(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.FuelLog)
        .join(models.Truck, models.Truck.id == models.FuelLog.truck_id)
    )
    if from_date:
        q = q.filter(models.FuelLog.date >= from_date)
    if to_date:
        q = q.filter(models.FuelLog.date <= to_date)
    records = q.order_by(models.FuelLog.date.desc()).all()
    headers = [
        "Truck ID", "Registration Number", "Date", "Odometer",
        "Litres", "Price Per Litre", "Total Cost",
        "Distance (KM)", "Mileage", "Fuel Station", "Logged By",
    ]
    data = [
        [r.truck.truck_id, r.truck.registration_number, r.date, r.odometer,
         r.litres, r.price_per_litre, r.total_cost,
         r.distance, r.mileage, r.fuel_station, r.logged_by]
        for r in records
    ]
    suffix = f"_{from_date}_to_{to_date}" if from_date or to_date else ""
    return build_excel_response([("Fuel Logs", headers, data)], f"fuel_logs{suffix}.xlsx")


@router.get("/truck-run-records")
def export_truck_run_records(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive, on the trip's assigned date)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive, on the trip's assigned date)"),
    db: Session = Depends(get_db),
):
    """Truck Run Record page: every live trip per truck with its actual run distance
    (trip sheet total km), plus a per-truck distance breakdown. Mirrors the page's
    View Record / View Breakdown dialogs (trips matched on trip.vehicle_id == truck.truck_id)."""
    try:
        start = date.fromisoformat(from_date) if from_date else None
        end = date.fromisoformat(to_date) if to_date else None
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD.")
    q = (
        db.query(models.Trip)
        .options(joinedload(models.Trip.sheet))
        .filter(models.Trip.deleted_at.is_(None))
    )
    if start:
        q = q.filter(models.Trip.assigned_date >= start)
    if end:
        q = q.filter(models.Trip.assigned_date <= end)
    trips_by_vehicle = {}
    for tr in q.order_by(models.Trip.assigned_date.desc(), models.Trip.id.desc()).all():
        trips_by_vehicle.setdefault(tr.vehicle_id, []).append(tr)

    today = date.today()
    run_rows, breakdown_rows = [], []
    for truck in db.query(models.Truck).filter(models.Truck.deleted_at.is_(None)).order_by(models.Truck.truck_id).all():
        trips = trips_by_vehicle.get(truck.truck_id, [])
        kms = []
        for tr in trips:
            km = float(tr.sheet.total_km) if tr.sheet and tr.sheet.total_km else 0.0
            run_rows.append([
                truck.truck_id, truck.registration_number, tr.trip_id,
                tr.assigned_date.isoformat() if tr.assigned_date else "",
                tr.origin or "", tr.destination or "", km if km > 0 else "",
            ])
            if km > 0:
                kms.append(km)
        total = sum(kms)
        dates = [tr.assigned_date for tr in trips if tr.assigned_date]
        if dates:
            e = min(dates)
            months = max(1, (today.year - e.year) * 12 + (today.month - e.month) + 1)
        else:
            months = 1
        monthly = total / months
        breakdown_rows.append([
            truck.truck_id, truck.registration_number, truck.manufacturer, truck.model_name,
            len(trips), len(kms), round(total, 1), months, round(monthly, 1), round(monthly / 26, 1),
            round(total / len(kms), 1) if kms else 0, max(kms) if kms else 0, min(kms) if kms else 0,
        ])

    run_headers = ["Truck ID", "Registration Number", "Trip ID", "Assigned Date", "From", "To", "Total Distance (KM)"]
    bd_headers = [
        "Truck ID", "Registration Number", "Manufacturer", "Model", "Total Trips", "Trips With Distance",
        "Total Distance (KM)", "Months Spanned", "Monthly Avg (KM)", "Daily Avg (KM)",
        "Avg Per Trip (KM)", "Longest Trip (KM)", "Shortest Trip (KM)",
    ]
    suffix = f"_{from_date or ''}_to_{to_date or ''}" if from_date or to_date else ""
    return build_excel_response(
        [("Run Record", run_headers, run_rows), ("Breakdown", bd_headers, breakdown_rows)],
        f"truck_run_records{suffix}.xlsx",
    )


@router.get("/air-filter-records")
def export_air_filter_records(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive, on the change date)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive, on the change date)"),
    db: Session = Depends(get_db),
):
    """Air Filter R&R page: one row per air filter change. "Due In (KM)" is derived
    from the truck's live odometer and only shown on each truck's latest change
    (negative = overdue), matching the page's alerts."""
    try:
        start = date.fromisoformat(from_date) if from_date else None
        end = date.fromisoformat(to_date) if to_date else None
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD.")
    latest_by_truck = {}
    for tid, d in (
        db.query(models.AirFilterRecord.truck_id, func.max(models.AirFilterRecord.date))
        .group_by(models.AirFilterRecord.truck_id)
        .all()
    ):
        latest_by_truck[tid] = d
    q = db.query(models.AirFilterRecord).join(models.Truck, models.Truck.id == models.AirFilterRecord.truck_id)
    if start:
        q = q.filter(models.AirFilterRecord.date >= start)
    if end:
        q = q.filter(models.AirFilterRecord.date <= end)
    records = q.order_by(models.AirFilterRecord.date.desc(), models.AirFilterRecord.id.desc()).all()
    headers = [
        "Truck ID", "Registration Number", "Manufacturer", "Model", "Change Date",
        "Odometer During Change", "Next Change Odometer", "Current Odometer", "Due In (KM)",
        "Remarks", "Logged By",
    ]
    seen = set()
    data = []
    for r in records:
        first_for_truck = r.truck_id not in seen
        seen.add(r.truck_id)
        # Latest change per truck across ALL history, so a date filter can't make an
        # older change look "current".
        is_latest = first_for_truck and latest_by_truck.get(r.truck_id) == r.date
        current = float(r.truck.odometer or 0)
        data.append([
            r.truck.truck_id, r.truck.registration_number, r.truck.manufacturer, r.truck.model_name,
            r.date.isoformat(), r.odometer_during_change, r.next_change_odometer,
            current if is_latest else "", (r.next_change_odometer - current) if is_latest else "",
            r.remarks or "", r.entered_by_name or "",
        ])
    suffix = f"_{from_date or ''}_to_{to_date or ''}" if from_date or to_date else ""
    return build_excel_response([("Air Filter R&R", headers, data)], f"air_filter_records{suffix}.xlsx")


@router.get("/customer-profitability")
def export_customer_profitability(db: Session = Depends(get_db)):
    """Customer Profitability Analytics page: one row per customer plus a route-level
    breakdown. Built from the very same aggregation the page uses (completed trips with
    a trip sheet; revenue = hire - commission), so the file always matches the screen."""
    from routers.trips import get_customer_profitability

    customers = get_customer_profitability(db)
    cust_headers = [
        "Rank", "Customer", "Trips", "Revenue", "Expenses", "Net Profit",
        "Margin (%)", "Total KM", "Routes",
    ]
    cust_rows = [
        [i, c["customer_name"], c["trip_count"], c["total_revenue"], c["total_expense"],
         c["total_profit"], c["profit_margin_pct"], c["total_km"], len(c["routes"])]
        for i, c in enumerate(customers, start=1)
    ]
    route_headers = [
        "Customer", "Route", "Trips", "Revenue", "Expenses", "Profit", "Margin (%)", "Avg KM",
    ]
    route_rows = [
        [c["customer_name"], r["route"], r["trip_count"], r["revenue"], r["expense"],
         r["profit"], r["margin_pct"], r["avg_km"]]
        for c in customers for r in c["routes"]
    ]
    return build_excel_response(
        [("Customers", cust_headers, cust_rows), ("Routes", route_headers, route_rows)],
        "customer_profitability.xlsx",
    )


@router.get("/adblue-logs")
def export_adblue_logs(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    try:
        start = date.fromisoformat(from_date) if from_date else None
        end = date.fromisoformat(to_date) if to_date else None
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD.")
    q = db.query(models.AdBlueLog).join(models.Truck, models.Truck.id == models.AdBlueLog.truck_id)
    if start:
        q = q.filter(models.AdBlueLog.date >= start)
    if end:
        q = q.filter(models.AdBlueLog.date <= end)
    records = q.order_by(models.AdBlueLog.date.desc(), models.AdBlueLog.id.desc()).all()
    headers = [
        "Truck ID", "Registration Number", "Manufacturer", "Date", "Odometer",
        "Litres", "Price Per Litre", "Total Cost", "Supplier", "Remarks", "Logged By",
    ]
    data = [
        [r.truck.truck_id, r.truck.registration_number, r.truck.manufacturer, r.date.isoformat(), r.odometer,
         r.litres, r.price_per_litre, r.total_cost, r.supplier or "", r.remarks or "", r.entered_by_name or ""]
        for r in records
    ]
    suffix = f"_{from_date or ''}_to_{to_date or ''}" if from_date or to_date else ""
    return build_excel_response([("AdBlue Logs", headers, data)], f"adblue_logs{suffix}.xlsx")
