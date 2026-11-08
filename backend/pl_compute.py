"""Every Profitability number, worked out once — for the page and the Excel.

The page used to get raw pieces (hire, expenses, km) and per-km rates and do
the maths in the browser, while the Excel did the same maths here; any change
to one would have made them disagree. Now both read compute():

  Trip   Trip Profit = Hire − Trip Expenses
         Diesel      = KM × diesel ₹/km                     (mileage, this mode)
         Gross       = Trip Profit − Diesel
         Truck Exp.  = KM × Cost/KM − Diesel                 (EMI, AdBlue, tyres,
                                                              maintenance, documents; all
                                                              of Cost/KM when there's no
                                                              diesel figure)
         Final       = Trip Profit − KM × Cost/KM
         EMI, Docs,  = a steady ₹/km (Basic / Advanced): the truck's monthly cost
         Maintenance   for the trip's month ÷ a monthly km — Basic the km/day
                       setting × 26, Advanced the truck's normal km a month
                       (emi_alloc.py) — in place of Cost/KM's, so a trip is
                       judged on its own, not on how busy the month was
         Diesel, Tyres = as of the trip's month in Basic / Advanced (emi_alloc.
                       month_running_costs): that month's diesel price ÷ the
                       truck's mileage then; Advanced tyres fitted then
  Truck  Diesel, Tyres = the sum of its trips' (each at its own month's rate)
         No diesel rate → the trip can't be judged (Final Profit None): diesel
                       is the biggest cost, counting it as 0 would show a loss
                       as a profit
  Truck  Diesel = KM × diesel ₹/km, AdBlue = KM × AdBlue ₹/km,
         Tyres  = KM × tyre ₹/km                               (Running Cost Calculator)
         Net    = Trip Profit − Diesel − AdBlue − Tyres − Maintenance − EMI − Documents
                  (a missing rate counts as 0 and is listed in `incomplete`)

"Profitable" / "loss" means AFTER ALL COSTS everywhere: Final Profit for a
trip, Net Profit for a truck. Trips under audit review are listed but left out
of every total and count.
"""
from datetime import date

from sqlalchemy.orm import Session

MODES = ("Manual", "Basic", "Advanced")
# Cost/KM's parts other than diesel (diesel has its own column) — Truck Expenses.
SPLIT_PARTS = ("emi", "adblue", "tyre", "maintenance", "compliance")


def _r(v):
    return round(v, 2) if v is not None else None


def rates(db: Session, mode: str) -> dict:
    """Every per-km figure the numbers below use, for one mode."""
    from routers.running_cost import get_cost_parts_all, get_cost_parts_per_km, get_cost_per_km, get_mileage_cost_per_km
    return {
        "cpk": get_cost_per_km(db).get(mode, {}),                 # truck → Cost/KM
        "diesel": get_mileage_cost_per_km(db).get(mode, {}),      # truck → diesel ₹/km (trips)
        "truck_parts": get_cost_parts_per_km(db).get(mode, {}),   # truck → {fuel, tyre} (trucks)
        "split": get_cost_parts_all(db).get(mode, {}),            # truck → every part of Cost/KM
    }


