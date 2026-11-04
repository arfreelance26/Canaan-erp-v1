"""Admin morning summary: a personal recap of yesterday and a look at today.

Built once a day after SUMMARY_HOUR (IST) and saved, so the morning message
never changes; Refresh builds the same thing live to show what has changed
since. Every figure comes from the same rules as its page: pending invoices as
the dashboard's Trip Status card, staff work from work_report, and so on.

Text uses **bold** markers; the frontend turns them into bold spans. Each line
can carry an `href` to the page behind it.
"""
import json
import logging
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import median
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import Session

import models
import work_report
from routers.compliance_records import DOCS
from routers.dashboard import ACTIVE_TRIP_STATUSES, awaiting_sheet_query, pending_invoice_query

log = logging.getLogger("canaan.app")

IST = ZoneInfo("Asia/Kolkata")
SUMMARY_HOUR = 8
USUAL_DAYS = 30                 # "usual" = the average of the 30 days before
LOW_ACTIVITY_PCT = 40           # active for under this share of marked hours
MILEAGE_DROP_PCT = 15           # km/L this far below the truck's normal
LONG_TRIP_EXTRA_DAYS = 2        # running this many days past the route's normal
WAITING_DAYS = 3                # queue items older than this are called out
EXPIRING_DAYS = 7
REPEAT_REPAIR_DAYS = 30
NOTIFY_EVENT = "daily_summary"


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def now_ist() -> datetime:
    return datetime.now(IST)


def _bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)
    return start, start + timedelta(days=1)


def _n(value) -> float:
    return float(value or 0)


def _money(v: float) -> str:
    v = round(v)
    if abs(v) >= 100_000:
        return f"₹{v / 100_000:.1f}L".replace(".0L", "L")
    return f"₹{v:,}"


def _qty(v: float) -> str:
    return f"{round(v):,}"


def _plural(n: int, word: str, many: str | None = None) -> str:
    return f"{n} {word if n == 1 else (many or word + 's')}"


def _days(n: int) -> str:
    return "today" if n == 0 else _plural(n, "day")


def _date(d: date) -> str:
    return f"{d.strftime('%A')}, {d.day} {d.strftime('%B')}"


def _vs_usual(value: float, usual: float | None, unit: str = "") -> str:
    """ "up from 11 usually" style, or nothing when there's no history."""
    if usual is None:
        return ""
    if usual < 1:
        return "" if value == 0 else " (usually less than 1 a day)"
    change = (value - usual) / usual * 100
    if abs(change) < 10:
        return " (about usual)"
    return f" ({'up' if change > 0 else 'down'} from {_qty(usual)}{unit} usually)"


def _usual(by_day: dict[date, float], day: date) -> float | None:
    """Average over the USUAL_DAYS before `day`; None until there's history."""
    days = [day - timedelta(days=i) for i in range(1, USUAL_DAYS + 1)]
    if not any(d in by_day for d in days):
        return None
    return sum(by_day.get(d, 0) for d in days) / len(days)


def _line(text: str, href: str | None = None) -> dict:
    return {"text": text, "href": href}


def _daily(db: Session, column, day: date, value=None, *filters) -> dict[date, float]:
    """Per-day totals (or counts) of a Date column over the usual window and the day itself."""
    start = day - timedelta(days=USUAL_DAYS)
    agg = func.count() if value is None else func.coalesce(func.sum(value), 0)
    rows = db.query(column, agg).filter(column >= start, column <= day, *filters).group_by(column).all()
    return {d: _n(v) for d, v in rows}


# ---------------------------------------------------------------------------
# Sections. Each returns (lines, attention items, metrics).
# ---------------------------------------------------------------------------

