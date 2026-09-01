from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user, TokenUser
import models, schemas

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=list[schemas.NotificationOut])
def list_notifications(
    unread_only: bool = True,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Notifications targeted at the current user's role (newest first, max 50)."""
    q = db.query(models.Notification).filter(
        models.Notification.target_roles.contains(current_user.role)
    )
    if unread_only:
        q = q.filter(models.Notification.is_read.is_(False))
    return q.order_by(models.Notification.created_at.desc()).limit(50).all()


@router.post("/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    notif = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(404, "Notification not found")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    db.query(models.Notification).filter(
        models.Notification.target_roles.contains(current_user.role),
        models.Notification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Computed reminders: renewals, EMI, recurring payments, licenses.
# Recomputed from live data on every call — always current, nothing to sync.
# ---------------------------------------------------------------------------

from datetime import date, timedelta

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
    if show_payments:
        today = date.today()
        for e in db.query(models.EmiRecord).all():
            # skip loans already finished
            if e.emi_end_date and e.emi_end_date < today:
                continue
            due = e.emi_payment_date
            if due is None:
                continue
            # roll the stored payment day forward to this month's occurrence
            try:
                due_this = due.replace(year=today.year, month=today.month)
            except ValueError:
                due_this = due
            if due_this < today - timedelta(days=PAY_WINDOW_DAYS):
                # already passed well beyond window: next month
                m = today.month % 12 + 1
                y = today.year + (1 if m == 1 else 0)
                try:
                    due_this = due.replace(year=y, month=m)
                except ValueError:
                    pass
            days = _days_left(due_this)
            if days <= PAY_WINDOW_DAYS:
                reminders.append({
                    "kind": "emi",
                    "severity": "overdue" if days < 0 else "due_soon",
                    "title": f"EMI payment {'overdue' if days < 0 else 'due'}",
                    "detail": f"{e.emi_name} ({e.bank_name or 'Bank'}) — ₹{e.emi_amount or 0} due {due_this.isoformat()}",
                    "entity": e.emi_name,
                    "due_date": due_this.isoformat(),
                    "days_left": days,
                    "href": "/finance/emi-tracking",
                })

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
