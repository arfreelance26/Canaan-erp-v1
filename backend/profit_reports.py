"""Insights → View: Trip Summary, Customer Profitability and the Running Cost
Calculator as designed reports, in the Resource Hub report shape (registered
as kinds in resource_report.py, so the Excel writer, preview and PDF are shared):

  tripsummary  Trip Summary — the page's trips (routers/trips.py _pnl_base):
               hire after commission, the trip sheet's expense, P&L, km; by
               category, month, customer and truck; a sheet per month and one
               of the loss-making trips
  custprofit   Customer Profitability — the page's own aggregation
               (get_customer_profitability) in a Cost/KM mode: Trip, Gross and
               Final Profit; a ranking and a sheet per customer
  runningcost  Running Cost — every truck's cost per km in a mode, each part
               with how it was worked out (the calculator's "How is this
               calculated?", routers/cost_explain.py)

opts["rtype"] carries the Cost/KM mode for custprofit and runningcost.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date

from sqlalchemy.orm import Session

import models
import resource_report as rr
from audit_report import _inr
from maintenance_report import _iso, _period_label, _sheet_names
from resource_report import box, clean, table

MODES = ("Advanced", "Basic", "Manual")
CATS = ["OUTSTATION", "LOCAL", "SHIFTING", "LOCAL CFS", "RETURN TRIP"]


def _label(start, end) -> str:
    return _period_label(start, end) if start or end else "All time"


def _tone(v) -> str | None:
    return "bad" if v is not None and v < 0 else None


# ── Trip Summary ─────────────────────────────────────────────────────────────

def _tripsummary(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    from routers.trips import _pnl_base, _PNL_HIRE, _PNL_EXPENSE  # noqa: F401  (the page's own query)
    o = opts or {}
    start, end, category = o.get("start"), o.get("end"), o.get("category") or ""
    q = _pnl_base(db, search or None, _iso(start), _iso(end))
    if category:
        q = q.filter(models.Trip.trip_category == category)
    pairs = q.all()
    regs = dict(db.query(models.Truck.truck_id, models.Truck.registration_number).all())
    drivers = dict(db.query(models.Driver.driver_id, models.Driver.name).all())
    customers = dict(db.query(models.Customer.id, models.Customer.name).all())

    rows = []
    for t, s in pairs:
        hire = round(float(s.hire_amount or 0) - float(t.transport_commission_amount or 0), 2)
        exp = round(float(s.total_expense or 0), 2)
        rows.append({"t": t, "date": t.scheduled_date, "hire": hire, "exp": exp, "pnl": round(hire - exp, 2), "km": float(s.total_km or 0),
                     "truck": clean(regs.get(t.vehicle_id)) or clean(t.vehicle_id), "driver": clean(drivers.get(t.driver_id) or t.driver_name),
                     "customer": clean(customers.get(t.customer_id) or t.custom_customer_name or t.shipper_consignee) or "—",
                     "cat": t.trip_category or ""})
    rows.sort(key=lambda r: (r["date"] or date.min, r["pnl"]), reverse=True)

    def trip_row(r):
        return [r["t"].trip_id, _iso(r["date"]), rr.CAT.get(r["cat"], clean(r["cat"])), r["truck"], r["driver"], r["customer"],
                " → ".join(x for x in (clean(r["t"].origin), clean(r["t"].destination)) if x), r["km"], r["hire"], r["exp"],
                {"v": r["pnl"], "tone": _tone(r["pnl"])}]

    cols = [("Trip", "text"), ("Date", "date"), ("Category", "text"), ("Truck", "text"), ("Driver", "text", False), ("Customer", "text"),
            ("Route", "text"), ("Km", "km"), ("Hire (₹)", "money"), ("Expense (₹)", "money"), ("P&L (₹)", "money")]

    def tot(rs):
        return ["TOTAL", f"{len(rs)} trips", "", "", "", "", "", sum(r["km"] for r in rs), sum(r["hire"] for r in rs),
                sum(r["exp"] for r in rs), sum(r["pnl"] for r in rs)]

    months = defaultdict(list)
    for r in rows:
        months[r["date"].strftime("%Y-%m") if r["date"] else "No date"].append(r)
    month_keys = sorted(months, reverse=True)
    month_names = {k: (date.fromisoformat(k + "-01").strftime("%B %Y") if k != "No date" else k) for k in month_keys}
    losses = [r for r in rows if r["pnl"] < 0]
    sheets = _sheet_names([month_names[k] for k in month_keys] + ["Loss-making trips"])
    sheet_of = dict(zip(month_keys, sheets))

    items = []
    for k in month_keys:
        rs = months[k]
        p = sum(r["pnl"] for r in rs)
        items.append({"sheet": sheet_of[k], "title": month_names[k], "subtitle": f"{len(rs)} trips · newest first",
                      "boxes": [box("THIS MONTH", [("Trips", len(rs), "num"), ("Hire (₹)", sum(r["hire"] for r in rs), "money"),
                                                   ("Expense (₹)", sum(r["exp"] for r in rs), "money"),
                                                   ("Net P&L (₹)", p, "money", "bad" if p < 0 else "good"),
                                                   ("Km", sum(r["km"] for r in rs), "km"),
                                                   ("Loss-making trips", sum(1 for r in rs if r["pnl"] < 0), "num",
                                                    "bad" if any(r["pnl"] < 0 for r in rs) else None)])],
                      "tables": [table(month_names[k].upper(), cols, [trip_row(r) for r in rs], total=tot(rs))]})
    items.append({"sheet": sheets[-1], "title": "Loss-making trips", "subtitle": f"{len(losses)} trips where expense was more than hire · worst first",
                  "boxes": [], "tables": [table("LOSS-MAKING TRIPS", cols, [trip_row(r) for r in sorted(losses, key=lambda r: r["pnl"])],
                                                total=tot(losses))]})

    def group(key):
        g = defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])
        for r in rows:
            x = g[key(r)]
            x[0] += 1
            x[1] += r["hire"]
            x[2] += r["exp"]
            x[3] += r["pnl"]
            x[4] += r["km"]
        return g

    gcols = lambda first: [(first, "text"), ("Trips", "num"), ("Hire (₹)", "money"), ("Expense (₹)", "money"), ("P&L (₹)", "money"), ("Km", "km")]  # noqa: E731
    by_cat = group(lambda r: rr.CAT.get(r["cat"], r["cat"] or "—"))
    by_month = group(lambda r: r["date"].strftime("%Y-%m") if r["date"] else "No date")
    by_cust = group(lambda r: r["customer"])
    by_truck = group(lambda r: r["truck"] or "—")
    hire, exp, pnl = sum(r["hire"] for r in rows), sum(r["exp"] for r in rows), sum(r["pnl"] for r in rows)
    grow = lambda name, v: [name, v[0], v[1], v[2], {"v": v[3], "tone": _tone(v[3])}, v[4]]  # noqa: E731
    best = sorted(rows, key=lambda r: -r["pnl"])[:10]
    worst = sorted(rows, key=lambda r: r["pnl"])[:10]
    small = [("Trip", "text"), ("Date", "date"), ("Customer", "text"), ("Hire (₹)", "money"), ("P&L (₹)", "money")]
    filt = [rr.CAT.get(category, category)] if category else []
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": " · ".join([_label(start, end)] + filt)},
        "kpis": [{"label": "Trips", "value": str(len(rows)), "note": f"{sum(r['km'] for r in rows):,.0f} km"},
                 {"label": "Total Hire", "value": _inr(hire)},
                 {"label": "Total Expense", "value": _inr(exp)},
                 {"label": "Net P&L", "value": _inr(pnl), "tone": "bad" if pnl < 0 else "good" if pnl else None,
                  "note": f"{len(losses)} trips at a loss"}],
        "tables": [
            table("BY MONTH — click to open its sheet", gcols("Month"),
                  [[{"v": month_names[k], "link": sheet_of[k]}] + grow("", by_month[k])[1:] for k in month_keys],
                  total=["TOTAL", len(rows), hire, exp, pnl, sum(r["km"] for r in rows)]),
            table("BY CATEGORY", gcols("Category"), [grow(k, v) for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1][0])]),
            table("BY CUSTOMER — top 15 by hire", gcols("Customer"),
                  [grow(k, v) for k, v in sorted(by_cust.items(), key=lambda kv: -kv[1][1])[:15]]),
            table("BY TRUCK — top 15 by hire", gcols("Truck"), [grow(k, v) for k, v in sorted(by_truck.items(), key=lambda kv: -kv[1][1])[:15]]),
            table("BEST 10 TRIPS", small, [[r["t"].trip_id, _iso(r["date"]), r["customer"], r["hire"], r["pnl"]] for r in best]),
            table("WORST 10 TRIPS", small, [[r["t"].trip_id, _iso(r["date"]), r["customer"], r["hire"], {"v": r["pnl"], "tone": _tone(r["pnl"])}]
                                            for r in worst]),
        ],
        "notes": ["The same trips and figures as the Trip Summary page: every trip with a trip sheet, dated by its scheduled date.",
                  "Hire = the trip sheet's hire after transport commission. Expense = the trip sheet's total expense. P&L = hire − expense.",
                  "P&L here is the trip's own profit; diesel, tyres, EMI and other truck costs are in the Profitability report."],
        "items": items,
    }


# ── Customer Profitability ───────────────────────────────────────────────────

def _levels(x: dict, mode: str) -> dict:
    """The page's three profit levels (Customer Profitability toView / its export)."""
    rev = x.get("revenue", x.get("total_revenue")) or 0
    trip = x.get("profit", x.get("total_profit")) or 0
    gross, final = trip - (x["diesel"][mode] or 0), trip - (x["truck_cost"][mode] or 0)
    pct = lambda v: round(v / rev * 100, 2) if rev > 0 else 0.0  # noqa: E731
    return {"rev": rev, "trip": round(trip, 2), "gross": round(gross, 2), "final": round(final, 2),
            "trip_pct": pct(trip), "gross_pct": pct(gross), "final_pct": pct(final),
            "incomplete": (x["cost_missing"][mode] or 0) or (x["diesel_missing"][mode] or 0)}


