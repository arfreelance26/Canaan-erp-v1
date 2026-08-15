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
