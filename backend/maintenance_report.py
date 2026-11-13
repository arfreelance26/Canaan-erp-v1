"""Truck Maintenance → View: the truck-wise maintenance report (Excel + PDF).

collect() gathers the figures once; build() writes the workbook from them and
the frontend draws the PDF from the same figures (lib/maintenance-report-pdf.ts
via GET /exports/maintenance-report/preview), so the two always agree.

Sheets
  Summary      the period's totals, top trucks, by type, top vendors, what's
               not counted, worth knowing, what's in this file
  All Trucks   one row per truck — each name links to its own sheet
  <one sheet per truck with maintenance in the period>, named after its
               registration: details, totals, service status, reminders,
               every repair (one row each) with a total, by type, waiting jobs
  By Vendor    each vendor / individual: jobs, trucks, cost, latest job

What counts (same as everywhere else in the app): approved maintenance
records only, dated by the day the work started. Scheduled jobs still waiting
for a cost and records waiting for approval are listed, never added in.
A sold truck has no records after its sale.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy.orm import Session, selectinload

import models
from pl_export import DATE, IST, KM, MONEY, NAVY, Sheet, _fill

REMIND_SOON_KM = 500          # maintenance_reminders.REMIND_SOON_KM
SHEET_BAD = re.compile(r"[\[\]:*?/\\']")
LIGHT = "DCE6F2"
TOTAL_FILL = "E4E9F5"
WARN = "FCE4D6"


# ── Gather ───────────────────────────────────────────────────────────────────

def _f(v) -> float:
    return float(v or 0)


def _get(line, key):
    return line.get(key) if isinstance(line, dict) else getattr(line, key, None)


def _iso(d) -> str | None:
    if d is None:
        return None
    if isinstance(d, datetime):
        d = d.date()
    return d.isoformat()


def _day(v) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _in(d: date | None, start: date | None, end: date | None) -> bool:
    return d is not None and (start is None or d >= start) and (end is None or d <= end)


def _sheet_names(regs: list[str]) -> list[str]:
    """Valid, unique Excel sheet names (31 chars, none of []:*?/\\')."""
    # The fixed sheets every report uses; a truck / person sheet never takes their name.
    taken = {"summary", "all trucks", "by vendor", "by station", "by customer", "register"}
    out = []
    for reg in regs:
        base = SHEET_BAD.sub("-", (reg or "Truck").strip())[:31] or "Truck"
        name, n = base, 2
        while name.lower() in taken:
            suffix = f" ({n})"
            name = base[:31 - len(suffix)] + suffix
            n += 1
        taken.add(name.lower())
        out.append(name)
    return out


def _period_label(start: date | None, end: date | None) -> str:
    f = lambda d: d.strftime("%d-%m-%Y")  # noqa: E731
    if start and end:
        return f"{f(start)} to {f(end)}"
    if start:
        return f"From {f(start)}"
    if end:
        return f"Up to {f(end)}"
    return "All time"


def collect(db: Session, start: date | None, end: date | None, search: str = "", truck_id: int | None = None) -> dict:
    from routers.maintenance import maintenance_cost_summary_all

    today = datetime.now(IST).date()
    as_of = min(end, today) if end else today       # "days since" counts to here
    term = (search or "").strip().lower()

    def matches(t: models.Truck) -> bool:
        return not term or term in (t.registration_number or "").lower() or term in (t.truck_id or "").lower()

    # Every record of the trucks in play (all dates — last service and
    # reminders look beyond the period); the period's ones are picked below.
    rq = db.query(models.MaintenanceRecord).options(selectinload(models.MaintenanceRecord.items))
    if truck_id:
        rq = rq.filter(models.MaintenanceRecord.truck_id == truck_id)
    all_records = rq.order_by(models.MaintenanceRecord.date, models.MaintenanceRecord.id).all()
    by_truck: dict[int, list] = defaultdict(list)
    for r in all_records:
        by_truck[r.truck_id].append(r)

    tq = db.query(models.Truck)
    if truck_id:
        tq = tq.filter(models.Truck.id == truck_id)
    trucks = []
    for t in tq.order_by(models.Truck.truck_id).all():
        if not matches(t):
            continue
        in_period = [r for r in by_truck.get(t.id, []) if _in(r.date, start, end)]
        # On the page: trucks still on the fleet. A sold / archived truck
        # appears only when it has maintenance in the period.
        if t.deleted_at is not None and not in_period and not truck_id:
            continue
        trucks.append(t)

    ids = {t.id for t in trucks}
    proof_counts: dict[int, int] = {}
    rec_ids = [r.id for r in all_records if r.truck_id in ids and _in(r.date, start, end)]
    if rec_ids:
        from sqlalchemy import func
        proof_counts = dict(
            db.query(models.MaintenanceProof.record_id, func.count(models.MaintenanceProof.id))
            .filter(models.MaintenanceProof.record_id.in_(rec_ids))
            .group_by(models.MaintenanceProof.record_id)
        )

    normal = maintenance_cost_summary_all(db, as_of=end) if trucks else {}

    # Waiting: scheduled jobs (no cost yet) and records waiting for approval.
    waiting_by_truck: dict[int, list] = defaultdict(list)
    for req in db.query(models.MaintenanceRequest).filter(
            models.MaintenanceRequest.status.in_(("Scheduled", "Pending")),
            models.MaintenanceRequest.truck_id.in_(ids or {0})).all():
        p = req.payload or {}
        d = _day(p.get("date"))
        if not _in(d, start, end) and not (d is None and start is None and end is None):
            continue
        waiting_by_truck[req.truck_id].append({
            "status": "Waiting for its cost" if req.status == "Scheduled" else "Waiting for approval",
            "date": _iso(d),
            "maintenance_type": p.get("maintenance_type") or "",
            "repair_type": p.get("repair_type") or "",
            "cost": _f(p.get("cost")),
            "submitted_by": req.submitted_by_name,
            "source": req.source,
        })

    out_trucks = []
    vendor: dict[str, dict] = {}
    type_tot: dict[str, dict] = {}
    for t, sheet in zip(trucks, _sheet_names([t.registration_number for t in trucks])):
        recs = by_truck.get(t.id, [])
        sold = t.sold_date if t.disposal_type == "Sold" else None
        period = [r for r in recs if _in(r.date, start, end) and (sold is None or r.date <= sold)]
        rows, by_type = [], {}
        for r in period:
            lines = r.repair_lines
            for line in lines:
                cost = _f(_get(line, "cost"))
                by = _get(line, "maintenance_by") or ""
                rows.append({
                    "date": _iso(r.date), "end_date": _iso(r.maintenance_end_date),
                    "maintenance_type": r.maintenance_type or "", "repair_type": _get(line, "repair_type") or "",
                    "location": _get(line, "maintenance_location") or "", "by": by,
                    "by_type": _get(line, "maintenance_by_type") or "",
                    "invoice_number": _get(line, "invoice_number") or "", "invoice_date": _iso(_get(line, "invoice_date")),
                    "odometer": int(r.odometer or 0), "cost": cost, "record_total": _f(r.cost),
                    "entered_by": r.entered_by_name or "",
                    "source": "Maintenance form" if (r.source or "") == "Web" else (r.source or ""),
                    "proofs": int(proof_counts.get(r.id, 0)), "remarks": r.description or "",
                    "record_id": r.id,
                })
                bt = by_type.setdefault(r.maintenance_type or "Other", {"type": r.maintenance_type or "Other", "jobs": 0, "cost": 0.0})
                bt["cost"] += cost
                tt = type_tot.setdefault(r.maintenance_type or "Other", {"type": r.maintenance_type or "Other", "records": set(), "repairs": 0, "cost": 0.0})
                tt["repairs"] += 1
                tt["cost"] += cost
                tt["records"].add(r.id)
                key = by.strip() or "(not recorded)"
                v = vendor.setdefault(key.lower(), {"name": key, "kind": _get(line, "maintenance_by_type") or "", "jobs": 0,
                                                    "trucks": set(), "cost": 0.0, "last_date": None})
                v["jobs"] += 1
                v["cost"] += cost
                v["trucks"].add(t.registration_number)
                if v["last_date"] is None or r.date > v["last_date"]:
                    v["last_date"] = r.date
            by_type_rec = by_type.setdefault(r.maintenance_type or "Other", {"type": r.maintenance_type or "Other", "jobs": 0, "cost": 0.0})
            by_type_rec["jobs"] += 1
        cost = sum(_f(r.cost) for r in period)

        upto = [r for r in recs if end is None or r.date <= end]
        last = upto[-1] if upto else None
        current_odo = int(_f(t.odometer))
        # Open reminders: a reminder isn't open once the same type was done again after it.
        reminders = []
        for r in recs:
            if not r.remind_at_odometer:
                continue
            again = next((x for x in recs if x.date > r.date and (x.maintenance_type or "") == (r.maintenance_type or "")), None)
            left = int(r.remind_at_odometer) - current_odo
            reminders.append({
                "maintenance_type": r.maintenance_type or "", "set_on": _iso(r.date), "remind_at": int(r.remind_at_odometer),
                "km_left": left,
                "state": "Done again" if again else ("Overdue" if left <= 0 else "Due soon" if left <= REMIND_SOON_KM else "Upcoming"),
                "done_again_on": _iso(again.date) if again else None,
            })
        open_rem = sorted((x for x in reminders if x["state"] != "Done again"), key=lambda x: x["km_left"])
        repair_count: dict[str, int] = defaultdict(int)
        for row in rows:
            repair_count[row["repair_type"] or row["maintenance_type"]] += 1
        top_repair = max(repair_count.items(), key=lambda kv: kv[1])[0] if repair_count else ""
        n = normal.get(t.id) or {}
        status = "Active"
        if t.disposal_type == "Sold":
            status = f"Sold {t.sold_date.strftime('%d-%m-%Y')}" if t.sold_date else "Sold"
        elif t.deleted_at is not None:
            status = "Archived"
        out_trucks.append({
            "id": t.id, "truck_id": t.truck_id, "registration": t.registration_number, "sheet": sheet,
            "truck_type": t.truck_type or "", "tyre_layout": t.tyre_layout or "",
            "make": " ".join(x for x in (t.manufacturer, t.model_name) if x and str(x).strip().lower() not in ("nan", "none", "null")),
            "status": status,
            "odometer": current_odo,
            "records": len(period), "repairs": len(rows), "cost": round(cost, 2),
            "normal_monthly": round(_f(n.get("monthly")), 2) if n else None,
            "last_service": {"date": _iso(last.date), "odometer": int(last.odometer or 0), "type": last.maintenance_type or ""} if last else None,
            "days_since": (as_of - last.date).days if last else None,
            "next_reminder": open_rem[0] if open_rem else None,
            "reminders": reminders,
            "top_repair": top_repair,
            "by_type": sorted(by_type.values(), key=lambda x: -x["cost"]),
            "rows": rows,
            "waiting": waiting_by_truck.get(t.id, []),
        })

    total_cost = round(sum(x["cost"] for x in out_trucks), 2)
    serviced = [x for x in out_trucks if x["records"]]
    waiting = [w for x in out_trucks for w in x["waiting"]]
    by_type = sorted(
        ({"type": v["type"], "records": len(v["records"]), "repairs": v["repairs"], "cost": round(v["cost"], 2),
          "share": round(v["cost"] / total_cost * 100, 1) if total_cost else 0.0} for v in type_tot.values()),
        key=lambda x: -x["cost"])
    vendors = sorted(
        ({"name": v["name"], "kind": v["kind"], "jobs": v["jobs"], "trucks": len(v["trucks"]), "cost": round(v["cost"], 2),
          "last_date": _iso(v["last_date"])} for v in vendor.values()),
        key=lambda x: -x["cost"])
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _period_label(start, end)},
        "generated_at": datetime.now(IST).strftime("%d-%m-%Y %I:%M %p"),
        "as_of": as_of.isoformat(),
        "search": search or "",
        "single_truck": bool(truck_id),
        "totals": {
            "trucks": len(out_trucks), "serviced": len(serviced), "idle": len(out_trucks) - len(serviced),
            "records": sum(x["records"] for x in out_trucks), "repairs": sum(x["repairs"] for x in out_trucks),
            "cost": total_cost,
            "avg_per_serviced": round(total_cost / len(serviced), 2) if serviced else 0.0,
            "overdue": sum(1 for x in out_trucks if x["next_reminder"] and x["next_reminder"]["state"] == "Overdue"),
            "due_soon": sum(1 for x in out_trucks if x["next_reminder"] and x["next_reminder"]["state"] == "Due soon"),
            "scheduled": sum(1 for w in waiting if w["status"].endswith("cost")),
            "scheduled_cost": round(sum(w["cost"] for w in waiting if w["status"].endswith("cost")), 2),
            "pending": sum(1 for w in waiting if w["status"].endswith("approval")),
            "pending_cost": round(sum(w["cost"] for w in waiting if w["status"].endswith("approval")), 2),
            "period_open": bool(end and end >= today and (start is None or start <= today)),
        },
        "top_trucks": sorted(serviced, key=lambda x: -x["cost"])[:5],
        "by_type": by_type,
        "vendors": vendors,
        "trucks": out_trucks,
    }


