from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from websocket_manager import emit
from security import get_current_user, TokenUser

router = APIRouter(prefix="/finance", tags=["Finance"])


# ---------------------------------------------------------------------------
# EMI Records
# ---------------------------------------------------------------------------

@router.get("/emi", response_model=list[schemas.EmiRecordOut])
def list_emi(db: Session = Depends(get_db)):
    return db.query(models.EmiRecord).order_by(models.EmiRecord.emi_name).all()


@router.get("/emi/edit-events", response_model=list[schemas.EmiRecordEditEventListOut])
def list_all_emi_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete event ever logged, across every EMI record —
    the page-wide "Edit History" log on EMI Tracking. Most recent first.
    Registered before GET /emi/{emi_id} so "edit-events" isn't swallowed as
    an emi_id path param."""
    events = (
        db.query(models.EmiRecordEditEvent)
        .order_by(models.EmiRecordEditEvent.created_at.desc(), models.EmiRecordEditEvent.id.desc())
        .all()
    )
    return events


@router.post("/emi", response_model=schemas.EmiRecordOut, status_code=201)
def create_emi(
    payload: schemas.EmiRecordCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = models.EmiRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    db.add(models.EmiRecordEditEvent(
        emi_id=record.id, emi_name=record.emi_name, truck_registration=record.truck_registration,
        event="EMI Created", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("finance_updated", {})
    return record


@router.get("/emi/{emi_id}", response_model=schemas.EmiRecordOut)
def get_emi(emi_id: int, db: Session = Depends(get_db)):
    record = db.get(models.EmiRecord, emi_id)
    if not record:
        raise HTTPException(404, "EMI record not found")
    return record


@router.put("/emi/{emi_id}", response_model=schemas.EmiRecordOut)
def update_emi(
    emi_id: int,
    payload: schemas.EmiRecordUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.query(models.EmiRecord).with_for_update().filter(models.EmiRecord.id == emi_id).first()
    if not record:
        raise HTTPException(404, "EMI record not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This EMI record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(record, field, value)
    record.version = (record.version or 1) + 1
    db.add(models.EmiRecordEditEvent(
        emi_id=record.id, emi_name=record.emi_name, truck_registration=record.truck_registration,
        event="EMI Edited", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(record)
    emit("finance_updated", {})
    return record


@router.delete("/emi/{emi_id}", status_code=204)
def delete_emi(
    emi_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.get(models.EmiRecord, emi_id)
    if not record:
        raise HTTPException(404, "EMI record not found")
    db.add(models.EmiRecordEditEvent(
        emi_id=record.id, emi_name=record.emi_name, truck_registration=record.truck_registration,
        event="EMI Deleted", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(record)
    db.commit()
    emit("finance_updated", {})


# ---------------------------------------------------------------------------
# Recurring Payments
# ---------------------------------------------------------------------------

@router.get("/recurring-payments", response_model=list[schemas.RecurringPaymentOut])
def list_recurring(db: Session = Depends(get_db)):
    return db.query(models.RecurringPayment).order_by(models.RecurringPayment.title).all()


@router.post("/recurring-payments", response_model=schemas.RecurringPaymentOut, status_code=201)
def create_recurring(payload: schemas.RecurringPaymentCreate, db: Session = Depends(get_db)):
    payment = models.RecurringPayment(**payload.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    emit("finance_updated", {})
    return payment


@router.get("/recurring-payments/{payment_id}", response_model=schemas.RecurringPaymentOut)
def get_recurring(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(models.RecurringPayment, payment_id)
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    return payment


@router.put("/recurring-payments/{payment_id}", response_model=schemas.RecurringPaymentOut)
def update_recurring(payment_id: int, payload: schemas.RecurringPaymentUpdate, db: Session = Depends(get_db)):
    payment = db.query(models.RecurringPayment).with_for_update().filter(models.RecurringPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    if payload.client_version is not None and payment.version != payload.client_version:
        raise HTTPException(
            409,
            "This recurring payment was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(payment, field, value)
    payment.version = (payment.version or 1) + 1
    db.commit()
    db.refresh(payment)
    emit("finance_updated", {})
    return payment


@router.delete("/recurring-payments/{payment_id}", status_code=204)
def delete_recurring(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(models.RecurringPayment, payment_id)
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    db.delete(payment)
    db.commit()
    emit("finance_updated", {})


# ---------------------------------------------------------------------------
# Compensation — Drivers
# ---------------------------------------------------------------------------

@router.get("/compensation/drivers", response_model=list[schemas.CompensationTransactionOut])
def list_driver_compensation(
    driver_id: Optional[int] = Query(None, description="Internal driver.id"),
    db: Session = Depends(get_db),
):
    q = db.query(models.CompensationTransaction).filter(
        models.CompensationTransaction.person_type == "driver"
    )
    if driver_id:
        q = q.filter(models.CompensationTransaction.person_id == driver_id)
    return q.order_by(models.CompensationTransaction.date.desc()).all()


@router.get("/compensation/edit-events", response_model=list[schemas.CompensationEditEventListOut])
def list_all_compensation_edit_events(
    person_type: Optional[str] = Query(None, description="'driver' or 'staff'; omit for both"),
    db: Session = Depends(get_db),
):
    """Every Add/Delete event ever logged, across every compensation
    transaction — the page-wide "Edit History" log shared by the Driver
    Compensation and Staff Compensation pages (each passes its own
    person_type). Most recent first."""
    q = db.query(models.CompensationEditEvent)
    if person_type:
        q = q.filter(models.CompensationEditEvent.person_type == person_type)
    return q.order_by(models.CompensationEditEvent.created_at.desc(), models.CompensationEditEvent.id.desc()).all()


@router.post("/compensation/drivers", response_model=schemas.CompensationTransactionOut, status_code=201)
def add_driver_compensation(
    payload: schemas.CompensationTransactionCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if payload.person_type != "driver":
        raise HTTPException(400, "person_type must be 'driver' for this endpoint")
    driver = db.get(models.Driver, payload.person_id)
    if not driver:
        raise HTTPException(404, "Driver not found.")
    tx = models.CompensationTransaction(**payload.model_dump(), person_name=driver.name)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    db.add(models.CompensationEditEvent(
        person_type="driver", person_id=tx.person_id, person_name=tx.person_name,
        tx_type=tx.type, amount=tx.amount, tx_date=tx.date,
        event="Transaction Added", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("finance_updated", {})
    return tx


# ---------------------------------------------------------------------------
# Compensation — Staff
# ---------------------------------------------------------------------------

@router.get("/compensation/staff", response_model=list[schemas.CompensationTransactionOut])
def list_staff_compensation(
    staff_id: Optional[int] = Query(None, description="Internal staff.id"),
    db: Session = Depends(get_db),
):
    q = db.query(models.CompensationTransaction).filter(
        models.CompensationTransaction.person_type == "staff"
    )
    if staff_id:
        q = q.filter(models.CompensationTransaction.person_id == staff_id)
    return q.order_by(models.CompensationTransaction.date.desc()).all()


@router.post("/compensation/staff", response_model=schemas.CompensationTransactionOut, status_code=201)
def add_staff_compensation(
    payload: schemas.CompensationTransactionCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if payload.person_type != "staff":
        raise HTTPException(400, "person_type must be 'staff' for this endpoint")
    staff = db.get(models.Staff, payload.person_id)
    if not staff:
        raise HTTPException(404, "Staff member not found.")
    tx = models.CompensationTransaction(**payload.model_dump(), person_name=staff.name)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    db.add(models.CompensationEditEvent(
        person_type="staff", person_id=tx.person_id, person_name=tx.person_name,
        tx_type=tx.type, amount=tx.amount, tx_date=tx.date,
        event="Transaction Added", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("finance_updated", {})
    return tx


@router.delete("/compensation/{tx_id}", status_code=204)
def delete_compensation(
    tx_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    tx = db.get(models.CompensationTransaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    db.add(models.CompensationEditEvent(
        person_type=tx.person_type, person_id=tx.person_id, person_name=tx.person_name,
        tx_type=tx.type, amount=tx.amount, tx_date=tx.date,
        event="Transaction Deleted", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(tx)
    db.commit()
    emit("finance_updated", {})