def trip_money(t: dict, truck_id: str, R: dict, fixed: dict | None = None, mode: str = "",
               running: dict | None = None) -> dict:
    """fixed: the truck's monthly costs and km for the trip's month
    (emi_alloc.month_rates); in Basic and Advanced their steady ₹/km replace
    Cost/KM's EMI, documents and maintenance parts (when the parts are known)."""
    km = float(t.get("total_km") or 0)
    hire, texp = float(t.get("hire_amount") or 0), float(t.get("total_expense") or 0)
    trip_profit = hire - texp
    d_rate = R["diesel"].get(truck_id)
    cpk = R["cpk"].get(truck_id)
    p = R["split"].get(truck_id) or {}
    # Diesel (and Advanced tyres) as of the trip's month — emi_alloc.month_running_costs.
    month_diesel = running is not None and mode in ("Basic", "Advanced")
    if month_diesel:
        new_d = running["diesel_rate"]
        if cpk is not None:
            cpk = cpk - (d_rate or 0) + (new_d or 0)
        d_rate = new_d
        if mode == "Advanced" and p.get("parts_known"):
            if cpk is not None:
                cpk = cpk - (p.get("tyre") or 0) + (running["tyre_rate"] or 0)
            p = {**p, "tyre": running["tyre_rate"]}
    diesel = km * d_rate if d_rate is not None and km > 0 else None
    # EMI, documents and maintenance: the steady ₹/km for the trip's month
    # (emi_alloc.py) instead of the calculator's — swapped inside Cost/KM too.
    fixed_rates = (fixed or {}).get("rates", {}).get(mode)
    use_fixed = fixed_rates is not None and bool(p.get("parts_known"))
    if use_fixed:
        new = {"emi": fixed_rates["emi"], "compliance": fixed_rates["documents"], "maintenance": fixed_rates["maintenance"]}
        if cpk is not None:
            cpk = cpk + sum((new[k] or 0) - (p.get(k) or 0) for k in new)
        p = {**p, **new}
    # The month's rates are all known even when today's Cost/KM isn't (a sold
    # truck, no base diesel price set): build it from them.
    if cpk is None and (use_fixed or month_diesel) and p.get("parts_known") and d_rate is not None:
        cpk = d_rate + sum(p.get(k) or 0 for k in SPLIT_PARTS)
    full = km * cpk if cpk is not None and km > 0 else None
    # Without a diesel rate the trip can't be judged — see the top of the file.
    if km > 0 and d_rate is None:
        full = None
    truck_exp = None if full is None else (max(0.0, full - diesel) if diesel is not None else full)
    final = trip_profit - full if full is not None else None
    # Truck Expenses itemised (the Excel's EMI / AdBlue / Tyres / Maintenance / Documents).
    split = None
    if full is not None and p.get("parts_known"):
        split = {k: (km * p[k] if p.get(k) is not None else None) for k in SPLIT_PARTS}
        # Taken part by part — exactly the Excel's sum (Hire − Trip Expenses −
        # Diesel − EMI − Tyres − Maintenance − Documents). The parts are stored
        # to 6 decimals, so km × Cost/KM can differ from their sum by a
        # fraction of a paisa; this keeps the page and the Excel identical.
        truck_exp = sum(v or 0 for v in split.values())
        final = trip_profit - (diesel or 0) - truck_exp
    return {
        "trip_profit": trip_profit, "diesel_rate": d_rate, "diesel": diesel,
        "gross": trip_profit - diesel if diesel is not None else None,
        "cost_per_km": cpk, "truck_expenses": truck_exp,
        "truck_expenses_include_diesel": full is not None and diesel is None,
        "final_profit": final,
        "split": split,
        "split_rates": {k: p.get(k) for k in SPLIT_PARTS} if split else None,
        # The diesel price and mileage behind this trip's diesel (its month's).
        "diesel_month": {"month": fixed["month"] if fixed else None, **running} if month_diesel else None,
        # Where this trip's EMI, documents and maintenance per km came from.
        "fixed_month": {
            "month": fixed["month"], "mode": mode, "km": fixed_rates["km"],
            "normal_km": fixed["normal_km"], "months_used": fixed["months_used"], "setting_km": fixed["setting_km"],
            "cost": {k: fixed[k] for k in ("emi", "documents", "maintenance")},
            "rate": {k: fixed_rates[k] for k in ("emi", "documents", "maintenance")},
        } if use_fixed else None,
    }


