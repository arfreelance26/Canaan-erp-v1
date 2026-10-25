"""Maintenance reminders — "Notify me when this is due again".

A maintenance record can carry a reminder odometer (remind_at_odometer). When
the truck's current odometer comes within REMIND_SOON_KM of it, the alert
roles get a "due soon" heads-up; when it reaches it, a "due now" alert. Each
fires once per reminder (remind_soon_sent_at / remind_due_sent_at) — nothing
else is tracked: a later record of the same type doesn't close it.

check_truck() runs wherever a truck's odometer goes up (odometer.advance —
trip sheet End KM — and Admin's Correct Odometer) and once over the whole
fleet at startup, in case one was missed.
"""
import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models

REMIND_SOON_KM = 500
ALERT_ROLES = "Admin,Commercial Manager,Assistant Commercial Manager,Maintenance"
EVENT_DUE = "maintenance_due"
EVENT_DUE_SOON = "maintenance_due_soon"


def set_reminder(record: models.MaintenanceRecord, truck: models.Truck | None, remind_at: int | None) -> None:
    """Validate and store a record's reminder odometer (None clears it). A
    changed target re-arms both alerts; when the truck is already inside the
    heads-up window the heads-up is skipped — the user just chose that km."""
    if remind_at is None:
        record.remind_at_odometer = None
        record.remind_soon_sent_at = None
        record.remind_due_sent_at = None
        return
    remind_at = int(remind_at)
    if record.remind_at_odometer == remind_at:
        return
    current = int(truck.odometer or 0) if truck else 0
    floor = max(current, int(record.odometer or 0))
    if remind_at <= floor:
        raise HTTPException(400, f"Reminder odometer ({remind_at:,} km) must be above the truck's current odometer ({floor:,} km).")
    record.remind_at_odometer = remind_at
    record.remind_due_sent_at = None
    record.remind_soon_sent_at = datetime.now(timezone.utc) if current >= remind_at - REMIND_SOON_KM else None


def _notify(db: Session, event: str, truck: models.Truck, record: models.MaintenanceRecord, current: int) -> None:
    reg = truck.registration_number or truck.truck_id
    target = int(record.remind_at_odometer)
    if event == EVENT_DUE:
        title = f"{reg} — {record.maintenance_type} is due"
    else:
        title = f"{reg} — {record.maintenance_type} due in {target - current:,} km"
    db.add(models.Notification(
        event_type=event,
        title=title,
        message=json.dumps({
            "truck_db_id": truck.id, "registration": reg,
            "maintenance_type": record.maintenance_type, "record_id": record.id,
            "record_odometer": int(record.odometer or 0), "remind_at": target, "odometer": current,
        }),
        target_roles=ALERT_ROLES,
        created_by="System",
        created_by_role="System",
    ))


def check_truck(db: Session, truck: models.Truck) -> int:
    """Raise any reminders this truck's current odometer has reached. Locks the
    pending rows so two workers can't both send the same alert. Doesn't commit."""
    current = int(truck.odometer or 0)
    if current <= 0 or truck.deleted_at is not None:   # removed / sold trucks stay quiet
        return 0
    pending = (
        db.query(models.MaintenanceRecord)
        .with_for_update()
        .filter(
            models.MaintenanceRecord.truck_id == truck.id,
            models.MaintenanceRecord.remind_at_odometer.isnot(None),
            models.MaintenanceRecord.remind_due_sent_at.is_(None),
            models.MaintenanceRecord.remind_at_odometer <= current + REMIND_SOON_KM,
        )
        .all()
    )
    now = datetime.now(timezone.utc)
    sent = 0
    for r in pending:
        if current >= r.remind_at_odometer:
            _notify(db, EVENT_DUE, truck, r, current)
            r.remind_due_sent_at = now
            r.remind_soon_sent_at = r.remind_soon_sent_at or now
            sent += 1
        elif r.remind_soon_sent_at is None:
            _notify(db, EVENT_DUE_SOON, truck, r, current)
            r.remind_soon_sent_at = now
            sent += 1
    return sent


def check_all(db: Session) -> int:
    truck_ids = {
        tid for (tid,) in db.query(models.MaintenanceRecord.truck_id).filter(
            models.MaintenanceRecord.remind_at_odometer.isnot(None),
            models.MaintenanceRecord.remind_due_sent_at.is_(None),
        ).distinct()
    }
    sent = 0
    for truck in db.query(models.Truck).filter(models.Truck.id.in_(truck_ids), models.Truck.deleted_at.is_(None)).all() if truck_ids else []:
        sent += check_truck(db, truck)
    return sent