def _trips(db: Session, day: date, today: date):
    T, C, S = models.Trip, models.TripClosure, models.TripSheet
    live = T.deleted_at.is_(None)
    start, end = _bounds(day)
    booked_by_day = _daily(db, T.booking_created_date, day, None, live)
    done_by_day = _daily(db, C.trip_completed_date, day, None)
    booked, completed = int(booked_by_day.get(day, 0)), int(done_by_day.get(day, 0))
    booked_trips = db.query(T).filter(live, T.booking_created_date == day).all()
    closed = db.query(func.count(C.id)).filter(C.created_at >= start, C.created_at < end).scalar() or 0
    collected = db.query(func.count(T.id)).filter(live, T.trip_sheet_collected_at >= start, T.trip_sheet_collected_at < end).scalar() or 0
    received = db.query(func.count(T.id)).filter(live, T.trip_sheet_received_at >= start, T.trip_sheet_received_at < end).scalar() or 0
    entered = db.query(func.count(S.id)).filter(S.created_at >= start, S.created_at < end).scalar() or 0
    running = db.query(T).filter(live, T.status.in_(ACTIVE_TRIP_STATUSES - {"Assigned"})).all()

    lines, attention = [], []
    customers = dict(db.query(models.Customer.id, models.Customer.name).all())
    top = Counter((customers.get(t.customer_id) or t.custom_customer_name or "") for t in booked_trips if t.customer_id or t.custom_customer_name)
    if booked or completed:
        lines.append(_line(f"**Booked:** {booked}{_vs_usual(booked, _usual(booked_by_day, day))}", "/trips/history"))
        lines.append(_line(f"**Completed:** {completed}{_vs_usual(completed, _usual(done_by_day, day))}", "/trips/history"))
    else:
        lines.append(_line("No trips were booked or completed.", "/trips/history"))
    if top:
        name, n = top.most_common(1)[0]
        lines.append(_line(f"**Top customer:** {name} ({_plural(n, 'trip')})"))
    routes = Counter(f"{t.origin} → {t.destination}" for t in booked_trips if t.origin and t.destination)
    if routes and routes.most_common(1)[0][1] > 1:
        r, n = routes.most_common(1)[0]
        lines.append(_line(f"**Busiest route:** {r} ({n} trips)"))
    if running:
        lines.append(_line(f"**Running now:** {_plural(len(running), 'trip')}", "/trips/current"))
    for label, n in (("Booking sheets closed", closed), ("Trip sheets collected", collected),
                     ("Trip sheets received", received), ("Trip sheets entered", entered)):
        if n:
            lines.append(_line(f"**{label}:** {n}", "/trips/reconciliation"))

    # Running longer than the route normally takes.
    since = day - timedelta(days=90)
    durations = defaultdict(list)
    for dest, sched, done in (db.query(T.destination, T.scheduled_date, C.trip_completed_date)
                              .join(C, C.trip_id == T.id)
                              .filter(live, C.trip_completed_date >= since, T.scheduled_date.isnot(None)).all()):
        if done and done >= sched:
            durations[dest].append((done - sched).days)
    for t in running:
        past = durations.get(t.destination, [])
        if t.scheduled_date and len(past) >= 3:
            age, normal = (today - t.scheduled_date).days, median(past)
            if age > normal + LONG_TRIP_EXTRA_DAYS:
                attention.append(_line(f"**{t.trip_id}** has been running for {_days(age)}; trips to {t.destination} usually take {_days(round(normal))}.", "/trips/current"))

    # Completed trips with no sheet yet.
    no_sheet = (db.query(T.trip_id, C.trip_completed_date).join(C, C.trip_id == T.id).outerjoin(S, S.trip_id == T.id)
                .filter(live, T.status == "Completed", S.id.is_(None)).order_by(C.trip_completed_date).all())
    if no_sheet:
        oldest, when = no_sheet[0]
        age = f", the oldest is **{oldest}** at {_days((today - when).days)}" if when else ""
        attention.append(_line(f"**{_plural(len(no_sheet), 'completed trip')} {'has' if len(no_sheet) == 1 else 'have'} no trip sheet yet**{age}.", "/trips/reconciliation"))

    metrics = {"Trips booked": booked, "Trips completed": completed, "Trips running": len(running), "Booking sheets closed": closed,
               "Trip sheets collected": collected, "Trip sheets received": received, "Trip sheets entered": entered,
               "Completed trips without a sheet": len(no_sheet)}
    return lines, attention, metrics


