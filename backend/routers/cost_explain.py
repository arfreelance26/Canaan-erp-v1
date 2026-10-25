"""
"How is this calculated?" — one truck's Cost/KM in one mode, part by part,
with the real numbers behind each part and the page each number comes from.
Powers the explanation window on the Running Cost Calculator's truck cards.

Every value here is taken from the same functions that work out Cost/KM for
the calculator and Profitability (running_cost._compute_basic_advanced_cost_per_km
and manual_cost_parts), so the explanation can never disagree with the card.
The inputs listed alongside are read from the same sources.
"""
from datetime import date

from sqlalchemy.orm import Session

import models
from cost_units import WORKING_DAYS_PER_MONTH, DAYS_PER_MONTH

# Where each number lives in the app (same-tab links from the window).
PAGES = {
    "emi":         ("Finance → EMI Tracking", "/finance/emi-tracking"),
    "fuel":        ("Maintenance → Truck's Fuel History", "/maintenance/fuel-history"),
    "tyre_mgmt":   ("Tyre Records → Tyre Management", "/maintenance/tyre-management"),
    "tyre_range":  ("Administration → Tyre Range Configuration", "/admin/tyre-range-config"),
    "tyre_cost":   ("Administration → Tyre Cost Configuration", "/admin/tyre-cost-config"),
    "maintenance": ("Maintenance → Truck Maintenance", "/maintenance/trucks"),
    "compliance":  ("Finance Hub → Compliance & Renewals", "/maintenance/compliance"),
    "run_record":  ("Maintenance → Truck Run Record", "/maintenance/truck-run-record"),
    "run_config":  ("Administration → Truck Run Configuration", "/admin/truck-run-config"),
    "calculator":  ("This page (Running Cost Calculator → Manual)", None),
}


def inr(n: float | None, decimals: int = 2) -> str:
    """₹ with Indian digit grouping (₹1,05,860.00)."""
    if n is None:
        return "—"
    neg = n < 0
    whole, _, frac = f"{abs(n):.{decimals}f}".partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{'-' if neg else ''}₹{whole}{'.' + frac if frac else ''}"


def num(n: float | None, decimals: int = 0) -> str:
    return "—" if n is None else inr(n, decimals).replace("₹", "")


def _src(key: str) -> dict:
    page, href = PAGES[key]
    return {"source": page, "href": href}


def _inp(label: str, value: str, key: str | None = None, detail: str | None = None) -> dict:
    d = {"label": label, "value": value, "detail": detail}
    d.update(_src(key) if key else {"source": None, "href": None})
    return d


def _table(columns: list[str], rows: list[list[str]], footer: list[str] | None = None,
           numeric: list[int] | None = None, title: str | None = None) -> dict:
    """Rows behind a part, shown as a small table in the window."""
    return {"title": title, "columns": columns, "rows": rows, "footer": footer, "numeric": numeric or []}


def _fmt_date(d) -> str:
    return d.strftime("%d-%m-%Y") if d else "—"


