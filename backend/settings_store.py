"""Runtime-editable app settings, backed by the `app_settings` table.

Each getter returns the DB value when a row exists, otherwise the matching
.env default — so behaviour is unchanged until an Admin overrides it from the
UI, and a fresh database still boots with the .env configuration.
"""
import os

from sqlalchemy.orm import Session

import models

DEVICE_LOCK_KEY = "device_lock_enabled"
ADMIN_LIMIT_KEY = "admin_device_limit"
STAFF_LIMIT_KEY = "staff_device_limit"

_TRUE = ("1", "true", "yes", "on")


def _get(db: Session, key: str) -> str | None:
    row = db.get(models.AppSetting, key)
    return row.value if row else None


def _set(db: Session, key: str, value: str) -> None:
    row = db.get(models.AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(models.AppSetting(key=key, value=value))
    db.commit()


def device_lock_enabled(db: Session) -> bool:
    v = _get(db, DEVICE_LOCK_KEY)
    if v is None:
        v = os.getenv("DEVICE_LOCK_ENABLED", "true")
    return v.strip().lower() in _TRUE


def set_device_lock_enabled(db: Session, enabled: bool) -> None:
    _set(db, DEVICE_LOCK_KEY, "true" if enabled else "false")


def admin_device_limit(db: Session) -> int:
    v = _get(db, ADMIN_LIMIT_KEY)
    if v is None:
        v = os.getenv("ADMIN_DEVICE_LIMIT", "2")
    try:
        return max(1, int(v))
    except (TypeError, ValueError):
        return 2


def set_admin_device_limit(db: Session, limit: int) -> None:
    _set(db, ADMIN_LIMIT_KEY, str(max(1, int(limit))))


def staff_device_limit(db: Session) -> int:
    v = _get(db, STAFF_LIMIT_KEY)
    if v is None:
        v = os.getenv("STAFF_DEVICE_LIMIT", "1")
    try:
        return max(1, int(v))
    except (TypeError, ValueError):
        return 1


def set_staff_device_limit(db: Session, limit: int) -> None:
    _set(db, STAFF_LIMIT_KEY, str(max(1, int(limit))))


MAX_SHIFT_KEY = "staff_max_shift_hours"
DEFAULT_MAX_SHIFT_HOURS = 12


def staff_max_shift_hours(db: Session) -> int:
    """Hours of genuine inactivity (no real logged activity, not just elapsed
    time since check-in — see routers/attendance.py auto_close_expired_shifts)
    before an open shift is auto-closed. Key/function names kept as-is since
    this is just a stored hour count either way; only the trigger changed."""
    v = _get(db, MAX_SHIFT_KEY)
    if v is None:
        v = os.getenv("STAFF_MAX_SHIFT_HOURS", str(DEFAULT_MAX_SHIFT_HOURS))
    try:
        return min(24, max(1, int(v)))
    except (TypeError, ValueError):
        return DEFAULT_MAX_SHIFT_HOURS


def set_staff_max_shift_hours(db: Session, hours: int) -> None:
    _set(db, MAX_SHIFT_KEY, str(int(hours)))


AUTO_CLOSE_ENABLED_KEY = "staff_auto_close_shifts_enabled"


def auto_close_shifts_enabled(db: Session) -> bool:
    """Whether the auto-close-shift feature runs at all. Defaults to on (the
    original always-on behavior), so an existing deployment's behavior is
    unchanged until an Admin explicitly turns it off — see
    auto_close_worker.py's loop, which skips its sweep entirely while off."""
    v = _get(db, AUTO_CLOSE_ENABLED_KEY)
    if v is None:
        v = os.getenv("STAFF_AUTO_CLOSE_SHIFTS_ENABLED", "true")
    return v.strip().lower() in _TRUE


def set_auto_close_shifts_enabled(db: Session, enabled: bool) -> None:
    _set(db, AUTO_CLOSE_ENABLED_KEY, "true" if enabled else "false")


ATTENDANCE_MANDATORY_KEY = "attendance_marking_mandatory"


def attendance_marking_mandatory(db: Session) -> bool:
    """Whether staff are required to mark attendance. Stored here as a flag
    only — nothing enforces it yet (see SetWorkingHoursDialog's toggle)."""
    v = _get(db, ATTENDANCE_MANDATORY_KEY)
    if v is None:
        v = os.getenv("ATTENDANCE_MARKING_MANDATORY", "false")
    return v.strip().lower() in _TRUE


def set_attendance_marking_mandatory(db: Session, mandatory: bool) -> None:
    _set(db, ATTENDANCE_MANDATORY_KEY, "true" if mandatory else "false")


# ---------------------------------------------------------------------------
# Canaan Chat owner view — the password that unlocks the read-only, every-
# conversation view. Deliberately separate from any staff login password.
# ---------------------------------------------------------------------------
from passlib.context import CryptContext  # noqa: E402 — grouped with the setting it serves, not at top of file

CHAT_OWNER_VIEW_PASSWORD_HASH_KEY = "chat_owner_view_password_hash"
_owner_view_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def chat_owner_view_password_hash(db: Session) -> str | None:
    """The stored hash, or None if owner view has never been set up.

    On first use only, if CHAT_OWNER_VIEW_PASSWORD is set in the environment,
    that password is hashed and saved here once — the plain env value is never
    read again after that, and changing it later requires the current password
    (see update_chat_owner_view_password)."""
    v = _get(db, CHAT_OWNER_VIEW_PASSWORD_HASH_KEY)
    if v is not None:
        return v
    initial = os.getenv("CHAT_OWNER_VIEW_PASSWORD")
    if not initial:
        return None
    hashed = _owner_view_pwd_ctx.hash(initial)
    _set(db, CHAT_OWNER_VIEW_PASSWORD_HASH_KEY, hashed)
    return hashed


def verify_chat_owner_view_password(db: Session, password: str) -> bool:
    hashed = chat_owner_view_password_hash(db)
    return bool(hashed) and _owner_view_pwd_ctx.verify(password, hashed)


def set_chat_owner_view_password(db: Session, new_password: str) -> None:
    _set(db, CHAT_OWNER_VIEW_PASSWORD_HASH_KEY, _owner_view_pwd_ctx.hash(new_password))
