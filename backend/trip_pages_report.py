"""Trip and Driver Management → View: a designed report for each page (Excel + PDF).

Same shape as resource_report.py (Summary, then sheets of fact boxes and
tables), registered as kinds there so the Excel writer, the preview and the
PDF (lib/resource-report-pdf.ts) are shared. Each page's list and its stage
pills are worked out HERE, once, by the same rules the page uses:

  trips_assign          Assign Trips — trips with status Assigned
  trips_available       Available Trips — every trip; pills Booked · Current ·
                        Completed · Closed (lib/trip-stage.ts getRouteStep)
  trips_current         Current Trips — Started … Unloaded; a sheet per status
  trips_completed       Completed Trips — Completed, booking sheet not closed
  trips_sheets          Trip Sheet Collection — Completed with a closure; pills
                        Pending · Delivered · Overdue (received over 24 h ago,
                        no sheet entered)
  trips_reconciliation  Trip Reconciliation — Completed, sheet delivered; pills
                        Pending Receive · Pending Sheet Entry · Sheet Entered ·
                        Rejected · Request Raised / Approved / Rejected
  trips_verification    Verification & Invoicing — trips with a trip sheet; pills
                        Pending · Verified · Invoiced · Rejected · Waived Invoice
  trips_deleted         Deleted Trips — still deleted, with the approved request
  driver_assign         Assign Drivers — every driver's truck and its history

Every trip report takes a period (the trip's scheduled date), a stage (one of
the page's pills), a trip category and a search (the page's search fields).
A trip can sit under more than one pill (e.g. Delivered and Overdue), as on
the page, so it can appear on more than one stage sheet. Money: hire after
transport commission (the trip sheet's, else the booking's), the trip sheet's
expenses and km. No cost per km.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session, selectinload

import models
import resource_report as rr
from approvals_report import _ist
from audit_report import _inr
from maintenance_report import _iso, _period_label, _sheet_names
from resource_report import box, clean, table

CATS = ["OUTSTATION", "LOCAL", "SHIFTING", "LOCAL CFS", "RETURN TRIP"]
CURRENT = ["Started", "Loaded", "On-Transit", "Reached", "Unloaded"]
TRIP_REQUEST_RESOURCES = ("TripSheet", "BookingSheet", "TripData", "Trip")
SEE_ALL_REQUESTS = ("Admin", "Commercial Manager", "Assistant Commercial Manager")

# The page's pills, in the page's order ([] = the page has none).
PILLS = {
    "trips_assign": [],
    "trips_available": ["Booked", "Current", "Completed", "Closed"],
    "trips_current": [],
    "trips_completed": [],
    "trips_sheets": ["Pending", "Delivered", "Overdue"],
    "trips_reconciliation": ["Pending Receive", "Pending Sheet Entry", "Sheet Entered", "Rejected",
                             "Request Raised", "Request Approved", "Request Rejected"],
    "trips_verification": ["Pending", "Verified", "Invoiced", "Rejected", "Waived Invoice"],
}
TITLES = {
    "trips_assign": "Assign Trips", "trips_available": "Available Trips", "trips_current": "Current Trips",
    "trips_completed": "Completed Trips", "trips_sheets": "Trip Sheet Collection",
    "trips_reconciliation": "Trip Reconciliation", "trips_verification": "Verification & Invoicing",
}
STAGE_TONE = {"Overdue": "bad", "Rejected": "bad", "Request Rejected": "bad", "Pending": "warn", "Pending Receive": "warn",
              "Pending Sheet Entry": "warn", "Request Raised": "warn", "Invoiced": "good", "Closed": "good", "Sheet Entered": "good",
              "Verified": "good", "Delivered": "good", "Cancelled": None}


def _day(dt) -> date | None:
    """A stored UTC timestamp → its IST calendar day."""
    if dt is None:
        return None
    d = _ist(dt)
    return d.date() if isinstance(d, datetime) else d


def _ctx(db: Session, user_role: str, user_id: int | None) -> dict:
    """Names and edit requests the pages show next to each trip."""
    reqs = db.query(models.EditApprovalRequest).filter(models.EditApprovalRequest.resource_type.in_(TRIP_REQUEST_RESOURCES))
    if user_role not in SEE_ALL_REQUESTS:                     # Trip Sheet Register sees their own requests, as on the page
        reqs = reqs.filter(models.EditApprovalRequest.staff_db_id == (user_id or -1))
    by_trip = defaultdict(set)
    for r in reqs:
        by_trip[r.resource_id].add(r.status)
    return {
        "regs": dict(db.query(models.Truck.truck_id, models.Truck.registration_number).all()),
        "drivers": dict(db.query(models.Driver.driver_id, models.Driver.name).all()),
        "customers": dict(db.query(models.Customer.id, models.Customer.name).all()),
        "requests": by_trip,
    }


def _base(db: Session, kind: str):
    q = (db.query(models.Trip).options(selectinload(models.Trip.sheet), selectinload(models.Trip.closure),
                                       selectinload(models.Trip.invoice))
         .filter(models.Trip.deleted_at.is_(None)))
    if kind == "trips_assign":
        q = q.filter(models.Trip.status == "Assigned")
    elif kind == "trips_current":
        q = q.filter(models.Trip.status.in_(CURRENT))
    elif kind in ("trips_completed", "trips_sheets", "trips_reconciliation"):
        q = q.filter(models.Trip.status == "Completed")
    trips = q.all()
    if kind == "trips_completed":
        trips = [t for t in trips if t.closure is None]
    elif kind == "trips_sheets":
        trips = [t for t in trips if t.closure is not None]
    elif kind == "trips_reconciliation":
        trips = [t for t in trips if t.trip_sheet_collected]
    elif kind == "trips_verification":
        trips = [t for t in trips if t.sheet is not None]
    return trips


def stages(kind: str, t: models.Trip, ctx: dict, now: datetime) -> list[str]:
    """The page's pill(s) this trip is under — each page's own rule."""
    if kind == "trips_available":
        if t.status == "Cancelled":
            return ["Cancelled"]
        if t.status == "Assigned":
            return ["Booked"]
        if t.status != "Completed":
            return ["Current"]
        return ["Closed"] if t.closure is not None else ["Completed"]
    if kind == "trips_assign":
        return ["Assigned"]
    if kind == "trips_current":
        return [t.status]
    if kind == "trips_completed":
        return ["Waiting to close"]
    if kind == "trips_sheets":
        out = ["Delivered" if t.trip_sheet_collected else "Pending"]
        if t.trip_sheet_received and t.sheet is None and t.trip_sheet_received_at:
            at = t.trip_sheet_received_at if t.trip_sheet_received_at.tzinfo else t.trip_sheet_received_at.replace(tzinfo=timezone.utc)
            if now - at > timedelta(days=1):
                out.append("Overdue")
        return out
    if kind == "trips_reconciliation":
        out = []
        if not t.trip_sheet_received:
            out.append("Pending Receive")
        if t.trip_sheet_received and t.sheet is None:
            out.append("Pending Sheet Entry")
        if t.sheet is not None:
            out.append("Sheet Entered")
        if t.verification_status == "rejected":
            out.append("Rejected")
        req = ctx["requests"].get(t.id, set())
        out += [f"Request {w}" for s, w in (("Pending", "Raised"), ("Approved", "Approved"), ("Rejected", "Rejected")) if s in req]
        return out
    if kind == "trips_verification":
        verified, rejected = t.verification_status == "verified", t.verification_status == "rejected"
        invoiced, waived = bool(t.is_invoiced), bool(t.invoice_waived)
        out = []
        if invoiced:
            out.append("Invoiced")
        elif waived:
            out.append("Waived Invoice")
        elif verified:
            out.append("Verified")
        if rejected:
            out.append("Rejected")
        if not (verified or rejected or invoiced or waived):
            out.append("Pending")
        return out
    return []


def _matches(t: models.Trip, term: str, ctx: dict) -> bool:
    """The page's search box (frontend lib/trip-search.ts)."""
    if not term:
        return True
    vals = (t.trip_id, t.booking_reference_no, t.origin, t.destination, t.vehicle_id, ctx["regs"].get(t.vehicle_id),
            ctx["drivers"].get(t.driver_id) or t.driver_name, t.container_number, t.container_number_1, t.container_number_2,
            t.cargo_reference, ctx["customers"].get(t.customer_id) or t.custom_customer_name)
    return any(term in (v or "").lower() for v in vals)


