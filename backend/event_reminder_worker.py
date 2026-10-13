"""Pushes a live "meeting starting now" dialog to every participant's screen
the moment an Event's start time arrives — the scheduled counterpart to the
Topbar's Invite button, which pushes the same kind of dialog on click instead
of at a stored time. See routers/events.py for how Events/participants are
created; this worker only ever reads them and flips reminded_at once sent.
"""
import logging
import threading
import time
from datetime import datetime, timezone

import models
from database import SessionLocal
from websocket_manager import emit_to_users

log = logging.getLogger("event_reminders")
INTERVAL_SECONDS = 30
_started = False
_started_lock = threading.Lock()


def _tick() -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        due = (
            db.query(models.Event)
            .filter(models.Event.starts_at <= now, models.Event.reminded_at.is_(None))
            .all()
        )
        for ev in due:
            participant_ids = [
                p.staff_id
                for p in db.query(models.EventParticipant).filter(models.EventParticipant.event_id == ev.id).all()
            ]
            if participant_ids:
                emit_to_users(participant_ids, "event_starting", {
                    "eventId": ev.id, "title": ev.title, "location": ev.location,
                })
            ev.reminded_at = now
        if due:
            db.commit()
    except Exception:
        log.exception("Event reminder sweep failed; will retry in %d seconds", INTERVAL_SECONDS)
        db.rollback()
    finally:
        db.close()


def _loop() -> None:
    while True:
        time.sleep(INTERVAL_SECONDS)
        try:
            _tick()
        except Exception:
            log.exception("Event reminder loop failed; will retry")


def start() -> None:
    """Idempotent — safe to call more than once in the same process (see
    auto_close_worker.py's start() for why: Phusion Passenger's
    starting_worker_process fork hook, plus the ASGI startup event)."""
    global _started
    with _started_lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="event-reminders", daemon=True).start()
