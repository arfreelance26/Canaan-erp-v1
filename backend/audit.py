"""
Security audit logging.

Writes an append-only row to the `audit_logs` table AND emits a structured line
to the application logger for every security-relevant event. Failures here are
swallowed (logged, never raised) so auditing can never break a business request.

Usage:
    from audit import record_audit
    record_audit("login.success", request=request, actor_name=user.name, actor_role=user.role)
"""
import logging
from typing import Optional

from fastapi import Request

from database import SessionLocal
import models

logger = logging.getLogger("canaan.audit")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [AUDIT] %(message)s"))
    logger.addHandler(_h)
    logger.setLevel(logging.INFO)


def client_ip(request: Optional[Request]) -> Optional[str]:
    """Best-effort client IP. Honours X-Forwarded-For (first hop) when behind a
    trusted reverse proxy (Apache/LiteSpeed on cPanel), else the socket peer."""
    if request is None:
        return None
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


def record_audit(
    event: str,
    *,
    outcome: str = "success",
    request: Optional[Request] = None,
    actor_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    actor_role: Optional[str] = None,
    resource: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    ip = client_ip(request)
    ua = request.headers.get("user-agent") if request else None
    logger.info(
        "%s outcome=%s actor=%s role=%s resource=%s ip=%s detail=%s",
        event, outcome, actor_name or actor_id or "-", actor_role or "-",
        resource or "-", ip or "-", detail or "-",
    )
    db = SessionLocal()
    try:
        db.add(models.AuditLog(
            event=event,
            outcome=outcome,
            actor_id=actor_id,
            actor_name=actor_name,
            actor_role=actor_role,
            resource=resource,
            ip_address=ip,
            user_agent=(ua[:300] if ua else None),
            detail=(detail[:1000] if detail else None),
        ))
        db.commit()
    except Exception:  # noqa: BLE001 — auditing must never break the request path
        db.rollback()
        logger.exception("Failed to persist audit row for event=%s", event)
    finally:
        db.close()