def report_day(kind: str, t: models.Trip) -> date | None:
    """The day a period is matched on — each page's own report window's rule:
    Sheet Collection: delivered on (else the trip date); Reconciliation: the
    sheet's date once entered, else the day it was received (else delivered);
    Verification: the invoice date once invoiced, else the trip date.
    Every other page: the trip (scheduled) date."""
    if kind == "trips_sheets":
        return _day(t.trip_sheet_collected_at) if t.trip_sheet_collected and t.trip_sheet_collected_at else t.scheduled_date
    if kind == "trips_reconciliation":
        if t.sheet is not None and t.sheet.trip_sheet_date:
            return t.sheet.trip_sheet_date
        return _day(t.trip_sheet_received_at) or _day(t.trip_sheet_collected_at)
    if kind == "trips_verification" and t.is_invoiced and t.invoice is not None and t.invoice.invoice_date:
        return t.invoice.invoice_date
    return t.scheduled_date


DATE_NOTE = {
    "trips_sheets": "Dates follow the day the sheet was delivered (the trip date while it's pending), as the page's View report.",
    "trips_reconciliation": "Dates follow the trip sheet's date once entered, else the day it was received, as the page's View report.",
    "trips_verification": "Dates follow the invoice date once invoiced, else the trip date, as the page's View report.",
}


