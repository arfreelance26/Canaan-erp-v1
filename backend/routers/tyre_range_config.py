from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from security import get_current_user, TokenUser

router = APIRouter(prefix="/tyre-range-config", tags=["Tyre Range Config"])

DEFAULT_TYRE_TYPES = ["RADIAL", "TUBELESS", "NYLON", "RETREADED"]


@router.get("", response_model=list[schemas.TyreRangeConfigOut])
def get_tyre_range_config(db: Session = Depends(get_db)):
    rows = db.query(models.TyreRangeConfig).order_by(models.TyreRangeConfig.tyre_type).all()
    # Seed defaults on first load
    if not rows:
        for t in DEFAULT_TYRE_TYPES:
            db.add(models.TyreRangeConfig(tyre_type=t, range_km=None))
        db.commit()
        rows = db.query(models.TyreRangeConfig).order_by(models.TyreRangeConfig.tyre_type).all()
    return rows


@router.put("", response_model=list[schemas.TyreRangeConfigOut])
def save_tyre_range_config(
    payload: schemas.TyreRangeConfigBulkSave,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if current_user.role != "Admin":
        raise HTTPException(403, "Only Admins can modify Tyre Range Configuration.")
    for item in payload.configs:
        if not item.tyre_type or not item.tyre_type.strip():
            continue
        existing = db.query(models.TyreRangeConfig).filter(
            models.TyreRangeConfig.tyre_type == item.tyre_type
        ).first()
        if existing:
            existing.range_km = item.range_km
            existing.base_tyre_cost = item.base_tyre_cost
            existing.base_cost_per_km = item.base_cost_per_km
        else:
            db.add(models.TyreRangeConfig(
                tyre_type=item.tyre_type,
                range_km=item.range_km,
                base_tyre_cost=item.base_tyre_cost,
                base_cost_per_km=item.base_cost_per_km,
            ))
    db.commit()
    return db.query(models.TyreRangeConfig).order_by(models.TyreRangeConfig.tyre_type).all()


@router.delete("/{tyre_type}", status_code=204)
def delete_tyre_range_config(tyre_type: str, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if current_user.role != "Admin":
        raise HTTPException(403, "Only Admins can delete Tyre Range Configuration entries.")
    row = db.query(models.TyreRangeConfig).filter(models.TyreRangeConfig.tyre_type == tyre_type).first()
    if not row:
        raise HTTPException(404, "Tyre type not found")
    db.delete(row)
    db.commit()
