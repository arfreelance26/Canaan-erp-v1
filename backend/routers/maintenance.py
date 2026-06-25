from typing import Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(tags=["Maintenance"])

MAINTENANCE_SCHEDULE = [
    {"category": "Service A", "interval_km": 10000, "items": [
        "Brake inspection", "Steering inspection", "Greasing",
        "Air filter cleaning", "Transmission oil check", "Differential oil check",
    ]},
    {"category": "Service B", "interval_km": 20000, "items": [
        "Engine oil change", "Oil filter replacement",
        "Fuel filter inspection/replacement", "Clutch inspection",
    ]},
    {"category": "Service C", "interval_km": 40000, "items": [
        "Fuel filter replacement", "Air filter replacement", "Complete brake inspection",
    ]},
    {"category": "Major Service", "interval_km": 80000, "items": [
        "Transmission oil replacement", "Differential oil replacement",
        "Full drivetrain inspection", "Suspension inspection",
    ]},
]

UPCOMING_WINDOW_KM = 1000
EXPIRING_SOON_DAYS = 30


def _compliance_status(expiry_date) -> str:
    if not expiry_date:
        return "Expired"
    today = date.today()
    if expiry_date < today:
        return "Expired"
    if expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS):
        return "Expiring Soon"
    return "Valid"


def _maintenance_status(truck: models.Truck, records: list) -> list:
    current_odometer = int(truck.odometer or 0)
    result = []
    for group in MAINTENANCE_SCHEDULE:
        for item in group["items"]:
            matching = sorted(
                [r for r in records if r.truck_id == truck.id and r.maintenance_type == item],
                key=lambda r: r.odometer,
                reverse=True,
            )
            last = matching[0] if matching else None
            last_odometer = last.odometer if last else 0
            due_at = last_odometer + group["interval_km"]
            remaining = due_at - current_odometer
            if remaining > UPCOMING_WINDOW_KM:
                continue
            result.append({
                "truck_id": truck.id,
                "registration_number": truck.registration_number,
                "category": group["category"],
                "item": item,
                "interval_km": group["interval_km"],
                "last_done_odometer": last_odometer if last else None,
                "last_done_date": str(last.date) if last else None,
                "due_at_odometer": due_at,
                "remaining_km": remaining,
                "status": "attention" if remaining <= 0 else "upcoming",
            })
    return sorted(result, key=lambda x: x["remaining_km"])


# ---------------------------------------------------------------------------
# Maintenance Records
# ---------------------------------------------------------------------------

@router.get("/maintenance/records", response_model=list[schemas.MaintenanceRecordOut], tags=["Maintenance"])
def list_maintenance_records(
    truck_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.MaintenanceRecord)
    if truck_id:
        q = q.filter(models.MaintenanceRecord.truck_id == truck_id)
    return q.order_by(models.MaintenanceRecord.date.desc()).all()


@router.post("/maintenance/records", response_model=schemas.MaintenanceRecordOut, status_code=201, tags=["Maintenance"])
def create_maintenance_record(payload: schemas.MaintenanceRecordCreate, db: Session = Depends(get_db)):
    if not db.get(models.Truck, payload.truck_id):
        raise HTTPException(404, "Truck not found")
    record = models.MaintenanceRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/maintenance/records/{record_id}", response_model=schemas.MaintenanceRecordOut, tags=["Maintenance"])
def update_maintenance_record(record_id: int, payload: schemas.MaintenanceRecordUpdate, db: Session = Depends(get_db)):
    record = db.get(models.MaintenanceRecord, record_id)
    if not record:
        raise HTTPException(404, "Maintenance record not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/maintenance/records/{record_id}", status_code=204, tags=["Maintenance"])
def delete_maintenance_record(record_id: int, db: Session = Depends(get_db)):
    record = db.get(models.MaintenanceRecord, record_id)
    if not record:
        raise HTTPException(404, "Maintenance record not found")
    db.delete(record)
    db.commit()


