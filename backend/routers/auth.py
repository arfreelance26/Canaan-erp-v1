import os
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
from security import create_access_token
import models

router = APIRouter(prefix="/auth", tags=["Auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin@canaan.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")

# ---------------------------------------------------------------------------
# Brute-force protection: 5 failed attempts per username → 15 minute lockout.
# In-memory; resets on restart, which is acceptable for this deployment size.
# ---------------------------------------------------------------------------
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
_failed_attempts: dict[str, list[float]] = defaultdict(list)


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
    username = payload.username.strip()
    lockout_key = username.lower()
    _check_lockout(lockout_key)

    if username.lower() == ADMIN_USERNAME.lower() and payload.password == ADMIN_PASSWORD:
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
        raise HTTPException(status_code=401, detail="Invalid username or password")

    _clear_failures(lockout_key)
    role = member.software_designation or "Trip Sheet Register"
    token = create_access_token(user_id=member.id, name=member.name, role=role, staff_id=member.staff_id)
    return LoginResponse(
        access_token=token,
        id=member.id,
        name=member.name,
        email=member.email or member.username or "",
        software_designation=role,
        staff_id=member.staff_id,
        photo_url=member.photo_url,
    )