# ── Excel ────────────────────────────────────────────────────────────────────

def _d(s: str | None):
    return date.fromisoformat(s) if s else None


def _link(cell, sheet: str, text: str | None = None):
    """A jump to another sheet of this workbook (not an external link)."""
    from openpyxl.worksheet.hyperlink import Hyperlink
    cell.hyperlink = Hyperlink(ref=cell.coordinate, location=f"'{sheet}'!A1", display=str(text if text is not None else cell.value))
    cell.font = Font(color="0563C1", underline="single", bold=cell.font.bold if cell.font else False)
    if text is not None:
        cell.value = text


def _reminder_text(rem: dict | None) -> str:
    if not rem:
        return ""
    if rem["state"] == "Overdue":
        return f"Overdue by {abs(rem['km_left']):,} km — {rem['maintenance_type']}"
    return f"{rem['km_left']:,} km left — {rem['maintenance_type']}" + (" (due soon)" if rem["state"] == "Due soon" else "")


def _title(s: Sheet, r: int, text: str, sub: str | None = None) -> int:
    s.put(r, 1, text, bold=True, size=14, color=NAVY)
    if sub:
        s.put(r + 1, 1, sub, color="6B7280")
        return r + 3
    return r + 2


def _band(s: Sheet, r: int, text: str, cols: int = 6):
    for c in range(1, cols + 1):
        s.ws.cell(row=r, column=c).fill = _fill(NAVY)
    s.put(r, 1, text, bold=True, color="FFFFFF")


