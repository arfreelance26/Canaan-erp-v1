"""Finance Hub → View: the Finance reports, in the Resource Hub report shape.

Each page builds the same structure resource_report.py does — key figures and
tables for the Summary, then one sheet per item made of fact boxes and tables
— and registers its kind there, so the Excel writer, the preview endpoint and
the PDF (lib/resource-report-pdf.ts) are shared:

  drivercomp   Driver Compensation: a sheet per driver — their Salary Record
               for the period (routers/finance.py salary_statement, the same
               figures as the page's Salary Record), plus the advance / salary
               entries recorded for them
  emi          EMI Tracking: a sheet per loan (where it stands, installments
               logged — the page's rule), overdue, ending soon, by bank, and
               a Recurring Payments sheet
  detention    Customer Detention: a sheet per status (the page's —
               routers/party_halt.py rows) and one per customer
  compliance   Compliance & Renewals: a sheet per document (the page's
               statuses and warning windows), every truck side by side, and
               the renewals coming up
  staffcomp    Staff Compensation: a sheet per staff member, month by month

Money only, no cost per km. IDs and bank numbers are masked to their last 4.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

import models
import resource_report as rr
from audit_report import _inr
from maintenance_report import _iso, _period_label, _sheet_names
from resource_report import box, clean, mask, table


def _label(start: date | None, end: date | None) -> str:
    return _period_label(start, end) if start or end else "All time"


# ── Driver Compensation ──────────────────────────────────────────────────────

def _drivercomp(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    from routers.finance import salary_statement
    start, end = (opts or {}).get("start"), (opts or {}).get("end")
    s_iso, e_iso = _iso(start), _iso(end)
    term = search.lower()

    entries = defaultdict(list)          # drivers.id → recorded Advance / Salary entries in the period
    eq = db.query(models.CompensationTransaction).filter(models.CompensationTransaction.person_type == "driver")
    if start:
        eq = eq.filter(models.CompensationTransaction.date >= start)
    if end:
        eq = eq.filter(models.CompensationTransaction.date <= end)
    for t in eq.order_by(models.CompensationTransaction.date.desc(), models.CompensationTransaction.id.desc()):
        entries[t.person_id].append(t)

    drivers = [d for d in db.query(models.Driver).options(rr.slim(models.Driver)).order_by(models.Driver.name)
               if (d.deleted_at is None or d.id in entries)
               and (not term or term in (d.name or "").lower() or term in (d.driver_id or "").lower())]

    people = []
    for d in drivers:
        st = salary_statement(db, d.driver_id, s_iso, e_iso)
        part = {p["key"]: p for p in st["parts"]}
        recorded = entries.get(d.id, [])
        if not any(p["count"] for p in st["parts"]) and not recorded:
            continue                       # nothing for this driver in the period
        people.append((d, st, part, recorded))
    people.sort(key=lambda x: (-x[1]["net_payable"], x[0].name or ""))

    names = _sheet_names([clean(d.name) or d.driver_id for d, *_ in people])
    tot = defaultdict(float)
    by_driver, items = [], []
    for (d, st, part, recorded), sheet in zip(people, names):
        rec_salary = sum(float(t.amount or 0) for t in recorded if t.type == "Salary")
        rec_adv = sum(float(t.amount or 0) for t in recorded if t.type == "Advance")
        vals = {k: part[k]["amount"] for k in part}
        for k, v in vals.items():
            tot[k] += v
        tot["net"] += st["net_payable"]
        tot["rec_salary"] += rec_salary
        tot["rec_adv"] += rec_adv
        net_tone = "bad" if st["net_payable"] < 0 else None
        by_driver.append([{"v": clean(d.name) or d.driver_id, "link": sheet}, d.driver_id, part["trips"]["count"],
                          vals["trips"], vals["halt"], vals["cleaner"], vals["workshop"], vals["workshopAdvance"],
                          {"v": st["net_payable"], "tone": net_tone}, rec_salary, rec_adv])

        trips = [[r["date"], r["trip_id"], clean(r["truck_registration"]), rr.CAT.get(r["trip_category"] or "", clean(r["trip_category"])),
                  {"v": 0, "tone": "warn"} if r["batta_excluded"] else r["regular_pay"], r["advance"], r["expenses"],
                  {"v": round(r["net_payable"], 2), "tone": "bad" if r["net_payable"] < 0 else None}]
                 for r in part["trips"]["rows"]]
        halts = [[r["date"], r["trip_id"], clean(r["truck_registration"]), r["company_days"], r["party_days"], r["amount"]]
                 for r in part["halt"]["rows"]]

        def days(key):
            return [[r["date"], r["status"], clean(r["truck_registration"]), clean(r["branch"]), r["amount"]] for r in part[key]["rows"]]

        rec_rows = [[_iso(t.date), {"v": t.type, "tone": "warn" if t.type == "Advance" else None}, float(t.amount or 0),
                     clean(t.trip_number), clean(t.note)] for t in recorded]
        day_cols = [("Date", "date"), ("Attendance", "text"), ("Truck", "text"), ("Branch", "text"), ("Amount (₹)", "money")]
        tables = [
            table("TRIP SALARY RECORD — by the trip sheet's completed date",
                  [("Completed", "date"), ("Trip", "text"), ("Truck", "text"), ("Category", "text"), ("Regular pay (₹)", "money"),
                   ("Advance (₹)", "money"), ("Driver expenses (₹)", "money"), ("Net payable (₹)", "money")],
                  trips, total=["TOTAL", f"{len(trips)} trips", "", "", sum(r[4]["v"] if isinstance(r[4], dict) else r[4] for r in trips),
                                sum(r[5] for r in trips), sum(r[6] for r in trips), vals["trips"]]),
            table("HALT PAY OWED", [("Completed", "date"), ("Trip", "text"), ("Truck", "text"), ("Company halt days", "num"),
                                    ("Party halt days", "num"), ("Amount (₹)", "money")],
                  halts, total=["TOTAL", f"{len(halts)} trips", "", sum(r[3] for r in halts), sum(r[4] for r in halts), vals["halt"]]),
            table("CLEANER BATTA — by attendance day", day_cols, days("cleaner"), total=["TOTAL", f"{part['cleaner']['count']} days", "", "", vals["cleaner"]]),
            table("WORKSHOP BATTA — by attendance day", day_cols, days("workshop"), total=["TOTAL", f"{part['workshop']['count']} days", "", "", vals["workshop"]]),
            table("WORKSHOP ADVANCE — taken off", day_cols, days("workshopAdvance"),
                  total=["TOTAL", f"{part['workshopAdvance']['count']} days", "", "", vals["workshopAdvance"]]),
            table("ADVANCES AND SALARY RECORDED", [("Date", "date"), ("Type", "text"), ("Amount (₹)", "money"), ("Trip", "text"), ("Note", "text")],
                  rec_rows, total=["TOTAL", f"{len(rec_rows)} entries", rec_salary + rec_adv, "", ""]),
        ]
        items.append({
            "sheet": sheet, "title": clean(d.name) or d.driver_id,
            "subtitle": f"{d.driver_id} · Salary Record · {_label(start, end)}",
            "boxes": [
                box("DRIVER", [("Driver ID", d.driver_id), ("Phone", clean(d.contact_number)),
                               ("Bank", clean(d.bank_name)), ("Account (last 4)", mask(d.account_number)),
                               ("Status", "Removed" if d.deleted_at else "Active", "text", "warn" if d.deleted_at else None)]),
                box("SALARY RECORD", [("Trip Salary Record (net payable)", vals["trips"], "money"),
                                      ("+ Halt pay owed", vals["halt"], "money"),
                                      ("+ Cleaner Batta", vals["cleaner"], "money"),
                                      ("+ Workshop Batta", vals["workshop"], "money"),
                                      ("− Workshop Advance", vals["workshopAdvance"], "money", "warn" if vals["workshopAdvance"] else None),
                                      ("= Final Net Payable", st["net_payable"], "money", "bad" if st["net_payable"] < 0 else "good")]),
                box("RECORDED ON THE PAGE", [("Salary entries (₹)", rec_salary, "money"), ("Advance entries (₹)", rec_adv, "money"),
                                             ("Entries", len(recorded), "num")]),
            ],
            "tables": tables,
        })

    negative = [r for r in by_driver if r[8]["v"] < 0]
    return {
        "period": {"start": s_iso, "end": e_iso, "label": _label(start, end)},
        "kpis": [{"label": "Final Net Payable", "value": _inr(tot["net"]), "tone": "bad" if tot["net"] < 0 else "good" if tot["net"] else None,
                  "note": f"{len(people)} drivers"},
                 {"label": "Trip salary (net)", "value": _inr(tot["trips"]), "note": "after trip advances and expenses"},
                 {"label": "Halt pay + batta", "value": _inr(tot["halt"] + tot["cleaner"] + tot["workshop"]),
                  "note": f"halt {_inr(tot['halt'])}, cleaner {_inr(tot['cleaner'])}, workshop {_inr(tot['workshop'])}"},
                 {"label": "Owing the company", "value": str(len(negative)), "tone": "bad" if negative else None,
                  "note": "drivers whose net payable is below zero"}],
        "tables": [
            table("BY DRIVER — click a name to open their Salary Record",
                  [("Driver", "link"), ("Driver ID", "text"), ("Trips", "num"), ("Trip salary (₹)", "money"), ("Halt pay (₹)", "money"),
                   ("Cleaner Batta (₹)", "money"), ("Workshop Batta (₹)", "money"), ("Workshop Advance (₹)", "money"),
                   ("Final Net Payable (₹)", "money"), ("Salary recorded (₹)", "money", False), ("Advances recorded (₹)", "money", False)],
                  by_driver, total=["TOTAL", "", sum(r[2] for r in by_driver), tot["trips"], tot["halt"], tot["cleaner"], tot["workshop"],
                                    tot["workshopAdvance"], tot["net"], tot["rec_salary"], tot["rec_adv"]]),
        ],
        "notes": [
            "Final Net Payable = Trip Salary Record's net payable + halt pay owed + Cleaner Batta + Workshop Batta − Workshop Advance — "
            "the same Salary Record as on the Driver Compensation page.",
            "A trip's net payable = its regular pay − (advance − driver expenses). A Return Trip without batta pays no batta (marked amber) "
            "but its advance is still taken off. Trips and halt pay follow the trip sheet's completed date; batta and advances the attendance day.",
            "Advances and salary recorded on the page are listed for each driver as entered; they aren't taken off the net payable again, "
            "because trip advances are already inside each trip's line.",
            "Bank account numbers are masked to their last 4.",
        ],
        "items": items,
    }


# ── EMI Tracking ─────────────────────────────────────────────────────────────

def _month_day(y: int, m: int, day: int) -> date:
    """That day of month m (clamped to the month's end); m may run past 12."""
    import calendar
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    return date(y, m, min(day, calendar.monthrange(y, m)[1]))


def _emi_schedule(r: models.EmiRecord, today: date) -> tuple[list[date], date | None]:
    """The installments logged so far — the same creation-anchored rule as the
    EMI Tracking page (lib/emi-schedule.ts): one when the EMI was added, then
    one on every Auto-Debit Date since — and the next one due (None once done)."""
    tenure = r.tenure_months or 0
    created = r.created_at.date() if r.created_at else r.emi_start_date
    if not created or tenure <= 0 or not float(r.emi_amount or 0):
        return [], None
    day = r.auto_debit_date.day if r.auto_debit_date else created.day
    months = (today.year - created.year) * 12 + (today.month - created.month) - (1 if today.day < day else 0)
    paid = min(tenure, max(0, months) + 1)
    dates = [created if i == 0 else _month_day(created.year, created.month + i, day) for i in range(paid)]
    nxt = _month_day(created.year, created.month + paid, day) if paid < tenure else None
    return dates, nxt


def _emi(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    start, end = (opts or {}).get("start"), (opts or {}).get("end")
    term = search.lower()
    q = db.query(models.EmiRecord)
    # In the period when the loan's dates overlap it (the page's rule); a missing date is open-ended.
    if start:
        q = q.filter((models.EmiRecord.emi_end_date.is_(None)) | (models.EmiRecord.emi_end_date >= start))
    if end:
        q = q.filter((models.EmiRecord.emi_start_date.is_(None)) | (models.EmiRecord.emi_start_date <= end))
    loans = [r for r in q.order_by(models.EmiRecord.emi_name)
             if not term or any(term in (x or "").lower() for x in (r.emi_name, r.truck_registration, r.bank_name))]

    rows_out, items, ending, overdue = [], [], [], []
    banks = defaultdict(lambda: [0, 0.0, 0.0, 0.0])
    tot = defaultdict(float)
    names = _sheet_names([clean(r.truck_registration) or clean(r.emi_name) or f"EMI {r.id}" for r in loans] + ["Recurring Payments"])
    for r, sheet in zip(loans, names):
        amount, tenure = float(r.emi_amount or 0), r.tenure_months or 0
        dates, nxt = _emi_schedule(r, today)
        paid_n = len(dates)
        paid, payable = paid_n * amount, amount * tenure
        remaining = max(0.0, payable - paid)
        done = tenure > 0 and paid_n >= tenure
        late = not done and r.emi_end_date is not None and today > r.emi_end_date
        status = {"v": "Completed", "tone": "good"} if done else {"v": "Overdue", "tone": "bad"} if late else {"v": "Active", "tone": None}
        if late:
            overdue.append([{"v": clean(r.emi_name), "link": sheet}, clean(r.truck_registration), _iso(r.emi_end_date),
                            tenure - paid_n, remaining])
        if not done and r.emi_end_date and 0 <= (r.emi_end_date - today).days <= 92:
            ending.append([{"v": clean(r.emi_name), "link": sheet}, clean(r.truck_registration), _iso(r.emi_end_date),
                           (r.emi_end_date - today).days, remaining])
        b = banks[clean(r.bank_name) or "—"]
        b[0] += 1
        b[1] += float(r.loan_amount or 0)
        b[2] += 0 if done else amount
        b[3] += remaining
        tot["loan"] += float(r.loan_amount or 0)
        tot["monthly"] += 0 if done else amount
        tot["paid"] += paid
        tot["remaining"] += remaining
        tot["active"] += 0 if done else 1
        rows_out.append([{"v": clean(r.emi_name), "link": sheet}, clean(r.truck_registration), clean(r.bank_name),
                         float(r.loan_amount or 0), amount, f"{paid_n} of {tenure}", paid, remaining,
                         _iso(nxt) if nxt else "", status])
        sched = [[i + 1, _iso(d), amount, amount * (i + 1), max(0.0, payable - amount * (i + 1))] for i, d in enumerate(dates)]
        items.append({
            "sheet": sheet, "title": clean(r.emi_name) or sheet,
            "subtitle": f"{clean(r.bank_name)} · {clean(r.truck_registration) or 'no truck'} · {status['v']}",
            "boxes": [
                box("LOAN", [("Bank", clean(r.bank_name)), ("Loan number (last 4)", mask(r.loan_number)),
                             ("Truck", clean(r.truck_registration)), ("Loan amount (₹)", float(r.loan_amount or 0), "money"),
                             ("EMI start", _iso(r.emi_start_date), "date"), ("EMI end", _iso(r.emi_end_date), "date"),
                             ("Auto-debit day", r.auto_debit_date.day if r.auto_debit_date else "", "num")]),
                box("WHERE IT STANDS", [("EMI amount (₹)", amount, "money"), ("Tenure (months)", tenure, "num"),
                                        ("Installments logged", paid_n, "num"), ("Amount paid (₹)", paid, "money"),
                                        ("Total EMI payable (₹)", payable, "money"),
                                        ("Remaining (₹)", remaining, "money", "warn" if late else None),
                                        ("Next installment", _iso(nxt) if nxt else "—", "date"),
                                        ("Status", status["v"], "text", status["tone"])]),
            ],
            "tables": [table("INSTALLMENTS LOGGED", [("#", "num"), ("Date", "date"), ("EMI (₹)", "money"),
                                                     ("Paid so far (₹)", "money"), ("Remaining (₹)", "money")],
                             sched, total=["TOTAL", f"{paid_n} installments", paid, None, None])],
        })

    recurring = db.query(models.RecurringPayment).order_by(models.RecurringPayment.next_due_date, models.RecurringPayment.title).all()
    rec_rows, monthly_rec = [], 0.0
    per_month = {"Monthly": 1, "Quarterly": 3, "Yearly": 12}
    for p in recurring:
        due = p.next_due_date
        left = (due - today).days if due else None
        tone = "bad" if left is not None and left < 0 else "warn" if left is not None and left <= 7 else None
        if p.status == "Active":
            monthly_rec += float(p.amount or 0) / per_month.get(p.frequency, 1)
        rec_rows.append([clean(p.title), clean(p.category), float(p.amount or 0), p.frequency,
                         {"v": _iso(due), "tone": tone} if due else "", left, p.status])
    items.append({
        "sheet": names[-1], "title": "Recurring Payments", "subtitle": f"{len(recurring)} payments · by next due date",
        "boxes": [box("RECURRING", [("Payments", len(recurring), "num"),
                                    ("Active", sum(1 for p in recurring if p.status == "Active"), "num"),
                                    ("About a month (₹)", round(monthly_rec, 2), "money")])],
        "tables": [table("RECURRING PAYMENTS", [("Title", "text"), ("Category", "text"), ("Amount (₹)", "money"), ("Frequency", "text"),
                                                ("Next due", "date"), ("Days left", "num"), ("Status", "text")], rec_rows)],
    })

    ending.sort(key=lambda x: x[3])
    bank_rows = [[k, v[0], v[1], v[2], v[3]] for k, v in sorted(banks.items(), key=lambda kv: -kv[1][3])]
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end)},
        "kpis": [{"label": "Loans running", "value": str(int(tot["active"])), "note": f"of {len(loans)} EMIs"},
                 {"label": "Monthly EMI outflow", "value": _inr(tot["monthly"]), "note": "the loans still running"},
                 {"label": "Remaining payable", "value": _inr(tot["remaining"]), "note": f"{_inr(tot['paid'])} paid so far"},
                 {"label": "Overdue", "value": str(len(overdue)), "tone": "bad" if overdue else None,
                  "note": "past their end date, still not complete"}],
        "tables": [
            table("EVERY EMI — click a name to open its sheet",
                  [("EMI", "link"), ("Truck", "text"), ("Bank", "text"), ("Loan (₹)", "money"), ("EMI (₹)", "money"),
                   ("Installments", "text"), ("Paid (₹)", "money"), ("Remaining (₹)", "money"), ("Next due", "date"), ("Status", "text")],
                  rows_out, total=["TOTAL", "", "", tot["loan"], None, "", tot["paid"], tot["remaining"], None, ""]),
            table("OVERDUE — past the end date, not complete", [("EMI", "link"), ("Truck", "text"), ("Ended", "date"),
                                                                ("Installments short", "num"), ("Remaining (₹)", "money")], overdue),
            table("ENDING IN THE NEXT 3 MONTHS", [("EMI", "link"), ("Truck", "text"), ("Ends", "date"), ("Days left", "num"),
                                                  ("Remaining (₹)", "money")], ending),
            table("BY BANK", [("Bank", "text"), ("EMIs", "num"), ("Loan (₹)", "money"), ("Monthly EMI (₹)", "money"), ("Remaining (₹)", "money")],
                  bank_rows, total=["TOTAL", sum(r[1] for r in bank_rows), tot["loan"], tot["monthly"], tot["remaining"]]),
        ],
        "notes": [
            "Amount paid follows the EMI Tracking page: one installment when the EMI was added to the app, then one on every "
            "Auto-Debit Date since. Remaining = EMI × tenure − amount paid.",
            "Overdue = the loan's end date has passed but its installments haven't all been logged — worth checking the tenure or dates.",
            "With a period, an EMI is included when its start–end dates overlap it.",
            "Loan numbers are masked to their last 4. The Recurring Payments sheet lists every recurring payment, whatever the period.",
        ],
        "items": items,
    }


