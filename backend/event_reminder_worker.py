"""Pushes a live "meeting starting now" dialog to every participant's screen
the moment an Event's start time arrives — the scheduled counterpart to the
Topbar's Invite button, which pushes the same kind of dialog on click instead
of at a stored time. See routers/events.py for how Events/participants are
created; this worker only ever reads them and flips reminded_at once sent.
"""
import logging
import os
import threading
import time
from datetime import datetime, timezone

import models
from database import SessionLocal
from websocket_manager import emit_to_users

log = logging.getLogger("event_reminders")
INTERVAL_SECONDS = 30
_started_lock = threading.Lock()
_thread: threading.Thread | None = None


def _reset_after_fork() -> None:
    # Passenger forks worker processes from a preloaded template. Threads don't
    # survive fork(), but module state does — without this, a forked worker
    # would inherit "already started" and never run its own loop.
    global _started_lock, _thread
    _started_lock = threading.Lock()
    _thread = None


# Unix-only (no fork() on Windows, so local dev there has nothing to reset).
if hasattr(os, "register_at_fork"):
    os.register_at_fork(after_in_child=_reset_after_fork)


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
    """Idempotent — starts the loop unless this process already has a live
    one. Safe to call from the ASGI startup event, Passenger's
    starting_worker_process hook, and the per-request middleware in main.py."""
    global _thread
    with _started_lock:
        if _thread is not None and _thread.is_alive():
            return
        _thread = threading.Thread(target=_loop, name="event-reminders", daemon=True)
        _thread.start()
