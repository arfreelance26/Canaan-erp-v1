from datetime import date as date_type, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
import usage_actions
from security import get_current_user, require_roles, TokenUser

router = APIRouter(prefix="/usage", tags=["SW Usage Analytics"])

_IST = timezone(timedelta(hours=5, minutes=30))

# No heartbeat for this long = the tab/laptop was closed without an explicit
# /auth/logout. The next heartbeat (or a fresh login) closes that old session
# at its own last_heartbeat_at rather than leaving it open forever.
USAGE_STALE_MINUTES = 15
# A session still updating within this window counts as "online now" on the
# overview table — a bit longer than the 5-minute heartbeat interval so a
# heartbeat that's merely running a little late doesn't flicker offline.
ONLINE_WINDOW_MINUTES = 7


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """MySQL DATETIME columns round-trip as naive even when a tz-aware value
    was inserted — normalize to UTC before any arithmetic, same pattern as
    payment_requests.py's _ist()."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _day_bounds_utc(date_from: Optional[str], date_to: Optional[str]) -> tuple[Optional[datetime], Optional[datetime]]:
    """IST calendar-day strings (YYYY-MM-DD) -> UTC datetime bounds, same
    pattern as payment_requests.py/edit_approvals.py/deletion_approvals.py."""
    start = end = None
    if date_from:
        start = datetime.combine(date_type.fromisoformat(date_from), datetime.min.time(), tzinfo=_IST).astimezone(timezone.utc)
    if date_to:
        end = datetime.combine(date_type.fromisoformat(date_to), datetime.max.time(), tzinfo=_IST).astimezone(timezone.utc)
    return start, end


# ---------------------------------------------------------------------------
# Heartbeat — posted every ~5 minutes (+ on tab-hide/unload/module-change) by
# useUsageHeartbeat.ts. Finds (or lazily starts) this staff member's open
# session, accumulates active/idle seconds, and upserts the per-module row.
# ---------------------------------------------------------------------------

@router.post("/heartbeat", status_code=204)
def post_heartbeat(
    payload: schemas.UsageHeartbeatIn,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if current_user.id is None:
        # Built-in admin backdoor with no linked staff row — nothing to attach
        # a session to; silently no-op rather than failing the frontend's tick.
        return
    now = datetime.now(timezone.utc)
    session = (
        db.query(models.UsageSession)
        .filter(models.UsageSession.staff_id == current_user.id, models.UsageSession.logout_at.is_(None))
        .order_by(models.UsageSession.id.desc())
        .with_for_update()
        .first()
    )
    last_hb = _aware(session.last_heartbeat_at) if session else None
    if session and (now - last_hb) > timedelta(minutes=USAGE_STALE_MINUTES):
        session.logout_at = session.last_heartbeat_at
        session.ended_reason = "timeout"
        db.flush()
        session = None
    if session is None:
        session = models.UsageSession(
            staff_id=current_user.id, staff_name=current_user.name, staff_role=current_user.role,
            login_at=now, last_heartbeat_at=now, total_active_seconds=0, total_idle_seconds=0,
        )
        db.add(session)
        db.flush()

    session.last_heartbeat_at = now
    session.total_active_seconds += max(payload.active_seconds, 0)
    session.total_idle_seconds += max(payload.idle_seconds, 0)

    module_row = db.query(models.ModuleUsage).filter(
        models.ModuleUsage.session_id == session.id,
        models.ModuleUsage.module == payload.module,
    ).first()
    if not module_row:
        module_row = models.ModuleUsage(
            session_id=session.id, module=payload.module,
            active_seconds=0, idle_seconds=0, visit_count=0,
        )
        db.add(module_row)
    module_row.active_seconds += max(payload.active_seconds, 0)
    module_row.idle_seconds += max(payload.idle_seconds, 0)
    module_row.visit_count += 1

    db.commit()


# ---------------------------------------------------------------------------
# Overview — every employee, for the SW Usage Analytics landing table.
# ---------------------------------------------------------------------------

@router.get("/overview", response_model=list[schemas.UsageOverviewRowOut])
def get_overview(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles()),  # Admin only
):
    start, end = _day_bounds_utc(date_from, date_to)
    now = datetime.now(timezone.utc)

    q = db.query(models.UsageSession)
    if start is not None:
        q = q.filter(models.UsageSession.login_at >= start)
    if end is not None:
        q = q.filter(models.UsageSession.login_at <= end)
    sessions = q.all()

    by_staff: dict[int, dict] = {}
    for s in sessions:
        bucket = by_staff.setdefault(s.staff_id, {
            "staff_name": s.staff_name, "staff_role": s.staff_role,
            "active": 0, "idle": 0, "login": 0, "last_heartbeat_at": None, "open": False,
        })
        bucket["active"] += s.total_active_seconds
        bucket["idle"] += s.total_idle_seconds
        login_at = _aware(s.login_at)
        ended_at = _aware(s.logout_at) or _aware(s.last_heartbeat_at)
        bucket["login"] += max(int((ended_at - login_at).total_seconds()), 0)
        last_hb = _aware(s.last_heartbeat_at)
        if bucket["last_heartbeat_at"] is None or last_hb > bucket["last_heartbeat_at"]:
            bucket["last_heartbeat_at"] = last_hb
        if s.logout_at is None:
            bucket["open"] = True

    action_counts = usage_actions.count_actions_by_actor(db, start, end)

    result = []
    for staff_id, b in by_staff.items():
        is_online = b["open"] and b["last_heartbeat_at"] is not None and (now - b["last_heartbeat_at"]) <= timedelta(minutes=ONLINE_WINDOW_MINUTES)
        result.append(schemas.UsageOverviewRowOut(
            staff_id=staff_id, staff_name=b["staff_name"], staff_role=b["staff_role"],
            is_online=is_online, last_seen_at=b["last_heartbeat_at"],
            total_active_seconds=b["active"], total_idle_seconds=b["idle"], total_login_seconds=b["login"],
            action_count=action_counts.get(b["staff_name"], 0),
        ))
    result.sort(key=lambda r: r.total_active_seconds, reverse=True)
    return result


# ---------------------------------------------------------------------------
# Detail — one employee's full breakdown for the selected range.
# ---------------------------------------------------------------------------

@router.get("/detail/{staff_id}", response_model=schemas.UsageDetailOut)
def get_detail(
    staff_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles()),  # Admin only
):
    staff = db.get(models.Staff, staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found")

    start, end = _day_bounds_utc(date_from, date_to)
    q = db.query(models.UsageSession).filter(models.UsageSession.staff_id == staff_id)
    if start is not None:
        q = q.filter(models.UsageSession.login_at >= start)
    if end is not None:
        q = q.filter(models.UsageSession.login_at <= end)
    sessions = q.order_by(models.UsageSession.login_at.desc()).all()

    total_active = sum(s.total_active_seconds for s in sessions)
    total_idle = sum(s.total_idle_seconds for s in sessions)
    total_login = sum(
        max(int(((_aware(s.logout_at) or _aware(s.last_heartbeat_at)) - _aware(s.login_at)).total_seconds()), 0)
        for s in sessions
    )

    session_ids = [s.id for s in sessions]
    modules_by_name: dict[str, dict] = {}
    if session_ids:
        rows = db.query(models.ModuleUsage).filter(models.ModuleUsage.session_id.in_(session_ids)).all()
        for r in rows:
            bucket = modules_by_name.setdefault(r.module, {"active": 0, "idle": 0, "visits": 0})
            bucket["active"] += r.active_seconds
            bucket["idle"] += r.idle_seconds
            bucket["visits"] += r.visit_count

    recent_actions = usage_actions.list_actions_for_actor(db, staff.name, start, end, limit=200)
    action_count = usage_actions.count_actions_by_actor(db, start, end).get(staff.name, 0)

    return schemas.UsageDetailOut(
        staff_id=staff_id, staff_name=staff.name, staff_role=staff.software_designation,
        total_active_seconds=total_active, total_idle_seconds=total_idle, total_login_seconds=total_login,
        action_count=action_count,
        modules=[
            schemas.ModuleUsageOut(module=name, active_seconds=b["active"], idle_seconds=b["idle"], visit_count=b["visits"])
            for name, b in sorted(modules_by_name.items(), key=lambda kv: -kv[1]["active"])
        ],
        sessions=[
            schemas.UsageSessionOut(
                id=s.id, login_at=s.login_at, logout_at=s.logout_at, ended_reason=s.ended_reason,
                total_active_seconds=s.total_active_seconds, total_idle_seconds=s.total_idle_seconds,
            )
            for s in sessions
        ],
        recent_actions=[schemas.ActionLogRowOut(**r) for r in recent_actions],
    )