def _pairs(s: Sheet, r: int, items: list[tuple[str, object, str | None]]) -> int:
    for label, value, fmt in items:
        s.put(r, 1, label)
        s.put(r, 2, value, fmt=fmt, bold=True)
        r += 1
    return r


def _summary(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "Summary")
    t = rep["totals"]
    sub = f"{rep['period']['label']} · downloaded {rep['generated_at']}"
    if rep["search"]:
        sub += f' · search "{rep["search"]}" (only matching trucks)'
    r = _title(s, 1, "Truck Maintenance Report" + (f" — {rep['trucks'][0]['registration']}" if rep["single_truck"] and rep["trucks"] else ""), sub)

    _band(s, r, "THE PERIOD AT A GLANCE")
    r = _pairs(s, r + 1, [
        ("Trucks in this report", t["trucks"], None),
        ("Trucks with maintenance", t["serviced"], None),
        ("Trucks with no maintenance", t["idle"], None),
        ("Maintenance records", t["records"], None),
        ("Repairs (one record can hold several)", t["repairs"], None),
        ("Total maintenance cost (₹)", t["cost"], MONEY),
        ("Average per truck with maintenance (₹)", t["avg_per_serviced"], MONEY),
        ("Reminders overdue", t["overdue"], None),
        ("Reminders due within 500 km", t["due_soon"], None),
    ])

    r += 1
    _band(s, r, "TOP 5 COSTLIEST TRUCKS")
    s.header(r + 1, ["Truck", "Records", "Repairs", "Cost (₹)", "Share of total"])
    r += 2
    for x in rep["top_trucks"]:
        _link(s.put(r, 1, x["registration"]), x["sheet"])
        s.put(r, 2, x["records"])
        s.put(r, 3, x["repairs"])
        s.put(r, 4, x["cost"], fmt=MONEY)
        s.put(r, 5, round(x["cost"] / t["cost"] * 100, 1) if t["cost"] else 0, fmt='0.0"%"')
        r += 1
    if not rep["top_trucks"]:
        s.put(r, 1, "No maintenance in this period.", color="6B7280")
        r += 1

    r += 1
    _band(s, r, "COST BY MAINTENANCE TYPE")
    s.header(r + 1, ["Maintenance type", "Records", "Repairs", "Cost (₹)", "Share of total", ""])
    r += 2
    for x in rep["by_type"]:
        s.put(r, 1, x["type"])
        s.put(r, 2, x["records"])
        s.put(r, 3, x["repairs"])
        s.put(r, 4, x["cost"], fmt=MONEY)
        s.put(r, 5, x["share"], fmt='0.0"%"')
        r += 1

    r += 1
    _band(s, r, "TOP VENDORS")
    s.header(r + 1, ["Vendor / person", "Kind", "Repairs", "Trucks", "Cost (₹)", "Latest job"])
    r += 2
    for x in rep["vendors"][:5]:
        s.put(r, 1, x["name"])
        s.put(r, 2, x["kind"])
        s.put(r, 3, x["jobs"])
        s.put(r, 4, x["trucks"])
        s.put(r, 5, x["cost"], fmt=MONEY)
        s.put(r, 6, _d(x["last_date"]), fmt=DATE)
        r += 1

    r += 1
    _band(s, r, "NOT COUNTED IN THE TOTALS")
    r = _pairs(s, r + 1, [
        ("Scheduled jobs still waiting for their cost", t["scheduled"], None),
        ("  their costs entered so far (₹)", t["scheduled_cost"], MONEY),
        ("Records waiting for approval", t["pending"], None),
        ("  their cost (₹)", t["pending_cost"], MONEY),
    ])
    s.put(r, 1, "Each truck's sheet lists them under \"Waiting\". They're counted once approved, on the day the work was done.", color="6B7280")
    r += 2

    _band(s, r, "WORTH KNOWING")
    notes = [
        "Only approved maintenance bills are counted. A bill is dated by the day the work started, so approving it later still puts it in the right month.",
        "Normal monthly maintenance is the truck's average over the 12 months up to the end of the period — compare it with this period to spot an unusual month.",
        "A reminder (\"Notify me when this is due again\") stays open until the same maintenance type is recorded again; \"Overdue\" means the truck's odometer has passed it.",
        "A sold truck appears only if it had maintenance in the period, and nothing after its sale date is counted.",
    ]
    if t["period_open"]:
        notes.insert(0, "The period isn't over yet — bills for the rest of it may still come in.")
    for i, n in enumerate(notes, 1):
        s.put(r + i, 1, f"{i}. {n}", wrap=False)
    r += len(notes) + 2

    _band(s, r, "WHAT'S IN THIS FILE")
    guide = [("Summary", "this page"),
             ("All Trucks", "one row per truck — click a truck to open its sheet")]
    if rep["trucks"]:
        guide.append(("One sheet per truck", "named after the registration: totals, service status, reminders, every repair, by type, waiting jobs"))
    guide.append(("By Vendor", "every vendor or person who did the work"))
    for i, (a, b) in enumerate(guide, 1):
        s.put(r + i, 1, a, bold=True)
        s.put(r + i, 2, b)
    s.widths([46, 22, 14, 16, 18, 16])
    return s


