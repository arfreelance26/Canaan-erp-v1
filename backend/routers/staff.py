from datetime import datetime, timezone
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
from security import require_roles, parse_devices, serialize_devices, get_current_user, TokenUser
import models, schemas
from duplicate_checks import check_staff_duplicates


def _hash_password(raw: str) -> str:
    # Password policy (LOW-2) disabled until confirmed with client
    # validate_password_strength(raw)
    return pwd_ctx.hash(raw)

router = APIRouter(prefix="/staff", tags=["Staff"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("", response_model=list[schemas.StaffOut])
def list_staff(db: Session = Depends(get_db)):
    return db.query(models.Staff).filter(models.Staff.deleted_at.is_(None)).order_by(models.Staff.staff_id).all()


@router.post("", response_model=schemas.StaffOut, status_code=201, dependencies=[Depends(require_roles())])
def create_staff(payload: schemas.StaffCreate, db: Session = Depends(get_db)):
    check_staff_duplicates(db, payload)
    if db.query(models.Staff).filter(models.Staff.staff_id == payload.staff_id).first():
        raise HTTPException(400, f"Staff ID {payload.staff_id} already exists")
    data = payload.model_dump()
    data["password_hash"] = _hash_password(data.pop("password"))
    member = models.Staff(**data)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.get("/deleted-ids", dependencies=[Depends(require_roles())])
def list_deleted_staff_ids(db: Session = Depends(get_db)):
    """Admin only: ids of staff currently soft-deleted. Lets the "Archive" page
    (which lists from the deletion_approval_requests audit trail) tell apart a
    still-deleted staff member from one that was since restored, same pattern
    as trips.py's list_deleted_trip_ids. Registered before GET /{staff_id} so
    "deleted-ids" isn't swallowed as a staff_id path param."""
    rows = db.query(models.Staff.id).filter(models.Staff.deleted_at.isnot(None)).all()
    return [i for (i,) in rows]


@router.get("/{staff_id}", response_model=schemas.StaffOut)
def get_staff(staff_id: int, db: Session = Depends(get_db)):
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    return member


@router.put("/{staff_id}", response_model=schemas.StaffOut, dependencies=[Depends(require_roles())])
def update_staff(staff_id: int, payload: schemas.StaffUpdate, db: Session = Depends(get_db)):
    check_staff_duplicates(db, payload, exclude_id=staff_id)
    member = db.query(models.Staff).with_for_update().filter(models.Staff.id == staff_id).first()
    if not member:
        raise HTTPException(404, "Staff member not found")
    if payload.client_version is not None and member.version != payload.client_version:
        raise HTTPException(
            409,
            "This staff record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    data = payload.model_dump(exclude_unset=True, exclude={"client_version"})
    if "password" in data:
        data["password_hash"] = _hash_password(data.pop("password"))
    for field, value in data.items():
        setattr(member, field, value)
    member.version = (member.version or 1) + 1
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{staff_id}", status_code=204, dependencies=[Depends(require_roles())])
def delete_staff(staff_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: soft-delete a staff member (hides them from "Our Staff", keeps
    their attendance, payment/compensation history, and chat intact and still
    resolvable). A self-approved DeletionApprovalRequest row is logged for audit
    visibility, same pattern as drivers.py's delete_driver."""
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    if member.deleted_at is not None:
        raise HTTPException(409, "Staff member is already deleted")
    now = datetime.now(timezone.utc)
    member.deleted_at = now
    if current_user.id is not None:
        db.add(models.DeletionApprovalRequest(
            resource_type="Staff",
            resource_id=staff_id,
            resource_name=f"{member.staff_id} — {member.name}",
            requested_by_staff_id=current_user.id,
            requested_by_name=current_user.name,
            reason="Deleted directly by Admin — no approval required.",
            status="Approved",
            approved_by_name=current_user.name,
            approved_at=now,
        ))
    db.commit()


@router.post("/{staff_id}/restore", response_model=schemas.StaffOut, dependencies=[Depends(require_roles())])
def restore_staff(staff_id: int, db: Session = Depends(get_db)):
    """Admin only: undo a soft-delete — the staff member reappears in Our Staff
    exactly as they were."""
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    if member.deleted_at is None:
        raise HTTPException(409, "Staff member is not deleted")
    member.deleted_at = None
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{staff_id}/permanent", status_code=204, dependencies=[Depends(require_roles())])
def permanently_delete_staff(staff_id: int, db: Session = Depends(get_db)):
    """Admin only: irreversibly delete an already soft-deleted staff member. Only
    reachable from the "Archive" page."""
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    db.delete(member)
    db.commit()


class ResetDeviceRequest(BaseModel):
    device: str | None = None  # device id (hash) to remove; None = clear all devices


@router.post("/{staff_id}/reset-device", dependencies=[Depends(require_roles())])
def reset_device(
    staff_id: int,
    payload: ResetDeviceRequest = Body(default=ResetDeviceRequest()),
    db: Session = Depends(get_db),
):
    """Reset device binding so the staff member can re-bind. Admin only.

    With a `device` id, only that device is removed; without one, every bound
    device is cleared."""
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    if payload and payload.device:
        remaining = [d for d in parse_devices(member.device_hash) if d["h"] != payload.device]
        member.device_hash = serialize_devices(remaining)
    else:
        member.device_hash = None
    db.commit()
    return {"ok": True, "devices": member.devices}


@router.post("/{staff_id}/force-logout", dependencies=[Depends(require_roles())])
def force_logout(staff_id: int, db: Session = Depends(get_db)):
    """Invalidate every active session/JWT for a staff member. Admin only.

    Bumps `token_version`; any token whose `tv` claim no longer matches is
    rejected on its next request, so the user must log in again everywhere."""
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    member.token_version = (member.token_version or 0) + 1
    db.commit()
    return {"ok": True, "token_version": member.token_version}
