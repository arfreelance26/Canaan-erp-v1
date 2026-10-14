"""Activity tracking: records every API request and client event with almost no cost.

Requests never wait on the database. Each event is appended to an in-memory buffer, and it
is written to the database in bulk via flush_if_due() — attached as a Starlette BackgroundTask
to whichever response happens to be due for one (see activity_tracking middleware in main.py),
so it always runs *after* that response has already been sent and never adds latency to it.
GET requests are not stored one by one: they are counted per person, per route, per minute,
with the first and last time of those reads inside the minute.

This piggybacks flushing on real request traffic instead of a dedicated background thread.
The previous design needed one of those per worker process, which in turn needed a Phusion
Passenger "starting_worker_process" fork hook to re-launch it after every worker fork (Python
threads don't survive fork()) — easy-to-silently-drop wiring that broke activity tracking in
production once already when a deploy/merge dropped that hook. Piggybacking on request traffic
needs no such hook: it behaves identically in dev (uvicorn) and prod (Passenger) with no
environment-specific code at all, so it cannot be broken that way again.

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

from jose import jwt

import models
from database import SessionLocal
from security import ALGORITHM, SECRET_KEY

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
# Set to "now" at import time (not 0) so a freshly started worker process
# doesn't immediately treat itself as "due" for a flush/purge on its very
# first request — with many Passenger workers forking around the same time,
# that would mean every one of them running a purge query at once.
_last_flush = time.monotonic()
_last_purge = time.monotonic()


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


def _who(auth_header: str | None) -> tuple[str, str, int | None, str | None] | None:
    """(user_key, user_name, user_id, role), or None when the request can't be
    tied to a real person.

    Identity only — not authorization (the route itself already did that). So
    the signature is still verified, but expiry and the logout denylist are
    deliberately NOT: an expired session's 401s and the /auth/logout call
    itself (whose token is revoked a moment before this runs) still belong to
    a real, known employee. Only requests with no token or a forged one are
    unattributable, and those are simply not recorded — the log never shows
    an "anonymous" person. Logins (no token yet) are recorded by the auth
    router itself via record_login(), where the person is known.
    """
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(
            auth_header.removeprefix("Bearer ").strip(), SECRET_KEY,
            algorithms=[ALGORITHM], options={"verify_exp": False},
        )
    except Exception:
        return None
    sub = payload.get("sub")
    name = (payload.get("name") or "")[:100]
    role = payload.get("role")
    if not sub or sub == "admin":
        return ("admin", name or "Admin", None, role)
    return (str(sub), name, int(sub), role)


def record_login(user_key: str, user_name: str, user_id: int | None, role: str | None,
                 ip: str | None, ok: bool) -> None:
    """Called from routers/auth.py, which is the only place that knows who is
    logging in (the request carries no token yet)."""
    _push({
        "created_at": _utc_now(), "user_key": user_key[:64], "user_name": user_name[:100],
        "user_id": user_id, "role": (role or "")[:60] or None,
        "kind": "login" if ok else "login_failed", "method": "POST", "route": "/auth/login",
        "label": None, "status": 200 if ok else 401, "duration_ms": None,
        "ip": (ip or "")[:45] or None,
    })


def record_request(method: str, path: str, status: int, duration_ms: float,
                   auth_header: str | None, ip: str | None) -> None:
    who = _who(auth_header)
    if who is None or path == "/auth/login":
        return
    user_key, user_name, user_id, role = who
    route = route_template(path)
    now = _utc_now()

    if path == "/auth/logout":
        kind = "logout"
    elif "export" in path:
        # Excel downloads are GETs, so this must come before the read counting.
        kind = "export"
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
    elif method == "POST" and "remove" in path:
        # Bulk-removal endpoints (e.g. /tyre-fitment/remove-bulk) are a real
        # delete semantically, just shaped as a POST because they take a body
        # (a list of ids) rather than one id in the URL like a normal DELETE.
        kind = "delete"
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


_admin_ids: list[int] = []
_admin_ids_at = 0.0


def _notify_admins() -> None:
    """Tell open Activity Log pages (Admin only) that new events landed, so
    they refetch right away instead of waiting for their fallback poll. Only
    sent when real events were written — GET read-counts tick constantly from
    background polling and would turn this into a 3-second heartbeat."""
    global _admin_ids, _admin_ids_at
    try:
        from websocket_manager import emit_to_users
        now = time.monotonic()
        if now - _admin_ids_at > 60:
            db = SessionLocal()
            try:
                _admin_ids = [
                    i for (i,) in db.query(models.Staff.id).filter(
                        models.Staff.software_designation == "Admin",
                        models.Staff.deleted_at.is_(None),
                    ).all()
                ]
                _admin_ids_at = now
            finally:
                db.close()
        if _admin_ids:
            emit_to_users(_admin_ids, "activity_updated", {})
    except Exception:
        log.exception("activity admin notify failed")


def flush_now() -> None:
    """Flush this process's buffer immediately — the Activity Log's read
    endpoints call this first so an Admin always reads the freshest data
    rather than whatever was written before their request arrived."""
    global _last_flush
    _last_flush = time.monotonic()
    try:
        _flush_once()
    except Exception:
        log.exception("activity flush (on read) failed")


def flush_if_due() -> None:
    """Attached as a Starlette BackgroundTask to whichever response happens to
    be due for one — see activity_tracking middleware in main.py. Runs after
    that response has already gone out, so it never delays the request that
    triggers it. A no-op (cheap time check only) on every other request."""
    global _last_flush, _last_purge
    now = time.monotonic()
    if now - _last_flush >= FLUSH_SECONDS:
        _last_flush = now
        try:
            if _flush_once():
                _notify_admins()
        except Exception:
            log.exception("activity flush failed; will retry on a later request")
    if now - _last_purge >= PURGE_EVERY_SECONDS:
        _last_purge = now
        try:
            _purge_old()
        except Exception:
            log.exception("activity purge failed; will retry on a later request")


def _flush_at_exit() -> None:
    try:
        _flush_once()
    except Exception:
        pass


# A clean process shutdown (dev reload, a graceful Passenger stop) still gets
# one last flush so the final few seconds of buffered events aren't lost.
# Harmless to register unconditionally — no thread is involved.
atexit.register(_flush_at_exit)


ANON_KEY = "anon"
_AUDIT_EVENT_FOR_KIND = {"login": "login.success", "login_failed": "login.failure", "logout": "logout"}


def backfill_anonymous_logins() -> int:
    """Older builds recorded every login/logout as "anonymous" (a login has no
    token yet; a logout's token is revoked a moment before it was recorded).
    The security audit log always knew who it was, so match each such row to
    its audit_logs twin (same kind, same IP, within 10 seconds) and attribute
    it. Idempotent — only touches rows still keyed 'anon', so it's a cheap
    no-op once done. Whatever else is still 'anon' (requests with no or a
    forged token) is genuinely unattributable and is hidden from every
    Activity Log query instead (see routers/activity.py).
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(models.ActivityEvent)
            .filter(models.ActivityEvent.user_key == ANON_KEY,
                    models.ActivityEvent.kind.in_(list(_AUDIT_EVENT_FOR_KIND)))
            .order_by(models.ActivityEvent.created_at)
            .all()
        )
        if not rows:
            return 0
        window = timedelta(seconds=10)
        audits = (
            db.query(models.AuditLog)
            .filter(models.AuditLog.event.in_(list(_AUDIT_EVENT_FOR_KIND.values())),
                    models.AuditLog.created_at >= rows[0].created_at - window,
                    models.AuditLog.created_at <= rows[-1].created_at + window)
            .all()
        )
        staff_by_username = {
            (u or "").strip().lower(): (sid, name, role)
            for sid, u, name, role in db.query(models.Staff.id, models.Staff.username,
                                               models.Staff.name, models.Staff.software_designation)
            if u
        }
        used: set[int] = set()
        fixed = 0
        for row in rows:
            want = _AUDIT_EVENT_FOR_KIND[row.kind]
            best, best_gap = None, window
            for a in audits:
                if a.id in used or a.event != want or (a.ip_address or None) != (row.ip or None):
                    continue
                gap = abs(a.created_at - row.created_at)
                if gap <= best_gap:
                    best, best_gap = a, gap
            if best is None:
                continue
            used.add(best.id)
            if best.actor_id is not None:
                row.user_key, row.user_id = str(best.actor_id), best.actor_id
                row.user_name = (best.actor_name or "")[:100]
                row.role = (best.actor_role or None)
            else:
                typed = (best.actor_name or "").strip()
                if not typed:
                    continue
                staff = staff_by_username.get(typed.lower())
                if staff:
                    row.user_key, row.user_id = str(staff[0]), staff[0]
                    row.user_name, row.role = (staff[1] or typed)[:100], staff[2]
                else:
                    row.user_key, row.user_name = f"login:{typed.lower()}"[:64], typed[:100]
            fixed += 1
        db.commit()
        return fixed
    except Exception:
        db.rollback()
        log.exception("anonymous login backfill failed")
        return 0
    finally:
        db.close()


