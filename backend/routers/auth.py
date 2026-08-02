import os
import secrets
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
from security import create_access_token, decode_token, revoke_token, get_current_user, IS_PRODUCTION, TokenUser
from audit import record_audit
import models

router = APIRouter(prefix="/auth", tags=["Auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin@canaan.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

# HIGH-3: fail-closed startup check — disabled until confirmed with client
# if IS_PRODUCTION and (not ADMIN_PASSWORD or len(ADMIN_PASSWORD) < 10):
#     raise RuntimeError(
#         "ADMIN_PASSWORD is not set (or is too weak) and APP_ENV=production. "
#         "Refusing to start with an insecure built-in admin credential. "
#         "Set a strong ADMIN_PASSWORD (>= 10 chars) in the environment."
#     )

# ---------------------------------------------------------------------------
# Brute-force protection. Counts failures per (IP + username) so that:
#   - an attacker cannot lock out a legitimate user by spamming their username
#     from elsewhere (each source IP has its own counter), and
#   - credential-stuffing from one IP across many usernames is still throttled.
# In-memory (single-worker uvicorn). Move to Redis for horizontal scale — see
# SECURITY_PLAN.md MEDIUM-3.
# ---------------------------------------------------------------------------
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
_failed_attempts: dict[str, list[float]] = defaultdict(list)


def _lockout_key(ip: str, username: str) -> str:
    return f"{ip}|{username.lower()}"


def _check_lockout(key: str):
    now = time.time()
    _failed_attempts[key] = [t for t in _failed_attempts[key] if now - t < LOCKOUT_SECONDS]
    if len(_failed_attempts[key]) >= MAX_ATTEMPTS:
        remaining = int(LOCKOUT_SECONDS - (now - _failed_attempts[key][0]))
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in {max(remaining // 60, 1)} minute(s).",
        )


def _record_failure(key: str):
    _failed_attempts[key].append(time.time())


def _clear_failures(key: str):
    _failed_attempts.pop(key, None)


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    id: int | None
    name: str
    email: str
    software_designation: str
    staff_id: str | None
    photo_url: str | None


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    from audit import client_ip
    username = payload.username.strip()
    ip = client_ip(request) or "unknown"
    lockout_key = _lockout_key(ip, username)
    _check_lockout(lockout_key)

    # Constant-time comparison for both fields. ADMIN_PASSWORD may be unset in dev;
    # `secrets.compare_digest` needs two non-empty strings, so guard on it.
    admin_user_ok = secrets.compare_digest(username.lower(), ADMIN_USERNAME.lower())
    admin_pass_ok = bool(ADMIN_PASSWORD) and secrets.compare_digest(payload.password, ADMIN_PASSWORD)
    if admin_user_ok and admin_pass_ok:
        _clear_failures(lockout_key)
        # Find or auto-create the Admin Staff record so attendance self-marking works
        admin_staff = (
            db.query(models.Staff)
            .filter(models.Staff.software_designation == "Admin")
            .first()
        )
        if not admin_staff:
            # Check if the ADMIN staff_id slot is taken by a record with a different designation
            existing = db.query(models.Staff).filter(models.Staff.staff_id == "ADMIN").first()
            if existing:
                existing.software_designation = "Admin"
                db.commit()
                db.refresh(existing)
                admin_staff = existing
            else:
                admin_staff = models.Staff(
                    staff_id="ADMIN",
                    name="Administrator",
                    software_designation="Admin",
                )
                db.add(admin_staff)
                db.commit()
                db.refresh(admin_staff)
        token = create_access_token(user_id=admin_staff.id, name=admin_staff.name, role="Admin", staff_id=admin_staff.staff_id)
        record_audit("login.success", request=request, actor_id=admin_staff.id,
                     actor_name=admin_staff.name, actor_role="Admin", detail="built-in admin")
        return LoginResponse(
            access_token=token,
            id=admin_staff.id,
            name=admin_staff.name,
            email=ADMIN_USERNAME,
            software_designation="Admin",
            staff_id=admin_staff.staff_id,
            photo_url=admin_staff.photo_url,
        )

    member = (
        db.query(models.Staff)
        .filter(models.Staff.username == username)
        .first()
    )
    if not member or not member.password_hash or not pwd_ctx.verify(payload.password, member.password_hash):
        _record_failure(lockout_key)
        record_audit("login.failure", outcome="failure", request=request,
                     actor_name=username, detail="invalid credentials")
        raise HTTPException(status_code=401, detail="Invalid username or password")

    _clear_failures(lockout_key)
    role = member.software_designation or "Trip Sheet Register"
    token = create_access_token(user_id=member.id, name=member.name, role=role, staff_id=member.staff_id)
    record_audit("login.success", request=request, actor_id=member.id,
                 actor_name=member.name, actor_role=role)
    return LoginResponse(
        access_token=token,
        id=member.id,
        name=member.name,
        email=member.email or member.username or "",
        software_designation=role,
        staff_id=member.staff_id,
        photo_url=member.photo_url,
    )


@router.get("/audit-logs")
def get_audit_logs(
    skip: int = 0,
    limit: int = 50,
    event: str | None = None,
    user_filter: str | None = Query(default=None, alias="user"),
    ip_filter: str | None = Query(default=None, alias="ip"),
    db: Session = Depends(get_db),
    user: TokenUser = Depends(get_current_user),
):
    """Return paginated audit log entries. Admin only."""
    if user.role != "Admin":
        raise HTTPException(403, "Admin only")
    q = db.query(models.AuditLog).order_by(models.AuditLog.id.desc())
    if event:
        q = q.filter(models.AuditLog.event == event)
    if user_filter:
        q = q.filter(models.AuditLog.actor_name.ilike(f"%{user_filter}%"))
    if ip_filter:
        q = q.filter(models.AuditLog.ip_address.ilike(f"%{ip_filter}%"))
    total = q.count()
    rows = q.offset(skip).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "event": r.event,
                "outcome": r.outcome,
                "actor_name": r.actor_name,
                "actor_role": r.actor_role,
                "resource": r.resource,
                "ip_address": r.ip_address,
                "detail": r.detail,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/lockouts")
def get_lockouts(user: TokenUser = Depends(get_current_user)):
    """Return currently active login lockouts (IP + username). Admin only."""
    if user.role != "Admin":
        raise HTTPException(403, "Admin only")
    now = time.time()
    active = []
    for key, attempts in list(_failed_attempts.items()):
        recent = [t for t in attempts if now - t < LOCKOUT_SECONDS]
        if len(recent) >= MAX_ATTEMPTS:
            remaining_sec = int(LOCKOUT_SECONDS - (now - recent[0]))
            ip, username = key.split("|", 1)
            active.append({
                "ip_address": ip,
                "username": username,
                "failed_attempts": len(recent),
                "locked_until_seconds": max(remaining_sec, 0),
            })
    return {"items": active}


class ResetLockoutRequest(BaseModel):
    ip_address: str
    username: str


@router.post("/lockouts/reset", status_code=204)
def reset_lockout(payload: ResetLockoutRequest, request: Request, user: TokenUser = Depends(get_current_user)):
    """Admin manually clears a lockout for a specific IP + username pair."""
    if user.role != "Admin":
        raise HTTPException(403, "Admin only")
    key = _lockout_key(payload.ip_address, payload.username)
    _clear_failures(key)
    record_audit(
        "lockout.reset",
        request=request,
        actor_id=user.id,
        actor_name=user.name,
        actor_role=user.role,
        resource=f"{payload.ip_address}|{payload.username}",
        detail="admin manually cleared lockout",
    )


@router.post("/logout", status_code=204)
def logout(request: Request, user: TokenUser = Depends(get_current_user)):
    """Server-side logout: add this token's jti to the revocation denylist so a
    stolen-but-not-yet-expired token cannot be reused after the user logs out."""
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    try:
        jti = decode_token(token).get("jti")
        if jti:
            revoke_token(jti)
    except Exception:  # noqa: BLE001 — logout is best-effort; already-invalid tokens are fine
        pass
    record_audit("logout", request=request, actor_id=user.id, actor_name=user.name, actor_role=user.role)