@router.get("/maintenance/status", tags=["Maintenance"])
def get_maintenance_status(db: Session = Depends(get_db)):
    trucks = db.query(models.Truck).all()
    records = db.query(models.MaintenanceRecord).all()
    return [item for truck in trucks for item in _maintenance_status(truck, records)]


# ---------------------------------------------------------------------------
# Compliance
# ---------------------------------------------------------------------------

@router.get("/maintenance/compliance", tags=["Maintenance"])
def get_compliance(db: Session = Depends(get_db)):
    trucks = db.query(models.Truck).all()
    result = []
    for truck in trucks:
        docs = [
            {"doc": "Fitness Certificate", "expiry": truck.fc_expiry_date},
            {"doc": "Road Tax", "expiry": truck.road_tax_date},
            {"doc": "National Permit", "expiry": truck.national_permit_date},
            {"doc": "Pollution Certificate", "expiry": truck.pollution_certificate_date},
            {"doc": "Insurance", "expiry": truck.insurance_expiry_date},
        ]
        for d in docs:
            result.append({
                "truck_id": truck.id,
                "registration_number": truck.registration_number,
                "document": d["doc"],
                "expiry_date": str(d["expiry"]) if d["expiry"] else None,
                "status": _compliance_status(d["expiry"]),
            })
    return result


# ---------------------------------------------------------------------------
# Fuel Logs
# ---------------------------------------------------------------------------