def truck_money(e: dict, R: dict, mode: str, trips: list[dict] | None = None) -> dict:
    """trips: this truck's trip rows with their money — in Basic / Advanced its
    diesel (and Advanced tyres) are the sum of its counted trips', each at its
    own month's rate, so a period spanning months uses each month's price."""
    km = float(e.get("total_km") or 0)
    p = R["truck_parts"].get(e["truck_id"]) or {}
    d_rate, t_rate, a_rate = p.get("fuel"), p.get("tyre"), p.get("adblue")
    diesel = 0.0 if km <= 0 else (km * d_rate if d_rate is not None else None)
    counted = [t for t in (trips or []) if not t.get("excluded_from_totals") and float(t.get("total_km") or 0) > 0]
    if mode in ("Basic", "Advanced") and counted and all(t["money"].get("diesel_month") for t in counted):
        rates = [t["money"]["diesel_month"]["diesel_rate"] for t in counted]
        diesel = None if any(r is None for r in rates) else sum(float(t["total_km"]) * r for t, r in zip(counted, rates))
        d_rate = diesel / km if diesel is not None and km > 0 else None
        if mode == "Advanced":
            tr = [t["money"]["diesel_month"]["tyre_rate"] for t in counted]
            t_rate = None if any(r is None for r in tr) else sum(float(t["total_km"]) * r for t, r in zip(counted, tr)) / km
    # AdBlue: km × the truck's AdBlue ₹/km. No rate yet (fewer than 2 AdBlue
    # fills) counts as 0 — shown in the panel, not flagged as missing data.
    adblue = 0.0 if km <= 0 or a_rate is None else km * a_rate
    tyres = 0.0 if km <= 0 else (km * t_rate if t_rate is not None else None)
    trip_profit = float(e["total_hire_amount"]) - float(e["trip_expenses"])
    running = (tyres or 0) + adblue + float(e["maintenance_expenses"])
    fixed = float(e["emi_share"]) + float(e["document_share"])
    incomplete = []
    if diesel is None:
        incomplete.append(f"no diesel cost per km for this truck in {mode} mode")
    if tyres is None:
        incomplete.append(f"no tyre charges per km for this truck in {mode} mode")
    return {
        "trip_profit": trip_profit, "diesel_rate": d_rate, "diesel": diesel,
        "gross": trip_profit - diesel if diesel is not None else None,
        "adblue_rate": a_rate, "adblue": adblue,
        "tyre_rate": t_rate, "tyres": tyres, "running": running, "fixed": fixed,
        "net": trip_profit - (diesel or 0) - running - fixed, "incomplete": incomplete,
    }


def reconcile(e: dict, money: dict, truck_trips: list[dict]) -> dict:
    """Why the Trucks tab's Net Profit differs from the sum of this truck's
    trips' Final Profit. The Trucks tab counts the period's ACTUAL maintenance
    bills, the full EMI for the period (paid even on idle days) and the
    documents' period share; each trip carries km × those costs' ₹/km instead.
    Exactly:  Net = trips_final + maintenance + emi + documents + other
    (each term is the cost NOT covered by the trips — negative = extra cost)."""
    counted = [t for t in truck_trips if not t.get("excluded_from_totals")]
    judged = [t for t in counted if t["money"]["final_profit"] is not None]
    trips_final = sum(t["money"]["final_profit"] for t in judged)
    itemised = bool(judged) and all(t["money"]["split"] for t in judged)
    side = lambda k: sum((t["money"]["split"] or {}).get(k) or 0 for t in judged) if itemised else 0.0
    actual = {"maintenance": float(e["maintenance_expenses"]), "emi": float(e["emi_share"]),
              "documents": float(e["document_share"])}
    on_trips = {"maintenance": side("maintenance"), "emi": side("emi"), "documents": side("compliance")}
    terms = {k: (on_trips[k] - actual[k]) if itemised or not judged else 0.0 for k in actual}
    other = money["net"] - trips_final - sum(terms.values())
    return {
        "trips_final": trips_final, "trips_judged": len(judged), "trips_counted": len(counted),
        "trips_flagged": len(truck_trips) - len(counted), "itemised": itemised,
        **{k: terms[k] for k in terms},
        **{f"{k}_actual": actual[k] for k in actual},
        **{f"{k}_on_trips": on_trips[k] for k in on_trips},
        "other": other,
    }


_RATE_KEYS = {"diesel_rate", "tyre_rate", "adblue_rate", "cost_per_km", "split_rates", "fixed_month", "diesel_month"}


def _round_money(m: dict) -> None:
    for k, v in m.items():
        if k in _RATE_KEYS:
            continue
        if isinstance(v, float):
            m[k] = round(v, 2)
        elif isinstance(v, dict):
            m[k] = {kk: (round(vv, 2) if isinstance(vv, float) else vv) for kk, vv in v.items()}


def _matches(q: str, *values) -> bool:
    return any(q in (v or "").lower() for v in values)


def trip_matches(q: str, t: dict) -> bool:
    """The Profitability search on a trip row; q is lower-case. The Excel uses it too."""
    return _matches(q, t.get("trip_code"), t.get("trip_sheet_no"), t.get("booking_reference_no"),
                    t["truck_id"], t["registration_number"], t.get("customer_name"),
                    t.get("from_location"), t.get("to_location"),
                    t.get("cargo_classification"), t.get("trip_category"))


