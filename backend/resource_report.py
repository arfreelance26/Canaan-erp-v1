"""Resource Hub → View: a "file" report for each resource page (Excel + PDF).

Every page builds the same shape — key figures and tables for the Summary,
then one sheet per item (a truck, a driver, …) made of fact boxes and tables —
and one writer turns it into the workbook; the frontend draws the PDF from the
same figures (lib/resource-report-pdf.ts via GET /exports/resource-report/preview).

  fleet    a sheet per truck: details, current driver, every document with its
           expiry, the loan, last service and fuel, the last 12 months' trips
  drivers  a sheet per driver: details, licence, IDs and bank (masked to the
           last 4), current truck, the last 12 months month by month
  customers a sheet per customer type, plus Destinations / Pricing / Final Pricing
  vendors  a sheet per category with 12 months' spend
  staff    a sheet per role: tenure, birthdays, masked Aadhaar, attendance
  archive  a sheet per record type in the Archive
  payments Payment Requests, a sheet per requester (any date range)
  holidays Staff Holidays for a year: the list, working days by month, changes

Activity covers the last 12 months up to today. Aadhaar, PAN and bank account
numbers are masked to their last 4 characters — these files get shared.
No cost per km anywhere.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from sqlalchemy import LargeBinary, func
from sqlalchemy.orm import Session, load_only

import models
from maintenance_report import TOTAL_FILL, WARN, _band, _d, _iso, _link, _sheet_names, _title
from audit_report import _inr
from pl_export import DATE, IST, KM, MONEY, Sheet, _fill

TONE_FONT = {"bad": "C00000", "warn": "C55A11", "good": "00783C"}
TONE_FILL = {"bad": "FFC7CE", "warn": WARN, "good": "C6EFCE"}
CAT = {"OUTSTATION": "Outstation", "LOCAL": "Local", "SHIFTING": "Shifting", "LOCAL CFS": "Local CFS", "RETURN TRIP": "Return Trip"}


# ── Helpers ──────────────────────────────────────────────────────────────────

def slim(model):
    """Every column but the stored files (photos, scanned documents)."""
    return load_only(*[getattr(model, c.key) for c in model.__table__.columns
                       if not isinstance(c.type, LargeBinary) and c.key in model.__mapper__.columns])


def mask(v) -> str:
    s = "".join(ch for ch in str(v or "") if ch.isalnum())
    if not s:
        return ""
    return ("X" * max(len(s) - 4, 0) + s[-4:]) if len(s) > 4 else s


def clean(v) -> str:
    s = str(v or "").strip()
    return "" if s.lower() in ("nan", "none", "null") else s


def window(today: date) -> tuple[date, date]:
    try:
        start = today.replace(year=today.year - 1) + timedelta(days=1)
    except ValueError:
        start = today.replace(year=today.year - 1, day=28) + timedelta(days=1)
    return start, today


def expiry_tone(d: date | None, today: date, soon: int) -> tuple[str, str]:
    if d is None:
        return "Not entered", "warn"
    left = (d - today).days
    if left < 0:
        return f"Expired {abs(left)} days ago", "bad"
    if left <= soon:
        return f"Due in {left} days", "warn"
    return "Valid", "good"


def trip_activity(db: Session, start: date, end: date):
    """Trips with a trip sheet in the window: per truck, per driver, and per
    driver per month — count, km, hire — plus each truck's / driver's last trip ever."""
    from routers.pl_summary import TRIP_DAY
    q = (db.query(models.Trip.vehicle_id, models.Trip.driver_id, models.TripSheet.total_km, models.TripSheet.hire_amount, TRIP_DAY)
         .join(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
         .outerjoin(models.TripClosure, models.TripClosure.trip_id == models.Trip.id)
         .filter(models.Trip.deleted_at.is_(None), models.Trip.status != "Cancelled"))
    by_truck, by_driver = defaultdict(lambda: [0, 0.0, 0.0]), defaultdict(lambda: [0, 0.0, 0.0])
    by_driver_month = defaultdict(lambda: [0, 0.0, 0.0])
    last_truck, last_driver = {}, {}
    for vid, did, km, hire, day in q.all():
        day = day.date() if isinstance(day, datetime) else day
        if not day:
            continue
        if vid and (vid not in last_truck or day > last_truck[vid]):
            last_truck[vid] = day
        if did and (did not in last_driver or day > last_driver[did]):
            last_driver[did] = day
        if not (start <= day <= end):
            continue
        for bucket, key in ((by_truck, vid), (by_driver, did), (by_driver_month, (did, day.strftime("%Y-%m")))):
            if key:
                b = bucket[key]
                b[0] += 1
                b[1] += float(km or 0)
                b[2] += float(hire or 0)
    return by_truck, by_driver, by_driver_month, last_truck, last_driver


def months_back(start: date, end: date) -> list[str]:
    out, y, m = [], start.year, start.month
    while (y, m) <= (end.year, end.month):
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def box(title, pairs):
    """A fact box: [(label, value, kind, tone)] — kind: text|date|money|km|num."""
    return {"title": title, "pairs": [{"label": p[0], "value": p[1], "kind": p[2] if len(p) > 2 else "text",
                                       "tone": p[3] if len(p) > 3 else None} for p in pairs]}


def table(title, columns, rows, total=None, link_col=None):
    """columns: [(heading, kind)] — kind: text|date|money|km|num|link; rows: lists of values,
    a value may be {"v": …, "tone": "bad|warn|good"}."""
    return {"title": title, "columns": [{"label": c[0], "kind": c[1], "pdf": c[2] if len(c) > 2 else True} for c in columns],
            "rows": rows, "total": total, "link_col": link_col}


# ── Fleet ────────────────────────────────────────────────────────────────────

def _fleet(db: Session, search: str, today: date) -> dict:
    from routers.maintenance import fuel_mileage_all, maintenance_cost_summary_all
    from routers.trucks import COMPLIANCE_COST_DOCS, compliance_docs_all

    start, end = window(today)
    term = search.lower()
    all_trucks = db.query(models.Truck).options(slim(models.Truck)).order_by(models.Truck.truck_id).all()
    trucks = [t for t in all_trucks if t.deleted_at is None and (not term or any(
        term in (v or "").lower() for v in (t.registration_number, t.truck_id, t.branch_registered_to)))]
    sold = [t for t in all_trucks if t.disposal_type == "Sold" and (not term or any(
        term in (v or "").lower() for v in (t.registration_number, t.truck_id, t.model_name, t.manufacturer, t.sold_note)))]
    ids = {t.id for t in trucks}
    docs = compliance_docs_all(db, ids) if ids else {}
    numbers = {"RC": None, "Road Tax": "road_tax_number", "National Permit": "national_permit_number",
               "Pollution Certificate": "pollution_certificate_number"}
    assign = {a.vehicle_id: a.driver_id for a in db.query(models.DriverAssignment)}
    drivers = dict(db.query(models.Driver.driver_id, models.Driver.name))
    loans = defaultdict(list)
    for e in db.query(models.EmiRecord):
        loans[(e.truck_registration or "").replace(" ", "").upper()].append(e)
    by_truck, _, _, last_trip, _ = trip_activity(db, start, end)
    mileage = fuel_mileage_all(db)
    normal = maintenance_cost_summary_all(db)
    last_service = {}
    for tid, d, mtype in db.query(models.MaintenanceRecord.truck_id, models.MaintenanceRecord.date, models.MaintenanceRecord.maintenance_type).order_by(models.MaintenanceRecord.date):
        last_service[tid] = (d, mtype)
    last_fuel = dict(db.query(models.FuelLog.truck_id, func.max(models.FuelLog.date)).group_by(models.FuelLog.truck_id))

    items, attention, overview, no_driver, monthly_emi = [], [], [], [], 0.0
    missing = defaultdict(list)
    expired = due = 0
    for t, sheet in zip(trucks, _sheet_names([t.registration_number for t in trucks])):
        drv_id = assign.get(t.truck_id)
        drv = f"{drivers.get(drv_id, drv_id)} ({drv_id})" if drv_id else ""
        if not drv:
            no_driver.append(t)
        act = by_truck.get(t.truck_id, [0, 0.0, 0.0])
        doc_rows, worst = [], "good"
        for row in docs.get(t.id, []):
            status, tone = expiry_tone(row["expiry"], today, 30)
            if tone == "bad":
                expired += 1
                worst = "bad"
            elif tone == "warn" and row["expiry"] is not None:
                due += 1
                worst = "warn" if worst == "good" else worst
            if row["expiry"] is None:
                missing[t.registration_number, sheet].append(row["label"])
            elif tone != "good":
                attention.append([{"v": t.registration_number, "link": sheet}, row["label"], _iso(row["expiry"]), {"v": status, "tone": tone}])
            num_field = numbers.get(row["label"])
            doc_rows.append([row["label"], clean(getattr(t, num_field, "")) if num_field else "", _iso(row["issued"]), _iso(row["expiry"]),
                             (row["expiry"] - today).days if row["expiry"] else None, {"v": status, "tone": tone}, row["expense"] or None])
        reg_key = (t.registration_number or "").replace(" ", "").upper()
        active_loans = [e for e in loans.get(reg_key, []) if not e.emi_end_date or e.emi_end_date >= today]
        loan = active_loans[0] if active_loans else (loans.get(reg_key) or [None])[-1]
        if active_loans:
            monthly_emi += sum(float(e.emi_amount or 0) for e in active_loans)
        months_left = None
        if loan and loan.emi_end_date and loan.emi_end_date >= today:
            months_left = (loan.emi_end_date.year - today.year) * 12 + loan.emi_end_date.month - today.month
        ls = last_service.get(t.id)
        mk = mileage.get(str(t.id))
        nm = (normal.get(t.id) or {}).get("monthly")
        items.append({
            "sheet": sheet, "title": f"{t.registration_number} | {t.truck_id}",
            "subtitle": " | ".join(x for x in (" ".join(clean(v) for v in (t.manufacturer, t.model_name) if clean(v)), t.truck_type,
                                                f"{t.tyre_layout} tyres" if t.tyre_layout else "", clean(t.branch_registered_to)) if x),
            "boxes": [
                box("TRUCK", [("Registration", t.registration_number), ("Truck ID", t.truck_id),
                              ("Make / model", " ".join(clean(v) for v in (t.manufacturer, t.model_name) if clean(v)) or "—"),
                              ("Type · tyre layout", f"{t.truck_type or '—'} · {t.tyre_layout or '—'}"),
                              ("Year · chassis", f"{clean(t.year_of_manufacture) or '—'} · {clean(t.chassis_number) or '—'}"),
                              ("Branch", clean(t.branch_registered_to) or "—"),
                              ("Odometer (km)", float(t.odometer or 0), "km"), ("Fuel tank (L)", float(t.fuel_capacity or 0) or None, "num")]),
                box("DRIVER AND LAST 12 MONTHS", [("Current driver", drv or "No driver", "text", None if drv else "warn"),
                                                   ("Trips", act[0], "num"), ("Km", act[1], "km"), ("Hire (₹)", act[2], "money"),
                                                   ("Last trip", _iso(last_trip.get(t.truck_id)), "date")]),
                box("SERVICE AND FUEL", [("Last service", _iso(ls[0]) if ls else None, "date"), ("  type", ls[1] if ls else "—"),
                                         ("Normal maintenance a month (₹)", nm, "money"),
                                         ("Last fuel fill", _iso(last_fuel.get(t.id)), "date"),
                                         ("Mileage (km per litre)", round(mk, 2) if mk else None, "num")]),
                box("LOAN", [("Lender", clean(loan.bank_name) if loan else "No loan on record"),
                             ("Loan number", mask(loan.loan_number) if loan else ""),
                             ("EMI a month (₹)", float(loan.emi_amount or 0) if loan else None, "money"),
                             ("Runs", f"{loan.emi_start_date.strftime('%d-%m-%Y') if loan.emi_start_date else '—'} to "
                                      f"{loan.emi_end_date.strftime('%d-%m-%Y') if loan.emi_end_date else '—'}" if loan else ""),
                             ("Months left", months_left if months_left is not None else ("Paid off" if loan else ""), "num")]),
            ],
            "tables": [table("DOCUMENTS", [("Document", "text"), ("Number", "text"), ("Valid from", "date"), ("Expiry", "date"),
                                           ("Days left", "num"), ("Status", "text"), ("Cost (₹)", "money")], doc_rows)],
        })
        overview.append([{"v": t.registration_number, "link": sheet}, t.truck_id, drv or {"v": "No driver", "tone": "warn"},
                         float(t.odometer or 0), act[0], act[1], act[2],
                         {"v": {"bad": "Expired", "warn": "Due soon", "good": "All valid"}[worst], "tone": worst},
                         float(loan.emi_amount or 0) if active_loans else None])
    by_type = defaultdict(int)
    for t in trucks:
        by_type[(t.truck_type or "—", t.tyre_layout or "—")] += 1
    attention.sort(key=lambda r: (r[3]["tone"] != "bad", r[2] or ""))
    tables = [
        table("ALL TRUCKS — click one to open its file",
              [("Truck", "link"), ("Truck ID", "text"), ("Current driver", "text"), ("Odometer", "km"), ("Trips (12 m)", "num"),
               ("Km (12 m)", "km"), ("Hire (12 m, ₹)", "money"), ("Documents", "text"), ("EMI a month (₹)", "money")], overview,
              total=["TOTAL", f"{len(trucks)} trucks", "", None, sum(r[4] for r in overview), sum(r[5] for r in overview),
                     sum(r[6] for r in overview), "", monthly_emi]),
        table("DOCUMENTS EXPIRED OR DUE IN 30 DAYS",
              [("Truck", "link"), ("Document", "text"), ("Expiry", "date"), ("Status", "text")], attention),
        table("DOCUMENTS NOT ENTERED (no expiry date on record)",
              [("Truck", "link"), ("Missing", "num"), ("Documents", "text")],
              [[{"v": reg, "link": sh}, len(v), ", ".join(v)] for (reg, sh), v in missing.items()]),
        table("FLEET BY TYPE", [("Type", "text"), ("Tyre layout", "text"), ("Trucks", "num")],
              [[k[0], k[1], v] for k, v in sorted(by_type.items())]),
    ]
    if sold:
        tables.append(table("SOLD TRUCKS", [("Truck", "text"), ("Truck ID", "text"), ("Sold on", "date"), ("Odometer at sale", "km"), ("Note", "text")],
                            [[t.registration_number, t.truck_id, _iso(t.sold_date), t.sold_odometer, clean(t.sold_note)] for t in sold]))
    return {
        "kpis": [{"label": "Trucks", "value": str(len(trucks)), "note": f"{len(no_driver)} without a driver" if no_driver else "every truck has a driver"},
                 {"label": "Documents expired", "value": str(expired), "tone": "bad" if expired else None, "note": "renew straight away"},
                 {"label": "Due in 30 days", "value": str(due), "tone": "warn" if due else None, "note": "plan the renewal"},
                 {"label": "EMI a month (active loans)", "value": _inr(monthly_emi), "note": f"{sum(1 for r in overview if r[8])} trucks with a loan"}],
        "tables": tables,
        "notes": ["Documents come from each truck's document records — the period that covers today, else the latest one. "
                  "A document with no expiry date on record is listed under \"not entered\" instead.",
                  "Activity is the last 12 months of trips with a trip sheet (cancelled trips left out).",
                  "Loan numbers are masked to the last 4 characters."],
        "items": items,
    }


# ── Drivers ──────────────────────────────────────────────────────────────────

def _drivers(db: Session, search: str, today: date) -> dict:
    start, end = window(today)
    term = search.lower()
    everyone = db.query(models.Driver).options(slim(models.Driver)).order_by(models.Driver.name).all()
    drivers = [d for d in everyone if d.deleted_at is None and (not term or term in (d.name or "").lower() or term in (d.driver_id or "").lower())]
    left = [d for d in everyone if d.deleted_at is not None and (not term or term in (d.name or "").lower() or term in (d.driver_id or "").lower())]
    assign = {a.driver_id: a.vehicle_id for a in db.query(models.DriverAssignment)}
    regs = dict(db.query(models.Truck.truck_id, models.Truck.registration_number))
    _, by_driver, by_month, _, last_trip = trip_activity(db, start, end)
    att = defaultdict(lambda: defaultdict(int))
    att_month = defaultdict(lambda: defaultdict(int))
    for did, d, st in db.query(models.DriverAttendance.driver_id, models.DriverAttendance.date, models.DriverAttendance.status).filter(
            models.DriverAttendance.date >= start, models.DriverAttendance.date <= end):
        st = "Leave" if st == "On Leave" else st
        att[did][st] += 1
        att_month[(did, d.strftime("%Y-%m"))][st] += 1
    months = months_back(start, end)

    items, attention, overview, top = [], [], [], []
    expired = soon = 0
    for d, sheet in zip(drivers, _sheet_names([d.name for d in drivers])):
        status, tone = expiry_tone(d.license_expiry_date, today, 60)
        if tone == "bad" and d.license_expiry_date:
            expired += 1
        elif tone == "warn" and d.license_expiry_date:
            soon += 1
        if tone != "good":
            attention.append([{"v": d.name, "link": sheet}, d.driver_id, clean(d.license_number), _iso(d.license_expiry_date), {"v": status, "tone": tone}])
        vid = assign.get(d.driver_id)
        truck = f"{regs.get(vid, vid)}" if vid else ""
        act = by_driver.get(d.driver_id, [0, 0.0, 0.0])
        a = att.get(d.driver_id, {})
        age = None
        if d.date_of_birth:
            age = today.year - d.date_of_birth.year - ((today.month, today.day) < (d.date_of_birth.month, d.date_of_birth.day))
        years = round((today - d.date_of_joining).days / 365.25, 1) if d.date_of_joining else None
        month_rows = []
        for m in months:
            tm = by_month.get((d.driver_id, m), [0, 0.0, 0.0])
            am = att_month.get((d.driver_id, m), {})
            month_rows.append([datetime.strptime(m, "%Y-%m").strftime("%b %Y"), tm[0], tm[1], tm[2],
                               am.get("On Trip", 0), am.get("On Halt", 0), am.get("On Workshop", 0), am.get("Leave", 0)])
        items.append({
            "sheet": sheet, "title": f"{d.name} | {d.driver_id}",
            "subtitle": " | ".join(x for x in (clean(d.contact_number), f"truck {truck}" if truck else "no truck",
                                                f"joined {d.date_of_joining.strftime('%d-%m-%Y')}" if d.date_of_joining else "") if x),
            "boxes": [
                box("DRIVER", [("Driver ID", d.driver_id), ("Name", d.name),
                               ("Date of birth", _iso(d.date_of_birth), "date"), ("  age", age, "num"),
                               ("Joined", _iso(d.date_of_joining), "date"), ("  years with us", years, "num"),
                               ("Contact", clean(d.contact_number)), ("Email", clean(d.email)), ("Address", clean(d.address))]),
                box("LICENCE AND IDs", [("Licence number", clean(d.license_number) or "—"),
                                        ("Licence expiry", _iso(d.license_expiry_date), "date"), ("  status", status, "text", tone),
                                        ("Aadhaar", mask(d.aadhaar_number) or "—"), ("PAN", mask(d.pan_number) or "—"),
                                        ("Form 11", clean(d.form_11) or "—"), ("ESI number", mask(d.esi_number) or "—"),
                                        ("Agreement signed", clean(d.agreement_signed) or "—")]),
                box("BANK", [("Bank", clean(d.bank_name) or "—"), ("Branch", clean(d.bank_branch_name) or "—"),
                             ("Account", mask(d.account_number) or "—"), ("IFSC", clean(d.ifsc_code) or "—")]),
                box("LAST 12 MONTHS", [("Current truck", truck or "No truck", "text", None if truck else "warn"),
                                       ("Trips", act[0], "num"), ("Km", act[1], "km"), ("Hire (₹)", act[2], "money"),
                                       ("Days on trip · halt · workshop", f"{a.get('On Trip', 0)} · {a.get('On Halt', 0)} · {a.get('On Workshop', 0)}"),
                                       ("Leave days", a.get("Leave", 0), "num"), ("Last trip", _iso(last_trip.get(d.driver_id)), "date")]),
            ],
            "tables": [table("MONTH BY MONTH", [("Month", "text"), ("Trips", "num"), ("Km", "km"), ("Hire (₹)", "money"),
                                                ("On trip", "num"), ("On halt", "num"), ("Workshop", "num"), ("Leave", "num")],
                             month_rows, total=["TOTAL", act[0], act[1], act[2], a.get("On Trip", 0), a.get("On Halt", 0),
                                                a.get("On Workshop", 0), a.get("Leave", 0)])],
        })
        overview.append([{"v": d.name, "link": sheet}, d.driver_id, truck or {"v": "No truck", "tone": "warn"},
                         {"v": status, "tone": tone}, act[0], act[1], act[2], _iso(last_trip.get(d.driver_id))])
    attention.sort(key=lambda r: (r[4]["tone"] != "bad", r[3] or ""))
    top_rows = sorted(overview, key=lambda r: -r[4])[:10]
    tables = [
        table("ALL DRIVERS — click one to open their file",
              [("Driver", "link"), ("Driver ID", "text"), ("Truck", "text"), ("Licence", "text"), ("Trips (12 m)", "num"),
               ("Km (12 m)", "km"), ("Hire (12 m, ₹)", "money"), ("Last trip", "date")], overview,
              total=["TOTAL", f"{len(drivers)} drivers", "", "", sum(r[4] for r in overview), sum(r[5] for r in overview),
                     sum(r[6] for r in overview), None]),
        table("LICENCES NEEDING ATTENTION (expired, due in 60 days, or not entered)",
              [("Driver", "link"), ("Driver ID", "text"), ("Licence", "text"), ("Expiry", "date"), ("Status", "text")], attention),
        table("MOST TRIPS IN THE LAST 12 MONTHS", [("Driver", "link"), ("Trips", "num"), ("Km", "km"), ("Hire (₹)", "money")],
              [[r[0], r[4], r[5], r[6]] for r in top_rows if r[4]]),
    ]
    if left:
        tables.append(table("DRIVERS WHO HAVE LEFT", [("Driver", "text"), ("Driver ID", "text"), ("Left on", "date")],
                            [[d.name, d.driver_id, _iso(d.deleted_at.date() if d.deleted_at else None)] for d in left]))
    no_truck = sum(1 for r in overview if isinstance(r[2], dict))
    return {
        "kpis": [{"label": "Active drivers", "value": str(len(drivers)), "note": f"{len(left)} have left" if left else ""},
                 {"label": "Licences expired", "value": str(expired), "tone": "bad" if expired else None, "note": "can't drive legally"},
                 {"label": "Expiring in 60 days", "value": str(soon), "tone": "warn" if soon else None, "note": "renew in time"},
                 {"label": "Without a truck", "value": str(no_truck), "tone": "warn" if no_truck else None, "note": ""}],
        "tables": tables,
        "notes": ["Aadhaar, PAN, ESI and bank account numbers are masked to the last 4 characters — this file gets shared.",
                  "Activity is the last 12 months: trips with a trip sheet (cancelled left out) and attendance days."],
        "items": items,
    }


# ── Customers ────────────────────────────────────────────────────────────────

FINAL_PRICING_ROLES = ("Admin", "Accounts")   # same as the page's "Final Customer Pricing" tab


def _customers(db: Session, search: str, today: date, role: str = "") -> dict:
    from routers.pl_summary import TRIP_DAY
    start, end = window(today)
    term = search.lower()
    customers = db.query(models.Customer).options(slim(models.Customer)).filter(models.Customer.deleted_at.is_(None)).order_by(models.Customer.name).all()
    by_id = {c.id: c for c in customers}
    dests = db.query(models.CustomerDestination).all()
    dest_by_id = {d.id: d for d in dests}
    match_c = {c.id for c in customers if not term or term in (c.name or "").lower() or term in (c.gstin or "").lower()}
    match_d = {d.id for d in dests if not term or d.customer_id in match_c or term in (d.destination_name or "").lower()}

    # Trips with a trip sheet, last 12 months, and each customer's last trip ever.
    act = defaultdict(lambda: [0, 0.0])
    last = {}
    q = (db.query(models.Trip.customer_id, models.TripSheet.hire_amount, TRIP_DAY)
         .join(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
         .outerjoin(models.TripClosure, models.TripClosure.trip_id == models.Trip.id)
         .filter(models.Trip.deleted_at.is_(None), models.Trip.status != "Cancelled", models.Trip.customer_id.isnot(None)))
    for cid, hire, day in q.all():
        day = day.date() if isinstance(day, datetime) else day
        if not day:
            continue
        if cid not in last or day > last[cid]:
            last[cid] = day
        if start <= day <= end:
            act[cid][0] += 1
            act[cid][1] += float(hire or 0)

    groups = defaultdict(list)
    for c in customers:
        if c.id in match_c:
            groups[c.customer_type or "Not set"].append(c)
    order = [g for g in ("Shipping", "Transports", "Not set") if g in groups]
    sheet_names = _sheet_names([f"{g} customers" for g in order] + ["Destinations", "Pricing", "Final Pricing"])
    items, overview = [], []
    no_gst, quiet = [], []
    for g, sheet in zip(order, sheet_names):
        rows = []
        for c in groups[g]:
            a = act.get(c.id, [0, 0.0])
            lt = last.get(c.id)
            days_quiet = (today - lt).days if lt else None
            if not clean(c.gstin):
                no_gst.append(c)
            if days_quiet is None or days_quiet > 90:
                quiet.append((c, lt))
            rows.append([c.name, clean(c.gstin) or {"v": "Missing", "tone": "warn"}, clean(c.contact_personnel_name), clean(c.phone),
                         clean(c.email), clean(c.address), clean(c.is_gta), clean(c.applicable_for_e_invoice),
                         a[0], a[1], {"v": _iso(lt), "tone": "warn" if days_quiet is None or days_quiet > 90 else None}])
            overview.append((c, g, sheet, a))
        rows.sort(key=lambda r: -r[9])
        hire = sum(r[9] for r in rows)
        items.append({
            "sheet": sheet, "title": f"{g} customers", "subtitle": f"{len(rows)} customers · last 12 months",
            "boxes": [box("THIS GROUP", [("Customers", len(rows), "num"), ("Trips (12 months)", sum(r[8] for r in rows), "num"),
                                         ("Hire (12 months, ₹)", hire, "money"),
                                         ("No trips in 90 days", sum(1 for r in rows if isinstance(r[10], dict) and r[10].get("tone")), "num")])],
            "tables": [table("CUSTOMERS — busiest first", [("Customer", "text"), ("GSTIN", "text"), ("Contact person", "text", False), ("Phone", "text"),
                                                           ("Email", "text", False), ("Address", "text", False), ("GTA", "text"), ("E-invoice", "text"),
                                                           ("Trips (12 m)", "num"), ("Hire (12 m, ₹)", "money"), ("Last trip", "date")],
                             rows, total=["TOTAL", f"{len(rows)} customers", "", "", "", "", "", "", sum(r[8] for r in rows), hire, None])],
        })
    dsheet, psheet, fsheet = sheet_names[len(order):]
    drows = sorted(([by_id[d.customer_id].name if d.customer_id in by_id else "", clean(d.destination_name), clean(d.origin_state),
                     clean(d.destination_state), float(d.approx_distance_km) if d.approx_distance_km else None,
                     clean(d.cargo_classification), clean(d.container_type), clean(d.weight_in_tons),
                     {"v": d.status, "tone": None if d.status == "ACTIVE" else "warn"}]
                    for d in dests if d.id in match_d and d.customer_id in by_id), key=lambda r: (r[0], r[1]))
    items.append({"sheet": dsheet, "title": "Destinations", "subtitle": f"{len(drows)} destinations",
                  "boxes": [], "tables": [table("DESTINATIONS", [("Customer", "text"), ("Destination", "text"), ("From state", "text"),
                                                                ("To state", "text"), ("Approx km", "km"), ("Cargo", "text"), ("Container", "text"),
                                                                ("Weight", "text"), ("Status", "text")], drows)]})
    prows = []
    for r in db.query(models.CustomerPricing).all():
        d = dest_by_id.get(r.customer_destination_id)
        if r.customer_id not in by_id or not (r.customer_id in match_c or (d and d.id in match_d) or term in (r.customer_destination or "").lower()):
            continue
        prows.append([by_id[r.customer_id].name, clean(r.customer_destination), clean(d.cargo_classification) if d else "",
                      clean(d.container_type) if d else "", clean(d.weight_in_tons) if d else "", float(r.rate or 0),
                      float(r.commission_amount) if r.commission_amount is not None else None,
                      {"v": r.status, "tone": None if r.status == "ACTIVE" else "warn"}])
    prows.sort(key=lambda r: (r[0], r[1]))
    items.append({"sheet": psheet, "title": "Pricing", "subtitle": f"{len(prows)} pricing rules",
                  "boxes": [], "tables": [table("PRICING", [("Customer", "text"), ("Destination", "text"), ("Cargo", "text"), ("Container", "text"),
                                                           ("Weight", "text"), ("Rate (₹)", "money"), ("Commission (₹)", "money"), ("Status", "text")], prows)]})
    if role in FINAL_PRICING_ROLES:
        frows = []
        for r in db.query(models.FinalCustomerPricing).all():
            if r.customer_id not in by_id or r.customer_id not in match_c and term not in (r.customer_destination or "").lower():
                continue
            a_hire = float(r.actual_hire_amount) if r.actual_hire_amount is not None else None
            acc = float(r.accounts_hire_amount) if r.accounts_hire_amount is not None else None
            frows.append([by_id[r.customer_id].name, clean(r.customer_destination), a_hire, acc,
                          round(a_hire - acc, 2) if a_hire is not None and acc is not None else None])
        frows.sort(key=lambda r: (r[0], r[1]))
        items.append({"sheet": fsheet, "title": "Final Pricing (for Accounts)", "subtitle": f"{len(frows)} entries",
                      "boxes": [], "tables": [table("FINAL CUSTOMER PRICING", [("Customer", "text"), ("Destination", "text"),
                                                                                ("Actual hire (₹)", "money"), ("Accounts hire (₹)", "money"),
                                                                                ("Difference (₹)", "money")], frows)]})
    top = sorted(overview, key=lambda x: -x[3][1])[:10]
    total_hire = sum(x[3][1] for x in overview)
    by_type = [[g, len(groups[g]), sum(act.get(c.id, [0, 0])[0] for c in groups[g]), sum(act.get(c.id, [0, 0.0])[1] for c in groups[g])] for g in order]
    tables = [
        table("CUSTOMERS BY TYPE — click one to open its sheet",
              [("Type", "link"), ("Customers", "num"), ("Trips (12 m)", "num"), ("Hire (12 m, ₹)", "money")],
              [[{"v": r[0], "link": sheet_names[i]}, r[1], r[2], r[3]] for i, r in enumerate(by_type)],
              total=["TOTAL", sum(r[1] for r in by_type), sum(r[2] for r in by_type), total_hire]),
        table("TOP 10 CUSTOMERS BY HIRE (last 12 months)", [("Customer", "text"), ("Type", "text"), ("Trips", "num"), ("Hire (₹)", "money"), ("Share", "text")],
              [[c.name, g, a[0], a[1], f"{a[1] / total_hire * 100:.1f}%" if total_hire else "—"] for c, g, _, a in top if a[0]]),
        table("NO TRIPS IN THE LAST 90 DAYS", [("Customer", "text"), ("Type", "text"), ("Last trip", "date")],
              [[c.name, c.customer_type or "Not set", _iso(lt) or {"v": "Never", "tone": "warn"}] for c, lt in sorted(quiet, key=lambda x: (x[1] or date.min), reverse=True)]),
        table("MISSING GSTIN", [("Customer", "text"), ("Type", "text"), ("Phone", "text")],
              [[c.name, c.customer_type or "Not set", clean(c.phone)] for c in no_gst]),
    ]
    busy = sum(1 for x in overview if x[3][0])
    return {
        "kpis": [{"label": "Customers", "value": str(len(overview)), "note": f"{busy} with trips in 12 months"},
                 {"label": "Hire, last 12 months", "value": _inr(total_hire), "note": f"{sum(x[3][0] for x in overview)} trips"},
                 {"label": "No trips in 90 days", "value": str(len(quiet)), "tone": "warn" if quiet else None, "note": "worth a call"},
                 {"label": "Missing GSTIN", "value": str(len(no_gst)), "tone": "warn" if no_gst else None, "note": "needed for invoices"}],
        "tables": tables,
        "notes": ["Activity is the last 12 months of trips with a trip sheet for each customer (cancelled trips left out). "
                  "Trips booked under a typed-in customer name aren't linked to a customer, so they aren't counted here.",
                  "Destinations, Pricing" + (" and Final Pricing" if role in FINAL_PRICING_ROLES else "") + " match the page's tabs."],
        "items": items,
    }


# ── Vendors ──────────────────────────────────────────────────────────────────

def _vendors(db: Session, search: str, today: date, role: str = "") -> dict:
    start, end = window(today)
    term = search.lower()
    vendors = [v for v in db.query(models.Vendor).filter(models.Vendor.deleted_at.is_(None)).order_by(models.Vendor.name)
               if not term or any(term in (x or "").lower() for x in (v.name, v.category, v.contact_number))]
    spend = defaultdict(lambda: {"jobs": 0, "maint": 0.0, "retreads": 0, "retread_cost": 0.0, "trucks": set(), "last": None})
    regs = dict(db.query(models.Truck.id, models.Truck.registration_number))

    def mark(vid, d, cost, truck=None, retread=False):
        sp = spend[vid]
        if retread:
            sp["retreads"] += 1
            sp["retread_cost"] += cost
        else:
            sp["jobs"] += 1
            sp["maint"] += cost
            if truck:
                sp["trucks"].add(truck)
        if sp["last"] is None or d > sp["last"]:
            sp["last"] = d

    recs = db.query(models.MaintenanceRecord).filter(models.MaintenanceRecord.date >= start, models.MaintenanceRecord.date <= end).all()
    for r in recs:
        if r.items:
            for it in r.items:
                if it.vendor_id:
                    mark(it.vendor_id, r.date, float(it.cost or 0), regs.get(r.truck_id))
        elif r.vendor_id:
            mark(r.vendor_id, r.date, float(r.cost or 0), regs.get(r.truck_id))
    for e in db.query(models.TyreMovementEvent).filter(models.TyreMovementEvent.event == "Moved to Inventory",
                                                       models.TyreMovementEvent.vendor_id.isnot(None)):
        d = e.created_at.date() if e.created_at else None
        if d and start <= d <= end:
            mark(e.vendor_id, d, float(e.retread_cost or 0), retread=True)

    groups = defaultdict(list)
    for v in vendors:
        groups[clean(v.category) or "No category"].append(v)
    order = sorted(groups, key=lambda g: (-sum(spend[v.id]["maint"] + spend[v.id]["retread_cost"] for v in groups[g]), g))
    names = _sheet_names(order)
    items, cat_rows, total = [], [], 0.0
    no_gst = [v for v in vendors if not clean(v.gstin)]
    inactive = [v for v in vendors if v.status != "ACTIVE"]
    for g, sheet in zip(order, names):
        rows = []
        for v in groups[g]:
            sp = spend[v.id]
            amount = sp["maint"] + sp["retread_cost"]
            rows.append([v.name, {"v": v.status, "tone": None if v.status == "ACTIVE" else "bad" if v.status == "BLACKLISTED" else "warn"},
                         clean(v.contact_number), clean(v.gstin) or {"v": "Missing", "tone": "warn"}, mask(v.pan) or "", clean(v.email), clean(v.address),
                         sp["jobs"], len(sp["trucks"]), sp["maint"], sp["retreads"], sp["retread_cost"], amount, _iso(sp["last"])])
        rows.sort(key=lambda r: -r[12])
        g_total = sum(r[12] for r in rows)
        total += g_total
        cat_rows.append([{"v": g, "link": sheet}, len(rows), sum(r[7] for r in rows), g_total])
        items.append({
            "sheet": sheet, "title": g, "subtitle": f"{len(rows)} vendors · last 12 months",
            "boxes": [box("THIS CATEGORY", [("Vendors", len(rows), "num"), ("Repairs (12 months)", sum(r[7] for r in rows), "num"),
                                            ("Retreads (12 months)", sum(r[10] for r in rows), "num"), ("Spend (12 months, ₹)", g_total, "money")])],
            "tables": [table("VENDORS — biggest spend first",
                             [("Vendor", "text"), ("Status", "text"), ("Contact", "text"), ("GSTIN", "text"), ("PAN", "text", False), ("Email", "text", False),
                              ("Address", "text", False), ("Repairs", "num"), ("Trucks", "num"), ("Repairs (₹)", "money"), ("Retreads", "num"),
                              ("Retreads (₹)", "money"), ("Total spend (₹)", "money"), ("Last job", "date")],
                             rows, total=["TOTAL", f"{len(rows)} vendors", "", "", "", "", "", sum(r[7] for r in rows), None,
                                          sum(r[9] for r in rows), sum(r[10] for r in rows), sum(r[11] for r in rows), g_total, None])],
        })
    all_rows = [(v, spend[v.id]) for v in vendors]
    top = sorted(all_rows, key=lambda x: -(x[1]["maint"] + x[1]["retread_cost"]))[:10]
    tables = [
        table("BY CATEGORY — click one to open its sheet", [("Category", "link"), ("Vendors", "num"), ("Repairs (12 m)", "num"), ("Spend (12 m, ₹)", "money")],
              cat_rows, total=["TOTAL", len(vendors), sum(r[2] for r in cat_rows), total]),
        table("TOP 10 VENDORS BY SPEND (last 12 months)", [("Vendor", "text"), ("Category", "text"), ("Repairs", "num"), ("Retreads", "num"),
                                                           ("Spend (₹)", "money"), ("Share", "text")],
              [[v.name, clean(v.category) or "—", sp["jobs"], sp["retreads"], sp["maint"] + sp["retread_cost"],
                f"{(sp['maint'] + sp['retread_cost']) / total * 100:.1f}%" if total else "—"] for v, sp in top if sp["maint"] + sp["retread_cost"]]),
        table("NOT ACTIVE", [("Vendor", "text"), ("Category", "text"), ("Status", "text")],
              [[v.name, clean(v.category) or "—", {"v": v.status, "tone": "bad" if v.status == "BLACKLISTED" else "warn"}] for v in inactive]),
        table("MISSING GSTIN", [("Vendor", "text"), ("Category", "text"), ("Contact", "text")],
              [[v.name, clean(v.category) or "—", clean(v.contact_number)] for v in no_gst]),
    ]
    used = sum(1 for _, sp in all_rows if sp["jobs"] or sp["retreads"])
    return {
        "kpis": [{"label": "Vendors", "value": str(len(vendors)), "note": f"{used} used in 12 months"},
                 {"label": "Spend, last 12 months", "value": _inr(total), "note": "repairs + retreads"},
                 {"label": "Not active", "value": str(len(inactive)), "tone": "warn" if inactive else None, "note": "inactive or blacklisted"},
                 {"label": "Missing GSTIN", "value": str(len(no_gst)), "tone": "warn" if no_gst else None, "note": "needed for tax credit"}],
        "tables": tables,
        "notes": ["Spend is the last 12 months: approved maintenance repairs done by the vendor (by the day of the work) and tyre retreads.",
                  "PAN numbers are masked to the last 4 characters."],
        "items": items,
    }


# ── Our Staff ────────────────────────────────────────────────────────────────

ROLE_ORDER = ["Admin", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance",
              "Trip Sheet Register", "Yard Supervisor", "Auditor"]


def _next_date(d: date | None, today: date) -> date | None:
    """This year's (or next year's) date for a birthday / joining anniversary."""
    if not d:
        return None
    for y in (today.year, today.year + 1):
        try:
            n = d.replace(year=y)
        except ValueError:          # 29 Feb
            n = date(y, 3, 1)
        if n >= today:
            return n
    return None


def _staff(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    import attendance_report
    start, end = window(today)
    term = search.lower()
    everyone = db.query(models.Staff).options(slim(models.Staff)).order_by(models.Staff.name).all()
    hit = lambda s: not term or term in (s.name or "").lower() or term in (s.staff_id or "").lower()  # noqa: E731
    staff = [s for s in everyone if s.deleted_at is None and hit(s)]
    left = [s for s in everyone if s.deleted_at is not None and hit(s)]
    att = {x["key"]: x for x in attendance_report.collect(db, "staff", start, end, search)["people"]}
    # Staff attendance has only been kept since its first record — no "not marked" before that.
    tracked = db.query(func.min(models.StaffAttendance.date)).scalar()

    groups = defaultdict(list)
    for s in staff:
        groups[s.software_designation or "Not set"].append(s)
    order = [r for r in ROLE_ORDER if r in groups] + sorted(g for g in groups if g not in ROLE_ORDER)
    names = _sheet_names(order)
    items, by_role, coming, missing, frozen, rates = [], [], [], [], [], []
    for g, sheet in zip(order, names):
        rows = []
        for s in groups[g]:
            x = att.get(str(s.id))
            counts = dict(x["counts"]) if x else {"Present": 0, "On Leave": 0, "Absent": 0, "Not Marked": 0}
            if x:
                # Days before they joined, or before attendance was kept, can't be "not marked".
                since = max(d for d in (s.date_of_joining, tracked, start) if d)
                counts["Not Marked"] = sum(1 for r in x["rows"] if r["status"] == "Not Marked" and r["date"] >= _iso(since))
            due = counts["Present"] + counts["On Leave"] + counts["Absent"] + counts["Not Marked"]
            rate = round(counts["Present"] / due * 100, 1) if due else None
            if rate is not None:
                rates.append(rate)
            years = round((today - s.date_of_joining).days / 365.25, 1) if s.date_of_joining else None
            bday = _next_date(s.date_of_birth, today)
            anniv = _next_date(s.date_of_joining, today)
            if bday and (bday - today).days <= 30:
                coming.append([s.name, g, "Birthday", _iso(bday), (bday - today).days])
            if anniv and s.date_of_joining.year < anniv.year and (anniv - today).days <= 30:
                coming.append([s.name, g, f"{anniv.year - s.date_of_joining.year} years with us", _iso(anniv), (anniv - today).days])
            gaps = [w for w, v in (("phone", s.contact_number), ("date of birth", s.date_of_birth),
                                   ("joining date", s.date_of_joining), ("Aadhaar", s.aadhar_number)) if not clean(v)]
            if gaps:
                missing.append([s.name, g, ", ".join(gaps)])
            if s.frozen_at:
                frozen.append([s.name, g, clean(s.frozen_by_name), _iso(s.frozen_at.date()), clean(s.frozen_reason)])
            rows.append([s.staff_id, s.name, clean(s.designation), clean(s.department), clean(s.branch), clean(s.contact_number),
                         clean(s.email), _iso(s.date_of_joining), years,
                         s.date_of_birth.strftime("%d %b") if s.date_of_birth else "",
                         mask(s.aadhar_number) or "",
                         {"v": "Frozen", "tone": "bad"} if s.frozen_at else "Active",
                         counts["Present"], counts["On Leave"], counts["Absent"],
                         {"v": counts["Not Marked"], "tone": "warn"} if counts["Not Marked"] else 0,
                         {"v": f"{rate:.0f}%" if rate is not None else "—", "tone": "bad" if rate is not None and rate < 75 else None},
                         x["avg_hours"] if x else None])
        g_rates = [float(r[16]["v"].rstrip("%")) for r in rows if r[16]["v"] != "—"]
        avg = round(sum(g_rates) / len(g_rates)) if g_rates else None
        by_role.append([{"v": g, "link": sheet}, len(rows), f"{avg}%" if avg is not None else "—",
                        sum(r[12] for r in rows), sum(r[13] for r in rows), sum(r[14] for r in rows),
                        sum(r[15]["v"] if isinstance(r[15], dict) else r[15] for r in rows)])
        nm = lambda r: r[15]["v"] if isinstance(r[15], dict) else r[15]  # noqa: E731
        items.append({
            "sheet": sheet, "title": g, "subtitle": f"{len(rows)} staff · attendance over the last 12 months",
            "boxes": [box("THIS ROLE", [("Staff", len(rows), "num"), ("Average attendance", f"{avg}%" if avg is not None else "—"),
                                        ("Frozen accounts", sum(1 for r in rows if isinstance(r[11], dict)), "num"),
                                        ("Birthdays in the next 30 days", sum(1 for c in coming if c[1] == g and c[2] == "Birthday"), "num")])],
            "tables": [table("STAFF", [("Staff ID", "text"), ("Name", "text"), ("Designation", "text", False), ("Department", "text", False),
                                       ("Branch", "text", False), ("Phone", "text"), ("Email", "text", False), ("Joined", "date"),
                                       ("Years", "num"), ("Birthday", "text"), ("Aadhaar", "text", False), ("Account", "text"),
                                       ("Present", "num"), ("Leave", "num"), ("Absent", "num"), ("Not marked", "num"),
                                       ("Attendance", "text"), ("Avg hours a day", "num")],
                             rows, total=["TOTAL", f"{len(rows)} staff", "", "", "", "", "", None, None, "", "", "",
                                          sum(r[12] for r in rows), sum(r[13] for r in rows), sum(r[14] for r in rows),
                                          sum(nm(r) for r in rows), "", None])],
        })
    coming.sort(key=lambda c: c[4])
    tables = [
        table("STAFF BY ROLE — click one to open its sheet", [("Role", "link"), ("Staff", "num"), ("Avg attendance", "text"),
                                                              ("Present", "num"), ("Leave", "num"), ("Absent", "num"), ("Not marked", "num")],
              by_role, total=["TOTAL", len(staff), "", sum(r[3] for r in by_role), sum(r[4] for r in by_role),
                              sum(r[5] for r in by_role), sum(r[6] for r in by_role)]),
        table("COMING UP IN THE NEXT 30 DAYS", [("Name", "text"), ("Role", "text"), ("What", "text"), ("Date", "date"), ("In days", "num")], coming),
        table("DETAILS MISSING", [("Name", "text"), ("Role", "text"), ("Not entered", "text")], missing),
    ]
    if frozen:
        tables.append(table("FROZEN ACCOUNTS (can't log in)", [("Name", "text"), ("Role", "text"), ("Frozen by", "text"),
                                                              ("On", "date"), ("Reason", "text")], frozen))
    if left:
        tables.append(table("STAFF WHO HAVE LEFT", [("Name", "text"), ("Staff ID", "text"), ("Role", "text"), ("Left on", "date")],
                            [[s.name, s.staff_id, s.software_designation, _iso(s.deleted_at.date())] for s in left]))
    avg_all = round(sum(rates) / len(rates)) if rates else None
    births = sum(1 for c in coming if c[2] == "Birthday")
    return {
        "kpis": [{"label": "Staff", "value": str(len(staff)), "note": f"{len(order)} roles" + (f", {len(left)} have left" if left else "")},
                 {"label": "Average attendance", "value": f"{avg_all}%" if avg_all is not None else "—",
                  "tone": "warn" if avg_all is not None and avg_all < 75 else None, "note": "present on working days"},
                 {"label": "Birthdays in 30 days", "value": str(births), "tone": "good" if births else None, "note": "see Coming up"},
                 {"label": "Details missing", "value": str(len(missing)), "tone": "warn" if missing else None, "note": "phone, birthday, joining, Aadhaar"}],
        "tables": tables,
        "notes": ["Attendance is the last 12 months of working days (Sundays and holidays left out), counted the same way as the "
                  "Attendance Report" + (f", from {tracked.strftime('%d-%m-%Y')} when attendance started being kept" if tracked and tracked > start else "")
                  + ". Days before someone joined aren't counted as not marked.",
                  "Attendance % = days present ÷ working days due. Avg hours a day leaves out shifts the system closed itself.",
                  "Aadhaar numbers are masked to the last 4 digits."],
        "items": items,
    }


# ── Archive ──────────────────────────────────────────────────────────────────

ARCHIVE_TYPES = {"Driver": ("Drivers", models.Driver), "Truck": ("Trucks", models.Truck), "Staff": ("Staff", models.Staff),
                 "Customer": ("Customers", models.Customer), "Vendor": ("Vendors", models.Vendor),
                 "CfsYardEntry": ("CFS and Yards", models.CfsYardEntry)}


def _archive(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """Mirrors the Archive page: each still-deleted resource with its latest approved deletion request."""
    from approvals_report import _ist
    want = (opts or {}).get("rtype") or ""
    kinds = [want] if want in ARCHIVE_TYPES else list(ARCHIVE_TYPES)
    term = search.lower()
    found = defaultdict(list)
    for kind in kinds:
        model = ARCHIVE_TYPES[kind][1]
        gone = {i for (i,) in db.query(model.id).filter(model.deleted_at.isnot(None))}
        latest = {}
        for r in db.query(models.DeletionApprovalRequest).filter(models.DeletionApprovalRequest.status == "Approved",
                                                                 models.DeletionApprovalRequest.resource_type == kind):
            if r.resource_id in gone and (r.resource_id not in latest or (r.approved_at or datetime.min) > (latest[r.resource_id].approved_at or datetime.min)):
                latest[r.resource_id] = r
        for r in latest.values():
            if term and not any(term in (x or "").lower() for x in (r.resource_name, r.requested_by_name, r.approved_by_name)):
                continue
            found[kind].append(r)
    order = [k for k in kinds if found[k]]
    names = _sheet_names([ARCHIVE_TYPES[k][0] for k in order])
    items, by_type, recent, all_rows = [], [], [], []
    for kind, sheet in zip(order, names):
        rows = []
        for r in sorted(found[kind], key=lambda r: r.approved_at or datetime.min, reverse=True):
            on = _ist(r.approved_at).date() if r.approved_at else None
            asked = _ist(r.created_at).date() if r.created_at else None
            days = (today - on).days if on else None
            rows.append([r.resource_name, clean(r.requested_by_name), clean(r.reason), _iso(asked), clean(r.approved_by_name),
                         _iso(on), {"v": days, "tone": "warn" if days is not None and days > 180 else None}, clean(r.admin_note)])
            all_rows.append((kind, sheet, r, on, days))
            if days is not None and days <= 30:
                recent.append([{"v": r.resource_name, "link": sheet}, ARCHIVE_TYPES[kind][0], clean(r.requested_by_name), _iso(on), clean(r.reason)])
        oldest = max((r[6]["v"] for r in rows if r[6]["v"] is not None), default=None)
        by_type.append([{"v": ARCHIVE_TYPES[kind][0], "link": sheet}, len(rows), sum(1 for r in rows if r[6]["v"] is not None and r[6]["v"] <= 30), oldest])
        items.append({
            "sheet": sheet, "title": f"Archived {ARCHIVE_TYPES[kind][0].lower()}" if kind != "CfsYardEntry" else "Archived CFS and Yards",
            "subtitle": f"{len(rows)} in the archive · newest first",
            "boxes": [box("THIS TYPE", [("In the archive", len(rows), "num"),
                                        ("Deleted in the last 30 days", by_type[-1][2], "num"),
                                        ("Longest in the archive", f"{oldest} days" if oldest is not None else "—")])],
            "tables": [table("ARCHIVED", [("Name", "text"), ("Asked by", "text"), ("Reason", "text"), ("Asked on", "date"),
                                          ("Approved by", "text"), ("Deleted on", "date"), ("Days in archive", "num"), ("Admin note", "text", False)], rows)],
        })
    who = defaultdict(int)
    for _, _, r, _, _ in all_rows:
        who[clean(r.requested_by_name) or "—"] += 1
    old = sum(1 for x in all_rows if x[4] is not None and x[4] > 180)
    recent.sort(key=lambda r: r[3] or "", reverse=True)
    return {
        "period": {"start": None, "end": _iso(today), "label": f"Everything in the archive on {today.strftime('%d-%m-%Y')}"},
        "kpis": [{"label": "In the archive", "value": str(len(all_rows)), "note": f"{len(order)} types"},
                 {"label": "Deleted in 30 days", "value": str(len(recent)), "note": "recently removed"},
                 {"label": "Over 6 months old", "value": str(old), "tone": "warn" if old else None, "note": "restore or delete for good?"},
                 {"label": "Asked by", "value": str(len(who)), "note": "different people"}],
        "tables": [
            table("BY TYPE — click one to open its sheet", [("Type", "link"), ("Archived", "num"), ("Last 30 days", "num"), ("Oldest (days)", "num")],
                  by_type, total=["TOTAL", len(all_rows), len(recent), None]),
            table("DELETED IN THE LAST 30 DAYS", [("Name", "link"), ("Type", "text"), ("Asked by", "text"), ("Deleted on", "date"), ("Reason", "text")], recent),
            table("WHO ASKED FOR THE DELETIONS", [("Asked by", "text"), ("Items", "num")],
                  sorted(([k, v] for k, v in who.items()), key=lambda r: -r[1])),
        ],
        "notes": ["Lists what is in the archive now: items that were restored aren't shown. Each item shows its latest approved deletion request.",
                  "Days in archive counts from the day the deletion was approved. Items over 6 months old are marked."],
        "items": items,
    }


# ── Payment Requests ─────────────────────────────────────────────────────────

def _payment_status(m) -> tuple[str, str]:
    if m.payment_status == "rejected":
        return "Rejected", "by the colleague"
    if m.finance_status == "rejected":
        return "Rejected", "by Accounts"
    if m.finance_status == "paid":
        return "Paid", ""
    if m.finance_status == "approved":
        return "Unpaid", ""
    return "Pending", ""


PAY_TONE = {"Paid": "good", "Unpaid": "warn", "Pending": "warn", "Rejected": "bad"}


def _payments(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """The Payment Requests page: chat payment notes a colleague has decided on, a sheet per requester."""
    from approvals_report import _ist
    from routers.payment_requests import _parse_note
    from maintenance_report import _period_label
    start, end = (opts or {}).get("start"), (opts or {}).get("end")
    term = search.lower()
    msgs = (db.query(models.ChatMessage).options(load_only(
                models.ChatMessage.id, models.ChatMessage.conversation_id, models.ChatMessage.sender_id, models.ChatMessage.sender_name,
                models.ChatMessage.ciphertext, models.ChatMessage.created_at, models.ChatMessage.payment_status,
                models.ChatMessage.payment_decided_by_name, models.ChatMessage.payment_decided_at, models.ChatMessage.finance_status,
                models.ChatMessage.finance_decided_by_name, models.ChatMessage.finance_decided_at, models.ChatMessage.paid_by_name,
                models.ChatMessage.paid_at))
            .filter(models.ChatMessage.content_type == "payment", models.ChatMessage.payment_status.in_(["approved", "rejected"]),
                    models.ChatMessage.deleted_at.is_(None))
            .order_by(models.ChatMessage.created_at.desc()).all())
    proof = {i for (i,) in db.query(models.ChatMessage.id).filter(models.ChatMessage.content_type == "payment",
                                                                   models.ChatMessage.paid_proof_ciphertext.isnot(None))}
    people = defaultdict(list)
    for m in msgs:
        asked = _ist(m.created_at).date() if m.created_at else None
        if (start or end) and asked is None or start and asked < start or end and asked > end:
            continue
        amount, note = _parse_note(m)
        try:
            amount = float(amount)
        except (TypeError, ValueError):
            amount = 0.0
        who = clean(m.sender_name) or "Unknown"
        if term and term not in who.lower() and term not in note.lower():
            continue
        status, by = _payment_status(m)
        people[who].append({"m": m, "asked": asked, "amount": amount, "note": note, "status": status, "by": by})

    order = sorted(people, key=lambda p: (-sum(x["amount"] for x in people[p]), p))
    names = _sheet_names(order)
    items, by_person, waiting = [], [], []
    tot = defaultdict(float)
    cnt = defaultdict(int)
    for p, sheet in zip(order, names):
        rows, sums = [], defaultdict(float)
        for x in people[p]:
            m = x["m"]
            sums[x["status"]] += x["amount"]
            tot[x["status"]] += x["amount"]
            cnt[x["status"]] += 1
            since = _ist(m.finance_decided_at).date() if x["status"] == "Unpaid" and m.finance_decided_at else _ist(m.payment_decided_at).date() if m.payment_decided_at else x["asked"]
            wait = (today - since).days if x["status"] in ("Unpaid", "Pending") and since else None
            if wait is not None:
                waiting.append([{"v": p, "link": sheet}, x["note"], x["amount"], {"v": x["status"], "tone": "warn"}, _iso(since),
                                {"v": wait, "tone": "bad" if wait > 7 else "warn"}])
            rows.append([_iso(x["asked"]), x["note"], x["amount"], clean(m.payment_decided_by_name),
                         {"v": x["status"] + (f" ({x['by']})" if x["by"] else ""), "tone": PAY_TONE[x["status"]]},
                         clean(m.finance_decided_by_name), _iso(_ist(m.finance_decided_at).date() if m.finance_decided_at else None),
                         clean(m.paid_by_name), _iso(_ist(m.paid_at).date() if m.paid_at else None),
                         "Yes" if m.id in proof else ("No" if x["status"] == "Paid" else ""), wait])
        asked_total = sum(x["amount"] for x in people[p])
        by_person.append([{"v": p, "link": sheet}, len(rows), asked_total, sums["Paid"], sums["Unpaid"], sums["Pending"], sums["Rejected"]])
        items.append({
            "sheet": sheet, "title": p, "subtitle": f"{len(rows)} payment requests · newest first",
            "boxes": [box("REQUESTS", [("Requests", len(rows), "num"), ("Asked for (₹)", asked_total, "money"),
                                       ("Rejected (₹)", sums["Rejected"], "money")]),
                      box("WHERE THE MONEY IS", [("Paid (₹)", sums["Paid"], "money", "good" if sums["Paid"] else None),
                                                 ("Approved, not paid yet (₹)", sums["Unpaid"], "money", "warn" if sums["Unpaid"] else None),
                                                 ("Waiting for Accounts (₹)", sums["Pending"], "money", "warn" if sums["Pending"] else None)])],
            "tables": [table("PAYMENT REQUESTS", [("Asked on", "date"), ("What for", "text"), ("Amount (₹)", "money"), ("Approved by colleague", "text"),
                                                  ("Status", "text"), ("Accounts decision by", "text"), ("Decided on", "date"),
                                                  ("Paid by", "text", False), ("Paid on", "date"), ("Proof", "text", False), ("Waiting (days)", "num")],
                             rows, total=["TOTAL", f"{len(rows)} requests", asked_total, "", "", "", None, "", None, "", None])],
        })
    waiting.sort(key=lambda r: -r[5]["v"])
    asked_all = sum(tot.values())
    label = _period_label(start, end) if start or end else "All time"
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": label},
        "kpis": [{"label": "Requests", "value": str(sum(cnt.values())), "note": f"{_inr(asked_all)} asked, {len(order)} people"},
                 {"label": "Paid", "value": _inr(tot["Paid"]), "tone": "good" if tot["Paid"] else None, "note": f"{cnt['Paid']} requests"},
                 {"label": "Approved, not paid", "value": _inr(tot["Unpaid"]), "tone": "warn" if tot["Unpaid"] else None, "note": f"{cnt['Unpaid']} requests"},
                 {"label": "Waiting for Accounts", "value": _inr(tot["Pending"]), "tone": "warn" if tot["Pending"] else None, "note": f"{cnt['Pending']} requests"}],
        "tables": [
            table("BY PERSON — click a name to open their sheet",
                  [("Asked by", "link"), ("Requests", "num"), ("Asked for (₹)", "money"), ("Paid (₹)", "money"), ("Not paid yet (₹)", "money"),
                   ("Waiting for Accounts (₹)", "money"), ("Rejected (₹)", "money")],
                  by_person, total=["TOTAL", sum(r[1] for r in by_person), asked_all, tot["Paid"], tot["Unpaid"], tot["Pending"], tot["Rejected"]]),
            table("STILL WAITING — longest first", [("Asked by", "link"), ("What for", "text"), ("Amount (₹)", "money"), ("Status", "text"),
                                                    ("Waiting since", "date"), ("Days", "num")], waiting),
        ],
        "notes": ["Lists every payment note a colleague has approved or rejected in Canaan Chat, the same as the Payment Requests page, "
                  "whatever card is selected. Dates follow the day the request was made.",
                  "Unpaid = approved by Accounts, money not moved yet. Pending = approved by the colleague, waiting for Accounts. "
                  "Waiting counts from that last step. Over 7 days is marked red."],
        "items": items,
    }


# ── Staff Holidays ───────────────────────────────────────────────────────────

def _holidays(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    from approvals_report import _ist
    year = (opts or {}).get("year") or today.year
    start, end = date(year, 1, 1), date(year, 12, 31)
    hols = db.query(models.Holiday).filter(models.Holiday.date >= start, models.Holiday.date <= end).order_by(models.Holiday.date).all()
    worked = dict(db.query(models.StaffAttendance.date, func.count(models.StaffAttendance.id))
                  .filter(models.StaffAttendance.date >= start, models.StaffAttendance.date <= end, models.StaffAttendance.status == "Present")
                  .group_by(models.StaffAttendance.date).all())
    hol_days = {h.date for h in hols}
    rows = []
    for h in hols:
        sunday = h.date.weekday() == 6
        when = "Today" if h.date == today else ("Coming up" if h.date > today else "Past")
        rows.append([_iso(h.date), h.date.strftime("%A"), h.name, h.type,
                     {"v": "Falls on a Sunday", "tone": "warn"} if sunday else "",
                     {"v": when, "tone": "good" if when != "Past" else None}, worked.get(h.date, 0) if h.date <= today else None])
    months = []
    for m in range(1, 13):
        first = date(year, m, 1)
        last = (date(year + (m == 12), m % 12 + 1, 1) - timedelta(days=1))
        days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
        sundays = sum(1 for d in days if d.weekday() == 6)
        extra = [h for h in hols if h.date.month == m and h.date.weekday() != 6]
        months.append([first.strftime("%B"), len(days), sundays, len(extra), len(days) - sundays - len(extra),
                       ", ".join(f"{h.date.day} {h.name}" for h in hols if h.date.month == m)])
    events = (db.query(models.HolidayEditEvent).filter(models.HolidayEditEvent.holiday_date >= start, models.HolidayEditEvent.holiday_date <= end)
              .order_by(models.HolidayEditEvent.created_at.desc()).all())
    changes = [[_iso(_ist(e.created_at).date()) if e.created_at else None, _iso(e.holiday_date), e.name,
                {"v": e.event.replace("Holiday ", ""), "tone": "bad" if e.event == "Holiday Deleted" else None},
                clean(e.actor_name), clean(e.actor_role)] for e in events]
    names = _sheet_names(["Holidays", "Month by month", "Changes"])
    gov = sum(1 for h in hols if h.type == "Government")
    working = sum(r[4] for r in months)
    upcoming = [h for h in hols if h.date >= today]
    nxt = upcoming[0] if upcoming else None
    on_sunday = sum(1 for h in hols if h.date.weekday() == 6)
    items = [
        {"sheet": names[0], "title": f"Staff Holidays {year}", "subtitle": f"{len(hols)} holidays · Sundays are holidays automatically",
         "boxes": [box("THIS YEAR", [("Holidays", len(hols), "num"), ("  government", gov, "num"), ("  company", len(hols) - gov, "num"),
                                     ("Falling on a Sunday", on_sunday, "num", "warn" if on_sunday else None)])],
         "tables": [table("HOLIDAYS", [("Date", "date"), ("Day", "text"), ("Holiday", "text"), ("Type", "text"), ("Note", "text"),
                                       ("When", "text"), ("Staff who worked", "num")], rows)]},
        {"sheet": names[1], "title": f"Working days {year}", "subtitle": "month by month, the days staff attendance counts",
         "boxes": [], "tables": [table("MONTH BY MONTH", [("Month", "text"), ("Days", "num"), ("Sundays", "num"), ("Holidays", "num"),
                                                          ("Working days", "num"), ("Holidays this month", "text")],
                                       months, total=["TOTAL", sum(r[1] for r in months), sum(r[2] for r in months),
                                                      sum(r[3] for r in months), working, ""])]},
        {"sheet": names[2], "title": f"Changes to {year} holidays", "subtitle": f"{len(changes)} changes · newest first",
         "boxes": [], "tables": [table("WHO ADDED, CHANGED OR REMOVED A HOLIDAY", [("When", "date"), ("Holiday date", "date"), ("Holiday", "text"),
                                                                                  ("Action", "text"), ("By", "text"), ("Role", "text")], changes)]},
    ]
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": f"Year {year}"},
        "kpis": [{"label": "Holidays", "value": str(len(hols)), "note": f"{gov} government, {len(hols) - gov} company"},
                 {"label": "Working days", "value": str(working), "note": "after Sundays and holidays"},
                 {"label": "Next holiday", "value": nxt.date.strftime("%d %b") if nxt else "—", "tone": "good" if nxt else None,
                  "note": nxt.name if nxt else ("none left this year" if year >= today.year else "")},
                 {"label": "Still to come", "value": str(len(upcoming)), "note": "this year" if year == today.year else ""}],
        "tables": [
            table("HOLIDAYS — click to open the list", [("Date", "date"), ("Day", "text"), ("Holiday", "link"), ("Type", "text")],
                  [[r[0], r[1], {"v": r[2], "link": names[0]}, r[3]] for r in rows]),
            table("WORKING DAYS BY MONTH", [("Month", "text"), ("Working days", "num"), ("Holidays", "num")],
                  [[r[0], r[4], r[3]] for r in months], total=["TOTAL", working, sum(r[3] for r in months)]),
        ],
        "notes": ["Sundays are holidays automatically and aren't stored. A holiday on a Sunday doesn't take away a working day.",
                  "Working days are the days staff attendance counts: every day but Sundays and the holidays listed.",
                  "Staff who worked = staff marked Present on that holiday."],
        "items": items,
    }


KINDS = {"fleet": (_fleet, "Fleet", "Our Fleet"), "drivers": (_drivers, "Drivers", "Our Drivers"),
         "customers": (_customers, "Customers", "Our Customers"), "vendors": (_vendors, "Vendors", "Our Vendors"),
         "staff": (_staff, "Staff", "Our Staff"), "archive": (_archive, "Archive", "Archive"),
         "payments": (_payments, "Payment Requests", "Payment Requests"), "holidays": (_holidays, "Holidays", "Staff Holidays")}
# Who may pull each report — the same people who can open the page. Not listed: anyone signed in.
# The same roles as each Resource Hub page (lib/nav-config.ts ROLE_HREFS).
_MANAGERS = ("Admin", "Commercial Manager", "Assistant Commercial Manager")
KIND_ROLES = {"staff": ("Admin",), "archive": ("Admin",), "holidays": ("Admin",), "payments": ("Admin", "Accounts"),
              "drivers": _MANAGERS, "fleet": _MANAGERS, "customers": _MANAGERS + ("Accounts",),
              "vendors": ("Admin", "Maintenance")}
WITH_OPTS = ("staff", "archive", "payments", "holidays")


def collect(db: Session, kind: str, search: str = "", role: str = "", **opts) -> dict:
    """opts: start / end (payments), year (holidays), rtype (archive: one record type)."""
    today = datetime.now(IST).date()
    fn, short, title = KINDS[kind]
    term = (search or "").strip()
    if kind in WITH_OPTS:
        rep = fn(db, term, today, role, opts)
    elif kind in ("customers", "vendors"):
        rep = fn(db, term, today, role)
    else:
        rep = fn(db, term, today)
    start, end = window(today)
    rep.setdefault("period", {"start": _iso(start), "end": _iso(end),
                              "label": f"Last 12 months ({start.strftime('%d-%m-%Y')} to {end.strftime('%d-%m-%Y')})"})
    rep.update({"kind": kind, "title": title, "short": short,
                "generated_at": datetime.now(IST).strftime("%d-%m-%Y %I:%M %p"), "search": search or ""})
    return rep


# ── Excel ────────────────────────────────────────────────────────────────────

FMT = {"money": MONEY, "km": KM, "date": DATE, "num": None, "text": None, "link": None}


def _cell(s: Sheet, r: int, c: int, kind: str, value):
    tone = value.get("tone") if isinstance(value, dict) else None
    link = value.get("link") if isinstance(value, dict) else None
    v = value.get("v") if isinstance(value, dict) else value
    if kind == "date" and isinstance(v, str):
        try:
            v = _d(v)
        except ValueError:
            pass          # words like "Never" stay as they are
    cell = s.put(r, c, v if v is not None else "", fmt=FMT.get(kind))
    if link:
        _link(cell, link)
    if tone:
        cell.font = Font(bold=True, color=TONE_FONT[tone])
        cell.fill = _fill(TONE_FILL[tone])
    return cell


def _table(s: Sheet, r: int, t: dict) -> int:
    cols = t["columns"]
    _band(s, r, t["title"], max(len(cols), 4))
    s.header(r + 1, [c["label"] for c in cols])
    r += 2
    first = r
    for row in t["rows"]:
        for i, (col, v) in enumerate(zip(cols, row)):
            _cell(s, r, 1 + i, col["kind"], v)
        r += 1
    if not t["rows"]:
        s.put(r, 1, "Nothing to show.", color="6B7280")
        r += 1
    elif t.get("total"):
        r += 1
        for c in range(1, len(cols) + 1):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        for i, (col, v) in enumerate(zip(cols, t["total"])):
            if v is None or v == "":
                continue
            if col["kind"] in ("money", "km", "num") and isinstance(v, (int, float)) and i > 0:
                L = get_column_letter(i + 1)
                s.put(r, i + 1, round(v, 2), formula=f"=SUM({L}{first}:{L}{r - 2})", fmt=FMT.get(col["kind"]), bold=True, fill=TOTAL_FILL)
            else:
                s.put(r, i + 1, v, bold=True, fill=TOTAL_FILL)
        r += 1
    return r + 1


def _boxes(s: Sheet, r: int, boxes: list) -> int:
    for b in boxes:
        _band(s, r, b["title"], 2)
        r += 1
        for p in b["pairs"]:
            s.put(r, 1, p["label"])
            _cell(s, r, 2, p["kind"], {"v": p["value"], "tone": p["tone"]} if p["tone"] else p["value"])
            r += 1
        r += 1
    return r


def build(db: Session, kind: str, search: str = "", role: str = "", **opts):
    """(xlsx bytes, filename, preview sheets, report figures)."""
    rep = collect(db, kind, search, role, **opts)
    wb = Workbook()
    wb.remove(wb.active)
    s = Sheet(wb, "Summary")
    r = _title(s, 1, f"{rep['title']} Report", f"{rep['period']['label']} · downloaded {rep['generated_at']}"
               + (f' · search "{rep["search"]}"' if rep["search"] else ""))
    _band(s, r, "AT A GLANCE", 2)
    r += 1
    for k in rep["kpis"]:
        s.put(r, 1, k["label"])
        c = s.put(r, 2, k["value"], bold=True)
        if k.get("tone"):
            c.font = Font(bold=True, color=TONE_FONT[k["tone"]])
        if k.get("note"):
            s.put(r, 3, k["note"], color="6B7280")
        r += 1
    r += 1
    for t in rep["tables"]:
        r = _table(s, r, t)
    _band(s, r, "WORTH KNOWING", 2)
    for i, n in enumerate(rep["notes"], 1):
        s.put(r + i, 1, f"{i}. {n}")
    s.widths([30, 18, 22, 14, 13, 14, 16, 14, 16])
    s.ws.sheet_view.showGridLines = False
    sheets = [("Summary", s)]
    for it in rep["items"]:
        sh = Sheet(wb, it["sheet"])
        _link(sh.put(1, 6, "← Summary"), "Summary")
        r = _title(sh, 1, it["title"], it["subtitle"])
        r = _boxes(sh, r, it["boxes"])
        for t in it["tables"]:
            r = _table(sh, r, t)
        sh.widths([32, 26, 14, 14, 12, 22, 14, 12])
        sh.ws.sheet_view.showGridLines = False
        sheets.append((it["sheet"], sh))
    buf = BytesIO()
    wb.save(buf)
    stamp = datetime.now(IST).strftime("%d-%m-%Y")
    filename = f"{rep['title'].replace(' ', '_')}_{stamp}.xlsx"
    return buf.getvalue(), filename, [sh.preview(name) for name, sh in sheets], rep


# The Finance Hub reports (Driver Compensation, EMI, …) share this shape and
# register their kinds here (finance_report.py).
import finance_report  # noqa: E402,F401
import trip_pages_report  # noqa: E402,F401  (the Trip and Driver Management pages)
import profit_reports  # noqa: E402,F401  (Trip Summary, Customer Profitability, Running Cost)
import tyre_reports  # noqa: E402,F401  (the five Tyre Records pages)
import record_reports  # noqa: E402,F401  (Auditor Pages, AdBlue History)
