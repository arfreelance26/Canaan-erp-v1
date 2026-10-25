from datetime import date as _date
from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from cost_units import DAYS_PER_MONTH, WORKING_DAYS_PER_MONTH, per_km_advanced
import models, schemas

router = APIRouter(prefix="/running-cost", tags=["Running Cost Calculator"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_decimal(val: str | None) -> Decimal | None:
    if not val:
        return None
    try:
        d = Decimal(str(val).strip())
        return d if d > 0 else None
    except InvalidOperation:
        return None


def _to_int(val: str | None) -> int | None:
    if not val:
        return None
    try:
        i = int(float(val))
        return i if i > 0 else None
    except (ValueError, TypeError):
        return None


def _fmt(val) -> str:
    if val is None:
        return ""
    s = str(val)
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


CALC_MODES = ["Manual", "Basic", "Advanced"]


def _build_mode_response(mode: str, db: Session) -> dict:
    config     = db.query(models.RunningCostConfig).filter_by(mode=mode).first()
    tyre_rows  = db.query(models.RunningCostTyreEntry).filter_by(mode=mode).all()
    layout_rows = db.query(models.RunningCostLayoutEntry).filter_by(mode=mode).all()
    truck_rows  = db.query(models.RunningCostTruckMetrics).filter_by(mode=mode).all()
    return {
        "cost_per_litre": _fmt(config.cost_per_litre) if config else "",
        "tyre_cost_config_qty": (config.tyre_cost_config_qty or {}) if config else {},
        "tyre_entries": {
            r.tyre_type: {"cost": _fmt(r.cost_per_tyre), "range": _fmt(r.expected_range_km)}
            for r in tyre_rows
        },
        "run_entries": {
            r.tyre_layout: {"month": _fmt(r.km_per_month), "day": _fmt(r.km_per_day)}
            for r in layout_rows
        },
        "truck_metrics": {
            str(r.truck_id): {
                "emi_amount":              _fmt(r.emi_amount),
                "emi_per_day":             _fmt(r.emi_per_day),
                "emi_per_km":              _fmt(r.emi_per_km),
                "mileage":                 _fmt(r.mileage),
                "tyre_type":                 r.tyre_type or "",
                "tyre_per_km":               _fmt(r.tyre_per_km),
                "maintenance_per_km":        _fmt(r.maintenance_per_km),
                "compliance_cost_per_year":  _fmt(r.compliance_cost_per_year),
            }
            for r in truck_rows
        },
    }


def _save_mode_data(mode: str, data: schemas.RccModeDataIn, db: Session) -> None:
    # Config (cost per litre)
    config = db.query(models.RunningCostConfig).filter_by(mode=mode).first()
    if not config:
        config = models.RunningCostConfig(mode=mode)
        db.add(config)
    config.cost_per_litre = _to_decimal(data.cost_per_litre)
    if data.tyre_cost_config_qty is not None:
        config.tyre_cost_config_qty = {
            layout: {t: str(q) for t, q in types.items() if str(q).strip() != ""}
            for layout, types in data.tyre_cost_config_qty.items()
        }

    # Tyre entries
    for tyre_type, entry in data.tyre_entries.items():
        row = db.query(models.RunningCostTyreEntry).filter_by(mode=mode, tyre_type=tyre_type).first()
        if row:
            row.cost_per_tyre = _to_decimal(entry.cost)
            row.expected_range_km = _to_int(entry.range)
        else:
            db.add(models.RunningCostTyreEntry(
                mode=mode, tyre_type=tyre_type,
                cost_per_tyre=_to_decimal(entry.cost),
                expected_range_km=_to_int(entry.range),
            ))

    # Layout entries
    for layout, entry in data.run_entries.items():
        row = db.query(models.RunningCostLayoutEntry).filter_by(mode=mode, tyre_layout=layout).first()
        if row:
            row.km_per_month = _to_decimal(entry.month)
            row.km_per_day = _to_decimal(entry.day)
        else:
            db.add(models.RunningCostLayoutEntry(
                mode=mode, tyre_layout=layout,
                km_per_month=_to_decimal(entry.month),
                km_per_day=_to_decimal(entry.day),
            ))

    # Truck metrics
    for tid_str, m in data.truck_metrics.items():
        try:
            tid = int(tid_str)
        except (ValueError, TypeError):
            continue
        row = db.query(models.RunningCostTruckMetrics).filter_by(mode=mode, truck_id=tid).first()
        if row is None and not db.query(models.Truck).filter_by(id=tid).first():
            continue  # truck deleted; skip to avoid FK violation
        if row:
            row.emi_amount  = _to_decimal(m.emi_amount)
            row.emi_per_day = _to_decimal(m.emi_per_day)
            row.emi_per_km  = _to_decimal(m.emi_per_km)
            row.mileage = _to_decimal(m.mileage)
            row.tyre_type = m.tyre_type or None
            row.tyre_per_km = _to_decimal(m.tyre_per_km)
            row.maintenance_per_km = _to_decimal(m.maintenance_per_km)
            row.compliance_cost_per_year = _to_decimal(m.compliance_cost_per_year)
        else:
            db.add(models.RunningCostTruckMetrics(
                mode=mode, truck_id=tid,
                emi_amount=_to_decimal(m.emi_amount),
                emi_per_day=_to_decimal(m.emi_per_day),
                emi_per_km=_to_decimal(m.emi_per_km),
                mileage=_to_decimal(m.mileage),
                tyre_type=m.tyre_type or None,
                tyre_per_km=_to_decimal(m.tyre_per_km),
                maintenance_per_km=_to_decimal(m.maintenance_per_km),
                compliance_cost_per_year=_to_decimal(m.compliance_cost_per_year),
            ))


# ---------------------------------------------------------------------------
# GET /running-cost/state  — returns all three modes' data in one response
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Manual Cost/Km on the server — a faithful port of TruckCostCard's Manual
# formula (running-cost-calculator/page.tsx), from the Manual inputs the
# calculator saves. Profitability etc. no longer depend on someone opening the
# calculator for a new truck / layout change to show up.
# ---------------------------------------------------------------------------

def _pos(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def _tyre_count(layout: str) -> int:
    """'10+1' → 11, same as the calculator's parseTyreCount."""
    total = 0
    for part in (layout or "").split("+"):
        try:
            total += int(part.strip())
        except ValueError:
            pass
    return total


def _manual_cost_live(db: Session, include_removed: bool = True) -> dict[str, dict] | None:
    """{truck_business_id: {"total", "emi", "fuel", "tyre", "maintenance",
    "compliance"}} for Manual — or None while the Tyre Cost Configuration
    quantities have never been saved to the server (then the calculator's own
    saved figures are used instead)."""
    cfg = db.query(models.RunningCostConfig).filter_by(mode="Manual").first()
    if cfg is None or cfg.tyre_cost_config_qty is None:
        return None
    qty_cfg: dict = cfg.tyre_cost_config_qty or {}

    # Diesel price: Fuel History's base price, else the one typed in Manual —
    # exactly what the calculator loads into Manual's Cost Per Litre.
    price = _fuel_base_price(db) or (float(cfg.cost_per_litre) if cfg.cost_per_litre else 0.0)
    tyre_types = [r.tyre_type for r in db.query(models.TyreRangeConfig).all()]
    tyre_entries = {r.tyre_type: r for r in db.query(models.RunningCostTyreEntry).filter_by(mode="Manual").all()}
    km_per_day = {r.tyre_layout: _pos(r.km_per_day) for r in db.query(models.RunningCostLayoutEntry).filter_by(mode="Manual").all()}
    metrics = {m.truck_id: m for m in db.query(models.RunningCostTruckMetrics).filter_by(mode="Manual").all()}

    def per_tyre(tyre_type: str) -> float | None:
        e = tyre_entries.get(tyre_type)
        cost, rng = (_pos(e.cost_per_tyre), _pos(e.expected_range_km)) if e else (None, None)
        return cost / rng if cost and rng else None

    trucks_q = db.query(models.Truck)
    if not include_removed:
        trucks_q = trucks_q.filter(models.Truck.deleted_at.is_(None))
    out: dict[str, dict] = {}
    for truck in trucks_q.all():
        m = metrics.get(truck.id)
        layout = truck.tyre_layout or ""
        kpd = km_per_day.get(layout)

        emi_amount = _pos(m.emi_amount) if m else None
        emi = (emi_amount / 26) / kpd if emi_amount and kpd else None

        mileage = _pos(m.mileage) if m else None
        fuel = price / mileage if mileage and price > 0 else None

        tyre = _pos(m.tyre_per_km) if m else None        # typed override
        if tyre is None:                                  # Tyre Cost Configuration (qty × cost ÷ range)
            layout_qty = qty_cfg.get(layout) or {}
            total = 0.0
            for t in tyre_types:
                q = _pos(layout_qty.get(t))
                c = per_tyre(t)
                if q and c:
                    total += c * q
            tyre = total if total > 0 else None
        if tyre is None and m and m.tyre_type:            # the truck's tyre type × its tyre count
            c, n = per_tyre(m.tyre_type), _tyre_count(layout)
            tyre = c * n if c and n > 0 else None

        maintenance = _pos(m.maintenance_per_km) if m else None
        per_year = _pos(m.compliance_cost_per_year) if m else None
        compliance = per_year / 12 / 26 / kpd if per_year and kpd else None

        parts = {"emi": emi, "fuel": fuel, "tyre": tyre, "maintenance": maintenance, "compliance": compliance}
        known = [v for v in parts.values() if v is not None]
        out[truck.truck_id] = {
            "total": round(sum(known), 6) if known else None,
            **{k: (round(v, 6) if v is not None else None) for k, v in parts.items()},
        }
    return out


def manual_cost_parts(db: Session) -> tuple[dict[str, dict], bool]:
    """Manual Cost/KM per truck_business_id with its five parts, and whether it
    was worked out live on the server (True) or taken from the figures the
    calculator last saved (False — before its tyre quantities were saved)."""
    live = _manual_cost_live(db)
    if live is not None:
        return live, True
    saved: dict[str, dict] = {}
    for row in db.query(models.RunningCostTruckCostPerKm).filter_by(mode="Manual").all():
        saved[row.truck_business_id] = {
            "total": float(row.cost_per_km) if row.cost_per_km is not None else None,
            **{k: (float(getattr(row, f"{k}_per_km")) if getattr(row, f"{k}_per_km") is not None else None) for k in COST_PARTS},
        }
    return saved, False


@router.get("/state")
def get_state(db: Session = Depends(get_db)):
    return {mode: _build_mode_response(mode, db) for mode in CALC_MODES}


# ---------------------------------------------------------------------------
# PUT /running-cost/state  — saves all three modes' data in one request
# ---------------------------------------------------------------------------

@router.put("/state", status_code=204)
def save_state(payload: schemas.RunningCostStateIn, db: Session = Depends(get_db)):
    _save_mode_data("Manual",   payload.Manual,   db)
    _save_mode_data("Basic",    payload.Basic,    db)
    _save_mode_data("Advanced", payload.Advanced, db)
    db.commit()


# ---------------------------------------------------------------------------
# Live Basic/Advanced Cost/Km — a faithful server-side port of TruckCostCard's
# formula (running-cost-calculator/page.tsx), so "Total Truck Expenses" in P&L
# Summary works even when nobody has ever opened the calculator. Manual mode
# is NOT covered: it is inherently user-typed, so if it was never entered
# there is genuinely nothing to derive — that mode still relies on the
# RunningCostTruckCostPerKm cache pushed live by the calculator below.
#
# Simplification vs. the frontend: "active EMI" uses the same emi_end_date
# rule already established in /trucks/cost-per-km-ranking, not the frontend's
# fuller tenure/paid-installments "Completed" check — the two only diverge
# for a loan whose schedule has drifted from its recorded dates.
# ---------------------------------------------------------------------------



def truck_run_stats_all(db: Session) -> dict[str, dict]:
    """Truck Run Record's distance stats for every truck, keyed by trucks.truck_id
    — the ONE place the Monthly Distance Average is worked out (the calculator,
    Profitability, Cost Breakdown, EMI Insights and Full Status all use it).

    For accuracy:
      * only trips with a trip sheet (km > 0) count — a trip whose sheet isn't
        in yet has no known km, so it can't pull the average down;
      * cancelled and deleted trips are ignored;
      * the span runs by DAYS from the first counted trip to the LATEST
        counted trip anywhere in the fleet (not today) — if trip sheets are
        being entered late, every truck would otherwise look idle for those
        weeks; a truck that really sat idle while others ran still shows it.
        The current month isn't counted as a whole month; 1-month minimum so
        a brand-new truck's first trips aren't blown up into a huge rate.
    missing_sheets = completed trips still without a sheet (shown as a warning).
    """
    rows = (
        db.query(models.Trip.vehicle_id, models.Trip.assigned_date, models.Trip.status, models.TripSheet.total_km)
        .outerjoin(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
        .filter(models.Trip.deleted_at.is_(None), models.Trip.status != "Cancelled")
        .all()
    )
    counted_dates = [a for v, a, s, km in rows if v and a and float(km or 0) > 0]
    data_until = min(max(counted_dates), _date.today()) if counted_dates else _date.today()
    per_truck: dict[str, dict] = {}
    for vehicle_id, assigned, status, total_km in rows:
        if not vehicle_id:
            continue
        t = per_truck.setdefault(vehicle_id, {"km": [], "dates": [], "missing": 0})
        km = float(total_km or 0)
        if km > 0:
            t["km"].append(km)
            if assigned:
                t["dates"].append(assigned)
        elif status == "Completed":
            t["missing"] += 1

    result: dict[str, dict] = {}
    for vehicle_id, t in per_truck.items():
        total = sum(t["km"])
        first = min(t["dates"]) if t["dates"] else None
        days = (data_until - first).days + 1 if first else 0
        months = max(days, DAYS_PER_MONTH) / DAYS_PER_MONTH if first else 0.0
        monthly = total / months if months > 0 else 0.0
        result[vehicle_id] = {
            "total_distance": round(total, 2),
            "trips_with_distance": len(t["km"]),
            "missing_sheets": t["missing"],
            "first_trip_date": first.isoformat() if first else None,
            "data_until": data_until.isoformat(),
            "days": days,
            "months": round(months, 4),
            "monthly_avg": round(monthly, 4),
            "daily_avg": round(monthly / 26, 4),  # same 26 working days as the rest of the app
            "avg_per_trip": round(total / len(t["km"]), 2) if t["km"] else 0.0,
            "longest": max(t["km"]) if t["km"] else 0.0,
            "shortest": min(t["km"]) if t["km"] else 0.0,
        }
    return result


def _truck_run_monthly_avg_all(db: Session) -> dict[str, float]:
    """{truck_business_id: Monthly Distance Average} — see truck_run_stats_all."""
    return {vid: st["monthly_avg"] for vid, st in truck_run_stats_all(db).items()}


def _fuel_base_price(db: Session) -> float:
    """Diesel price per litre from Maintenance → Fuel History's base config."""
    fuel_cfg = db.query(models.FuelBaseConfig).first()
    return float(fuel_cfg.cost_per_litre) if fuel_cfg and fuel_cfg.cost_per_litre else 0.0


def _auto_fuel_per_km_all(db: Session) -> dict[str, float]:
    """Basic/Advanced "Mileage" cost per km, keyed by trucks.id (as string):
    Fuel History diesel price ÷ the truck's lifetime-average mileage (km/L)."""
    from routers.maintenance import get_all_fuel_stats
    cost_per_litre = _fuel_base_price(db)
    if cost_per_litre <= 0:
        return {}
    return {
        tid: cost_per_litre / mileage
        for tid, mileage in get_all_fuel_stats(db).items()
        if mileage and mileage > 0
    }


COST_PARTS = ("emi", "fuel", "tyre", "maintenance", "compliance")


def _compute_basic_advanced_cost_per_km(db: Session, mode: str, with_parts: bool = False, include_removed: bool = False) -> dict:
    """{truck_business_id: cost/km} for Basic or Advanced. with_parts=True
    returns {truck_business_id: {"total": .., "emi": .., "fuel": .., "tyre": ..,
    "maintenance": .., "compliance": ..}} instead — the same numbers, split.
    include_removed adds sold/deleted trucks (Profitability still shows their
    past trips)."""
    from routers.maintenance import (
        get_all_fuel_stats,
        get_maintenance_cost_per_km_all, get_maintenance_cost_per_day_all,
    )
    from routers.trucks import get_compliance_per_km_all, get_compliance_per_day_all

    trucks_q = db.query(models.Truck)
    if not include_removed:
        trucks_q = trucks_q.filter(models.Truck.deleted_at.is_(None))
    trucks = trucks_q.all()
    if not trucks:
        return {}

    fuel_per_km_map  = _auto_fuel_per_km_all(db)
    maint_map          = get_maintenance_cost_per_km_all(db)
    maint_per_day_map  = get_maintenance_cost_per_day_all(db) if mode == "Advanced" else {}
    compliance_per_day_map = get_compliance_per_day_all(db) if mode == "Advanced" else {}
    compliance_map      = get_compliance_per_km_all(db)
    monthly_avg_map     = _truck_run_monthly_avg_all(db) if mode == "Advanced" else {}


    # Active EMI per truck registration — sums multiple loans.
    emi_by_reg: dict[str, dict[str, float]] = {}
    for rec in db.query(models.EmiRecord).all():
        if not rec.truck_registration:
            continue
        if rec.emi_end_date and rec.emi_end_date < _date.today():
            continue
        reg = rec.truck_registration.strip().upper()
        e = emi_by_reg.setdefault(reg, {"amount": 0.0, "per_day": 0.0})
        e["amount"] += float(rec.emi_amount or 0)
        # Always EMI ÷ 26 working days — the stored daily_finance_cost of
        # older records was worked out with an outdated formula.
        e["per_day"] += float(rec.emi_amount or 0) / WORKING_DAYS_PER_MONTH

    run_config_by_layout = {
        c.tyre_layout: float(c.km_per_day) for c in db.query(models.TruckRunConfig).all() if c.km_per_day
    }

    # Basic tyre cost per layout = sum(type quantity × that type's base cost/km)
    base_cpm_by_type = {
        r.tyre_type: float(r.base_cost_per_km)
        for r in db.query(models.TyreRangeConfig).all() if r.base_cost_per_km
    }
    basic_tyre_by_layout: dict[str, float] = {}
    for q in db.query(models.TyreLayoutTypeConfig).all():
        if not q.quantity or q.quantity <= 0:
            continue
        cpm = base_cpm_by_type.get(q.tyre_type)
        if cpm:
            basic_tyre_by_layout[q.tyre_layout] = basic_tyre_by_layout.get(q.tyre_layout, 0.0) + q.quantity * cpm

    # Advanced tyre cost per truck = sum(currently-fitted tyre cost ÷ its type's range_km)
    range_by_type = {r.tyre_type: r.range_km for r in db.query(models.TyreRangeConfig).all() if r.range_km}
    advanced_tyre_by_truck: dict[int, float] = {}
    fitted = (
        db.query(models.TyreFitmentRecord, models.TyreInventory)
        .join(models.TyreInventory, models.TyreInventory.id == models.TyreFitmentRecord.tyre_id)
        .filter(models.TyreFitmentRecord.removed_date.is_(None))
        .all()
    )
    for fr, tyre in fitted:
        range_km = range_by_type.get(tyre.tyre_type)
        cost = float(tyre.cost or 0)
        if cost > 0 and range_km and range_km > 0:
            advanced_tyre_by_truck[fr.truck_id] = advanced_tyre_by_truck.get(fr.truck_id, 0.0) + cost / range_km

    result: dict[str, float | None] = {}
    for truck in trucks:
        tid = str(truck.id)
        fuel_per_km = fuel_per_km_map.get(tid)


        reg = (truck.registration_number or "").strip().upper()
        emi = emi_by_reg.get(reg)
        # EMI per working day = EMI ÷ 26 (summed over the truck's active loans).
        emi_per_day = emi["per_day"] if emi and emi["per_day"] > 0 else None
        emi_per_day_basic = emi_per_day_advanced = emi_per_day

        maint_basic = maint_map.get(tid)
        compliance_basic = compliance_map.get(tid)

        if mode == "Basic":
            km_per_day = run_config_by_layout.get(truck.tyre_layout or "")
            emi_per_km = (emi_per_day_basic / km_per_day) if emi_per_day_basic and km_per_day and km_per_day > 0 else None
            tyre_per_km = basic_tyre_by_layout.get(truck.tyre_layout or "")
            maintenance_per_km = maint_basic if maint_basic else None
            compliance_per_km = compliance_basic if compliance_basic else None
        else:  # Advanced
            monthly_avg = monthly_avg_map.get(truck.truck_id, 0.0)
            emi_per_km = per_km_advanced(emi_per_day_advanced, monthly_avg)
            tyre_per_km = advanced_tyre_by_truck.get(truck.id)
            # Advanced = the month's cost ÷ the month's km (Avg/Day × 26 ÷ Monthly Distance Average).
            maint_per_day = maint_per_day_map.get(tid)
            maintenance_per_km = per_km_advanced(maint_per_day, monthly_avg)
            compliance_per_day = compliance_per_day_map.get(tid)
            compliance_per_km = per_km_advanced(compliance_per_day, monthly_avg)

        # AdBlue isn't part of the calculator (Truck's Adblue History is a record only).
        components = [emi_per_km, fuel_per_km, tyre_per_km, maintenance_per_km, compliance_per_km]
        total = round(sum(c or 0 for c in components), 6) if any(c is not None for c in components) else None
        if with_parts:
            result[truck.truck_id] = {"total": total, **{
                k: (round(v, 6) if v is not None else None) for k, v in zip(COST_PARTS, components)
            }}
        else:
            result[truck.truck_id] = total

    return result


# ---------------------------------------------------------------------------
# Cost/Km — live for Basic/Advanced, cached (pushed by the calculator) for
# Manual. Replaces the old localStorage hand-off between this calculator and
# P&L Summary's Truck Profitability tab.
# ---------------------------------------------------------------------------

@router.get("/monthly-avg-km-all")
def get_monthly_avg_km_all(db: Session = Depends(get_db)):
    """Returns {truck_business_id: monthly_avg_km} for every truck with trip
    history. Lets the Running Cost Calculator page fetch every truck's monthly
    average distance in one request instead of each rendered Advanced-mode
    truck card independently calling useTruckTripRuns — which fired a full,
    unfiltered GET /trips plus a GET /trips/{id}/sheet per trip, per card."""
    return _truck_run_monthly_avg_all(db)


@router.get("/run-stats-all")
def get_run_stats_all(db: Session = Depends(get_db)):
    """{truck_business_id: Truck Run Record stats} — see truck_run_stats_all."""
    return truck_run_stats_all(db)


@router.get("/run-stats/{truck_business_id}")
def get_run_stats(truck_business_id: str, db: Session = Depends(get_db)):
    """One truck's Truck Run Record stats (zeros when it has no counted trips)."""
    return truck_run_stats_all(db).get(truck_business_id) or {
        "total_distance": 0.0, "trips_with_distance": 0, "missing_sheets": 0, "first_trip_date": None,
        "days": 0, "months": 0.0, "monthly_avg": 0.0, "daily_avg": 0.0, "avg_per_trip": 0.0,
        "longest": 0.0, "shortest": 0.0,
    }


@router.get("/cost-per-km")
def get_cost_per_km(db: Session = Depends(get_db)):
    """Returns {mode: {truck_business_id: cost_per_km}} for every truck."""
    manual, _ = manual_cost_parts(db)
    return {
        "Manual": {bid: d["total"] for bid, d in manual.items()},
        "Basic": _compute_basic_advanced_cost_per_km(db, "Basic", include_removed=True),
        "Advanced": _compute_basic_advanced_cost_per_km(db, "Advanced", include_removed=True),
    }


def truck_cost_detail(db: Session, truck: models.Truck) -> dict:
    """Everything behind one truck's Cost/KM in each mode, for Profitability's
    Trip Breakdown: total, the five parts, and the diesel price + mileage the
    diesel part was worked out from. Totals match get_cost_per_km exactly."""
    from routers.maintenance import get_all_fuel_stats
    fuel_price = _fuel_base_price(db)
    auto_mileage = get_all_fuel_stats(db).get(str(truck.id))
    out: dict[str, dict] = {}

    for mode in ("Basic", "Advanced"):
        d = _compute_basic_advanced_cost_per_km(db, mode, with_parts=True, include_removed=True).get(truck.truck_id) or {}
        out[mode] = {
            "total": d.get("total"),
            "parts": {k: d.get(k) for k in COST_PARTS},
            "parts_known": True,
            "diesel_price": fuel_price or None,
            "mileage": round(auto_mileage, 4) if auto_mileage else None,
            "mileage_source": "Lifetime average from this truck's fuel logs (Maintenance → Fuel History)",
            "price_source": "Base diesel price in Maintenance → Fuel History",
        }

    manual_all, manual_live = manual_cost_parts(db)
    manual_row = manual_all.get(truck.truck_id) or {}
    metrics = db.query(models.RunningCostTruckMetrics).filter_by(mode="Manual", truck_id=truck.id).first()
    manual_price = fuel_price
    if manual_price <= 0:
        cfg = db.query(models.RunningCostConfig).filter_by(mode="Manual").first()
        manual_price = float(cfg.cost_per_litre) if cfg and cfg.cost_per_litre else 0.0
    manual_mileage = float(metrics.mileage) if metrics and metrics.mileage else None
    parts = {k: manual_row.get(k) for k in COST_PARTS}
    parts_known = manual_live or any(v is not None for v in parts.values())
    if parts["fuel"] is None and manual_price > 0 and manual_mileage:
        parts["fuel"] = round(manual_price / manual_mileage, 6)
    out["Manual"] = {
        "total": manual_row.get("total"),
        "parts": parts,
        # Always True once Manual is worked out on the server; before that,
        # False until the calculator's Manual tab is opened and saved again.
        "parts_known": parts_known,
        "diesel_price": manual_price or None,
        "mileage": manual_mileage,
        "mileage_source": "Mileage typed for this truck in Running Cost Calculator → Manual",
        "price_source": "Diesel price used by Running Cost Calculator → Manual",
    }
    return out


@router.get("/cost-breakdown-all")
def get_cost_breakdown_all(db: Session = Depends(get_db)):
    """{"Basic"|"Advanced": {truck_business_id: {total, emi, fuel, tyre,
    maintenance, compliance}}} for active trucks — the Running Cost
    Calculator shows exactly these (one formula, the same numbers
    Profitability uses) instead of working them out again in the browser."""
    return {
        mode: _compute_basic_advanced_cost_per_km(db, mode, with_parts=True)
        for mode in ("Basic", "Advanced")
    }


@router.get("/cost-parts-per-km")
def get_cost_parts_per_km(db: Session = Depends(get_db)):
    """{mode: {truck_business_id: {"fuel": ₹/km, "tyre": ₹/km}}} — the
    calculator's "Mileage" and "Tyre Charges" lines for every truck. Truck
    Profitability charges Diesel = km × fuel and Tyres = km × tyre. Manual uses
    the split the calculator saved (diesel falls back to price ÷ typed mileage)."""
    out: dict[str, dict] = {}
    for mode in ("Basic", "Advanced"):
        parts = _compute_basic_advanced_cost_per_km(db, mode, with_parts=True, include_removed=True)
        out[mode] = {tid: {"fuel": d.get("fuel"), "tyre": d.get("tyre")} for tid, d in parts.items()}
    manual_all, _ = manual_cost_parts(db)
    manual: dict[str, dict] = {bid: {"fuel": d.get("fuel"), "tyre": d.get("tyre")} for bid, d in manual_all.items()}
    for tid, fuel in get_mileage_cost_per_km(db)["Manual"].items():
        manual.setdefault(tid, {"fuel": None, "tyre": None})
        if manual[tid]["fuel"] is None:
            manual[tid]["fuel"] = fuel
    out["Manual"] = manual
    return out


@router.get("/cost-parts-all")
def get_cost_parts_all(db: Session = Depends(get_db)):
    """{mode: {truck_business_id: {total, fuel, emi, tyre, maintenance,
    compliance, parts_known}}} for every truck incl. sold/deleted — the
    per-km rates behind each Cost/KM, so Profitability's Excel can show
    Truck Expenses as EMI / Tyres / Maintenance / Documents (each km × its
    rate) instead of one lump. `total` is exactly get_cost_per_km's figure;
    the parts add up to it. `fuel` is the diesel ₹/km Profitability uses
    (get_mileage_cost_per_km). Manual parts can be unknown (parts_known False)
    until the calculator's Manual tab has been saved."""
    mileage = get_mileage_cost_per_km(db)
    out: dict[str, dict] = {}
    for mode in ("Basic", "Advanced"):
        parts = _compute_basic_advanced_cost_per_km(db, mode, with_parts=True, include_removed=True)
        out[mode] = {
            tid: {**{k: d.get(k) for k in ("total", *COST_PARTS)}, "fuel": mileage[mode].get(tid, d.get("fuel")),
                  "parts_known": True}
            for tid, d in parts.items()
        }
    manual_all, live = manual_cost_parts(db)
    out["Manual"] = {}
    for tid, d in manual_all.items():
        parts = {k: d.get(k) for k in COST_PARTS}
        out["Manual"][tid] = {
            "total": d.get("total"), **parts,
            "fuel": mileage["Manual"].get(tid, parts["fuel"]),
            "parts_known": live or any(v is not None for v in parts.values()),
        }
    return out


@router.get("/mileage-cost-per-km")
def get_mileage_cost_per_km(db: Session = Depends(get_db)):
    """Returns {mode: {truck_business_id: diesel cost per km}} — the "Mileage"
    line of each truck in the Running Cost Calculator (diesel price ÷ km/L).
    Used by Profitability's Gross Profit (Hire − Trip Expenses − trip km × this).
    Manual: the calculator's diesel price (Fuel History's, else the one typed)
    ÷ the mileage typed for the truck. Basic/Advanced: Fuel History's price ÷
    the truck's lifetime-average mileage — the same figure inside their Cost/KM."""
    trucks = db.query(models.Truck).all()  # incl. sold/deleted — Profitability shows their past trips
    business_id = {str(t.id): t.truck_id for t in trucks}

    auto = _auto_fuel_per_km_all(db)
    auto_by_business = {business_id[tid]: round(v, 6) for tid, v in auto.items() if tid in business_id}

    manual_price = _fuel_base_price(db)
    if manual_price <= 0:
        cfg = db.query(models.RunningCostConfig).filter_by(mode="Manual").first()
        manual_price = float(cfg.cost_per_litre) if cfg and cfg.cost_per_litre else 0.0
    manual: dict[str, float] = {}
    for bid, d in manual_cost_parts(db)[0].items():
        if d.get("fuel") is not None and d["fuel"] > 0:
            manual[bid] = round(d["fuel"], 6)
    if manual_price > 0:
        for m in db.query(models.RunningCostTruckMetrics).filter_by(mode="Manual").all():
            tid = str(m.truck_id)
            mileage = float(m.mileage or 0)
            if tid in business_id and mileage > 0:
                manual.setdefault(business_id[tid], round(manual_price / mileage, 6))

    return {"Manual": manual, "Basic": auto_by_business, "Advanced": dict(auto_by_business)}


@router.put("/cost-per-km", status_code=204)
def set_cost_per_km(payload: schemas.RccCostPerKmBulkIn, db: Session = Depends(get_db)):
    """Bulk-upserts one mode's full truck -> cost/km map in one request —
    called (debounced) by the Running Cost Calculator every time it
    recomputes any truck's total, so the value is live for every viewer
    regardless of browser/device."""
    if payload.mode not in CALC_MODES:
        raise HTTPException(400, "Invalid mode")
    for truck_business_id, cost in payload.values.items():
        row = (
            db.query(models.RunningCostTruckCostPerKm)
            .filter_by(mode=payload.mode, truck_business_id=truck_business_id)
            .first()
        )
        if not row:
            row = models.RunningCostTruckCostPerKm(mode=payload.mode, truck_business_id=truck_business_id)
            db.add(row)
        row.cost_per_km = cost
        parts = payload.parts.get(truck_business_id)
        if parts is not None:
            for key in COST_PARTS:
                setattr(row, f"{key}_per_km", parts.get(key))
    db.commit()


@router.get("/explain/{truck_business_id}")
def explain_cost_per_km(truck_business_id: str, mode: str = "Advanced", db: Session = Depends(get_db)):
    """One truck's Cost/KM in one mode, part by part, with the numbers and
    the pages behind each part — the calculator's "How is this calculated?"."""
    from routers.cost_explain import explain_truck
    if mode not in CALC_MODES:
        raise HTTPException(400, f"Unknown mode: {mode}")
    truck = db.query(models.Truck).filter(models.Truck.truck_id == truck_business_id).first()
    if truck is None:
        raise HTTPException(404, "Truck not found")
    return explain_truck(db, truck, mode)
