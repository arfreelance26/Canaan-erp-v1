"""Runs the staff shift auto-close every few minutes in a background thread."""
import logging
import threading
import time

import settings_store
from database import SessionLocal
from routers.attendance import auto_close_expired_shifts

log = logging.getLogger("auto_close_shifts")
INTERVAL_SECONDS = 600
_started = False
_started_lock = threading.Lock()


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
    """Idempotent — safe to call more than once in the same process (e.g. once
    from FastAPI's ASGI startup event, once from the Phusion Passenger
    starting_worker_process fork hook in main.py). Only the first call in a
    given process actually launches the thread."""
    global _started
    with _started_lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="auto-close-shifts", daemon=True).start()
