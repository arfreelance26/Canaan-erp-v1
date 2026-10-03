from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from pydantic import BaseModel
from typing import Optional
import models, schemas
from security import get_current_user, TokenUser

router = APIRouter(prefix="/sac-codes", tags=["SAC Codes"])


@router.get("", response_model=list[schemas.SacCodeOut])
def list_sac_codes(db: Session = Depends(get_db)):
    return db.query(models.SacCode).order_by(models.SacCode.code).all()


@router.get("/edit-events", response_model=list[schemas.SacCodeEditEventListOut])
def list_all_sac_code_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete event ever logged, across every SAC code —
    the page-wide "Edit History" log on SAC Code Management. Most recent
    first. Registered before GET /{sac_code_id}-shaped routes so
    "edit-events" isn't swallowed as a sac_code_id path param."""
    return (
        db.query(models.SacCodeEditEvent)
        .order_by(models.SacCodeEditEvent.created_at.desc(), models.SacCodeEditEvent.id.desc())
        .all()
    )


@router.post("", response_model=schemas.SacCodeOut, status_code=201)
def create_sac_code(
    payload: schemas.SacCodeCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = models.SacCode(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    db.add(models.SacCodeEditEvent(
        sac_code_id=record.id, code=record.code, description=record.description,
        event="SAC Code Created", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    return record


@router.put("/{sac_code_id}", response_model=schemas.SacCodeOut)
def update_sac_code(
    sac_code_id: int,
    payload: schemas.SacCodeUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.query(models.SacCode).with_for_update().filter(models.SacCode.id == sac_code_id).first()
    if not record:
        raise HTTPException(404, "SAC code not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This SAC code was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(record, field, value)
    record.version = (record.version or 1) + 1
    db.add(models.SacCodeEditEvent(
        sac_code_id=record.id, code=record.code, description=record.description,
        event="SAC Code Edited", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(record)
    return record


class _LinkExpenseBody(BaseModel):
    expense: Optional[str] = None


@router.patch("/{sac_code_id}/link-expense", response_model=schemas.SacCodeOut)
def link_expense(
    sac_code_id: int,
    body: _LinkExpenseBody,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.query(models.SacCode).with_for_update().filter(models.SacCode.id == sac_code_id).first()
    if not record:
        raise HTTPException(404, "SAC code not found")
    record.linked_expense = body.expense if body.expense else None
    record.version = (record.version or 1) + 1
    db.add(models.SacCodeEditEvent(
        sac_code_id=record.id, code=record.code, description=record.description,
        event="SAC Code Edited", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(record)
    return record


class _AutoPopulateBody(BaseModel):
    invoice_type: Optional[str] = None


@router.patch("/{sac_code_id}/auto-populate", response_model=schemas.SacCodeOut)
def set_auto_populate(
    sac_code_id: int,
    body: _AutoPopulateBody,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.query(models.SacCode).with_for_update().filter(models.SacCode.id == sac_code_id).first()
    if not record:
        raise HTTPException(404, "SAC code not found")
    record.auto_populate_invoice_type = body.invoice_type if body.invoice_type else None
    record.version = (record.version or 1) + 1
    db.add(models.SacCodeEditEvent(
        sac_code_id=record.id, code=record.code, description=record.description,
        event="SAC Code Edited", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{sac_code_id}", status_code=204)
def delete_sac_code(
    sac_code_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.get(models.SacCode, sac_code_id)
    if not record:
        raise HTTPException(404, "SAC code not found")
    db.add(models.SacCodeEditEvent(
        sac_code_id=record.id, code=record.code, description=record.description,
        event="SAC Code Deleted", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(record)
    db.commit()