# ── Customer Detention ───────────────────────────────────────────────────────

DETENTION_STATUSES = ["Missed on invoice", "Not billed", "Billed", "Paid", "Invoice waived"]
DETENTION_TONE = {"Missed on invoice": "bad", "Not billed": "warn", "Billed": None, "Paid": "good", "Invoice waived": None}


def _detention(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """The Customer Detention page (routers/party_halt.py rows — the same
    statuses): a sheet per status and one By Customer. opts["rtype"] = one status."""
    from routers import party_halt as ph
    start, end = (opts or {}).get("start"), (opts or {}).get("end")
    only = (opts or {}).get("rtype") or ""
    every = ph.rows(db)
    items_all = ph._filtered(every, only if only in DETENTION_STATUSES else None, search, _iso(start), _iso(end))
    t = ph.totals(items_all, today)

    groups = {s: [r for r in items_all if r["status"] == s] for s in DETENTION_STATUSES}
    groups = {s: rows for s, rows in groups.items() if rows}
    names = _sheet_names(list(groups) + ["Customers"])   # "By Customer" is a reserved sheet name
    sheet_of = dict(zip(groups, names))

    def trip_row(r):
        return [r["trip_id"], r["customer"], r["completed_date"], r["party_days"], r["amount"], r["invoice_no"] or "",
                r["invoice_date"], r["billed_amount"] or None, {"v": r["status"], "tone": DETENTION_TONE[r["status"]]},
                r["paid_on"], r["paid_amount"], clean(r["paid_by"]), "Yes" if r["proof_file_name"] else ("No" if r["status"] == "Paid" else "")]

    cols = [("Trip", "text"), ("Customer", "text"), ("Completed", "date"), ("Party halt days", "num"), ("Halt amount (₹)", "money"),
            ("Invoice", "text"), ("Invoice date", "date"), ("Halt on invoice (₹)", "money"), ("Status", "text"),
            ("Paid on", "date"), ("Paid (₹)", "money"), ("Saved by", "text", False), ("Proof", "text", False)]
    about = {
        "Missed on invoice": "Invoiced without a Halt Pay line — the customer was never charged for the halt.",
        "Not billed": "The trip isn't invoiced yet — add the halt when it is.",
        "Billed": "On the invoice (a line linked to Halt Pay) — waiting for the customer to pay.",
        "Paid": "Marked paid on the Customer Detention page.",
        "Invoice waived": "The trip's invoice was waived, so there's nothing to bill.",
    }
    items = []
    for s, rows in groups.items():
        amt = sum(r["amount"] for r in rows)
        items.append({
            "sheet": sheet_of[s], "title": s, "subtitle": f"{len(rows)} trips · {_inr(amt)} of halt pay · {about[s]}",
            "boxes": [box("THIS STATUS", [("Status", s, "text", DETENTION_TONE[s]), ("Trips", len(rows), "num"),
                                          ("Halt amount (₹)", amt, "money"), ("Party halt days", sum(r["party_days"] or 0 for r in rows), "num")])],
            "tables": [table(f"{s.upper()} — newest first", cols, [trip_row(r) for r in rows],
                             total=["TOTAL", f"{len(rows)} trips", None, sum(r["party_days"] or 0 for r in rows), amt, "", None,
                                    sum(r["billed_amount"] or 0 for r in rows), "", None, sum(r["paid_amount"] or 0 for r in rows), "", ""])],
        })

    cust = defaultdict(lambda: defaultdict(float))
    for r in items_all:
        c = cust[r["customer"]]
        c["trips"] += 1
        c["amount"] += r["amount"]
        c[r["status"]] += r["amount"]
        c["paid"] += r["paid_amount"] or 0
    cust_rows = [[k, int(v["trips"]), v["amount"], v["Missed on invoice"], v["Not billed"], v["Billed"], v["paid"],
                  v["Missed on invoice"] + v["Not billed"] + v["Billed"]]
                 for k, v in sorted(cust.items(), key=lambda kv: -(kv[1]["Missed on invoice"] + kv[1]["Not billed"] + kv[1]["Billed"]))]
    cust_total = ["TOTAL", sum(r[1] for r in cust_rows)] + [sum(r[i] for r in cust_rows) for i in range(2, 8)]
    cust_cols = [("Customer", "text"), ("Trips", "num"), ("Halt amount (₹)", "money"), ("Missed on invoice (₹)", "money"),
                 ("Not billed (₹)", "money"), ("Billed, unpaid (₹)", "money"), ("Paid (₹)", "money"), ("To recover (₹)", "money")]
    items.append({"sheet": names[-1], "title": "By Customer", "subtitle": f"{len(cust_rows)} customers · most to recover first",
                  "boxes": [], "tables": [table("BY CUSTOMER", cust_cols, cust_rows, total=cust_total)]})

    by_status = [[{"v": s, "link": sheet_of[s]}, len(rows), sum(r["amount"] for r in rows)] for s, rows in groups.items()]
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end) + (f" · {only}" if only else "")},
        "kpis": [{"label": "To recover", "value": _inr(t["outstanding_amount"]), "tone": "warn" if t["outstanding_amount"] else None,
                  "note": f"{t['outstanding_trips']} trips not paid back yet"},
                 {"label": "Missed on invoice", "value": str(t["missed_on_invoice"]), "tone": "bad" if t["missed_on_invoice"] else None,
                  "note": "invoiced without halting charges"},
                 {"label": "Billed, awaiting payment", "value": str(t["billed_trips"]), "note": _inr(t["billed_amount"])},
                 {"label": "Paid back", "value": _inr(t["paid_amount"]), "tone": "good" if t["paid_amount"] else None,
                  "note": f"{_inr(t['paid_this_month'])} this month"}],
        "tables": [
            table("BY STATUS — click to open its sheet", [("Status", "link"), ("Trips", "num"), ("Halt amount (₹)", "money")],
                  by_status, total=["TOTAL", sum(r[1] for r in by_status), sum(r[2] for r in by_status)]),
            table("MOST TO RECOVER — top 10 customers", cust_cols, cust_rows[:10]),
        ],
        "notes": [
            "Party halt is the halt pay owed to the driver for customer delays; the company bills it to the customer. "
            "The statuses are the Customer Detention page's: Billed is read from the invoice itself (a line linked to Halt Pay).",
            "To recover = Missed on invoice + Not billed + Billed (not paid yet).",
            "Trips are picked by their completed date. Proofs of payment are in the Proof Pack (Reports Center → Records).",
        ],
        "items": items,
    }


