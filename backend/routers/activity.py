"""Activity log: browser events in, admin queries out. See activity_tracker.py."""
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, literal_column
from sqlalchemy.orm import Session

import activity_tracker as tracker
import models
from database import get_db
from security import TokenUser, get_current_user, require_roles

router = APIRouter(prefix="/activity", tags=["Activity"])

MAX_BATCH = 200
ONLINE_WINDOW = timedelta(minutes=5)
IST_OFFSET_MINUTES = 330  # Asia/Kolkata has no DST, so a fixed offset is exact
AFTER_HOURS_FROM, AFTER_HOURS_TO = 21, 7  # IST: activity at/after 21:00 or before 07:00
DELETE_BURST, DELETE_BURST_WINDOW = 5, timedelta(minutes=10)
FAILED_LOGIN_ALERT = 3
FAILED_ACTION_ALERT = 5

E = models.ActivityEvent
M = models.ActivityMinute


class ClientEvent(BaseModel):
    kind: str = Field(pattern="^(view|click)$")
    route: str = Field(max_length=200, pattern=r"^/[^\n]{0,199}$")
    label: str | None = Field(default=None, max_length=120)


class ClientBatch(BaseModel):
    events: list[ClientEvent] = Field(max_length=MAX_BATCH)


def _ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/batch", status_code=204)
def record_batch(payload: ClientBatch, request: Request, user: TokenUser = Depends(get_current_user)):
    """Receives page views and clicks from the browser, in batches. Each user may send
    CLIENT_EVENTS_PER_MINUTE of them a minute; anything above that is dropped."""
    user_key = str(user.id) if user.id else "admin"
    allowed = tracker.take_client_budget(user_key, len(payload.events))
    if allowed == 0:
        raise HTTPException(429, "Too many activity events. Slow down.")
    tracker.record_client(
        user_key=user_key,
        user_name=user.name or "",
        user_id=user.id,
        role=user.role,
        ip=_ip(request),
        items=[e.model_dump() for e in payload.events[:allowed]],
    )


def _parse_day(value: str | None, field: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"{field} must be a date in YYYY-MM-DD form")


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() + "Z" if dt else None


def _ist_hour(col):
    return func.hour(func.timestampadd(literal_column("MINUTE"), IST_OFFSET_MINUTES, col))


def _to_ist_hour(dt: datetime) -> int:
    return (dt + timedelta(minutes=IST_OFFSET_MINUTES)).hour


# Rows keyed "anon" come from older builds (requests with no/forged token) and
# can never be tied to a person — hidden everywhere rather than shown as a fake
# "anonymous" employee. See activity_tracker._who / backfill_anonymous_logins.
def _real_events(db: Session):
    return db.query(E).filter(E.user_key != tracker.ANON_KEY)


def _event_dict(r: models.ActivityEvent) -> dict:
    return {
        "id": r.id,
        "created_at": _iso(r.created_at),
        "user_name": r.user_name,
        "role": r.role,
        "kind": r.kind,
        "method": r.method,
        "route": r.route,
        "label": r.label,
        "status": r.status,
        "duration_ms": r.duration_ms,
        "ip": r.ip,
    }


def _filtered_events(db: Session, user: str | None, kind: str | None, role: str | None,
                     route: str | None, failed_only: bool, date_from: str | None, date_to: str | None):
    q = _real_events(db)
    if user:
        q = q.filter(E.user_name.like(f"%{user}%"))
    if kind:
        kinds = [k.strip() for k in kind.split(",") if k.strip()]
        if kinds:
            q = q.filter(E.kind.in_(kinds))
    if role:
        q = q.filter(E.role == role)
    if route:
        q = q.filter(E.route.like(f"%{route}%"))
    if failed_only:
        q = q.filter(E.status >= 400)
    start = _parse_day(date_from, "date_from")
    end = _parse_day(date_to, "date_to")
    if start:
        q = q.filter(E.created_at >= tracker.day_bounds_utc(start)[0])
    if end:
        q = q.filter(E.created_at < tracker.day_bounds_utc(end)[1])
    return q