def _hire(t: models.Trip) -> float:
    base = t.sheet.hire_amount if t.sheet is not None else t.transport_hire_amount
    return round(float(base or 0) - float(t.transport_commission_amount or 0), 2)


def select(db: Session, kind: str, *, start=None, end=None, search: str = "", stage: str = "", category: str = "",
           role: str = "Admin", user_id: int | None = None, received_only: bool = False):
    """(the trips in the report with their pills, ctx). The period, search,
    stage and category apply as on the page."""
    ctx = _ctx(db, role, user_id)
    now = datetime.now(timezone.utc)
    term = (search or "").strip().lower()
    out = []
    for t in _base(db, kind):
        if received_only and not t.trip_sheet_received:       # Trip Reconciliation's View window: received sheets only
            continue
        day = report_day(kind, t)
        if (start or end) and (day is None or (start and day < start) or (end and day > end)):
            continue
        if not _matches(t, term, ctx):
            continue
        st = stages(kind, t, ctx, now)
        out.append((t, st))
    every = out
    if stage:
        out = [x for x in out if stage in x[1]]
    if category:
        out = [x for x in out if x[0].trip_category == category]
    return out, every, ctx


def counts(db: Session, kind: str, **kw) -> dict:
    """The live counts for the Reports Center window: each pill counted within
    the chosen category, each category within the chosen pill — as the pages do."""
    stage, category = kw.pop("stage", ""), kw.pop("category", "")
    _, every, _ = select(db, kind, **kw)
    in_cat = [x for x in every if not category or x[0].trip_category == category]
    in_stage = [x for x in every if not stage or stage in x[1]]
    return {
        "stages": {p: sum(1 for x in in_cat if p in x[1]) for p in PILLS.get(kind, [])},
        "stage_total": len(in_cat),
        "categories": {c: sum(1 for x in in_stage if x[0].trip_category == c) for c in CATS},
        "category_total": len(in_stage),
    }


