from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
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

    # Aggregate counts via SQL — avoid loading full rows into Python
    active_trips    = db.query(func.count(models.Trip.id)).filter(models.Trip.status.in_(ACTIVE_TRIP_STATUSES)).scalar() or 0
    total_trips     = db.query(func.count(models.Trip.id)).scalar() or 0
    total_drivers   = db.query(func.count(models.Driver.id)).scalar() or 0
    total_staff     = db.query(func.count(models.Staff.id)).scalar() or 0
    pending_leave   = db.query(func.count(models.LeaveRequest.id)).filter(models.LeaveRequest.status == "Pending").scalar() or 0
    active_recurring = db.query(func.count(models.RecurringPayment.id)).filter(models.RecurringPayment.status == "Active").scalar() or 0

    trip_status_counts = dict(
        db.query(models.Trip.status, func.count(models.Trip.id))
          .group_by(models.Trip.status)
          .all()
    )

    # Completed trips that have NOT yet been closed — matches the Completed Trips page filter
    completed_pending_closure = (
        db.query(func.count(models.Trip.id))
          .outerjoin(models.TripClosure, models.TripClosure.trip_id == models.Trip.id)
          .filter(models.Trip.status == "Completed", models.TripClosure.id.is_(None))
          .scalar() or 0
    )

    monthly_emi_total = float(
        db.query(func.coalesce(func.sum(models.EmiRecord.emi_amount), 0)).scalar() or 0
    )

    # Single aggregate query: max odometer per (truck_id, maintenance_type)
    maint_agg = {
        (row.truck_id, row.maintenance_type): int(row.last_km or 0)
        for row in db.query(
            models.MaintenanceRecord.truck_id,
            models.MaintenanceRecord.maintenance_type,
            func.max(models.MaintenanceRecord.odometer).label("last_km"),
        ).group_by(
            models.MaintenanceRecord.truck_id,
            models.MaintenanceRecord.maintenance_type,
        ).all()
    }

    maintenance_alerts = 0
    compliance_expired = 0
    compliance_expiring_soon = 0

    for truck in trucks:
        current_km = int(truck.odometer or 0)

        # Maintenance alerts — O(trucks × items), dict lookup instead of list scan
        for group in MAINTENANCE_SCHEDULE:
            for item in group["items"]:
                last_km = maint_agg.get((truck.id, item), 0)
                if (last_km + group["interval_km"]) - current_km <= 0:
                    maintenance_alerts += 1

        # Compliance
        for expiry_date in [
            truck.fc_expiry_date,
            truck.road_tax_date,
            truck.national_permit_date,
            truck.pollution_certificate_date,
        ]:
            status = _compliance_status(expiry_date)
            if status == "Expired":
                compliance_expired += 1
            elif status == "Expiring Soon":
                compliance_expiring_soon += 1

    return {
        "total_trucks": len(trucks),
        "active_trips": active_trips,
        "total_trips": total_trips,
        "trip_status_counts": trip_status_counts,
        "completed_pending_closure": completed_pending_closure,
        "total_drivers": total_drivers,
        "total_staff": total_staff,
        "pending_leave_requests": pending_leave,
        "maintenance_alerts": maintenance_alerts,
        "compliance_expired": compliance_expired,
        "compliance_expiring_soon": compliance_expiring_soon,
        "monthly_emi_total": monthly_emi_total,
        "active_recurring_payments": active_recurring,
        "today": str(today),
    }


@router.get("/trips-overview")
def get_trips_overview(db: Session = Depends(get_db)):
    """Lightweight trip summary used by the Trip Status card on every role dashboard."""
    trips = (
        db.query(models.Trip)
        .filter(models.Trip.status.in_(ACTIVE_TRIP_STATUSES | {"Completed"}))
        .order_by(models.Trip.scheduled_date.desc())
        .all()
    )

    driver_names = {
        d.driver_id: d.name
        for d in db.query(models.Driver.driver_id, models.Driver.name).all()
    }
    truck_regs = {
        t.truck_id: t.registration_number
        for t in db.query(models.Truck.truck_id, models.Truck.registration_number).all()
    }

    def _row(t):
        return {
            "trip_id": t.trip_id,
            "status": t.status,
            "origin": t.origin,
            "destination": t.destination,
            "scheduled_date": str(t.scheduled_date) if t.scheduled_date else None,
            "truck_registration": truck_regs.get(t.vehicle_id),
            "driver_name": driver_names.get(t.driver_id),
        }

    current = [_row(t) for t in trips if t.status in ACTIVE_TRIP_STATUSES]
    completed_all = [_row(t) for t in trips if t.status == "Completed"]
    pending_invoice = [_row(t) for t in trips if t.status == "Completed" and not t.is_invoiced]

    return {
        "current_trips": current,
        "completed_trips": completed_all,
        "pending_invoice_trips": pending_invoice,
    }
