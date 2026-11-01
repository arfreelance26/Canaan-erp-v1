"""Profitability → View → Excel: an easy-to-read audit report.

Sheets
  Summary        the big numbers + one trip worked out line by line
  Trips          one row per trip, read left to right like a bill:
                 Hire − Trip Expenses − Diesel − EMI − Tyres − Maintenance −
                 Documents = Profit after all costs
  Trip Expenses  every trip-sheet expense line, with a check that they add up
  Trucks         one row per truck for the period (actual bills / EMI / documents)
  Rates          each truck's per-km rates — every per-km cost above looks its
                 rate up here, so a wrong rate is fixed in one place

Money cells are live Excel formulas (click one to see how it's worked out).
Built to be sorted and filtered: plain numbers (the ₹ is in the column
headings, not the cells), real dates, each sheet's TOTAL row below its list
(after a blank row, so sorting never moves it) and no merged cells.
openpyxl can't store a formula's result, so every value is also worked out
here: it feeds the in-app preview, and the numbers match the Profitability
page exactly (same Cost/KM, same per-km parts — see running_cost.py).

A search narrows the report the way it narrows the page: only the matching
trips, and only their trucks on Trucks / Rates (each trip's costs look their
rates up there, so a truck can't be dropped while its trips stay listed).
"""
import re
from collections import Counter
from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

import models

IST = ZoneInfo("Asia/Kolkata")

# ── Look ─────────────────────────────────────────────────────────────────────
NAVY = "1B2B5E"
FILL = {
    "trip": "DCE6F2", "in": "E2EFDA", "out": "FCE4D6", "result": NAVY,
    "info": "EDEDED", "docs": "FFF2CC", "total": "F2F2F2", "review": "F2F2F2",
}
# Plain numbers — the ₹ is in each column's heading, so Excel sorts them as numbers.
MONEY = "#,##0.00;[Red]-#,##0.00"
KM = "#,##0"
RATE = "0.00"
DATE = "dd-mm-yyyy"
THIN = Side(style="thin", color="BFBFBF")


def _fill(hex_):
    return PatternFill("solid", start_color=hex_, end_color=hex_)


def _show(v, fmt=None) -> str:
    """How a value looks in the preview (same formats as the file)."""
    if v is None or v == "":
        return ""
    if isinstance(v, date):
        return v.strftime("%d-%m-%Y")
    if isinstance(v, (int, float)):
        if fmt == MONEY:
            return f"{'-' if v < 0 else ''}{abs(v):,.2f}"
        if fmt == KM:
            return f"{v:,.0f}"
        if fmt == RATE:
            return f"{v:.2f}"
        return f"{v:,.2f}" if isinstance(v, float) else str(v)
    return str(v)


class Sheet:
    """Writes cells (value or formula) and keeps the matching preview grid."""

    def __init__(self, wb: Workbook, title: str):
        self.ws = wb.create_sheet(title)
        self.grid: dict[int, dict[int, str]] = {}
        # The worked-out number behind each cell (a formula cell holds only text).
        self.values: dict[tuple[int, int], float] = {}

    def put(self, r, c, value=None, formula=None, fmt=None, bold=False, fill=None, color=None, wrap=False, size=None):
        cell = self.ws.cell(row=r, column=c, value=formula if formula else value)
        if not formula and isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
            # Typed text (a customer name, a remark…) must never run as a formula.
            cell.data_type = "s"
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            self.values[(r, c)] = float(value)
        if fmt:
            cell.number_format = fmt
        if bold or color or size:
            cell.font = Font(bold=bold, color=color, size=size or 11)
        if fill:
            cell.fill = _fill(fill)
        if wrap:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        self.grid.setdefault(r, {})[c] = _show(value, fmt)
        return cell

    def value(self, r, c) -> float:
        return self.values.get((r, c), 0.0)

    def widths(self, widths):
        for i, w in enumerate(widths, start=1):
            self.ws.column_dimensions[get_column_letter(i)].width = w

    def header(self, r, labels):
        for c, label in enumerate(labels, start=1):
            cell = self.put(r, c, label, bold=True, fill=NAVY, color="FFFFFF")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        self.ws.row_dimensions[r].height = 30

    def groups(self, r, spans):
        """spans: [(first col, last col, label, fill key)] — the coloured band above the headers."""
        for c1, c2, label, key in spans:
            dark = key == "result"
            for c in range(c1, c2 + 1):
                self.ws.cell(row=r, column=c).fill = _fill(FILL[key])
            cell = self.ws.cell(row=r, column=c1, value=label)
            cell.font = Font(bold=True, color="FFFFFF" if dark else "1F2937")
            # Not merged across the span — a merged cell stops Excel's Sort.
            cell.alignment = Alignment(horizontal="left")

    def preview(self, name, first_row=1):
        if not self.grid:
            return {"name": name, "rows": []}
        last_r = max(self.grid)
        last_c = max(max(cols) for cols in self.grid.values())
        rows = [[self.grid.get(r, {}).get(c, "") for c in range(1, last_c + 1)] for r in range(first_row, last_r + 1)]
        return {"name": name, "rows": rows}