def _waiting(kind: str, t: models.Trip, st: list[str], today: date) -> tuple[date | None, str]:
    """Since when this trip has been waiting at its step, and what for."""
    if kind == "trips_assign":
        return t.assigned_date or t.booking_created_date, "to start"
    if kind in ("trips_current", "trips_completed"):
        return t.scheduled_date, "out" if kind == "trips_current" else "to close"
    if kind == "trips_sheets" and not t.trip_sheet_collected:
        return (t.closure.trip_completed_date if t.closure else None) or t.scheduled_date, "for the sheet"
    if kind == "trips_sheets" and "Overdue" in st:
        return _day(t.trip_sheet_received_at), "for entry"
    if kind == "trips_reconciliation" and "Pending Receive" in st:
        return _day(t.trip_sheet_collected_at), "to be received"
    if kind == "trips_reconciliation" and "Pending Sheet Entry" in st:
        return _day(t.trip_sheet_received_at), "for entry"
    if kind == "trips_verification" and "Pending" in st:
        return (t.sheet.trip_sheet_date if t.sheet else None) or t.scheduled_date, "to verify"
    if kind == "trips_verification" and "Verified" in st:
        return t.scheduled_date, "to invoice"
    return None, ""


def _extras(kind: str, t: models.Trip, st: list[str]):
    """Columns only this page needs: [(heading, kind, value, show in PDF)]."""
    inv = t.invoice
    if kind == "trips_available":
        return [("Status", "text", t.status, True)]
    if kind == "trips_current":
        return [("Status", "text", t.status, True)]
    if kind == "trips_sheets":
        return [("Delivered on", "date", _iso(_day(t.trip_sheet_collected_at)), True),
                ("Received on", "date", _iso(_day(t.trip_sheet_received_at)), True),
                ("Sheet entered", "text", "Yes" if t.sheet is not None else "No", False)]
    if kind == "trips_reconciliation":
        return [("Received on", "date", _iso(_day(t.trip_sheet_received_at)), True),
                ("Sheet entered", "text", "Yes" if t.sheet is not None else "No", True),
                ("Requests", "text", ", ".join(s.replace("Request ", "") for s in st if s.startswith("Request")), False)]
    if kind == "trips_verification":
        return [("Invoice", "text", (inv.invoice_no if inv else "") or "", True),
                ("Invoice date", "date", _iso(inv.invoice_date) if inv else None, True),
                ("Invoice type", "text", (inv.invoice_type if inv else "") or "", False)]
    return []


