from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from security import get_current_user, TokenUser

router = APIRouter(prefix="/maintenance-types", tags=["Maintenance Types"])


@router.get("", response_model=list[schemas.MaintenanceTypeOut])
def list_maintenance_types(db: Session = Depends(get_db)):
    return db.query(models.MaintenanceType).order_by(models.MaintenanceType.interval_km, models.MaintenanceType.name).all()


@router.get("/edit-events", response_model=list[schemas.MaintenanceTypeEditEventListOut])
def list_all_maintenance_type_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete event ever logged, across every maintenance
    alert type — the page-wide "Edit History" log on Maintenance Alert
    Management. Most recent first. Registered before GET /{type_id} so
    "edit-events" isn't swallowed as a type_id path param."""
    return (
        db.query(models.MaintenanceTypeEditEvent)
        .order_by(models.MaintenanceTypeEditEvent.created_at.desc(), models.MaintenanceTypeEditEvent.id.desc())
        .all()
    )


@router.post("", response_model=schemas.MaintenanceTypeOut, status_code=201)
def create_maintenance_type(
    payload: schemas.MaintenanceTypeCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if db.query(models.MaintenanceType).filter(models.MaintenanceType.name == payload.name).first():
        raise HTTPException(400, f"Maintenance type '{payload.name}' already exists")
    record = models.MaintenanceType(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    db.add(models.MaintenanceTypeEditEvent(
        type_id=record.id, name=record.name, event="Type Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    return record


@router.put("/{type_id}", response_model=schemas.MaintenanceTypeOut)
def update_maintenance_type(
    type_id: int,
    payload: schemas.MaintenanceTypeUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
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
    db.add(models.MaintenanceTypeEditEvent(
        type_id=record.id, name=record.name, event="Type Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{type_id}", status_code=204)
def delete_maintenance_type(
    type_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.get(models.MaintenanceType, type_id)
    if not record:
        raise HTTPException(404, "Maintenance type not found")
    db.add(models.MaintenanceTypeEditEvent(
        type_id=record.id, name=record.name, event="Type Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(record)
    db.commit()