# ── Compliance & Renewals ────────────────────────────────────────────────────

# (expiry field, cost field, name, number field, warning days) — the page's DOC_COSTS and lib/compliance.ts WARNING_DAYS.
COMPLIANCE_DOCS = [
    ("rc_validity_date", "rc_expenses", "RC", None, 30),
    ("fc_expiry_date", "fc_expenses", "FC", None, 30),
    ("road_tax_date", "road_tax_expenses", "Road Tax", "road_tax_number", 10),
    ("national_permit_date", "national_permit_expenses", "National Permit", "national_permit_number", 10),
    ("local_permit_date", "local_permit_expenses", "Local Permit", "local_permit_number", 10),
    ("pollution_certificate_date", "pollution_certificate_expenses", "Pollution Cert.", None, 7),
    ("insurance_expiry_date", "insurance_expenses", "Insurance", None, 7),
]
COMPLIANCE_STATUSES = ["Expired", "Expiring Soon", "Not Uploaded", "Valid"]
COMPLIANCE_TONE = {"Expired": "bad", "Expiring Soon": "warn", "Not Uploaded": None, "Valid": "good"}
# The page's document filter order: what needs doing first — expired, then not
# uploaded, then due soon, then valid (lib/compliance.ts COMPLIANCE_URGENCY).
COMPLIANCE_URGENCY = ["Expired", "Not Uploaded", "Expiring Soon", "Valid"]


