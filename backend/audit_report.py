"""Pending Audit / Audit Flagged Trips / Audit Verified Trips → View: the
Audit Outcomes reports. Same shape as the approvals report, so they register
their kinds with approvals_report.py and share its Excel writer and PDF
(lib/approvals-report-pdf.ts):

  pending   a sheet per driver   — trips the Auditor still has to check,
                                   with how long each has waited
  flagged   a sheet per status   — Under review (with the team) /
                                   Returned — awaiting the Auditor
  verified  a sheet per driver   — trips the Auditor verified, and whether
                                   they were disputed first

Money is the trip sheet's: hire, expenses, Trip Summary (hire − expenses).
Each report follows its page's search box and date range: Pending and
Flagged by the trip's date, Verified by the day it was verified (IST).
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session, selectinload

import approvals_report as ar
import models
from pl_export import IST

TRIP_COLUMNS = [("trip", "Trip", "text", 12), ("date", "Trip date", "date", 11), ("driver", "Driver", "text", 22),
                ("truck", "Truck", "text", 13), ("route", "Route", "text", 30), ("category", "Category", "text", 12),
                ("km", "Km", "num", 8), ("hire", "Hire (₹)", "money", 13), ("expense", "Expenses (₹)", "money", 13),
                ("summary", "Trip Summary (₹)", "money", 15)]
CAT = {"OUTSTATION": "Outstation", "LOCAL": "Local", "SHIFTING": "Shifting", "LOCAL CFS": "Local CFS", "RETURN TRIP": "Return Trip"}
PENDING_BUCKETS = ["Up to 7 days", "8–30 days", "Over 30 days"]


def _trip_rows(db: Session, trip_ids) -> dict[int, dict]:
    from routers.pl_summary import TRIP_DAY  # noqa: F401  (trip day rule lives there)
    trips = (db.query(models.Trip).options(selectinload(models.Trip.sheet), selectinload(models.Trip.closure))
             .filter(models.Trip.id.in_(list(trip_ids) or [0])).all())
    drivers = {d.driver_id: d.name for d in db.query(models.Driver.driver_id, models.Driver.name)}
    regs = dict(db.query(models.Truck.truck_id, models.Truck.registration_number))
    out = {}
    for t in trips:
        s = t.sheet
        hire = float(s.hire_amount or 0) if s else None
        exp = float(s.total_expense or 0) if s else None
        ended = (s.trip_completed_date if s and s.trip_completed_date else None) \
            or (t.closure.trip_completed_date if t.closure is not None and t.closure.trip_completed_date else None) \
            or (s.trip_sheet_date if s else None) or t.scheduled_date
        out[t.id] = {
            "trip": t.trip_id, "date": ar._iso(t.scheduled_date), "driver": drivers.get(t.driver_id) or t.driver_name or "(no driver)",
            "truck": regs.get(t.vehicle_id) or t.vehicle_id or "", "route": f"{t.origin or '—'} → {t.destination or '—'}",
            "category": CAT.get((t.trip_category or "").upper(), t.trip_category or ""),
            "km": round(float(s.total_km or 0)) if s else None,
            "hire": hire, "expense": exp, "summary": round(hire - exp, 2) if hire is not None and exp is not None else None,
            "ended": ended, "scheduled": t.scheduled_date, "flag_remark": t.flagged_remark or "", "returned": bool(t.recheck_returned),
        }
    return out


def _inr(v: float) -> str:
    """₹ with Indian grouping: 7533508.25 → ₹75,33,508.25."""
    neg, v = v < 0, abs(v)
    whole, frac = f"{v:.2f}".split(".")
    head, tail = whole[:-3], whole[-3:]
    while len(head) > 2:
        tail = head[-2:] + "," + tail
        head = head[:-2]
    tail = (head + "," + tail) if head else tail
    return f"{'-' if neg else ''}₹{tail}.{frac}"


def _search(rows, term, keys):
    if not term:
        return rows
    term = term.lower()
    return [r for r in rows if any(term in str(r.get(k) or "").lower() for k in keys)]


def _top(counter: Counter, title: str, head: str, n: int = 5, extra=None):
    return {"title": title, "head": [head, "Trips", extra[0] if extra else ""],
            "rows": [[k, v, extra[1](k) if extra else ""] for k, v in counter.most_common(n)],
            "money": [2] if extra and "₹" in extra[0] else []}


def _pending(db, start, end, search, tab):
    from routers.trips import pending_audit_rows
    today = datetime.now(IST).date()
    base = pending_audit_rows(db)
    info = _trip_rows(db, [b["trip_id"] for b in base])
    rows = []
    for b in base:
        r = dict(info.get(b["trip_id"], {}))
        if not r or ((start or end) and not ar._in(b["scheduled_date"], start, end)):
            continue
        waited = (today - r["ended"]).days if r["ended"] else None
        r.update(group=r["driver"], waited=waited,
                 status=PENDING_BUCKETS[0] if waited is None or waited <= 7 else PENDING_BUCKETS[1] if waited <= 30 else PENDING_BUCKETS[2])
        rows.append(r)
    rows = _search(rows, search, ("trip", "driver", "truck"))
    columns = TRIP_COLUMNS + [("waited", "Days waiting", "num", 12), ("status", "Waiting", "status", 13)]
    hire = sum(r["hire"] or 0 for r in rows)
    kpis = [("Trips waiting for the Auditor", len(rows), "amber"), ("Their hire", _inr(hire), ""),
            ("Waiting over 30 days", sum(1 for r in rows if r["status"] == PENDING_BUCKETS[2]), "amber"),
            ("Oldest", f"{max((r['waited'] or 0) for r in rows)} days" if rows else "—", "")]
    trucks = Counter(r["truck"] for r in rows)
    cats = Counter(r["category"] or "—" for r in rows)
    hire_of = lambda key, field: round(sum(x["hire"] or 0 for x in rows if x[field] == key), 2)  # noqa: E731
    tops = [_top(Counter(r["driver"] for r in rows), "Drivers with the most waiting", "Driver", extra=("Hire (₹)", lambda k: hire_of(k, "driver"))),
            _top(trucks, "Trucks with the most waiting", "Truck", extra=("Hire (₹)", lambda k: hire_of(k, "truck"))),
            _top(cats, "Waiting by category", "Category", n=6)]
    notes = ["These are completed trips Accounts has verified that the Auditor hasn't verified or flagged yet — the Pending Audit page's list.",
             "Days waiting = days since the trip ended (its completion date). Trips are placed in the period by their trip date.",
             "Hire and expenses come from the trip sheet; Trip Summary = hire − expenses."]
    return rows, [tuple(c) for c in columns], kpis, tops, notes, None, lambda g: g, "Driver", {}, None


def _flagged(db, start, end, search, tab):
    now = datetime.now(timezone.utc)
    trips = db.query(models.Trip.id).filter(models.Trip.deleted_at.is_(None), models.Trip.flagged_for_recheck.is_(True)).all()
    info = _trip_rows(db, [t.id for t in trips])
    events = defaultdict(list)
    for e in (db.query(models.TripRecheckEvent).filter(models.TripRecheckEvent.trip_id.in_(list(info) or [0]))
              .order_by(models.TripRecheckEvent.created_at, models.TripRecheckEvent.id)):
        events[e.trip_id].append(e)
    rows = []
    for tid, r in info.items():
        if (start or end) and not ar._in(r["scheduled"], start, end):
            continue
        evs = events.get(tid, [])
        flag = next((e for e in reversed(evs) if e.event in ("Flagged", "Flagged for Re-Verification")), None)
        ret = next((e for e in reversed(evs) if e.event == "Returned for Review" and (flag is None or e.created_at >= flag.created_at)), None)
        status = "Returned — awaiting Auditor" if r["returned"] else "Under review"
        opened = ar._utc(flag.created_at) if flag else None
        r = dict(r, group=status, status=status, reason=r["flag_remark"],
                 flagged_by=flag.actor_name if flag else "", flagged_on=ar._ist_text(flag.created_at) if flag else "",
                 returned_by=ret.actor_name if ret else "", returned_on=ar._ist_text(ret.created_at) if ret else "",
                 return_note=(ret.remark or "") if ret else "",
                 days_open=max((now - opened).days, 0) if opened else None)
        rows.append(r)
    rows = _search(rows, search, ("trip", "driver", "reason"))
    rows.sort(key=lambda r: (r["date"] or "", r["trip"]))
    columns = [c for c in TRIP_COLUMNS if c[0] != "category"] + [
        ("reason", "Flag reason", "text", 34), ("flagged_by", "Flagged by", "text", 16), ("flagged_on", "Flagged on", "text", 19),
        ("returned_by", "Returned by", "text", 16), ("returned_on", "Returned on", "text", 19), ("return_note", "Return note", "text", 28),
        ("days_open", "Days open", "num", 10), ("status", "Status", "status", 22)]
    hire = sum(r["hire"] or 0 for r in rows)
    kpis = [("Flagged trips", len(rows), "amber"), ("Hire at stake", _inr(hire), ""),
            ("Returned — awaiting the Auditor", sum(1 for r in rows if r["returned"]), "amber"),
            ("Oldest flag", f"{max((r['days_open'] or 0) for r in rows)} days" if rows else "—", "")]
    reasons = Counter((r["reason"] or "(no reason)").strip().capitalize() for r in rows)
    tops = [_top(reasons, "Most common reasons", "Reason"),
            _top(Counter(r["flagged_by"] or "—" for r in rows), "Who flags", "Flagged by"),
            _top(Counter(r["driver"] for r in rows), "Drivers flagged most", "Driver")]
    notes = ["Flagged trips are left out of Profitability's totals until the review is closed.",
             "Under review = with the team to fix. Returned — awaiting Auditor = fixed and sent back; the Auditor verifies or flags it again.",
             "Days open = days since it was flagged. Trips are placed in the period by their trip date."]
    order = ["Under review", "Returned — awaiting Auditor"]
    return rows, columns, kpis, tops, notes, order, lambda g: g, "Status", {}, None


def _verified(db, start, end, search, tab):
    from routers.trips import audit_verified_rows
    base = audit_verified_rows(db)
    info = _trip_rows(db, [b["trip_id"] for b in base])
    rows = []
    for b in base:
        at = ar._ist(b["verified_at"])
        if (start or end) and not ar._in(at.date() if at else None, start, end):
            continue
        r = dict(info.get(b["trip_id"], {}))
        if not r:
            continue
        status = "Disputed first" if b["was_disputed"] else "Clean"
        r.update(group=r["driver"], status=status, verified_by=b["verified_by"] or "", role=b["verified_role"] or "",
                 verified_on=ar._ist_text(b["verified_at"]), note=b["verified_remark"] or "",
                 to_verify=(at.date() - r["scheduled"]).days if at and r["scheduled"] else None,
                 month=at.strftime("%b %Y") if at else "")
        rows.append(r)
    rows = _search(rows, search, ("trip", "driver", "verified_by"))
    rows.sort(key=lambda r: (r["date"] or "", r["trip"]))
    columns = TRIP_COLUMNS + [("verified_by", "Verified by", "text", 18), ("role", "Role", "text", 12),
                              ("verified_on", "Verified on", "text", 19), ("note", "Note", "text", 28),
                              ("to_verify", "Days to verify", "num", 12), ("status", "Disputed?", "status", 14)]
    hire = sum(r["hire"] or 0 for r in rows)
    days = [r["to_verify"] for r in rows if r["to_verify"] is not None]
    kpis = [("Trips verified", len(rows), ""), ("Their hire", _inr(hire), ""),
            ("Disputed first, then fixed", sum(1 for r in rows if r["status"] == "Disputed first"), "amber"),
            ("Average days from trip to verified", f"{sum(days) / len(days):.1f} days" if days else "—", "")]
    month_order = {r["month"]: r["verified_on"][6:10] + r["verified_on"][3:5] for r in rows}
    months = Counter(r["month"] for r in rows)
    tops = [_top(Counter(r["verified_by"] for r in rows), "Who verifies", "Verified by"),
            {"title": "Verified each month", "head": ["Month", "Trips", ""],
             "rows": [[m, months[m], ""] for m in sorted(months, key=lambda m: month_order[m])], "money": []}]
    notes = ["A trip is here when the Auditor's latest decision on it is \"Verified\". Disputed first = it was flagged earlier, fixed and then verified.",
             "Trips are placed in the period by the day they were verified (IST). Days to verify = from the trip's date to the day it was verified."]
    return rows, columns, kpis, tops, notes, None, lambda g: g, "Driver", {}, None


STATUS_FILL = {PENDING_BUCKETS[0]: "C6EFCE", PENDING_BUCKETS[1]: "FFEB9C", PENDING_BUCKETS[2]: "FFC7CE",
               "Under review": "FFEB9C", "Returned — awaiting Auditor": "DDEBF7", "Disputed first": "FCE4D6", "Clean": "C6EFCE"}

ar.KINDS.update(pending=_pending, flagged=_flagged, verified=_verified)
# Same people who can open each page (frontend lib/nav-config.ts ROLE_HREFS; Admin sees all).
ar.ROLES.update(pending=("Admin", "Accounts", "Yard Supervisor", "Trip Sheet Register"),
                flagged=("Admin", "Accounts", "Trip Sheet Register"),
                verified=("Admin", "Accounts", "Trip Sheet Register"))
ar.TITLES.update(pending="Pending Audit", flagged="Audit Flagged Trips", verified="Audit Verified Trips")
ar.MONEY_COL.update(pending=("hire", "Hire (₹)"), flagged=("hire", "Hire (₹)"), verified=("hire", "Hire (₹)"))
ar.NOUN.update(pending="Trips", flagged="Trips", verified="Trips")
ar.STATUS_FILL.update(STATUS_FILL)
