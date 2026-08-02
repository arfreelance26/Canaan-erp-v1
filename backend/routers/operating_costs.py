from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from security import get_current_user, TokenUser

router = APIRouter(prefix="/operating-costs", tags=["Operating Costs"])

TYRE_TYPES = ["Radial", "Tubeless", "Nylon", "Retread"]


def _seed_tyre_rates(db: Session):
    """Ensure all 4 tyre type rows exist (idempotent)."""
    for ttype in TYRE_TYPES:
        exists = db.query(models.TyreBaseRate).filter_by(tyre_type=ttype).first()
        if not exists:
            db.add(models.TyreBaseRate(tyre_type=ttype, price=0, expected_range_km=0))
    db.commit()


@router.get("/tyre-rates", response_model=list[schemas.TyreBaseRateOut])
def list_tyre_rates(
    db: Session = Depends(get_db),
    _: TokenUser = Depends(get_current_user),
):
    _seed_tyre_rates(db)
    rows = db.query(models.TyreBaseRate).order_by(models.TyreBaseRate.id).all()
    return rows


@router.put("/tyre-rates/{tyre_type}", response_model=schemas.TyreBaseRateOut)
def update_tyre_rate(
    tyre_type: str,
    payload: schemas.TyreBaseRateUpdate,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(get_current_user),
):
    if tyre_type not in TYRE_TYPES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid tyre type. Must be one of: {TYRE_TYPES}")

    _seed_tyre_rates(db)
    row = db.query(models.TyreBaseRate).filter_by(tyre_type=tyre_type).first()
    if payload.price is not None:
        row.price = payload.price
    if payload.expected_range_km is not None:
        row.expected_range_km = payload.expected_range_km
    db.commit()
    db.refresh(row)
    return row
