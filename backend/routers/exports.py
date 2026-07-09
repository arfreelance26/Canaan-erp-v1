from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
import models
from excel_utils import build_excel_response

router = APIRouter(prefix="/exports", tags=["Exports"])


# ---------------------------------------------------------------------------
# Administration
# ---------------------------------------------------------------------------

@router.get("/branches")
def export_branches(db: Session = Depends(get_db)):
    rows = db.query(models.Branch).order_by(models.Branch.name).all()
    headers = ["Branch Name", "Halt Day Fee (20ft)", "Halt Day Fee (40ft)", "Driver Halt Day %"]
    data = [[r.name, r.halt_day_fee_20ft, r.halt_day_fee_40ft, r.driver_halt_day_percentage] for r in rows]
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

@router.get("/drivers")
def export_drivers(db: Session = Depends(get_db)):
    rows = db.query(models.Driver).order_by(models.Driver.name).all()
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
def export_trucks(db: Session = Depends(get_db)):
    rows = db.query(models.Truck).order_by(models.Truck.truck_id).all()
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
    return build_excel_response([("Fleet", headers, data)], "fleet.xlsx")


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

    pricing = db.query(models.CustomerPricing).all()
    pricing_headers = ["Customer", "Destination", "Cargo Classification", "Container Type", "Weight", "Rate", "Status"]
    pricing_data = [
        [customer_map.get(r.customer_id, ""), r.customer_destination, r.cargo_classification,
         r.container_type, r.weight_in_tons, r.rate, r.status]
        for r in pricing
    ]

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
def export_trips(db: Session = Depends(get_db)):
    trips = db.query(models.Trip).order_by(models.Trip.booking_created_date.desc()).all()
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
    return build_excel_response([("Trips", headers, data)], "trips.xlsx")


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
def export_driver_attendance(db: Session = Depends(get_db)):
    records = (
        db.query(models.DriverAttendance)
        .join(models.Driver, models.Driver.driver_id == models.DriverAttendance.driver_id)
        .order_by(models.DriverAttendance.date.desc(), models.Driver.name)
        .all()
    )
    headers = ["Driver ID", "Driver Name", "Date", "Status", "Check In Time"]
    data = [
        [r.driver_id, r.driver.name if r.driver else "", r.date, r.status, r.check_in_time]
        for r in records
    ]
    return build_excel_response([("Driver Attendance", headers, data)], "driver_attendance.xlsx")


@router.get("/staff-attendance")
def export_staff_attendance(db: Session = Depends(get_db)):
    records = (
        db.query(models.StaffAttendance)
        .join(models.Staff, models.Staff.id == models.StaffAttendance.staff_id)
        .order_by(models.StaffAttendance.date.desc(), models.Staff.name)
        .all()
    )
    headers = ["Staff ID", "Staff Name", "Date", "Status", "Check In Time", "Source"]
    data = [
        [r.staff.staff_id if r.staff else "", r.staff.name if r.staff else "",
         r.date, r.status, r.check_in_time, r.source]
        for r in records
    ]
    return build_excel_response([("Staff Attendance", headers, data)], "staff_attendance.xlsx")


@router.get("/leave-requests")
def export_leave_requests(db: Session = Depends(get_db)):
    rows = db.query(models.LeaveRequest).order_by(models.LeaveRequest.applied_at.desc()).all()
    headers = ["Category", "Applicant Code", "Applicant Name", "From Date", "To Date", "Reason", "Status", "Applied At"]
    data = [
        [r.category, r.applicant_code, r.applicant_name, r.from_date, r.to_date, r.reason, r.status, r.applied_at]
        for r in rows
    ]
    return build_excel_response([("Leave Requests", headers, data)], "leave_requests.xlsx")


# ---------------------------------------------------------------------------
# Finance
# ---------------------------------------------------------------------------