def _invoices(db: Session, day: date, today: date, previous: dict):
    I, T = models.TripInvoice, models.Trip
    made = db.query(I.invoice_no).join(T, T.id == I.trip_id).filter(I.invoice_date == day, T.deleted_at.is_(None)).all()
    trips = len(made)
    invoices = len({n for (n,) in made if n}) or trips
    pending = pending_invoice_query(db).all()
    lines = []
    if invoices:
        lines.append(_line(f"**Generated:** {_plural(invoices, 'invoice')}" + (f" ({trips} trips)" if trips != invoices else ""), "/trips/verification"))
    prev = previous.get("Trips waiting to be invoiced")
    change = "" if prev is None or prev == len(pending) else f" ({'up' if len(pending) > prev else 'down'} from {prev})"
    lines.append(_line(f"**Waiting to be invoiced:** {_plural(len(pending), 'trip')}{change}", "/trips/verification"))
    no_sheet = awaiting_sheet_query(db).count()
    if no_sheet:
        lines.append(_line(f"**Waiting for a trip sheet:** {_plural(no_sheet, 'completed trip')}", "/trips/reconciliation"))
    from routers.party_halt import rows as party_halt_rows, totals as party_halt_totals, OPEN_STATUSES
    halts = party_halt_rows(db)
    halt_totals = party_halt_totals(halts)
    dated = [(c.trip_completed_date, t.trip_id) for t in pending if (c := t.closure) and c.trip_completed_date]
    attention = []
    if dated:
        when, code = min(dated)
        if when < today:
            lines.append(_line(f"**Oldest waiting:** {code}, {_days((today - when).days)}", "/trips/verification"))
        if (today - when).days > WAITING_DAYS:
            attention.append(_line(f"**{code}** was completed {_days((today - when).days)} ago and still isn't invoiced.", "/trips/verification"))
    if halt_totals["outstanding_trips"]:
        oldest = min((r for r in halts if r["status"] in OPEN_STATUSES and r["completed_date"]),
                     key=lambda r: r["completed_date"], default=None)
        age = f", oldest {oldest['trip_id']} ({_days((today - date.fromisoformat(oldest['completed_date'])).days)})" if oldest else ""
        lines.append(_line(f"**Party halt to recover:** {_money(halt_totals['outstanding_amount'])} "
                           f"({_plural(halt_totals['outstanding_trips'], 'trip')}{age})", "/finance/customer-detention"))
    missed = [r for r in halts if r["status"] == "Missed on invoice"]
    if missed:
        attention.append(_line(f"**{_plural(len(missed), 'invoice')} left out party halt** worth {_money(sum(r['amount'] for r in missed))} "
                               f"({', '.join(r['trip_id'] for r in missed[:3])}{'…' if len(missed) > 3 else ''}).", "/finance/customer-detention"))
    return lines, attention, {"Invoices generated": invoices, "Trips waiting to be invoiced": len(pending),
                              "Trips waiting for a trip sheet": no_sheet,
                              "Party halt to recover": round(halt_totals["outstanding_amount"])}


def _fuel(db: Session, day: date):
    F, A = models.FuelLog, models.AdBlueLog
    litres_by_day = _daily(db, F.date, day, F.litres)
    litres = litres_by_day.get(day, 0)
    cost = _n(db.query(func.sum(F.total_cost)).filter(F.date == day).scalar())
    ad_l = _n(db.query(func.sum(A.litres)).filter(A.date == day).scalar())
    ad_c = _n(db.query(func.sum(A.total_cost)).filter(A.date == day).scalar())
    lines, attention = [], []
    if litres:
        lines.append(_line(f"**Diesel:** {_qty(litres)} L, {_money(cost)}{_vs_usual(litres, _usual(litres_by_day, day), ' L')}", "/maintenance/fuel-history"))
    if ad_l:
        lines.append(_line(f"**AdBlue:** {_qty(ad_l)} L, {_money(ad_c)}", "/admin/adblue"))
    regs = dict(db.query(models.Truck.id, models.Truck.registration_number).all())
    worst = None
    for log in db.query(F).filter(F.date == day, F.mileage > 0).all():
        normal = db.query(func.avg(F.mileage)).filter(F.truck_id == log.truck_id, F.mileage > 0, F.date < day,
                                                      F.date >= day - timedelta(days=90)).scalar()
        if normal and _n(log.mileage) < _n(normal) * (1 - MILEAGE_DROP_PCT / 100):
            drop = 1 - _n(log.mileage) / _n(normal)
            if worst is None or drop > worst[0]:
                worst = (drop, log, _n(normal))
    if worst:
        _, log, normal = worst
        reg = regs.get(log.truck_id, "A truck")
        lines.append(_line(f"**Worst mileage:** {reg}, {_n(log.mileage):.1f} km/L (normally {normal:.1f})", "/maintenance/fuel-history"))
        attention.append(_line(f"**{reg}** did {_n(log.mileage):.1f} km/L against its normal {normal:.1f}. Worth checking.", "/maintenance/fuel-history"))
    return lines, attention, {"Diesel litres": round(litres), "AdBlue litres": round(ad_l)}


