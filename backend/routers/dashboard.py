from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ACTIVE_TRIP_STATUSES = {"Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"}
EXPIRING_SOON_DAYS = 30
UPCOMING_WINDOW_KM = 1000

MAINTENANCE_SCHEDULE = [
    {"interval_km": 10000, "items": [
        "Brake inspection", "Steering inspection", "Greasing",
        "Air filter cleaning", "Transmission oil check", "Differential oil check",
    ]},
    {"interval_km": 20000, "items": [
        "Engine oil change", "Oil filter replacement",
        "Fuel filter inspection/replacement", "Clutch inspection",
    ]},
    {"interval_km": 40000, "items": [
        "Fuel filter replacement", "Air filter replacement", "Complete brake inspection",
    ]},
    {"interval_km": 80000, "items": [
        "Transmission oil replacement", "Differential oil replacement",
        "Full drivetrain inspection", "Suspension inspection",
    ]},
]


def _compliance_status(expiry_date) -> str:
    if not expiry_date:
        return "Expired"
    today = date.today()
    if expiry_date < today:
        return "Expired"
    if expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS):
        return "Expiring Soon"
    return "Valid"


@router.get("/overview")
def get_overview(db: Session = Depends(get_db)):
    today = date.today()

    trucks = db.query(models.Truck).all()
    trips = db.query(models.Trip).all()
    drivers = db.query(models.Driver).all()
    staff_list = db.query(models.Staff).all()
    maintenance_records = db.query(models.MaintenanceRecord).all()
    emi_records = db.query(models.EmiRecord).all()
    recurring = db.query(models.RecurringPayment).all()

    active_trips = sum(1 for t in trips if t.status in ACTIVE_TRIP_STATUSES)

    pending_leave = db.query(models.LeaveRequest).filter(models.LeaveRequest.status == "Pending").count()

    # Maintenance alerts
    maintenance_alerts = 0
    for truck in trucks:
        current_odometer = int(truck.odometer or 0)
        for group in MAINTENANCE_SCHEDULE:
            for item in group["items"]:
                matching = [r for r in maintenance_records if r.truck_id == truck.id and r.maintenance_type == item]
                last_odometer = max((r.odometer for r in matching), default=0) if matching else 0
                remaining = (last_odometer + group["interval_km"]) - current_odometer
                if remaining <= 0:
                    maintenance_alerts += 1

    # Compliance
    compliance_expired = 0
    compliance_expiring_soon = 0
    for truck in trucks:
        for expiry_date in [truck.fc_expiry_date, truck.road_tax_date, truck.national_permit_date, truck.pollution_certificate_date]:
            status = _compliance_status(expiry_date)
            if status == "Expired":
                compliance_expired += 1
            elif status == "Expiring Soon":
                compliance_expiring_soon += 1

    monthly_emi_total = sum(float(r.emi_amount or 0) for r in emi_records)
    active_recurring = sum(1 for r in recurring if r.status == "Active")

    trip_status_counts = {}
    for t in trips:
        trip_status_counts[t.status] = trip_status_counts.get(t.status, 0) + 1

    return {
        "total_trucks": len(trucks),
        "active_trips": active_trips,
        "total_trips": len(trips),
        "trip_status_counts": trip_status_counts,
        "total_drivers": len(drivers),
        "total_staff": len(staff_list),
        "pending_leave_requests": pending_leave,
        "maintenance_alerts": maintenance_alerts,
        "compliance_expired": compliance_expired,
        "compliance_expiring_soon": compliance_expiring_soon,
        "monthly_emi_total": monthly_emi_total,
        "active_recurring_payments": active_recurring,
        "today": str(today),
    }
