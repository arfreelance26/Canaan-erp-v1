from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user, TokenUser
import models, schemas

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _reader_key(user: TokenUser) -> str:
    return f"staff:{user.id}" if user.id is not None else f"admin:{user.name}"


def _unread_filter(db: Session, user: TokenUser):
    """Not read by THIS person. Rows read under the old shared flag stay read."""
    read_ids = db.query(models.NotificationRead.notification_id).filter(
        models.NotificationRead.reader_key == _reader_key(user)
    )
    return (models.Notification.is_read.is_(False)) & (~models.Notification.id.in_(read_ids))


def _out(n: models.Notification, unread: bool) -> schemas.NotificationOut:
    out = schemas.NotificationOut.model_validate(n)
    out.is_read = not unread
    return out


@router.get("", response_model=list[schemas.NotificationOut])
def list_notifications(
    unread_only: bool = True,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Notifications targeted at the current user's role (newest first, max 50).
    Read state is per person — one person opening an alert doesn't clear it
    for the others in that role."""
    q = db.query(models.Notification).filter(
        models.Notification.target_roles.contains(current_user.role)
    )
    unread = _unread_filter(db, current_user)
    if unread_only:
        rows = q.filter(unread).order_by(models.Notification.created_at.desc()).limit(50).all()
        return [_out(n, True) for n in rows]
    rows = q.order_by(models.Notification.created_at.desc()).limit(50).all()
    unread_ids = {nid for (nid,) in db.query(models.Notification.id).filter(
        models.Notification.id.in_([n.id for n in rows]), unread)} if rows else set()
    return [_out(n, n.id in unread_ids) for n in rows]


def _mark(db: Session, user: TokenUser, ids: list[int]) -> None:
    key = _reader_key(user)
    have = {nid for (nid,) in db.query(models.NotificationRead.notification_id).filter(
        models.NotificationRead.reader_key == key,
        models.NotificationRead.notification_id.in_(ids),
    )} if ids else set()
    for nid in ids:
        if nid not in have:
            db.add(models.NotificationRead(notification_id=nid, reader_key=key))


@router.post("/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    notif = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(404, "Notification not found")
    _mark(db, current_user, [notif.id])
    try:
        db.commit()
    except IntegrityError:   # the same person marked it twice at once
        db.rollback()
    return _out(notif, False)


@router.post("/read-all")
def mark_all_read(
    exclude: str = "",
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Mark every unread notification read for this person. `exclude` is a
    comma-separated list of event types to leave unread (e.g. the bell's
    "clear trip sheet alerts" mustn't clear maintenance alerts)."""
    q = db.query(models.Notification.id).filter(
        models.Notification.target_roles.contains(current_user.role),
        _unread_filter(db, current_user),
    )
    skip = [t.strip() for t in exclude.split(",") if t.strip()]
    if skip:
        q = q.filter(~models.Notification.event_type.in_(skip))
    _mark(db, current_user, [nid for (nid,) in q])
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Computed reminders: renewals, EMI, recurring payments, licenses.
# Recomputed from live data on every call — always current, nothing to sync.
# ---------------------------------------------------------------------------

from datetime import date

DOC_WINDOW_DAYS = 30    # documents: alert 30 days before expiry
PAY_WINDOW_DAYS = 7     # payments: alert 7 days before due


def _days_left(d: date) -> int:
    return (d - date.today()).days


def _doc_reminder(kind: str, label: str, entity: str, expiry: date | None, href: str):
    if expiry is None:
        return None
    days = _days_left(expiry)
    if days > DOC_WINDOW_DAYS:
        return None
    return {
        "kind": kind,
        "severity": "overdue" if days < 0 else "due_soon",
        "title": f"{label} {'expired' if days < 0 else 'expiring'}",
        "detail": f"{entity} — {label} {'expired' if days < 0 else 'expires'} on {expiry.isoformat()}",
        "entity": entity,
        "due_date": expiry.isoformat(),
        "days_left": days,
        "href": href,
    }


@router.get("/reminders")
def list_reminders(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Upcoming/overdue reminders, split by role:
    - Renewals (vehicle & driver documents): Admin + Commercial Manager + Assistant Commercial Manager
    - Payments (EMI & recurring): Admin + Accounts
    Admin sees both."""
    role = current_user.role
    show_renewals = role in ("Admin", "Commercial Manager", "Assistant Commercial Manager")
    show_payments = role in ("Admin", "Accounts")
    if not show_renewals and not show_payments:
        return []

    reminders = []

    # -- Renewals (Admin + Fleet Manager) ---------------------------------
    if show_renewals:
        # Truck document renewals
        trucks = db.query(models.Truck).all()
        for t in trucks:
            entity = t.registration_number
            for kind, label, expiry in (
                ("insurance", "Insurance", t.insurance_expiry_date),
                ("fc", "Fitness Certificate (FC)", t.fc_expiry_date),
                ("rc", "RC Validity", t.rc_validity_date),
                ("road_tax", "Road Tax", t.road_tax_date),
                ("national_permit", "National Permit", t.national_permit_date),
                ("local_permit", "Local Permit", t.local_permit_date),
                ("pollution", "Pollution Certificate", t.pollution_certificate_date),
            ):
                r = _doc_reminder(kind, label, entity, expiry, "/maintenance/compliance")
                if r:
                    reminders.append(r)

        # Driver license expiry
        drivers = db.query(models.Driver).filter(models.Driver.deleted_at.is_(None)).all()
        for d in drivers:
            r = _doc_reminder("license", "Driving License", d.name, d.license_expiry_date, "/resources/drivers")
            if r:
                reminders.append(r)

    # -- Payments (Admin + Finance Manager) -------------------------------
    # NOTE: EMI due/overdue reminders were removed along with emi_payment_date —
    # the EMI alert system is being redesigned around auto_debit_date.
    if show_payments:
        for p in db.query(models.RecurringPayment).filter(
            models.RecurringPayment.status == "Active"
        ).all():
            if p.next_due_date is None:
                continue
            days = _days_left(p.next_due_date)
            if days <= PAY_WINDOW_DAYS:
                reminders.append({
                    "kind": "recurring",
                    "severity": "overdue" if days < 0 else "due_soon",
                    "title": f"Recurring payment {'overdue' if days < 0 else 'due'}",
                    "detail": f"{p.title} ({p.frequency}) — ₹{p.amount or 0} due {p.next_due_date.isoformat()}",
                    "entity": p.title,
                    "due_date": p.next_due_date.isoformat(),
                    "days_left": days,
                    "href": "/finance/emi-tracking",
                })

    reminders.sort(key=lambda r: r["days_left"])
    return reminders
