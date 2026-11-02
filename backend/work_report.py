"""Staff Work Report: what each employee actually got done on a day.

Only actions in WORK count; views, clicks, chats and failed attempts never reach
this. Every save-type route is in WORK or NOT_WORK, and a test fails when a new
one is in neither (tests/test_work_report.py).

Saved for good, so any day can be reported on. activity_events is purged after
180 days and usage_sessions goes with a deleted staff record, so:
  work_items      one row per piece of work, written with the activity log's flush
  work_day_staff  one row per employee per day (shift + active time), saved once
                  the day is over — see save_due_days()
"""
import io
import json
import logging
import re
from collections import Counter, namedtuple
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import func
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import Session

import models

log = logging.getLogger("activity")

IST = ZoneInfo("Asia/Kolkata")
QUIET_GAP_MINUTES = 60
REPEAT_WINDOW = timedelta(minutes=10)   # the same record saved again this soon counts once
MAX_DAYS_PER_RUN = 31
ROLE_ORDER = ("Admin", "Commercial Manager", "Assistant Commercial Manager", "Yard Supervisor", "Trip Sheet Register",
              "Accounts", "Maintenance", "Auditor")
BACKFILL_DONE_KEY = "work_report_backfill_done"

# rec: what the record is — a lookup kind in _LOOKUPS, or None when `field` is
# already its name. field: where to find it in the reply; else the URL's id.
Work = namedtuple("Work", "label group rec field", defaults=(None, None))