def _maintenance(db: Session, day: date):
    M, R, F, E = models.MaintenanceRecord, models.MaintenanceRequest, models.TyreFitmentRecord, models.TyreMovementEvent
    start, end = _bounds(day)
    regs = dict(db.query(models.Truck.id, models.Truck.registration_number).all())
    records = db.query(M).filter(M.date == day).all()
    lines, attention = [], []
    if records:
        biggest = max(records, key=lambda r: _n(r.cost))
        lines.append(_line(f"**Repairs:** {len(records)}, {_money(sum(_n(r.cost) for r in records))}", "/admin/maintenance"))
        repeats = db.query(func.count(M.id)).filter(M.truck_id == biggest.truck_id, M.date > day - timedelta(days=REPEAT_REPAIR_DAYS), M.date <= day).scalar()
        again = f", {repeats} in 30 days" if repeats > 1 else ""
        lines.append(_line(f"**Biggest repair:** {biggest.maintenance_type} on {regs.get(biggest.truck_id, '—')} ({_money(_n(biggest.cost))}{again})", "/admin/maintenance"))
        for truck_id in {r.truck_id for r in records}:
            n = db.query(func.count(M.id)).filter(M.truck_id == truck_id, M.date > day - timedelta(days=REPEAT_REPAIR_DAYS), M.date <= day).scalar()
            if n >= 3:
                attention.append(_line(f"**{regs.get(truck_id, 'A truck')}** has needed {n} repairs in the last 30 days.", "/admin/maintenance"))
    fitted = db.query(func.count(F.id)).filter(F.fitted_date == day).scalar() or 0
    removed = db.query(func.count(F.id)).filter(F.removed_date == day).scalar() or 0
    moves = Counter(e for (e,) in db.query(E.event).filter(E.created_at >= start, E.created_at < end))
    for n, label, href in ((fitted, "Tyres fitted", "/maintenance/tyre-management"), (removed, "Tyres removed", "/maintenance/tyre-management"),
                           (moves["Flagged for Retreading"], "Sent for retreading", "/maintenance/retread-queue"),
                           (moves["Moved to Inventory"], "Back from retreading", "/maintenance/tyre-inventory"),
                           (moves["Flagged as Discarded"], "Tyres discarded", "/maintenance/discarded-tyres")):
        if n:
            lines.append(_line(f"**{label}:** {n}", href))
    waiting = db.query(R).filter(R.status == "Pending").order_by(R.created_at).all()
    if waiting:
        lines.append(_line(f"**Repair requests waiting:** {len(waiting)}", "/attendance/maintenance-approvals"))
    return lines, attention, {"Repairs": len(records), "Tyres fitted": fitted, "Repair requests waiting": len(waiting)}


