"""Activity log: browser events in, admin queries out. See activity_tracker.py."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import activity_tracker as tracker
import models
from database import get_db
from security import TokenUser, get_current_user, require_roles

router = APIRouter(prefix="/activity", tags=["Activity"])

MAX_BATCH = 200


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


@router.get("/events", dependencies=[Depends(require_roles())])
def list_events(
    user: str | None = Query(None, description="Part of the employee's name"),
    kind: str | None = Query(None, description="save, delete, export, login, login_failed, logout, view or click"),
    route: str | None = Query(None, description="Part of the route, e.g. trips"),
    date_from: str | None = Query(None, description="YYYY-MM-DD, IST"),
    date_to: str | None = Query(None, description="YYYY-MM-DD, IST"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.ActivityEvent)
    if user:
        q = q.filter(models.ActivityEvent.user_name.like(f"%{user}%"))
    if kind:
        q = q.filter(models.ActivityEvent.kind == kind)
    if route:
        q = q.filter(models.ActivityEvent.route.like(f"%{route}%"))
    start = _parse_day(date_from, "date_from")
    end = _parse_day(date_to, "date_to")
    if start:
        q = q.filter(models.ActivityEvent.created_at >= tracker.day_bounds_utc(start)[0])
    if end:
        q = q.filter(models.ActivityEvent.created_at < tracker.day_bounds_utc(end)[1])
    rows = (
        q.order_by(models.ActivityEvent.created_at.desc(), models.ActivityEvent.id.desc())
        .offset(offset).limit(limit).all()
    )
    return [
        {
            "id": r.id,
            "created_at": r.created_at.isoformat() + "Z",
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
        for r in rows
    ]


@router.get("/summary", dependencies=[Depends(require_roles())])
def daily_summary(day: str | None = Query(None, description="YYYY-MM-DD, IST; defaults to today"),
                  db: Session = Depends(get_db)):
    """One row per employee for a day: counts of each kind of event, plus API reads."""
    chosen = _parse_day(day, "day") or tracker.today_ist()
    start, end = tracker.day_bounds_utc(chosen)

    by_kind = (
        db.query(models.ActivityEvent.user_name, models.ActivityEvent.kind, func.count())
        .filter(models.ActivityEvent.created_at >= start, models.ActivityEvent.created_at < end)
        .group_by(models.ActivityEvent.user_name, models.ActivityEvent.kind)
        .all()
    )
    reads = dict(
        db.query(models.ActivityMinute.user_name, func.sum(models.ActivityMinute.count))
        .filter(models.ActivityMinute.minute >= start, models.ActivityMinute.minute < end)
        .group_by(models.ActivityMinute.user_name)
        .all()
    )

    rows: dict[str, dict] = {}
    for name, kind, count in by_kind:
        row = rows.setdefault(name, {"user_name": name, "saves": 0, "deletes": 0, "exports": 0,
                                     "logins": 0, "failed_logins": 0, "views": 0, "clicks": 0,
                                     "reads": 0, "total": 0})
        field = {"save": "saves", "delete": "deletes", "export": "exports", "login": "logins",
                 "login_failed": "failed_logins", "view": "views", "click": "clicks"}.get(kind)
        if field:
            row[field] += count
            row["total"] += count
    for name, count in reads.items():
        row = rows.setdefault(name, {"user_name": name, "saves": 0, "deletes": 0, "exports": 0,
                                     "logins": 0, "failed_logins": 0, "views": 0, "clicks": 0,
                                     "reads": 0, "total": 0})
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
    chosen = _parse_day(day, "day") or tracker.today_ist()
    start, end = tracker.day_bounds_utc(chosen)

    events = (
        db.query(models.ActivityEvent)
        .filter(
            models.ActivityEvent.user_name == user_name,
            models.ActivityEvent.created_at >= start,
            models.ActivityEvent.created_at < end,
        )
        .order_by(models.ActivityEvent.created_at, models.ActivityEvent.id)
        .limit(1000)
        .all()
    )
    reads = (
        db.query(models.ActivityMinute)
        .filter(
            models.ActivityMinute.user_name == user_name,
            models.ActivityMinute.minute >= start,
            models.ActivityMinute.minute < end,
        )
        .order_by(models.ActivityMinute.minute, models.ActivityMinute.route)
        .all()
    )

    items = [
        {
            "time": e.created_at.isoformat() + "Z",
            "type": "event",
            "kind": e.kind,
            "method": e.method,
            "route": e.route,
            "label": e.label,
            "status": e.status,
            "count": None,
        }
        for e in events
    ] + [
        {
            "time": (r.first_at or r.minute).isoformat() + "Z",
            "last": (r.last_at or r.minute).isoformat() + "Z",
            "type": "reads",
            "kind": "reads",
            "method": "GET",
            "route": r.route,
            "label": None,
            "status": None,
            "count": r.count,
        }
        for r in reads
    ]
    items.sort(key=lambda i: i["time"])
    return items
