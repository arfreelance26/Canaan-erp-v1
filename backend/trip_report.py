"""Trip History → View: the category-wise trip report (Excel + PDF).

Built like maintenance_report.py / fuel_report.py: collect() gathers the
figures once, build() writes the workbook, and the frontend draws the PDF from
the same figures (lib/trip-report-pdf.ts via GET /exports/trip-report/preview).

Follows the Trip History page: its stage card (All, Assigned, Current,
Completed, Invoiced, Waived Invoice, Cancelled), Trip Category filter, search
box and date range (by the trip's scheduled date). Money is the page's:
hire and expenses from the trip sheet, Trip Summary = hire − expenses.
Cancelled trips are listed but never added into the money.

Sheets
  Summary       totals, trips by stage, by category (each links to its sheet),
                top customers and routes, worth knowing, what's in this file
  <one sheet per trip category with trips>: its figures, every trip with a
                total, top customers and routes in it, its cancelled trips
  By Customer   every customer: trips per category, hire, expenses, summary,
                invoiced / still to invoice
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy.orm import Session, selectinload

import models
from maintenance_report import TOTAL_FILL, WARN, _band, _d, _iso, _link, _pairs, _period_label, _title
from pl_export import DATE, IST, KM, MONEY, Sheet, _fill

CATEGORIES = [("OUTSTATION", "Outstation"), ("LOCAL", "Local"), ("SHIFTING", "Shifting"),
              ("LOCAL CFS", "Local CFS"), ("RETURN TRIP", "Return Trip")]
CAT_LABEL = dict(CATEGORIES)
CURRENT = {"Started", "Loaded", "On-Transit", "Reached", "Unloaded"}
CARDS = ("All", "Assigned", "Current", "Completed", "Invoiced", "Waived Invoice", "Cancelled")
# Commercial Manager roles don't see invoices on Trip History, so not here either.
NO_INVOICE_ROLES = {"Commercial Manager", "Assistant Commercial Manager"}


def _f(v) -> float:
    return float(v or 0)


def _stage(t: models.Trip) -> str:
    if t.status == "Cancelled":
        return "Cancelled"
    if t.is_invoiced:
        return "Invoiced"
    if t.invoice_waived:
        return "Invoice waived"
    if t.closure is not None:
        return "Completed"
    if t.status in CURRENT:
        return t.status
    return t.status or "Assigned"


def _card_match(t: models.Trip, card: str) -> bool:
    if card == "Assigned":
        return t.status == "Assigned"
    if card == "Current":
        return t.status in CURRENT
    if card == "Completed":
        return t.closure is not None and t.status != "Cancelled"
    if card == "Invoiced":
        return bool(t.is_invoiced)
    if card == "Waived Invoice":
        return bool(t.invoice_waived) and not t.is_invoiced
    if card == "Cancelled":
        return t.status == "Cancelled"
    return True


def collect(db: Session, start: date | None, end: date | None, search: str = "", category: str = "",
            card: str = "All", show_invoice: bool = True, show_profit: bool = True) -> dict:
    """show_profit=False (everyone but Admin): every Trip Summary (hire − expenses)
    figure is taken out — rows, totals, top lists and customers. Hire and
    expenses stay."""
    today = datetime.now(IST).date()
    card = card if card in CARDS else "All"
    cats = [c.strip().upper() for c in (category or "").split(",") if c.strip()]

    q = (db.query(models.Trip)
         .options(selectinload(models.Trip.sheet), selectinload(models.Trip.closure), selectinload(models.Trip.invoice))
         .filter(models.Trip.deleted_at.is_(None)))
    if start:
        q = q.filter(models.Trip.scheduled_date >= start)
    if end:
        q = q.filter(models.Trip.scheduled_date <= end)
    trips = q.order_by(models.Trip.scheduled_date, models.Trip.trip_id).all()

    customers = {c.id: c.name for c in db.query(models.Customer.id, models.Customer.name)}
    drivers = {d.driver_id: d.name for d in db.query(models.Driver.driver_id, models.Driver.name)}
    regs = {t.truck_id: t.registration_number for t in db.query(models.Truck.truck_id, models.Truck.registration_number)}
    term = (search or "").strip().lower()

    rows = []
    for t in trips:
        if cats and (t.trip_category or "").upper() not in cats:
            continue
        if not _card_match(t, card):
            continue
        if term and not any(term in (v or "").lower() for v in (
                t.trip_id, t.booking_reference_no, t.origin, t.destination, t.vehicle_id, regs.get(t.vehicle_id),
                drivers.get(t.driver_id) or t.driver_name, t.container_number, t.container_number_1, t.container_number_2,
                t.cargo_reference)):
            continue
        s = t.sheet
        hire = _f(s.hire_amount) if s else None
        expense = _f(s.total_expense) if s else None
        cancelled = t.status == "Cancelled"
        containers = ", ".join(x for x in (t.container_number, t.container_number_1, t.container_number_2) if x)
        inv = t.invoice
        rows.append({
            "trip_id": t.trip_id, "booking_ref": t.booking_reference_no or "", "date": _iso(t.scheduled_date),
            "category": (t.trip_category or "").upper() or "NONE", "stage": _stage(t), "cancelled": cancelled,
            "under_review": bool(t.flagged_for_recheck and not t.recheck_returned),
            "customer": (customers.get(t.customer_id) or t.custom_customer_name or t.shipper_consignee or "").strip() or "(no customer)",
            "origin": t.origin or "", "destination": t.destination or "",
            "route": f"{t.origin or '—'} → {t.destination or '—'}",
            "container": containers, "driver": drivers.get(t.driver_id) or t.driver_name or "",
            "truck": regs.get(t.vehicle_id) or t.vehicle_id or "",
            "has_sheet": s is not None,
            "km": round(_f(s.total_km), 1) if s else None,
            "hire": hire, "expense": expense,
            "summary": round(hire - expense, 2) if hire is not None and expense is not None else None,
            "invoice": ("Invoiced" + (f" · {inv.invoice_no}" if inv and inv.invoice_no else "")) if t.is_invoiced
            else "Waived" if t.invoice_waived else "Not invoiced" if not cancelled else "",
            "invoiced": bool(t.is_invoiced), "waived": bool(t.invoice_waived) and not t.is_invoiced,
        })

    def totals(rs: list[dict]) -> dict:
        live = [r for r in rs if not r["cancelled"]]
        sheeted = [r for r in live if r["has_sheet"]]
        hire = sum(r["hire"] for r in sheeted)
        expense = sum(r["expense"] for r in sheeted)
        stages = defaultdict(int)
        for r in rs:
            stages[r["stage"]] += 1
        return {
            "trips": len(rs), "counted": len(live), "cancelled": len(rs) - len(live),
            "with_sheet": len(sheeted), "without_sheet": len(live) - len(sheeted),
            "km": round(sum(r["km"] or 0 for r in sheeted), 1),
            "hire": round(hire, 2), "expense": round(expense, 2), "summary": round(hire - expense, 2),
            "avg_hire": round(hire / len(sheeted), 2) if sheeted else None,
            "invoiced": sum(1 for r in live if r["invoiced"]),
            "invoiced_hire": round(sum(r["hire"] or 0 for r in live if r["invoiced"]), 2),
            "to_invoice": sum(1 for r in live if not r["invoiced"] and not r["waived"] and r["category"] != "SHIFTING"),
            "to_invoice_hire": round(sum(r["hire"] or 0 for r in live if not r["invoiced"] and not r["waived"] and r["category"] != "SHIFTING"), 2),
            "waived": sum(1 for r in live if r["waived"]),
            "no_km": sum(1 for r in sheeted if not r["km"]),
            "under_review": sum(1 for r in live if r["under_review"]),
            "stages": dict(sorted(stages.items(), key=lambda kv: -kv[1])),
        }

    def top(rs: list[dict], key: str, n: int = 5) -> list[dict]:
        acc: dict[str, dict] = {}
        for r in rs:
            if r["cancelled"]:
                continue
            a = acc.setdefault(r[key], {"name": r[key], "trips": 0, "hire": 0.0, "summary": 0.0})
            a["trips"] += 1
            a["hire"] += r["hire"] or 0
            a["summary"] += r["summary"] or 0
        out = sorted(acc.values(), key=lambda a: (-a["hire"], -a["trips"]))
        return [dict(a, hire=round(a["hire"], 2), summary=round(a["summary"], 2)) for a in out[:n]]

    by_cat = []
    present = {r["category"] for r in rows}
    order = [c for c, _ in CATEGORIES] + sorted(present - set(CAT_LABEL))
    for code in order:
        rs = [r for r in rows if r["category"] == code]
        if cats and code not in cats:
            continue
        label = CAT_LABEL.get(code, "No category" if code == "NONE" else code.title())
        by_cat.append({"code": code, "label": label, "sheet": label[:31], "totals": totals(rs), "rows": rs,
                       "top_customers": top(rs, "customer"), "top_routes": top(rs, "route")})

    cust: dict[str, dict] = {}
    for r in rows:
        if r["cancelled"]:
            continue
        c = cust.setdefault(r["customer"], {"name": r["customer"], "trips": 0, "by_cat": defaultdict(int), "hire": 0.0,
                                             "expense": 0.0, "invoiced_hire": 0.0, "to_invoice_hire": 0.0})
        c["trips"] += 1
        c["by_cat"][r["category"]] += 1
        c["hire"] += r["hire"] or 0
        c["expense"] += r["expense"] or 0
        if r["invoiced"]:
            c["invoiced_hire"] += r["hire"] or 0
        elif not r["waived"] and r["category"] != "SHIFTING":
            c["to_invoice_hire"] += r["hire"] or 0

    filters = []
    if card != "All":
        filters.append(f"stage: {card}")
    if cats:
        filters.append("category: " + ", ".join(CAT_LABEL.get(c, c) for c in cats))
    if search:
        filters.append(f'search: "{search}"')
    rep = {
        "period": {"start": _iso(start), "end": _iso(end), "label": _period_label(start, end)},
        "generated_at": datetime.now(IST).strftime("%d-%m-%Y %I:%M %p"),
        "filters": filters, "card": card, "categories": cats, "search": search or "",
        "show_invoice": show_invoice,
        "show_profit": show_profit,
        "period_open": bool(end and end >= today and (start is None or start <= today)),
        "totals": totals(rows),
        "by_category": by_cat,
        "top_customers": top(rows, "customer"),
        "top_routes": top(rows, "route"),
        "customers": sorted(
            ({"name": c["name"], "trips": c["trips"], "by_cat": dict(c["by_cat"]), "hire": round(c["hire"], 2),
              "expense": round(c["expense"], 2), "summary": round(c["hire"] - c["expense"], 2),
              "invoiced_hire": round(c["invoiced_hire"], 2), "to_invoice_hire": round(c["to_invoice_hire"], 2)}
             for c in cust.values()), key=lambda c: -c["hire"]),
    }
    if not show_profit:
        _drop_summary(rep)
    return rep


def _drop_summary(x) -> None:
    """Removes every "summary" (hire − expenses) figure, however deep."""
    if isinstance(x, dict):
        x.pop("summary", None)
        for v in x.values():
            _drop_summary(v)
    elif isinstance(x, list):
        for v in x:
            _drop_summary(v)


# ── Excel ────────────────────────────────────────────────────────────────────

def _money_or_dash(v):
    return v if v is not None else "—"


def _summary(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "Summary")
    t = rep["totals"]
    sub = f"{rep['period']['label']} · downloaded {rep['generated_at']}"
    if rep["filters"]:
        sub += " · " + " · ".join(rep["filters"])
    r = _title(s, 1, "Trip History Report", sub)
    sp = rep["show_profit"]

    _band(s, r, "THE PERIOD AT A GLANCE", 7)
    items = [
        ("Trips", t["trips"], None),
        ("  counted (not cancelled)", t["counted"], None),
        ("  cancelled — listed, not counted", t["cancelled"], None),
        ("  with a trip sheet", t["with_sheet"], None),
        ("  no trip sheet yet (no hire or expenses)", t["without_sheet"], None),
        ("Km on trip sheets", t["km"], KM),
        ("Hire (₹)", t["hire"], MONEY),
        ("Trip expenses (₹)", t["expense"], MONEY),
        *([("Trip Summary — hire − expenses (₹)", t["summary"], MONEY)] if sp else []),
        ("Average hire per trip (₹)", _money_or_dash(t["avg_hire"]), MONEY),
    ]
    if rep["show_invoice"]:
        items += [
            ("Invoiced trips", t["invoiced"], None), ("  their hire (₹)", t["invoiced_hire"], MONEY),
            ("Still to invoice", t["to_invoice"], None), ("  their hire (₹)", t["to_invoice_hire"], MONEY),
            ("Invoice waived", t["waived"], None),
        ]
    r = _pairs(s, r + 1, items)

    r += 1
    _band(s, r, "TRIPS BY STAGE", 7)
    r += 1
    for stage, n in t["stages"].items():
        s.put(r, 1, stage)
        s.put(r, 2, n, bold=True)
        r += 1

    r += 1
    _band(s, r, "BY TRIP CATEGORY — click a category to open its sheet", 7)
    s.header(r + 1, ["Category", "Trips", "Km", "Hire (₹)", "Expenses (₹)"] + (["Trip Summary (₹)"] if sp else []) + ["Share of hire"])
    share = 7 if sp else 6
    r += 2
    for c in rep["by_category"]:
        ct = c["totals"]
        cell = s.put(r, 1, c["label"])
        if ct["trips"]:
            _link(cell, c["sheet"])
        s.put(r, 2, ct["trips"] if ct["trips"] else "No trips")
        s.put(r, 3, ct["km"], fmt=KM)
        s.put(r, 4, ct["hire"], fmt=MONEY)
        s.put(r, 5, ct["expense"], fmt=MONEY)
        if sp:
            s.put(r, 6, ct["summary"], fmt=MONEY)
        s.put(r, share, round(ct["hire"] / t["hire"] * 100, 1) if t["hire"] else 0, fmt='0.0"%"')
        r += 1
    for col in range(1, share + 1):
        s.ws.cell(row=r, column=col).fill = _fill(TOTAL_FILL)
    s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
    s.put(r, 2, t["trips"], bold=True, fill=TOTAL_FILL)
    s.put(r, 3, t["km"], fmt=KM, bold=True, fill=TOTAL_FILL)
    s.put(r, 4, t["hire"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
    s.put(r, 5, t["expense"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
    if sp:
        s.put(r, 6, t["summary"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
    r += 1

    for label, key in (("TOP 5 CUSTOMERS", "top_customers"), ("TOP 5 ROUTES", "top_routes")):
        r += 1
        _band(s, r, label, 7)
        s.header(r + 1, ["Customer" if key == "top_customers" else "Route", "Trips", "Hire (₹)"] + (["Trip Summary (₹)"] if sp else []))
        r += 2
        for a in rep[key]:
            s.put(r, 1, a["name"])
            s.put(r, 2, a["trips"])
            s.put(r, 3, a["hire"], fmt=MONEY)
            if sp:
                s.put(r, 4, a["summary"], fmt=MONEY)
            r += 1

    r += 1
    _band(s, r, "WORTH KNOWING", 7)
    notes = [
        "Hire and expenses come from each trip's trip sheet" + ("; Trip Summary = hire − trip expenses (the page's \"Trip Summary\")." if sp else "."),
        "Cancelled trips are listed on their category's sheet but never added into the money.",
        "Dates follow the trip's scheduled date, as on the Trip History page.",
    ]
    if t["without_sheet"]:
        notes.append(f"{t['without_sheet']} trip(s) have no trip sheet yet, so no hire or expenses are counted for them.")
    if t["no_km"]:
        notes.append(f"{t['no_km']} trip sheet(s) have 0 km — marked \"0 km\" in the Km column.")
    if t["under_review"]:
        notes.append(f"{t['under_review']} trip(s) are under audit review — marked \"Under review\"; their figures may change.")
    if rep["show_invoice"]:
        notes.append("Still to invoice leaves out Shifting trips (no invoice needed) and waived ones.")
    if rep["period_open"]:
        notes.insert(0, "The period isn't over yet — more trips may still be added.")
    for i, n in enumerate(notes, 1):
        s.put(r + i, 1, f"{i}. {n}")
    r += len(notes) + 2

    _band(s, r, "WHAT'S IN THIS FILE", 7)
    guide = [("Summary", "this page")]
    guide += [(c["label"], "every trip in this category, its figures, top customers and routes, cancelled trips")
              for c in rep["by_category"] if c["totals"]["trips"]]
    guide.append(("By Customer", "every customer: trips per category, hire, expenses" + (", Trip Summary" if sp else "")
                  + (", invoiced and still to invoice" if rep["show_invoice"] else "")))
    for i, (a, b) in enumerate(guide, 1):
        s.put(r + i, 1, a, bold=True)
        s.put(r + i, 2, b)
    s.widths([42, 14, 12, 16, 16, 18, 14])
    return s


def _category_sheet(wb: Workbook, c: dict, rep: dict) -> Sheet:
    s = Sheet(wb, c["sheet"])
    t = c["totals"]
    show_inv = rep["show_invoice"]
    sp = rep["show_profit"]
    _link(s.put(1, 14 if sp else 13, "← Summary"), "Summary")
    r = _title(s, 1, f"{c['label']} trips", f"{rep['period']['label']}" + (" · " + " · ".join(rep["filters"]) if rep["filters"] else ""))

    _band(s, r, "THIS CATEGORY", 4)
    items = [
        ("Trips", t["trips"], None), ("  cancelled — not counted", t["cancelled"], None),
        ("  no trip sheet yet", t["without_sheet"], None),
        ("Km on trip sheets", t["km"], KM),
        ("Hire (₹)", t["hire"], MONEY), ("Trip expenses (₹)", t["expense"], MONEY),
        *([("Trip Summary (₹)", t["summary"], MONEY)] if sp else []), ("Average hire per trip (₹)", _money_or_dash(t["avg_hire"]), MONEY),
    ]
    if show_inv:
        items += [("Invoiced", t["invoiced"], None), ("Still to invoice", t["to_invoice"], None),
                  ("  their hire (₹)", t["to_invoice_hire"], MONEY)]
    r = _pairs(s, r + 1, items)
    if t["stages"]:
        r += 1
        s.put(r, 1, "By stage: " + " · ".join(f"{k} {v}" for k, v in t["stages"].items()), color="6B7280")
        r += 1

    live = [x for x in c["rows"] if not x["cancelled"]]
    gone = [x for x in c["rows"] if x["cancelled"]]
    r += 1
    heads = ["Trip ID", "Booking ref", "Date", "Stage", "Customer", "From", "To", "Container", "Driver", "Truck",
             "Km", "Hire (₹)", "Expenses (₹)"] + (["Trip Summary (₹)"] if sp else []) + (["Invoice"] if show_inv else [])
    inv_col = 15 if sp else 14
    _band(s, r, "TRIPS", len(heads))
    s.header(r + 1, heads)
    r += 2
    first = r
    for x in live:
        s.put(r, 1, x["trip_id"], bold=True)
        s.put(r, 2, x["booking_ref"])
        s.put(r, 3, _d(x["date"]), fmt=DATE)
        stage = s.put(r, 4, x["stage"] + (" · Under review" if x["under_review"] else ""))
        if x["under_review"]:
            stage.font = Font(bold=True, color="C55A11")
        s.put(r, 5, x["customer"])
        s.put(r, 6, x["origin"])
        s.put(r, 7, x["destination"])
        s.put(r, 8, x["container"])
        s.put(r, 9, x["driver"])
        s.put(r, 10, x["truck"])
        if x["has_sheet"] and not x["km"]:
            k = s.put(r, 11, "0 km")
            k.font = Font(bold=True, color="C55A11")
            k.fill = _fill(WARN)
        else:
            s.put(r, 11, x["km"], fmt=KM)
        s.put(r, 12, x["hire"] if x["has_sheet"] else "No sheet", fmt=MONEY)
        s.put(r, 13, x["expense"], fmt=MONEY)
        if sp:
            sm = s.put(r, 14, x["summary"], fmt=MONEY)
            if x["summary"] is not None:
                sm.font = Font(bold=True, color="00783C" if x["summary"] >= 0 else "C00000")
        if show_inv:
            s.put(r, inv_col, x["invoice"] if x["category"] != "SHIFTING" else "Not needed (Shifting)")
        r += 1
    if live:
        r += 1
        for col in range(1, len(heads) + 1):
            s.ws.cell(row=r, column=col).fill = _fill(TOTAL_FILL)
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        s.put(r, 2, f"{len(live)} trips", bold=True, fill=TOTAL_FILL)
        s.put(r, 11, t["km"], formula=f"=SUM(K{first}:K{r - 2})", fmt=KM, bold=True, fill=TOTAL_FILL)
        s.put(r, 12, t["hire"], formula=f"=SUM(L{first}:L{r - 2})", fmt=MONEY, bold=True, fill=TOTAL_FILL)
        s.put(r, 13, t["expense"], formula=f"=SUM(M{first}:M{r - 2})", fmt=MONEY, bold=True, fill=TOTAL_FILL)
        if sp:
            s.put(r, 14, t["summary"], formula=f"=SUM(N{first}:N{r - 2})", fmt=MONEY, bold=True, fill=TOTAL_FILL)
        s.ws.auto_filter.ref = f"A{first - 1}:{chr(64 + len(heads))}{r - 2}"
        s.ws.freeze_panes = s.ws.cell(row=first, column=2)
    else:
        s.put(r, 1, "No trips counted in this category.", color="6B7280")

    for label, key in (("TOP CUSTOMERS IN THIS CATEGORY", "top_customers"), ("TOP ROUTES IN THIS CATEGORY", "top_routes")):
        if not c[key]:
            continue
        r += 2
        _band(s, r, label, 4)
        s.header(r + 1, ["Customer" if key == "top_customers" else "Route", "Trips", "Hire (₹)"] + (["Trip Summary (₹)"] if sp else []))
        r += 2
        for a in c[key]:
            s.put(r, 1, a["name"])
            s.put(r, 2, a["trips"])
            s.put(r, 3, a["hire"], fmt=MONEY)
            if sp:
                s.put(r, 4, a["summary"], fmt=MONEY)
            r += 1

    if gone:
        r += 2
        _band(s, r, "CANCELLED — NOT COUNTED", 6)
        s.header(r + 1, ["Trip ID", "Date", "Customer", "Route", "Driver", "Truck"])
        r += 2
        for x in gone:
            s.put(r, 1, x["trip_id"])
            s.put(r, 2, _d(x["date"]), fmt=DATE)
            s.put(r, 3, x["customer"])
            s.put(r, 4, x["route"])
            s.put(r, 5, x["driver"])
            s.put(r, 6, x["truck"])
            r += 1
    s.widths([24, 16, 12, 22, 28, 18, 18, 16, 20, 14, 10, 15, 15, 16, 22])
    return s


def _customers(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "By Customer")
    r = _title(s, 1, "By Customer", f"{rep['period']['label']} · cancelled trips left out")
    cats = [c for c in rep["by_category"] if c["totals"]["counted"]]
    sp = rep["show_profit"]
    heads = ["Customer", "Trips"] + [c["label"] for c in cats] + ["Hire (₹)", "Expenses (₹)"] + (["Trip Summary (₹)"] if sp else [])
    inv = 3 if sp else 2   # the invoice columns, after hire
    if rep["show_invoice"]:
        heads += ["Invoiced hire (₹)", "Still to invoice (₹)"]
    s.header(r, heads)
    r += 1
    for cu in rep["customers"]:
        col = 1
        s.put(r, col, cu["name"])
        s.put(r, col + 1, cu["trips"])
        col = 3
        for c in cats:
            s.put(r, col, cu["by_cat"].get(c["code"], 0) or "")
            col += 1
        s.put(r, col, cu["hire"], fmt=MONEY)
        s.put(r, col + 1, cu["expense"], fmt=MONEY)
        if sp:
            s.put(r, col + 2, cu["summary"], fmt=MONEY)
        if rep["show_invoice"]:
            s.put(r, col + inv, cu["invoiced_hire"], fmt=MONEY)
            s.put(r, col + inv + 1, cu["to_invoice_hire"], fmt=MONEY)
        r += 1
    if rep["customers"]:
        t = rep["totals"]
        r += 1
        for c in range(1, len(heads) + 1):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        s.put(r, 2, t["counted"], bold=True, fill=TOTAL_FILL)
        col = 3 + len(cats)
        s.put(r, col, t["hire"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
        s.put(r, col + 1, t["expense"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
        if sp:
            s.put(r, col + 2, t["summary"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
        if rep["show_invoice"]:
            s.put(r, col + inv, t["invoiced_hire"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
            s.put(r, col + inv + 1, t["to_invoice_hire"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
    else:
        s.put(r, 1, "No trips in this report.", color="6B7280")
    s.widths([34, 8] + [11] * len(cats) + [16, 16, 16, 17, 18])
    return s


def filename_for(rep: dict) -> str:
    p = rep["period"]
    f = lambda s: date.fromisoformat(s).strftime("%d-%m-%Y")  # noqa: E731
    span = f"_{f(p['start'])}_to_{f(p['end'])}" if p["start"] and p["end"] else (
        f"_from_{f(p['start'])}" if p["start"] else f"_to_{f(p['end'])}" if p["end"] else "_all_time")
    extra = ""
    if rep["card"] != "All":
        extra += "_" + rep["card"].replace(" ", "_")
    if len(rep["categories"]) == 1:
        extra += "_" + CAT_LABEL.get(rep["categories"][0], rep["categories"][0]).replace(" ", "_")
    return f"Trip_History{extra}{span}.xlsx"


def build(db: Session, start: date | None, end: date | None, search: str = "", category: str = "",
          card: str = "All", show_invoice: bool = True, show_profit: bool = True):
    """(xlsx bytes, filename, preview sheets, report figures)."""
    rep = collect(db, start, end, search, category, card, show_invoice, show_profit)
    wb = Workbook()
    wb.remove(wb.active)
    sheets = [("Summary", _summary(wb, rep))]
    for c in rep["by_category"]:
        if c["totals"]["trips"]:
            sheets.append((c["sheet"], _category_sheet(wb, c, rep)))
    sheets.append(("By Customer", _customers(wb, rep)))
    for _, sh in sheets:
        sh.ws.sheet_view.showGridLines = False
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue(), filename_for(rep), [sh.preview(name) for name, sh in sheets], rep
