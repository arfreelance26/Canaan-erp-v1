from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/finance", tags=["Finance"])


# ---------------------------------------------------------------------------
# EMI Records
# ---------------------------------------------------------------------------

@router.get("/emi", response_model=list[schemas.EmiRecordOut])
def list_emi(db: Session = Depends(get_db)):
    return db.query(models.EmiRecord).order_by(models.EmiRecord.emi_name).all()


@router.post("/emi", response_model=schemas.EmiRecordOut, status_code=201)
def create_emi(payload: schemas.EmiRecordCreate, db: Session = Depends(get_db)):
    record = models.EmiRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/emi/{emi_id}", response_model=schemas.EmiRecordOut)
def get_emi(emi_id: int, db: Session = Depends(get_db)):
    record = db.get(models.EmiRecord, emi_id)
    if not record:
        raise HTTPException(404, "EMI record not found")
    return record


@router.put("/emi/{emi_id}", response_model=schemas.EmiRecordOut)
def update_emi(emi_id: int, payload: schemas.EmiRecordUpdate, db: Session = Depends(get_db)):
    record = db.get(models.EmiRecord, emi_id)
    if not record:
        raise HTTPException(404, "EMI record not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/emi/{emi_id}", status_code=204)
def delete_emi(emi_id: int, db: Session = Depends(get_db)):
    record = db.get(models.EmiRecord, emi_id)
    if not record:
        raise HTTPException(404, "EMI record not found")
    db.delete(record)
    db.commit()


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
    return payment


@router.get("/recurring-payments/{payment_id}", response_model=schemas.RecurringPaymentOut)
def get_recurring(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(models.RecurringPayment, payment_id)
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    return payment


@router.put("/recurring-payments/{payment_id}", response_model=schemas.RecurringPaymentOut)
def update_recurring(payment_id: int, payload: schemas.RecurringPaymentUpdate, db: Session = Depends(get_db)):
    payment = db.get(models.RecurringPayment, payment_id)
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(payment, field, value)
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/recurring-payments/{payment_id}", status_code=204)
def delete_recurring(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(models.RecurringPayment, payment_id)
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    db.delete(payment)
    db.commit()


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


@router.post("/compensation/drivers", response_model=schemas.CompensationTransactionOut, status_code=201)
def add_driver_compensation(payload: schemas.CompensationTransactionCreate, db: Session = Depends(get_db)):
    if payload.person_type != "driver":
        raise HTTPException(400, "person_type must be 'driver' for this endpoint")
    tx = models.CompensationTransaction(**payload.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
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
def add_staff_compensation(payload: schemas.CompensationTransactionCreate, db: Session = Depends(get_db)):
    if payload.person_type != "staff":
        raise HTTPException(400, "person_type must be 'staff' for this endpoint")
    tx = models.CompensationTransaction(**payload.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/compensation/{tx_id}", status_code=204)
def delete_compensation(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(models.CompensationTransaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    db.delete(tx)
    db.commit()