def _documents(db: Session, day: date, today: date):
    trucks = db.query(models.Truck).filter(models.Truck.deleted_at.is_(None), models.Truck.sold_date.is_(None)).all()
    expired, soon = [], []
    for t in trucks:
        for spec in DOCS.values():
            d = getattr(t, spec["date"], None)
            if not d:
                continue
            if d < today:
                expired.append((d, t, spec["label"]))
            elif d <= today + timedelta(days=EXPIRING_DAYS):
                soon.append((d, t, spec["label"]))
    lines, attention = [], []
    if expired or soon:
        lines.append(_line(f"**Expired:** {len(expired)}", "/maintenance/truck-compliance-record"))
        lines.append(_line(f"**Expiring in {EXPIRING_DAYS} days:** {len(soon)}", "/maintenance/truck-compliance-record"))
        if soon:
            d, t, label = min(soon, key=lambda x: x[0])
            lines.append(_line(f"**Next to expire:** {t.registration_number} {label}, {d.strftime('%a %d %b')}", "/maintenance/truck-compliance-record"))
    # A truck with an expired document that was out on a trip yesterday.
    on_road = {v for (v,) in db.query(models.Trip.vehicle_id).filter(
        models.Trip.deleted_at.is_(None), models.Trip.vehicle_id.isnot(None),
        (models.Trip.scheduled_date == day) | models.Trip.status.in_(ACTIVE_TRIP_STATUSES - {"Assigned"}))}
    for d, t, label in sorted(expired, key=lambda x: x[0], reverse=True):
        if t.truck_id in on_road:
            attention.append(_line(f"**{t.registration_number}'s {label} expired on {d.strftime('%d-%m-%Y')}**, but the truck was out on a trip.", "/maintenance/truck-compliance-record"))
    newly = [x for x in expired if x[0] == day]
    for d, t, label in newly:
        if t.truck_id not in on_road:
            attention.append(_line(f"**{t.registration_number}'s {label} expired yesterday.**", "/maintenance/truck-compliance-record"))
    return lines, attention, {"Documents expired": len(expired), "Documents expiring soon": len(soon)}


def _attendance(db: Session, day: date):
    S, D, L = models.StaffAttendance, models.DriverAttendance, models.LeaveRequest
    rows = db.query(S).filter(S.date == day).all()
    staff = Counter(r.status for r in rows if r.status != "Not Marked")
    lines, attention = [], []
    if staff:
        absent = [r.staff_name for r in rows if r.status == "Absent" and r.staff_name]
        on_leave = (db.query(L).filter(L.category != "Driver", L.status == "Approved", L.from_date <= day, L.to_date >= day).all())
        lines.append(_line(f"**Staff present:** {staff['Present']}", "/attendance/staff"))
        if absent:
            lines.append(_line(f"**Staff absent:** {len(absent)} ({', '.join(absent[:3])}{'…' if len(absent) > 3 else ''})", "/attendance/staff"))
        if staff["On Leave"] or on_leave:
            back = [f"{lv.applicant_name}, back {(lv.to_date + timedelta(days=1)).strftime('%a %d %b')}" for lv in on_leave][:2]
            lines.append(_line(f"**Staff on leave:** {staff['On Leave'] or len(on_leave)}" + (f" ({'; '.join(back)})" if back else ""), "/attendance/leave-approvals"))
        for name, n in Counter(r.staff_name for r in db.query(S).filter(
                S.status == "Absent", S.date > day - timedelta(days=7), S.date <= day).all() if r.staff_name in absent).items():
            if n >= 2:
                attention.append(_line(f"**{name}** has been absent {n} times in the last 7 days.", "/attendance/staff"))
    drivers = Counter(s for (s,) in db.query(D.status).filter(D.date == day))
    if drivers:
        for n, label in ((drivers["On Trip"], "Drivers on trip"), (drivers["Present"], "Drivers present"), (drivers["On Halt"], "Drivers on halt"),
                         (drivers["On Workshop"], "Drivers in the workshop"), (drivers["Absent"], "Drivers absent"),
                         (drivers["Leave"] + drivers["On Leave"], "Drivers on leave")):
            if n:
                lines.append(_line(f"**{label}:** {n}", "/attendance/drivers"))
    return lines, attention, {"Staff present": staff["Present"], "Staff absent": staff["Absent"], "Drivers on trip": drivers["On Trip"]}


def _payments(db: Session, day: date):
    C, M = models.CompensationTransaction, models.ChatMessage
    start, end = _bounds(day)
    paid = defaultdict(float)
    for person, kind, amount in db.query(C.person_type, C.type, C.amount).filter(C.date == day):
        paid[(person, kind)] += _n(amount)
    workshop = _n(db.query(func.sum(models.DriverAttendance.workshop_advance)).filter(models.DriverAttendance.date == day).scalar())
    marked_paid = db.query(func.count(M.id)).filter(M.paid_at >= start, M.paid_at < end).scalar() or 0
    waiting = db.query(func.count(M.id)).filter(M.payment_status == "approved", (M.finance_status.is_(None)) | (M.finance_status == "approved")).scalar() or 0
    lines = []
    for label, v, href in (("Driver salaries", paid[("driver", "Salary")], "/finance/driver-compensation"),
                           ("Driver advances", paid[("driver", "Advance")], "/finance/driver-compensation"),
                           ("Staff salaries", paid[("staff", "Salary")], "/finance/staff-compensation"),
                           ("Staff advances", paid[("staff", "Advance")], "/finance/staff-compensation"),
                           ("Workshop advances", workshop, "/finance/driver-compensation")):
        if v:
            lines.append(_line(f"**{label}:** {_money(v)}", href))
    if marked_paid:
        lines.append(_line(f"**Requests paid:** {marked_paid}", "/attendance/payment-requests"))
    if waiting:
        lines.append(_line(f"**Requests waiting:** {waiting}", "/attendance/payment-requests"))
    return lines, [], {"Payment requests waiting": waiting}


