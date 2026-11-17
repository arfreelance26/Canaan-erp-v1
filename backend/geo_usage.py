"""Keeping Geoapify cheap and spam-proof. Every request goes through
geo_distance._call, which uses this module:

  cache    a lasting cache of every answer (geo_cache): the same question is
           never paid for twice, across restarts too (kept CACHE_DAYS)
  budget   at most DAILY_CREDITS a day for the whole app (India time), keeping
           a reserve under Geoapify's free 3,000
  person   at most HOURLY_CREDITS an hour for one person — normal use never
           comes close; a runaway click or a script does
  log      every paid request is recorded (geo_usage): who, what, credits —
           Admin's usage line (usage_today)

Who is asking comes from `as_user(...)`, set around a request's lookups by the
routers. Usage rows are written in their own session, so a lookup inside a
request never commits (or rolls back) the request's own work.
"""
from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

from sqlalchemy import func

DAILY_CREDITS = 2500
HOURLY_CREDITS = 180          # about 60 three-credit lookups
CACHE_DAYS = 180
IST = timezone(timedelta(hours=5, minutes=30))

# Who is asking: (staff id, name) — None for the system (scripts, tests).
_who: ContextVar[tuple[int | None, str | None] | None] = ContextVar("geo_who", default=None)


class LimitReached(Exception):
    """A plain-language reason the lookup wasn't made (shown to the user)."""


@contextmanager
def as_user(user):
    """Charge this block's Geoapify requests to `user` (a TokenUser)."""
    token = _who.set((getattr(user, "id", None), getattr(user, "name", None)))
    try:
        yield
    finally:
        _who.reset(token)


def _session():
    import database
    return database.SessionLocal()


def cache_key(url: str, params: dict) -> str:
    clean = {k: v for k, v in params.items() if k != "apiKey"}
    raw = url + "?" + json.dumps(clean, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def cached(key: str) -> dict | None:
    import models
    db = _session()
    try:
        row = db.query(models.GeoCache).filter(models.GeoCache.key == key).first()
        if not row:
            return None
        made = row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=timezone.utc)
        if made < datetime.now(timezone.utc) - timedelta(days=CACHE_DAYS):
            return None
        return json.loads(row.value)
    finally:
        db.close()


def remember(key: str, kind: str, value: dict) -> None:
    import models
    db = _session()
    try:
        row = db.query(models.GeoCache).filter(models.GeoCache.key == key).first()
        if row:
            row.value, row.created_at = json.dumps(value), datetime.now(timezone.utc)
        else:
            db.add(models.GeoCache(key=key, kind=kind, value=json.dumps(value)))
        db.commit()
    except Exception:
        db.rollback()      # a cache that can't be written is only a missed saving
    finally:
        db.close()


def _today_start_utc() -> datetime:
    now = datetime.now(IST)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)


def check(credits: int = 1) -> None:
    """Raise LimitReached if this request would go over today's budget or the person's hour."""
    import models
    who = _who.get()
    db = _session()
    try:
        used_today = db.query(func.coalesce(func.sum(models.GeoUsage.credits), 0)).filter(
            models.GeoUsage.created_at >= _today_start_utc()).scalar() or 0
        if used_today + credits > DAILY_CREDITS:
            raise LimitReached("Today's road-distance limit is reached. Enter the km by hand; it works again tomorrow.")
        if who and who[0] is not None:
            hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).replace(tzinfo=None)
            mine = db.query(func.coalesce(func.sum(models.GeoUsage.credits), 0)).filter(
                models.GeoUsage.staff_id == who[0], models.GeoUsage.created_at >= hour_ago).scalar() or 0
            if mine + credits > HOURLY_CREDITS:
                raise LimitReached("You've used the road-distance lookup a lot in the last hour. "
                                   "Please wait a while, or enter the km by hand.")
    finally:
        db.close()


def record(kind: str, credits: int = 1) -> None:
    import models
    who = _who.get() or (None, None)
    db = _session()
    try:
        db.add(models.GeoUsage(staff_id=who[0], staff_name=who[1], kind=kind, credits=credits))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def usage_today() -> dict:
    """Admin's line: credits used today (India time), the budget, and who used most."""
    import models
    db = _session()
    try:
        since = _today_start_utc()
        used = db.query(func.coalesce(func.sum(models.GeoUsage.credits), 0)).filter(models.GeoUsage.created_at >= since).scalar() or 0
        by = (db.query(models.GeoUsage.staff_name, func.sum(models.GeoUsage.credits))
              .filter(models.GeoUsage.created_at >= since)
              .group_by(models.GeoUsage.staff_name)
              .order_by(func.sum(models.GeoUsage.credits).desc()).limit(5).all())
        cached_answers = db.query(func.count(models.GeoCache.id)).scalar() or 0
        return {"used": int(used), "budget": DAILY_CREDITS, "hourly_per_person": HOURLY_CREDITS,
                "by_person": [{"name": n or "System", "credits": int(c)} for n, c in by],
                "cached_answers": int(cached_answers)}
    finally:
        db.close()