WORK = {
    # Trips
    "POST /trips": Work("Trip booked", "Trips", field="trip_id"),
    "PUT /trips/{trip_id}": Work("Booking edited", "Trips", "trip"),
    "PATCH /trips/{trip_id}/status": Work("Trip status updated", "Trips", "trip"),
    "POST /trips/{trip_id}/close": Work("Booking sheet completed", "Trips", "trip"),
    "POST /drivers/assignments": Work("Driver assigned", "Trips", field="driver_id"),
    "POST /cfs-yard": Work("CFS yard entry added", "Trips"),
    "PUT /cfs-yard/{entry_id}": Work("CFS yard entry edited", "Trips"),
    # Trip sheets
    "POST /trips/{trip_id}/collect-sheet": Work("Trip sheet collected", "Trip Sheets", "trip"),
    "POST /trips/{trip_id}/flag-sheet-missing": Work("Trip sheet flagged missing", "Trip Sheets", "trip"),
    "POST /trips/{trip_id}/receive-sheet": Work("Trip sheet received", "Trip Sheets", "trip"),
    "POST /trips/{trip_id}/sheet": Work("Trip sheet entered", "Trip Sheets", "trip"),
    "PATCH /trips/{trip_id}/lr": Work("LR details entered", "Trip Sheets", "trip"),
    # Driver attendance
    "POST /attendance/drivers": Work("Driver attendance marked", "Driver Attendance", field="driver_id"),
    "PUT /attendance/drivers/{record_id}": Work("Driver attendance edited", "Driver Attendance", field="driver_id"),
    # Customers
    "POST /customers": Work("Customer added", "Customers", field="name"),
    "PUT /customers/{customer_id}": Work("Customer edited", "Customers", "customer"),
    "POST /customers/{customer_id}/destinations": Work("Route added", "Customers", "customer"),
    "PUT /customers/{customer_id}/destinations/{dest_id}": Work("Route edited", "Customers", "customer"),
    "POST /customers/{customer_id}/pricing": Work("Customer pricing added", "Customers", "customer"),
    "PUT /customers/{customer_id}/pricing/{price_id}": Work("Customer pricing edited", "Customers", "customer"),
    "POST /customers/{customer_id}/final-pricing": Work("Final pricing added", "Customers", "customer"),
    "PUT /customers/{customer_id}/final-pricing/{pricing_id}": Work("Final pricing edited", "Customers", "customer"),
    # Accounts
    "POST /trips/{trip_id}/verify": Work("Trip verified", "Accounts", "trip"),
    "POST /trips/{trip_id}/verify-advance": Work("Advance verified", "Accounts", "trip"),
    "POST /trips/{trip_id}/reject-verification": Work("Trip rejected", "Accounts", "trip"),
    "POST /trips/{trip_id}/resubmit-verification": Work("Trip resubmitted", "Accounts", "trip"),
    "POST /trips/{trip_id}/invoice": Work("Invoice generated", "Accounts", "trip"),
    "POST /trips/invoice-combined": Work("Combined invoice generated", "Accounts"),
    "POST /trips/{trip_id}/waive-invoice": Work("Invoice waived", "Accounts", "trip"),
    "POST /finance/compensation/drivers": Work("Driver payment recorded", "Accounts"),
    "POST /finance/compensation/staff": Work("Staff payment recorded", "Accounts"),
    "POST /finance/emi": Work("EMI entry added", "Accounts"),
    "PUT /finance/emi/{emi_id}": Work("EMI entry edited", "Accounts"),
    "POST /finance/recurring-payments": Work("Recurring payment added", "Accounts"),
    "PUT /finance/recurring-payments/{payment_id}": Work("Recurring payment edited", "Accounts"),
    "POST /payment-requests/{message_id}/mark-paid": Work("Payment marked as paid", "Accounts"),
    "POST /party-halt/{trip_id}/paid": Work("Customer detention marked paid", "Accounts", "trip"),
    # Approvals
    "POST /payment-requests/{message_id}/decision": Work("Payment request decided", "Approvals"),
    "PUT /maintenance-requests/{request_id}/approve": Work("Maintenance request approved", "Approvals"),
    "PUT /maintenance-requests/{request_id}/reject": Work("Maintenance request rejected", "Approvals"),
    "PATCH /edit-approvals/{request_id}/approve": Work("Edit request approved", "Approvals"),
    "PATCH /edit-approvals/{request_id}/reject": Work("Edit request rejected", "Approvals"),
    "PUT /deletion-approvals/{req_id}/approve": Work("Deletion request approved", "Approvals"),
    "PUT /deletion-approvals/{req_id}/reject": Work("Deletion request rejected", "Approvals"),
    "PATCH /attendance/leave-requests/{request_id}/approve": Work("Leave approved", "Approvals"),
    "PATCH /attendance/leave-requests/{request_id}/reject": Work("Leave rejected", "Approvals"),
    # Maintenance
    "POST /maintenance-requests": Work("Repair request added", "Maintenance", "truck", "truck_id"),
    "PUT /maintenance/records/{record_id}": Work("Maintenance record edited", "Maintenance", "truck", "truck_id"),
    "POST /maintenance/records/{record_id}/proofs": Work("Maintenance proof added", "Maintenance"),
    "POST /compliance-records/truck/{truck_id}/{doc_type}/renew": Work("Truck document renewed", "Maintenance", "truck"),
    "POST /compliance-records/truck/{truck_id}/{doc_type}/correct": Work("Truck document corrected", "Maintenance", "truck"),
    "POST /vendors": Work("Vendor added", "Maintenance", field="name"),
    "PUT /vendors/{vendor_id}": Work("Vendor edited", "Maintenance", "vendor"),
    # Fuel
    "POST /maintenance/fuel-logs": Work("Fuel log added", "Fuel", "truck", "truck_id"),
    "PUT /maintenance/fuel-logs/{log_id}": Work("Fuel log edited", "Fuel", "truck", "truck_id"),
    "POST /maintenance/adblue-logs": Work("AdBlue log added", "Fuel", "truck", "truck_id"),
    "PUT /maintenance/adblue-logs/{log_id}": Work("AdBlue log edited", "Fuel", "truck", "truck_id"),
    # Tyres
    "POST /tyre-inventory": Work("Tyre added", "Tyres", field="tyre_number"),
    "PUT /tyre-inventory/{tyre_id}": Work("Tyre edited", "Tyres", "tyre"),
    "POST /tyre-fitment": Work("Tyre fitted", "Tyres", "truck", "truck_id"),
    "PATCH /tyre-fitment/{fitment_id}/remove": Work("Tyre removed", "Tyres", "truck", "truck_id"),
    "POST /tyre-fitment/remove-bulk": Work("Tyres removed", "Tyres"),
    "POST /tyre-fitment/swap": Work("Tyres swapped", "Tyres"),
    "POST /tyre-inventory/{tyre_id}/flag-retread": Work("Tyre sent for retreading", "Tyres", "tyre"),
    "POST /tyre-inventory/{tyre_id}/move-to-inventory": Work("Tyre retreaded", "Tyres", "tyre"),
    "POST /tyre-inventory/{tyre_id}/flag-discard": Work("Tyre discarded", "Tyres", "tyre"),
    # Audit
    "POST /trips/{trip_id}/recheck-verify": Work("Trip audited and verified", "Audit", "trip"),
    "POST /trips/{trip_id}/recheck-flag": Work("Trip flagged by audit", "Audit", "trip"),
    "POST /trips/{trip_id}/recheck-undo-verify": Work("Audit verification undone", "Audit", "trip"),
    "POST /trips/{trip_id}/recheck-return": Work("Trip returned for review", "Audit", "trip"),
    "POST /trips/{trip_id}/request-reverification": Work("Trip sent for re-verification", "Audit", "trip"),
    "POST /trips/{trip_id}/flag": Work("Trip flagged", "Audit", "trip"),
}

