"""Celebrations — staff birthdays, the December season (Christmas → New Year)
and Founding Day (5 January, est. 2015).

Read by every logged-in user (what to decorate today), managed by Admin from
Celebrations Management: one on/off switch per celebration, the greeting-card
text, the upcoming list and the change history.

Preview: an Admin can pass ?preview=YYYY-MM-DD (and ?preview_birthday=1) to
see any day's decorations on their own screen — ignored for everyone else,
so nothing about a preview can leak to other users or into production.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import settings_store
from audit import record_audit
from database import get_db
from security import TokenUser, get_current_user, require_roles

router = APIRouter(prefix="/celebrations", tags=["Celebrations"])

IST = ZoneInfo("Asia/Kolkata")
FOUNDED = date(2015, 1, 5)


def _real_today() -> date:
    return datetime.now(IST).date()


def _today_for(user: TokenUser, preview: str | None) -> date:
    if preview and user.role == "Admin":
        try:
            return date.fromisoformat(preview)
        except ValueError:
            pass
    return _real_today()


def _is_birthday(dob: date | None, today: date) -> bool:
    if dob is None:
        return False
    if (dob.month, dob.day) == (today.month, today.day):
        return True
    # 29 February birthdays are celebrated on 28 February in non-leap years.
    leap = today.year % 4 == 0 and (today.year % 100 != 0 or today.year % 400 == 0)
    return (dob.month, dob.day) == (2, 29) and not leap and (today.month, today.day) == (2, 28)


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _in_season(d: date) -> bool:
    return d.month == 12 or (d.month == 1 and d.day <= 4)


# ── What to decorate today (every user) ─────────────────────────────────────

@router.get("/birthday")
def birthday_today(
    preview: str | None = None,
    preview_birthday: bool = False,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """{celebrating: any active staff member's birthday today, mine: whether
    it's the caller's, name: the caller's own name when mine}. Nobody else's
    name or date of birth is ever returned."""
    today = _today_for(current_user, preview)
    enabled = settings_store.birthdays_enabled(db)
    messages = settings_store.celebration_messages(db)
    base = {"date": today.isoformat(), "message": messages["birthday"], "signature": messages["signature"]}
    if not enabled:
        return {**base, "celebrating": False, "mine": False, "name": None}
    if preview_birthday and current_user.role == "Admin":
        return {**base, "celebrating": True, "mine": True, "name": current_user.name}
    rows = (
        db.query(models.Staff.id, models.Staff.name, models.Staff.date_of_birth)
        .filter(models.Staff.deleted_at.is_(None), models.Staff.date_of_birth.isnot(None))
        .all()
    )
    birthday_ids = {sid: name for sid, name, dob in rows if _is_birthday(dob, today)}
    mine = current_user.id in birthday_ids
    return {**base, "celebrating": bool(birthday_ids), "mine": mine, "name": birthday_ids[current_user.id] if mine else None}


@router.get("/season")
def festive_season(
    preview: str | None = None,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """December season: decorations 1 Dec – 4 Jan; greetings on 24–25 Dec
    ("christmas") and 31 Dec – 4 Jan ("newyear" — many people only log back
    in on the 2nd–4th, so the welcome waits for them)."""
    today = _today_for(current_user, preview)
    in_season = _in_season(today)
    greeting = None
    if (today.month, today.day) in ((12, 24), (12, 25)):
        greeting = "christmas"
    elif (today.month, today.day) == (12, 31) or (today.month == 1 and today.day <= 4):
        greeting = "newyear"
    enabled = settings_store.festive_season_enabled(db)
    season_year = today.year if today.month == 12 else today.year - 1
    messages = settings_store.celebration_messages(db)
    return {
        "enabled": enabled,
        "active": enabled and in_season,
        "greeting": greeting if enabled and in_season else None,
        "new_year": season_year + 1,
        "season_key": f"xmas-{season_year}",
        "date": today.isoformat(),
        "messages": {"christmas": messages["christmas"], "newyear": messages["newyear"], "signature": messages["signature"]},
    }


@router.get("/founding")
def founding_day(
    preview: str | None = None,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """5 January anniversary, with the company's running totals."""
    today = _today_for(current_user, preview)
    years = today.year - FOUNDED.year
    enabled = settings_store.founding_day_enabled(db)
    active = enabled and years > 0 and (today.month, today.day) == (FOUNDED.month, FOUNDED.day)
    stats = None
    if active:
        stats = {
            "trips_completed": db.query(models.Trip).filter(
                models.Trip.status == "Completed", models.Trip.deleted_at.is_(None)).count(),
            "trucks": db.query(models.Truck).filter(models.Truck.deleted_at.is_(None)).count(),
            "customers": db.query(models.Customer).filter(models.Customer.deleted_at.is_(None)).count(),
        }
    messages = settings_store.celebration_messages(db)
    return {
        "enabled": enabled,
        "active": active,
        "years": years,
        "ordinal": _ordinal(years),
        "milestone": years > 0 and years % 5 == 0,
        "founded": FOUNDED.isoformat(),
        "date": today.isoformat(),
        "stats": stats,
        "message": messages["founding"],
        "signature": messages["signature"],
    }


# ── Celebrations Management (Admin) ─────────────────────────────────────────

SWITCHES = {
    "birthdays": (settings_store.birthdays_enabled, settings_store.set_birthdays_enabled),
    "season": (settings_store.festive_season_enabled, settings_store.set_festive_season_enabled),
    "founding": (settings_store.founding_day_enabled, settings_store.set_founding_day_enabled),
}
AUDIT_EVENTS = ("celebrations.switch", "celebrations.messages", "settings.festive_season", "settings.founding_day")


def _upcoming(db: Session, today: date, days: int = 90) -> list[dict]:
    end = today + timedelta(days=days)
    items: list[dict] = []

    def add(d: date, kind: str, title: str, detail: str = ""):
        if today <= d <= end:
            items.append({"date": d.isoformat(), "days": (d - today).days, "kind": kind, "title": title, "detail": detail})

    for name, dob in (
        db.query(models.Staff.name, models.Staff.date_of_birth)
        .filter(models.Staff.deleted_at.is_(None), models.Staff.date_of_birth.isnot(None))
    ):
        for y in (today.year, today.year + 1):
            try:
                d = dob.replace(year=y)
            except ValueError:                       # 29 Feb in a non-leap year
                d = date(y, 2, 28)
            add(d, "birthday", f"{name}'s birthday")
    for y in (today.year, today.year + 1):
        add(date(y, 12, 1), "season", "December Season begins", "Christmas lights, garland and snow")
        add(date(y, 12, 24), "season", "Christmas Eve", "Merry Christmas card")
        add(date(y, 12, 25), "season", "Christmas Day", "Santa's sleigh, brighter lights")
        add(date(y, 12, 31), "season", "New Year's Eve", f"Countdown to {y + 1}")
        add(date(y, 1, 1), "season", "New Year welcome", f"Fireworks · streamers · {y} (until 4 Jan)")
        n = y - FOUNDED.year
        if n > 0:
            add(date(y, 1, 5), "founding", "Founding Day", f"{_ordinal(n)} anniversary" + (" · milestone" if n % 5 == 0 else ""))
    items.sort(key=lambda i: (i["date"], i["kind"]))
    return items


@router.get("", dependencies=[Depends(require_roles())])
def overview(db: Session = Depends(get_db)):
    today = _real_today()
    history = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.event.in_(AUDIT_EVENTS))
        .order_by(models.AuditLog.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "today": today.isoformat(),
        "switches": {k: get(db) for k, (get, _) in SWITCHES.items()},
        "messages": settings_store.celebration_messages(db),
        "defaults": settings_store.DEFAULT_CELEBRATION_MESSAGES,
        "max_message": settings_store.CELEBRATION_MESSAGE_MAX,
        "upcoming": _upcoming(db, today),
        "history": [
            {"event": h.event, "actor": h.actor_name, "detail": h.detail, "at": h.created_at.isoformat() if h.created_at else None}
            for h in history
        ],
    }


