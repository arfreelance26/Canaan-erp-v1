from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/maintenance-types", tags=["Maintenance Types"])


@router.get("", response_model=list[schemas.MaintenanceTypeOut])
def list_maintenance_types(db: Session = Depends(get_db)):
    return db.query(models.MaintenanceType).order_by(models.MaintenanceType.interval_km, models.MaintenanceType.name).all()


@router.post("", response_model=schemas.MaintenanceTypeOut, status_code=201)
def create_maintenance_type(payload: schemas.MaintenanceTypeCreate, db: Session = Depends(get_db)):
    if db.query(models.MaintenanceType).filter(models.MaintenanceType.name == payload.name).first():
        raise HTTPException(400, f"Maintenance type '{payload.name}' already exists")
    record = models.MaintenanceType(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# Static routes must come before /{type_id} to avoid "base-config" being parsed as an int
@router.get("/base-config", response_model=schemas.MaintenanceBaseConfigOut)
def get_base_config(db: Session = Depends(get_db)):
    row = db.query(models.MaintenanceBaseConfig).first()
    if not row:
        return schemas.MaintenanceBaseConfigOut(cost_per_km=None, updated_at=None)
    return row


@router.put("/base-config", response_model=schemas.MaintenanceBaseConfigOut)
def set_base_config(payload: schemas.MaintenanceBaseConfigSet, db: Session = Depends(get_db)):
    row = db.query(models.MaintenanceBaseConfig).first()
    if not row:
        row = models.MaintenanceBaseConfig(cost_per_km=payload.cost_per_km)
        db.add(row)
    else:
        row.cost_per_km = payload.cost_per_km
    db.commit()
    db.refresh(row)
    return row


@router.put("/{type_id}", response_model=schemas.MaintenanceTypeOut)
def update_maintenance_type(type_id: int, payload: schemas.MaintenanceTypeUpdate, db: Session = Depends(get_db)):
    record = db.query(models.MaintenanceType).with_for_update().filter(models.MaintenanceType.id == type_id).first()
    if not record:
        raise HTTPException(404, "Maintenance type not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This maintenance type was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again.",
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(record, field, value)
    record.version = (record.version or 1) + 1
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{type_id}", status_code=204)
def delete_maintenance_type(type_id: int, db: Session = Depends(get_db)):
    record = db.get(models.MaintenanceType, type_id)
    if not record:
        raise HTTPException(404, "Maintenance type not found")
    db.delete(record)
    db.commit()
