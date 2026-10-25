"""A truck's current odometer (trucks.odometer) — the one place it moves.

It only ever goes UP on its own: a trip sheet's End KM advances it (also when
a trip with a sheet is moved to another truck). Going down — fixing a typo'd
End KM, or a truck that never had a real reading — is Admin's "Correct
Odometer" on Our Fleet (routers/trucks.py), which keeps a history.
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import maintenance_reminders


def advance(db: Session, truck: models.Truck, km) -> bool:
    """Move the truck's odometer up to `km` if that's higher. Bumps the truck's
    version so an Edit Truck form opened before this can't save the old
    reading back (it gets the usual "modified by someone else" 409).
    Doesn't commit."""
    try:
        km = int(float(km or 0))
    except (TypeError, ValueError):
        return False
    if km <= int(truck.odometer or 0):
        return False
    truck.odometer = km
    truck.version = (truck.version or 1) + 1
    maintenance_reminders.check_truck(db, truck)
    return True


def readings(db: Session, truck: models.Truck) -> dict:
    """Highest readings recorded against this truck elsewhere — shown when
    correcting the odometer, so a correction below them is a known choice."""
    sheet = (
        db.query(func.max(models.TripSheet.end_km))
        .join(models.Trip, models.TripSheet.trip_id == models.Trip.id)
        .filter(models.Trip.vehicle_id == truck.truck_id)
        .scalar()
    )
    maint = db.query(func.max(models.MaintenanceRecord.odometer)).filter(
        models.MaintenanceRecord.truck_id == truck.id).scalar()
    return {
        "max_trip_sheet_end_km": int(sheet) if sheet else None,
        "max_maintenance_odometer": int(maint) if maint else None,
    }
