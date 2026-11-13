"""Auditor Pages and AdBlue History → View, in the Resource Hub report shape
(registered as kinds in resource_report.py, so the Excel writer, preview and
PDF are shared):

  driver_record   Driver Based Record — a sheet per driver: their trips
                  Accounts has verified (with a trip sheet), each with its
                  Salary Record line (routers/finance.py _trip_pay) and its
                  audit status
  vehicle_record  Vehicle Based Record — a sheet per truck (removed trucks
                  too): the same trips with driver, km and hire after commission
  adblue          Truck's AdBlue History — every fill, km per litre (the
                  app's rule: routers/maintenance.py get_all_adblue_stats), by
                  truck and by filling location; a sheet per truck
  runrecord       Truck Run Record — each truck's km: the period month by month
                  and trip by trip, and its lifetime run figures
                  (routers/running_cost.py truck_run_stats_all)

Auditor pages: trips are picked by their trip (scheduled) date, as the pages.
AdBlue: fills by their date. No cost per km.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date

from sqlalchemy.orm import Session, selectinload

import models
import resource_report as rr
from audit_report import _inr
from maintenance_report import _iso, _period_label, _sheet_names
from resource_report import box, clean, table

AUDIT_TONE = {"Verified": "good", "Under Review": "bad", "Returned": "warn", "Re-Verification": "warn", "Pending audit": None}


def _label(start, end) -> str:
    return _period_label(start, end) if start or end else "All time"


def audit_status(t: models.Trip) -> str:
    """The Auditor pages' badge (components/audit/TripAuditActions.tsx TripAuditBadge)."""
    if t.reverification_remark:
        return "Re-Verification"
    if t.audit_verified:
        return "Verified"
    if t.flagged_for_recheck and not t.recheck_returned:
        return "Under Review"
    if t.flagged_for_recheck and t.recheck_returned:
        return "Returned"
    return "Pending audit"


def _audited_trips(db: Session, start, end):
    """The trips both Auditor pages list: verified by Accounts, with a trip sheet, in the period."""
    q = (db.query(models.Trip).options(selectinload(models.Trip.sheet))
         .filter(models.Trip.deleted_at.is_(None), models.Trip.verification_status == "verified", models.Trip.scheduled_date.isnot(None)))
    if start:
        q = q.filter(models.Trip.scheduled_date >= start)
    if end:
        q = q.filter(models.Trip.scheduled_date <= end)
    return [t for t in q.order_by(models.Trip.scheduled_date.desc()) if t.sheet is not None]


def _route(t) -> str:
    return " → ".join(x for x in (clean(t.origin), clean(t.destination)) if x)


def _hire(t) -> float:
    return round(float(t.sheet.hire_amount or 0) - float(t.transport_commission_amount or 0), 2)


def _audit_cell(t):
    s = audit_status(t)
    return {"v": s, "tone": AUDIT_TONE[s]}


def _audit_counts(trips) -> Counter:
    return Counter(audit_status(t) for t in trips)


# ── Driver Based Record ──────────────────────────────────────────────────────