def _trips_report(db: Session, kind: str, search: str, today: date, role: str, opts: dict) -> dict:
    o = opts or {}
    start, end, stage, category = o.get("start"), o.get("end"), o.get("stage") or "", o.get("category") or ""
    picked, every, ctx = select(db, kind, start=start, end=end, search=search, stage=stage, category=category,
                                role=role, user_id=o.get("user_id"), received_only=o.get("rtype") == "received")
    regs, drivers, customers = ctx["regs"], ctx["drivers"], ctx["customers"]
    pills = PILLS.get(kind, [])

    # The stage sheets: the pills (or the page's natural groups), in order, that hold any trip.
    order = list(pills) if pills else []
    for _, st in picked:
        for s in st:
            if s not in order:
                order.append(s)
    if kind == "trips_current":
        order = [s for s in CURRENT if any(s in st for _, st in picked)]
    if stage:
        order = [stage]
    groups = {s: [(t, st) for t, st in picked if s in st] for s in order}
    groups = {s: g for s, g in groups.items() if g}
    names = _sheet_names(list(groups))
    sheet_of = dict(zip(groups, names))

    def row(t, st):
        since, _ = _waiting(kind, t, st, today)
        wait = (today - since).days if since else None
        base = [t.trip_id, _iso(t.scheduled_date), rr.CAT.get(t.trip_category or "", clean(t.trip_category)),
                clean(regs.get(t.vehicle_id)) or clean(t.vehicle_id), clean(drivers.get(t.driver_id) or t.driver_name),
                clean(customers.get(t.customer_id) or t.custom_customer_name or t.shipper_consignee),
                " → ".join(x for x in (clean(t.origin), clean(t.destination)) if x),
                _hire(t), float(t.sheet.total_expense or 0) if t.sheet else None, float(t.sheet.total_km or 0) if t.sheet else None]
        extra = [x[2] for x in _extras(kind, t, st)]
        tone = "bad" if wait is not None and wait > 7 else "warn" if wait is not None and wait > 2 else None
        return base + extra + [{"v": wait, "tone": tone} if wait is not None else None]

    extra_cols = [(x[0], x[1], x[3]) for x in _extras(kind, models.Trip(), [])]       # headings only
    wait_label = {"trips_assign": "Days waiting", "trips_current": "Days out", "trips_completed": "Days waiting"}.get(kind, "Days waiting")
    cols = [("Trip", "text"), ("Trip date", "date"), ("Category", "text"), ("Truck", "text"), ("Driver", "text"),
            ("Customer", "text", False), ("Route", "text"), ("Hire (₹)", "money"), ("Expenses (₹)", "money"), ("Km", "km")] \
        + extra_cols + [(wait_label, "num")]

    def total(rows_):
        hire = sum(r[7] or 0 for r in rows_)
        exp = sum(r[8] or 0 for r in rows_)
        km = sum(r[9] or 0 for r in rows_)
        return ["TOTAL", f"{len(rows_)} trips", "", "", "", "", "", hire, exp, km] + [""] * len(extra_cols) + [None]

    items = []
    for s, g in groups.items():
        g = sorted(g, key=lambda x: (x[0].scheduled_date or date.min), reverse=True)
        rows_ = [row(t, st) for t, st in g]
        hire = sum(r[7] or 0 for r in rows_)
        cats = Counter(t.trip_category for t, _ in g)
        items.append({
            "sheet": sheet_of[s], "title": s, "subtitle": f"{len(g)} trips · newest trip date first",
            "boxes": [box("THIS STAGE", [("Trips", len(g), "num"), ("Hire (₹)", hire, "money"),
                                         ("Expenses (₹)", sum(r[8] or 0 for r in rows_), "money"),
                                         ("Km", sum(r[9] or 0 for r in rows_), "km")]),
                      box("BY CATEGORY", [(rr.CAT.get(c, c), cats.get(c, 0), "num") for c in CATS if cats.get(c)]
                          or [("Trips", 0, "num")])],
            "tables": [table(s.upper(), cols, rows_, total=total(rows_))],
        })

    # Summary: stage × category, longest waiting, top trucks and drivers.
    matrix = []
    for s, g in groups.items():
        c = Counter(t.trip_category for t, _ in g)
        matrix.append([{"v": s, "link": sheet_of[s]}] + [c.get(k, 0) for k in CATS] + [len(g), sum(_hire(t) for t, _ in g)])
    waiting = []
    for t, st in picked:
        since, what = _waiting(kind, t, st, today)
        if since and (today - since).days >= 0:
            waiting.append([t.trip_id, rr.CAT.get(t.trip_category or "", ""), clean(regs.get(t.vehicle_id)) or clean(t.vehicle_id),
                            clean(drivers.get(t.driver_id) or t.driver_name), ", ".join(st), _iso(since),
                            {"v": (today - since).days, "tone": "bad" if (today - since).days > 7 else "warn" if (today - since).days > 2 else None}])
    waiting.sort(key=lambda r: -r[6]["v"])
    by_truck, by_driver = defaultdict(lambda: [0, 0.0]), defaultdict(lambda: [0, 0.0])
    for t, _ in picked:
        for d, k in ((by_truck, clean(regs.get(t.vehicle_id)) or clean(t.vehicle_id) or "—"), (by_driver, clean(drivers.get(t.driver_id) or t.driver_name) or "—")):
            d[k][0] += 1
            d[k][1] += _hire(t)
    top = lambda d: [[k, v[0], v[1]] for k, v in sorted(d.items(), key=lambda kv: (-kv[1][0], kv[0]))[:10]]  # noqa: E731

    pill_counts = Counter(s for _, st in picked for s in st)
    kpis = [{"label": "Trips", "value": str(len(picked)), "note": f"{_inr(sum(_hire(t) for t, _ in picked))} hire"}]
    for p in (pills or order)[:3]:
        n = pill_counts.get(p, 0)
        kpis.append({"label": p, "value": str(n), "tone": STAGE_TONE.get(p) if n else None})
    if waiting:
        kpis.append({"label": "Longest wait", "value": f"{waiting[0][6]['v']} days", "tone": waiting[0][6]["tone"],
                     "note": waiting[0][0]})
    filters = []
    if stage:
        filters.append(stage)
    if category:
        filters.append(rr.CAT.get(category, category))
    label = _period_label(start, end) if start or end else "All trip dates"
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": " · ".join([label] + filters)},
        "kpis": kpis[:4],
        "tables": [
            table("BY STAGE AND CATEGORY — click a stage to open its sheet",
                  [("Stage", "link")] + [(rr.CAT[c], "num") for c in CATS] + [("Trips", "num"), ("Hire (₹)", "money")], matrix),
            table("LONGEST WAITING — top 15", [("Trip", "text"), ("Category", "text"), ("Truck", "text"), ("Driver", "text"),
                                               ("Stage", "text"), ("Since", "date"), ("Days", "num")], waiting[:15]),
            table("BY TRUCK — top 10", [("Truck", "text"), ("Trips", "num"), ("Hire (₹)", "money")], top(by_truck)),
            table("BY DRIVER — top 10", [("Driver", "text"), ("Trips", "num"), ("Hire (₹)", "money")], top(by_driver)),
        ],
        "notes": [
            f"The same trips and stages as the {TITLES[kind]} page. A trip can be under more than one stage "
            "(e.g. Delivered and Overdue), as on the page, so it can appear on more than one sheet.",
            DATE_NOTE.get(kind, "Trips are picked by their trip (scheduled) date.")
            + " Hire is after transport commission — the trip sheet's, else the booking's. Expenses and km are the trip sheet's.",
            "Days waiting count from the step the trip is waiting at; over 2 days is amber, over 7 red.",
        ],
        "items": items,
    }


