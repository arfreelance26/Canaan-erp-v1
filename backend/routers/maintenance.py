from typing import Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from websocket_manager import emit
from security import get_current_user, TokenUser

router = APIRouter(tags=["Maintenance"])

EXPIRING_SOON_DAYS = 30
UPCOMING_WINDOW_KM = 1000


def _compute_maint_status(truck_odo: int, last_odo_map: dict, maint_types: list) -> dict:
    """Return overdue_count, due_soon_count, items for a single truck."""
    items = []
    overdue_count = 0
    due_soon_count = 0
    for mt in maint_types:
        type_lower = mt.name.lower()
        last_odo = last_odo_map.get(type_lower)
        km_since_last = truck_odo - last_odo if last_odo is not None else truck_odo
        if km_since_last >= mt.interval_km:
            status = "Overdue"
            overdue_count += 1
        elif km_since_last >= mt.interval_km - UPCOMING_WINDOW_KM:
            status = "Due Soon"
            due_soon_count += 1
        else:
            status = "OK"
        items.append({
            "type_name": mt.name,
            "interval_km": mt.interval_km,
            "last_odometer": last_odo,
            "km_since_last": km_since_last,
            "next_due_odometer": (last_odo + mt.interval_km) if last_odo is not None else mt.interval_km,
            "status": status,
        })
    # Sort: Overdue first, then Due Soon, then OK, then alphabetical
    priority = {"Overdue": 0, "Due Soon": 1, "OK": 2}
    items.sort(key=lambda x: (priority[x["status"]], x["type_name"]))
    return {"overdue_count": overdue_count, "due_soon_count": due_soon_count, "items": items}


def _compliance_status(expiry_date) -> str:
    if not expiry_date:
        return "Expired"
    today = date.today()
    if expiry_date < today:
        return "Expired"
    if expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS):
        return "Expiring Soon"
    return "Valid"


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
# Maintenance Status (DB-driven — uses maintenance_types table)
# ---------------------------------------------------------------------------

@router.get("/maintenance/status", tags=["Maintenance"])
def get_maintenance_status(db: Session = Depends(get_db)):
    """Fleet-wide maintenance status for all trucks, driven by DB maintenance types."""
    trucks = db.query(models.Truck).all()
    maint_types = db.query(models.MaintenanceType).order_by(models.MaintenanceType.interval_km, models.MaintenanceType.name).all()
    if not maint_types:
        return []

    # Latest odometer per (truck_id, normalized type name) across all trucks
    rows = (
        db.query(
            models.MaintenanceRecord.truck_id,
            func.lower(models.MaintenanceRecord.maintenance_type).label("type_lower"),
            func.max(models.MaintenanceRecord.odometer).label("last_odometer"),
        )
        .group_by(models.MaintenanceRecord.truck_id, func.lower(models.MaintenanceRecord.maintenance_type))
        .all()
    )
    # {truck_db_id: {type_lower: last_odometer}}
    fleet_map: dict[int, dict[str, int]] = {}
    for row in rows:
        fleet_map.setdefault(row.truck_id, {})[row.type_lower] = int(row.last_odometer)

    result = []
    for truck in trucks:
        truck_odo = int(truck.odometer or 0)
        computed = _compute_maint_status(truck_odo, fleet_map.get(truck.id, {}), maint_types)
        result.append({
            "truck_db_id": truck.id,
            "truck_id": truck.truck_id,
            "registration_number": truck.registration_number,
            "odometer": truck_odo,
            **computed,
        })
    return result


@router.get("/maintenance/cost-per-day/all", tags=["Maintenance"])
def get_maintenance_cost_per_day_all(db: Session = Depends(get_db)):
    """
    Per-truck average daily maintenance cost for the past 12 months.
    Mirrors TruckStatusDialog 'Avg / Day': (12-month total) / 12 / 26.
    Returns { "<truck_db_id>": avg_daily_cost_float, ... } — only trucks with data.
    """
    from datetime import date as _date

    today = _date.today()
    try:
        one_year_ago = today.replace(year=today.year - 1)
    except ValueError:
        one_year_ago = today.replace(year=today.year - 1, day=28)

    cost_rows = (
        db.query(
            models.MaintenanceRecord.truck_id,
            func.sum(models.MaintenanceRecord.cost).label("year_total"),
        )
        .filter(models.MaintenanceRecord.date >= one_year_ago)
        .filter(models.MaintenanceRecord.date <= today)
        .group_by(models.MaintenanceRecord.truck_id)
        .all()
    )
    return {
        str(row.truck_id): float(row.year_total) / 12 / 26
        for row in cost_rows
        if float(row.year_total or 0) > 0
    }


