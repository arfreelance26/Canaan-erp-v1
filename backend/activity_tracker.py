"""Activity tracking: records every API request and client event with almost no cost.

Requests never wait on the database. Each event is appended to an in-memory buffer, and one
background thread writes the buffer to the database in bulk every few seconds. GET requests
are not stored one by one: they are counted per person, per route, per minute, with the
first and last time of those reads inside the minute.

Everything here is best-effort bookkeeping. A failure is logged and never reaches the user.
"""
import atexit
import logging
import re
import threading
import time
from collections import deque
from datetime import date, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.dialects.mysql import insert as mysql_insert

import models
from database import SessionLocal
from security import decode_token

log = logging.getLogger("activity")

FLUSH_SECONDS = 3
MAX_BUFFER = 20_000          # hard cap: if the database is unreachable for long, the oldest events are dropped
RETENTION_DAYS = 180
PURGE_EVERY_SECONDS = 86_400
CLIENT_EVENTS_PER_MINUTE = 300   # per signed-in user; extra browser events are dropped
_IST = ZoneInfo("Asia/Kolkata")

_ID_SEGMENT = re.compile(
    r"/(\d+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?=/|$)"
)

_lock = threading.Lock()
_events: deque = deque()
# (user_key, user_name, route, minute) -> [count, first_at, last_at]
_reads: dict = {}
# user_key -> [window_minute, events_taken_in_that_minute]
_client_budget: dict = {}
_dropped = 0


def route_template(path: str) -> str:
    """'/trips/1438/invoice' -> '/trips/{id}/invoice', so one screen is one route."""
    return _ID_SEGMENT.sub("/{id}", path)[:200]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _push(row: dict) -> None:
    global _dropped
    with _lock:
        if len(_events) >= MAX_BUFFER:
            _events.popleft()
            _dropped += 1
        _events.append(row)


def take_client_budget(user_key: str, wanted: int) -> int:
    """How many of `wanted` browser events this user may still send in the current minute."""
    now = _utc_now().replace(second=0, microsecond=0)
    with _lock:
        window, used = _client_budget.get(user_key, [now, 0])
        if window != now:
            window, used = now, 0
        allowed = max(0, min(wanted, CLIENT_EVENTS_PER_MINUTE - used))
        _client_budget[user_key] = [window, used + allowed]
        if len(_client_budget) > 5_000:
            # Forget users whose window has passed, so the table stays small.
            for k in [k for k, (w, _) in _client_budget.items() if w != now]:
                del _client_budget[k]
    return allowed


def _who(auth_header: str | None) -> tuple[str, str, int | None, str | None]:
    """(user_key, user_name, user_id, role). Unauthenticated requests are 'anon'."""
    if not auth_header or not auth_header.startswith("Bearer "):
        return ("anon", "anonymous", None, None)
    try:
        payload = decode_token(auth_header.removeprefix("Bearer ").strip())
    except Exception:
        return ("anon", "anonymous", None, None)
    sub = payload.get("sub")
    name = (payload.get("name") or "")[:100]
    role = payload.get("role")
    if not sub or sub == "admin":
        return ("admin", name or "Admin", None, role)
    return (str(sub), name, int(sub), role)


def record_request(method: str, path: str, status: int, duration_ms: float,
                   auth_header: str | None, ip: str | None) -> None:
    user_key, user_name, user_id, role = _who(auth_header)
    route = route_template(path)
    now = _utc_now()

    if path == "/auth/login":
        kind = "login" if status < 400 else "login_failed"
    elif path == "/auth/logout":
        kind = "logout"
    elif method == "GET":
        # Reads are counted per minute, with the first and last time inside that minute.
        minute = now.replace(second=0, microsecond=0)
        key = (user_key, user_name, route, minute)
        with _lock:
            entry = _reads.get(key)
            if entry is None:
                _reads[key] = [1, now, now]
            else:
                entry[0] += 1
                entry[2] = now
        return
    elif method == "DELETE":
        kind = "delete"
    elif "export" in path:
        kind = "export"
    else:
        kind = "save"

    _push({
        "created_at": now, "user_key": user_key, "user_name": user_name, "user_id": user_id,
        "role": (role or "")[:60] or None, "kind": kind, "method": method[:8], "route": route,
        "label": None, "status": status, "duration_ms": int(duration_ms),
        "ip": (ip or "")[:45] or None,
    })