# Save-type routes that are not work: housekeeping, settings, chat, notes, one's
# own attendance and leave, marking things as read, deletions and restores.
NOT_WORK = frozenset({
    "POST /activity/batch",
    "POST /attendance/drivers/late-entry-log",
    "POST /attendance/drivers/remarks",
    "DELETE /attendance/drivers/remarks/{remark_id}",
    "PUT /attendance/drivers/remarks/{remark_id}",
    "POST /attendance/holidays",
    "DELETE /attendance/holidays/{holiday_id}",
    "POST /attendance/leave-requests",
    "POST /attendance/staff",
    "POST /attendance/staff/close-shift",
    "POST /attendance/staff/resume-shift",
    "POST /attendance/staff/self-mark",
    "PUT /attendance/staff/{record_id}",
    "POST /auth/lockouts/reset",
    "POST /auth/login",
    "POST /auth/logout",
    "POST /branches",
    "DELETE /branches/{branch_id}",
    "PUT /branches/{branch_id}",
    "PUT /celebrations/messages",
    "PUT /celebrations/switch",
    "DELETE /cfs-yard/{entry_id}",
    "DELETE /cfs-yard/{entry_id}/permanent",
    "POST /cfs-yard/{entry_id}/restore",
    "POST /chat/conversations/direct",
    "POST /chat/conversations/group",
    "PATCH /chat/conversations/{conversation_id}",
    "POST /chat/conversations/{conversation_id}/attachment",
    "POST /chat/conversations/{conversation_id}/members",
    "DELETE /chat/conversations/{conversation_id}/members/{staff_id}",
    "POST /chat/conversations/{conversation_id}/messages",
    "POST /chat/conversations/{conversation_id}/mute",
    "DELETE /chat/conversations/{conversation_id}/photo",
    "POST /chat/conversations/{conversation_id}/photo",
    "POST /chat/conversations/{conversation_id}/read",
    "POST /chat/conversations/{conversation_id}/typing",
    "POST /chat/conversations/{conversation_id}/voice",
    "DELETE /chat/messages/{message_id}",
    "PATCH /chat/messages/{message_id}",
    "PUT /chat/messages/{message_id}/reaction",
    "DELETE /party-halt/{trip_id}/paid",
    "POST /chat/messages/{message_id}/payment-status",
    "POST /chat/owner-view/change-password",
    "POST /chat/owner-view/lock",
    "POST /chat/owner-view/unlock",
    "POST /compliance-records/truck/{truck_id}/{doc_type}/undo-renewal",
    "DELETE /customers/{customer_id}",
    "DELETE /customers/{customer_id}/destinations/{dest_id}",
    "DELETE /customers/{customer_id}/final-pricing/{pricing_id}",
    "POST /customers/{customer_id}/origins",
    "DELETE /customers/{customer_id}/origins/{origin_id}",
    "DELETE /customers/{customer_id}/permanent",
    "DELETE /customers/{customer_id}/pricing/{price_id}",
    "POST /customers/{customer_id}/restore",
    "PUT /default-batta-rates",
    "POST /deletion-approvals",
    "POST /deletion-approvals/mine/mark-seen",
    "POST /drivers",
    "DELETE /drivers/assignments/{driver_id_str}",
    "DELETE /drivers/{driver_id}",
    "PUT /drivers/{driver_id}",
    "DELETE /drivers/{driver_id}/permanent",
    "POST /drivers/{driver_id}/restore",
    "POST /edit-approvals",
    "POST /edit-approvals/mine/mark-seen",
    "DELETE /edit-approvals/{request_id}",
    "POST /events",
    "DELETE /events/{event_id}",
    "POST /events/{event_id}/complete",
    "DELETE /files/{entity}/{entity_id}/{field}",
    "POST /files/{entity}/{entity_id}/{field}",
    "DELETE /finance/compensation/{tx_id}",
    "DELETE /finance/emi/{emi_id}",
    "DELETE /finance/recurring-payments/{payment_id}",
    "POST /maintenance-categories",
    "DELETE /maintenance-categories/{category_id}",
    "PUT /maintenance-categories/{category_id}",
    "POST /maintenance-categories/{category_id}/repairs",
    "DELETE /maintenance-categories/{category_id}/repairs/{repair_id}",
    "PUT /maintenance-categories/{category_id}/repairs/{repair_id}",
    "POST /maintenance-requests/mine/mark-seen",
    "POST /maintenance-requests/{request_id}/proofs",
    "DELETE /maintenance/adblue-logs/{log_id}",
    "POST /maintenance/adblue-manufacturers",
    "DELETE /maintenance/adblue-manufacturers/{manufacturer_id}",
    "PUT /maintenance/adblue-manufacturers/{manufacturer_id}",
    "PUT /maintenance/fuel-base-config",
    "DELETE /maintenance/fuel-logs/{log_id}",
    "DELETE /maintenance/records/{record_id}",
    "DELETE /maintenance/records/{record_id}/proofs/{proof_id}",
    "POST /notes",
    "DELETE /notes/{note_id}",
    "PATCH /notes/{note_id}",
    "POST /notifications/read-all",
    "POST /notifications/{notification_id}/read",
    "POST /repair-types",
    "DELETE /repair-types/{repair_type_id}",
    "PUT /repair-types/{repair_type_id}",
    "POST /room-summon",
    "PUT /running-cost/cost-per-km",
    "PUT /running-cost/state",
    "POST /sac-codes",
    "DELETE /sac-codes/{sac_code_id}",
    "PUT /sac-codes/{sac_code_id}",
    "PATCH /sac-codes/{sac_code_id}/auto-populate",
    "PATCH /sac-codes/{sac_code_id}/link-expense",
    "PUT /settings/attendance-mandatory",
    "PUT /settings/auto-close-enabled",
    "PUT /settings/device-lock",
    "POST /settings/device-lock/reset-all",
    "PUT /settings/driver-advance-max",
    "PUT /settings/max-shift-hours",
    "POST /staff",
    "DELETE /staff/{staff_id}",
    "PUT /staff/{staff_id}",
    "POST /staff/{staff_id}/force-logout",
    "POST /staff/{staff_id}/freeze",
    "DELETE /staff/{staff_id}/permanent",
    "POST /staff/{staff_id}/reset-device",
    "POST /staff/{staff_id}/restore",
    "POST /staff/{staff_id}/unfreeze",
    "POST /todos",
    "DELETE /todos/completed",
    "DELETE /todos/{todo_id}",
    "PATCH /todos/{todo_id}",
    "PUT /trip-expense-rates",
    "DELETE /trips/{trip_id}",
    "DELETE /trips/{trip_id}/permanent",
    "POST /trips/{trip_id}/restore",
    "POST /trips/{trip_id}/sheet/km-check",
    "POST /trips/{trip_id}/unmark-sheet",
    "POST /trucks",
    "PUT /trucks/base-tyre-cost",
    "PUT /trucks/run-config",
    "DELETE /trucks/{truck_id}",
    "PUT /trucks/{truck_id}",
    "POST /trucks/{truck_id}/branch-change",
    "POST /trucks/{truck_id}/odometer-correction",
    "DELETE /trucks/{truck_id}/permanent",
    "POST /trucks/{truck_id}/restore",
    "POST /trucks/{truck_id}/sell",
    "DELETE /tyre-inventory/{tyre_id}",
    "DELETE /tyre-inventory/{tyre_id}/permanent",
    "DELETE /tyre-inventory/{tyre_id}/proof",
    "POST /tyre-inventory/{tyre_id}/proof",
    "POST /tyre-inventory/{tyre_id}/restore",
    "POST /tyre-inventory/{tyre_id}/restore-from-discard",
    "DELETE /tyre-inventory/{tyre_id}/retreads/{event_id}/proof",
    "POST /tyre-inventory/{tyre_id}/retreads/{event_id}/proof",
    "PUT /tyre-layout-type-config",
    "PUT /tyre-range-config",
    "DELETE /tyre-range-config/{tyre_type}",
    "POST /tyre-remark-presets",
    "DELETE /tyre-remark-presets/{preset_id}",
    "POST /usage/heartbeat",
    "POST /vendor-categories",
    "DELETE /vendor-categories/{vendor_category_id}",
    "DELETE /vendors/{vendor_id}",
    "DELETE /vendors/{vendor_id}/permanent",
    "POST /vendors/{vendor_id}/restore",
})

