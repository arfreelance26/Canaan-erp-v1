from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from security import require_roles
import models, schemas

router = APIRouter(prefix="/maintenance-categories", tags=["Maintenance Categories"])


@router.get("", response_model=list[schemas.MaintenanceCategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return (
        db.query(models.MaintenanceCategory)
        .options(joinedload(models.MaintenanceCategory.repairs))
        .order_by(models.MaintenanceCategory.name)
        .all()
    )


@router.post("", response_model=schemas.MaintenanceCategoryOut, status_code=201, dependencies=[Depends(require_roles("Maintenance"))])
def create_category(payload: schemas.MaintenanceCategoryCreate, db: Session = Depends(get_db)):
    if db.query(models.MaintenanceCategory).filter(models.MaintenanceCategory.name == payload.name).first():
        raise HTTPException(400, f"Category '{payload.name}' already exists")
    record = models.MaintenanceCategory(name=payload.name)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{category_id}", response_model=schemas.MaintenanceCategoryOut, dependencies=[Depends(require_roles("Maintenance"))])
def update_category(category_id: int, payload: schemas.MaintenanceCategoryUpdate, db: Session = Depends(get_db)):
    record = db.query(models.MaintenanceCategory).with_for_update().filter(models.MaintenanceCategory.id == category_id).first()
    if not record:
        raise HTTPException(404, "Category not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This category was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    if payload.name is not None and payload.name != record.name:
        if db.query(models.MaintenanceCategory).filter(models.MaintenanceCategory.name == payload.name).first():
            raise HTTPException(400, f"Category '{payload.name}' already exists")
        record.name = payload.name
    record.version = (record.version or 1) + 1
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{category_id}", status_code=204, dependencies=[Depends(require_roles("Maintenance"))])
def delete_category(category_id: int, db: Session = Depends(get_db)):
    """Deletes the category and every repair type nested under it (see the
    ondelete=CASCADE FK / cascade="all, delete-orphan" relationship)."""
    record = db.get(models.MaintenanceCategory, category_id)
    if not record:
        raise HTTPException(404, "Category not found")
    db.delete(record)
    db.commit()


@router.post("/{category_id}/repairs", response_model=schemas.MaintenanceCategoryRepairOut, status_code=201, dependencies=[Depends(require_roles("Maintenance"))])
def create_repair(category_id: int, payload: schemas.MaintenanceCategoryRepairCreate, db: Session = Depends(get_db)):
    category = db.get(models.MaintenanceCategory, category_id)
    if not category:
        raise HTTPException(404, "Category not found")
    if db.query(models.MaintenanceCategoryRepair).filter(
        models.MaintenanceCategoryRepair.category_id == category_id,
        models.MaintenanceCategoryRepair.name == payload.name,
    ).first():
        raise HTTPException(400, f"'{payload.name}' already exists in this category")
    record = models.MaintenanceCategoryRepair(category_id=category_id, name=payload.name)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{category_id}/repairs/{repair_id}", response_model=schemas.MaintenanceCategoryRepairOut, dependencies=[Depends(require_roles("Maintenance"))])
def update_repair(category_id: int, repair_id: int, payload: schemas.MaintenanceCategoryRepairUpdate, db: Session = Depends(get_db)):
    record = db.query(models.MaintenanceCategoryRepair).with_for_update().filter(
        models.MaintenanceCategoryRepair.id == repair_id,
        models.MaintenanceCategoryRepair.category_id == category_id,
    ).first()
    if not record:
        raise HTTPException(404, "Repair type not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This repair type was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    if payload.name is not None and payload.name != record.name:
        if db.query(models.MaintenanceCategoryRepair).filter(
            models.MaintenanceCategoryRepair.category_id == category_id,
            models.MaintenanceCategoryRepair.name == payload.name,
        ).first():
            raise HTTPException(400, f"'{payload.name}' already exists in this category")
        record.name = payload.name
    record.version = (record.version or 1) + 1
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{category_id}/repairs/{repair_id}", status_code=204, dependencies=[Depends(require_roles("Maintenance"))])
def delete_repair(category_id: int, repair_id: int, db: Session = Depends(get_db)):
    record = db.query(models.MaintenanceCategoryRepair).filter(
        models.MaintenanceCategoryRepair.id == repair_id,
        models.MaintenanceCategoryRepair.category_id == category_id,
    ).first()
    if not record:
        raise HTTPException(404, "Repair type not found")
    db.delete(record)
    db.commit()
