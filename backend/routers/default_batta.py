from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from models import DEFAULT_BATTA_CARGO_TYPES, DEFAULT_BATTA_TRIP_TYPES
from security import get_current_user, TokenUser

router = APIRouter(prefix="/default-batta-rates", tags=["Default Batta Management"])


@router.get("", response_model=list[schemas.DefaultBattaRateOut])
def list_default_batta_rates(
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.DefaultBattaRate)
    if branch_id is not None:
        q = q.filter(models.DefaultBattaRate.branch_id == branch_id)
    return q.all()


@router.put("", response_model=schemas.DefaultBattaRateOut)
def upsert_default_batta_rate(
    payload: schemas.DefaultBattaRateUpsert,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if current_user.role not in ("Admin", "Commercial Manager", "Assistant Commercial Manager"):
        raise HTTPException(403, "Only Admins or the Commercial Manager can modify Default Batta Management.")
    if payload.trip_type not in DEFAULT_BATTA_TRIP_TYPES:
        raise HTTPException(400, f"Invalid trip type: {payload.trip_type}")
    if payload.cargo_type not in DEFAULT_BATTA_CARGO_TYPES:
        raise HTTPException(400, f"Invalid cargo type: {payload.cargo_type}")
    if payload.amount is not None and payload.amount < 0:
        raise HTTPException(400, "Amount cannot be negative.")

    branch = db.get(models.Branch, payload.branch_id)
    if not branch:
        raise HTTPException(404, "Branch not found")

    row = (
        db.query(models.DefaultBattaRate)
        .filter(
            models.DefaultBattaRate.branch_id == payload.branch_id,
            models.DefaultBattaRate.trip_type == payload.trip_type,
            models.DefaultBattaRate.cargo_type == payload.cargo_type,
        )
        .with_for_update()
        .first()
    )
    if row:
        row.amount = payload.amount
    else:
        row = models.DefaultBattaRate(
            branch_id=payload.branch_id,
            trip_type=payload.trip_type,
            cargo_type=payload.cargo_type,
            amount=payload.amount,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row
