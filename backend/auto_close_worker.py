"""Runs the staff shift auto-close every few minutes in a background thread."""
import logging
import os
import threading
import time

import settings_store
from database import SessionLocal
from routers.attendance import auto_close_expired_shifts

log = logging.getLogger("auto_close_shifts")
INTERVAL_SECONDS = 600
_started_lock = threading.Lock()
_thread: threading.Thread | None = None


def _reset_after_fork() -> None:
    # Passenger forks worker processes from a preloaded template. Threads don't
    # survive fork(), but module state does — without this, a forked worker
    # would inherit "already started" and never run its own loop.
    global _started_lock, _thread
    _started_lock = threading.Lock()
    _thread = None


os.register_at_fork(after_in_child=_reset_after_fork)


def _loop() -> None:
    while True:
        db = SessionLocal()
        try:
            # "Auto-Close Shifts" toggle (Staff Attendance page header) — off
            # means skip the sweep entirely this round; manual "Close Shift"
            # by the staff member or an Admin still always works regardless,
            # this only gates the unattended background sweep.
            if settings_store.auto_close_shifts_enabled(db):
                closed = auto_close_expired_shifts(db)
                if closed:
                    log.info("Auto-closed %d staff shift(s)", closed)
        except Exception:
            log.exception("Auto-closing staff shifts failed; will retry in %d seconds", INTERVAL_SECONDS)
            db.rollback()
        finally:
            db.close()
        time.sleep(INTERVAL_SECONDS)


def start() -> None:
    """Idempotent — starts the loop unless this process already has a live
    one. Safe to call from the ASGI startup event, Passenger's
    starting_worker_process hook, and the per-request middleware in main.py."""
    global _thread
    with _started_lock:
        if _thread is not None and _thread.is_alive():
            return
        _thread = threading.Thread(target=_loop, name="auto-close-shifts", daemon=True)
        _thread.start()