def record_client(user_key: str, user_name: str, user_id: int | None, role: str | None,
                  ip: str | None, items: list[dict]) -> None:
    """Page views and clicks sent by the browser (see POST /activity/batch)."""
    now = _utc_now()
    for item in items:
        _push({
            "created_at": now, "user_key": user_key, "user_name": user_name, "user_id": user_id,
            "role": (role or "")[:60] or None, "kind": item["kind"], "method": None,
            "route": route_template(item["route"]), "label": (item.get("label") or None),
            "status": None, "duration_ms": None, "ip": (ip or "")[:45] or None,
        })


def _flush_once() -> int:
    with _lock:
        events = list(_events)
        _events.clear()
        reads = dict(_reads)
        _reads.clear()
    if not events and not reads:
        return 0

    db = SessionLocal()
    try:
        if events:
            db.bulk_insert_mappings(models.ActivityEvent, events)
        if reads:
            rows = [
                {"user_key": k[0], "user_name": k[1], "route": k[2], "minute": k[3],
                 "count": v[0], "first_at": v[1], "last_at": v[2]}
                for k, v in reads.items()
            ]
            stmt = mysql_insert(models.ActivityMinute).values(rows)
            stmt = stmt.on_duplicate_key_update(
                count=models.ActivityMinute.count + stmt.inserted.count,
                first_at=func.least(models.ActivityMinute.first_at, stmt.inserted.first_at),
                last_at=func.greatest(models.ActivityMinute.last_at, stmt.inserted.last_at),
                user_name=stmt.inserted.user_name,
            )
            db.execute(stmt)
        db.commit()
        return len(events)
    except Exception:
        db.rollback()
        # Put the work back so a short database hiccup loses nothing.
        with _lock:
            for e in reversed(events):
                _events.appendleft(e)
            while len(_events) > MAX_BUFFER:
                _events.pop()
            for k, v in reads.items():
                if k in _reads:
                    _reads[k][0] += v[0]
                    _reads[k][1] = min(_reads[k][1], v[1])
                    _reads[k][2] = max(_reads[k][2], v[2])
                else:
                    _reads[k] = list(v)
        raise
    finally:
        db.close()


def _purge_old() -> None:
    cutoff = _utc_now() - timedelta(days=RETENTION_DAYS)
    db = SessionLocal()
    try:
        while True:
            ids = [r for (r,) in db.query(models.ActivityEvent.id)
                   .filter(models.ActivityEvent.created_at < cutoff).limit(5000).all()]
            if not ids:
                break
            db.query(models.ActivityEvent).filter(models.ActivityEvent.id.in_(ids)).delete(synchronize_session=False)
            db.commit()
        db.query(models.ActivityMinute).filter(models.ActivityMinute.minute < cutoff).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _loop() -> None:
    last_purge = 0.0
    while True:
        time.sleep(FLUSH_SECONDS)
        try:
            _flush_once()
        except Exception:
            log.exception("activity flush failed; will retry")
        if time.time() - last_purge > PURGE_EVERY_SECONDS:
            try:
                _purge_old()
                last_purge = time.time()
            except Exception:
                log.exception("activity purge failed; will retry")


def _flush_at_exit() -> None:
    try:
        _flush_once()
    except Exception:
        pass


def start() -> None:
    threading.Thread(target=_loop, name="activity-tracker", daemon=True).start()
    atexit.register(_flush_at_exit)


def today_ist() -> date:
    return datetime.now(_IST).date()


def day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """A day in IST, expressed as a UTC range (the stored timestamps are UTC)."""
    start_ist = datetime.combine(day, dtime(), tzinfo=_IST)
    start_utc = start_ist.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, start_utc + timedelta(days=1)