_LOOKUPS = {
    "trip": (models.Trip, models.Trip.trip_id, "trip_id"),
    "truck": (models.Truck, models.Truck.registration_number, "truck_id"),
    "tyre": (models.TyreInventory, models.TyreInventory.tyre_number, "tyre_id"),
    "customer": (models.Customer, models.Customer.name, "customer_id"),
    "vendor": (models.Vendor, models.Vendor.name, "vendor_id"),
}
_ROUTE_TEMPLATES = {re.sub(r"\{[^}]+\}", "{id}", k.split(" ", 1)[1]): k for k in WORK}


def entry_for(method: str, route) -> tuple[str, Work] | None:
    """The WORK entry for a request. `route` is the matched route on the request's scope."""
    path = getattr(route, "path", None)
    key = f"{method} {path}"
    return (key, WORK[key]) if key in WORK else None


def work_row(key: str, work: Work, params: dict, body: bytes | None, user: tuple, now: datetime) -> dict:
    """One work_items row, not yet resolved to a record's name."""
    user_key, user_name, _, role = user
    value = None
    if work.field and body:
        try:
            value = json.loads(body).get(work.field)
        except (ValueError, AttributeError):
            value = None
    elif work.rec:
        value = params.get(_LOOKUPS[work.rec][2])
    return {
        "day": now.replace(tzinfo=timezone.utc).astimezone(IST).date(), "created_at": now,
        "user_key": user_key, "user_name": user_name, "role": (role or "")[:60] or None,
        "work": work.label, "work_group": work.group, "route": key[:200], "record": value, "lookup": work.rec,
    }