def _approvals(db: Session, day: date, today: date):
    E, X, L, M = models.EditApprovalRequest, models.DeletionApprovalRequest, models.LeaveRequest, models.MaintenanceRequest
    start, end = _bounds(day)
    decided = {
        "edit": db.query(func.count(E.id)).filter(E.approved_at >= start, E.approved_at < end).scalar() or 0,
        "deletion": db.query(func.count(X.id)).filter(X.approved_at >= start, X.approved_at < end).scalar() or 0,
        "leave": db.query(func.count(L.id)).filter(L.decided_at >= start, L.decided_at < end).scalar() or 0,
    }
    queues = [
        ("edit request", db.query(E.created_at, E.resource_name).filter(E.status == "Pending").order_by(E.created_at).all(), "/attendance/edit-approvals"),
        ("deletion request", db.query(X.created_at, X.resource_name).filter(X.status == "Pending").order_by(X.created_at).all(), "/attendance/deletion-approvals"),
        ("leave request", db.query(L.created_at, L.applicant_name).filter(L.status == "Pending").order_by(L.created_at).all(), "/attendance/leave-approvals"),
        ("repair request", db.query(M.created_at, M.submitted_by_name).filter(M.status == "Pending").order_by(M.created_at).all(), "/attendance/maintenance-approvals"),
    ]
    lines, attention = [], []
    done = [f"{n} {k}" for k, n in decided.items() if n]
    if done:
        lines.append(_line(f"**Decided yesterday:** {', '.join(done)}"))
    waiting_total = 0
    for label, rows, href in queues:
        if not rows:
            continue
        waiting_total += len(rows)
        age = (today - rows[0][0].replace(tzinfo=timezone.utc).astimezone(IST).date()).days if rows[0][0] else 0
        lines.append(_line(f"**{label[0].upper()}{label[1:]}s waiting:** {len(rows)} (oldest {_days(age)})", href))
        if age > WAITING_DAYS:
            attention.append(_line(f"**{_plural(len(rows), label)}** {'is' if len(rows) == 1 else 'are'} waiting for a decision; the oldest is {_days(age)} old.", href))
    return lines, attention, {"Requests waiting for a decision": waiting_total}


def _audit(db: Session, day: date):
    from routers.trips import pending_audit_rows
    R = models.TripRecheckEvent
    start, end = _bounds(day)
    events = db.query(R, models.Trip.trip_id).join(models.Trip, models.Trip.id == R.trip_id).filter(R.created_at >= start, R.created_at < end).all()
    by = Counter(e.event for e, _ in events)
    lines = []
    if events:
        flagged = [code for e, code in events if e.event == "Flagged"][:3]
        if by["Verified"]:
            lines.append(_line(f"**Verified by the Auditor:** {by['Verified']}", "/trips/audit-verified"))
        if by["Flagged"]:
            lines.append(_line(f"**Flagged:** {by['Flagged']} ({', '.join(flagged)})", "/trips/flagged"))
        if by["Flagged for Re-Verification"]:
            lines.append(_line(f"**Sent for re-verification:** {by['Flagged for Re-Verification']}", "/trips/audit-verified"))
        if by["Verification Undone"]:
            lines.append(_line(f"**Verifications undone:** {by['Verification Undone']}", "/trips/audit-verified"))
    pending = len(pending_audit_rows(db))
    lines.append(_line(f"**Waiting for the Auditor:** {_plural(pending, 'trip')}", "/trips/pending-audit"))
    return lines, [], {"Trips verified by audit": by["Verified"], "Trips waiting for audit": pending}