@router.get("/emi")
def export_emi(db: Session = Depends(get_db)):
    rows = db.query(models.EmiRecord).order_by(models.EmiRecord.emi_name).all()
    headers = [
        "EMI Name", "Truck Registration", "Loan Number", "Bank Name",
        "Loan Amount", "EMI Amount", "Tenure (Months)", "Cost Per Month",
        "EMI Start Date", "EMI End Date", "EMI Payment Date",
    ]
    data = [
        [r.emi_name, r.truck_registration, r.loan_number, r.bank_name,
         r.loan_amount, r.emi_amount, r.tenure_months, r.cost_per_month,
         r.emi_start_date, r.emi_end_date, r.emi_payment_date]
        for r in rows
    ]
    return build_excel_response([("EMI Records", headers, data)], "emi_records.xlsx")


@router.get("/recurring-payments")
def export_recurring_payments(db: Session = Depends(get_db)):
    rows = db.query(models.RecurringPayment).order_by(models.RecurringPayment.title).all()
    headers = ["Title", "Category", "Amount", "Frequency", "Next Due Date", "Status"]
    data = [[r.title, r.category, r.amount, r.frequency, r.next_due_date, r.status] for r in rows]
    return build_excel_response([("Recurring Payments", headers, data)], "recurring_payments.xlsx")


@router.get("/driver-compensation")
def export_driver_compensation(db: Session = Depends(get_db)):
    records = (
        db.query(models.CompensationTransaction)
        .filter(models.CompensationTransaction.person_type == "driver")
        .order_by(models.CompensationTransaction.date.desc())
        .all()
    )
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
    return build_excel_response([("Driver Compensation", headers, data)], "driver_compensation.xlsx")


@router.get("/staff-compensation")
def export_staff_compensation(db: Session = Depends(get_db)):
    records = (
        db.query(models.CompensationTransaction)
        .filter(models.CompensationTransaction.person_type == "staff")
        .order_by(models.CompensationTransaction.date.desc())
        .all()
    )
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
    return build_excel_response([("Staff Compensation", headers, data)], "staff_compensation.xlsx")


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

@router.get("/maintenance-records")
def export_maintenance_records(db: Session = Depends(get_db)):
    records = (
        db.query(models.MaintenanceRecord)
        .join(models.Truck, models.Truck.id == models.MaintenanceRecord.truck_id)
        .order_by(models.MaintenanceRecord.date.desc())
        .all()
    )
    headers = ["Truck ID", "Registration Number", "Date", "Odometer", "Maintenance Type", "Description", "Cost"]
    data = [
        [r.truck.truck_id, r.truck.registration_number, r.date, r.odometer, r.maintenance_type, r.description, r.cost]
        for r in records
    ]
    return build_excel_response([("Maintenance Records", headers, data)], "maintenance_records.xlsx")


@router.get("/tyre-inventory")
def export_tyre_inventory(db: Session = Depends(get_db)):
    rows = db.query(models.TyreInventory).order_by(models.TyreInventory.brand).all()
    headers = [
        "Brand", "Tyre Type", "Tyre Number", "Size", "Range (KM)",
        "Cost", "Condition", "Purchase Date",
        "Repair Cost", "Retread Cost", "Retread Count",
    ]
    data = [
        [r.brand, r.tyre_type, r.tyre_number, r.size, r.range_km,
         r.cost, r.condition, r.purchase_date, r.repair_cost, r.retread_cost, r.retread_count]
        for r in rows
    ]
    return build_excel_response([("Tyre Inventory", headers, data)], "tyre_inventory.xlsx")


@router.get("/fuel-logs")
def export_fuel_logs(db: Session = Depends(get_db)):
    records = (
        db.query(models.FuelLog)
        .join(models.Truck, models.Truck.id == models.FuelLog.truck_id)
        .order_by(models.FuelLog.date.desc())
        .all()
    )
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
    return build_excel_response([("Fuel Logs", headers, data)], "fuel_logs.xlsx")
