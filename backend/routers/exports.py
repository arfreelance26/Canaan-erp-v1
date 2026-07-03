from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
import models
from excel_utils import rows_from_model, build_excel_response

router = APIRouter(prefix="/exports", tags=["Exports"])


def _single_sheet(db: Session, model, sheet_name: str, filename: str, order_by=None):
    headers, rows = rows_from_model(db, model, order_by=order_by)
    return build_excel_response([(sheet_name, headers, rows)], filename)


@router.get("/branches")
def export_branches(db: Session = Depends(get_db)):
    return _single_sheet(db, models.Branch, "Branches", "branches.xlsx", models.Branch.name)


@router.get("/repair-types")
def export_repair_types(db: Session = Depends(get_db)):
    return _single_sheet(db, models.RepairType, "Repair Types", "repair_types.xlsx", models.RepairType.name)


@router.get("/sac-codes")
def export_sac_codes(db: Session = Depends(get_db)):
    return _single_sheet(db, models.SacCode, "SAC Codes", "sac_codes.xlsx", models.SacCode.code)


@router.get("/drivers")
def export_drivers(db: Session = Depends(get_db)):
    return _single_sheet(db, models.Driver, "Drivers", "drivers.xlsx", models.Driver.name)


@router.get("/staff")
def export_staff(db: Session = Depends(get_db)):
    return _single_sheet(db, models.Staff, "Staff", "staff.xlsx", models.Staff.name)


@router.get("/trucks")
def export_trucks(db: Session = Depends(get_db)):
    return _single_sheet(db, models.Truck, "Fleet", "fleet.xlsx", models.Truck.truck_id)


@router.get("/vendors")
def export_vendors(db: Session = Depends(get_db)):
    return _single_sheet(db, models.Vendor, "Vendors", "vendors.xlsx", models.Vendor.name)


@router.get("/customers")
def export_customers(db: Session = Depends(get_db)):
    customer_headers, customer_rows = rows_from_model(db, models.Customer, order_by=models.Customer.name)
    dest_headers, dest_rows = rows_from_model(db, models.CustomerDestination)
    pricing_headers, pricing_rows = rows_from_model(db, models.CustomerPricing)
    return build_excel_response(
        [
            ("Customer List", customer_headers, customer_rows),
            ("Destinations", dest_headers, dest_rows),
            ("Pricing", pricing_headers, pricing_rows),
        ],
        "customers.xlsx",
    )


@router.get("/trips")
def export_trips(db: Session = Depends(get_db)):
    return _single_sheet(db, models.Trip, "Trips", "trips.xlsx", models.Trip.booking_created_date.desc())


@router.get("/driver-attendance")
def export_driver_attendance(db: Session = Depends(get_db)):
    return _single_sheet(db, models.DriverAttendance, "Driver Attendance", "driver_attendance.xlsx", models.DriverAttendance.date.desc())


@router.get("/staff-attendance")
def export_staff_attendance(db: Session = Depends(get_db)):
    return _single_sheet(db, models.StaffAttendance, "Staff Attendance", "staff_attendance.xlsx", models.StaffAttendance.date.desc())


@router.get("/leave-requests")
def export_leave_requests(db: Session = Depends(get_db)):
    return _single_sheet(db, models.LeaveRequest, "Leave Requests", "leave_requests.xlsx", models.LeaveRequest.applied_at.desc())


@router.get("/emi")
def export_emi(db: Session = Depends(get_db)):
    return _single_sheet(db, models.EmiRecord, "EMI Records", "emi_records.xlsx")


@router.get("/recurring-payments")
def export_recurring_payments(db: Session = Depends(get_db)):
    return _single_sheet(db, models.RecurringPayment, "Recurring Payments", "recurring_payments.xlsx")


@router.get("/maintenance-records")
def export_maintenance_records(db: Session = Depends(get_db)):
    return _single_sheet(db, models.MaintenanceRecord, "Maintenance Records", "maintenance_records.xlsx", models.MaintenanceRecord.date.desc())


@router.get("/tyre-inventory")
def export_tyre_inventory(db: Session = Depends(get_db)):
    return _single_sheet(db, models.TyreInventory, "Tyre Inventory", "tyre_inventory.xlsx")


@router.get("/fuel-logs")
def export_fuel_logs(db: Session = Depends(get_db)):
    return _single_sheet(db, models.FuelLog, "Fuel Logs", "fuel_logs.xlsx", models.FuelLog.date.desc())


@router.get("/driver-assignments")
def export_driver_assignments(db: Session = Depends(get_db)):
    return _single_sheet(db, models.DriverAssignment, "Driver Assignments", "driver_assignments.xlsx")


@router.get("/driver-compensation")
def export_driver_compensation(db: Session = Depends(get_db)):
    headers, rows = rows_from_model(db, models.CompensationTransaction, order_by=models.CompensationTransaction.date.desc())
    type_idx = [c.name for c in models.CompensationTransaction.__table__.columns].index("person_type")
    rows = [r for r in rows if r[type_idx] == "driver"]
    return build_excel_response([("Driver Compensation", headers, rows)], "driver_compensation.xlsx")


@router.get("/staff-compensation")
def export_staff_compensation(db: Session = Depends(get_db)):
    headers, rows = rows_from_model(db, models.CompensationTransaction, order_by=models.CompensationTransaction.date.desc())
    type_idx = [c.name for c in models.CompensationTransaction.__table__.columns].index("person_type")
    rows = [r for r in rows if r[type_idx] == "staff"]
    return build_excel_response([("Staff Compensation", headers, rows)], "staff_compensation.xlsx")