def compliance_sort_key(status: str, expiry: date | None, reg: str):
    """Most urgent first: by COMPLIANCE_URGENCY; inside a group the earliest expiry
    (most overdue / soonest due), and Not Uploaded by registration."""
    return (COMPLIANCE_URGENCY.index(status), expiry or date.max, reg or "")


def compliance_status(expiry: date | None, warn_days: int, today: date) -> str:
    """The Compliance & Renewals page's rule (lib/compliance.ts getComplianceStatus)."""
    if not expiry:
        return "Not Uploaded"
    left = (expiry - today).days
    return "Expired" if left < 0 else "Expiring Soon" if left <= warn_days else "Valid"


def _compliance(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """The Compliance & Renewals page: a sheet per document, one with every
    truck's documents side by side, and the renewals coming up. With a period,
    the renewals list is the documents expiring in it (else the next 60 days).
    opts["rtype"] = one document's name (the page's document filter, e.g.
    "Road Tax"): only that document — its sheet, its counts and its renewals."""
    start, end = (opts or {}).get("start"), (opts or {}).get("end")
    only = (opts or {}).get("rtype") or ""
    docs = [d for d in COMPLIANCE_DOCS if not only or d[2] == only] or COMPLIANCE_DOCS
    only = only if len(docs) == 1 else ""
    term = search.lower()
    trucks = [t for t in db.query(models.Truck).options(rr.slim(models.Truck)).filter(models.Truck.deleted_at.is_(None))
              .order_by(models.Truck.truck_id)
              if not term or term in (t.registration_number or "").lower() or term in (t.truck_id or "").lower()]
    names = _sheet_names([d[2] for d in docs] + ["Every Truck"])
    sheet_of = {d[2]: n for d, n in zip(docs, names)}

    counts = {d[2]: defaultdict(int) for d in docs}
    no_cost = defaultdict(int)
    per_doc_rows = defaultdict(list)
    side_by_side, due, yearly = [], [], 0.0
    win_start, win_end = (start or today), (end or date.fromordinal(today.toordinal() + 60))
    for t in trucks:
        reg = clean(t.registration_number) or t.truck_id
        line = [reg, t.truck_id]
        for date_f, cost_f, label, num_f, warn in docs:
            exp, cost = getattr(t, date_f), float(getattr(t, cost_f) or 0)
            st = compliance_status(exp, warn, today)
            counts[label][st] += 1
            missing_cost = exp is not None and cost <= 0
            no_cost[label] += missing_cost
            yearly += cost
            left = (exp - today).days if exp else None
            status_cell = {"v": st, "tone": COMPLIANCE_TONE[st]}
            per_doc_rows[label].append([reg, t.truck_id, clean(getattr(t, num_f)) if num_f else "", _iso(exp), left, status_cell,
                                        {"v": "No Cost", "tone": "warn"} if missing_cost else cost if exp else None])
            line.append({"v": _iso(exp) or "Not Uploaded", "tone": COMPLIANCE_TONE[st]} if exp else {"v": "Not Uploaded", "tone": None})
            if exp and win_start <= exp <= win_end:
                due.append([_iso(exp), {"v": reg, "link": sheet_of[label]}, label, left, status_cell, cost or None])
        side_by_side.append(line)
    due.sort(key=lambda r: r[0])

    items = []
    for date_f, cost_f, label, num_f, warn in docs:
        rows = sorted(per_doc_rows[label], key=lambda r: compliance_sort_key(r[5]["v"], date.fromisoformat(r[3]) if r[3] else None, r[0]))
        c = counts[label]
        cost_total = sum(r[6] for r in rows if isinstance(r[6], (int, float)))
        items.append({
            "sheet": sheet_of[label], "title": label,
            "subtitle": f"{len(rows)} trucks · expiring soon means within {warn} days · expired, not uploaded, due soon, then valid",
            "boxes": [box("STATUS", [("Expired", c["Expired"], "num", "bad" if c["Expired"] else None),
                                     ("Expiring soon", c["Expiring Soon"], "num", "warn" if c["Expiring Soon"] else None),
                                     ("Not uploaded", c["Not Uploaded"], "num"),
                                     ("Valid", c["Valid"], "num", "good" if c["Valid"] else None),
                                     ("Uploaded, no cost", no_cost[label], "num", "warn" if no_cost[label] else None),
                                     ("Cost of the current documents (₹)", cost_total, "money")])],
            "tables": [table(label.upper(), [("Truck", "text"), ("Truck ID", "text"), ("Number", "text", bool(num_f)), ("Expiry", "date"),
                                             ("Days left", "num"), ("Status", "text"), ("Cost (₹)", "money")], rows,
                             total=["TOTAL", f"{len(rows)} trucks", "", None, None, "", cost_total])],
        })
    if not only:   # one document chosen: its own sheet says it all
        items.append({
            "sheet": names[-1], "title": "Every Truck", "subtitle": f"{len(trucks)} trucks · each document's expiry, coloured by status",
            "boxes": [], "tables": [table("EVERY TRUCK'S DOCUMENTS", [("Truck", "text"), ("Truck ID", "text")]
                                          + [(d[2], "date") for d in docs], side_by_side)],
        })

    status_rows = [[{"v": d[2], "link": sheet_of[d[2]]}, counts[d[2]]["Expired"], counts[d[2]]["Expiring Soon"], counts[d[2]]["Not Uploaded"],
                    counts[d[2]]["Valid"], no_cost[d[2]]] for d in docs]
    total = {s: sum(counts[d[2]][s] for d in docs) for s in COMPLIANCE_STATUSES}
    window_label = _label(start, end) if (start or end) else "the next 60 days"
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": f"As of {today.strftime('%d-%m-%Y')}" + (f" · {only} only" if only else "")
                   + (f" · renewals {_label(start, end)}" if start or end else "")},
        "kpis": [{"label": "Expired", "value": str(total["Expired"]), "tone": "bad" if total["Expired"] else None, "note": "documents"},
                 {"label": "Expiring soon", "value": str(total["Expiring Soon"]), "tone": "warn" if total["Expiring Soon"] else None,
                  "note": "within each document's warning window"},
                 {"label": "Not uploaded", "value": str(total["Not Uploaded"]), "note": "no expiry date entered"},
                 {"label": "Uploaded, no cost", "value": str(sum(no_cost.values())), "tone": "warn" if sum(no_cost.values()) else None,
                  "note": "count as ₹0 in Profitability"}],
        "tables": [
            table("BY DOCUMENT — click to open its sheet", [("Document", "link"), ("Expired", "num"), ("Expiring soon", "num"),
                                                            ("Not uploaded", "num"), ("Valid", "num"), ("No cost", "num")],
                  status_rows, total=["TOTAL", total["Expired"], total["Expiring Soon"], total["Not Uploaded"], total["Valid"], sum(no_cost.values())]),
            table(f"RENEWALS DUE — {window_label}", [("Expiry", "date"), ("Truck", "link"), ("Document", "text"), ("Days left", "num"),
                                                     ("Status", "text"), ("Last cost (₹)", "money")], due,
                  total=["TOTAL", f"{len(due)} documents", "", None, "", sum(r[5] or 0 for r in due)]),
        ],
        "notes": [
            "Statuses follow the Compliance & Renewals page. Expiring soon = within the document's own warning window: "
            "RC and FC 30 days; Road Tax and permits 10; Pollution and Insurance 7.",
            "Not uploaded = no expiry date entered yet. No cost = an expiry date but no cost — it counts as ₹0 in Profitability until entered.",
            f"Last cost is what the current document cost; the renewal will likely cost about the same. The current documents add up to {_inr(yearly)}.",
        ],
        "items": items,
    }


