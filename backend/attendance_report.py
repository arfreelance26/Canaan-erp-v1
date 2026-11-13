"""Driver Attendance / Staff Attendance / Attendance Report → View: the
person-wise attendance report (Excel + PDF).

Built like the other reports (maintenance_report.py): collect() gathers the
figures once, build() writes the workbook, and the frontend draws the PDF from
the same figures (lib/attendance-report-pdf.ts via
GET /exports/attendance-report/preview).

Sheets
  Summary    days, people, every status in total, who was away or unmarked
             most, worth knowing, what's in this file
  Register   the classic grid: people down, dates across, one coloured code
             per day
  <one sheet per person>: their counts, then every day with its status,
             times and notes

Days, the same way as the app's Attendance Report (routers/attendance.py
attendance_summary): drivers are counted every calendar day; staff only on
working days — Sundays and holidays (Holiday master) are left out.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from sqlalchemy.orm import Session

import models
from maintenance_report import TOTAL_FILL, _band, _d, _iso, _link, _pairs, _period_label, _sheet_names, _title
from pl_export import DATE, IST, NAVY, Sheet, _fill

# Status → (register code, fill colour, counts as on duty / present).
DRIVER = {
    "On Trip": ("T", "C6EFCE", True), "On Halt": ("H", "FFEB9C", True), "On Workshop": ("W", "DDEBF7", True),
    "Present": ("P", "C6EFCE", True), "Leave": ("L", "F8CBAD", False), "On Leave": ("L", "F8CBAD", False),
    "Absent": ("A", "FFC7CE", False), "Not Marked": ("-", "EDEDED", False),
}
STAFF = {
    "Present": ("P", "C6EFCE", True), "On Leave": ("L", "F8CBAD", False), "Absent": ("A", "FFC7CE", False),
    "Not Marked": ("-", "EDEDED", False),
}
DRIVER_ORDER = ["On Trip", "On Halt", "On Workshop", "Leave", "Absent", "Not Marked"]
STAFF_ORDER = ["Present", "On Leave", "Absent", "Not Marked"]
OFF_FILL = "F2F2F2"


def _minutes(s: str | None) -> int | None:
    """'10:53 PM' / '22:53' → minutes after midnight."""
    if not s:
        return None
    for fmt in ("%I:%M %p", "%H:%M", "%I:%M%p", "%H:%M:%S"):
        try:
            t = datetime.strptime(s.strip().upper(), fmt)
            return t.hour * 60 + t.minute
        except ValueError:
            continue
    return None


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def collect(db: Session, category: str, start: date, end: date, search: str = "") -> dict:
    from routers.attendance import _holiday_dates_in_range, _non_working_dates

    today = datetime.now(IST).date()
    term = (search or "").strip().lower()
    days = _days(start, end)
    is_driver = category == "driver"
    codes = DRIVER if is_driver else STAFF
    order = DRIVER_ORDER if is_driver else STAFF_ORDER

    holidays = {h.date: h.name for h in db.query(models.Holiday).filter(models.Holiday.date >= start, models.Holiday.date <= end)}
    off = set() if is_driver else _non_working_dates(start, end, _holiday_dates_in_range(db, start, end))
    counted_days = [d for d in days if d not in off]
    # A day still to come can't be marked yet — not counted as "not marked".
    due_days = [d for d in counted_days if d <= today]

    if is_driver:
        people = db.query(models.Driver).order_by(models.Driver.name).all()
        recs = db.query(models.DriverAttendance).filter(models.DriverAttendance.date >= start, models.DriverAttendance.date <= end).all()
        by = defaultdict(dict)
        for r in recs:
            by[r.driver_id][r.date] = r
        remarks = defaultdict(dict)
        for r in db.query(models.DriverAttendanceRemark).filter(
                models.DriverAttendanceRemark.date >= start, models.DriverAttendanceRemark.date <= end):
            remarks[r.driver_id][r.date] = r.remark
        key = lambda p: p.driver_id  # noqa: E731
        code_of = lambda p: p.driver_id  # noqa: E731
        role_of = lambda p: ""  # noqa: E731
    else:
        people = db.query(models.Staff).order_by(models.Staff.name).all()
        recs = db.query(models.StaffAttendance).filter(models.StaffAttendance.date >= start, models.StaffAttendance.date <= end).all()
        by = defaultdict(dict)
        for r in recs:
            by[r.staff_id][r.date] = r
        remarks = defaultdict(dict)
        key = lambda p: p.id  # noqa: E731
        code_of = lambda p: p.staff_id  # noqa: E731
        role_of = lambda p: p.software_designation or p.designation or ""  # noqa: E731

    chosen = []
    for p in people:
        if term and term not in (p.name or "").lower() and term not in (code_of(p) or "").lower():
            continue
        if getattr(p, "deleted_at", None) is not None and not by.get(key(p)):
            continue      # people who left show only if they have days in the period
        chosen.append(p)

    out = []
    for p, sheet in zip(chosen, _sheet_names([p.name for p in chosen])):
        mine = by.get(key(p), {})
        counts = Counter()
        rows = []
        minutes_total, timed_days, auto_closed = 0, 0, 0
        for d in days:
            r = mine.get(d)
            note = []
            if d in off:
                status = r.status if r and r.status != "Not Marked" else ("Holiday" if d in holidays else "Sunday")
            elif r and r.status != "Not Marked":
                status = r.status
            else:
                status = "Not Marked" if d <= today else "Not yet"
            # Like the app's Attendance Report: every marked day counts, a Sunday
            # or holiday worked included; only unmarked days depend on the calendar.
            if r is not None and r.status != "Not Marked" and status in codes:
                counts["Leave" if is_driver and status == "On Leave" else status] += 1
            row = {"date": _iso(d), "day": d.strftime("%a"), "status": status,
                   "off": d in off, "holiday": holidays.get(d, ""), "check_in": "", "check_out": "", "hours": None}
            if r is not None:
                row["check_in"] = r.check_in_time or ""
                if is_driver:
                    if r.container_specification:
                        note.append(f"Vehicle: {r.container_specification}")
                    if r.workshop_advance:
                        note.append(f"Workshop advance ₹{float(r.workshop_advance):,.2f}")
                else:
                    row["check_out"] = r.check_out_time or ""
                    a, b = _minutes(r.check_in_time), _minutes(r.check_out_time)
                    # A shift the system closed itself has no real check-out — no hours from it.
                    if a is not None and b is not None and b > a and not r.auto_closed:
                        row["hours"] = round((b - a) / 60, 2)
                        minutes_total += b - a
                        timed_days += 1
                    if r.auto_closed:
                        auto_closed += 1
                        note.append("Shift closed automatically")
                    if r.admin_override:
                        note.append("Set by Admin")
                    if r.source == "App":
                        note.append("Marked in the app")
            if d in remarks.get(key(p), {}):
                note.append(remarks[key(p)][d])
            if d in holidays and not row["off"]:
                note.append(f"Holiday: {holidays[d]}")
            row["note"] = " · ".join(note)
            rows.append(row)
        marked = sum(n for st, n in counts.items() if st != "Not Marked")
        counts["Not Marked"] = max(len(due_days) - marked, 0)
        on_duty = sum(n for st, n in counts.items() if codes.get(st, ("", "", False))[2])
        base = len(due_days)
        out.append({
            "key": str(key(p)), "code": code_of(p), "name": p.name, "role": role_of(p), "sheet": sheet,
            "left": getattr(p, "deleted_at", None) is not None,
            "counts": {s: counts.get(s, 0) for s in order},
            "on_duty": on_duty, "days": base,
            "rate": min(round(on_duty / base * 100, 1), 100.0) if base else None,
            "hours": round(minutes_total / 60, 2) if timed_days else None,
            "avg_hours": round(minutes_total / 60 / timed_days, 2) if timed_days else None,
            "auto_closed": auto_closed,
            "rows": rows,
        })

    totals = {s: sum(x["counts"][s] for x in out) for s in order}
    base = sum(x["days"] for x in out)
    on_duty = sum(x["on_duty"] for x in out)
    return {
        "category": category, "label": "Driver" if is_driver else "Staff",
        "period": {"start": _iso(start), "end": _iso(end), "label": _period_label(start, end)},
        "generated_at": datetime.now(IST).strftime("%d-%m-%Y %I:%M %p"),
        "search": search or "",
        "days": [{"date": _iso(d), "day": d.strftime("%a"), "off": d in off, "holiday": holidays.get(d, "")} for d in days],
        "calendar_days": len(days), "counted_days": len(counted_days), "due_days": len(due_days),
        "off_days": len(off), "holidays": [{"date": _iso(d), "name": n} for d, n in sorted(holidays.items())],
        "statuses": [{"status": s, "code": codes[s][0], "fill": codes[s][1], "on_duty": codes[s][2]} for s in order],
        "totals": {"people": len(out), "counts": totals, "on_duty": on_duty, "days": base,
                   "rate": min(round(on_duty / base * 100, 1), 100.0) if base else None,
                   "auto_closed": sum(x["auto_closed"] for x in out)},
        "most_away": sorted((x for x in out if x["counts"].get("Leave", 0) + x["counts"].get("On Leave", 0) + x["counts"].get("Absent", 0)),
                            key=lambda x: -(x["counts"].get("Leave", 0) + x["counts"].get("On Leave", 0) + x["counts"].get("Absent", 0)))[:5],
        "most_unmarked": sorted((x for x in out if x["counts"]["Not Marked"]), key=lambda x: -x["counts"]["Not Marked"])[:5],
        "people": out,
        "period_open": end >= today,
    }


# ── Excel ────────────────────────────────────────────────────────────────────

def _on_duty_word(rep):
    return "on duty (trip, halt or workshop)" if rep["category"] == "driver" else "present"


def _summary(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "Summary")
    t = rep["totals"]
    sub = f"{rep['period']['label']} · downloaded {rep['generated_at']}"
    if rep["search"]:
        sub += f' · search "{rep["search"]}"'
    r = _title(s, 1, f"{rep['label']} Attendance Report", sub)

    _band(s, r, "THE PERIOD AT A GLANCE")
    items = [(f"{rep['label']}s in this report", t["people"], None), ("Days in the period", rep["calendar_days"], None)]
    if rep["category"] == "staff":
        items += [("  working days (Sundays and holidays left out)", rep["counted_days"], None)]
    if rep["due_days"] != rep["counted_days"]:
        items += [("  up to today (later days can't be marked yet)", rep["due_days"], None)]
    for st in rep["statuses"]:
        items.append((f"{st['status']} — days ({st['code']})", t["counts"][st["status"]], None))
    items.append((f"Days {_on_duty_word(rep)}", f"{t['rate']}% of the days counted" if t["rate"] is not None else "—", None))
    if rep["category"] == "staff" and t["auto_closed"]:
        items.append(("Shifts closed automatically (no check-out)", t["auto_closed"], None))
    r = _pairs(s, r + 1, items)

    r += 1
    _band(s, r, "EVERYONE — click a name to open their sheet")
    heads = ["Name", "Code"] + [st["status"] for st in rep["statuses"]] + [f"% {_on_duty_word(rep).split(' ')[0]}"]
    s.header(r + 1, heads)
    r += 2
    first = r
    for x in rep["people"]:
        _link(s.put(r, 1, x["name"] + (" (left)" if x["left"] else "")), x["sheet"])
        s.put(r, 2, x["code"])
        for i, st in enumerate(rep["statuses"]):
            c = s.put(r, 3 + i, x["counts"][st["status"]] or "")
            if st["status"] == "Not Marked" and x["counts"]["Not Marked"]:
                c.font = Font(bold=True, color="C55A11")
        s.put(r, 3 + len(rep["statuses"]), x["rate"] if x["rate"] is not None else "—", fmt='0.0"%"')
        r += 1
    if rep["people"]:
        r += 1
        for c in range(1, len(heads) + 1):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        for i, st in enumerate(rep["statuses"]):
            s.put(r, 3 + i, t["counts"][st["status"]], bold=True, fill=TOTAL_FILL)
        s.put(r, 3 + len(rep["statuses"]), t["rate"] if t["rate"] is not None else "—", fmt='0.0"%"', bold=True, fill=TOTAL_FILL)
        s.ws.auto_filter.ref = f"A{first - 1}:{chr(64 + len(heads))}{first + len(rep['people']) - 1}"
    r += 2

    _band(s, r, "WORTH KNOWING")
    notes = []
    if rep["category"] == "driver":
        notes.append("Drivers are counted every calendar day. On duty = On Trip, On Halt or On Workshop.")
    else:
        notes.append("Staff are counted on working days only: Sundays and holidays are left out. Present % = present days ÷ working days.")
        if rep["holidays"]:
            notes.append("Holidays in the period: " + ", ".join(f"{_d(h['date']).strftime('%d-%m')} {h['name']}" for h in rep["holidays"]) + ".")
    notes.append("Not Marked = the days counted (up to today) minus the days with attendance entered, the same way as the Attendance Report page.")
    if rep["period_open"]:
        notes.append("The period isn't over yet — days after today are shown as \"Not yet\" and aren't counted.")
    if rep["most_unmarked"]:
        notes.append("Most days not marked: " + ", ".join(f"{x['name']} ({x['counts']['Not Marked']})" for x in rep["most_unmarked"]) + ".")
    for i, n in enumerate(notes, 1):
        s.put(r + i, 1, f"{i}. {n}")
    r += len(notes) + 2
    _band(s, r, "WHAT'S IN THIS FILE")
    for i, (a, b) in enumerate([("Summary", "this page"),
                                ("Register", "everyone down, every date across, one coloured code a day"),
                                ("One sheet per person", "their counts and every day with its status, times and notes")], 1):
        s.put(r + i, 1, a, bold=True)
        s.put(r + i, 2, b)
    s.widths([40, 14] + [12] * (len(rep["statuses"]) + 1))
    return s


def _register(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "Register")
    r = _title(s, 1, f"{rep['label']} Attendance Register", rep["period"]["label"] + " · "
               + " · ".join(f"{st['code']} = {st['status']}" for st in rep["statuses"]))
    days = rep["days"]
    s.put(r, 1, "Name", bold=True, fill=NAVY, color="FFFFFF")
    for i, d in enumerate(days):
        c = s.put(r, 2 + i, f"{_d(d['date']).day}\n{d['day'][:2]}", bold=True, fill="7F7F7F" if d["off"] else NAVY, color="FFFFFF")
        c.alignment = Alignment(horizontal="center", wrap_text=True)
    tail = 2 + len(days)
    s.put(r, tail, "On duty" if rep["category"] == "driver" else "Present", bold=True, fill=NAVY, color="FFFFFF")
    s.put(r, tail + 1, "Not marked", bold=True, fill=NAVY, color="FFFFFF")
    s.ws.row_dimensions[r].height = 30
    fills = {st["status"]: (st["code"], st["fill"]) for st in rep["statuses"]}
    r += 1
    first = r
    for x in rep["people"]:
        _link(s.put(r, 1, x["name"]), x["sheet"])
        for i, row in enumerate(x["rows"]):
            if row["status"] in fills:
                code, fill = fills["Leave" if row["status"] == "On Leave" and "Leave" in fills else row["status"]]
            elif row["status"] in ("Sunday", "Holiday"):
                code, fill = ("S" if row["status"] == "Sunday" else "Ho"), OFF_FILL
            else:
                code, fill = "", None
            c = s.put(r, 2 + i, code, fill=fill)
            c.alignment = Alignment(horizontal="center")
        s.put(r, tail, x["on_duty"], bold=True)
        s.put(r, tail + 1, x["counts"]["Not Marked"] or "")
        r += 1
    s.ws.freeze_panes = s.ws.cell(row=first, column=2)
    s.ws.column_dimensions["A"].width = 26
    from openpyxl.utils import get_column_letter
    for i in range(len(days)):
        s.ws.column_dimensions[get_column_letter(2 + i)].width = 4.2
    s.ws.column_dimensions[get_column_letter(tail)].width = 9
    s.ws.column_dimensions[get_column_letter(tail + 1)].width = 11
    return s


def _person(wb: Workbook, x: dict, rep: dict) -> Sheet:
    s = Sheet(wb, x["sheet"])
    _link(s.put(1, 8, "← Summary"), "Summary")
    sub = f"{x['code']}{' · ' + x['role'] if x['role'] else ''} · {rep['period']['label']}" + (" · has left" if x["left"] else "")
    r = _title(s, 1, x["name"], sub)
    _band(s, r, "THIS PERIOD", 4)
    items = [("Days counted", x["days"], None)]
    items += [(f"{st['status']} ({st['code']})", x["counts"][st["status"]], None) for st in rep["statuses"]]
    items.append((f"% {_on_duty_word(rep)}", f"{x['rate']}%" if x["rate"] is not None else "—", None))
    if rep["category"] == "staff":
        items += [("Hours worked (days with a real check-out)", x["hours"] if x["hours"] is not None else "—", "0.00"),
                  ("Average hours a day", x["avg_hours"] if x["avg_hours"] is not None else "—", "0.00"),
                  ("Shifts closed automatically", x["auto_closed"], None)]
    r = _pairs(s, r + 1, items)

    r += 1
    heads = ["Date", "Day", "Status", "Check-in"] + (["Check-out", "Hours"] if rep["category"] == "staff" else []) + ["Notes"]
    _band(s, r, "EVERY DAY", len(heads))
    s.header(r + 1, heads)
    r += 2
    fills = {st["status"]: st["fill"] for st in rep["statuses"]}
    for row in x["rows"]:
        s.put(r, 1, _d(row["date"]), fmt=DATE)
        s.put(r, 2, row["day"])
        fill = fills.get(row["status"]) or fills.get("Leave" if row["status"] == "On Leave" else "") or (OFF_FILL if row["off"] else None)
        c = s.put(r, 3, row["status"] + (f" — {row['holiday']}" if row["off"] and row["holiday"] else ""), fill=fill)
        if row["status"] == "Not Marked":
            c.font = Font(bold=True, color="C55A11")
        s.put(r, 4, row["check_in"])
        col = 5
        if rep["category"] == "staff":
            s.put(r, 5, row["check_out"])
            s.put(r, 6, row["hours"], fmt="0.00")
            col = 7
        s.put(r, col, row["note"])
        r += 1
    s.widths([34, 8, 26, 12] + ([12, 9] if rep["category"] == "staff" else []) + [60])
    return s


def filename_for(rep: dict) -> str:
    p = rep["period"]
    f = lambda v: date.fromisoformat(v).strftime("%d-%m-%Y")  # noqa: E731
    return f"{rep['label']}_Attendance_{f(p['start'])}_to_{f(p['end'])}.xlsx"


def build(db: Session, category: str, start: date, end: date, search: str = ""):
    """(xlsx bytes, filename, preview sheets, report figures)."""
    rep = collect(db, category, start, end, search)
    wb = Workbook()
    wb.remove(wb.active)
    sheets = [("Summary", _summary(wb, rep)), ("Register", _register(wb, rep))]
    for x in rep["people"]:
        sheets.append((x["sheet"], _person(wb, x, rep)))
    for _, sh in sheets:
        sh.ws.sheet_view.showGridLines = False
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue(), filename_for(rep), [sh.preview(name) for name, sh in sheets], rep
