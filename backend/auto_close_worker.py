"""Runs the staff shift auto-close every few minutes in a background thread."""
import logging
import threading
import time

from database import SessionLocal
from routers.attendance import auto_close_expired_shifts

log = logging.getLogger("auto_close_shifts")
INTERVAL_SECONDS = 600


def _loop() -> None:
    while True:
        db = SessionLocal()
        try:
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
    threading.Thread(target=_loop, name="auto-close-shifts", daemon=True).start()
