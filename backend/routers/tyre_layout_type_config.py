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


@router.get("/edit-events", response_model=list[schemas.TyreLayoutTypeConfigEditEventListOut])
def list_tyre_layout_type_config_edit_events(db: Session = Depends(get_db)):
    """Every save of tyre quantities ever logged — the page-wide "Edit
    History" log on Tyre Cost Configuration. Most recent first. No
    colliding path-param routes exist on this router, but registered
    before PUT regardless for consistency."""
    return (
        db.query(models.TyreLayoutTypeConfigEditEvent)
        .order_by(models.TyreLayoutTypeConfigEditEvent.created_at.desc(), models.TyreLayoutTypeConfigEditEvent.id.desc())
        .all()
    )


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
    db.add(models.TyreLayoutTypeConfigEditEvent(
        event="Tyre Quantity Configuration Updated", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    return db.query(models.TyreLayoutTypeConfig).order_by(
        models.TyreLayoutTypeConfig.tyre_layout,
        models.TyreLayoutTypeConfig.tyre_type,
    ).all()