def _driver_record(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    from routers.finance import _trip_pay
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    term = (search or "").strip().lower()
    regs = dict(db.query(models.Truck.truck_id, models.Truck.registration_number).all())
    drivers = {d.driver_id: d for d in db.query(models.Driver).options(rr.slim(models.Driver))}
    by_driver = defaultdict(list)
    for t in _audited_trips(db, start, end):
        if t.driver_id:
            by_driver[t.driver_id].append(t)
    people = [(did, drivers.get(did), trips) for did, trips in by_driver.items()
              if not term or term in (did or "").lower() or term in ((drivers.get(did).name if drivers.get(did) else "") or "").lower()]
    pays = {t.id: _trip_pay(t, t.sheet) for _, _, trips in people for t in trips}
    people.sort(key=lambda p: -sum(pays[t.id]["net_payable"] for t in p[2]))
    names = _sheet_names([clean(d.name) if d else did for did, d, _ in people])

    rows_all, items = [], []
    for (did, d, trips), sheet in zip(people, names):
        net = sum(pays[t.id]["net_payable"] for t in trips)
        ac = _audit_counts(trips)
        rows_all.append([{"v": clean(d.name) if d else did, "link": sheet}, did, len(trips), net, ac["Verified"], ac["Pending audit"],
                         {"v": ac["Under Review"], "tone": "bad"} if ac["Under Review"] else 0])
        rows = []
        for t in trips:
            p = pays[t.id]
            rows.append([t.trip_id, _iso(t.scheduled_date), _route(t), rr.CAT.get(t.trip_category or "", clean(t.trip_category)),
                         clean(regs.get(t.vehicle_id)) or clean(t.vehicle_id),
                         {"v": 0, "tone": "warn"} if p["batta_excluded"] else p["regular_pay"], p["advance"], p["expenses"],
                         {"v": round(p["net_payable"], 2), "tone": "bad" if p["net_payable"] < 0 else None}, _audit_cell(t),
                         clean(t.flagged_remark) if t.flagged_for_recheck else ""])
        items.append({
            "sheet": sheet, "title": clean(d.name) if d else did,
            "subtitle": f"{did} · {len(trips)} verified trips · newest first",
            "boxes": [box("SALARY ON THESE TRIPS", [("Trips", len(trips), "num"), ("Regular pay (₹)", sum(r[5]["v"] if isinstance(r[5], dict) else r[5] for r in rows), "money"),
                                                    ("Advances (₹)", sum(r[6] for r in rows), "money"),
                                                    ("Driver expenses (₹)", sum(r[7] for r in rows), "money"),
                                                    ("Net payable (₹)", net, "money", "bad" if net < 0 else "good")]),
                      box("AUDIT", [(k, ac.get(k, 0), "num", AUDIT_TONE[k] if ac.get(k) else None)
                                    for k in ("Verified", "Pending audit", "Under Review", "Returned", "Re-Verification")])],
            "tables": [table("TRIPS", [("Trip", "text"), ("Date", "date"), ("Route", "text"), ("Category", "text"), ("Truck", "text"),
                                       ("Regular pay (₹)", "money"), ("Advance (₹)", "money"), ("Expenses (₹)", "money"),
                                       ("Net payable (₹)", "money"), ("Audit", "text"), ("Flag remark", "text", False)], rows,
                             total=["TOTAL", f"{len(rows)} trips", "", "", "", sum(r[5]["v"] if isinstance(r[5], dict) else r[5] for r in rows),
                                    sum(r[6] for r in rows), sum(r[7] for r in rows), net, "", ""])],
        })
    every = [t for _, _, ts in people for t in ts]
    ac = _audit_counts(every)
    net_all = sum(r[3] for r in rows_all)
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end)},
        "kpis": [{"label": "Drivers", "value": str(len(people)), "note": f"{len(every)} verified trips"},
                 {"label": "Net payable", "value": _inr(net_all), "tone": "bad" if net_all < 0 else None},
                 {"label": "Audit verified", "value": str(ac["Verified"]), "tone": "good" if ac["Verified"] else None,
                  "note": f"{ac['Pending audit']} still to audit"},
                 {"label": "Under review", "value": str(ac["Under Review"]), "tone": "bad" if ac["Under Review"] else None,
                  "note": f"{ac['Returned']} returned"}],
        "tables": [table("BY DRIVER — click a name to open their sheet",
                         [("Driver", "link"), ("Driver ID", "text"), ("Trips", "num"), ("Net payable (₹)", "money"), ("Audit verified", "num"),
                          ("Pending audit", "num"), ("Under review", "num")], rows_all,
                         total=["TOTAL", "", len(every), net_all, ac["Verified"], ac["Pending audit"], ac["Under Review"]])],
        "notes": ["The Driver Based Record page: trips Accounts has verified, with a trip sheet, by trip date.",
                  "Net payable per trip = regular pay − (advance − driver expenses), the Salary Record's rule; a Return Trip without "
                  "batta pays no batta (amber) but its advance is still taken off.",
                  "Audit = the Auditor's badge: Verified, Under Review (flagged), Returned (corrected, back to the Auditor), "
                  "Re-Verification, or Pending audit."],
        "items": items,
    }


# ── Vehicle Based Record ─────────────────────────────────────────────────────