def _staff_work(db: Session, day: date):
    report = work_report.build(db, day)
    if not report:
        return [], [], {"Work items": 0}
    people = report["staff"]
    total = sum(p["work_count"] for p in people)
    workers = [p for p in people if p["work_count"]]
    usual_by_day = dict((d, _n(n)) for d, n in db.query(models.WorkItem.day, func.count(models.WorkItem.id)).filter(
        models.WorkItem.day >= day - timedelta(days=USUAL_DAYS), models.WorkItem.day < day, models.WorkItem.user_key != "admin").group_by(models.WorkItem.day))
    lines = [_line(f"**Work items:** {total}{_vs_usual(total, _usual(usual_by_day, day))}", "/admin/activity-log"),
             _line(f"**People who worked:** {len(workers)}", "/admin/activity-log")]
    attention = []
    if workers:
        top = max(workers, key=lambda p: p["work_count"])
        main = top["work_done"][0]
        lines.append(_line(f"**Most work:** {top['name']} ({top['work_count']}, mostly {main['work'].lower()})", "/admin/activity-log"))
    for p in people:
        marked = p["marked_minutes"]
        if marked and marked >= 60:
            pct = round(p["active_minutes"] / marked * 100)
            if pct < LOW_ACTIVITY_PCT:
                gap = f", with a {work_report._duration(p['longest_gap_minutes'])} quiet gap" if p["gaps"] else ""
                attention.append(_line(f"**{p['name']}** was active for {pct}% of their marked hours{gap}."))
    return lines, attention, {"Work items": total}


def _today(db: Session, today: date):
    T = models.Trip
    start, end = _bounds(today)
    scheduled = db.query(func.count(T.id)).filter(T.deleted_at.is_(None), T.scheduled_date == today, T.status != "Cancelled").scalar() or 0
    expiring = []
    for t in db.query(models.Truck).filter(models.Truck.deleted_at.is_(None), models.Truck.sold_date.is_(None)):
        expiring += [f"{t.registration_number}'s {s['label']}" for s in DOCS.values() if getattr(t, s["date"], None) == today]
    leave = [lv.applicant_name for lv in db.query(models.LeaveRequest).filter(
        models.LeaveRequest.status == "Approved", models.LeaveRequest.from_date <= today, models.LeaveRequest.to_date >= today)]
    emis = [e for e in db.query(models.EmiRecord).filter(models.EmiRecord.auto_debit_date.isnot(None))
            if e.auto_debit_date.day == today.day and (not e.emi_start_date or e.emi_start_date <= today)
            and (not e.emi_end_date or e.emi_end_date >= today)]
    meetings = db.query(models.Event).filter(models.Event.starts_at >= start, models.Event.starts_at < end,
                                             models.Event.completed_at.is_(None)).order_by(models.Event.starts_at).all()
    lines = [_line(f"**Scheduled:** {_plural(scheduled, 'trip')}", "/trips/assign")]
    if expiring:
        lines.append(_line(f"**Expiring today:** {', '.join(expiring[:3])}{'…' if len(expiring) > 3 else ''}", "/maintenance/truck-compliance-record"))
    if leave:
        lines.append(_line(f"**On leave:** {', '.join(leave[:4])}{'…' if len(leave) > 4 else ''}", "/attendance/leave-approvals"))
    if emis:
        lines.append(_line(f"**EMI due:** " + ", ".join(f"{e.truck_registration or e.emi_name} ({_money(_n(e.emi_amount))})" for e in emis[:3]), "/finance/emi-tracking"))
    if meetings:
        m = meetings[0]
        when = m.starts_at.replace(tzinfo=timezone.utc).astimezone(IST).strftime("%I:%M %p")
        lines.append(_line(f"**Meetings:** {len(meetings)}, first “{m.title}” at {when}"))
    return lines


SECTIONS = (
    ("trips", "Trips", "🚛"), ("invoices", "Invoices", "🧾"), ("fuel", "Fuel & AdBlue", "⛽"),
    ("maintenance", "Maintenance & Tyres", "🔧"), ("documents", "Documents", "📄"), ("attendance", "Attendance", "👥"),
    ("payments", "Payments", "💸"), ("approvals", "Approvals", "✅"), ("audit", "Audit", "🔍"), ("work", "Staff Work", "📋"),
)