EXPENSE_LINES = [
    ("driver_pay", "Driver Pay / Batta"), ("halt_pay", "Halt Pay"), ("toll_charges", "Toll"),
    ("port_pass_expense", "Port Pass"), ("weight_sheet_expense", "Weight Sheet"), ("mamol_expense", "Mamol"),
    ("claimable_mamol_expense", "Claimable Mamol"), ("traffic_rto_expense", "Traffic / RTO"),
    ("lift_on_off_expense", "Lift On/Off"), ("crane_operator_expense", "Crane Operator"),
    ("parking_expense", "Parking"), ("other_expenses", "Other"),
]
DOCS = [("rc", "RC"), ("fc", "FC"), ("road_tax", "Road Tax"), ("insurance", "Insurance"),
        ("national_permit", "National Permit"), ("local_permit", "Local Permit"),
        ("pollution_certificate", "Pollution Cert.")]

# Rates sheet columns (VLOOKUP index): A Truck ID … C Diesel, D AdBlue, E EMI,
# F Tyres, G Maintenance, H Documents.
RATE_COL = {"diesel": 3, "adblue": 4, "emi": 5, "tyre": 6, "maintenance": 7, "compliance": 8}
RATE_KEYS = tuple(RATE_COL)
# Truck Expenses on the Trips sheet — every Cost/KM part except diesel, with
# its column there and how a note names it.
TRIP_PARTS = ((12, "adblue", "AdBlue"), (13, "emi", "EMI"), (14, "tyre", "Tyres"),
              (15, "maintenance", "Maintenance"), (16, "compliance", "Documents"))


def _lookup(km_ref, truck_ref, part):
    return f"{km_ref}*VLOOKUP({truck_ref},Rates!$A:$H,{RATE_COL[part]},FALSE)"


def _d(s: str | None) -> str:
    return f"{s[8:10]}-{s[5:7]}-{s[:4]}" if s else ""


def _date(s: str | None):
    """A real Excel date (sorts by date) from "YYYY-MM-DD"; None when missing."""
    try:
        return date.fromisoformat(s[:10]) if s else None
    except ValueError:
        return None


def _reg(s: str | None) -> str:
    """Registration with spaces, e.g. "TN69AA1256" → "TN69 AA 1256"; anything
    that doesn't look like a state-series number is returned unchanged."""
    raw = re.sub(r"[\s-]", "", (s or "").upper())
    m = re.fullmatch(r"([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})", raw)
    if not m:
        return s or ""
    state, district, series, number = m.groups()
    return " ".join(p for p in (state + district, series, number) if p)


def _active_emi_regs(db: Session) -> set[str]:
    """Registrations with a running EMI (same rule as the Cost/KM EMI part), so
    a truck with no loan isn't reported as missing an EMI cost."""
    today = date.today()
    return {
        rec.truck_registration.strip().upper()
        for rec in db.query(models.EmiRecord).all()
        if rec.truck_registration and float(rec.emi_amount or 0) > 0
        and not (rec.emi_end_date and rec.emi_end_date < today)
    }