def today_ist() -> date:
    return datetime.now(_IST).date()


def day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """A day in IST, expressed as a UTC range (the stored timestamps are UTC)."""
    start_ist = datetime.combine(day, dtime(), tzinfo=_IST)
    start_utc = start_ist.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, start_utc + timedelta(days=1)


def last_activity_at(user_key: str, day: date) -> datetime | None:
    """The latest moment this user actually did something on `day` — saved
    click/view/login/logout/save/delete/export events only (checking the
    not-yet-flushed in-memory buffer too, so a close-shift right after
    someone's last click doesn't miss it). Returns naive UTC, or None if
    nothing is on record.

    Deliberately excludes GET-read rollups (ActivityMinute): those are
    touched by background polling (notifications, leave requests, etc.) that
    keeps firing on its own timer whether or not anyone is actually at the
    keyboard, so including it would let "last activity" stay artificially
    fresh for as long as a tab just sits open — exactly the padding this is
    meant to prevent. ActivityEvent only ever gets a row from a deliberate
    click, a real page navigation, or a mutating request — none of which fire
    on their own.

    Used to stamp a shift's real end time instead of whenever Close Shift
    happens to run (self-close, Admin force-close, or the auto-close worker)
    — see routers/attendance.py close_shift / auto_close_expired_shifts. A
    shift closed hours after someone's last click shouldn't credit that dead
    time, and a shift closed after a long-but-legitimate break shouldn't be
    cut short at the break's start either; the actual last activity handles
    both correctly regardless of when the close happens to run.
    """
    candidates: list[datetime] = []

    with _lock:
        for e in _events:
            if e["user_key"] == user_key and e["created_at"].date() == day:
                candidates.append(e["created_at"])

    db = SessionLocal()
    try:
        start, end = day_bounds_utc(day)
        max_event = db.query(func.max(models.ActivityEvent.created_at)).filter(
            models.ActivityEvent.user_key == user_key,
            models.ActivityEvent.created_at >= start,
            models.ActivityEvent.created_at < end,
        ).scalar()
        if max_event:
            candidates.append(max_event)
    finally:
        db.close()

    return max(candidates) if candidates else None