def _kind(kind):
    return lambda db, search, today, role="", opts=None: _trips_report(db, kind, search, today, role, opts)


# ── Deleted Trips ────────────────────────────────────────────────────────────

def _deleted(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """The Deleted Trips page: each still-deleted trip with its latest approved
    deletion request (the same rule the page uses). Period = the deletion day."""
    o = opts or {}
    start, end, category = o.get("start"), o.get("end"), o.get("category") or ""
    term = (search or "").strip().lower()
    trips = {t.id: t for t in db.query(models.Trip).options(selectinload(models.Trip.sheet)).filter(models.Trip.deleted_at.isnot(None))}
    latest = {}
    for r in db.query(models.DeletionApprovalRequest).filter(models.DeletionApprovalRequest.resource_type == "Trip",
                                                               models.DeletionApprovalRequest.status == "Approved"):
        if r.resource_id in trips and (r.resource_id not in latest or (r.approved_at or datetime.min) > (latest[r.resource_id].approved_at or datetime.min)):
            latest[r.resource_id] = r
    ctx = _ctx(db, "Admin", None)
    rows, cats, who = [], Counter(), Counter()
    for tid, r in sorted(latest.items(), key=lambda kv: kv[1].approved_at or datetime.min, reverse=True):
        t = trips[tid]
        day = _day(r.approved_at)
        if (start or end) and (day is None or (start and day < start) or (end and day > end)):
            continue
        if category and t.trip_category != category:
            continue
        if term and not (_matches(t, term, ctx) or any(term in (v or "").lower() for v in (r.requested_by_name, r.reason))):
            continue
        cats[t.trip_category] += 1
        who[clean(r.requested_by_name) or "—"] += 1
        rows.append([t.trip_id, _iso(t.scheduled_date), rr.CAT.get(t.trip_category or "", ""), clean(ctx["regs"].get(t.vehicle_id)) or clean(t.vehicle_id),
                     clean(ctx["customers"].get(t.customer_id) or t.custom_customer_name), _hire(t), clean(r.requested_by_name),
                     clean(r.reason), clean(r.approved_by_name), _iso(day), clean(r.admin_note)])
    cols = [("Trip", "text"), ("Trip date", "date"), ("Category", "text"), ("Truck", "text"), ("Customer", "text"), ("Hire (₹)", "money"),
            ("Asked by", "text"), ("Reason", "text"), ("Approved by", "text"), ("Deleted on", "date"), ("Admin note", "text", False)]
    sheet = _sheet_names(["Deleted Trips"])[0]
    label = _period_label(start, end) if start or end else "All time"
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": label + (f" · {rr.CAT.get(category, category)}" if category else "")},
        "kpis": [{"label": "Deleted trips", "value": str(len(rows)), "note": "still deleted"},
                 {"label": "Hire lost from the books", "value": _inr(sum(r[5] for r in rows))},
                 {"label": "Most asked by", "value": who.most_common(1)[0][0] if who else "—",
                  "note": f"{who.most_common(1)[0][1]} trips" if who else ""}],
        "tables": [table("BY CATEGORY", [("Category", "text"), ("Trips", "num")], [[rr.CAT[c], cats[c]] for c in CATS if cats.get(c)]),
                   table("BY WHO ASKED", [("Asked by", "text"), ("Trips", "num")], [[k, v] for k, v in who.most_common()])],
        "notes": ["Lists each trip that is still deleted, with its latest approved deletion request — as the Deleted Trips page. "
                  "A trip restored since isn't listed. Dates follow the day the deletion was approved."],
        "items": [{"sheet": sheet, "title": "Deleted Trips", "subtitle": f"{len(rows)} trips · newest deletion first", "boxes": [],
                   "tables": [table("DELETED TRIPS", cols, rows, total=["TOTAL", f"{len(rows)} trips", "", "", "", sum(r[5] for r in rows),
                                                                        "", "", "", None, ""])]}],
    }