def build(db: Session, start: date, end: date, mode: str, search: str = ""):
    """Returns (xlsx bytes, filename, preview sheets)."""
    import pl_compute

    # Every number comes from pl_compute — the same figures the page shows.
    # Full precision, so the preview equals what Excel's own formulas give.
    R = pl_compute.rates(db, mode)
    res = pl_compute.compute(db, start, end, mode, R=R, rounded=False)
    trucks, trips = res["trucks"], res["trips"]
    cpk, diesel_pk, parts = R["cpk"], R["diesel"], R["split"]
    search = (search or "").strip()
    q = search.lower()
    part_of_truck = False                           # a listed truck has trips that didn't match
    if q:
        all_trips = trips
        trips = [t for t in all_trips if pl_compute.trip_matches(q, t)]
        shown = Counter(t["truck_id"] for t in trips)
        trucks = [e for e in trucks if shown[e["truck_id"]] or pl_compute.truck_matches(q, e)]
        kept = {e["truck_id"] for e in trucks}
        part_of_truck = any(t["truck_id"] in kept and t not in trips for t in all_trips)

    wb = Workbook()
    wb.remove(wb.active)
    summary = Sheet(wb, "Summary")
    trip_s = Sheet(wb, "Trips")
    exp_s = Sheet(wb, "Trip Expenses")
    truck_s = Sheet(wb, "Trucks")
    rate_s = Sheet(wb, "Rates")

    # ── Rates ────────────────────────────────────────────────────────────────
    rate_s.header(1, ["Truck ID", "Registration", "Diesel (₹/km)", "AdBlue (₹/km)", "EMI (₹/km)", "Tyres (₹/km)",
                      "Maintenance (₹/km)", "Documents (₹/km)", "Total per km (₹)", "Cost/KM used (₹)", "Check",
                      "Where to fix a wrong rate"])
    rates: dict[str, dict] = {}
    where = f"Running Cost Calculator → {mode}"
    for i, e in enumerate(trucks):
        r = i + 2
        tid = e["truck_id"]
        p = parts.get(tid) or {}
        known = bool(p.get("parts_known"))
        rate = {"diesel": diesel_pk.get(tid), **{k: (p.get(k) if known else None) for k in RATE_KEYS if k != "diesel"}}
        rates[tid] = {**rate, "known": known, "cpk": cpk.get(tid)}
        total = sum(v or 0 for v in rate.values())
        used = cpk.get(tid)
        rate_s.put(r, 1, tid, bold=True)
        rate_s.put(r, 2, _reg(e.get("registration_number")))
        for k, c in RATE_COL.items():
            rate_s.put(r, c, rate[k], fmt=RATE)
        rate_s.put(r, 9, total, formula=f"=SUM(C{r}:H{r})", fmt=RATE)
        rate_s.put(r, 10, used, fmt=RATE)
        if used is None:
            rate_s.put(r, 11, "Not set", color="C00000", bold=True)
            rate_s.put(r, 12, f"Set it in {where}")
        else:
            ok = known and abs(total - used) < 0.0005
            rate_s.put(r, 11, "OK" if ok else "CHECK", formula=f'=IF(ABS(I{r}-J{r})<0.0005,"OK","CHECK")', bold=True)
            rate_s.put(r, 12, where if known else f"{where} — save the Manual tab to split the rates")
    rate_s.widths([12, 15, 13, 13, 13, 13, 14, 13, 14, 14, 9, 48])
    rate_s.ws.freeze_panes = "C2"
    n_r = len(trucks) + 1
    if trucks:
        rate_s.ws.conditional_formatting.add(f"K2:K{n_r}", CellIsRule(operator="equal", formula=['"OK"'], font=Font(color="00873C", bold=True)))
        rate_s.ws.conditional_formatting.add(f"K2:K{n_r}", CellIsRule(operator="equal", formula=['"CHECK"'], font=Font(color="C00000", bold=True)))

    # ── Trips ────────────────────────────────────────────────────────────────
    trip_s.groups(1, [(1, 8, "TRIP", "trip"), (9, 9, "MONEY IN", "in"), (10, 16, "MONEY OUT", "out"),
                      (17, 17, "RESULT", "result"), (18, 19, "INFO", "info")])
    trip_s.header(2, ["Trip ID", "Completed Date", "Truck ID", "Registration", "Customer", "Route", "Container No", "KM",
                      "Hire (₹)", "Trip Expenses (₹)", "Diesel (₹)", "AdBlue (₹)", "EMI (₹)", "Tyres (₹)",
                      "Maintenance (₹)", "Documents (₹)", "Profit after all costs (₹)", "Status", "Notes"])
    # The list starts right under the headings; TOTAL sits below it after a
    # blank row, so sorting / filtering the list never moves the totals.
    first, last = 3, 2 + len(trips)
    tr_total = last + 2
    example = None
    active_emi = _active_emi_regs(db)
    for i, t in enumerate(trips):
        r = first + i
        tid = t["truck_id"]
        rt = rates.get(tid) or {}
        km = float(t.get("total_km") or 0)
        hire, texp = float(t["hire_amount"]), float(t["total_expense"])
        counted = not t.get("excluded_from_totals")
        notes = []
        if not counted:
            notes.append(f"Under audit review{': ' + t['flagged_remark'] if t.get('flagged_remark') else ''}")
        grey = None if counted else "808080"
        trip_s.put(r, 1, t.get("trip_code") or "—", bold=True, color=grey)
        trip_s.put(r, 2, _date(t.get("trip_date")), fmt=DATE, color=grey)
        trip_s.put(r, 3, tid, color=grey)
        trip_s.put(r, 4, _reg(t["registration_number"]), color=grey)
        trip_s.put(r, 5, t.get("customer_name") or "—", color=grey)
        route = f"{t.get('from_location')} → {t.get('to_location')}" if t.get("from_location") and t.get("to_location") else "—"
        trip_s.put(r, 6, route, color=grey)
        trip_s.put(r, 7, t.get("container_numbers") or "—", color=grey)
        trip_s.put(r, 8, km, fmt=KM, color=grey)
        trip_s.put(r, 9, hire, fmt=MONEY, color=grey)
        trip_s.put(r, 10, texp, fmt=MONEY, color=grey)

        m = t["money"]
        c = rt.get("cpk")
        d_rate = rt.get("diesel")
        diesel = m["diesel"] or 0.0
        trip_s.put(r, 11, diesel, formula="=" + _lookup(f"H{r}", f"C{r}", "diesel"), fmt=MONEY, color=grey)
        missing = ["Diesel"] if d_rate is None else []
        profit = None
        if c is None or km <= 0:
            if c is None:
                notes.append(f"Profit not calculated: Cost/KM not available for {mode} mode")
        elif m["split"]:
            for col, part, label in TRIP_PARTS:
                trip_s.put(r, col, m["split"][part] or 0.0, formula="=" + _lookup(f"H{r}", f"C{r}", part), fmt=MONEY, color=grey)
                # (AdBlue not set is normal until a truck has 2 AdBlue fills — not noted.)
                if rt.get(part) is None and part != "adblue":
                    if part == "emi" and (t["registration_number"] or "").strip().upper() not in active_emi:
                        notes.append("No active EMI")
                    else:
                        missing.append(label)
            profit = m["final_profit"]
            trip_s.put(r, 17, profit, formula=f"=I{r}-J{r}-K{r}-L{r}-M{r}-N{r}-O{r}-P{r}", fmt=MONEY, bold=True, color=grey)
        else:
            lump = m["truck_expenses"]
            profit = m["final_profit"]
            trip_s.put(r, 17, profit, formula=f"=I{r}-J{r}-K{r}-{lump:.6f}", fmt=MONEY, bold=True, color=grey)
            notes.append(f"Running costs of ₹{lump:,.2f} shown as one amount")
        if missing:
            notes.append(f"Not included yet: {', '.join(missing)}")
        trip_s.put(r, 18, "Counted" if counted else "Under review", color=grey)
        trip_s.put(r, 19, "; ".join(notes), color=grey)
        if not counted:
            for col in range(1, 20):
                trip_s.ws.cell(row=r, column=col).fill = _fill(FILL["review"])
        # The worked example: a counted trip with the most rates set (then the
        # most profitable) — a rate that isn't set shows as "counted as 0".
        if counted and profit is not None and rt.get("known") and d_rate is not None:
            score = (sum(rt.get(k) is not None for _, k, _ in TRIP_PARTS), km >= 100, profit)
            if example is None or score > example[0]:
                example = (score, r, profit, t, km, hire, texp, diesel, rt)

    # Totals (below the list) — counted trips only, as on the page.
    trip_s.put(tr_total, 1, "TOTAL (counted trips)", bold=True, fill=FILL["total"])
    for col in range(2, 20):
        trip_s.ws.cell(row=tr_total, column=col).fill = _fill(FILL["total"])
    counted_rows = [first + i for i, t in enumerate(trips) if not t.get("excluded_from_totals")]
    for col, fmt in ((8, KM), *((c, MONEY) for c in range(9, 18))):
        L = get_column_letter(col)
        total = sum(trip_s.value(rr, col) for rr in counted_rows)
        trip_s.put(tr_total, col, total, formula=f'=SUMIF($R${first}:$R${last},"Counted",{L}{first}:{L}{last})' if trips else None,
                   fmt=fmt, bold=True, fill=FILL["total"])
    trip_s.widths([11, 11, 11, 14, 24, 32, 26, 8, 13, 13, 12, 12, 12, 12, 13, 12, 17, 13, 55])
    trip_s.ws.freeze_panes = "B3"
    if trips:
        trip_s.ws.auto_filter.ref = f"A2:S{last}"
        rng = f"Q{first}:Q{last}"
        trip_s.ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND(ISNUMBER(Q{first}),Q{first}>=0)'], fill=_fill("E2EFDA"), font=Font(color="00612E", bold=True)))
        trip_s.ws.conditional_formatting.add(rng, CellIsRule(operator="lessThan", formula=["0"], fill=_fill("FDE2E1"), font=Font(color="C00000", bold=True)))

    # ── Trip Expenses ────────────────────────────────────────────────────────
    labels = [l for _, l in EXPENSE_LINES]
    exp_s.header(1, ["Trip ID", "Completed Date", "Truck ID", "Registration", *[f"{l} (₹)" for l in labels], "Lines Total (₹)",
                     "Trip Expenses on Trips sheet (₹)", "Check"])
    n_lines = len(EXPENSE_LINES)
    c_first = 5                                     # first expense-line column (after Registration)
    c_total, c_rec, c_chk = c_first + n_lines, c_first + 1 + n_lines, c_first + 2 + n_lines
    L1, Ln = get_column_letter(c_first), get_column_letter(c_first - 1 + n_lines)
    Lt, Lr = get_column_letter(c_total), get_column_letter(c_rec)
    e_first = 2
    for i, t in enumerate(trips):
        r = e_first + i
        exp_s.put(r, 1, t.get("trip_code") or "—", bold=True)
        exp_s.put(r, 2, _date(t.get("trip_date")), fmt=DATE)
        exp_s.put(r, 3, t["truck_id"])
        exp_s.put(r, 4, _reg(t.get("registration_number")) or "—")
        lines = [float((t.get("expense_lines") or {}).get(k) or 0) for k, _ in EXPENSE_LINES]
        for j, v in enumerate(lines):
            exp_s.put(r, c_first + j, v or None, fmt=MONEY)
        total = sum(lines)
        exp_s.put(r, c_total, total, formula=f"=SUM({L1}{r}:{Ln}{r})", fmt=MONEY, bold=True)
        exp_s.put(r, c_rec, float(t["total_expense"]), fmt=MONEY)
        ok = abs(total - float(t["total_expense"])) < 0.01
        exp_s.put(r, c_chk, "OK" if ok else "MISMATCH", formula=f'=IF(ABS({Lt}{r}-{Lr}{r})<0.01,"OK","MISMATCH")', bold=True)
    e_last = e_first + len(trips) - 1
    e_total = max(e_last, e_first - 1) + 2
    exp_s.put(e_total, 1, "TOTAL (all trips)", bold=True, fill=FILL["total"])
    for col in range(2, c_chk + 1):
        exp_s.ws.cell(row=e_total, column=col).fill = _fill(FILL["total"])
    for col in range(c_first, c_rec + 1):
        L = get_column_letter(col)
        exp_s.put(e_total, col, sum(exp_s.value(rr, col) for rr in range(e_first, e_last + 1)),
                  formula=f"=SUM({L}{e_first}:{L}{e_last})" if trips else None, fmt=MONEY, bold=True, fill=FILL["total"])
    exp_s.widths([11, 11, 11, 14, *[13] * n_lines, 14, 17, 11])
    exp_s.ws.freeze_panes = "E2"                    # Trip ID … Registration stay visible
    if trips:
        exp_s.ws.auto_filter.ref = f"A1:{get_column_letter(c_chk)}{e_last}"
        chk = f"{get_column_letter(c_chk)}{e_first}:{get_column_letter(c_chk)}{e_last}"
        exp_s.ws.conditional_formatting.add(chk, CellIsRule(operator="equal", formula=['"OK"'], font=Font(color="00873C", bold=True)))
        exp_s.ws.conditional_formatting.add(chk, CellIsRule(operator="equal", formula=['"MISMATCH"'], fill=_fill("FDE2E1"), font=Font(color="C00000", bold=True)))

    # ── Trucks ───────────────────────────────────────────────────────────────
    n_docs = len(DOCS)
    truck_s.groups(1, [(1, 5, "TRUCK", "trip"), (6, 6, "MONEY IN", "in"), (7, 13, "MONEY OUT", "out"),
                       (14, 14, "RESULT", "result"), (15, 14 + n_docs, "DOCUMENTS — BREAKDOWN", "docs"),
                       (15 + n_docs, 15 + n_docs, "INFO", "info")])
    truck_s.header(2, ["Truck ID", "Registration", "Status", "Trips", "KM", "Hire (₹)", "Trip Expenses (₹)",
                       "Diesel (₹)", "AdBlue (₹)", "Tyres (₹)", "Maintenance bills (₹)", "EMI share (₹)", "Documents (₹)",
                       "Profit after all costs (₹)", *[f"{l} (₹)" for _, l in DOCS], "Notes"])
    D1, Dn = get_column_letter(15), get_column_letter(14 + n_docs)
    t_first, t_last = 3, 2 + len(trucks)
    t_total = t_last + 2
    for i, e in enumerate(trucks):
        r = t_first + i
        tid = e["truck_id"]
        rt = rates.get(tid) or {}
        km = float(e.get("total_km") or 0)
        hire, texp = float(e["total_hire_amount"]), float(e["trip_expenses"])
        maint, emi = float(e["maintenance_expenses"]), float(e["emi_share"])
        docs = {k: float((e.get("document_breakdown") or {}).get(k) or 0) for k, _ in DOCS}
        m = e["money"]
        diesel, tyres, adblue = m["diesel"] or 0.0, m["tyres"] or 0.0, m["adblue"] or 0.0
        doc_total = sum(docs.values())
        notes = []
        if rt.get("diesel") is None:
            notes.append("No diesel rate (counted as 0)")
        if rt.get("tyre") is None:
            notes.append("No tyre rate (counted as 0)")
        if int(e.get("flagged_trip_count") or 0):
            notes.append(f"{e['flagged_trip_count']} trip(s) under audit review — not counted")
        truck_s.put(r, 1, tid, bold=True)
        truck_s.put(r, 2, _reg(e.get("registration_number")))
        truck_s.put(r, 3, e.get("disposal") or "Active")
        truck_s.put(r, 4, int(e.get("trip_count") or 0))
        truck_s.put(r, 5, km, fmt=KM)
        truck_s.put(r, 6, hire, fmt=MONEY)
        truck_s.put(r, 7, texp, fmt=MONEY)
        truck_s.put(r, 8, diesel, formula="=" + _lookup(f"E{r}", f"A{r}", "diesel"), fmt=MONEY)
        truck_s.put(r, 9, adblue, formula="=" + _lookup(f"E{r}", f"A{r}", "adblue"), fmt=MONEY)
        truck_s.put(r, 10, tyres, formula="=" + _lookup(f"E{r}", f"A{r}", "tyre"), fmt=MONEY)
        truck_s.put(r, 11, maint, fmt=MONEY)
        truck_s.put(r, 12, emi, fmt=MONEY)
        truck_s.put(r, 13, doc_total, formula=f"=SUM({D1}{r}:{Dn}{r})", fmt=MONEY)
        truck_s.put(r, 14, m["net"],
                    formula=f"=F{r}-G{r}-H{r}-I{r}-J{r}-K{r}-L{r}-M{r}", fmt=MONEY, bold=True)
        for j, (k, _) in enumerate(DOCS):
            truck_s.put(r, 15 + j, docs[k] or None, fmt=MONEY)
        truck_s.put(r, 15 + n_docs, "; ".join(notes))
    truck_s.put(t_total, 1, "TOTAL", bold=True, fill=FILL["total"])
    for col in range(2, 16 + n_docs):
        truck_s.ws.cell(row=t_total, column=col).fill = _fill(FILL["total"])
    for col in [4, 5, *range(6, 15 + n_docs)]:
        L = get_column_letter(col)
        fmt = None if col == 4 else KM if col == 5 else MONEY
        truck_s.put(t_total, col, sum(truck_s.value(rr, col) for rr in range(t_first, t_last + 1)),
                    formula=f"=SUM({L}{t_first}:{L}{t_last})" if trucks else None, fmt=fmt, bold=True, fill=FILL["total"])
    if part_of_truck:
        truck_s.put(t_total + 2, 1, "Each truck's figures are for the whole period, including trips not matching "
                                    "the search — bills, EMI and documents can't be split by trip.", color="808080")
    truck_s.widths([11, 15, 9, 7, 9, 14, 14, 13, 12, 12, 14, 12, 12, 17, *[12] * n_docs, 45])
    truck_s.ws.freeze_panes = "C3"
    if trucks:
        truck_s.ws.auto_filter.ref = f"A2:{get_column_letter(15 + n_docs)}{t_last}"
        rng = f"N{t_first}:N{t_last}"
        truck_s.ws.conditional_formatting.add(rng, CellIsRule(operator="greaterThanOrEqual", formula=["0"], fill=_fill("E2EFDA"), font=Font(color="00612E", bold=True)))
        truck_s.ws.conditional_formatting.add(rng, CellIsRule(operator="lessThan", formula=["0"], fill=_fill("FDE2E1"), font=Font(color="C00000", bold=True)))

    # ── Summary ──────────────────────────────────────────────────────────────
    s = summary
    s.put(1, 1, "Profitability Report", bold=True, size=16, color=NAVY)
    s.put(2, 1, f"{_d(start.isoformat())} to {_d(end.isoformat())}  ·  Cost/KM mode: {mode}")
    s.put(3, 1, f"Downloaded {datetime.now(IST).strftime('%d-%m-%Y %I:%M %p')}", color="808080")
    if search:
        s.put(4, 1, f'Search: "{search}" (only matching trips are in this report)', bold=True, color="C00000")

    def tot(col):
        return trip_s.value(tr_total, col)

    n_counted = len(counted_rows)
    n_review = len(trips) - n_counted
    losses = sum(1 for rr in counted_rows if (rr, 17) in trip_s.values and trip_s.value(rr, 17) < 0)
    running = tot(13) + tot(14) + tot(15) + tot(16)
    s.put(5, 1, "THE BIG PICTURE (counted trips)", bold=True, color="FFFFFF", fill=NAVY)
    s.put(5, 2, "", fill=NAVY)
    big = [
        ("Trips", n_counted, f'=COUNTIF(Trips!$R${first}:$R${last},"Counted")', None),
        ("Trips under audit review (not counted)", n_review, f'=COUNTIF(Trips!$R${first}:$R${last},"Under review")', None),
        ("Hire (money in) (₹)", tot(9), f"=Trips!I{tr_total}", MONEY),
        ("Trip expenses (₹)", tot(10), f"=Trips!J{tr_total}", MONEY),
        ("Diesel (₹)", tot(11), f"=Trips!K{tr_total}", MONEY),
        ("AdBlue (₹)", tot(12), f"=Trips!L{tr_total}", MONEY),
        ("Running costs — EMI + Tyres + Maintenance + Documents (₹)", running, f"=SUM(Trips!M{tr_total}:P{tr_total})", MONEY),
        ("Profit after all costs (₹)", tot(17), f"=Trips!Q{tr_total}", MONEY),
        ("Trips that made a loss", losses, f'=COUNTIFS(Trips!$Q${first}:$Q${last},"<0",Trips!$R${first}:$R${last},"Counted")', None),
    ]
    for j, (label, v, f, fmt) in enumerate(big):
        r = 6 + j
        is_profit = label.startswith("Profit")
        s.put(r, 1, label, bold=is_profit)
        s.put(r, 2, v, formula=f if trips else None, fmt=fmt, bold=True,
              color=("00612E" if (v or 0) >= 0 else "C00000") if is_profit else None)

    r = 16
    s.put(r, 1, "HOW ONE TRIP IS WORKED OUT", bold=True, color="FFFFFF", fill=NAVY)
    s.put(r, 2, "", fill=NAVY)
    if example:
        _, er, profit, t, km, hire, texp, diesel, rt = example
        route = f"{t.get('from_location')} → {t.get('to_location')}"

        def per_km(part, label, col):
            rate = rt.get(part)
            how = f"{km:,.0f} km × ₹{rate:.2f} per km" if rate is not None else "no rate set — counted as 0"
            return (f"− {label}  ({how})", km * (rate or 0), f"=Trips!{col}{er}", MONEY)
        steps = [
            ("Trip", f"{t.get('trip_code')}  ·  {route}  ·  {km:,.0f} km", None, None),
            ("Hire (money in) (₹)", hire, f"=Trips!I{er}", MONEY),
            ("− Trip expenses (driver pay, toll, port pass, …)", texp, f"=Trips!J{er}", MONEY),
            (f"− Diesel  ({km:,.0f} km × ₹{rt['diesel']:.2f} per km)", diesel, f"=Trips!K{er}", MONEY),
            per_km("adblue", "AdBlue", "L"),
            per_km("emi", "EMI", "M"),
            per_km("tyre", "Tyres", "N"),
            per_km("maintenance", "Maintenance", "O"),
            per_km("compliance", "Documents", "P"),
            ("Profit after all costs (₹)", profit, f"=Trips!Q{er}", MONEY),
        ]
        for j, (label, v, f, fmt) in enumerate(steps):
            rr = r + 1 + j
            last_step = j == len(steps) - 1   # (a label starting "=" would become a formula)
            s.put(rr, 1, label, bold=last_step or j == 0)
            s.put(rr, 2, v, formula=f, fmt=fmt, bold=last_step)
            if last_step:
                s.ws.cell(row=rr, column=1).border = Border(top=THIN)
                s.ws.cell(row=rr, column=2).border = Border(top=THIN)
        r = r + 1 + len(steps)
    else:
        s.put(r + 1, 1, "No counted trip in this period has its truck's rates set, so there's no example to show.")
        r += 2

    r += 1
    s.put(r, 1, "WHAT'S IN THIS FILE", bold=True, color="FFFFFF", fill=NAVY)
    s.put(r, 2, "", fill=NAVY)
    guide = [
        ("Trips", "One row per trip. Read it left to right: Hire − every cost = Profit."),
        ("Period", "A trip counts in the period it was completed, whenever its sheet was entered."),
        ("Sorting", "Every sheet can be sorted and filtered — amounts are plain numbers in ₹ (see each heading) "
                    "and each TOTAL row sits below its list, so sorting never moves it."),
        ("AdBlue", "Like diesel: the truck's AdBlue km per litre (from Truck's AdBlue History) and its "
                   "manufacturer's AdBlue price. ₹0 until a truck has at least 2 AdBlue fills."),
        ("Trip Expenses", "Every expense line of each trip sheet. Check says OK when they add up."),
        ("Trucks", "One row per truck for the whole period, using the actual bills, EMI and documents."),
        ("Rates", "Each truck's cost per km. Every per-km cost looks its rate up here — fix a wrong rate once."),
        ("Tip", "Click any amount to see how it's worked out (it's a formula)."),
        ("Good to know", "Trips charge maintenance, EMI and documents at an average per km; Trucks use the real "
                         "bills in this period — so the two sheets' totals differ, and both are right."),
        ("Grey rows", "Trips under audit review — listed, but not counted until the review is done."),
    ]
    for j, (a, b) in enumerate(guide):
        s.put(r + 1 + j, 1, a, bold=True)
        s.put(r + 1 + j, 2, b, wrap=True)
    s.widths([58, 90])

    for sh in (trip_s, exp_s, truck_s, rate_s):
        sh.ws.sheet_view.zoomScale = 90
    wb.calculation.fullCalcOnLoad = True

    buf = BytesIO()
    wb.save(buf)
    # (A header value: typed text goes through as letters and digits only.)
    tag = re.sub(r"[^A-Za-z0-9]+", "_", search).strip("_")[:40]
    filename = f"Profitability_{_d(start.isoformat())}_to_{_d(end.isoformat())}_{mode}{'_' + tag if tag else ''}.xlsx"
    preview = [
        summary.preview("Summary"),
        trip_s.preview("Trips", first_row=2),
        exp_s.preview("Trip Expenses"),
        truck_s.preview("Trucks", first_row=2),
        rate_s.preview("Rates"),
    ]
    return buf.getvalue(), filename, preview