def _vehicle_record(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    term = (search or "").strip().lower()
    trucks = {t.truck_id: t for t in db.query(models.Truck).options(rr.slim(models.Truck))}       # removed trucks too
    drivers = dict(db.query(models.Driver.driver_id, models.Driver.name).all())
    by_truck = defaultdict(list)
    for t in _audited_trips(db, start, end):
        if t.vehicle_id:
            by_truck[t.vehicle_id].append(t)
    fleet = [(tid, trucks.get(tid), ts) for tid, ts in by_truck.items()
             if not term or term in (tid or "").lower() or term in ((trucks.get(tid).registration_number if trucks.get(tid) else "") or "").lower()]
    fleet.sort(key=lambda x: -sum(_hire(t) for t in x[2]))
    names = _sheet_names([clean(tk.registration_number) if tk else tid for tid, tk, _ in fleet])
    rows_all, items = [], []
    for (tid, tk, trips), sheet in zip(fleet, names):
        km = sum(float(t.sheet.total_km or 0) for t in trips)
        hire = sum(_hire(t) for t in trips)
        ac = _audit_counts(trips)
        removed = bool(tk and tk.deleted_at)
        rows_all.append([{"v": (clean(tk.registration_number) if tk else tid) + (" (removed)" if removed else ""), "link": sheet}, tid,
                         len(trips), km, hire, ac["Verified"], ac["Pending audit"], {"v": ac["Under Review"], "tone": "bad"} if ac["Under Review"] else 0])
        rows = [[t.trip_id, _iso(t.scheduled_date), clean(drivers.get(t.driver_id) or t.driver_name), _route(t),
                 rr.CAT.get(t.trip_category or "", clean(t.trip_category)), float(t.sheet.total_km or 0), _hire(t), _audit_cell(t),
                 clean(t.flagged_remark) if t.flagged_for_recheck else ""] for t in trips]
        items.append({
            "sheet": sheet, "title": (clean(tk.registration_number) if tk else tid) + (" (removed)" if removed else ""),
            "subtitle": f"{tid} · {len(trips)} verified trips · newest first",
            "boxes": [box("THESE TRIPS", [("Trips", len(trips), "num"), ("Km", km, "km"), ("Hire (₹)", hire, "money"),
                                          ("Drivers", len({t.driver_id for t in trips if t.driver_id}), "num")]),
                      box("AUDIT", [(k, ac.get(k, 0), "num", AUDIT_TONE[k] if ac.get(k) else None)
                                    for k in ("Verified", "Pending audit", "Under Review", "Returned", "Re-Verification")])],
            "tables": [table("TRIPS", [("Trip", "text"), ("Date", "date"), ("Driver", "text"), ("Route", "text"), ("Category", "text"),
                                       ("Km", "km"), ("Hire (₹)", "money"), ("Audit", "text"), ("Flag remark", "text", False)], rows,
                             total=["TOTAL", f"{len(rows)} trips", "", "", "", km, hire, "", ""])],
        })
    every = [t for _, _, ts in fleet for t in ts]
    ac = _audit_counts(every)
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end)},
        "kpis": [{"label": "Trucks", "value": str(len(fleet)), "note": f"{len(every)} verified trips"},
                 {"label": "Hire", "value": _inr(sum(r[4] for r in rows_all)), "note": f"{sum(r[3] for r in rows_all):,.0f} km"},
                 {"label": "Audit verified", "value": str(ac["Verified"]), "tone": "good" if ac["Verified"] else None,
                  "note": f"{ac['Pending audit']} still to audit"},
                 {"label": "Under review", "value": str(ac["Under Review"]), "tone": "bad" if ac["Under Review"] else None,
                  "note": f"{ac['Returned']} returned"}],
        "tables": [table("BY TRUCK — click to open its sheet",
                         [("Truck", "link"), ("Truck ID", "text"), ("Trips", "num"), ("Km", "km"), ("Hire (₹)", "money"),
                          ("Audit verified", "num"), ("Pending audit", "num"), ("Under review", "num")], rows_all,
                         total=["TOTAL", "", len(every), sum(r[3] for r in rows_all), sum(r[4] for r in rows_all), ac["Verified"],
                                ac["Pending audit"], ac["Under Review"]])],
        "notes": ["The Vehicle Based Record page: trips Accounts has verified, with a trip sheet, by trip date — removed trucks included.",
                  "Hire is after transport commission, the figure Profitability uses. Km is the trip sheet's.",
                  "Audit = the Auditor's badge: Verified, Under Review, Returned, Re-Verification, or Pending audit."],
        "items": items,
    }


# ── Truck's AdBlue History ───────────────────────────────────────────────────