# ── Assign Drivers ───────────────────────────────────────────────────────────

def _driver_assign(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """The Assign Drivers page: every driver's truck now, since when, and the
    assignment history (DriverAssignmentEditEvent). Period = the history shown."""
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    term = (search or "").strip().lower()
    regs = dict(db.query(models.Truck.truck_id, models.Truck.registration_number).all())
    current = {a.driver_id: a for a in db.query(models.DriverAssignment)}
    events = defaultdict(list)
    for e in db.query(models.DriverAssignmentEditEvent).order_by(models.DriverAssignmentEditEvent.created_at.desc()):
        events[e.driver_id].append(e)
    drivers = [d for d in db.query(models.Driver).options(rr.slim(models.Driver)).filter(models.Driver.deleted_at.is_(None))
               .order_by(models.Driver.name)
               if not term or term in (d.name or "").lower() or term in (d.driver_id or "").lower()
               or (d.driver_id in current and term in (regs.get(current[d.driver_id].vehicle_id) or current[d.driver_id].vehicle_id or "").lower())]
    rows, history = [], []
    trucks_with = set()
    for d in drivers:
        a = current.get(d.driver_id)
        evs = events.get(d.driver_id, [])
        since = next((_day(e.created_at) for e in evs if e.event == "Driver Assigned" and a and e.vehicle_id == a.vehicle_id), None)
        if a:
            trucks_with.add(a.vehicle_id)
        rows.append([clean(d.name), d.driver_id, clean(regs.get(a.vehicle_id)) or a.vehicle_id if a else {"v": "Not assigned", "tone": "warn"},
                     _iso(since), (today - since).days if since else None, len(evs)])
        for e in evs:
            day = _day(e.created_at)
            if (start or end) and (day is None or (start and day < start) or (end and day > end)):
                continue
            history.append([_iso(day), clean(d.name), {"v": e.event, "tone": "warn" if e.event == "Assignment Removed" else None},
                            clean(regs.get(e.vehicle_id)) or clean(e.vehicle_id), clean(e.actor_name), clean(e.actor_role)])
    history.sort(key=lambda r: r[0] or "", reverse=True)
    all_trucks = {t.truck_id: t for t in db.query(models.Truck).options(rr.slim(models.Truck)).filter(models.Truck.deleted_at.is_(None))}
    free = [[clean(t.registration_number), tid] for tid, t in sorted(all_trucks.items()) if tid not in trucks_with]
    names = _sheet_names(["Drivers", "History"])
    unassigned = sum(1 for r in rows if isinstance(r[2], dict))
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": f"As of {today.strftime('%d-%m-%Y')}"
                   + (f" · history {_period_label(start, end)}" if start or end else "")},
        "kpis": [{"label": "Drivers", "value": str(len(rows)), "note": f"{len(rows) - unassigned} with a truck"},
                 {"label": "Without a truck", "value": str(unassigned), "tone": "warn" if unassigned else None},
                 {"label": "Trucks without a driver", "value": str(len(free)), "tone": "warn" if free else None},
                 {"label": "Changes", "value": str(len(history)), "note": "in the history shown"}],
        "tables": [table("TRUCKS WITHOUT A DRIVER", [("Truck", "text"), ("Truck ID", "text")], free)],
        "notes": ["Every active driver and the truck they're assigned to now, as on the Assign Drivers page. "
                  "Since = when that assignment was made (from the change history).",
                  "With a period, the History sheet shows only the changes made in it."],
        "items": [
            {"sheet": names[0], "title": "Drivers", "subtitle": f"{len(rows)} drivers", "boxes": [],
             "tables": [table("WHO DRIVES WHAT", [("Driver", "text"), ("Driver ID", "text"), ("Truck", "text"), ("Since", "date"),
                                                  ("Days on it", "num"), ("Changes ever", "num")], rows)]},
            {"sheet": names[1], "title": "History", "subtitle": f"{len(history)} changes · newest first", "boxes": [],
             "tables": [table("ASSIGNMENT CHANGES", [("Date", "date"), ("Driver", "text"), ("Change", "text"), ("Truck", "text"),
                                                     ("By", "text"), ("Role", "text")], history)]},
        ],
    }


# ── Register with the Resource Hub report ────────────────────────────────────

TRIP_KINDS = list(PILLS)
rr.KINDS.update({k: (_kind(k), TITLES[k], TITLES[k]) for k in TRIP_KINDS})
rr.KINDS.update({"trips_deleted": (_deleted, "Deleted Trips", "Deleted Trips"),
                 "driver_assign": (_driver_assign, "Driver Assignments", "Assign Drivers")})
_MANAGERS = ("Admin", "Commercial Manager", "Assistant Commercial Manager")
rr.KIND_ROLES.update({
    "trips_assign": _MANAGERS, "trips_current": _MANAGERS, "trips_completed": _MANAGERS, "driver_assign": _MANAGERS,
    "trips_available": ("Admin",), "trips_deleted": ("Admin",),
    "trips_sheets": ("Admin", "Yard Supervisor"), "trips_reconciliation": ("Admin", "Trip Sheet Register"),
    "trips_verification": ("Admin", "Accounts"),
})
rr.WITH_OPTS = tuple(dict.fromkeys(rr.WITH_OPTS + tuple(TRIP_KINDS) + ("trips_deleted", "driver_assign")))
