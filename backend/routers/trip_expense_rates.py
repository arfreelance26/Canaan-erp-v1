from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/trip-expense-rates", tags=["Trip Expense Rates"])

_SINGLETON_NAME = "__default__"


def _get_or_create(db: Session) -> models.TripExpenseRate:
    row = db.query(models.TripExpenseRate).filter(
        models.TripExpenseRate.name == _SINGLETON_NAME
    ).first()
    if not row:
        row = models.TripExpenseRate(name=_SINGLETON_NAME)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("", response_model=schemas.TripExpenseRateOut)
def get_config(db: Session = Depends(get_db)):
    return _get_or_create(db)


@router.put("", response_model=schemas.TripExpenseRateOut)
def save_config(payload: schemas.TripExpenseRateUpdate, db: Session = Depends(get_db)):
    row = db.query(models.TripExpenseRate).with_for_update().filter(
        models.TripExpenseRate.name == _SINGLETON_NAME
    ).first()
    if not row:
        row = models.TripExpenseRate(name=_SINGLETON_NAME)
        db.add(row)
        db.flush()
    else:
        if payload.client_version is not None and row.version != payload.client_version:
            raise HTTPException(
                409,
                "The expense config was modified elsewhere. Please refresh and try again."
            )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version", "name"}).items():
        setattr(row, field, value)
    row.version = (row.version or 1) + 1
    db.commit()
    db.refresh(row)
    return row