def _adblue(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    from routers.maintenance import get_all_adblue_stats
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    term = (search or "").strip().lower()
    trucks = {t.id: t for t in db.query(models.Truck).options(rr.slim(models.Truck))}
    kmpl = get_all_adblue_stats(db)                                  # lifetime, the app's rule
    logs = defaultdict(list)
    for log in db.query(models.AdBlueLog).order_by(models.AdBlueLog.truck_id, models.AdBlueLog.odometer):
        logs[log.truck_id].append(log)
    fleet = []
    for tid, ls in logs.items():
        tk = trucks.get(tid)
        if term and not (tk and (term in (tk.registration_number or "").lower() or term in (tk.truck_id or "").lower())):
            continue
        inp = [x for x in ls if (not start or x.date >= start) and (not end or x.date <= end)]
        if inp:
            fleet.append((tid, tk, ls, inp))
    fleet.sort(key=lambda x: -sum(float(l.total_cost or 0) for l in x[3]))
    names = _sheet_names([(clean(tk.registration_number) if tk else str(tid)) for tid, tk, _, _ in fleet])
    rows_all, items = [], []
    places = defaultdict(lambda: [0, 0.0, 0.0])
    for (tid, tk, ls, inp), sheet in zip(fleet, names):
        prev = {}
        last = None
        for x in ls:                               # km since the previous fill (whole history, so the first fill in the period has one)
            prev[x.id] = (x.odometer - last.odometer) if last and x.odometer >= last.odometer else None
            last = x
        litres = sum(float(x.litres or 0) for x in inp)
        cost = sum(float(x.total_cost or 0) for x in inp)
        k = kmpl.get(str(tid))
        rows = []
        for x in sorted(inp, key=lambda x: (x.date, x.odometer), reverse=True):
            gap = prev.get(x.id)
            per = round(gap / float(x.litres), 2) if gap and float(x.litres or 0) > 0 else None
            rows.append([_iso(x.date), x.odometer, float(x.litres or 0), float(x.price_per_litre or 0), float(x.total_cost or 0),
                         gap, per, clean(x.supplier), clean(x.entered_by_name), clean(x.remarks)])
            p = places[clean(x.supplier) or "—"]
            p[0] += 1
            p[1] += float(x.litres or 0)
            p[2] += float(x.total_cost or 0)
        name = clean(tk.registration_number) if tk else str(tid)
        rows_all.append([{"v": name, "link": sheet}, tk.truck_id if tk else "", len(inp), litres, cost,
                         round(cost / litres, 2) if litres else None, round(k, 2) if k else {"v": "need 2 fills", "tone": "warn"},
                         _iso(max(x.date for x in inp))])
        items.append({
            "sheet": sheet, "title": name, "subtitle": f"{tk.truck_id if tk else ''} · {len(inp)} fills · newest first",
            "boxes": [box("ADBLUE", [("Fills", len(inp), "num"), ("Litres", litres, "num"), ("Spent (₹)", cost, "money"),
                                     ("Average price (₹ a litre)", round(cost / litres, 2) if litres else None, "money"),
                                     ("Km per litre (lifetime)", round(k, 2) if k else "needs 2 fills", "num" if k else "text",
                                      None if k else "warn")])],
            "tables": [table("FILLS", [("Date", "date"), ("Odometer", "km"), ("Litres", "num"), ("₹ a litre", "money"), ("Cost (₹)", "money"),
                                       ("Km since last fill", "km"), ("Km per litre", "num"), ("Filled at", "text"), ("Entered by", "text", False),
                                       ("Remarks", "text", False)], rows,
                             total=["TOTAL", f"{len(rows)} fills", litres, None, cost, None, None, "", "", ""])],
        })
    litres_all, cost_all = sum(r[3] for r in rows_all), sum(r[4] for r in rows_all)
    with_k = [r[6] for r in rows_all if isinstance(r[6], (int, float))]
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end)},
        "kpis": [{"label": "Fills", "value": str(sum(r[2] for r in rows_all)), "note": f"{len(rows_all)} trucks"},
                 {"label": "Litres", "value": f"{litres_all:,.1f}"},
                 {"label": "Spent", "value": _inr(cost_all), "note": f"₹{cost_all / litres_all:.2f} a litre on average" if litres_all else ""},
                 {"label": "Fleet km per litre", "value": f"{sum(with_k) / len(with_k):.2f}" if with_k else "—",
                  "note": f"average of {len(with_k)} trucks with 2+ fills"}],
        "tables": [
            table("BY TRUCK — click to open its fills", [("Truck", "link"), ("Truck ID", "text"), ("Fills", "num"), ("Litres", "num"),
                                                         ("Spent (₹)", "money"), ("₹ a litre", "money"), ("Km per litre", "num"), ("Last fill", "date")],
                  rows_all, total=["TOTAL", "", sum(r[2] for r in rows_all), litres_all, cost_all, None, None, None]),
            table("BY FILLING LOCATION", [("Filled at", "text"), ("Fills", "num"), ("Litres", "num"), ("Spent (₹)", "money"), ("₹ a litre", "money")],
                  [[k, v[0], v[1], v[2], round(v[2] / v[1], 2) if v[1] else None] for k, v in sorted(places.items(), key=lambda kv: -kv[1][2])]),
        ],
        "notes": ["Every AdBlue fill on Truck's AdBlue History, by fill date.",
                  "Km per litre (lifetime) is the app's figure: km between fills ÷ litres, odd intervals left out, over the truck's whole "
                  "history — the one the Running Cost Calculator uses. It needs at least 2 fills. Km since last fill / km per litre on each "
                  "row is that one interval."],
        "items": items,
    }