def truck_matches(q: str, e: dict) -> bool:
    return _matches(q, e["truck_id"], e.get("registration_number"))


def compute(db: Session, start: date, end: date, mode: str, search: str = "", R: dict | None = None,
            rounded: bool = True) -> dict:
    """rounded=False keeps each trip's / truck's figures at full precision —
    the Excel needs that so its preview equals what Excel's own formulas give."""
    from routers.pl_summary import get_pl_summary
    R = R or rates(db, mode)
    entries = get_pl_summary(start, end, None, db)
    q = (search or "").strip().lower()

    # Each truck's real EMI and km for every month its trips fall in.
    import emi_alloc
    wanted = {(e["truck_id"], emi_alloc.trip_month(t.get("trip_date")))
              for e in entries for t in e.get("trip_rows", []) if t.get("trip_date")}
    fixed_months = emi_alloc.month_rates(db, wanted)
    running_months = emi_alloc.month_running_costs(db, wanted) if mode in ("Basic", "Advanced") else {}

    trips = []
    for e in entries:
        for t in e.get("trip_rows", []):
            # The truck panel's own trip list shows Trip Profit too.
            t["trip_profit"] = round(float(t.get("hire_amount") or 0) - float(t.get("total_expense") or 0), 2)
            row = {**t, "truck_id": e["truck_id"], "registration_number": e.get("registration_number") or "",
                   "disposal": e.get("disposal"),
                   "money": trip_money(t, e["truck_id"], R,
                                       fixed_months.get((e["truck_id"], emi_alloc.trip_month(t.get("trip_date")))), mode,
                                       running_months.get((e["truck_id"], emi_alloc.trip_month(t.get("trip_date")))))}
            trips.append(row)
    all_trip_count = len(trips)
    all_trips = trips
    if q:
        trips = [t for t in trips if trip_matches(q, t)]

    counted = [t for t in trips if not t.get("excluded_from_totals")]
    with_final = [t for t in counted if t["money"]["final_profit"] is not None]
    with_gross = [t for t in counted if t["money"]["gross"] is not None]
    profitable = sum(1 for t in with_final if t["money"]["final_profit"] >= 0)
    trip_totals = {
        "trips": len(trips), "counted": len(counted), "flagged": len(trips) - len(counted),
        "hire": _r(sum(float(t["hire_amount"]) for t in counted)),
        "trip_expenses": _r(sum(float(t["total_expense"]) for t in counted)),
        "trip_profit": _r(sum(float(t["hire_amount"]) - float(t["total_expense"]) for t in counted)),
        "gross_trips": len(with_gross),
        "diesel": _r(sum(t["money"]["diesel"] for t in with_gross)),
        "gross": _r(sum(t["money"]["gross"] for t in with_gross)),
        "truck_expenses": _r(sum(t["money"]["truck_expenses"] or 0 for t in counted)),
        "final_trips": len(with_final),
        "final": _r(sum(t["money"]["final_profit"] for t in with_final)) if with_final else None,
        # After all costs (Final Profit). Trips with no Cost/KM can't be judged.
        "profitable": profitable, "non_profitable": len(with_final) - profitable,
        "profitable_pct": round(profitable / len(with_final) * 100) if with_final else None,
        "non_profitable_pct": round((len(with_final) - profitable) / len(with_final) * 100) if with_final else None,
        "unjudged": len(counted) - len(with_final),
    }

    # Trucks tab vs Trips tab, per truck — from ALL its trips (not the search's).
    by_truck: dict[str, list[dict]] = {}
    for t in all_trips:
        by_truck.setdefault(t["truck_id"], []).append(t)
    trucks = [{**e, "money": truck_money(e, R, mode, by_truck.get(e["truck_id"], []))} for e in entries]
    for e in trucks:
        e["money"]["reconcile"] = reconcile(e, e["money"], by_truck.get(e["truck_id"], []))
    all_truck_count = len(trucks)
    if q:
        trucks = [e for e in trucks if truck_matches(q, e)]
    m = [e["money"] for e in trucks]
    t_profitable = sum(1 for x in m if x["net"] >= 0)
    truck_totals = {
        "trucks": len(trucks),
        "idle": sum(1 for e in trucks if not e.get("trip_count")),
        "incomplete": sum(1 for x in m if x["incomplete"]),
        "profitable": t_profitable, "non_profitable": len(trucks) - t_profitable,
        "trips": sum(int(e.get("trip_count") or 0) for e in trucks),
        "km": _r(sum(float(e.get("total_km") or 0) for e in trucks)),
        "hire": _r(sum(float(e["total_hire_amount"]) for e in trucks)),
        "trip_expenses": _r(sum(float(e["trip_expenses"]) for e in trucks)),
        "trip_profit": _r(sum(x["trip_profit"] for x in m)),
        "diesel": _r(sum(x["diesel"] or 0 for x in m)),
        "gross": _r(sum(x["gross"] if x["gross"] is not None else x["trip_profit"] for x in m)),
        "running": _r(sum(x["running"] for x in m)),
        "fixed": _r(sum(x["fixed"] for x in m)),
        "net": _r(sum(x["net"] for x in m)),
        # Truck Net = Trips' Final + each of these (positive: trips carried more
        # than was really spent). Over every truck, without a search only.
        "why_differ": None if q else {
            k: _r(sum(x["reconcile"][k] for x in m)) for k in ("maintenance", "emi", "documents", "other")
        } | {"trips_final": _r(sum(x["reconcile"]["trips_final"] for x in m)),
             "idle_trucks": sum(1 for e in trucks if not any(
                 not t.get("excluded_from_totals") for t in by_truck.get(e["truck_id"], []))),
             # Counted trips the Trips tab can't judge (no km on the sheet, or no Cost/KM).
             "unjudged_trips": sum(1 for t in all_trips if not t.get("excluded_from_totals")
                                   and t["money"]["final_profit"] is None),
             "no_km_trips": sum(1 for t in all_trips if not t.get("excluded_from_totals")
                                and float(t.get("total_km") or 0) <= 0)},
    }
    # Round for display only after every sum above used full precision —
    # the Excel adds the unrounded values too, so totals agree to the paisa.
    if rounded:
        for t in all_trips:
            _round_money(t["money"])
        for e in trucks:
            _round_money(e["money"])
            # Shown figures must add up exactly: the trips' total is the sum of
            # the trips as displayed, and "other" takes the last paisa.
            rc = e["money"]["reconcile"]
            mine = [t for t in by_truck.get(e["truck_id"], [])
                    if not t.get("excluded_from_totals") and t["money"]["final_profit"] is not None]
            rc["trips_final"] = round(sum(t["money"]["final_profit"] for t in mine), 2)
            # Rounding paisa go to the biggest line, not a stray "₹0.01 other".
            residue = round(e["money"]["net"] - rc["trips_final"] - rc["maintenance"] - rc["emi"] - rc["documents"] - rc["other"], 2)
            if residue:
                key = max(("maintenance", "emi", "documents", "other"), key=lambda k: abs(rc[k]))
                rc[key] = round(rc[key] + residue, 2)
    return {
        "mode": mode, "trips": trips, "trip_totals": trip_totals, "all_trip_count": all_trip_count,
        "trucks": trucks, "truck_totals": truck_totals, "all_truck_count": all_truck_count,
        "data_health": data_health(db, all_trips),
    }


def data_health(db: Session, all_trips: list[dict]) -> dict:
    """What in the data holds this period's figures back (the page's warning
    box links each to where it's fixed): counted trips with no km on their
    sheet, counted trips whose truck has no diesel rate, trucks with no diesel
    rate, and documents held (expiry date set) with no cost entered — those
    count as ₹0."""
    import models
    from routers.trucks import COMPLIANCE_COST_DOCS
    counted = [t for t in all_trips if not t.get("excluded_from_totals")]
    no_km = [t for t in counted if float(t.get("total_km") or 0) <= 0]
    no_diesel = [t for t in counted if float(t.get("total_km") or 0) > 0 and t["money"]["diesel_rate"] is None]
    docs = 0
    for truck in db.query(models.Truck).filter(models.Truck.deleted_at.is_(None)).all():
        docs += sum(1 for cost, expiry, _ in COMPLIANCE_COST_DOCS
                    if getattr(truck, expiry) and not float(getattr(truck, cost) or 0) > 0)
    return {
        "no_km_trips": len(no_km),
        "no_diesel_trips": len(no_diesel),
        "no_diesel_trucks": len({t["truck_id"] for t in no_diesel}),
        "documents_without_cost": docs,
    }