def _all_trucks(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "All Trucks")
    r = _title(s, 1, "All Trucks", f"{rep['period']['label']} · click a truck to open its sheet")
    heads = ["Truck", "Truck ID", "Status", "Records", "Repairs", "Cost (₹)", "Normal / month (₹)", "Last service", f"Days since (to {_d(rep['as_of']).strftime('%d-%m-%Y')})", "Next reminder", "Waiting jobs"]
    s.header(r, heads)
    first = r + 1
    r += 1
    for x in rep["trucks"]:
        c = s.put(r, 1, x["registration"])
        if x["records"]:
            _link(c, x["sheet"])
        s.put(r, 2, x["truck_id"])
        s.put(r, 3, x["status"])
        s.put(r, 4, x["records"] if x["records"] else "No maintenance")
        s.put(r, 5, x["repairs"])
        s.put(r, 6, x["cost"], fmt=MONEY)
        s.put(r, 7, x["normal_monthly"] if x["normal_monthly"] is not None else "—", fmt=MONEY)
        s.put(r, 8, _d(x["last_service"]["date"]) if x["last_service"] else "Never", fmt=DATE)
        s.put(r, 9, x["days_since"] if x["days_since"] is not None else "")
        rem = x["next_reminder"]
        cell = s.put(r, 10, _reminder_text(rem))
        if rem and rem["state"] == "Overdue":
            cell.font = Font(bold=True, color="C00000")
            cell.fill = _fill(WARN)
        s.put(r, 11, len(x["waiting"]) or "")
        r += 1
    if rep["trucks"]:
        r += 1
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        for c in range(2, 12):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        s.put(r, 4, sum(x["records"] for x in rep["trucks"]), bold=True, fill=TOTAL_FILL)
        s.put(r, 5, sum(x["repairs"] for x in rep["trucks"]), bold=True, fill=TOTAL_FILL)
        s.put(r, 6, rep["totals"]["cost"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
        s.ws.auto_filter.ref = f"A{first - 1}:K{first + len(rep['trucks']) - 1}"
    s.ws.freeze_panes = s.ws.cell(row=first, column=2)
    s.widths([16, 12, 16, 15, 9, 15, 16, 13, 12, 40, 12])
    return s


def _truck_sheet(wb: Workbook, x: dict, rep: dict) -> Sheet:
    s = Sheet(wb, x["sheet"])
    back = s.put(1, 14, "← All Trucks")
    _link(back, "All Trucks")
    r = _title(s, 1, f"{x['registration']} — maintenance", f"{x['truck_id']} · {rep['period']['label']}")

    _band(s, r, "TRUCK", 4)
    r = _pairs(s, r + 1, [
        ("Registration", x["registration"], None), ("Truck ID", x["truck_id"], None),
        ("Make / model", x["make"], None), ("Type · tyre layout", f"{x['truck_type']} · {x['tyre_layout']}", None),
        ("Status", x["status"], None), ("Current odometer (km)", x["odometer"], KM),
    ])
    r += 1
    _band(s, r, "THIS PERIOD", 4)
    r = _pairs(s, r + 1, [
        ("Maintenance records", x["records"], None), ("Repairs", x["repairs"], None),
        ("Total cost (₹)", x["cost"], MONEY),
        ("Normal maintenance a month (₹, 12-month average)", x["normal_monthly"] if x["normal_monthly"] is not None else "—", MONEY),
        ("Most frequent repair", x["top_repair"] or "—", None),
    ])
    r += 1
    _band(s, r, "SERVICE STATUS", 4)
    ls = x["last_service"]
    r = _pairs(s, r + 1, [
        ("Last service", _d(ls["date"]) if ls else "Never", DATE),
        ("  at odometer (km)", (ls["odometer"] or "not recorded") if ls else "", KM),
        ("  type", ls["type"] if ls else "", None),
        (f"Days since (to {_d(rep['as_of']).strftime('%d-%m-%Y')})", x["days_since"] if x["days_since"] is not None else "", None),
        ("Next reminder", _reminder_text(x["next_reminder"]) or "None set", None),
    ])
    if x["next_reminder"] and x["next_reminder"]["state"] == "Overdue":
        c = s.ws.cell(row=r - 1, column=2)
        c.font = Font(bold=True, color="C00000")
        c.fill = _fill(WARN)

    if x["reminders"]:
        r += 1
        _band(s, r, "REMINDERS", 6)
        s.header(r + 1, ["Maintenance type", "Set on", "Remind at (km)", "Km left", "State", "Done again on"])
        r += 2
        for rem in x["reminders"]:
            s.put(r, 1, rem["maintenance_type"])
            s.put(r, 2, _d(rem["set_on"]), fmt=DATE)
            s.put(r, 3, rem["remind_at"], fmt=KM)
            s.put(r, 4, rem["km_left"], fmt=KM)
            c = s.put(r, 5, rem["state"])
            if rem["state"] == "Overdue":
                c.font = Font(bold=True, color="C00000")
            s.put(r, 6, _d(rem["done_again_on"]), fmt=DATE)
            r += 1

    r += 1
    _band(s, r, "REPAIRS IN THIS PERIOD", 15)
    heads = ["Start date", "End date", "Maintenance type", "Repair", "Location", "Done by", "Vendor / person",
             "Invoice no.", "Invoice date", "Odometer (km)", "Repair cost (₹)", "Record total (₹)", "Entered by",
             "Source", "Proof files"]
    s.header(r + 1, heads)
    r += 2
    first = r
    for row in x["rows"]:
        s.put(r, 1, _d(row["date"]), fmt=DATE)
        s.put(r, 2, _d(row["end_date"]), fmt=DATE)
        s.put(r, 3, row["maintenance_type"])
        s.put(r, 4, row["repair_type"])
        s.put(r, 5, row["location"])
        s.put(r, 6, row["by_type"])
        s.put(r, 7, row["by"])
        s.put(r, 8, row["invoice_number"])
        s.put(r, 9, _d(row["invoice_date"]), fmt=DATE)
        s.put(r, 10, row["odometer"] or None, fmt=KM)
        s.put(r, 11, row["cost"], fmt=MONEY)
        s.put(r, 12, row["record_total"], fmt=MONEY)
        s.put(r, 13, row["entered_by"])
        s.put(r, 14, row["source"])
        s.put(r, 15, row["proofs"])
        r += 1
    if x["rows"]:
        r += 1
        for c in range(1, 16):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        s.put(r, 11, x["cost"], formula=f"=SUM(K{first}:K{r - 2})", fmt=MONEY, bold=True, fill=TOTAL_FILL)
        s.values[(r, 11)] = x["cost"]
        s.grid[r][11] = f"{x['cost']:,.2f}"
    else:
        s.put(r, 1, "No maintenance in this period.", color="6B7280")

    r += 2
    _band(s, r, "BY MAINTENANCE TYPE", 4)
    s.header(r + 1, ["Maintenance type", "Records", "Cost (₹)", "Share"])
    r += 2
    for bt in x["by_type"]:
        s.put(r, 1, bt["type"])
        s.put(r, 2, bt["jobs"])
        s.put(r, 3, round(bt["cost"], 2), fmt=MONEY)
        s.put(r, 4, round(bt["cost"] / x["cost"] * 100, 1) if x["cost"] else 0, fmt='0.0"%"')
        r += 1

    r += 1
    _band(s, r, "WAITING — NOT COUNTED ABOVE", 6)
    if x["waiting"]:
        s.header(r + 1, ["Status", "Date", "Maintenance type", "Repair", "Cost so far (₹)", "Submitted by"])
        r += 2
        for w in x["waiting"]:
            s.put(r, 1, w["status"])
            s.put(r, 2, _d(w["date"]), fmt=DATE)
            s.put(r, 3, w["maintenance_type"])
            s.put(r, 4, w["repair_type"])
            s.put(r, 5, w["cost"], fmt=MONEY)
            s.put(r, 6, w["submitted_by"])
            r += 1
    else:
        s.put(r + 1, 1, "Nothing waiting.", color="6B7280")
    s.widths([24, 18, 22, 22, 16, 12, 22, 14, 13, 13, 15, 15, 16, 14, 11])
    return s


def _vendors(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "By Vendor")
    r = _title(s, 1, "By Vendor", f"{rep['period']['label']} · every vendor or person who did the work")
    s.header(r, ["Vendor / person", "Kind", "Repairs", "Trucks", "Cost (₹)", "Share", "Latest job"])
    r += 1
    total = rep["totals"]["cost"]
    for v in rep["vendors"]:
        s.put(r, 1, v["name"])
        s.put(r, 2, v["kind"])
        s.put(r, 3, v["jobs"])
        s.put(r, 4, v["trucks"])
        s.put(r, 5, v["cost"], fmt=MONEY)
        s.put(r, 6, round(v["cost"] / total * 100, 1) if total else 0, fmt='0.0"%"')
        s.put(r, 7, _d(v["last_date"]), fmt=DATE)
        r += 1
    if rep["vendors"]:
        r += 1
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        s.put(r, 3, sum(v["jobs"] for v in rep["vendors"]), bold=True, fill=TOTAL_FILL)
        s.put(r, 5, total, fmt=MONEY, bold=True, fill=TOTAL_FILL)
    else:
        s.put(r, 1, "No maintenance in this period.", color="6B7280")
    s.widths([34, 12, 10, 10, 16, 10, 14])
    return s


def filename_for(rep: dict) -> str:
    p = rep["period"]
    f = lambda s: date.fromisoformat(s).strftime("%d-%m-%Y")  # noqa: E731
    span = f"_{f(p['start'])}_to_{f(p['end'])}" if p["start"] and p["end"] else (
        f"_from_{f(p['start'])}" if p["start"] else f"_to_{f(p['end'])}" if p["end"] else "_all_time")
    who = f"_{SHEET_BAD.sub('-', rep['trucks'][0]['registration'])}" if rep["single_truck"] and rep["trucks"] else ""
    return f"Truck_Maintenance{who}{span}.xlsx"


def build(db: Session, start: date | None, end: date | None, search: str = "", truck_id: int | None = None):
    """(xlsx bytes, filename, preview sheets, report figures)."""
    rep = collect(db, start, end, search, truck_id)
    wb = Workbook()
    wb.remove(wb.active)
    sheets = [("Summary", _summary(wb, rep)), ("All Trucks", _all_trucks(wb, rep))]
    for x in rep["trucks"]:
        if x["records"] or rep["single_truck"]:
            sheets.append((x["sheet"], _truck_sheet(wb, x, rep)))
    sheets.append(("By Vendor", _vendors(wb, rep)))
    for _, sh in sheets:
        sh.ws.sheet_view.showGridLines = False
    buf = BytesIO()
    wb.save(buf)
    preview = [sh.preview(name) for name, sh in sheets]
    return buf.getvalue(), filename_for(rep), preview, rep
