from datetime import datetime, timezone
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
from security import require_roles, parse_devices, serialize_devices, get_current_user, TokenUser
import models, schemas
from duplicate_checks import check_staff_duplicates
from routers.deletion_approvals import auto_reject_stale_requests


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
def create_staff(
    payload: schemas.StaffCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    check_staff_duplicates(db, payload)
    if db.query(models.Staff).filter(models.Staff.staff_id == payload.staff_id).first():
        raise HTTPException(400, f"Staff ID {payload.staff_id} already exists")
    data = payload.model_dump()
    data["password_hash"] = _hash_password(data.pop("password"))
    member = models.Staff(**data)
    db.add(member)
    db.commit()
    db.refresh(member)
    db.add(models.StaffEditEvent(
        staff_id=member.id, event="Staff Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
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


@router.get("/edit-events", response_model=list[schemas.StaffEditEventListOut])
def list_all_staff_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete/Restore event ever logged, across every staff
    member — the page-wide "Edit History" log on Our Staff, so
    who-changed-what is searchable in one place instead of opening each staff
    member individually. Most recent first. Registered before GET
    /{staff_id} so "edit-events" isn't swallowed as a staff_id path param.
    """
    events = (
        db.query(models.StaffEditEvent)
        .order_by(models.StaffEditEvent.created_at.desc(), models.StaffEditEvent.id.desc())
        .all()
    )
    if not events:
        return []
    staff_ids = {e.staff_id for e in events}
    staff_by_id = {s.id: s for s in db.query(models.Staff).filter(models.Staff.id.in_(staff_ids)).all()}

    result = []
    for e in events:
        member = staff_by_id.get(e.staff_id)
        result.append({
            "id": e.id,
            "staff_id": e.staff_id,
            "staff_id_str": member.staff_id if member else "—",
            "staff_name": member.name if member else "(deleted)",
            "event": e.event,
            "actor_name": e.actor_name,
            "actor_role": e.actor_role,
            "created_at": e.created_at,
        })
    return result


@router.get("/freeze-events", response_model=list[schemas.StaffFreezeEventOut], dependencies=[Depends(require_roles())])
def list_freeze_events(staff_id: int | None = None, db: Session = Depends(get_db)):
    """Admin only: every Freeze / Unfreeze, newest first — all staff, or one
    (staff_id). Registered before GET /{staff_id}."""
    q = (
        db.query(models.StaffFreezeEvent, models.Staff)
        .join(models.Staff, models.Staff.id == models.StaffFreezeEvent.staff_id)
    )
    if staff_id is not None:
        q = q.filter(models.StaffFreezeEvent.staff_id == staff_id)
    rows = q.order_by(models.StaffFreezeEvent.created_at.desc(), models.StaffFreezeEvent.id.desc()).all()
    return [{
        "id": e.id, "staff_id": m.id, "staff_id_str": m.staff_id, "staff_name": m.name,
        "event": e.event, "reason": e.reason, "actor_name": e.actor_name, "actor_role": e.actor_role,
        "created_at": e.created_at,
    } for e, m in rows]


@router.get("/{staff_id}", response_model=schemas.StaffOut)
def get_staff(staff_id: int, db: Session = Depends(get_db)):
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    return member


@router.put("/{staff_id}", response_model=schemas.StaffOut, dependencies=[Depends(require_roles())])
def update_staff(
    staff_id: int,
    payload: schemas.StaffUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
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
    db.add(models.StaffEditEvent(
        staff_id=member.id, event="Staff Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
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
    # Always log the audit row (even for the built-in "admin" login, whose
    # current_user.id is None) — see drivers.py's delete_driver for rationale.
    db.add(models.DeletionApprovalRequest(
        resource_type="Staff",
        resource_id=staff_id,
        resource_name=f"{member.staff_id} — {member.name}",
        requested_by_staff_id=current_user.id or 0,
        requested_by_name=current_user.name,
        reason="Deleted directly by Admin — no approval required.",
        status="Approved",
        approved_by_name=current_user.name,
        approved_at=now,
    ))
    db.add(models.StaffEditEvent(
        staff_id=staff_id, event="Staff Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()


@router.post("/{staff_id}/restore", response_model=schemas.StaffOut, dependencies=[Depends(require_roles())])
def restore_staff(
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin only: undo a soft-delete — the staff member reappears in Our Staff
    exactly as they were."""
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    if member.deleted_at is None:
        raise HTTPException(409, "Staff member is not deleted")
    member.deleted_at = None
    db.add(models.StaffEditEvent(
        staff_id=member.id, event="Staff Restored",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{staff_id}/permanent", status_code=204, dependencies=[Depends(require_roles())])
def permanently_delete_staff(staff_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: irreversibly delete an already soft-deleted staff member. Only
    reachable from the "Archive" page."""
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    auto_reject_stale_requests(db, "Staff", staff_id, current_user.name)
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


# ---------------------------------------------------------------------------
# Freeze Account — owner password only (the Chat Owner View password)
# ---------------------------------------------------------------------------

def _check_owner_password(db: Session, request: Request, current_user: TokenUser, password: str, action: str) -> None:
    """Same password, lockout (5 wrong tries → 15 min) and audit trail as
    Chat Owner View. A wrong password is 403 (not 401) so the Admin's own
    session isn't treated as expired."""
    import settings_store
    from audit import record_audit
    from routers.chat_owner_view import _check_lockout, _record_failure, _clear_failures
    key = current_user.id or 0
    _check_lockout(key)
    configured = settings_store.chat_owner_view_password_hash(db) is not None
    if not settings_store.verify_chat_owner_view_password(db, password):
        _record_failure(key)
        record_audit(f"staff.{action}", outcome="denied", request=request, actor_id=current_user.id,
                     actor_name=current_user.name, actor_role=current_user.role,
                     detail="owner password not set up" if not configured else "wrong owner password")
        if not configured:
            raise HTTPException(409, "The owner password hasn't been set up yet.")
        raise HTTPException(403, "Wrong owner password.")
    _clear_failures(key)


def _freeze_target(db: Session, staff_id: int, current_user: TokenUser) -> models.Staff:
    member = db.query(models.Staff).with_for_update().filter(models.Staff.id == staff_id).first()
    if not member or member.deleted_at is not None:
        raise HTTPException(404, "Staff member not found")
    if current_user.id is not None and member.id == current_user.id:
        raise HTTPException(400, "You can't freeze the account you're logged in with.")
    # The built-in admin login uses the first Admin staff record (routers/auth.py)
    # — freezing it wouldn't stop that login, so it's not allowed.
    builtin = db.query(models.Staff.id).filter(models.Staff.software_designation == "Admin").first()
    if builtin and member.id == builtin[0]:
        raise HTTPException(400, "This record is used by the built-in admin login and can't be frozen.")
    return member


@router.post("/{staff_id}/freeze", response_model=schemas.StaffOut, dependencies=[Depends(require_roles())])
def freeze_staff(staff_id: int, payload: schemas.StaffFreezeIn, request: Request,
                 db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Freeze an account: no logins, every session ended now (open screens
    are told and sent to the login page). Needs a reason and the owner password."""
    from audit import record_audit
    from websocket_manager import kick_users
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(400, "Please give a reason.")
    member = _freeze_target(db, staff_id, current_user)
    if member.frozen_at is not None:
        raise HTTPException(409, f"{member.name}'s account is already frozen.")
    _check_owner_password(db, request, current_user, payload.owner_password, "freeze")
    member.frozen_at = datetime.now(timezone.utc)
    member.frozen_by_name = current_user.name
    member.frozen_reason = reason
    member.token_version = (member.token_version or 0) + 1   # ends every session it holds
    db.add(models.StaffFreezeEvent(staff_id=member.id, event="Frozen", reason=reason,
                                   actor_name=current_user.name or "Unknown", actor_role=current_user.role))
    db.commit()
    db.refresh(member)
    record_audit("staff.freeze", request=request, actor_id=current_user.id, actor_name=current_user.name,
                 actor_role=current_user.role, resource=f"staff:{member.id}", detail=reason)
    kick_users([member.id], "account_frozen", {"message": "Your account has been frozen by the Admin."})
    return member


@router.post("/{staff_id}/unfreeze", response_model=schemas.StaffOut, dependencies=[Depends(require_roles())])
def unfreeze_staff(staff_id: int, payload: schemas.StaffFreezeIn, request: Request,
                   db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Let a frozen account log in again. Needs a reason and the owner password."""
    from audit import record_audit
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(400, "Please give a reason.")
    member = db.query(models.Staff).with_for_update().filter(models.Staff.id == staff_id).first()
    if not member or member.deleted_at is not None:
        raise HTTPException(404, "Staff member not found")
    if member.frozen_at is None:
        raise HTTPException(409, f"{member.name}'s account isn't frozen.")
    _check_owner_password(db, request, current_user, payload.owner_password, "unfreeze")
    member.frozen_at = None
    member.frozen_by_name = None
    member.frozen_reason = None
    db.add(models.StaffFreezeEvent(staff_id=member.id, event="Unfrozen", reason=reason,
                                   actor_name=current_user.name or "Unknown", actor_role=current_user.role))
    db.commit()
    db.refresh(member)
    record_audit("staff.unfreeze", request=request, actor_id=current_user.id, actor_name=current_user.name,
                 actor_role=current_user.role, resource=f"staff:{member.id}", detail=reason)
    return member