# ── Truck Run Record ─────────────────────────────────────────────────────────

def _runrecord(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """The Truck Run Record page: each truck's distance. The lifetime figures
    (monthly average, normal km a month, km a day, trips missing a sheet) are
    the app's one rule — routers/running_cost.py truck_run_stats_all, which the
    calculator and Profitability use. The period picks the trips listed and
    the month-by-month km (by the trip's assigned date, as the page)."""
    from routers.running_cost import truck_run_stats_all
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    term = (search or "").strip().lower()
    stats = truck_run_stats_all(db)
    q = (db.query(models.Trip).options(selectinload(models.Trip.sheet))
         .filter(models.Trip.deleted_at.is_(None), models.Trip.status != "Cancelled", models.Trip.assigned_date.isnot(None)))
    if start:
        q = q.filter(models.Trip.assigned_date >= start)
    if end:
        q = q.filter(models.Trip.assigned_date <= end)
    trips = defaultdict(list)
    for t in q.order_by(models.Trip.assigned_date.desc()):
        trips[t.vehicle_id].append(t)
    drivers = dict(db.query(models.Driver.driver_id, models.Driver.name).all())
    fleet = [tk for tk in db.query(models.Truck).options(rr.slim(models.Truck)).filter(models.Truck.deleted_at.is_(None)).order_by(models.Truck.truck_id)
             if not term or term in (tk.registration_number or "").lower() or term in (tk.truck_id or "").lower()]

    def km(t):
        return float(t.sheet.total_km or 0) if t.sheet is not None and t.sheet.total_km else 0.0

    fleet.sort(key=lambda tk: -sum(km(t) for t in trips.get(tk.truck_id, [])))
    names = _sheet_names([clean(tk.registration_number) or tk.truck_id for tk in fleet])
    rows_all, items = [], []
    months_all = defaultdict(float)
    for tk, sheet in zip(fleet, names):
        ts = trips.get(tk.truck_id, [])
        st = stats.get(tk.truck_id) or {}
        dist = sum(km(t) for t in ts)
        no_sheet = [t for t in ts if km(t) <= 0 and t.status == "Completed"]
        months = defaultdict(lambda: [0, 0.0])
        for t in ts:
            m = t.assigned_date.strftime("%Y-%m")
            if km(t) > 0:
                months[m][0] += 1
                months[m][1] += km(t)
                months_all[m] += km(t)
        name = clean(tk.registration_number) or tk.truck_id
        rows_all.append([{"v": name, "link": sheet}, tk.truck_id, sum(1 for t in ts if km(t) > 0), dist,
                         st.get("monthly_avg"), st.get("normal_km"), st.get("daily_avg"),
                         {"v": len(no_sheet), "tone": "warn"} if no_sheet else 0, _iso(ts[0].assigned_date) if ts else None])
        trip_rows = [[t.trip_id, _iso(t.assigned_date), clean(drivers.get(t.driver_id) or t.driver_name), _route(t),
                      rr.CAT.get(t.trip_category or "", clean(t.trip_category)),
                      km(t) if km(t) > 0 else {"v": "no sheet yet" if t.status == "Completed" else t.status, "tone": "warn" if t.status == "Completed" else None}]
                     for t in ts]
        items.append({
            "sheet": sheet, "title": name, "subtitle": f"{tk.truck_id} · {len(ts)} trips in the period · newest first",
            "boxes": [box("THIS PERIOD", [("Trips with km", sum(1 for t in ts if km(t) > 0), "num"), ("Km", dist, "km"),
                                          ("Completed, no sheet yet", len(no_sheet), "num", "warn" if no_sheet else None),
                                          ("Longest trip", max((km(t) for t in ts), default=0) or None, "km")]),
                      box("ITS NORMAL RUN (lifetime)", [("Monthly average", st.get("monthly_avg"), "km"),
                                                        ("Normal km a month", st.get("normal_km"), "km"),
                                                        ("Km a day", st.get("daily_avg"), "km"), ("Km per trip", st.get("avg_per_trip"), "km"),
                                                        ("First counted trip", st.get("first_trip_date"), "date")])],
            "tables": [
                table("MONTH BY MONTH", [("Month", "text"), ("Trips with km", "num"), ("Km", "km")],
                      [[date.fromisoformat(m + "-01").strftime("%B %Y"), v[0], v[1]] for m, v in sorted(months.items(), reverse=True)],
                      total=["TOTAL", sum(v[0] for v in months.values()), sum(v[1] for v in months.values())]),
                table("TRIPS", [("Trip", "text"), ("Assigned", "date"), ("Driver", "text"), ("Route", "text"), ("Category", "text"), ("Km", "km")],
                      trip_rows, total=["TOTAL", f"{len(trip_rows)} trips", "", "", "", dist]),
            ],
        })
    total = sum(r[3] for r in rows_all)
    missing = sum(r[7]["v"] if isinstance(r[7], dict) else r[7] for r in rows_all)
    avgs = [r[4] for r in rows_all if r[4]]
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end)},
        "kpis": [{"label": "Km run", "value": f"{total:,.0f} km", "note": f"{len(fleet)} trucks"},
                 {"label": "Fleet monthly average", "value": f"{sum(avgs) / len(avgs):,.0f} km" if avgs else "—", "note": "a truck, lifetime"},
                 {"label": "Busiest truck", "value": rows_all[0][0]["v"] if rows_all and rows_all[0][3] else "—",
                  "note": f"{rows_all[0][3]:,.0f} km" if rows_all and rows_all[0][3] else ""},
                 {"label": "Completed, no sheet yet", "value": str(missing), "tone": "warn" if missing else None, "note": "their km isn't known yet"}],
        "tables": [
            table("EVERY TRUCK — busiest first, click to open its sheet",
                  [("Truck", "link"), ("Truck ID", "text"), ("Trips with km", "num"), ("Km", "km"), ("Monthly average", "km"),
                   ("Normal km a month", "km"), ("Km a day", "km"), ("No sheet yet", "num"), ("Last trip", "date")], rows_all,
                  total=["TOTAL", "", sum(r[2] for r in rows_all), total, None, None, None, missing, None]),
            table("FLEET KM BY MONTH", [("Month", "text"), ("Km", "km")],
                  [[date.fromisoformat(m + "-01").strftime("%B %Y"), v] for m, v in sorted(months_all.items(), reverse=True)]),
        ],
        "notes": [
            "Km is each trip's trip-sheet total km; trips are picked by their assigned date, as the Truck Run Record page.",
            "Monthly average, normal km a month and km a day are each truck's lifetime figures — the one rule the Running Cost "
            "Calculator and Profitability use: only trips with a trip sheet count, over the days from its first counted trip to "
            "the latest trip entered in the fleet.",
            "Completed trips without a trip sheet have no km yet, so they're left out of the km and flagged.",
        ],
        "items": items,
    }


KINDS = {"driver_record": (_driver_record, "Driver Based Record"), "vehicle_record": (_vehicle_record, "Vehicle Based Record"),
         "adblue": (_adblue, "AdBlue History"), "runrecord": (_runrecord, "Truck Run Record")}
rr.KINDS.update({k: (fn, title, title) for k, (fn, title) in KINDS.items()})
rr.KIND_ROLES.update({"driver_record": ("Admin", "Auditor"), "vehicle_record": ("Admin", "Auditor"), "adblue": ("Admin", "Maintenance"),
                    "runrecord": ("Admin",)})
rr.WITH_OPTS = tuple(dict.fromkeys(rr.WITH_OPTS + tuple(KINDS)))
