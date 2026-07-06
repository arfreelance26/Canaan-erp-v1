from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user, TokenUser
import models, schemas

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=list[schemas.NotificationOut])
def list_notifications(
    unread_only: bool = True,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Notifications targeted at the current user's role (newest first, max 50)."""
    q = db.query(models.Notification).filter(
        models.Notification.target_roles.contains(current_user.role)
    )
    if unread_only:
        q = q.filter(models.Notification.is_read.is_(False))
    return q.order_by(models.Notification.created_at.desc()).limit(50).all()


@router.post("/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    notif = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(404, "Notification not found")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    db.query(models.Notification).filter(
        models.Notification.target_roles.contains(current_user.role),
        models.Notification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}
