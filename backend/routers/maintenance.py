from typing import Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from websocket_manager import emit
from security import get_current_user, TokenUser

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

@router.get("/maintenance/ai-counts", tags=["Maintenance"])
def get_maintenance_ai_counts(db: Session = Depends(get_db)):
    """Pure SQL counts for AI assistant — no row loading."""
    from sqlalchemy import func
    total_records = db.query(func.count(models.MaintenanceRecord.id)).scalar() or 0
    total_fuel_logs = db.query(func.count(models.FuelLog.id)).scalar() or 0
    total_cost = float(db.query(func.coalesce(func.sum(models.MaintenanceRecord.cost), 0)).scalar() or 0)
    total_fuel_spend = float(db.query(func.coalesce(func.sum(models.FuelLog.total_cost), 0)).scalar() or 0)
    total_litres = float(db.query(func.coalesce(func.sum(models.FuelLog.litres), 0)).scalar() or 0)
    return {
        "total_maintenance_records": total_records,
        "total_fuel_log_entries": total_fuel_logs,
        "total_maintenance_cost": total_cost,
        "total_fuel_spend": total_fuel_spend,
        "total_litres_consumed": total_litres,
    }


@router.get("/maintenance/records", response_model=list[schemas.MaintenanceRecordOut], tags=["Maintenance"])
def list_maintenance_records(
    truck_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None, description="Search by maintenance type or description"),
    limit: Optional[int] = Query(None, le=100, description="Max rows (AI use); omit for full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    from sqlalchemy import or_
    q = db.query(models.MaintenanceRecord)
    if truck_id:
        q = q.filter(models.MaintenanceRecord.truck_id == truck_id)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(or_(
            models.MaintenanceRecord.maintenance_type.ilike(s),
            models.MaintenanceRecord.description.ilike(s),
        ))
    q = q.order_by(models.MaintenanceRecord.date.desc())
    if limit is not None:
        q = q.offset(offset).limit(limit)
    return q.all()


@router.post("/maintenance/records", response_model=schemas.MaintenanceRecordOut, status_code=201, tags=["Maintenance"])
def create_maintenance_record(payload: schemas.MaintenanceRecordCreate, db: Session = Depends(get_db)):
    if not db.get(models.Truck, payload.truck_id):
        raise HTTPException(404, "Truck not found")
    record = models.MaintenanceRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    emit("maintenance_updated", {})
    return record


@router.put("/maintenance/records/{record_id}", response_model=schemas.MaintenanceRecordOut, tags=["Maintenance"])
def update_maintenance_record(record_id: int, payload: schemas.MaintenanceRecordUpdate, db: Session = Depends(get_db)):
    record = db.query(models.MaintenanceRecord).with_for_update().filter(models.MaintenanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(404, "Maintenance record not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This maintenance record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(record, field, value)
    record.version = (record.version or 1) + 1
    db.commit()
    db.refresh(record)
    emit("maintenance_updated", {})
    return record


@router.delete("/maintenance/records/{record_id}", status_code=204, tags=["Maintenance"])
def delete_maintenance_record(record_id: int, db: Session = Depends(get_db)):
    record = db.get(models.MaintenanceRecord, record_id)
    if not record:
        raise HTTPException(404, "Maintenance record not found")
    db.delete(record)
    db.commit()
    emit("maintenance_updated", {})


@router.get("/maintenance/trucks/{truck_id}/status", tags=["Maintenance"])
def get_truck_status(truck_id: int, db: Session = Depends(get_db)):
    """Return full health + cost breakdown for a single truck."""
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")

    records = (
        db.query(models.MaintenanceRecord)
        .filter(models.MaintenanceRecord.truck_id == truck_id)
        .order_by(models.MaintenanceRecord.date.desc())
        .all()
    )

    # ── Health score ──────────────────────────────────────────────────────────
    status_items = _maintenance_status(truck, records)
    overdue_items  = [s for s in status_items if s["status"] == "attention"]
    upcoming_items = [s for s in status_items if s["status"] == "upcoming"]

    score = 100

    # −20 per overdue item, capped at −60
    score -= min(len(overdue_items) * 20, 60)

    # −8 per upcoming item, capped at −24
    score -= min(len(upcoming_items) * 8, 24)

    # Recency of last service
    days_since_last = None
    if not records:
        score -= 20
    else:
        days_since_last = (date.today() - records[0].date).days
        if days_since_last > 180:
            score -= 20
        elif days_since_last > 90:
            score -= 10

    score = max(0, min(100, score))

    if score >= 80:
        health_status = "Great"
    elif score >= 60:
        health_status = "Good"
    elif score >= 40:
        health_status = "Average"
    else:
        health_status = "Bad"

    # ── 12-month cost averages ────────────────────────────────────────────────
    today = date.today()
    one_year_ago = today.replace(year=today.year - 1)
    year_records = [r for r in records if r.date and r.date >= one_year_ago]
    total_yearly  = round(sum(float(r.cost or 0) for r in year_records), 2)
    avg_monthly   = round(total_yearly / 12, 2)
    avg_daily     = round(avg_monthly / 26, 2)

    return {
        "truck_id":             truck.id,
        "registration_number":  truck.registration_number,
        "truck_label":          truck.truck_id or "",
        "odometer":             int(truck.odometer or 0),
        "health_status":        health_status,
        "health_score":         score,
        "overdue_count":        len(overdue_items),
        "upcoming_count":       len(upcoming_items),
        "overdue_items":        overdue_items,
        "upcoming_items":       upcoming_items,
        "total_yearly_cost":    total_yearly,
        "avg_monthly_cost":     avg_monthly,
        "avg_daily_cost":       avg_daily,
        "record_count_yearly":  len(year_records),
        "days_since_last_service": days_since_last,
    }


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

@router.get("/maintenance/fuel-logs", response_model=list[schemas.FuelLogOut], tags=["Fuel Logs"])
def list_fuel_logs(
    truck_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, le=100, description="Max rows (AI use); omit for full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.FuelLog)
    if truck_id:
        q = q.filter(models.FuelLog.truck_id == truck_id)
    q = q.order_by(models.FuelLog.date.desc())
    if limit is not None:
        q = q.offset(offset).limit(limit)
    return q.all()


@router.get("/maintenance/fuel-stations", response_model=list[str], tags=["Fuel Logs"])
def list_fuel_stations(db: Session = Depends(get_db)):
    rows = db.query(models.FuelLog.fuel_station).filter(models.FuelLog.fuel_station.isnot(None)).distinct().all()
    stations = {r[0].strip() for r in rows if r[0] and r[0].strip()}
    return sorted(list(stations))


@router.post("/maintenance/fuel-logs", response_model=schemas.FuelLogOut, status_code=201, tags=["Fuel Logs"])
def create_fuel_log(payload: schemas.FuelLogCreate, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if not db.get(models.Truck, payload.truck_id):
        raise HTTPException(404, "Truck not found")
        
    duplicate = db.query(models.FuelLog).filter(
        models.FuelLog.truck_id == payload.truck_id,
        models.FuelLog.date == payload.date,
        models.FuelLog.litres == payload.litres,
        models.FuelLog.odometer == payload.odometer
    ).first()
    if duplicate:
        raise HTTPException(400, "Duplicate entry: A fuel log with the same date, quantity, and odometer already exists.")
        
    latest_log = db.query(models.FuelLog)\
        .filter(models.FuelLog.truck_id == payload.truck_id)\
        .order_by(models.FuelLog.odometer.desc())\
        .first()
        
    if latest_log and payload.odometer <= latest_log.odometer:
        raise HTTPException(400, f"Odometer ({payload.odometer}) must be greater than the previous reading ({latest_log.odometer}).")
        
    distance = 0
    mileage = 0
    if latest_log:
        distance = payload.odometer - latest_log.odometer
        if float(payload.litres) > 0:
            mileage = float(distance) / float(payload.litres)
            
    log = models.FuelLog(**payload.model_dump(exclude={"entered_by_name", "source"}), distance=distance, mileage=mileage, entered_by_name=current_user.name, source="Manual Log")
    db.add(log)
    db.commit()
    db.refresh(log)
    emit("fuel_updated", {})
    return log


@router.get("/maintenance/trucks/{truck_id}/fuel-stats", response_model=schemas.FuelStats, tags=["Fuel Logs"])
def get_fuel_stats(truck_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Truck, truck_id):
        raise HTTPException(404, "Truck not found")
        
    logs = db.query(models.FuelLog)\
        .filter(models.FuelLog.truck_id == truck_id)\
        .order_by(models.FuelLog.odometer.asc())\
        .all()
        
    total_distance = sum(float(log.distance) for log in logs)
    # Only sum fuel/cost for intervals where we know the distance (not the baseline)
    interval_logs = [log for log in logs if float(log.distance) > 0]
    total_fuel = sum(float(log.litres) for log in interval_logs)
    total_cost = sum(float(log.total_cost) for log in interval_logs)

    average_mileage = (total_distance / total_fuel) if total_fuel > 0 else 0
    cost_per_km = (total_cost / total_distance) if total_distance > 0 else 0

    mileages = [float(log.mileage) for log in interval_logs if float(log.mileage) > 0]
    last_mileage = mileages[-1] if mileages else 0
    best_mileage = max(mileages) if mileages else 0
    worst_mileage = min(mileages) if mileages else 0

    trend_percentage = 0
    if average_mileage > 0 and last_mileage > 0:
        trend_percentage = ((last_mileage - average_mileage) / average_mileage) * 100

    return schemas.FuelStats(
        total_distance=total_distance,
        total_fuel=total_fuel,
        average_mileage=average_mileage,
        last_mileage=last_mileage,
        best_mileage=best_mileage,
        worst_mileage=worst_mileage,
        trend_percentage=trend_percentage,
        cost_per_km=cost_per_km,
    )

@router.put("/maintenance/fuel-logs/{log_id}", response_model=schemas.FuelLogOut, tags=["Fuel Logs"])
def update_fuel_log(log_id: int, payload: schemas.FuelLogUpdate, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    log = db.query(models.FuelLog).with_for_update().filter(models.FuelLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "Fuel log not found")
    if payload.client_version is not None and log.version != payload.client_version:
        raise HTTPException(
            409,
            "This fuel log was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )

    new_date = payload.date if payload.date is not None else log.date
    new_litres = payload.litres if payload.litres is not None else log.litres
    new_odometer = payload.odometer if payload.odometer is not None else log.odometer
    
    duplicate = db.query(models.FuelLog).filter(
        models.FuelLog.id != log_id,
        models.FuelLog.truck_id == log.truck_id,
        models.FuelLog.date == new_date,
        models.FuelLog.litres == new_litres,
        models.FuelLog.odometer == new_odometer
    ).first()
    
    if duplicate:
        raise HTTPException(400, "Duplicate entry: A fuel log with the same date, quantity, and odometer already exists.")

    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version", "source"}).items():
        setattr(log, field, value)
    log.entered_by_name = current_user.name
    prev_log = db.query(models.FuelLog)\
        .filter(models.FuelLog.truck_id == log.truck_id, models.FuelLog.odometer < log.odometer)\
        .order_by(models.FuelLog.odometer.desc())\
        .first()
    distance = float(log.odometer - prev_log.odometer) if prev_log else 0
    mileage = (distance / float(log.litres)) if (float(log.litres) > 0 and distance > 0) else 0
    log.distance = distance
    log.mileage = mileage
    log.version = (log.version or 1) + 1
    db.commit()
    db.refresh(log)
    emit("fuel_updated", {})
    return log


@router.delete("/maintenance/fuel-logs/{log_id}", status_code=204, tags=["Fuel Logs"])
def delete_fuel_log(log_id: int, db: Session = Depends(get_db)):
    log = db.get(models.FuelLog, log_id)
    if not log:
        raise HTTPException(404, "Fuel log not found")
    db.delete(log)
    db.commit()
    emit("fuel_updated", {})


# ---------------------------------------------------------------------------
# AdBlue Logs
# ---------------------------------------------------------------------------

@router.get("/maintenance/adblue-logs", response_model=list[schemas.AdBlueLogOut], tags=["AdBlue"])
def list_adblue_logs(
    truck_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.AdBlueLog)
    if truck_id:
        q = q.filter(models.AdBlueLog.truck_id == truck_id)
    return q.order_by(models.AdBlueLog.date.desc()).all()


@router.post("/maintenance/adblue-logs", response_model=schemas.AdBlueLogOut, status_code=201, tags=["AdBlue"])
def create_adblue_log(
    payload: schemas.AdBlueLogCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if not db.get(models.Truck, payload.truck_id):
        raise HTTPException(404, "Truck not found")
    log = models.AdBlueLog(
        **payload.model_dump(),
        entered_by_name=current_user.name,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    emit("adblue_updated", {})
    return log


@router.put("/maintenance/adblue-logs/{log_id}", response_model=schemas.AdBlueLogOut, tags=["AdBlue"])
def update_adblue_log(
    log_id: int,
    payload: schemas.AdBlueLogUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    log = db.query(models.AdBlueLog).with_for_update().filter(models.AdBlueLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "AdBlue log not found")
    if payload.client_version is not None and log.version != payload.client_version:
        raise HTTPException(409, "This record was modified by someone else. Please refresh and try again.")
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(log, field, value)
    log.entered_by_name = current_user.name
    log.version = (log.version or 1) + 1
    db.commit()
    db.refresh(log)
    emit("adblue_updated", {})
    return log


@router.delete("/maintenance/adblue-logs/{log_id}", status_code=204, tags=["AdBlue"])
def delete_adblue_log(log_id: int, db: Session = Depends(get_db)):
    log = db.get(models.AdBlueLog, log_id)
    if not log:
        raise HTTPException(404, "AdBlue log not found")
    db.delete(log)
    db.commit()
    emit("adblue_updated", {})


@router.get("/maintenance/adblue-manufacturers", response_model=list[schemas.AdBlueManufacturerOut], tags=["AdBlue"])
def list_adblue_manufacturers(db: Session = Depends(get_db)):
    return db.query(models.AdBlueManufacturer).order_by(models.AdBlueManufacturer.name).all()


@router.post("/maintenance/adblue-manufacturers", response_model=schemas.AdBlueManufacturerOut, status_code=201, tags=["AdBlue"])
def create_adblue_manufacturer(
    payload: schemas.AdBlueManufacturerCreate,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(get_current_user),
):
    if db.query(models.AdBlueManufacturer).filter_by(name=payload.name).first():
        raise HTTPException(400, f"Manufacturer '{payload.name}' already exists.")
    m = models.AdBlueManufacturer(**payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    emit("adblue_updated", {})
    return m


@router.put("/maintenance/adblue-manufacturers/{manufacturer_id}", response_model=schemas.AdBlueManufacturerOut, tags=["AdBlue"])
def update_adblue_manufacturer(
    manufacturer_id: int,
    payload: schemas.AdBlueManufacturerUpdate,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(get_current_user),
):
    m = db.get(models.AdBlueManufacturer, manufacturer_id)
    if not m:
        raise HTTPException(404, "Manufacturer not found.")
    if payload.name and payload.name != m.name:
        if db.query(models.AdBlueManufacturer).filter_by(name=payload.name).first():
            raise HTTPException(400, f"Manufacturer '{payload.name}' already exists.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(m, field, value)
    db.commit()
    db.refresh(m)
    emit("adblue_updated", {})
    return m


@router.delete("/maintenance/adblue-manufacturers/{manufacturer_id}", status_code=204, tags=["AdBlue"])
def delete_adblue_manufacturer(
    manufacturer_id: int,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(get_current_user),
):
    m = db.get(models.AdBlueManufacturer, manufacturer_id)
    if not m:
        raise HTTPException(404, "Manufacturer not found.")
    db.delete(m)
    db.commit()
    emit("adblue_updated", {})


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
    emit("tyre_updated", {})
    return tyre


@router.put("/tyre-inventory/{tyre_id}", response_model=schemas.TyreInventoryOut, tags=["Tyre"])
def update_tyre(tyre_id: int, payload: schemas.TyreInventoryUpdate, db: Session = Depends(get_db)):
    tyre = db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == tyre_id).first()
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    if payload.client_version is not None and tyre.version != payload.client_version:
        raise HTTPException(
            409,
            "This tyre record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(tyre, field, value)
    tyre.version = (tyre.version or 1) + 1
    db.commit()
    db.refresh(tyre)
    emit("tyre_updated", {})
    return tyre


@router.delete("/tyre-inventory/{tyre_id}", status_code=204, tags=["Tyre"])
def delete_tyre(tyre_id: int, db: Session = Depends(get_db)):
    tyre = db.get(models.TyreInventory, tyre_id)
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    db.delete(tyre)
    db.commit()
    emit("tyre_updated", {})


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
    # Lock the tyre row to prevent concurrent fitting of the same tyre
    db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == payload.tyre_id).first()
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
    emit("tyre_updated", {})
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
    record.removal_remark = payload.removal_remark
    db.commit()
    db.refresh(record)
    emit("tyre_updated", {})
    return record


class _SwapPair(BaseModel):
    position_a: str
    position_b: str


class _SwapBody(BaseModel):
    truck_id: int
    pairs: list[_SwapPair]
    odometer: int
    remark: str


@router.post("/tyre-fitment/swap", response_model=list[schemas.TyreFitmentOut], tags=["Tyre"])
def swap_tyre_positions(payload: _SwapBody, db: Session = Depends(get_db)):
    """Close existing fitments and open new ones at swapped positions, preserving full tyre history."""
    from datetime import date as _date
    today = _date.today()
    all_affected: list[models.TyreFitmentRecord] = []

    for pair in payload.pairs:
        rec_a = db.query(models.TyreFitmentRecord).filter(
            models.TyreFitmentRecord.truck_id == payload.truck_id,
            models.TyreFitmentRecord.position == pair.position_a,
            models.TyreFitmentRecord.removed_odometer.is_(None),
        ).first()
        rec_b = db.query(models.TyreFitmentRecord).filter(
            models.TyreFitmentRecord.truck_id == payload.truck_id,
            models.TyreFitmentRecord.position == pair.position_b,
            models.TyreFitmentRecord.removed_odometer.is_(None),
        ).first()

        tyre_a_id = rec_a.tyre_id if rec_a else None
        tyre_b_id = rec_b.tyre_id if rec_b else None

        if not tyre_a_id and not tyre_b_id:
            continue  # Both empty — skip this pair

        # Validate odometer is not less than each tyre's fitted odometer
        if rec_a and payload.odometer < rec_a.fitted_odometer:
            raise HTTPException(
                400,
                f"Odometer {payload.odometer} km is less than the fitted odometer "
                f"{rec_a.fitted_odometer} km for position {pair.position_a}.",
            )
        if rec_b and payload.odometer < rec_b.fitted_odometer:
            raise HTTPException(
                400,
                f"Odometer {payload.odometer} km is less than the fitted odometer "
                f"{rec_b.fitted_odometer} km for position {pair.position_b}.",
            )

        # Close the existing fitment records (history entry)
        if rec_a:
            rec_a.removed_odometer = payload.odometer
            rec_a.removed_date = today
            rec_a.removal_remark = payload.remark
            all_affected.append(rec_a)
        if rec_b:
            rec_b.removed_odometer = payload.odometer
            rec_b.removed_date = today
            rec_b.removal_remark = payload.remark
            all_affected.append(rec_b)

        # Open new fitments at the swapped positions
        if tyre_a_id:
            new_rec = models.TyreFitmentRecord(
                tyre_id=tyre_a_id,
                truck_id=payload.truck_id,
                position=pair.position_b,
                fitted_odometer=payload.odometer,
                fitted_date=today,
            )
            db.add(new_rec)
            all_affected.append(new_rec)
        if tyre_b_id:
            new_rec = models.TyreFitmentRecord(
                tyre_id=tyre_b_id,
                truck_id=payload.truck_id,
                position=pair.position_a,
                fitted_odometer=payload.odometer,
                fitted_date=today,
            )
            db.add(new_rec)
            all_affected.append(new_rec)

    if not all_affected:
        return []  # Nothing to swap — all pairs were empty

    db.commit()
    for r in all_affected:
        db.refresh(r)
    emit("tyre_updated", {})
    return all_affected