def resolve_records(db: Session, rows: list[dict]) -> list[dict]:
    """Ids to names ("1177" → "TRP-1177"), done at write time because the record
    may be gone by the time anyone reads the report."""
    out = []
    for row in rows:
        row = dict(row)
        kind, value = row.pop("lookup"), row["record"]
        if kind and value is not None:
            model, column, _ = _LOOKUPS[kind]
            try:
                value = db.query(column).filter(model.id == int(value)).scalar()
            except (TypeError, ValueError):
                value = None
        row["record"] = str(value)[:100] if value not in (None, "") else None
        out.append(row)
    return out


# ---------------------------------------------------------------------------
# One day, one employee
# ---------------------------------------------------------------------------

def _now_ist() -> datetime:
    return datetime.now(IST)


def _clock(value: str | None) -> datetime | None:
    try:
        return datetime.strptime(value, "%I:%M %p") if value else None
    except ValueError:
        return None


def _bounds_utc(day: date) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)
    return start, start + timedelta(days=1)


def _duration(minutes: int) -> str:
    return f"{minutes // 60}h {minutes % 60:02d}m"


def _time(dt: datetime) -> str:
    return dt.strftime("%I:%M %p")


def _ist(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc).astimezone(IST).replace(tzinfo=None)


def merge_repeats(items: list) -> list:
    """Saving one record again and again within REPEAT_WINDOW counts once.
    Items with no record name (older days) can't be told apart, so all stay."""
    kept, last_seen = [], {}
    for item in sorted(items, key=lambda i: i.created_at):
        key = (item.work, item.record)
        seen = last_seen.get(key)
        last_seen[key] = item.created_at
        if item.record and seen and item.created_at - seen <= REPEAT_WINDOW:
            continue
        kept.append(item)
    return kept


