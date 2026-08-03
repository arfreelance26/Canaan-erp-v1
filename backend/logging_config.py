"""
Centralised application logging.

Configures a rotating file log at logs/erp.log PLUS console output, and routes
the app loggers (canaan.app, canaan.audit) and uvicorn's own loggers through the
same handlers. Because this is configured in code (called from main.py at import
time) it works no matter how the app is launched — `uvicorn` on the dev machine
or Passenger/LiteSpeed on the production host — where CLI --log-config never runs.

Environment overrides:
    LOG_DIR    directory for log files            (default: <backend>/logs)
    LOG_LEVEL  root log level                      (default: INFO)
    LOG_MAX_MB max size per file before rotating   (default: 10)
    LOG_BACKUPS number of rotated files to keep    (default: 10)
"""
import logging
import os
from logging.handlers import RotatingFileHandler

_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s — %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_configured = False


def setup_logging() -> str:
    """Idempotent. Returns the absolute path of the log file."""
    global _configured

    log_dir = os.getenv("LOG_DIR") or os.path.join(_BACKEND_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "erp.log")

    if _configured:
        return log_file

    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    max_bytes = int(os.getenv("LOG_MAX_MB", "10")) * 1024 * 1024
    backups = int(os.getenv("LOG_BACKUPS", "10"))

    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

    # Rotating file handler — the durable production record.
    file_handler = RotatingFileHandler(
        log_file, maxBytes=max_bytes, backupCount=backups, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    # Console handler — dev visibility; on the production host Passenger/LiteSpeed
    # captures stderr into its own log too, so nothing is lost.
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(level)
    # Replace any handlers a prior import (e.g. audit.py or uvicorn) attached, so we
    # don't emit every line twice.
    root.handlers.clear()
    root.addHandler(file_handler)
    root.addHandler(console_handler)

    # Route uvicorn's loggers through root's handlers instead of its own.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True

    # App loggers propagate to root; make sure they don't keep private handlers.
    for name in ("canaan.app", "canaan.audit"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True

    _configured = True
    logging.getLogger("canaan.app").info(
        "Logging initialised → %s (level=%s, max=%sMB, backups=%s)",
        log_file, logging.getLevelName(level), max_bytes // (1024 * 1024), backups,
    )
    return log_file