@router.get("/maintenance/cost-per-km/all", tags=["Maintenance"])
def get_maintenance_cost_per_km_all(db: Session = Depends(get_db)):
    """
    Per-truck maintenance cost/km for Advanced mode in the Running Cost Calculator.
    Mirrors TruckStatusDialog 'Cost / Km': (12-month total) / 12 / 26 / km_per_day.
    Returns { "<truck_db_id>": cost_per_km_float, ... } — only trucks with data and km_per_day set.
    """
    from datetime import date as _date

    today = _date.today()
    try:
        one_year_ago = today.replace(year=today.year - 1)
    except ValueError:
        one_year_ago = today.replace(year=today.year - 1, day=28)

    # Sum maintenance costs per truck for the past 12 months
    cost_rows = (
        db.query(
            models.MaintenanceRecord.truck_id,
            func.sum(models.MaintenanceRecord.cost).label("year_total"),
        )
        .filter(models.MaintenanceRecord.date >= one_year_ago)
        .filter(models.MaintenanceRecord.date <= today)
        .group_by(models.MaintenanceRecord.truck_id)
        .all()
    )
    if not cost_rows:
        return {}

    year_total_map: dict[int, float] = {
        row.truck_id: float(row.year_total or 0) for row in cost_rows if float(row.year_total or 0) > 0
    }
    if not year_total_map:
        return {}

    trucks = db.query(models.Truck).filter(models.Truck.id.in_(list(year_total_map.keys()))).all()
    tyre_layouts = {t.tyre_layout for t in trucks if t.tyre_layout}
    run_configs = (
        db.query(models.TruckRunConfig)
        .filter(models.TruckRunConfig.tyre_layout.in_(tyre_layouts))
        .all()
    )
    kpd_map: dict[str, float] = {
        rc.tyre_layout: float(rc.km_per_day or 0) for rc in run_configs
    }

    result: dict[str, float] = {}
    for truck in trucks:
        year_total = year_total_map.get(truck.id, 0)
        kpd = kpd_map.get(truck.tyre_layout or "", 0)
        if year_total <= 0 or kpd <= 0:
            continue
        cost_per_km = year_total / 12 / 26 / kpd
        if cost_per_km > 0:
            result[str(truck.id)] = cost_per_km
    return result


@router.get("/maintenance/trucks/{truck_db_id}/status", tags=["Maintenance"])
def get_truck_maintenance_status(truck_db_id: int, db: Session = Depends(get_db)):
    """Detailed per-type maintenance status for a single truck."""
    truck = db.get(models.Truck, truck_db_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    maint_types = db.query(models.MaintenanceType).order_by(models.MaintenanceType.interval_km, models.MaintenanceType.name).all()

    rows = (
        db.query(
            func.lower(models.MaintenanceRecord.maintenance_type).label("type_lower"),
            func.max(models.MaintenanceRecord.odometer).label("last_odometer"),
        )
        .filter(models.MaintenanceRecord.truck_id == truck_db_id)
        .group_by(func.lower(models.MaintenanceRecord.maintenance_type))
        .all()
    )
    last_odo_map = {row.type_lower: int(row.last_odometer) for row in rows}
    truck_odo = int(truck.odometer or 0)

    computed = _compute_maint_status(truck_odo, last_odo_map, maint_types)
    return {
        "truck_db_id": truck.id,
        "truck_id": truck.truck_id,
        "registration_number": truck.registration_number,
        "odometer": truck_odo,
        **computed,
    }


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


@router.get("/maintenance/fuel-base-config", response_model=schemas.FuelBaseConfigOut, tags=["Fuel Logs"])
def get_fuel_base_config(db: Session = Depends(get_db)):
    row = db.query(models.FuelBaseConfig).first()
    if not row:
        row = models.FuelBaseConfig(cost_per_litre=None)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("/maintenance/fuel-base-config", response_model=schemas.FuelBaseConfigOut, tags=["Fuel Logs"])
def update_fuel_base_config(payload: schemas.FuelBaseConfigUpdate, db: Session = Depends(get_db)):
    row = db.query(models.FuelBaseConfig).first()
    if not row:
        row = models.FuelBaseConfig(cost_per_litre=payload.cost_per_litre)
        db.add(row)
    else:
        row.cost_per_litre = payload.cost_per_litre
    db.commit()
    db.refresh(row)
    return row


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


@router.get("/maintenance/fuel-stats/all", tags=["Fuel Logs"])
def get_all_fuel_stats(db: Session = Depends(get_db)):
    """Returns average mileage in km/L keyed by truck_id (as string) for every truck that has fuel logs."""
    logs = db.query(models.FuelLog).filter(models.FuelLog.distance > 0).all()
    totals: dict[int, dict] = {}
    for log in logs:
        tid = log.truck_id
        if tid not in totals:
            totals[tid] = {"distance": 0.0, "fuel": 0.0}
        totals[tid]["distance"] += float(log.distance or 0)
        totals[tid]["fuel"]     += float(log.litres  or 0)
    return {
        str(tid): round(d["distance"] / d["fuel"], 6) if d["fuel"] > 0 else 0
        for tid, d in totals.items()
    }


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
