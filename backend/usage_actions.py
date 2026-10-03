"""
SW Usage Analytics — "number of actions performed" is deliberately NOT a new
tracked thing. Every business mutation in this app already writes a row into
some `*EditEvent`-shaped table (actor_name, actor_role, event, created_at) —
the same data that powers every page's own "Edit History" button. This module
auto-discovers every such table via SQLAlchemy model introspection (so a
future EditEvent table is picked up automatically, no list to maintain here)
and unions them into one timeline for the SW Usage Analytics page.

AuditLog is deliberately excluded — it's login/logout/security telemetry,
not a business action, and counting "logged in" as a task would double-count
against the session tracking this same page already shows.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import select, union_all, literal, func, cast, String
from sqlalchemy.orm import Session

from database import Base
import models  # noqa: F401 — ensures every model is registered before we scan Base.registry

_EXCLUDED = {"AuditLog"}


def _discover_action_tables():
    """Every model with actor_name + actor_role + event + created_at columns,
    except AuditLog. Computed once at import time."""
    found = []
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if cls.__name__ in _EXCLUDED:
            continue
        cols = {c.name for c in cls.__table__.columns}
        if {"actor_name", "actor_role", "event", "created_at"}.issubset(cols):
            found.append(cls)
    return found

ACTION_TABLES = _discover_action_tables()


def _rows_select(cls):
    # event is a different Enum type per table — UNION ALL infers the combined
    # column's type from whichever table's Enum lands first, then tries to
    # decode every other table's values against THAT one enum's allowed
    # values and fails. Cast to plain text so the union column is just a
    # string, decoded the same way regardless of source table.
    t = cls.__table__
    return select(
        literal(cls.__tablename__).label("source"),
        cast(t.c.event, String(100)).label("event"),
        t.c.actor_name.label("actor_name"),
        t.c.actor_role.label("actor_role"),
        t.c.created_at.label("created_at"),
    )


def _unioned():
    """A single subquery over every action table — base building block for
    both count_actions_by_actor and list_actions_for_actor."""
    return union_all(*[_rows_select(cls) for cls in ACTION_TABLES]).subquery()


def count_actions_by_actor(db: Session, date_from: Optional[datetime], date_to: Optional[datetime]) -> dict[str, int]:
    """{actor_name: count} across every action table, for the overview table."""
    sub = _unioned()
    query = db.query(sub.c.actor_name, func.count().label("n"))
    if date_from is not None:
        query = query.filter(sub.c.created_at >= date_from)
    if date_to is not None:
        query = query.filter(sub.c.created_at <= date_to)
    query = query.group_by(sub.c.actor_name)
    return {name: n for name, n in query.all()}


def list_actions_for_actor(
    db: Session,
    actor_name: str,
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    limit: int = 200,
):
    """Recent individual action rows for one employee, most recent first —
    the drill-down list on the SW Usage Analytics detail view."""
    sub = _unioned()
    query = db.query(sub.c.source, sub.c.event, sub.c.actor_name, sub.c.actor_role, sub.c.created_at).filter(
        sub.c.actor_name == actor_name
    )
    if date_from is not None:
        query = query.filter(sub.c.created_at >= date_from)
    if date_to is not None:
        query = query.filter(sub.c.created_at <= date_to)
    rows = query.order_by(sub.c.created_at.desc()).limit(limit).all()
    return [
        {"source": r[0], "event": r[1], "actor_name": r[2], "actor_role": r[3], "created_at": r[4]}
        for r in rows
    ]
