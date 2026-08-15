"""Admin-managed runtime settings (device lock controls)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from security import require_roles, TokenUser
from audit import record_audit
import settings_store

router = APIRouter(prefix="/settings", tags=["Settings"])


class DeviceLockSettings(BaseModel):
    enabled: bool
    admin_limit: int
    staff_limit: int


class DeviceLockUpdate(BaseModel):
    enabled: bool | None = None
    admin_limit: int | None = None
    staff_limit: int | None = None


def _current(db: Session) -> DeviceLockSettings:
    return DeviceLockSettings(
        enabled=settings_store.device_lock_enabled(db),
        admin_limit=settings_store.admin_device_limit(db),
        staff_limit=settings_store.staff_device_limit(db),
    )


@router.get("/device-lock", response_model=DeviceLockSettings)
def get_device_lock(db: Session = Depends(get_db), user: TokenUser = Depends(require_roles())):
    return _current(db)


@router.put("/device-lock", response_model=DeviceLockSettings)
def update_device_lock(
    payload: DeviceLockUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: TokenUser = Depends(require_roles()),
):
    if payload.admin_limit is not None and payload.admin_limit < 1:
        raise HTTPException(400, "Admin device limit must be at least 1.")
    if payload.staff_limit is not None and payload.staff_limit < 1:
        raise HTTPException(400, "Staff device limit must be at least 1.")
    if payload.enabled is not None:
        settings_store.set_device_lock_enabled(db, payload.enabled)
    if payload.admin_limit is not None:
        settings_store.set_admin_device_limit(db, payload.admin_limit)
    if payload.staff_limit is not None:
        settings_store.set_staff_device_limit(db, payload.staff_limit)
    record_audit(
        "device.settings", request=request, actor_id=user.id, actor_name=user.name,
        actor_role=user.role,
        detail=f"enabled={payload.enabled} admin_limit={payload.admin_limit} staff_limit={payload.staff_limit}",
    )
    return _current(db)


@router.post("/device-lock/reset-all")
def reset_all_devices(
    request: Request,
    db: Session = Depends(get_db),
    user: TokenUser = Depends(require_roles()),
):
    """Clear every staff device binding at once (everyone re-binds next login)."""
    result = db.execute(text("UPDATE staff SET device_hash = NULL WHERE device_hash IS NOT NULL"))
    db.commit()
    record_audit(
        "device.reset_all", request=request, actor_id=user.id, actor_name=user.name,
        actor_role=user.role, detail=f"cleared {result.rowcount} binding(s)",
    )
    return {"ok": True, "cleared": result.rowcount}
