from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from security import get_current_user, TokenUser

router = APIRouter(prefix="/tyre-layout-type-config", tags=["Tyre Layout Type Config"])


@router.get("", response_model=list[schemas.TyreLayoutTypeConfigOut])
def get_tyre_layout_type_config(db: Session = Depends(get_db)):
    return db.query(models.TyreLayoutTypeConfig).order_by(
        models.TyreLayoutTypeConfig.tyre_layout,
        models.TyreLayoutTypeConfig.tyre_type,
    ).all()


@router.put("", response_model=list[schemas.TyreLayoutTypeConfigOut])
def save_tyre_layout_type_config(
    payload: schemas.TyreLayoutTypeConfigBulkSave,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if current_user.role != "Admin":
        raise HTTPException(403, "Only Admins can modify Tyre Layout Type Configuration.")
    for item in payload.configs:
        if not item.tyre_layout.strip() or not item.tyre_type.strip():
            continue
        existing = db.query(models.TyreLayoutTypeConfig).filter(
            models.TyreLayoutTypeConfig.tyre_layout == item.tyre_layout,
            models.TyreLayoutTypeConfig.tyre_type == item.tyre_type,
        ).first()
        if existing:
            existing.quantity = item.quantity
        else:
            db.add(models.TyreLayoutTypeConfig(
                tyre_layout=item.tyre_layout,
                tyre_type=item.tyre_type,
                quantity=item.quantity,
            ))
    db.commit()
    return db.query(models.TyreLayoutTypeConfig).order_by(
        models.TyreLayoutTypeConfig.tyre_layout,
        models.TyreLayoutTypeConfig.tyre_type,
    ).all()
