from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from security import require_roles, get_current_user, TokenUser
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


@router.get("/edit-events", response_model=list[schemas.MaintenanceCategoryEditEventListOut])
def list_all_maintenance_category_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete event ever logged, across every category AND
    every repair nested under one — the page-wide "Edit History" log on
    Maintenance Management. Most recent first. Registered before
    GET /{category_id}-shaped routes so "edit-events" isn't swallowed as a
    category_id path param."""
    return (
        db.query(models.MaintenanceCategoryEditEvent)
        .order_by(models.MaintenanceCategoryEditEvent.created_at.desc(), models.MaintenanceCategoryEditEvent.id.desc())
        .all()
    )


@router.post("", response_model=schemas.MaintenanceCategoryOut, status_code=201, dependencies=[Depends(require_roles("Maintenance"))])
def create_category(
    payload: schemas.MaintenanceCategoryCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if db.query(models.MaintenanceCategory).filter(models.MaintenanceCategory.name == payload.name).first():
        raise HTTPException(400, f"Category '{payload.name}' already exists")
    record = models.MaintenanceCategory(name=payload.name)
    db.add(record)
    db.commit()
    db.refresh(record)
    db.add(models.MaintenanceCategoryEditEvent(
        category_id=record.id, category_name=record.name, event="Category Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    return record


@router.put("/{category_id}", response_model=schemas.MaintenanceCategoryOut, dependencies=[Depends(require_roles("Maintenance"))])
def update_category(
    category_id: int,
    payload: schemas.MaintenanceCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
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
    db.add(models.MaintenanceCategoryEditEvent(
        category_id=record.id, category_name=record.name, event="Category Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{category_id}", status_code=204, dependencies=[Depends(require_roles("Maintenance"))])
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Deletes the category and every repair type nested under it (see the
    ondelete=CASCADE FK / cascade="all, delete-orphan" relationship)."""
    record = db.get(models.MaintenanceCategory, category_id)
    if not record:
        raise HTTPException(404, "Category not found")
    db.add(models.MaintenanceCategoryEditEvent(
        category_id=record.id, category_name=record.name, event="Category Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(record)
    db.commit()


@router.post("/{category_id}/repairs", response_model=schemas.MaintenanceCategoryRepairOut, status_code=201, dependencies=[Depends(require_roles("Maintenance"))])
def create_repair(
    category_id: int,
    payload: schemas.MaintenanceCategoryRepairCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
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
    db.add(models.MaintenanceCategoryEditEvent(
        category_id=category.id, category_name=category.name,
        repair_id=record.id, repair_name=record.name, event="Repair Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    return record


@router.put("/{category_id}/repairs/{repair_id}", response_model=schemas.MaintenanceCategoryRepairOut, dependencies=[Depends(require_roles("Maintenance"))])
def update_repair(
    category_id: int,
    repair_id: int,
    payload: schemas.MaintenanceCategoryRepairUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
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
    category = db.get(models.MaintenanceCategory, category_id)
    db.add(models.MaintenanceCategoryEditEvent(
        category_id=category_id, category_name=category.name if category else "(deleted)",
        repair_id=record.id, repair_name=record.name, event="Repair Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{category_id}/repairs/{repair_id}", status_code=204, dependencies=[Depends(require_roles("Maintenance"))])
def delete_repair(
    category_id: int,
    repair_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.query(models.MaintenanceCategoryRepair).filter(
        models.MaintenanceCategoryRepair.id == repair_id,
        models.MaintenanceCategoryRepair.category_id == category_id,
    ).first()
    if not record:
        raise HTTPException(404, "Repair type not found")
    category = db.get(models.MaintenanceCategory, category_id)
    db.add(models.MaintenanceCategoryEditEvent(
        category_id=category_id, category_name=category.name if category else "(deleted)",
        repair_id=record.id, repair_name=record.name, event="Repair Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(record)
    db.commit()