def quiet_gaps(times: list[datetime], shift_start: datetime | None, shift_end: datetime | None) -> list[dict]:
    """Stretches of QUIET_GAP_MINUTES or more inside the shift with no recorded work."""
    if not shift_start or not shift_end or shift_end <= shift_start:
        return []
    inside = sorted(t for t in times if shift_start <= t <= shift_end)
    points = [shift_start, *inside, shift_end]
    gaps = []
    for a, b in zip(points, points[1:]):
        minutes = int((b - a).total_seconds() // 60)
        if minutes >= QUIET_GAP_MINUTES:
            gaps.append({"from": _time(a), "to": _time(b), "minutes": minutes})
    return gaps


def summary_text(p: dict) -> str:
    name, count = p["name"], p["work_count"]
    top = p["work_done"][0] if p["work_done"] else None
    done = (f"They completed {count} work item{'' if count == 1 else 's'}, mostly {top['work'].lower()} ({top['count']})."
            if top else "No work was recorded.")
    if p["status"] == "On Leave":
        return f"{name} was on leave." + ("" if not count else f" {done}")
    if p["status"] == "Absent":
        return f"{name} was marked absent." + ("" if not count else f" {done}")
    if p["marked_minutes"] is None:
        opening = f"{name} did not mark attendance" if not p["shift_in"] else f"{name} started at {p['shift_in']} and did not close the shift"
        return f"{opening}. Active in the software for {_duration(p['active_minutes'])}. {done}"
    pct = round(p["active_minutes"] / p["marked_minutes"] * 100) if p["marked_minutes"] else 0
    text = (f"{name} marked {_duration(p['marked_minutes'])} ({p['shift_in']} to {p['shift_out'] or 'now'}) and was active "
            f"in the software for {_duration(p['active_minutes'])} ({pct}%). {done}")
    gaps = p["gaps"]
    if gaps:
        longest = _duration(max(g["minutes"] for g in gaps))
        text += f" There {'was 1 quiet gap' if len(gaps) == 1 else f'were {len(gaps)} quiet gaps'} of 1 hour or more; the longest was {longest}."
    return text


def _day_rows(db: Session, day: date, now: datetime) -> list[dict]:
    """Every employee's attendance and active time for a day, worked out from the live tables."""
    start, end = _bounds_utc(day)
    staff = (db.query(models.Staff)
             .filter(models.Staff.deleted_at.is_(None))
             .filter((models.Staff.date_of_joining.is_(None)) | (models.Staff.date_of_joining <= day)).all())
    attendance = {a.staff_id: a for a in db.query(models.StaffAttendance).filter(models.StaffAttendance.date == day)}
    active = dict(db.query(models.UsageSession.staff_id, func.sum(models.UsageSession.total_active_seconds))
                  .filter(models.UsageSession.login_at >= start, models.UsageSession.login_at < end)
                  .group_by(models.UsageSession.staff_id).all())
    rows = []
    for s in staff:
        a = attendance.get(s.id)
        rows.append({
            "day": day, "user_key": str(s.id), "user_name": s.name, "role": s.software_designation,
            "status": a.status if a else "Not Marked", "check_in": a.check_in_time if a else None,
            "check_out": a.check_out_time if a else None, "active_seconds": int(active.get(s.id) or 0),
        })
    return rows


def save_day(db: Session, day: date, now: datetime | None = None) -> None:
    """Saves a finished day. INSERT IGNORE, so a second run or worker changes nothing."""
    rows = _day_rows(db, day, now or _now_ist())
    if rows:
        db.execute(mysql_insert(models.WorkDayStaff).values(rows).prefix_with("IGNORE"))
    db.commit()


def backfill(db: Session) -> int:
    """Once, on first run: what the activity log still holds becomes work_items.
    The log has no record ids and can't merge repeats, so these rows are marked."""
    done = db.get(models.AppSetting, BACKFILL_DONE_KEY)
    if done:
        return 0
    first_live = (db.query(func.min(models.WorkItem.created_at))
                  .filter(models.WorkItem.source_event_id.is_(None)).scalar())
    q = db.query(models.ActivityEvent).filter(
        models.ActivityEvent.route.in_(list(_ROUTE_TEMPLATES)),
        models.ActivityEvent.kind.in_(("save", "delete")),
        models.ActivityEvent.status >= 200, models.ActivityEvent.status < 300,
    )
    if first_live:
        q = q.filter(models.ActivityEvent.created_at < first_live)
    rows = []
    for e in q.yield_per(1000):
        key = _ROUTE_TEMPLATES[e.route]
        if not key.startswith(f"{e.method} "):
            continue
        work = WORK[key]
        rows.append({
            "day": _ist(e.created_at).date(), "created_at": e.created_at, "user_key": e.user_key,
            "user_name": e.user_name, "role": e.role, "work": work.label, "work_group": work.group,
            "route": key[:200], "record": None, "source_event_id": e.id,
        })
    for i in range(0, len(rows), 1000):
        db.execute(mysql_insert(models.WorkItem).values(rows[i:i + 1000]).prefix_with("IGNORE"))
    db.add(models.AppSetting(key=BACKFILL_DONE_KEY, value="1"))
    db.commit()
    return len(rows)


def save_due_days(db: Session, today: date | None = None) -> int:
    """Catches up every finished day that isn't saved yet."""
    today = today or _now_ist().date()
    last = db.query(func.max(models.WorkDayStaff.day)).scalar()
    day = last + timedelta(days=1) if last else db.query(func.min(models.WorkItem.day)).scalar()
    saved = 0
    while day and day < today and saved < MAX_DAYS_PER_RUN:
        save_day(db, day)
        day += timedelta(days=1)
        saved += 1
    return saved


def catch_up(db: Session) -> None:
    """Runs hourly, and before a report so it never waits for that. A failure
    here must not stop the report: unsaved days are worked out live instead."""
    try:
        backfill(db)
        save_due_days(db)
    except Exception:
        db.rollback()
        log.exception("saving the work report failed; will retry later")


# ---------------------------------------------------------------------------
# The report
# ---------------------------------------------------------------------------

def _person(day: date, base: dict, items: list, is_today: bool, now: datetime) -> dict:
    kept = merge_repeats(items)
    counts = Counter(i.work for i in kept)
    start, end = _clock(base["check_in"]), _clock(base["check_out"])
    open_shift = bool(start and not end and is_today)
    if open_shift:
        end = now.replace(tzinfo=None, year=start.year, month=start.month, day=start.day)
    marked = int((end - start).total_seconds() // 60) if start and end and end > start else None
    times = [_ist(i.created_at).replace(year=1900, month=1, day=1) for i in kept]
    person = {
        "key": base["user_key"], "name": base["user_name"], "role": base["role"] or "Unknown", "status": base["status"],
        "shift_in": base["check_in"], "shift_out": base["check_out"], "marked_minutes": marked,
        "active_minutes": (base["active_seconds"] or 0) // 60, "work_count": len(kept),
        "work_done": [{"work": w, "count": c} for w, c in counts.most_common()],
        "details": [{"time": _time(_ist(i.created_at)), "work": i.work, "group": i.work_group, "record": i.record} for i in kept],
        "gaps": quiet_gaps(times, start, end),
    }
    person["longest_gap_minutes"] = max((g["minutes"] for g in person["gaps"]), default=0)
    person["summary"] = summary_text(person)
    return person


def build(db: Session, day: date) -> dict | None:
    """The report for a day, or None when nothing at all was recorded."""
    now = _now_ist()
    is_today = day == now.date()
    saved = [] if is_today else [
        {c: getattr(r, c) for c in ("user_key", "user_name", "role", "status", "check_in", "check_out", "active_seconds")}
        for r in db.query(models.WorkDayStaff).filter(models.WorkDayStaff.day == day)
    ]
    base = saved or _day_rows(db, day, now)
    by_key = {b["user_key"]: b for b in base}
    # "admin" is a login with no staff record behind it, so it isn't an employee.
    items = [i for i in db.query(models.WorkItem).filter(models.WorkItem.day == day) if i.user_key != "admin"]
    for i in items:  # someone who has since left, or wasn't on the staff list that day
        by_key.setdefault(i.user_key, {"user_key": i.user_key, "user_name": i.user_name, "role": i.role, "status": "Not Marked",
                                       "check_in": None, "check_out": None, "active_seconds": 0})
    if not items and all(b["status"] == "Not Marked" for b in by_key.values()):
        return None
    rank = {r: i for i, r in enumerate(ROLE_ORDER)}
    people = [_person(day, b, [i for i in items if i.user_key == k], is_today, now) for k, b in by_key.items()]
    people.sort(key=lambda p: (rank.get(p["role"], len(rank)), p["name"].lower()))
    return {"day": day.isoformat(), "live": is_today, "saved": bool(saved),
            "limited": any(i.source_event_id for i in items), "staff": people}


HEAD_FILL = PatternFill("solid", fgColor="1B2B5E")
HEAD_FONT = Font(bold=True, color="FFFFFF")


def _block(ws, row: int, title: str, headers: list[str], rows: list[list]) -> int:
    ws.cell(row, 1, title).font = Font(bold=True, size=12, color="1B2B5E")
    row += 1
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row, c, h)
        cell.fill, cell.font = HEAD_FILL, HEAD_FONT
    for values in rows:
        row += 1
        for c, v in enumerate(values, 1):
            ws.cell(row, c, v)
    return row + 2


def _headline(p: dict) -> list:
    return [p["status"], f"{p['shift_in'] or '—'} to {p['shift_out'] or '—'}",
            _duration(p["marked_minutes"]) if p["marked_minutes"] is not None else "—", _duration(p["active_minutes"]),
            p["work_count"], _duration(p["longest_gap_minutes"]) if p["gaps"] else "—"]


def excel_response(report: dict, only: str | None = None) -> StreamingResponse:
    """Everyone on a first sheet to compare, then one sheet per employee."""
    people = [p for p in report["staff"] if not only or p["key"] == only]
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    day = date.fromisoformat(report["day"]).strftime("%d-%m-%Y")
    ws.cell(1, 1, f"Staff Work Report: {day}").font = Font(bold=True, size=14, color="1B2B5E")
    headers = ["Role", "Employee", "Status", "Shift", "Hours marked", "Actually active", "Work done", "Longest quiet gap"]
    _block(ws, 3, "Everyone", headers, [[p["role"], p["name"], *_headline(p)] for p in people])
    for col, width in zip("ABCDEFGH", (26, 24, 12, 24, 14, 16, 11, 18)):
        ws.column_dimensions[col].width = width

    used = {"summary"}
    for p in people:
        base = "".join(ch for ch in p["name"] if ch not in ':\\/?*[]')[:28] or "Employee"
        title, n = base, 2
        while title.lower() in used:
            title, n = f"{base} {n}", n + 1
        used.add(title.lower())
        ws = wb.create_sheet(title)
        ws.cell(1, 1, f"{p['name']} ({p['role']})").font = Font(bold=True, size=14, color="1B2B5E")
        ws.cell(2, 1, p["summary"]).alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=6)
        ws.row_dimensions[2].height = 62
        row = _block(ws, 4, "Overview", ["Status", "Shift", "Hours marked", "Actually active", "Work done", "Longest quiet gap"], [_headline(p)])
        row = _block(ws, row, "Work done", ["Type of work", "Count"], [[w["work"], w["count"]] for w in p["work_done"]])
        row = _block(ws, row, "Work details", ["Time", "Work done", "Record"], [[d["time"], d["work"], d["record"] or "—"] for d in p["details"]])
        _block(ws, row, "Quiet gaps", ["From", "To", "Gap"], [[g["from"], g["to"], _duration(g["minutes"])] for g in p["gaps"]])
        for col, width in zip("ABCDEF", (16, 34, 22, 16, 11, 18)):
            ws.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Staff_Work_Report_{report["day"]}.xlsx"'},
    )