@router.get("/events", dependencies=[Depends(require_roles())])
def list_events(
    user: str | None = Query(None, description="Part of the employee's name"),
    kind: str | None = Query(None, description="One kind, or several comma-separated"),
    role: str | None = Query(None),
    route: str | None = Query(None, description="Part of the route, e.g. trips"),
    failed_only: bool = Query(False, description="Only actions that came back with an error"),
    date_from: str | None = Query(None, description="YYYY-MM-DD, IST"),
    date_to: str | None = Query(None, description="YYYY-MM-DD, IST"),
    after_id: int | None = Query(None, ge=0, description="Only events newer than this id (live updates)"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    tracker.flush_now()
    q = _filtered_events(db, user, kind, role, route, failed_only, date_from, date_to)
    if after_id is not None:
        q = q.filter(E.id > after_id)
    rows = q.order_by(E.id.desc()).offset(offset).limit(limit).all()
    return [_event_dict(r) for r in rows]


@router.get("/events/count", dependencies=[Depends(require_roles())])
def count_events(
    user: str | None = Query(None),
    kind: str | None = Query(None),
    role: str | None = Query(None),
    route: str | None = Query(None),
    failed_only: bool = Query(False),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """How many events match the same filters as GET /events — for the page
    numbers. Only a COUNT(*), so it's far cheaper than fetching the rows."""
    q = _filtered_events(db, user, kind, role, route, failed_only, date_from, date_to)
    return {"total": q.order_by(None).count()}


@router.get("/summary", dependencies=[Depends(require_roles())])
def daily_summary(day: str | None = Query(None, description="YYYY-MM-DD, IST; defaults to today"),
                  db: Session = Depends(get_db)):
    """One row per employee for a day: counts of each kind of event, API reads,
    and their workday (first and last real action — background read polling is
    left out of that on purpose, since an idle open tab keeps polling)."""
    tracker.flush_now()
    chosen = _parse_day(day, "day") or tracker.today_ist()
    start, end = tracker.day_bounds_utc(chosen)

    by_kind = (
        db.query(E.user_name, E.kind, func.count())
        .filter(E.user_key != tracker.ANON_KEY, E.created_at >= start, E.created_at < end)
        .group_by(E.user_name, E.kind)
        .all()
    )
    span = {
        name: (first, last, role)
        for name, first, last, role in db.query(E.user_name, func.min(E.created_at), func.max(E.created_at), func.max(E.role))
        .filter(E.user_key != tracker.ANON_KEY, E.created_at >= start, E.created_at < end, E.kind != "login_failed")
        .group_by(E.user_name)
        .all()
    }
    reads = dict(
        db.query(M.user_name, func.sum(M.count))
        .filter(M.user_key != tracker.ANON_KEY, M.minute >= start, M.minute < end)
        .group_by(M.user_name)
        .all()
    )

    def blank(name: str) -> dict:
        first, last, role = span.get(name, (None, None, None))
        return {"user_name": name, "role": role, "saves": 0, "deletes": 0, "exports": 0,
                "logins": 0, "failed_logins": 0, "views": 0, "clicks": 0, "reads": 0, "total": 0,
                "first_at": _iso(first), "last_at": _iso(last),
                "active_minutes": int((last - first).total_seconds() // 60) if first and last else 0}

    rows: dict[str, dict] = {}
    for name, kind, count in by_kind:
        row = rows.setdefault(name, blank(name))
        field = {"save": "saves", "delete": "deletes", "export": "exports", "login": "logins",
                 "login_failed": "failed_logins", "view": "views", "click": "clicks"}.get(kind)
        if field:
            row[field] += count
            row["total"] += count
    for name, count in reads.items():
        row = rows.setdefault(name, blank(name))
        row["reads"] = int(count or 0)
        row["total"] += int(count or 0)
    return sorted(rows.values(), key=lambda r: r["total"], reverse=True)


@router.get("/timeline", dependencies=[Depends(require_roles())])
def employee_timeline(
    user_name: str = Query(..., description="Exact employee name, as shown in the summary"),
    day: str | None = Query(None, description="YYYY-MM-DD, IST; defaults to today"),
    db: Session = Depends(get_db),
):
    """One employee's day in time order: their saved, deleted, exported, login and
    page-view/click events, merged with their read counts (one entry per route per minute)."""
    tracker.flush_now()
    chosen = _parse_day(day, "day") or tracker.today_ist()
    start, end = tracker.day_bounds_utc(chosen)

    events = (
        _real_events(db)
        .filter(E.user_name == user_name, E.created_at >= start, E.created_at < end)
        .order_by(E.created_at, E.id)
        .limit(1000)
        .all()
    )
    reads = (
        db.query(M)
        .filter(M.user_key != tracker.ANON_KEY, M.user_name == user_name, M.minute >= start, M.minute < end)
        .order_by(M.minute, M.route)
        .all()
    )

    items = [
        {
            "time": _iso(e.created_at),
            "type": "event",
            "kind": e.kind,
            "method": e.method,
            "route": e.route,
            "label": e.label,
            "status": e.status,
            "count": None,
            "ip": e.ip,
        }
        for e in events
    ] + [
        {
            "time": _iso(r.first_at or r.minute),
            "last": _iso(r.last_at or r.minute),
            "type": "reads",
            "kind": "reads",
            "method": "GET",
            "route": r.route,
            "label": None,
            "status": None,
            "count": r.count,
            "ip": None,
        }
        for r in reads
    ]
    items.sort(key=lambda i: i["time"])
    return items


@router.get("/overview", dependencies=[Depends(require_roles())])
def day_overview(day: str | None = Query(None, description="YYYY-MM-DD, IST; defaults to today"),
                 db: Session = Depends(get_db)):
    """Everything the Activity Log dashboard shows above the tables, in one
    round-trip: hourly activity, most-used screens, who's online now, and
    alerts worth an Admin's attention. All grouped in SQL; only the day's
    deletes, failures and logins (small sets) are pulled into Python."""
    tracker.flush_now()
    chosen = _parse_day(day, "day") or tracker.today_ist()
    start, end = tracker.day_bounds_utc(chosen)
    real_day = (E.user_key != tracker.ANON_KEY, E.created_at >= start, E.created_at < end)

    # -- Hourly activity (IST) ------------------------------------------------
    hourly = [{"hour": h, "saves": 0, "deletes": 0, "exports": 0, "logins": 0, "views": 0,
               "clicks": 0, "reads": 0} for h in range(24)]
    field_for = {"save": "saves", "delete": "deletes", "export": "exports", "login": "logins",
                 "logout": "logins", "view": "views", "click": "clicks"}
    for hour, kind, count in (
        db.query(_ist_hour(E.created_at), E.kind, func.count()).filter(*real_day)
        .group_by(_ist_hour(E.created_at), E.kind).all()
    ):
        f = field_for.get(kind)
        if f is not None and hour is not None:
            hourly[int(hour)][f] += int(count)
    for hour, count in (
        db.query(_ist_hour(M.minute), func.sum(M.count))
        .filter(M.user_key != tracker.ANON_KEY, M.minute >= start, M.minute < end)
        .group_by(_ist_hour(M.minute)).all()
    ):
        if hour is not None:
            hourly[int(hour)]["reads"] += int(count or 0)

    # -- Most-used screens (browser page views) -------------------------------
    top_screens = [
        {"route": route, "views": int(views), "users": int(users)}
        for route, views, users in (
            db.query(E.route, func.count(), func.count(func.distinct(E.user_key)))
            .filter(*real_day, E.kind == "view")
            .group_by(E.route).order_by(func.count().desc()).limit(8).all()
        )
    ]

    # -- Online now (only meaningful when looking at today) -------------------
    online: list[dict] = []
    if chosen == tracker.today_ist():
        now = datetime.utcnow()
        cutoff = now - ONLINE_WINDOW
        people: dict[str, dict] = {}
        for key, name, last, role in (
            db.query(E.user_key, E.user_name, func.max(E.created_at), func.max(E.role))
            .filter(E.user_key != tracker.ANON_KEY, E.created_at >= cutoff, E.kind != "login_failed")
            .group_by(E.user_key, E.user_name).all()
        ):
            people[key] = {"user_name": name, "role": role, "last_at": last, "status": "active"}
        for key, name, last in (
            db.query(M.user_key, M.user_name, func.max(M.last_at))
            .filter(M.user_key != tracker.ANON_KEY, M.last_at >= cutoff)
            .group_by(M.user_key, M.user_name).all()
        ):
            if key not in people:
                people[key] = {"user_name": name, "role": None, "last_at": last, "status": "idle"}
        if people:
            # Which screen each person is on = their latest page view today.
            latest_view = dict(
                db.query(E.user_key, func.max(E.id))
                .filter(E.user_key.in_(list(people)), E.kind == "view", E.created_at >= start)
                .group_by(E.user_key).all()
            )
            screen_by_id = dict(
                db.query(E.id, E.route).filter(E.id.in_(list(latest_view.values()))).all()
            ) if latest_view else {}
            if any(p["role"] is None for p in people.values()):
                roles = dict(
                    db.query(models.Staff.id, models.Staff.software_designation)
                    .filter(models.Staff.id.in_([int(k) for k in people if k.isdigit()])).all()
                )
                for key, p in people.items():
                    if p["role"] is None and key.isdigit():
                        p["role"] = roles.get(int(key))
            for key, p in people.items():
                online.append({
                    "user_name": p["user_name"], "role": p["role"], "status": p["status"],
                    "last_at": _iso(p["last_at"]),
                    "screen": screen_by_id.get(latest_view.get(key)),
                })
            online.sort(key=lambda p: (p["status"] != "active", p["user_name"].lower()))

    # -- Alerts ---------------------------------------------------------------
    alerts: list[dict] = []

    for name, count, last in (
        db.query(E.user_name, func.count(), func.max(E.created_at))
        .filter(*real_day, E.kind == "login_failed")
        .group_by(E.user_name).having(func.count() >= FAILED_LOGIN_ALERT).all()
    ):
        alerts.append({"type": "failed_logins", "severity": "high", "user_name": name, "at": _iso(last),
                       "message": f"{count} failed login attempts"})

    deletes = defaultdict(list)
    for name, at in (
        db.query(E.user_name, E.created_at).filter(*real_day, E.kind == "delete", E.status < 400)
        .order_by(E.created_at).all()
    ):
        deletes[name].append(at)
    for name, times in deletes.items():
        i = 0
        for j, t in enumerate(times):
            while t - times[i] > DELETE_BURST_WINDOW:
                i += 1
            if j - i + 1 >= DELETE_BURST:
                n = sum(1 for x in times if times[i] <= x <= times[i] + DELETE_BURST_WINDOW)
                alerts.append({"type": "delete_burst", "severity": "high", "user_name": name,
                               "at": _iso(times[i]),
                               "message": f"{n} deletes within {int(DELETE_BURST_WINDOW.total_seconds() // 60)} minutes"})
                break

    after_hours: dict[str, list] = defaultdict(list)
    for name, at in (
        db.query(E.user_name, E.created_at)
        .filter(*real_day, E.kind.in_(["save", "delete", "export", "login"]))
        .order_by(E.created_at).all()
    ):
        h = _to_ist_hour(at)
        if h >= AFTER_HOURS_FROM or h < AFTER_HOURS_TO:
            after_hours[name].append(at)
    for name, times in after_hours.items():
        alerts.append({"type": "after_hours", "severity": "medium", "user_name": name, "at": _iso(times[0]),
                       "message": f"{len(times)} action(s) outside working hours "
                                  f"({AFTER_HOURS_TO:02d}:00–{AFTER_HOURS_FROM:02d}:00)"})

    # New IP: compared against every earlier successful login — the security
    # audit log has the longest history, so it's the reference here.
    todays_logins: dict[tuple[str, str], tuple[str, datetime]] = {}
    for key, name, ip, at in (
        db.query(E.user_key, E.user_name, E.ip, func.min(E.created_at))
        .filter(*real_day, E.kind == "login", E.ip.isnot(None))
        .group_by(E.user_key, E.user_name, E.ip).all()
    ):
        if key.isdigit():
            todays_logins[(key, ip)] = (name, at)
    if todays_logins:
        ids = sorted({int(k) for k, _ in todays_logins})
        known: dict[int, set] = defaultdict(set)
        for actor_id, ip in (
            db.query(models.AuditLog.actor_id, models.AuditLog.ip_address)
            .filter(models.AuditLog.event == "login.success", models.AuditLog.actor_id.in_(ids),
                    models.AuditLog.created_at < start, models.AuditLog.ip_address.isnot(None))
            .distinct().all()
        ):
            known[actor_id].add(ip)
        for (key, ip), (name, at) in todays_logins.items():
            seen = known.get(int(key))
            if seen and ip not in seen:
                alerts.append({"type": "new_ip", "severity": "medium", "user_name": name, "at": _iso(at),
                               "message": f"Logged in from a new IP address ({ip})"})

    for name, count in (
        db.query(E.user_name, func.count())
        .filter(*real_day, E.kind.in_(["save", "delete"]), E.status >= 400)
        .group_by(E.user_name).having(func.count() >= FAILED_ACTION_ALERT).all()
    ):
        alerts.append({"type": "failed_actions", "severity": "low", "user_name": name, "at": None,
                       "message": f"{count} saves/deletes didn't go through"})

    rank = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: (rank[a["severity"]], a["user_name"].lower()))

    active_users = db.query(func.count(func.distinct(E.user_key))).filter(*real_day).scalar() or 0
    failed_actions = (
        db.query(func.count()).select_from(E).filter(*real_day, E.kind.in_(["save", "delete"]), E.status >= 400)
        .scalar() or 0
    )

    return {
        "day": chosen.isoformat(),
        "hourly": hourly,
        "top_screens": top_screens,
        "online": online,
        "alerts": alerts,
        "active_users": int(active_users),
        "failed_actions": int(failed_actions),
    }