def build(db: Session, day: date, now: datetime | None = None, previous: dict | None = None) -> dict:
    """The summary of `day` as the data stands now. `previous` is the day before's saved metrics."""
    now = now or now_ist()
    today = day + timedelta(days=1)
    previous = previous or {}
    parts = {
        "trips": _trips(db, day, today),
        "invoices": _invoices(db, day, today, previous),
        "fuel": _fuel(db, day),
        "maintenance": _maintenance(db, day),
        "documents": _documents(db, day, today),
        "attendance": _attendance(db, day),
        "payments": _payments(db, day),
        "approvals": _approvals(db, day, today),
        "audit": _audit(db, day),
        "work": _staff_work(db, day),
    }
    sections, attention, metrics = [], [], {}
    for key, title, icon in SECTIONS:
        lines, alerts, m = parts[key]
        attention += alerts
        metrics.update(m)
        if lines:
            sections.append({"key": key, "title": title, "icon": icon, "lines": lines})
    done = [text for text, n in (
        (f"{_plural(metrics['Trips booked'], 'trip')} booked", metrics["Trips booked"]),
        (f"{metrics['Trips completed']} completed", metrics["Trips completed"]),
        (f"{_plural(metrics['Invoices generated'], 'invoice')} generated", metrics["Invoices generated"]),
        (f"{_plural(metrics['Repairs'], 'repair')}", metrics["Repairs"]),
        (f"{_plural(metrics['Work items'], 'work item')} done by the team", metrics["Work items"]),
    ) if n]
    if not done:
        headline = "A quiet day: no trips, invoices, repairs or staff work were recorded."
    else:
        headline = (", ".join(done[:-1]) + " and " + done[-1] if len(done) > 1 else done[0]) + "."
        headline = headline[0].upper() + headline[1:]
    return {
        "day": day.isoformat(), "day_label": _date(day), "today_label": _date(today),
        "built_at": now.isoformat(), "headline": headline,
        "attention": attention, "sections": sections, "today": _today(db, today), "metrics": metrics,
    }


# ---------------------------------------------------------------------------
# Saved each morning
# ---------------------------------------------------------------------------

def due_day(now: datetime | None = None) -> date:
    """The day the latest summary covers: yesterday from SUMMARY_HOUR, else the day before."""
    now = now or now_ist()
    return now.date() - timedelta(days=1 if now.hour >= SUMMARY_HOUR else 2)


def _saved(db: Session, day: date) -> dict | None:
    row = db.get(models.DailySummary, day)
    return json.loads(row.data) if row else None


def ensure_saved(db: Session, now: datetime | None = None) -> dict | None:
    """Builds and saves the latest summary if it isn't yet, and notifies the
    Admins once. INSERT IGNORE, so two workers racing save it once."""
    now = now or now_ist()
    if now.hour < SUMMARY_HOUR:
        return _saved(db, due_day(now))
    day = due_day(now)
    found = _saved(db, day)
    if found:
        return found
    before = _saved(db, day - timedelta(days=1)) or {}
    data = build(db, day, now, before.get("metrics"))
    inserted = db.execute(mysql_insert(models.DailySummary).values(day=day, built_at=now.replace(tzinfo=None), data=json.dumps(data))
                          .prefix_with("IGNORE")).rowcount
    if inserted:
        db.add(models.Notification(
            event_type=NOTIFY_EVENT, title=f"Your summary for {data['day_label']} is ready",
            message=json.dumps({"headline": data["headline"], "attention": len(data["attention"])}),
            target_roles="Admin", created_by="System", created_by_role="System",
        ))
    db.commit()
    return _saved(db, day)


def latest(db: Session) -> dict | None:
    """The morning summary to show now: today's once it's due, else the last saved."""
    found = ensure_saved(db)
    if found:
        return found
    row = db.query(models.DailySummary).order_by(models.DailySummary.day.desc()).first()
    return json.loads(row.data) if row else None


def refreshed(db: Session) -> dict | None:
    """The latest summary's day, rebuilt from the data as it stands now."""
    saved = latest(db)
    if not saved:
        return None
    day = date.fromisoformat(saved["day"])
    before = _saved(db, day - timedelta(days=1)) or {}
    return build(db, day, now_ist(), before.get("metrics"))
