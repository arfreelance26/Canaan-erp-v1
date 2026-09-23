from datetime import date as _date
from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
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
    adblue_rows = db.query(models.RunningCostAdblueEntry).filter_by(mode=mode).all()
    truck_rows  = db.query(models.RunningCostTruckMetrics).filter_by(mode=mode).all()
    return {
        "cost_per_litre": _fmt(config.cost_per_litre) if config else "",
        "tyre_entries": {
            r.tyre_type: {"cost": _fmt(r.cost_per_tyre), "range": _fmt(r.expected_range_km)}
            for r in tyre_rows
        },
        "run_entries": {
            r.tyre_layout: {"month": _fmt(r.km_per_month), "day": _fmt(r.km_per_day)}
            for r in layout_rows
        },
        "adblue_prices": {
            str(r.manufacturer_id): _fmt(r.price_per_litre)
            for r in adblue_rows
        },
        "truck_metrics": {
            str(r.truck_id): {
                "emi_amount":              _fmt(r.emi_amount),
                "emi_per_day":             _fmt(r.emi_per_day),
                "emi_per_km":              _fmt(r.emi_per_km),
                "mileage":                 _fmt(r.mileage),
                "adblue_consume_l_per_km": _fmt(r.adblue_consume_l_per_km),
                "adblue_manufacturer_id":    str(r.adblue_manufacturer_id) if r.adblue_manufacturer_id else "",
                "adblue_per_km":             _fmt(r.adblue_per_km),
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

    # AdBlue entries
    for mid_str, price_str in data.adblue_prices.items():
        try:
            mid = int(mid_str)
        except (ValueError, TypeError):
            continue
        row = db.query(models.RunningCostAdblueEntry).filter_by(mode=mode, manufacturer_id=mid).first()
        if row:
            row.price_per_litre = _to_decimal(price_str)
        else:
            db.add(models.RunningCostAdblueEntry(
                mode=mode, manufacturer_id=mid,
                price_per_litre=_to_decimal(price_str),
            ))

    # Truck metrics
    for tid_str, m in data.truck_metrics.items():
        try:
            tid = int(tid_str)
        except (ValueError, TypeError):
            continue
        adblue_mid = _to_int(m.adblue_manufacturer_id) if m.adblue_manufacturer_id else None
        row = db.query(models.RunningCostTruckMetrics).filter_by(mode=mode, truck_id=tid).first()
        if row is None and not db.query(models.Truck).filter_by(id=tid).first():
            continue  # truck deleted; skip to avoid FK violation
        if row:
            row.emi_amount  = _to_decimal(m.emi_amount)
            row.emi_per_day = _to_decimal(m.emi_per_day)
            row.emi_per_km  = _to_decimal(m.emi_per_km)
            row.mileage = _to_decimal(m.mileage)
            row.adblue_consume_l_per_km = _to_decimal(m.adblue_consume_l_per_km)
            row.adblue_manufacturer_id = adblue_mid
            row.adblue_per_km = _to_decimal(m.adblue_per_km)
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
                adblue_consume_l_per_km=_to_decimal(m.adblue_consume_l_per_km),
                adblue_manufacturer_id=adblue_mid,
                adblue_per_km=_to_decimal(m.adblue_per_km),
                tyre_type=m.tyre_type or None,
                tyre_per_km=_to_decimal(m.tyre_per_km),
                maintenance_per_km=_to_decimal(m.maintenance_per_km),
                compliance_cost_per_year=_to_decimal(m.compliance_cost_per_year),
            ))


# ---------------------------------------------------------------------------
# GET /running-cost/state  — returns all three modes' data in one response
# ---------------------------------------------------------------------------

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

def _truck_run_monthly_avg(db: Session, truck_business_id: str) -> float:
    """Mirrors useTruckTripRuns + computeTruckRunStats: monthly average km
    actually driven, from every trip's trip-sheet total_km for this truck."""
    rows = (
        db.query(models.Trip.assigned_date, models.TripSheet.total_km)
        .join(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
        .filter(models.Trip.vehicle_id == truck_business_id)
        .all()
    )
    if not rows:
        return 0.0
    total_distance = sum(float(km) for _, km in rows if km and float(km) > 0)
    dates = [d for d, _ in rows if d]
    if dates:
        earliest = min(dates)
        today = _date.today()
        months = max(1, (today.year - earliest.year) * 12 + (today.month - earliest.month) + 1)
    else:
        months = 1
    return total_distance / months if months > 0 else 0.0


def _truck_run_monthly_avg_all(db: Session) -> dict[str, float]:
    """Batched version of _truck_run_monthly_avg — one query for every truck's
    trip+sheet rows instead of one query per truck. Used by both the fleet-wide
    Advanced-mode cost-per-km computation and the /monthly-avg-km-all endpoint
    (which replaced the Running Cost Calculator page's old per-truck-card
    useTruckTripRuns fetch — that fired a full, unfiltered tripsApi.list() call
    plus a getSheet() call per trip for every rendered truck card)."""
    rows = (
        db.query(models.Trip.vehicle_id, models.Trip.assigned_date, models.TripSheet.total_km)
        .join(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
        .all()
    )
    by_truck: dict[str, list] = {}
    for vehicle_id, assigned_date, total_km in rows:
        if not vehicle_id:
            continue
        by_truck.setdefault(vehicle_id, []).append((assigned_date, total_km))

    today = _date.today()
    result: dict[str, float] = {}
    for vehicle_id, truck_rows in by_truck.items():
        total_distance = sum(float(km) for _, km in truck_rows if km and float(km) > 0)
        dates = [d for d, _ in truck_rows if d]
        if dates:
            earliest = min(dates)
            months = max(1, (today.year - earliest.year) * 12 + (today.month - earliest.month) + 1)
        else:
            months = 1
        result[vehicle_id] = total_distance / months if months > 0 else 0.0
    return result


def _compute_basic_advanced_cost_per_km(db: Session, mode: str) -> dict[str, float | None]:
    from routers.maintenance import get_all_fuel_stats, get_all_adblue_consumption, get_maintenance_cost_per_km_all
    from routers.trucks import get_compliance_per_km_all

    trucks = db.query(models.Truck).filter(models.Truck.deleted_at.is_(None)).all()
    if not trucks:
        return {}

    mileage_map      = get_all_fuel_stats(db)
    adblue_map        = get_all_adblue_consumption(db)
    maint_map          = get_maintenance_cost_per_km_all(db)
    compliance_map      = get_compliance_per_km_all(db)
    monthly_avg_map     = _truck_run_monthly_avg_all(db) if mode == "Advanced" else {}

    manufacturer_price = {
        m.name.strip().lower(): float(m.default_price_per_litre or 0)
        for m in db.query(models.AdBlueManufacturer).all()
    }

    fuel_cfg = db.query(models.FuelBaseConfig).first()
    cost_per_litre = float(fuel_cfg.cost_per_litre) if fuel_cfg and fuel_cfg.cost_per_litre else 0.0

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
        e["per_day"] += float(rec.daily_finance_cost or 0)

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
        mileage = mileage_map.get(tid)
        fuel_per_km = (cost_per_litre / mileage) if mileage and mileage > 0 and cost_per_litre > 0 else None

        adblue_l_per_km = adblue_map.get(tid) or 0.0
        mfr_price = manufacturer_price.get((truck.manufacturer or "").strip().lower(), 0.0)
        adblue_per_km = (adblue_l_per_km * mfr_price) if adblue_l_per_km > 0 and mfr_price > 0 else None

        reg = (truck.registration_number or "").strip().upper()
        emi = emi_by_reg.get(reg)
        # Basic allows an amount÷26 fallback when daily_finance_cost isn't stored
        # (matches this page's own Basic-mode UI text: "fetched (or auto: EMI
        # Amount ÷ 26 if not stored)"). Advanced is strictly fetched — no
        # fallback — matching its own UI promise ("no arithmetic substitution...
        # shows NIL"). Sharing one emi_per_day between both modes previously
        # made Advanced silently include a fabricated number here that the
        # calculator's own Advanced tab correctly shows as NIL.
        emi_per_day_basic = None
        emi_per_day_advanced = None
        if emi:
            emi_per_day_advanced = emi["per_day"] if emi["per_day"] > 0 else None
            emi_per_day_basic = emi["per_day"] if emi["per_day"] > 0 else (emi["amount"] / 26 if emi["amount"] > 0 else None)

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
            emi_per_km = (emi_per_day_advanced / monthly_avg) if emi_per_day_advanced and monthly_avg > 0 else None
            tyre_per_km = advanced_tyre_by_truck.get(truck.id)
            maintenance_per_km = (maint_basic / monthly_avg) if maint_basic and monthly_avg > 0 else None
            compliance_per_km = (compliance_basic / monthly_avg) if compliance_basic and monthly_avg > 0 else None

        components = [emi_per_km, fuel_per_km, adblue_per_km, tyre_per_km, maintenance_per_km, compliance_per_km]
        result[truck.truck_id] = (
            round(sum(c or 0 for c in components), 6) if any(c is not None for c in components) else None
        )

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


@router.get("/cost-per-km")
def get_cost_per_km(db: Session = Depends(get_db)):
    """Returns {mode: {truck_business_id: cost_per_km}} for every truck."""
    manual_rows = db.query(models.RunningCostTruckCostPerKm).filter_by(mode="Manual").all()
    return {
        "Manual": {
            r.truck_business_id: (float(r.cost_per_km) if r.cost_per_km is not None else None)
            for r in manual_rows
        },
        "Basic": _compute_basic_advanced_cost_per_km(db, "Basic"),
        "Advanced": _compute_basic_advanced_cost_per_km(db, "Advanced"),
    }


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
        if row:
            row.cost_per_km = cost
        else:
            db.add(models.RunningCostTruckCostPerKm(
                mode=payload.mode, truck_business_id=truck_business_id, cost_per_km=cost,
            ))
    db.commit()