def _custprofit(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    from routers.trips import get_customer_profitability
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    mode = o.get("rtype") if o.get("rtype") in MODES else "Advanced"
    term = (search or "").strip().lower()
    customers = [c for c in get_customer_profitability(date_from=start, date_to=end, db=db)
                 if not term or term in (c["customer_name"] or "").lower()]
    for c in customers:
        c["_l"] = _levels(c, mode)
    customers.sort(key=lambda c: -c["_l"]["final"])
    names = _sheet_names([clean(c["customer_name"]) or "Customer" for c in customers])
    sheet_of = {id(c): n for c, n in zip(customers, names)}

    def money(v):
        return {"v": v, "tone": _tone(v)}

    rank = []
    items = []
    for i, c in enumerate(customers, 1):
        L = c["_l"]
        rank.append([i, {"v": c["customer_name"] + (" (custom)" if c["is_custom"] else ""), "link": sheet_of[id(c)]}, c["trip_count"],
                     L["rev"], c["total_expense"], money(L["trip"]), money(L["gross"]), money(L["final"]),
                     {"v": L["final_pct"], "tone": _tone(L["final_pct"])},
                     {"v": f"{L['incomplete']} trips", "tone": "warn"} if L["incomplete"] else ""])
        route_rows = []
        for r in sorted(c["routes"], key=lambda r: -r["revenue"]):
            RL = _levels(r, mode)
            route_rows.append([r["route"], r["trip_count"], RL["rev"], r["expense"], money(RL["trip"]), money(RL["gross"]), money(RL["final"]),
                               RL["final_pct"], r["avg_km"]])
        trip_rows = []
        for t in c["recent_trips"]:
            d, tc = (t["diesel"] or {}).get(mode), (t["truck_cost"] or {}).get(mode)
            trip_rows.append([t["trip_id"], t["date"], t["route"], t["km"], t["revenue"], t["expense"], money(round(t["profit"], 2)),
                              money(round(t["profit"] - d, 2)) if d is not None else {"v": "no figure", "tone": "warn"},
                              money(round(t["profit"] - tc, 2)) if tc is not None else {"v": "no figure", "tone": "warn"},
                              {"v": "Flagged", "tone": "warn"} if t.get("flagged_for_recheck") else ""])
        items.append({
            "sheet": sheet_of[id(c)], "title": c["customer_name"] + (" (custom)" if c["is_custom"] else ""),
            "subtitle": f"Rank {i} of {len(customers)} by Final Profit · {c['trip_count']} trips · Cost/KM {mode}",
            "boxes": [
                box("TRIPS", [("Trips", c["trip_count"], "num"), ("Revenue (₹)", L["rev"], "money"), ("Expenses (₹)", c["total_expense"], "money"),
                              ("Km", c["total_km"], "km"), ("Routes", len(c["routes"]), "num"),
                              ("Flagged for recheck", c.get("flagged_trip_count") or 0, "num", "warn" if c.get("flagged_trip_count") else None)]),
                box("PROFIT", [("Trip Profit (₹)", L["trip"], "money", _tone(L["trip"])), ("  margin (%)", L["trip_pct"], "num"),
                               ("Gross Profit (₹)", L["gross"], "money", _tone(L["gross"])), ("  margin (%)", L["gross_pct"], "num"),
                               ("Final Profit (₹)", L["final"], "money", "bad" if L["final"] < 0 else "good"), ("  margin (%)", L["final_pct"], "num"),
                               ("Trips without a figure", L["incomplete"], "num", "warn" if L["incomplete"] else None)]),
            ],
            "tables": [
                table("ROUTES — most revenue first", [("Route", "text"), ("Trips", "num"), ("Revenue (₹)", "money"), ("Expenses (₹)", "money"),
                                                      ("Trip Profit (₹)", "money"), ("Gross Profit (₹)", "money"), ("Final Profit (₹)", "money"),
                                                      ("Final margin (%)", "num"), ("Avg km", "km")], route_rows),
                table(f"RECENT TRIPS — last {len(trip_rows)}", [("Trip", "text"), ("Date", "date"), ("Route", "text"), ("Km", "km"),
                                                                ("Revenue (₹)", "money"), ("Expenses (₹)", "money", False), ("Trip Profit (₹)", "money"),
                                                                ("Gross Profit (₹)", "money"), ("Final Profit (₹)", "money"), ("", "text", False)], trip_rows),
            ],
        })
    rev = sum(c["_l"]["rev"] for c in customers)
    tot = {k: sum(c["_l"][k] for c in customers) for k in ("trip", "gross", "final")}
    losing = [c for c in customers if c["_l"]["final"] < 0]
    over = [c for c in customers if c["_l"]["incomplete"]]
    pct = lambda v: f"{v / rev * 100:.1f}% margin" if rev else ""  # noqa: E731
    top_cols = [("Customer", "link"), ("Trips", "num"), ("Revenue (₹)", "money"), ("Final Profit (₹)", "money"), ("Final margin (%)", "num")]
    top_row = lambda c: [{"v": c["customer_name"], "link": sheet_of[id(c)]}, c["trip_count"], c["_l"]["rev"], money(c["_l"]["final"]), c["_l"]["final_pct"]]  # noqa: E731
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": f"{_label(start, end)} · Cost/KM {mode}"},
        "kpis": [{"label": "Revenue", "value": _inr(rev), "note": f"{len(customers)} customers, {sum(c['trip_count'] for c in customers)} trips"},
                 {"label": "Trip Profit", "value": _inr(tot["trip"]), "note": pct(tot["trip"])},
                 {"label": "Final Profit", "value": _inr(tot["final"]), "tone": "bad" if tot["final"] < 0 else "good", "note": pct(tot["final"])},
                 {"label": "Losing money", "value": str(len(losing)), "tone": "bad" if losing else None, "note": "customers below zero Final Profit"}],
        "tables": [
            table("EVERY CUSTOMER — by Final Profit, click a name to open its sheet",
                  [("Rank", "num"), ("Customer", "link"), ("Trips", "num"), ("Revenue (₹)", "money"), ("Expenses (₹)", "money"),
                   ("Trip Profit (₹)", "money"), ("Gross Profit (₹)", "money"), ("Final Profit (₹)", "money"), ("Final margin (%)", "num"),
                   ("Overstated", "text", False)],
                  rank, total=["", "TOTAL", sum(c["trip_count"] for c in customers), rev, sum(c["total_expense"] for c in customers),
                               tot["trip"], tot["gross"], tot["final"], None, ""]),
            table("MOST PROFITABLE — top 10", top_cols, [top_row(c) for c in customers[:10]]),
            table("LEAST PROFITABLE — bottom 10", top_cols, [top_row(c) for c in customers[-10:][::-1]] if len(customers) > 10 else []),
            table("PROFIT OVERSTATED — trips on trucks with no diesel or Cost/KM figure in this mode",
                  [("Customer", "link"), ("Trips without a figure", "num"), ("Final Profit (₹)", "money")],
                  [[{"v": c["customer_name"], "link": sheet_of[id(c)]}, c["_l"]["incomplete"], c["_l"]["final"]] for c in over]),
        ],
        "notes": [
            "The same figures as the Customer Profitability page. Trip Profit = hire (after commission) − the trip sheet's expenses. "
            "Gross Profit = Trip Profit − diesel (km × the truck's diesel cost per km). Final Profit = Trip Profit − km × the truck's "
            f"full Cost/KM (diesel, EMI, tyres, maintenance, documents), in {mode} mode.",
            "Trips on a truck with no diesel or Cost/KM figure in this mode count that cost as ₹0, so that customer's profit is "
            "overstated — listed above and marked on their sheet.",
            "Each customer's sheet lists their routes and their most recent trips.",
        ],
        "items": items,
    }


