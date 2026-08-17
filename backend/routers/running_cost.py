from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, Depends
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