def explain_truck(db: Session, truck: models.Truck, mode: str) -> dict:
    from routers.running_cost import (
        _compute_basic_advanced_cost_per_km, manual_cost_parts, truck_run_stats_all, _fuel_base_price,
        _tyre_count,
    )
    from routers.maintenance import get_all_fuel_stats, maintenance_cost_summary_all
    from routers.trucks import compliance_docs_all

    layout = truck.tyre_layout or ""
    reg = (truck.registration_number or "").strip().upper()
    stats = truck_run_stats_all(db).get(truck.truck_id) or {}
    monthly_km = stats.get("monthly_avg") or 0.0

    if mode == "Manual":
        manual, live = manual_cost_parts(db)
        values = manual.get(truck.truck_id) or {}
    else:
        values = _compute_basic_advanced_cost_per_km(db, mode, with_parts=True, include_removed=True).get(truck.truck_id) or {}
        live = True

    run_cfg = db.query(models.TruckRunConfig).filter_by(tyre_layout=layout).first()
    kpd_basic = float(run_cfg.km_per_day) if run_cfg and run_cfg.km_per_day else None
    manual_cfg = db.query(models.RunningCostConfig).filter_by(mode="Manual").first()
    metrics = db.query(models.RunningCostTruckMetrics).filter_by(mode="Manual", truck_id=truck.id).first()
    manual_layout = db.query(models.RunningCostLayoutEntry).filter_by(mode="Manual", tyre_layout=layout).first()
    kpd_manual = float(manual_layout.km_per_day) if manual_layout and manual_layout.km_per_day else None

    def m(attr):  # a Manual value typed for this truck
        v = getattr(metrics, attr, None) if metrics else None
        return float(v) if v not in (None, "") and float(v) > 0 else None

    distance_input = _inp(
        "Monthly Distance Average", f"{num(monthly_km)} km a month", "run_record",
        f"{num(stats.get('total_distance'))} km from {stats.get('trips_with_distance', 0)} trip sheets over "
        f"{(stats.get('months') or 0):.1f} months ({_fmt_date(_d(stats.get('first_trip_date')))} → {_fmt_date(_d(stats.get('data_until')))})"
        if stats.get("trips_with_distance") else "no trip sheets yet",
    )
    kpd_input = _inp("km a day", f"{num(kpd_basic)} km/day (layout {layout or '—'})", "run_config")
    kpd_manual_input = _inp("km a day", f"{num(kpd_manual)} km/day (layout {layout or '—'}, typed)", "calculator")

    parts: list[dict] = []

    # ── ① EMI ───────────────────────────────────────────────────────────
    today = date.today()
    loans = [
        e for e in db.query(models.EmiRecord)
        if (e.truck_registration or "").strip().upper() == reg and not (e.emi_end_date and e.emi_end_date < today)
    ]
    emi_month = sum(float(e.emi_amount or 0) for e in loans)
    p = {"key": "emi", "label": "EMI", "table": None, "value": values.get("emi"), "inputs": [], "formula": None, "missing": None}
    if mode == "Manual":
        typed = m("emi_amount")
        p["inputs"] = [_inp("EMI a month", inr(typed, 0) if typed else "not typed", "calculator"), kpd_manual_input]
        p["formula"] = f"{inr(typed, 0)} ÷ 26 working days = {inr(typed / 26 if typed else None)} a day; ÷ {num(kpd_manual)} km a day" if typed and kpd_manual else None
        p["missing"] = None if p["value"] is not None else ("No EMI amount typed for this truck in Manual." if not typed else "No km/day typed for this layout in Manual.")
    else:
        p["inputs"] = [_inp("EMI a month", inr(emi_month, 0) if loans else "no active loan", "emi",
                            f"{len(loans)} active loan{'s' if len(loans) != 1 else ''}" if loans else None)]
        if len(loans) > 1:
            p["table"] = _table(
                ["Loan", "Bank", "Ends", "EMI a month"],
                [[e.emi_name or "Loan", e.bank_name or "—", _fmt_date(e.emi_end_date), inr(float(e.emi_amount or 0), 0)] for e in loans],
                ["Total", "", "", inr(emi_month, 0)], numeric=[3], title="Active loans")
        if mode == "Basic":
            p["inputs"].append(kpd_input)
            p["formula"] = (f"{inr(emi_month, 0)} ÷ 26 working days = {inr(emi_month / 26)} a day; "
                            f"÷ {num(kpd_basic)} km a day") if loans and kpd_basic else None
            p["missing"] = None if p["value"] is not None else (
                f"No active EMI record for {truck.registration_number}." if not loans else
                f"km/day isn't set for layout {layout or '—'} in Truck Run Configuration.")
        else:
            p["inputs"].append(distance_input)
            p["formula"] = f"{inr(emi_month, 0)} a month ÷ {num(monthly_km)} km a month" if loans and monthly_km else None
            p["missing"] = None if p["value"] is not None else (
                f"No active EMI record for {truck.registration_number}." if not loans else
                "No trip sheets for this truck yet, so its monthly distance isn't known.")
    parts.append(p)

    # ── ② Diesel ────────────────────────────────────────────────────────
    base_price = _fuel_base_price(db)
    mileage = get_all_fuel_stats(db).get(str(truck.id))
    fills = db.query(models.FuelLog).filter_by(truck_id=truck.id).count()
    p = {"key": "fuel", "label": "Diesel", "table": None, "value": values.get("fuel"), "inputs": [], "formula": None, "missing": None}
    if mode == "Manual":
        price = base_price or (float(manual_cfg.cost_per_litre) if manual_cfg and manual_cfg.cost_per_litre else 0.0)
        typed = m("mileage")
        p["inputs"] = [
            _inp("Diesel price", f"{inr(price)} a litre" if price else "not set", "fuel" if base_price else "calculator",
                 "Fuel History's base price" if base_price else "typed on this page"),
            _inp("Mileage", f"{typed:g} km a litre" if typed else "not typed", "calculator"),
        ]
        p["formula"] = f"{inr(price)} a litre ÷ {typed:g} km a litre" if price and typed else None
        p["missing"] = None if p["value"] is not None else ("No mileage typed for this truck in Manual." if not typed else "No diesel price set.")
    else:
        p["inputs"] = [
            _inp("Diesel price", f"{inr(base_price)} a litre" if base_price else "not set", "fuel", "Base Litre Cost"),
            _inp("Mileage", f"{mileage:.2f} km a litre" if mileage else "not enough fills", "fuel",
                 f"lifetime average from {fills} fuel fill{'s' if fills != 1 else ''}"),
        ]
        p["formula"] = f"{inr(base_price)} a litre ÷ {mileage:.2f} km a litre" if base_price and mileage else None
        p["missing"] = None if p["value"] is not None else (
            "Set the Base Litre Cost in Truck's Fuel History." if not base_price else
            "This truck needs at least two fuel fills to work out its mileage.")
    parts.append(p)

    # ── ③ Tyres ─────────────────────────────────────────────────────────
    p = {"key": "tyre", "label": "Tyres", "table": None, "value": values.get("tyre"), "inputs": [], "formula": None, "missing": None}
    ranges = {r.tyre_type: r for r in db.query(models.TyreRangeConfig)}
    if mode == "Basic":
        qty = [q for q in db.query(models.TyreLayoutTypeConfig).filter_by(tyre_layout=layout) if q.quantity and q.quantity > 0]
        rows, counted_qty = [], 0
        for q in qty:
            cpm = ranges.get(q.tyre_type).base_cost_per_km if ranges.get(q.tyre_type) else None
            rows.append([q.tyre_type, str(q.quantity), inr(float(cpm), 4) if cpm else "not set",
                         inr(q.quantity * float(cpm), 4) if cpm else "—"])
            counted_qty += q.quantity if cpm else 0
        p["inputs"] = [
            _inp("Tyres on this layout", f"{sum(q.quantity for q in qty)} tyres" if qty else "not set", "tyre_cost", f"layout {layout or '—'}"),
            _inp("Base cost per km of each tyre type", "see table", "tyre_range"),
        ]
        if rows:
            p["table"] = _table(["Tyre type", "Qty", "Base ₹/km each", "₹/km"], rows,
                                ["Total", str(counted_qty), "", inr(values.get("tyre"), 4) if values.get("tyre") else "—"],
                                numeric=[1, 2, 3], title=f"Tyre Cost Configuration · layout {layout}")
        p["formula"] = "Σ quantity × base cost per km, for each tyre type on this layout" if rows else None
        p["missing"] = None if p["value"] is not None else f"Tyre quantities / base costs aren't set for layout {layout or '—'}."
    elif mode == "Advanced":
        fitted = (
            db.query(models.TyreFitmentRecord, models.TyreInventory)
            .join(models.TyreInventory, models.TyreInventory.id == models.TyreFitmentRecord.tyre_id)
            .filter(models.TyreFitmentRecord.truck_id == truck.id, models.TyreFitmentRecord.removed_date.is_(None))
            .all()
        )
        counted, skipped, rows, used_types = [], [], [], {}
        for fr, ty in sorted(fitted, key=lambda x: x[0].position or ""):
            rk = ranges.get(ty.tyre_type).range_km if ranges.get(ty.tyre_type) else None
            cost = float(ty.cost or 0)
            ok = cost > 0 and rk
            rows.append([fr.position or "—", ty.tyre_number, ty.tyre_type or "—",
                         inr(cost, 0) if cost > 0 else "no cost", f"{num(rk)} km" if rk else "no range",
                         inr(cost / rk, 4) if ok else "not counted"])
            if ok:
                counted.append(ty.tyre_number)
                used_types[ty.tyre_type] = rk
            else:
                skipped.append(ty.tyre_number)
        p["inputs"] = [
            _inp("Tyres fitted now", f"{len(fitted)} tyre{'s' if len(fitted) != 1 else ''}"
                 + (f" · {len(skipped)} not counted (no cost or range)" if skipped else ""), "tyre_mgmt"),
            _inp("Expected range", ", ".join(f"{t} {num(r)} km" for t, r in used_types.items()) or "not set", "tyre_range"),
        ]
        if rows:
            p["table"] = _table(["Position", "Tyre no.", "Type", "Cost", "Expected range", "₹/km"], rows,
                                ["Total", f"{len(counted)} counted", "", "", "", inr(values.get("tyre"), 4) if values.get("tyre") else "—"],
                                numeric=[3, 4, 5], title="Fitted tyres")
        p["formula"] = (f"each fitted tyre's cost ÷ its expected range, added up for {len(counted)} tyre{'s' if len(counted) != 1 else ''}"
                        if counted else None)
        p["missing"] = None if p["value"] is not None else "No fitted tyres with a cost and expected range."
    else:
        override = m("tyre_per_km")
        qty_cfg = (manual_cfg.tyre_cost_config_qty or {}) if manual_cfg else {}
        if override:
            p["inputs"] = [_inp("Tyre charges per km", inr(override, 4), "calculator", "typed for this truck")]
            p["formula"] = "typed for this truck"
        elif qty_cfg.get(layout):
            p["inputs"] = [_inp("Tyres on this layout", ", ".join(f"{q} {t}" for t, q in qty_cfg[layout].items()), "calculator",
                                "Manual → Tyre Cost Configuration (cost ÷ range per tyre type)")]
            p["formula"] = "Σ quantity × (tyre cost ÷ range) for this layout"
        elif metrics and metrics.tyre_type:
            p["inputs"] = [_inp("Tyre type", f"{metrics.tyre_type} × {_tyre_count(layout)} tyres", "calculator")]
            p["formula"] = f"(tyre cost ÷ range) × {_tyre_count(layout)} tyres"
        p["missing"] = None if p["value"] is not None else "Nothing typed for tyres in Manual."
    parts.append(p)

    # ── ④ Maintenance ───────────────────────────────────────────────────
    p = {"key": "maintenance", "label": "Maintenance", "table": None, "value": values.get("maintenance"), "inputs": [], "formula": None, "missing": None}
    if mode == "Manual":
        typed = m("maintenance_per_km")
        p["inputs"] = [_inp("Maintenance per km", inr(typed, 4) if typed else "not typed", "calculator")]
        p["formula"] = "typed for this truck" if typed else None
        p["missing"] = None if p["value"] is not None else "No maintenance per km typed in Manual."
    else:
        ms = maintenance_cost_summary_all(db).get(truck.id)
        bills = db.query(models.MaintenanceRecord).filter(
            models.MaintenanceRecord.truck_id == truck.id,
            models.MaintenanceRecord.date >= _d(ms["from"]) if ms else False,
        ).count() if ms else 0
        p["inputs"] = [_inp(
            "Maintenance bills (last 12 months)", inr(ms["total"], 0) if ms else "none", "maintenance",
            f"{bills} bill{'s' if bills != 1 else ''} since {_fmt_date(_d(ms['from']))}, spread over "
            f"{ms['months']:.1f} months on record = {inr(ms['monthly'], 0)} a month" if ms else None)]
        if mode == "Basic":
            p["inputs"].append(kpd_input)
            p["formula"] = f"{inr(ms['monthly'], 0)} a month ÷ 26 = {inr(ms['daily'])} a day; ÷ {num(kpd_basic)} km a day" if ms and kpd_basic else None
        else:
            p["inputs"].append(distance_input)
            p["formula"] = f"{inr(ms['monthly'], 0)} a month ÷ {num(monthly_km)} km a month" if ms and monthly_km else None
        p["missing"] = None if p["value"] is not None else (
            "No maintenance bills in the last 12 months." if not ms else
            (f"km/day isn't set for layout {layout or '—'} in Truck Run Configuration." if mode == "Basic"
             else "No trip sheets for this truck yet, so its monthly distance isn't known."))
    parts.append(p)

    # ── ⑤ Compliance ────────────────────────────────────────────────────
    p = {"key": "compliance", "label": "Compliance", "table": None, "value": values.get("compliance"), "inputs": [], "formula": None, "missing": None}
    if mode == "Manual":
        typed = m("compliance_cost_per_year")
        p["inputs"] = [_inp("Compliance cost a year", inr(typed, 0) if typed else "not typed", "calculator"), kpd_manual_input]
        p["formula"] = f"{inr(typed, 0)} ÷ 12 months ÷ 26 working days ÷ {num(kpd_manual)} km a day" if typed and kpd_manual else None
        p["missing"] = None if p["value"] is not None else "No compliance cost typed in Manual."
    else:
        docs = compliance_docs_all(db).get(truck.id, [])
        counted = [d for d in docs if d["per_calendar_day"]]
        per_cal = sum(d["per_calendar_day"] for d in counted)
        per_wd = per_cal * DAYS_PER_MONTH / WORKING_DAYS_PER_MONTH
        p["inputs"] = [_inp("Documents counted", f"{len(counted)} of 7 = {inr(per_cal)} a calendar day", "compliance")]
        p["table"] = _table(
            ["Document", "Cost", "Valid", "Days", "₹ a day"],
            [[d["label"], inr(d["expense"], 0) if d["expense"] else "—",
              f"{_fmt_date(d['issued'])} → {_fmt_date(d['expiry'])}" if d["per_calendar_day"] else (d["skipped"] or "—"),
              str(d["validity_days"]) if d["validity_days"] else "—",
              inr(d["per_calendar_day"]) if d["per_calendar_day"] else "not counted"] for d in docs],
            ["Total", inr(sum(d["expense"] for d in counted), 0), "", "", inr(per_cal)],
            numeric=[1, 3, 4], title="Documents (cost spread over the days it's valid)")
        if mode == "Basic":
            p["inputs"].append(kpd_input)
            p["formula"] = (f"{inr(per_cal)} a calendar day × 30.44 ÷ 26 = {inr(per_wd)} a working day; "
                            f"÷ {num(kpd_basic)} km a day") if counted and kpd_basic else None
        else:
            p["inputs"].append(distance_input)
            p["formula"] = f"{inr(per_wd * 26, 0)} a month ({inr(per_wd)} a working day × 26) ÷ {num(monthly_km)} km a month" if counted and monthly_km else None
        p["missing"] = None if p["value"] is not None else (
            "No document has a cost, expiry date and renewal date to spread it over." if not counted else
            (f"km/day isn't set for layout {layout or '—'} in Truck Run Configuration." if mode == "Basic"
             else "No trip sheets for this truck yet, so its monthly distance isn't known."))
    parts.append(p)

    note = None
    if mode == "Manual" and not live:
        # The server hasn't got Manual's tyre quantities yet, so it shows the
        # figures the calculator page last saved (some only as a total).
        note = ("These Manual figures were last saved by the calculator page. Open the "
                "Running Cost Calculator once so the server can work Manual out — and "
                "explain it — part by part.")
        for x in parts:
            if x["value"] is None and values.get("total") is not None:
                x["missing"] = "Saved by the calculator as part of the total only."
    known = [x["value"] for x in parts if x["value"] is not None]
    return {
        "note": note,
        "truck_id": truck.truck_id,
        "registration_number": truck.registration_number,
        "tyre_layout": layout,
        "mode": mode,
        "total": values.get("total"),
        "parts_total": round(sum(known), 6) if known else None,
        "manual_live": live,
        "distance": {
            "monthly_avg": monthly_km, "daily_avg": stats.get("daily_avg") or 0.0,
            "trips": stats.get("trips_with_distance", 0), "missing_sheets": stats.get("missing_sheets", 0),
            "configured_km_per_day": kpd_basic,
        },
        "parts": parts,
    }


def _d(v):
    """'2026-07-09' → date (or None)."""
    if not v:
        return None
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v))
    except ValueError:
        return None