# ── Staff Compensation ───────────────────────────────────────────────────────

def _staffcomp(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """The Staff Compensation page: the salary and advance entries recorded for
    each staff member in the period, a sheet per person, and month by month."""
    start, end = (opts or {}).get("start"), (opts or {}).get("end")
    term = search.lower()
    q = db.query(models.CompensationTransaction).filter(models.CompensationTransaction.person_type == "staff")
    if start:
        q = q.filter(models.CompensationTransaction.date >= start)
    if end:
        q = q.filter(models.CompensationTransaction.date <= end)
    entries = defaultdict(list)
    for t in q.order_by(models.CompensationTransaction.date.desc(), models.CompensationTransaction.id.desc()):
        entries[t.person_id].append(t)
    staff = {s.id: s for s in db.query(models.Staff).options(rr.slim(models.Staff))}

    people = []
    for pid, rows in entries.items():
        s = staff.get(pid)
        name = clean(s.name) if s else clean(rows[0].person_name) or f"Staff #{pid}"
        code = s.staff_id if s else ""
        if term and term not in name.lower() and term not in (code or "").lower():
            continue
        sal = sum(float(t.amount or 0) for t in rows if t.type == "Salary")
        adv = sum(float(t.amount or 0) for t in rows if t.type == "Advance")
        people.append((pid, s, name, code, rows, sal, adv))
    people.sort(key=lambda p: (-(p[5] + p[6]), p[2]))

    names = _sheet_names([p[2] for p in people] + ["Month by month"])
    by_person, items = [], []
    months = defaultdict(lambda: [0.0, 0.0, 0])
    tot_sal = tot_adv = 0.0
    for (pid, s, name, code, rows, sal, adv), sheet in zip(people, names):
        tot_sal, tot_adv = tot_sal + sal, tot_adv + adv
        role_name = clean(s.designation) if s else ""
        for t in rows:
            m = months[t.date.strftime("%Y-%m")]
            m[0 if t.type == "Salary" else 1] += float(t.amount or 0)
            m[2] += 1
        by_person.append([{"v": name, "link": sheet}, code, role_name, len(rows), sal, adv, sal + adv])
        items.append({
            "sheet": sheet, "title": name, "subtitle": f"{code} · {role_name} · {len(rows)} entries · newest first",
            "boxes": [box("STAFF MEMBER", [("Staff ID", code), ("Designation", role_name),
                                           ("Joined", _iso(s.date_of_joining) if s else None, "date"),
                                           ("Status", "Removed" if s is None or s.deleted_at else "Active", "text",
                                            "warn" if s is None or s.deleted_at else None)]),
                      box("THIS PERIOD", [("Salary (₹)", sal, "money"), ("Advances (₹)", adv, "money", "warn" if adv else None),
                                          ("Total paid out (₹)", sal + adv, "money"), ("Entries", len(rows), "num")])],
            "tables": [table("ENTRIES", [("Date", "date"), ("Type", "text"), ("Amount (₹)", "money"), ("Note", "text")],
                             [[_iso(t.date), {"v": t.type, "tone": "warn" if t.type == "Advance" else None}, float(t.amount or 0),
                               clean(t.note)] for t in rows],
                             total=["TOTAL", f"{len(rows)} entries", sal + adv, ""])],
        })
    month_rows = [[k, v[2], v[0], v[1], v[0] + v[1]] for k, v in sorted(months.items(), reverse=True)]
    items.append({
        "sheet": names[-1], "title": "Month by month", "subtitle": "all staff, newest month first", "boxes": [],
        "tables": [table("MONTH BY MONTH", [("Month", "text"), ("Entries", "num"), ("Salary (₹)", "money"), ("Advances (₹)", "money"),
                                            ("Total (₹)", "money")], month_rows,
                         total=["TOTAL", sum(r[1] for r in month_rows), tot_sal, tot_adv, tot_sal + tot_adv])],
    })
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end)},
        "kpis": [{"label": "Paid out", "value": _inr(tot_sal + tot_adv), "note": f"{len(people)} staff"},
                 {"label": "Salary", "value": _inr(tot_sal)},
                 {"label": "Advances", "value": _inr(tot_adv), "tone": "warn" if tot_adv else None},
                 {"label": "Entries", "value": str(sum(len(p[4]) for p in people))}],
        "tables": [table("BY STAFF MEMBER — click a name to open their sheet",
                         [("Staff", "link"), ("Staff ID", "text"), ("Designation", "text"), ("Entries", "num"), ("Salary (₹)", "money"),
                          ("Advances (₹)", "money"), ("Total (₹)", "money")],
                         by_person, total=["TOTAL", "", "", sum(r[3] for r in by_person), tot_sal, tot_adv, tot_sal + tot_adv])],
        "notes": ["Lists the salary and advance entries recorded on the Staff Compensation page, by the date entered.",
                  "Staff who had no entries in the period aren't listed."],
        "items": items,
    }


# ── Register with the Resource Hub report ────────────────────────────────────

rr.KINDS.update({
    "drivercomp": (_drivercomp, "Driver Compensation", "Driver Compensation"),
    "emi": (_emi, "EMI Tracking", "EMI Tracking"),
    "detention": (_detention, "Customer Detention", "Customer Detention"),
    "compliance": (_compliance, "Compliance & Renewals", "Compliance & Renewals"),
    "staffcomp": (_staffcomp, "Staff Compensation", "Staff Compensation"),
})
rr.KIND_ROLES.update({"drivercomp": ("Admin", "Accounts"), "emi": ("Admin", "Accounts"), "detention": ("Admin", "Accounts"),
                      "compliance": ("Admin", "Accounts"),
                      "staffcomp": ("Admin",)})
rr.WITH_OPTS = tuple(dict.fromkeys(rr.WITH_OPTS + ("drivercomp", "emi", "detention", "compliance", "staffcomp")))