class SwitchIn(BaseModel):
    key: str
    enabled: bool


@router.put("/switch")
def set_switch(
    payload: SwitchIn,
    request: Request,
    db: Session = Depends(get_db),
    user: TokenUser = Depends(require_roles()),
):
    if payload.key not in SWITCHES:
        raise HTTPException(400, "Unknown celebration.")
    get, put = SWITCHES[payload.key]
    put(db, payload.enabled)
    record_audit(
        "celebrations.switch", request=request, actor_id=user.id, actor_name=user.name,
        actor_role=user.role, detail=f"{payload.key}={'on' if payload.enabled else 'off'}",
    )
    return {"key": payload.key, "enabled": get(db)}


class MessagesIn(BaseModel):
    birthday: str | None = None
    christmas: str | None = None
    newyear: str | None = None
    founding: str | None = None
    signature: str | None = None


@router.put("/messages")
def set_messages(
    payload: MessagesIn,
    request: Request,
    db: Session = Depends(get_db),
    user: TokenUser = Depends(require_roles()),
):
    changes = payload.model_dump(exclude_none=True)
    settings_store.set_celebration_messages(db, changes)
    record_audit(
        "celebrations.messages", request=request, actor_id=user.id, actor_name=user.name,
        actor_role=user.role, detail="edited: " + ", ".join(sorted(changes)) if changes else "no changes",
    )
    return settings_store.celebration_messages(db)
