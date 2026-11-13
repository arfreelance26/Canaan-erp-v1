"""Truck's Fuel History → View: the truck-wise fuel report (Excel + PDF).

Built like maintenance_report.py: collect() gathers the figures once, build()
writes the workbook, and the frontend draws the PDF from the same figures
(lib/fuel-report-pdf.ts via GET /exports/fuel-report/preview).

Sheets
  Summary      the period's fills, litres, diesel cost, average price paid,
               fleet mileage, top trucks, best / lowest mileage, fills to
               check, worth knowing, what's in this file
  All Trucks   one row per truck — each name links to its own sheet
  <one sheet per truck with fills in the period>, named after its
               registration: details, totals, mileage now vs normal, last
               fill, every fill (one row each) with a check, by month
  By Station   each fuel station: fills, litres, cost, average price

Mileage follows the app's rule (routers/maintenance.py fuel_mileage_all):
km between two fills ÷ litres at the second one; gaps no truck could drive
(outside FUEL_KML_MIN–FUEL_KML_MAX km/L) and odd ones (_iqr_filter, judged
over all the truck's fills) are left out and marked "check".
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy.orm import Session

import models
from maintenance_report import (
    SHEET_BAD, TOTAL_FILL, WARN, _band, _d, _in, _iso, _link, _pairs, _period_label, _sheet_names, _title,
)
from pl_export import DATE, IST, KM, MONEY, Sheet, _fill

RATE = "#,##0.00"
KML = "0.00"


def _f(v) -> float:
    return float(v or 0)


def collect(db: Session, start: date | None, end: date | None, search: str = "", truck_id: int | None = None) -> dict:
    from routers.maintenance import FUEL_KML_MAX, FUEL_KML_MIN, _iqr_filter, fuel_mileage_all

    today = datetime.now(IST).date()
    term = (search or "").strip().lower()
    base = db.query(models.FuelBaseConfig).first()
    base_price = _f(base.cost_per_litre) if base and base.cost_per_litre else None

    lq = db.query(models.FuelLog)
    if truck_id:
        lq = lq.filter(models.FuelLog.truck_id == truck_id)
    logs = lq.order_by(models.FuelLog.truck_id, models.FuelLog.odometer, models.FuelLog.date, models.FuelLog.id).all()
    by_truck: dict[int, list] = defaultdict(list)
    for log in logs:
        by_truck[log.truck_id].append(log)

    tq = db.query(models.Truck)
    if truck_id:
        tq = tq.filter(models.Truck.id == truck_id)
    trucks = []
    for t in tq.order_by(models.Truck.truck_id).all():
        if term and term not in (t.registration_number or "").lower() and term not in (t.truck_id or "").lower():
            continue
        has = any(_in(x.date, start, end) for x in by_truck.get(t.id, []))
        if t.deleted_at is not None and not has and not truck_id:
            continue          # sold / archived trucks only when they have fills in the period
        trucks.append(t)

    normal = fuel_mileage_all(db, until=end) if trucks else {}

    out, stations = [], {}
    for t, sheet in zip(trucks, _sheet_names([t.registration_number for t in trucks])):
        fills = by_truck.get(t.id, [])
        # Each fill's gap since the one before (odometer order), judged like the app does.
        gaps: dict[int, dict] = {}
        prev = None
        for log in fills:
            litres = _f(log.litres)
            if prev is not None and litres > 0:
                dist = _f(log.odometer) - _f(prev.odometer)
                gaps[log.id] = {"distance": dist, "litres": litres, "mileage": dist / litres if dist > 0 else 0.0, "id": log.id,
                                "duplicate": dist == 0 and abs(_f(prev.litres) - litres) < 0.01
                                and abs(_f(prev.total_cost) - _f(log.total_cost)) < 0.01}
            prev = log
        plausible = [g for g in gaps.values() if g["distance"] > 0 and FUEL_KML_MIN <= g["mileage"] <= FUEL_KML_MAX]
        kept_ids = {g["id"] for g in _iqr_filter(plausible)}

        rows, kept_d, kept_l = [], 0.0, 0.0
        month: dict[str, dict] = {}
        period = [x for x in fills if _in(x.date, start, end)]
        for log in sorted(period, key=lambda x: (x.date, _f(x.odometer), x.id)):
            g = gaps.get(log.id)
            litres, price, total = _f(log.litres), _f(log.price_per_litre), _f(log.total_cost)
            checks = []
            if g is None:
                status = "First fill — no mileage yet"
            elif g["duplicate"]:
                status = "Check — possible duplicate of the fill before"
            elif g["distance"] == 0:
                status = "Check — same odometer as the fill before (top-up?)"
            elif g["distance"] < 0:
                status = "Check — odometer lower than the fill before"
            elif not (FUEL_KML_MIN <= g["mileage"] <= FUEL_KML_MAX):
                status = f"Check — {g['mileage']:.2f} km/L isn't possible, left out"
            elif log.id not in kept_ids:
                status = "Unusual — left out of the mileage"
            else:
                status = "OK"
                kept_d += g["distance"]
                kept_l += g["litres"]
            if base_price and price and not (0.5 * base_price <= price <= 2 * base_price):
                checks.append("price looks wrong")
            if litres and price and abs(litres * price - total) > max(1.0, total * 0.01):
                checks.append("total ≠ litres × price")
            if checks:
                status = f"{status}; {', '.join(checks)}" if status != "OK" else "Check — " + ", ".join(checks)
            rows.append({
                "date": _iso(log.date), "odometer": int(_f(log.odometer)),
                "distance": round(g["distance"], 1) if g else None,
                "litres": round(litres, 2), "price": round(price, 2), "total": round(total, 2),
                "mileage": round(g["mileage"], 2) if g and g["distance"] > 0 else None,
                "status": status, "ok": status == "OK" or status.startswith("First fill"),
                "station": log.fuel_station or "", "entered_by": log.entered_by_name or log.logged_by or "",
                "source": log.source or "",
            })
            m = month.setdefault(log.date.strftime("%Y-%m"), {"month": log.date.strftime("%b %Y"), "fills": 0, "litres": 0.0, "cost": 0.0})
            m["fills"] += 1
            m["litres"] += litres
            m["cost"] += total
            key = (log.fuel_station or "").strip() or "(not recorded)"
            s = stations.setdefault(key.lower(), {"name": key, "fills": 0, "litres": 0.0, "cost": 0.0, "trucks": set(), "last": None})
            s["fills"] += 1
            s["litres"] += litres
            s["cost"] += total
            s["trucks"].add(t.registration_number)
            s["last"] = max(s["last"], log.date) if s["last"] else log.date

        litres = sum(r["litres"] for r in rows)
        cost = sum(r["total"] for r in rows)
        last = max(fills, key=lambda x: (x.date, _f(x.odometer))) if fills else None
        if end and fills:
            upto = [x for x in fills if x.date <= end]
            last = max(upto, key=lambda x: (x.date, _f(x.odometer))) if upto else None
        status = "Active"
        if t.disposal_type == "Sold":
            status = f"Sold {t.sold_date.strftime('%d-%m-%Y')}" if t.sold_date else "Sold"
        elif t.deleted_at is not None:
            status = "Archived"
        nm = normal.get(str(t.id))
        mileage = round(kept_d / kept_l, 2) if kept_l > 0 else None
        out.append({
            "id": t.id, "truck_id": t.truck_id, "registration": t.registration_number, "sheet": sheet,
            "truck_type": t.truck_type or "", "tyre_layout": t.tyre_layout or "",
            "make": " ".join(x for x in (t.manufacturer, t.model_name) if x and str(x).strip().lower() not in ("nan", "none", "null")),
            "fuel_capacity": _f(t.fuel_capacity) or None, "status": status, "odometer": int(_f(t.odometer)),
            "fills": len(rows), "litres": round(litres, 2), "cost": round(cost, 2),
            "avg_price": round(cost / litres, 2) if litres > 0 else None,
            "mileage": mileage, "mileage_km": round(kept_d, 1), "mileage_litres": round(kept_l, 2),
            "normal_mileage": round(nm, 2) if nm else None,
            "checks": sum(1 for r in rows if not r["ok"]),
            "last_fill": {"date": _iso(last.date), "odometer": int(_f(last.odometer)), "litres": round(_f(last.litres), 2)} if last else None,
            "days_since": ((min(end, today) if end else today) - last.date).days if last else None,
            "rows": rows,
            "by_month": [dict(v, litres=round(v["litres"], 2), cost=round(v["cost"], 2)) for _, v in sorted(month.items())],
        })

    with_fills = [x for x in out if x["fills"]]
    litres = round(sum(x["litres"] for x in out), 2)
    cost = round(sum(x["cost"] for x in out), 2)
    kd = sum(x["mileage_km"] for x in out)
    kl = sum(x["mileage_litres"] for x in out)
    judged = [x for x in with_fills if x["mileage"] is not None]
    as_of = min(end, today) if end else today
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _period_label(start, end)},
        "generated_at": datetime.now(IST).strftime("%d-%m-%Y %I:%M %p"),
        "as_of": as_of.isoformat(),
        "search": search or "",
        "single_truck": bool(truck_id),
        "base_price": base_price,
        "limits": {"min": FUEL_KML_MIN, "max": FUEL_KML_MAX},
        "totals": {
            "trucks": len(out), "with_fills": len(with_fills), "without": len(out) - len(with_fills),
            "fills": sum(x["fills"] for x in out), "litres": litres, "cost": cost,
            "avg_price": round(cost / litres, 2) if litres > 0 else None,
            "mileage": round(kd / kl, 2) if kl > 0 else None,
            "checks": sum(x["checks"] for x in out),
            "period_open": bool(end and end >= today and (start is None or start <= today)),
        },
        "top_trucks": sorted(with_fills, key=lambda x: -x["cost"])[:5],
        "best": sorted(judged, key=lambda x: -x["mileage"])[:5],
        "lowest": sorted(judged, key=lambda x: x["mileage"])[:5],
        "stations": sorted(
            ({"name": s["name"], "fills": s["fills"], "litres": round(s["litres"], 2), "cost": round(s["cost"], 2),
              "avg_price": round(s["cost"] / s["litres"], 2) if s["litres"] else None, "trucks": len(s["trucks"]),
              "last_date": _iso(s["last"])} for s in stations.values()),
            key=lambda x: -x["cost"]),
        "trucks": out,
    }


# ── Excel ────────────────────────────────────────────────────────────────────

def _mileage_note(x: dict) -> str:
    if x["mileage"] is None or not x["normal_mileage"]:
        return ""
    diff = (x["mileage"] - x["normal_mileage"]) / x["normal_mileage"] * 100
    if abs(diff) < 5:
        return "about normal"
    return f"{abs(diff):.0f}% {'better' if diff > 0 else 'lower'} than normal"


def _summary(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "Summary")
    t = rep["totals"]
    sub = f"{rep['period']['label']} · downloaded {rep['generated_at']}"
    if rep["search"]:
        sub += f' · search "{rep["search"]}" (only matching trucks)'
    single = rep["single_truck"] and rep["trucks"]
    r = _title(s, 1, "Fuel Report" + (f" — {rep['trucks'][0]['registration']}" if single else ""), sub)

    _band(s, r, "THE PERIOD AT A GLANCE")
    r = _pairs(s, r + 1, [
        ("Trucks in this report", t["trucks"], None),
        ("Trucks that took fuel", t["with_fills"], None),
        ("Trucks with no fills", t["without"], None),
        ("Fuel fills", t["fills"], None),
        ("Litres", t["litres"], RATE),
        ("Diesel cost (₹)", t["cost"], MONEY),
        ("Average price paid per litre (₹)", t["avg_price"] if t["avg_price"] is not None else "—", RATE),
        ("Fleet mileage (km per litre)", t["mileage"] if t["mileage"] is not None else "—", KML),
        ("Fills to check", t["checks"], None),
    ])
    if t["checks"]:
        s.ws.cell(row=r - 1, column=2).font = Font(bold=True, color="C55A11")

    r += 1
    _band(s, r, "TOP 5 TRUCKS BY DIESEL COST")
    s.header(r + 1, ["Truck", "Fills", "Litres", "Diesel cost (₹)", "Mileage (km/L)", "Share of total"])
    r += 2
    for x in rep["top_trucks"]:
        _link(s.put(r, 1, x["registration"]), x["sheet"])
        s.put(r, 2, x["fills"])
        s.put(r, 3, x["litres"], fmt=RATE)
        s.put(r, 4, x["cost"], fmt=MONEY)
        s.put(r, 5, x["mileage"] if x["mileage"] is not None else "—", fmt=KML)
        s.put(r, 6, round(x["cost"] / t["cost"] * 100, 1) if t["cost"] else 0, fmt='0.0"%"')
        r += 1
    if not rep["top_trucks"]:
        s.put(r, 1, "No fuel fills in this period.", color="6B7280")
        r += 1

    for label, key in (("BEST MILEAGE", "best"), ("LOWEST MILEAGE", "lowest")):
        r += 1
        _band(s, r, label)
        s.header(r + 1, ["Truck", "Mileage (km/L)", "Normal (km/L)", "Compared with normal", "Km judged", "Litres judged"])
        r += 2
        for x in rep[key]:
            _link(s.put(r, 1, x["registration"]), x["sheet"])
            s.put(r, 2, x["mileage"], fmt=KML)
            s.put(r, 3, x["normal_mileage"] if x["normal_mileage"] else "—", fmt=KML)
            s.put(r, 4, _mileage_note(x))
            s.put(r, 5, x["mileage_km"], fmt=KM)
            s.put(r, 6, x["mileage_litres"], fmt=RATE)
            r += 1
        if not rep[key]:
            s.put(r, 1, "No mileage can be worked out for this period yet.", color="6B7280")
            r += 1

    r += 1
    _band(s, r, "WORTH KNOWING")
    lim = rep["limits"]
    notes = [
        "Mileage = km between two fills ÷ litres at the second fill. A gap no truck could drive "
        f"(below {lim['min']} or above {lim['max']} km/L) is a wrong odometer or a missed fill: it's marked \"Check\" and left out.",
        "Fills that are far from the truck's usual mileage are marked \"Unusual\" and left out too, the same way the app works out mileage.",
        "Normal mileage is the truck's mileage over all its fills up to the end of the period — compare it with this period's.",
        "Average price paid = diesel cost ÷ litres. A price far from the base price"
        + (f" (₹{rep['base_price']:,.2f}/L)" if rep["base_price"] else "") + " is marked \"price looks wrong\".",
        "A sold truck appears only if it took fuel in the period.",
    ]
    if rep["totals"]["period_open"]:
        notes.insert(0, "The period isn't over yet — more fills may still be entered.")
    for i, n in enumerate(notes, 1):
        s.put(r + i, 1, f"{i}. {n}")
    r += len(notes) + 2

    _band(s, r, "WHAT'S IN THIS FILE")
    guide = [("Summary", "this page"), ("All Trucks", "one row per truck — click a truck to open its sheet")]
    if rep["trucks"]:
        guide.append(("One sheet per truck", "named after the registration: totals, mileage, last fill, every fill with a check, by month"))
    guide.append(("By Station", "every fuel station: fills, litres, cost, average price"))
    for i, (a, b) in enumerate(guide, 1):
        s.put(r + i, 1, a, bold=True)
        s.put(r + i, 2, b)
    s.widths([44, 18, 16, 22, 14, 14])
    return s


def _all_trucks(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "All Trucks")
    asof = _d(rep["as_of"]).strftime("%d-%m-%Y")
    r = _title(s, 1, "All Trucks", f"{rep['period']['label']} · click a truck to open its sheet")
    s.header(r, ["Truck", "Truck ID", "Status", "Fills", "Litres", "Diesel cost (₹)", "Avg price / L (₹)",
                 "Mileage (km/L)", "Normal (km/L)", "Compared with normal", "Last fill", f"Days since (to {asof})", "Fills to check"])
    first = r + 1
    r += 1
    for x in rep["trucks"]:
        c = s.put(r, 1, x["registration"])
        if x["fills"]:
            _link(c, x["sheet"])
        s.put(r, 2, x["truck_id"])
        s.put(r, 3, x["status"])
        s.put(r, 4, x["fills"] if x["fills"] else "No fills")
        s.put(r, 5, x["litres"], fmt=RATE)
        s.put(r, 6, x["cost"], fmt=MONEY)
        s.put(r, 7, x["avg_price"] if x["avg_price"] is not None else "—", fmt=RATE)
        s.put(r, 8, x["mileage"] if x["mileage"] is not None else "—", fmt=KML)
        s.put(r, 9, x["normal_mileage"] if x["normal_mileage"] else "—", fmt=KML)
        s.put(r, 10, _mileage_note(x))
        s.put(r, 11, _d(x["last_fill"]["date"]) if x["last_fill"] else "Never", fmt=DATE)
        s.put(r, 12, x["days_since"] if x["days_since"] is not None else "")
        c = s.put(r, 13, x["checks"] or "")
        if x["checks"]:
            c.font = Font(bold=True, color="C55A11")
            c.fill = _fill(WARN)
        r += 1
    if rep["trucks"]:
        t = rep["totals"]
        r += 1
        for c in range(1, 14):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        s.put(r, 4, t["fills"], bold=True, fill=TOTAL_FILL)
        s.put(r, 5, t["litres"], fmt=RATE, bold=True, fill=TOTAL_FILL)
        s.put(r, 6, t["cost"], fmt=MONEY, bold=True, fill=TOTAL_FILL)
        s.put(r, 7, t["avg_price"] if t["avg_price"] is not None else "—", fmt=RATE, bold=True, fill=TOTAL_FILL)
        s.put(r, 8, t["mileage"] if t["mileage"] is not None else "—", fmt=KML, bold=True, fill=TOTAL_FILL)
        s.put(r, 13, t["checks"] or "", bold=True, fill=TOTAL_FILL)
        s.ws.auto_filter.ref = f"A{first - 1}:M{first + len(rep['trucks']) - 1}"
    s.ws.freeze_panes = s.ws.cell(row=first, column=2)
    s.widths([16, 12, 16, 9, 12, 15, 14, 13, 12, 24, 12, 12, 12])
    return s


def _truck_sheet(wb: Workbook, x: dict, rep: dict) -> Sheet:
    s = Sheet(wb, x["sheet"])
    _link(s.put(1, 12, "← All Trucks"), "All Trucks")
    r = _title(s, 1, f"{x['registration']} — fuel", f"{x['truck_id']} · {rep['period']['label']}")
    _band(s, r, "TRUCK", 4)
    r = _pairs(s, r + 1, [
        ("Registration", x["registration"], None), ("Truck ID", x["truck_id"], None),
        ("Make / model", x["make"] or "—", None), ("Type · tyre layout", f"{x['truck_type']} · {x['tyre_layout']}", None),
        ("Tank size (litres)", x["fuel_capacity"] or "—", RATE),
        ("Status", x["status"], None), ("Current odometer (km)", x["odometer"], KM),
    ])
    r += 1
    _band(s, r, "THIS PERIOD", 4)
    r = _pairs(s, r + 1, [
        ("Fuel fills", x["fills"], None), ("Litres", x["litres"], RATE), ("Diesel cost (₹)", x["cost"], MONEY),
        ("Average price paid per litre (₹)", x["avg_price"] if x["avg_price"] is not None else "—", RATE),
        ("Mileage (km per litre)", x["mileage"] if x["mileage"] is not None else "Not enough good fills", KML),
        ("Normal mileage (all fills up to the period's end)", x["normal_mileage"] if x["normal_mileage"] else "—", KML),
        ("Compared with normal", _mileage_note(x) or "—", None),
        ("Fills to check", x["checks"], None),
    ])
    if x["checks"]:
        s.ws.cell(row=r - 1, column=2).font = Font(bold=True, color="C55A11")
    r += 1
    _band(s, r, "LAST FILL", 4)
    lf = x["last_fill"]
    r = _pairs(s, r + 1, [
        ("Date", _d(lf["date"]) if lf else "Never", DATE),
        ("At odometer (km)", lf["odometer"] if lf else "", KM),
        ("Litres", lf["litres"] if lf else "", RATE),
        (f"Days since (to {_d(rep['as_of']).strftime('%d-%m-%Y')})", x["days_since"] if x["days_since"] is not None else "", None),
    ])

    r += 1
    _band(s, r, "FILLS IN THIS PERIOD", 12)
    s.header(r + 1, ["Date", "Odometer (km)", "Km since last fill", "Litres", "Price / L (₹)", "Total (₹)",
                     "Mileage (km/L)", "Check", "Fuel station", "Entered by", "Source", ""])
    r += 2
    first = r
    for row in x["rows"]:
        s.put(r, 1, _d(row["date"]), fmt=DATE)
        s.put(r, 2, row["odometer"], fmt=KM)
        s.put(r, 3, row["distance"], fmt=KM)
        s.put(r, 4, row["litres"], fmt=RATE)
        s.put(r, 5, row["price"], fmt=RATE)
        s.put(r, 6, row["total"], fmt=MONEY)
        s.put(r, 7, row["mileage"], fmt=KML)
        c = s.put(r, 8, row["status"])
        if not row["ok"]:
            c.font = Font(bold=True, color="C55A11")
            c.fill = _fill(WARN)
        s.put(r, 9, row["station"])
        s.put(r, 10, row["entered_by"])
        s.put(r, 11, row["source"])
        r += 1
    if x["rows"]:
        r += 1
        for c in range(1, 12):
            s.ws.cell(row=r, column=c).fill = _fill(TOTAL_FILL)
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        s.put(r, 4, x["litres"], formula=f"=SUM(D{first}:D{r - 2})", fmt=RATE, bold=True, fill=TOTAL_FILL)
        s.put(r, 6, x["cost"], formula=f"=SUM(F{first}:F{r - 2})", fmt=MONEY, bold=True, fill=TOTAL_FILL)
        s.put(r, 7, x["mileage"] if x["mileage"] is not None else "—", fmt=KML, bold=True, fill=TOTAL_FILL)
    else:
        s.put(r, 1, "No fills in this period.", color="6B7280")

    if len(x["by_month"]) > 1:
        r += 2
        _band(s, r, "BY MONTH", 5)
        s.header(r + 1, ["Month", "Fills", "Litres", "Diesel cost (₹)", "Avg price / L (₹)"])
        r += 2
        for m in x["by_month"]:
            s.put(r, 1, m["month"])
            s.put(r, 2, m["fills"])
            s.put(r, 3, m["litres"], fmt=RATE)
            s.put(r, 4, m["cost"], fmt=MONEY)
            s.put(r, 5, round(m["cost"] / m["litres"], 2) if m["litres"] else "—", fmt=RATE)
            r += 1
    s.widths([24, 15, 16, 12, 13, 14, 14, 44, 24, 16, 14, 12])
    return s


def _stations(wb: Workbook, rep: dict) -> Sheet:
    s = Sheet(wb, "By Station")
    r = _title(s, 1, "By Station", f"{rep['period']['label']} · every fuel station used")
    s.header(r, ["Fuel station", "Fills", "Trucks", "Litres", "Diesel cost (₹)", "Avg price / L (₹)", "Share", "Latest fill"])
    r += 1
    total = rep["totals"]["cost"]
    for v in rep["stations"]:
        s.put(r, 1, v["name"])
        s.put(r, 2, v["fills"])
        s.put(r, 3, v["trucks"])
        s.put(r, 4, v["litres"], fmt=RATE)
        s.put(r, 5, v["cost"], fmt=MONEY)
        s.put(r, 6, v["avg_price"] if v["avg_price"] is not None else "—", fmt=RATE)
        s.put(r, 7, round(v["cost"] / total * 100, 1) if total else 0, fmt='0.0"%"')
        s.put(r, 8, _d(v["last_date"]), fmt=DATE)
        r += 1
    if rep["stations"]:
        r += 1
        s.put(r, 1, "TOTAL", bold=True, fill=TOTAL_FILL)
        s.put(r, 2, rep["totals"]["fills"], bold=True, fill=TOTAL_FILL)
        s.put(r, 4, rep["totals"]["litres"], fmt=RATE, bold=True, fill=TOTAL_FILL)
        s.put(r, 5, total, fmt=MONEY, bold=True, fill=TOTAL_FILL)
    else:
        s.put(r, 1, "No fuel fills in this period.", color="6B7280")
    s.widths([34, 9, 9, 12, 16, 15, 9, 13])
    return s


def filename_for(rep: dict) -> str:
    p = rep["period"]
    f = lambda s: date.fromisoformat(s).strftime("%d-%m-%Y")  # noqa: E731
    span = f"_{f(p['start'])}_to_{f(p['end'])}" if p["start"] and p["end"] else (
        f"_from_{f(p['start'])}" if p["start"] else f"_to_{f(p['end'])}" if p["end"] else "_all_time")
    who = f"_{SHEET_BAD.sub('-', rep['trucks'][0]['registration'])}" if rep["single_truck"] and rep["trucks"] else ""
    return f"Fuel_Report{who}{span}.xlsx"


def build(db: Session, start: date | None, end: date | None, search: str = "", truck_id: int | None = None):
    """(xlsx bytes, filename, preview sheets, report figures)."""
    rep = collect(db, start, end, search, truck_id)
    wb = Workbook()
    wb.remove(wb.active)
    sheets = [("Summary", _summary(wb, rep)), ("All Trucks", _all_trucks(wb, rep))]
    for x in rep["trucks"]:
        if x["fills"] or rep["single_truck"]:
            sheets.append((x["sheet"], _truck_sheet(wb, x, rep)))
    sheets.append(("By Station", _stations(wb, rep)))
    for _, sh in sheets:
        sh.ws.sheet_view.showGridLines = False
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue(), filename_for(rep), [sh.preview(name) for name, sh in sheets], rep