# ── Running Cost ─────────────────────────────────────────────────────────────

PART_ORDER = ["fuel", "adblue", "tyre", "maintenance", "compliance", "emi"]
PART_LABEL = {"fuel": "Diesel", "adblue": "AdBlue", "tyre": "Tyres", "maintenance": "Maintenance", "compliance": "Documents", "emi": "EMI"}


def _runningcost(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    """Every truck's cost per km in a mode, with the calculator's explanation of each part."""
    from routers.running_cost import explain_cost_per_km
    o = opts or {}
    mode = o.get("rtype") if o.get("rtype") in MODES else "Advanced"
    term = (search or "").strip().lower()
    trucks = [t for t in db.query(models.Truck).options(rr.slim(models.Truck)).filter(models.Truck.deleted_at.is_(None))
              .order_by(models.Truck.truck_id)
              if not term or term in (t.registration_number or "").lower() or term in (t.truck_id or "").lower()]
    explained = []
    for t in trucks:
        try:
            e = explain_cost_per_km(t.truck_id, mode, db)
        except Exception:  # noqa: BLE001 — one truck that can't be worked out never spoils the report
            e = {"total": None, "parts": [], "distance": {}, "note": "Couldn't be worked out."}
        explained.append((t, e))
    explained.sort(key=lambda x: -(x[1].get("total") or 0))
    names = _sheet_names([clean(t.registration_number) or t.truck_id for t, _ in explained])
    sheet_of = {t.truck_id: n for (t, _), n in zip(explained, names)}

    def part_map(e):
        return {p["key"]: p for p in e.get("parts", [])}

    all_rows, items, missing_rows = [], [], []
    sums, counted = defaultdict(float), defaultdict(int)
    for t, e in explained:
        pm = part_map(e)
        vals = [pm.get(k, {}).get("value") for k in PART_ORDER]
        gaps = [PART_LABEL[k] for k in PART_ORDER if pm.get(k, {}).get("value") is None]
        for k, v in zip(PART_ORDER, vals):
            if v is not None:
                sums[k] += v
                counted[k] += 1
        total = e.get("total")
        if gaps:
            missing_rows.append([{"v": clean(t.registration_number) or t.truck_id, "link": sheet_of[t.truck_id]}, ", ".join(gaps),
                                 total])
        all_rows.append([{"v": clean(t.registration_number) or t.truck_id, "link": sheet_of[t.truck_id]}, t.truck_id, clean(t.tyre_layout)]
                        + [round(v, 4) if v is not None else {"v": "—", "tone": "warn"} for v in vals]
                        + [round(total, 4) if total is not None else None])
        dist = e.get("distance") or {}
        tables = []
        for p in e.get("parts", []):
            inputs = [[i["label"], clean(i["value"]), clean(i.get("detail")), clean(i.get("source"))] for i in p.get("inputs", [])]
            head = f"{p['label'].upper()} — " + (f"₹{p['value']:.4f} a km" if p.get("value") is not None else "not worked out")
            if p.get("formula"):
                inputs.insert(0, ["How", p["formula"], "", ""])
            if p.get("missing"):
                inputs.insert(0, [{"v": "Missing", "tone": "warn"}, p["missing"], "", ""])
            tables.append(table(head, [("Figure", "text"), ("Value", "text"), ("Detail", "text", False), ("From", "text")], inputs))
            if p.get("table") and p["table"].get("rows"):
                tb = p["table"]
                foot = tb.get("footer")
                tables.append(table(f"  {tb.get('title') or p['label']}", [(c, "text") for c in tb["columns"]],
                                    [[clean(x) for x in row] for row in tb["rows"]], total=[clean(x) for x in foot] if foot else None))
        items.append({
            "sheet": sheet_of[t.truck_id], "title": clean(t.registration_number) or t.truck_id,
            "subtitle": f"{t.truck_id} · {clean(t.tyre_layout)} · Cost/KM {mode}" + (f" · {e['note']}" if e.get("note") else ""),
            "boxes": [
                box("COST PER KM", [(PART_LABEL[k], pm.get(k, {}).get("value"), "num", "warn" if pm.get(k, {}).get("value") is None else None)
                                    for k in PART_ORDER] + [("Total (₹ a km)", round(total, 4) if total is not None else None, "num")]),
                box("DISTANCE IT'S BASED ON", [("Normal km a month", dist.get("monthly_avg"), "km"), ("Km a day", dist.get("daily_avg"), "km"),
                                               ("Trips counted", dist.get("trips"), "num"),
                                               ("Trips without a sheet", dist.get("missing_sheets"), "num", "warn" if dist.get("missing_sheets") else None)]),
            ],
            "tables": tables,
        })
    totals = [t for t in (e.get("total") for _, e in explained) if t]
    avg = sum(totals) / len(totals) if totals else 0
    avg_rows = [[PART_LABEL[k], round(sums[k] / counted[k], 4) if counted[k] else None, counted[k]] for k in PART_ORDER]
    cols = [("Truck", "link"), ("Truck ID", "text"), ("Tyre layout", "text", False)] + [(f"{PART_LABEL[k]} (₹/km)", "num") for k in PART_ORDER] \
        + [("Total (₹/km)", "num")]
    return {
        "period": {"start": None, "end": None, "label": f"As of {today.strftime('%d-%m-%Y')} · {mode} mode"},
        "kpis": [{"label": "Fleet average", "value": f"₹{avg:.2f} a km", "note": f"{len(totals)} trucks with a figure"},
                 {"label": "Costliest", "value": f"₹{explained[0][1]['total']:.2f}" if totals else "—",
                  "note": clean(explained[0][0].registration_number) if totals else ""},
                 {"label": "Cheapest", "value": f"₹{min(totals):.2f}" if totals else "—"},
                 {"label": "With a part missing", "value": str(len(missing_rows)), "tone": "warn" if missing_rows else None,
                  "note": "their total is understated"}],
        "tables": [
            table("EVERY TRUCK — costliest first, click to see how each part was worked out", cols, all_rows),
            table("FLEET AVERAGE BY PART", [("Part", "text"), ("Average (₹/km)", "num"), ("Trucks with a figure", "num")], avg_rows),
            table("PARTS MISSING — the total leaves these out", [("Truck", "link"), ("Missing", "text"), ("Total (₹/km)", "num")], missing_rows),
        ],
        "notes": [
            f"The Running Cost Calculator's figures in {mode} mode. Each truck's sheet shows every part the way the calculator's "
            "\"How is this calculated?\" does: the formula, the figures behind it and where they come from.",
            "A part shown as — couldn't be worked out (e.g. no fuel fills, no EMI, no document costs), so the truck's total leaves it out.",
        ],
        "items": items,
    }


rr.KINDS.update({
    "tripsummary": (_tripsummary, "Trip Summary", "Trip Summary"),
    "custprofit": (_custprofit, "Customer Profitability", "Customer Profitability"),
    "runningcost": (_runningcost, "Running Cost", "Running Cost"),
})
rr.KIND_ROLES.update({"tripsummary": ("Admin",), "custprofit": ("Admin",), "runningcost": ("Admin",)})
rr.WITH_OPTS = tuple(dict.fromkeys(rr.WITH_OPTS + ("tripsummary", "custprofit", "runningcost")))
