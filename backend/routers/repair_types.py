from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/repair-types", tags=["Repair Types"])


@router.get("", response_model=list[schemas.RepairTypeOut])
def list_repair_types(db: Session = Depends(get_db)):
    return db.query(models.RepairType).order_by(models.RepairType.name).all()


@router.post("", response_model=schemas.RepairTypeOut, status_code=201)
def create_repair_type(payload: schemas.RepairTypeCreate, db: Session = Depends(get_db)):
    if db.query(models.RepairType).filter(models.RepairType.name == payload.name).first():
        raise HTTPException(400, f"Repair type '{payload.name}' already exists")
    record = models.RepairType(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{repair_type_id}", response_model=schemas.RepairTypeOut)
def update_repair_type(repair_type_id: int, payload: schemas.RepairTypeUpdate, db: Session = Depends(get_db)):
    record = db.query(models.RepairType).with_for_update().filter(models.RepairType.id == repair_type_id).first()
    if not record:
        raise HTTPException(404, "Repair type not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This repair type was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(record, field, value)
    record.version = (record.version or 1) + 1
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{repair_type_id}", status_code=204)
def delete_repair_type(repair_type_id: int, db: Session = Depends(get_db)):
    record = db.get(models.RepairType, repair_type_id)
    if not record:
        raise HTTPException(404, "Repair type not found")
    db.delete(record)
    db.commit()
