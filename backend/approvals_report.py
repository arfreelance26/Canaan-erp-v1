"""Leave / Edit / Deletion / Maintenance Approvals → View: one report shape for
all four approval pages (Excel + PDF).

Each kind gathers its requests into the same structure — key figures, groups
(one sheet each) with their rows, columns to show, top lists and notes — and
build() writes the workbook from it; the frontend draws the PDF from the same
figures (lib/approvals-report-pdf.ts via GET /exports/approvals-report/preview).

  leave        a sheet per applicant group (Driver, Commercial Manager, …)
  edit         a sheet per record type (Trip, Customer, Truck, Fuel Log, …)
  deletion     a sheet per record type
  maintenance  a sheet per status (Pending, Approved, Rejected, Withdrawn)

Every report follows its page: its tab, search box and date range.
Timestamps are stored in UTC and shown in IST.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy.orm import Session

import models
from maintenance_report import TOTAL_FILL, _band, _d, _iso, _link, _pairs, _period_label, _sheet_names, _title
from pl_export import DATE, IST, MONEY, Sheet, _fill

STATUS_FILL = {"Pending": "FFEB9C", "Approved": "C6EFCE", "Rejected": "FFC7CE", "Expired": "EDEDED",
               "Used": "C6EFCE", "Withdrawn": "EDEDED", "Approved — active": "C6EFCE", "Approved — time up": "EDEDED"}
TYPE_LABEL = {
    "BookingSheet": "Booking Sheet", "TripSheet": "Trip Sheet", "TripData": "Trip Data", "FuelLog": "Fuel Log",
    "MaintenanceRecord": "Maintenance Record", "AdBlueLog": "AdBlue Log", "TyreInventory": "Tyre", "CfsYardEntry": "CFS / Yard",
}
LEAVE_GROUPS = ["Driver", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance",
                "Trip Sheet Register", "Yard Supervisor", "Auditor"]
ROLES = {"leave": ("Admin",), "deletion": ("Admin",),
         "edit": ("Admin", "Commercial Manager", "Assistant Commercial Manager"),
         "maintenance": ("Admin", "Accounts")}
USE_TRACKED = {"BookingSheet", "TripSheet", "TripData"}
# The money column each kind totals by group (key, heading), and what a row is called.
MONEY_COL = {"maintenance": ("cost", "Cost (₹)")}
NOUN = {}
TITLES = {"leave": "Leave Approvals", "edit": "Edit Approvals", "deletion": "Deletion Approvals",
          "maintenance": "Maintenance Approvals"}


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _ist(dt: datetime | None) -> datetime | None:
    u = _utc(dt)
    return u.astimezone(IST).replace(tzinfo=None) if u else None


def _ist_text(dt: datetime | None) -> str:
    v = _ist(dt)
    return v.strftime("%d-%m-%Y %I:%M %p") if v else ""


def _hours(a: datetime | None, b: datetime | None) -> float | None:
    """Hours from a to b. MySQL rounds stored times to the second, so a moment
    ago can read as slightly ahead of now — anything under a minute early is 0."""
    a, b = _utc(a), _utc(b)
    if not (a and b):
        return None
    secs = (b - a).total_seconds()
    if secs < 0:
        return 0.0 if secs > -60 else None
    return round(secs / 3600, 1)


def _in(d: date | None, start: date | None, end: date | None) -> bool:
    return d is not None and (start is None or d >= start) and (end is None or d <= end)


def _wait_text(h: float | None) -> str:
    if h is None:
        return ""
    return f"{h:.1f} h" if h < 48 else f"{h / 24:.1f} days"


# ── The four kinds ───────────────────────────────────────────────────────────

def _leave(db: Session, start, end, search, tab):
    term = search.lower()
    rows = []
    for r in db.query(models.LeaveRequest).order_by(models.LeaveRequest.from_date, models.LeaveRequest.id):
        if (start or end) and not _in(r.from_date, start, end):
            continue
        if tab not in ("", "All") and r.category != tab:
            continue
        if term and term not in (r.applicant_name or "").lower():
            continue
        days = (r.to_date - r.from_date).days + 1 if r.to_date and r.from_date else 0
        rows.append({
            "group": r.category, "applicant": r.applicant_name, "code": r.applicant_code or "",
            "from": _iso(r.from_date), "to": _iso(r.to_date), "days": days, "reason": r.reason or "",
            "status": r.status, "requested": _ist_text(r.applied_at or r.created_at),
            "decided_by": r.decided_by_name or "", "decided": _ist_text(r.decided_at),
            "wait_h": _hours(r.applied_at or r.created_at, r.decided_at),
        })
    columns = [("applicant", "Applicant", "text", 26), ("code", "Code", "text", 12), ("from", "From", "date", 12),
               ("to", "To", "date", 12), ("days", "Days", "num", 7), ("reason", "Reason", "text", 36),
               ("status", "Status", "status", 12), ("requested", "Applied on", "text", 19),
               ("decided_by", "Decided by", "text", 18), ("decided", "Decided on", "text", 19)]
    approved_days = sum(r["days"] for r in rows if r["status"] == "Approved")
    kpis = [
        ("Leave requests", len(rows), ""),
        ("Waiting for a decision", sum(1 for r in rows if r["status"] == "Pending"), "amber"),
        ("Approved leave days", approved_days, ""),
        ("Rejected", sum(1 for r in rows if r["status"] == "Rejected"), ""),
    ]
    per_person = defaultdict(lambda: {"requests": 0, "days": 0, "pending": 0})
    for r in rows:
        p = per_person[(r["group"], r["applicant"])]
        p["requests"] += 1
        if r["status"] == "Approved":
            p["days"] += r["days"]
        if r["status"] == "Pending":
            p["pending"] += 1
    tops = [{"title": "Most approved leave days", "head": ["Applicant", "Group", "Days", "Requests"],
             "rows": [[a, g, v["days"], v["requests"]] for (g, a), v in sorted(per_person.items(), key=lambda kv: -kv[1]["days"])[:5] if v["days"]]}]
    extras = {}
    for (g, a), v in per_person.items():
        extras.setdefault(g, []).append([a, v["requests"], v["days"], v["pending"]])
    for g in extras:
        extras[g].sort(key=lambda x: -x[2])
    notes = ["Leave requests are placed in the period by their From date, as on the page.",
             "Days = From to To, both included. Only approved leave counts towards the days."]
    order = LEAVE_GROUPS
    label = lambda g: g  # noqa: E731
    extra_head = ["Applicant", "Requests", "Approved days", "Pending"]
    return rows, columns, kpis, tops, notes, order, label, "Applicant group", extras, extra_head


def _approval_rows(db: Session, model, start, end, search, tab, edit: bool):
    now = datetime.now(timezone.utc)
    term = search.lower()
    rows = []
    # The app started recording "edit made" on the first approval it marked
    # used; approvals before then can't say whether they were used.
    track_from = None
    if edit:
        from sqlalchemy import func
        track_from = _utc(db.query(func.min(model.used_at)).scalar())
    for r in db.query(model).order_by(model.created_at, model.id):
        created = _ist(r.created_at)
        if (start or end) and not _in(created.date() if created else None, start, end):
            continue
        status = r.status
        if edit and status == "Approved":
            exp = _utc(r.expires_at)
            status = "Approved — time up" if exp and exp < now else "Approved — active"
        if tab and tab not in ("All", "all"):
            want = {"Approved": "Approved — active", "Completed": "Approved — time up"}.get(tab, tab) if edit else tab
            if status != want:
                continue
        who = r.staff_name if edit else r.requested_by_name
        if term and term not in (who or "").lower() and term not in (r.resource_name or "").lower():
            continue
        row = {
            "group": r.resource_type, "requested": _ist_text(r.created_at), "who": who or "",
            "record": r.resource_name or "", "reason": r.reason or "", "status": status,
            "decided_by": r.approved_by_name or "", "decided": _ist_text(r.approved_at), "note": r.admin_note or "",
            "wait_h": _hours(r.created_at, r.approved_at),
        }
        if edit:
            row["action"] = r.action
            # The app records an edit being made only for these (routers/trips.py
            # _mark_edit_approval_used; maintenance / AdBlue edits apply on approval).
            tracked = r.used_at is not None or (
                r.resource_type in USE_TRACKED and track_from is not None and (_utc(r.approved_at) or now) >= track_from)
            row["used"] = ("" if not status.startswith("Approved")
                           else f"Used {_ist_text(r.used_at)}" if r.used_at
                           else "Not tracked" if not tracked
                           else "Not used — time up" if status == "Approved — time up"
                           else "Not used yet")
        rows.append(row)
    return rows


def _edits(db, start, end, search, tab):
    rows = _approval_rows(db, models.EditApprovalRequest, start, end, search, tab, edit=True)
    columns = [("requested", "Requested on", "text", 19), ("who", "Requested by", "text", 20), ("record", "Record", "text", 34),
               ("action", "Action", "text", 9), ("reason", "Reason", "text", 34), ("status", "Status", "status", 18),
               ("decided_by", "Decided by", "text", 18), ("decided", "Decided on", "text", 19),
               ("used", "Edit access", "text", 22), ("note", "Admin note", "text", 26)]
    waits = [r["wait_h"] for r in rows if r["wait_h"] is not None]
    approved = [r for r in rows if r["status"].startswith("Approved")]
    unused = sum(1 for r in approved if r["used"].startswith("Not used — time up"))
    kpis = [("Edit requests", len(rows), ""),
            ("Waiting for a decision", sum(1 for r in rows if r["status"] == "Pending"), "amber"),
            ("Approved", len(approved), ""),
            ("Average time to decide", _wait_text(sum(waits) / len(waits)) if waits else "—", "")]
    tops = _top_people(rows)
    notes = ["Requests are placed in the period by the day they were made (IST).",
             "An approved edit gives 8 hours of access. \"Not used — time up\" means the access ran out without the change being made. "
             "The app records this for Booking Sheet and Trip Sheet edits only, and only since it began doing so; "
             "other record types and older approvals show \"Not tracked\"."]
    if unused:
        notes.append(f"{unused} approved request(s) ran out unused — worth asking whether the edit was still needed.")
    extras = {}
    return rows, columns, kpis, tops, notes, None, lambda g: TYPE_LABEL.get(g, g), "Record type", extras, None


def _deletions(db, start, end, search, tab):
    rows = _approval_rows(db, models.DeletionApprovalRequest, start, end, search, tab, edit=False)
    columns = [("requested", "Requested on", "text", 19), ("who", "Requested by", "text", 20), ("record", "Record", "text", 40),
               ("reason", "Reason", "text", 36), ("status", "Status", "status", 12), ("decided_by", "Decided by", "text", 18),
               ("decided", "Decided on", "text", 19), ("note", "Admin note", "text", 26)]
    waits = [r["wait_h"] for r in rows if r["wait_h"] is not None]
    kpis = [("Deletion requests", len(rows), ""),
            ("Waiting for a decision", sum(1 for r in rows if r["status"] == "Pending"), "amber"),
            ("Approved (deleted)", sum(1 for r in rows if r["status"] == "Approved"), ""),
            ("Average time to decide", _wait_text(sum(waits) / len(waits)) if waits else "—", "")]
    notes = ["Requests are placed in the period by the day they were made (IST).",
             "An approved deletion removed the record; deleted trips, trucks and people can be restored from their archives."]
    return rows, columns, kpis, _top_people(rows), notes, None, lambda g: TYPE_LABEL.get(g, g), "Record type", {}, None


def _maintenance(db, start, end, search, tab):
    now = datetime.now(timezone.utc)
    term = search.lower()
    trucks = {t.id: t for t in db.query(models.Truck.id, models.Truck.truck_id, models.Truck.registration_number)}
    trips = dict(db.query(models.Trip.id, models.Trip.trip_id))
    rows = []
    q = db.query(models.MaintenanceRequest).filter(models.MaintenanceRequest.status != "Scheduled")
    for r in q.order_by(models.MaintenanceRequest.created_at, models.MaintenanceRequest.id):
        created = _ist(r.created_at)
        if (start or end) and not _in(created.date() if created else None, start, end):
            continue
        status = "Withdrawn" if r.status == "Cancelled" else r.status
        if tab and tab not in ("all", "All") and r.status != tab:
            continue
        p = r.payload or {}
        t = trucks.get(r.truck_id)
        reg = t.registration_number if t else ""
        items = p.get("items") or []
        repairs = ", ".join(i.get("repair_type") or "" for i in items if i.get("repair_type")) or p.get("repair_type") or ""
        vendors = ", ".join(sorted({i.get("maintenance_by") or "" for i in items if i.get("maintenance_by")})) or p.get("maintenance_by") or ""
        invoices = ", ".join(sorted({i.get("invoice_number") or "" for i in items if i.get("invoice_number")})) or p.get("invoice_number") or ""
        trip = trips.get(r.trip_id) if r.trip_id else None
        if term and not any(term in (v or "").lower() for v in (reg, t.truck_id if t else "", p.get("maintenance_type"), repairs,
                                                                 r.submitted_by_name, vendors, invoices, trip)):
            continue
        waiting = _hours(r.resubmitted_at or r.created_at, now) if r.status == "Pending" else None
        rows.append({
            "group": status, "requested": _ist_text(r.created_at), "truck": reg, "source": f"Trip sheet {trip}" if trip else "Maintenance form",
            "type": p.get("maintenance_type") or "", "repairs": repairs, "work_date": p.get("date"), "cost": float(p.get("cost") or 0),
            "vendor": vendors, "who": r.submitted_by_name or "", "reverify": r.resubmit_count or 0,
            "status": status, "decided_by": r.decided_by_name or "", "decided": _ist_text(r.decided_at),
            "reason": r.reject_reason or (f"Previously: {r.previous_reject_reason}" if r.previous_reject_reason else ""),
            "waiting": _wait_text(waiting), "waiting_h": waiting, "wait_h": _hours(r.created_at, r.decided_at),
        })
    columns = [("requested", "Submitted on", "text", 19), ("truck", "Truck", "text", 13), ("source", "Source", "text", 18),
               ("type", "Maintenance type", "text", 20), ("repairs", "Repairs", "text", 26), ("work_date", "Work date", "date", 11),
               ("cost", "Cost (₹)", "money", 13), ("vendor", "Done by", "text", 22), ("who", "Submitted by", "text", 16),
               ("reverify", "Sent back", "num", 11), ("status", "Status", "status", 11), ("decided_by", "Decided by", "text", 16),
               ("decided", "Decided on", "text", 19), ("reason", "Rejection reason", "text", 30), ("waiting", "Waiting", "text", 11)]
    pend = [r for r in rows if r["status"] == "Pending"]
    kpis = [("Requests", len(rows), ""),
            ("Waiting for approval", len(pend), "amber", sum(r["cost"] for r in pend)),
            ("Approved", sum(1 for r in rows if r["status"] == "Approved"), "", sum(r["cost"] for r in rows if r["status"] == "Approved")),
            ("Oldest waiting", _wait_text(max(r["waiting_h"] or 0 for r in pend)) if pend else "—", "")]
    by_truck = defaultdict(lambda: [0, 0.0])
    for r in pend:
        by_truck[r["truck"]][0] += 1
        by_truck[r["truck"]][1] += r["cost"]
    tops = [{"title": "Trucks with the most waiting", "head": ["Truck", "Waiting", "Cost (₹)"],
             "rows": [[k, v[0], round(v[1], 2)] for k, v in sorted(by_truck.items(), key=lambda kv: -kv[1][1])[:5]], "money": [2]}]
    by_who = Counter(r["who"] for r in rows)
    tops.append({"title": "Top submitters", "head": ["Submitted by", "Requests", ""], "rows": [[k, n, ""] for k, n in by_who.most_common(5)]})
    resent = sum(1 for r in rows if r["reverify"])
    notes = ["Nothing here counts anywhere in the app until it's approved: maintenance cost, Profitability and the running cost calculator use approved records only.",
             "Requests are placed in the period by the day they were submitted (IST). Waiting = time since submitted (or sent back) for the ones still pending."]
    if resent:
        notes.append(f"{resent} request(s) were rejected and sent back for re-verification (\"Sent back\" column).")
    order = ["Pending", "Approved", "Rejected", "Withdrawn"]
    return rows, columns, kpis, tops, notes, order, lambda g: g, "Status", {}, None


def _top_people(rows):
    asks = Counter(r["who"] for r in rows)
    deciders = Counter(r["decided_by"] for r in rows if r["decided_by"])
    return [{"title": "Who asks most", "head": ["Requested by", "Requests", "Approved"],
             "rows": [[k, n, sum(1 for r in rows if r["who"] == k and r["status"].startswith("Approved"))] for k, n in asks.most_common(5)]},
            {"title": "Who decides", "head": ["Decided by", "Decisions", "Approved"],
             "rows": [[k, n, sum(1 for r in rows if r["decided_by"] == k and r["status"].startswith("Approved"))] for k, n in deciders.most_common(5)]}]


KINDS = {"leave": _leave, "edit": _edits, "deletion": _deletions, "maintenance": _maintenance}


def collect(db: Session, kind: str, start: date | None, end: date | None, search: str = "", tab: str = "") -> dict:
    rows, columns, kpis, tops, notes, order, label0, group_label, extras, extra_head = KINDS[kind](db, start, end, (search or "").strip(), tab or "")
    label = lambda g: label0(g) if g else "(type not recorded)"  # noqa: E731 — old rows saved without one
    present = []
    for g in (order or []):
        if any(r["group"] == g for r in rows):
            present.append(g)
    for g in sorted({r["group"] for r in rows} - set(present), key=lambda g: label(g)):
        present.append(g)
    names = _sheet_names([label(g) for g in present])
    groups = []
    for g, sheet in zip(present, names):
        rs = [r for r in rows if r["group"] == g]
        st = Counter(r["status"] for r in rs)
        groups.append({"key": g, "label": label(g), "sheet": sheet, "rows": rs, "count": len(rs),
                       "statuses": dict(st.most_common()),
                       "cost": round(sum(r.get(MONEY_COL[kind][0]) or 0 for r in rs), 2) if kind in MONEY_COL else None,
                       "extra": {"head": extra_head, "rows": extras.get(g, [])} if extra_head else None})
    st_all = Counter(r["status"] for r in rows)
    filters = []
    if tab and tab not in ("All", "all"):
        filters.append(f"tab: {tab}")
    if search:
        filters.append(f'search: "{search}"')
    return {
        "kind": kind, "title": TITLES[kind],
        "period": {"start": _iso(start), "end": _iso(end), "label": _period_label(start, end)},
        "generated_at": datetime.now(IST).strftime("%d-%m-%Y %I:%M %p"),
        "filters": filters, "group_label": group_label,
        "money_label": MONEY_COL[kind][1] if kind in MONEY_COL else None, "noun": NOUN.get(kind, "Requests"),
        "columns": [{"key": k, "label": l, "type": t, "width": w} for k, l, t, w in columns],
        "kpis": [{"label": k[0], "value": k[1], "tone": k[2], "money": k[3] if len(k) > 3 else None} for k in kpis],
        "statuses": dict(st_all.most_common()), "total": len(rows),
        "tops": tops, "notes": notes, "groups": groups,
    }


# ── Excel ────────────────────────────────────────────────────────────────────

def _put_value(s: Sheet, r: int, c: int, col: dict, v):
    t = col["type"]
    if t == "date":
        return s.put(r, c, _d(v) if v else None, fmt=DATE)
    if t == "money":
        return s.put(r, c, v, fmt=MONEY)
    if t == "status":
        cell = s.put(r, c, v, fill=STATUS_FILL.get(v))
        if v == "Pending":
            cell.font = Font(bold=True, color="9C5700")
        return cell
    if t == "num" and not v:
        return s.put(r, c, "")
    return s.put(r, c, "" if v is None else v)


def _summary(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "Summary")
    sub = f"{rep['period']['label']} · downloaded {rep['generated_at']}" + (" · " + " · ".join(rep["filters"]) if rep["filters"] else "")
    r = _title(s, 1, f"{rep['title']} Report", sub)
    _band(s, r, "AT A GLANCE")
    items = []
    for k in rep["kpis"]:
        items.append((k["label"], k["value"], None))
        if k["money"] is not None:
            items.append(("  their cost (₹)", round(k["money"], 2), MONEY))
    for st, n in rep["statuses"].items():
        items.append((f"Status: {st}", n, None))
    r = _pairs(s, r + 1, items)

    r += 1
    _band(s, r, f"BY {rep['group_label'].upper()} — click one to open its sheet")
    statuses = list(rep["statuses"])
    heads = [rep["group_label"], rep["noun"]] + statuses + ([rep["money_label"]] if rep["money_label"] else [])
    s.header(r + 1, heads)
    r += 2
    for g in rep["groups"]:
        _link(s.put(r, 1, g["label"]), g["sheet"])
        s.put(r, 2, g["count"])
        for i, st in enumerate(statuses):
            s.put(r, 3 + i, g["statuses"].get(st, "") or "")
        if rep["money_label"]:
            s.put(r, 3 + len(statuses), g["cost"], fmt=MONEY)
        r += 1
    if rep["groups"]:
        for c in range(1, len(heads) + 1):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        s.put(r, 2, rep["total"], bold=True, fill=TOTAL_FILL)
        for i, st in enumerate(statuses):
            s.put(r, 3 + i, rep["statuses"][st], bold=True, fill=TOTAL_FILL)
        if rep["money_label"]:
            s.put(r, 3 + len(statuses), round(sum(g["cost"] for g in rep["groups"]), 2), fmt=MONEY, bold=True, fill=TOTAL_FILL)
        r += 1
    else:
        s.put(r, 1, "No requests in this report.", color="6B7280")
        r += 1

    for top in rep["tops"]:
        if not top["rows"]:
            continue
        r += 1
        _band(s, r, top["title"].upper())
        s.header(r + 1, [h for h in top["head"] if h])
        r += 2
        for row in top["rows"]:
            for i, v in enumerate(row):
                if top["head"][i]:
                    s.put(r, 1 + i, v, fmt=MONEY if i in top.get("money", []) else None)
            r += 1

    r += 1
    _band(s, r, "WORTH KNOWING")
    for i, n in enumerate(rep["notes"], 1):
        s.put(r + i, 1, f"{i}. {n}")
    r += len(rep["notes"]) + 2
    _band(s, r, "WHAT'S IN THIS FILE")
    guide = [("Summary", "this page")] + [(g["label"], f"its {g['count']} {rep['noun'].lower()}, every detail") for g in rep["groups"]]
    for i, (a, b) in enumerate(guide, 1):
        s.put(r + i, 1, a, bold=True)
        s.put(r + i, 2, b)
    s.widths([40, 14] + [14] * (len(statuses) + 1))
    return s


def _group_sheet(wb: Workbook, g: dict, rep: dict) -> Sheet:
    s = Sheet(wb, g["sheet"])
    cols = rep["columns"]
    _link(s.put(1, len(cols), "← Summary"), "Summary")
    r = _title(s, 1, f"{g['label']} — {rep['title'].lower()}", rep["period"]["label"] + (" · " + " · ".join(rep["filters"]) if rep["filters"] else ""))
    s.put(r, 1, f"{g['count']} {rep['noun'].lower()}: " + " · ".join(f"{k} {v}" for k, v in g["statuses"].items())
          + (f" · {rep['money_label'].replace(' (₹)', '').lower()} ₹{g['cost']:,.2f}" if g["cost"] is not None else ""), bold=True)
    r += 2
    s.header(r, [c["label"] for c in cols])
    first = r + 1
    r += 1
    for row in g["rows"]:
        for i, col in enumerate(cols):
            _put_value(s, r, 1 + i, col, row.get(col["key"]))
        r += 1
    money_cols = [i for i, c in enumerate(cols) if c["type"] == "money"]
    if g["rows"] and money_cols:
        r += 1
        from openpyxl.utils import get_column_letter
        for c in range(1, len(cols) + 1):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        for i in money_cols:
            L = get_column_letter(i + 1)
            total = round(sum(row.get(cols[i]["key"]) or 0 for row in g["rows"]), 2)
            s.put(r, i + 1, total, formula=f"=SUM({L}{first}:{L}{r - 2})", fmt=MONEY, bold=True, fill=TOTAL_FILL)
    if g["rows"]:
        from openpyxl.utils import get_column_letter
        s.ws.auto_filter.ref = f"A{first - 1}:{get_column_letter(len(cols))}{first + len(g['rows']) - 1}"
        s.ws.freeze_panes = s.ws.cell(row=first, column=1)
    if g["extra"] and g["extra"]["rows"]:
        r += 2
        _band(s, r, "PER PERSON", len(g["extra"]["head"]))
        s.header(r + 1, g["extra"]["head"])
        r += 2
        for row in g["extra"]["rows"]:
            for i, v in enumerate(row):
                s.put(r, 1 + i, v)
            r += 1
    s.widths([c["width"] for c in cols])
    return s


def filename_for(rep: dict) -> str:
    p = rep["period"]
    f = lambda v: date.fromisoformat(v).strftime("%d-%m-%Y")  # noqa: E731
    span = f"_{f(p['start'])}_to_{f(p['end'])}" if p["start"] and p["end"] else (
        f"_from_{f(p['start'])}" if p["start"] else f"_to_{f(p['end'])}" if p["end"] else "_all_time")
    return f"{rep['title'].replace(' ', '_')}{span}.xlsx"


def build(db: Session, kind: str, start: date | None, end: date | None, search: str = "", tab: str = ""):
    """(xlsx bytes, filename, preview sheets, report figures)."""
    rep = collect(db, kind, start, end, search, tab)
    wb = Workbook()
    wb.remove(wb.active)
    sheets = [("Summary", _summary(wb, rep))] + [(g["sheet"], _group_sheet(wb, g, rep)) for g in rep["groups"]]
    for _, sh in sheets:
        sh.ws.sheet_view.showGridLines = False
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue(), filename_for(rep), [sh.preview(name) for name, sh in sheets], rep


# The Audit Outcomes pages (Pending Audit, Flagged, Verified) are lists of the
# same shape — they register their kinds here (audit_report.py).
import audit_report  # noqa: E402,F401