@router.get("/fuel-logs", response_model=list[schemas.FuelLogOut], tags=["Fuel Logs"])
def list_fuel_logs(truck_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    q = db.query(models.FuelLog)
    if truck_id:
        q = q.filter(models.FuelLog.truck_id == truck_id)
    return q.order_by(models.FuelLog.date.desc()).all()


@router.post("/fuel-logs", response_model=schemas.FuelLogOut, status_code=201, tags=["Fuel Logs"])
def create_fuel_log(payload: schemas.FuelLogCreate, db: Session = Depends(get_db)):
    if not db.get(models.Truck, payload.truck_id):
        raise HTTPException(404, "Truck not found")
    log = models.FuelLog(**payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.put("/fuel-logs/{log_id}", response_model=schemas.FuelLogOut, tags=["Fuel Logs"])
def update_fuel_log(log_id: int, payload: schemas.FuelLogUpdate, db: Session = Depends(get_db)):
    log = db.get(models.FuelLog, log_id)
    if not log:
        raise HTTPException(404, "Fuel log not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(log, field, value)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/fuel-logs/{log_id}", status_code=204, tags=["Fuel Logs"])
def delete_fuel_log(log_id: int, db: Session = Depends(get_db)):
    log = db.get(models.FuelLog, log_id)
    if not log:
        raise HTTPException(404, "Fuel log not found")
    db.delete(log)
    db.commit()


# ---------------------------------------------------------------------------
# Tyre Inventory
# ---------------------------------------------------------------------------

@router.get("/tyre-inventory", response_model=list[schemas.TyreInventoryOut], tags=["Tyre"])
def list_tyre_inventory(db: Session = Depends(get_db)):
    return db.query(models.TyreInventory).order_by(models.TyreInventory.brand).all()


@router.get("/tyre-inventory/available", response_model=list[schemas.TyreInventoryOut], tags=["Tyre"])
def available_tyres(db: Session = Depends(get_db)):
    fitted_ids = {
        r.tyre_id for r in db.query(models.TyreFitmentRecord).filter(models.TyreFitmentRecord.removed_odometer.is_(None)).all()
    }
    return db.query(models.TyreInventory).filter(models.TyreInventory.id.notin_(fitted_ids)).all()


@router.post("/tyre-inventory", response_model=schemas.TyreInventoryOut, status_code=201, tags=["Tyre"])
def create_tyre(payload: schemas.TyreInventoryCreate, db: Session = Depends(get_db)):
    if db.query(models.TyreInventory).filter(models.TyreInventory.tyre_number == payload.tyre_number).first():
        raise HTTPException(400, f"Tyre number {payload.tyre_number} already exists")
    tyre = models.TyreInventory(**payload.model_dump())
    db.add(tyre)
    db.commit()
    db.refresh(tyre)
    return tyre


@router.put("/tyre-inventory/{tyre_id}", response_model=schemas.TyreInventoryOut, tags=["Tyre"])
def update_tyre(tyre_id: int, payload: schemas.TyreInventoryUpdate, db: Session = Depends(get_db)):
    tyre = db.get(models.TyreInventory, tyre_id)
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(tyre, field, value)
    db.commit()
    db.refresh(tyre)
    return tyre


@router.delete("/tyre-inventory/{tyre_id}", status_code=204, tags=["Tyre"])
def delete_tyre(tyre_id: int, db: Session = Depends(get_db)):
    tyre = db.get(models.TyreInventory, tyre_id)
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    db.delete(tyre)
    db.commit()


@router.get("/tyre-inventory/{tyre_id}/history", response_model=list[schemas.TyreFitmentOut], tags=["Tyre"])
def tyre_fitment_history(tyre_id: int, db: Session = Depends(get_db)):
    if not db.get(models.TyreInventory, tyre_id):
        raise HTTPException(404, "Tyre not found")
    return db.query(models.TyreFitmentRecord).filter(
        models.TyreFitmentRecord.tyre_id == tyre_id
    ).order_by(models.TyreFitmentRecord.fitted_date.desc()).all()


# ---------------------------------------------------------------------------
# Tyre Fitment
# ---------------------------------------------------------------------------

@router.get("/tyre-fitment", response_model=list[schemas.TyreFitmentOut], tags=["Tyre"])
def list_fitments(truck_id: Optional[int] = Query(None), active_only: bool = Query(False), db: Session = Depends(get_db)):
    q = db.query(models.TyreFitmentRecord)
    if truck_id:
        q = q.filter(models.TyreFitmentRecord.truck_id == truck_id)
    if active_only:
        q = q.filter(models.TyreFitmentRecord.removed_odometer.is_(None))
    return q.all()


@router.post("/tyre-fitment", response_model=schemas.TyreFitmentOut, status_code=201, tags=["Tyre"])
def fit_tyre(payload: schemas.TyreFitmentCreate, db: Session = Depends(get_db)):
    # Ensure tyre is not already fitted elsewhere
    active = db.query(models.TyreFitmentRecord).filter(
        models.TyreFitmentRecord.tyre_id == payload.tyre_id,
        models.TyreFitmentRecord.removed_odometer.is_(None),
    ).first()
    if active:
        raise HTTPException(400, "Tyre is already fitted on another truck/position")
    # Ensure position on the truck is free
    pos_occupied = db.query(models.TyreFitmentRecord).filter(
        models.TyreFitmentRecord.truck_id == payload.truck_id,
        models.TyreFitmentRecord.position == payload.position,
        models.TyreFitmentRecord.removed_odometer.is_(None),
    ).first()
    if pos_occupied:
        raise HTTPException(400, f"Position {payload.position} on this truck already has a tyre")
    record = models.TyreFitmentRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.patch("/tyre-fitment/{fitment_id}/remove", response_model=schemas.TyreFitmentOut, tags=["Tyre"])
def remove_tyre(fitment_id: int, payload: schemas.TyreFitmentRemove, db: Session = Depends(get_db)):
    record = db.get(models.TyreFitmentRecord, fitment_id)
    if not record:
        raise HTTPException(404, "Fitment record not found")
    if record.removed_odometer is not None:
        raise HTTPException(400, "Tyre already removed")
    record.removed_odometer = payload.removed_odometer
    record.removed_date = payload.removed_date
    db.commit()
    db.refresh(record)
    return record
