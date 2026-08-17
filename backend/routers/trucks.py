from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from duplicate_checks import check_truck_duplicates
from websocket_manager import emit
from security import get_current_user, TokenUser

# Compliance date fields → human-readable label
_COMPLIANCE_FIELDS: dict[str, str] = {
    "rc_validity_date":            "RC",
    "fc_expiry_date":              "FC (Fitness Certificate)",
    "road_tax_date":               "Road Tax",
    "national_permit_date":        "National Permit",
    "local_permit_date":           "Local Permit",
    "pollution_certificate_date":  "Pollution Certificate",
    "insurance_expiry_date":       "Insurance",
}

router = APIRouter(prefix="/trucks", tags=["Trucks"])


@router.get("", response_model=list[schemas.TruckOut])
def list_trucks(db: Session = Depends(get_db)):
    return db.query(models.Truck).order_by(models.Truck.truck_id).all()


@router.post("", response_model=schemas.TruckOut, status_code=201)
def create_truck(
    payload: schemas.TruckCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    check_truck_duplicates(db, payload)
    if db.query(models.Truck).filter(models.Truck.truck_id == payload.truck_id).first():
        raise HTTPException(400, f"Truck ID {payload.truck_id} already exists")
    if db.query(models.Truck).filter(models.Truck.registration_number == payload.registration_number).first():
        raise HTTPException(400, f"Registration number {payload.registration_number} already exists")
    truck = models.Truck(**payload.model_dump())
    db.add(truck)
    db.commit()
    db.refresh(truck)

    # Log initial compliance dates into history so CostBreakdownDialog can derive
    # real validity periods (expiry − this timestamp) instead of estimated periods.
    now = datetime.now(timezone.utc)
    for db_field, doc_label in _COMPLIANCE_FIELDS.items():
        if getattr(truck, db_field, None):
            db.add(models.ComplianceUpdateHistory(
                truck_id=truck.id,
                document_type=doc_label,
                updated_at=now,
                updated_by_name=current_user.name or "Unknown",
            ))
    db.commit()

    emit("truck_updated", {"id": truck.id})
    return truck


# ---------------------------------------------------------------------------
# Truck Run Configuration  (static routes MUST come before /{truck_id: int})
# ---------------------------------------------------------------------------

@router.get("/run-config", response_model=list[schemas.TruckRunConfigOut])
def get_run_config(db: Session = Depends(get_db)):
    return db.query(models.TruckRunConfig).order_by(models.TruckRunConfig.tyre_layout).all()


@router.put("/run-config", response_model=list[schemas.TruckRunConfigOut])
def save_run_config(payload: schemas.TruckRunConfigBulkSave, db: Session = Depends(get_db)):
    for item in payload.configs:
        existing = db.query(models.TruckRunConfig).filter(
            models.TruckRunConfig.tyre_layout == item.tyre_layout
        ).first()
        if existing:
            existing.km_per_month = item.km_per_month
            existing.km_per_day = item.km_per_day
        else:
            db.add(models.TruckRunConfig(
                tyre_layout=item.tyre_layout,
                km_per_month=item.km_per_month,
                km_per_day=item.km_per_day,
            ))
    db.commit()
    emit("truck_updated", {})
    return db.query(models.TruckRunConfig).order_by(models.TruckRunConfig.tyre_layout).all()


# ---------------------------------------------------------------------------
# Tyre Layout Cost Configuration  (static — must stay before /{truck_id})
# ---------------------------------------------------------------------------

@router.get("/base-tyre-cost", response_model=list[schemas.TyreLayoutCostOut])
def get_base_tyre_cost(db: Session = Depends(get_db)):
    return db.query(models.TyreLayoutCostConfig).order_by(models.TyreLayoutCostConfig.tyre_layout).all()


@router.put("/base-tyre-cost", response_model=list[schemas.TyreLayoutCostOut])
def save_base_tyre_cost(payload: schemas.TyreLayoutCostBulkSave, db: Session = Depends(get_db)):
    for item in payload.configs:
        existing = db.query(models.TyreLayoutCostConfig).filter(
            models.TyreLayoutCostConfig.tyre_layout == item.tyre_layout
        ).first()
        if existing:
            existing.cost = item.cost
        else:
            db.add(models.TyreLayoutCostConfig(tyre_layout=item.tyre_layout, cost=item.cost))
    db.commit()
    return db.query(models.TyreLayoutCostConfig).order_by(models.TyreLayoutCostConfig.tyre_layout).all()


# ---------------------------------------------------------------------------
# Advanced Running Cost — compliance cost per km for all trucks
# ---------------------------------------------------------------------------

@router.get("/compliance-per-km/all", tags=["Trucks"])
def get_compliance_per_km_all(db: Session = Depends(get_db)):
    """
    Per-truck compliance cost/km for Advanced mode in the Running Cost Calculator.
    Mirrors Cost Breakdown dialog 'Per KM': totalPerDay / kmPerDay
    where totalPerDay = sum of (expense / validityDays) per document,
    and validityDays = days between the most-recent history entry and the expiry date.
    Returns { "<truck_db_id>": per_km_float, ... } — only trucks with data and km/day set.
    """
    from datetime import date as _date, datetime

    trucks = db.query(models.Truck).all()
    if not trucks:
        return {}

    # All compliance history, most-recent entry per (truck_id, document_type).
    # Store only the DATE portion — mirrors the frontend daysBetween() which strips
    # the time component with setHours(0,0,0,0) before computing the difference.
    all_history = db.query(models.ComplianceUpdateHistory).all()
    history_map: dict[int, dict[str, _date]] = {}
    for row in all_history:
        issued_date = row.updated_at.date() if isinstance(row.updated_at, datetime) else row.updated_at
        prev = history_map.setdefault(row.truck_id, {}).get(row.document_type)
        if prev is None or issued_date > prev:
            history_map[row.truck_id][row.document_type] = issued_date

    # km_per_day per tyre layout
    run_configs = db.query(models.TruckRunConfig).all()
    kpd_map: dict[str, float] = {
        rc.tyre_layout: float(rc.km_per_day or 0) for rc in run_configs
    }

    # (expense_field, expiry_date_field, history_doc_type)
    DOCS = [
        ("rc_expenses",                   "rc_validity_date",           "RC"),
        ("fc_expenses",                   "fc_expiry_date",             "FC (Fitness Certificate)"),
        ("road_tax_expenses",             "road_tax_date",              "Road Tax"),
        ("national_permit_expenses",      "national_permit_date",       "National Permit"),
        ("local_permit_expenses",         "local_permit_date",          "Local Permit"),
        ("pollution_certificate_expenses","pollution_certificate_date", "Pollution Certificate"),
        ("insurance_expenses",            "insurance_expiry_date",      "Insurance"),
    ]

    result: dict[str, float] = {}
    for truck in trucks:
        kpd = kpd_map.get(truck.tyre_layout or "", 0)
        if kpd <= 0:
            continue
        truck_history = history_map.get(truck.id, {})
        total_per_day = 0.0
        for exp_field, date_field, doc_type in DOCS:
            expense = float(getattr(truck, exp_field) or 0)
            expiry  = getattr(truck, date_field)
            if expense <= 0 or not expiry:
                continue
            issued_date = truck_history.get(doc_type)
            if not issued_date:
                continue
            # Both sides are pure dates — matches frontend daysBetween() exactly
            validity_days = (expiry - issued_date).days
            if validity_days <= 0:
                continue
            total_per_day += expense / validity_days
        if total_per_day <= 0:
            continue
        per_km = total_per_day / kpd
        if per_km > 0:
            result[str(truck.id)] = per_km
    return result


# ---------------------------------------------------------------------------
# Per-truck CRUD  (parameterized routes after all static routes)
# ---------------------------------------------------------------------------

@router.get("/{truck_id}", response_model=schemas.TruckOut)
def get_truck(truck_id: int, db: Session = Depends(get_db)):
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    return truck


@router.get("/{truck_id}/compliance-history", response_model=list[schemas.ComplianceUpdateHistoryOut])
def get_compliance_history(truck_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.ComplianceUpdateHistory)
        .filter(models.ComplianceUpdateHistory.truck_id == truck_id)
        .order_by(models.ComplianceUpdateHistory.updated_at.desc())
        .all()
    )


@router.put("/{truck_id}", response_model=schemas.TruckOut)
def update_truck(
    truck_id: int,
    payload: schemas.TruckUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    check_truck_duplicates(db, payload, exclude_id=truck_id)
    truck = db.query(models.Truck).with_for_update().filter(models.Truck.id == truck_id).first()
    if not truck:
        raise HTTPException(404, "Truck not found")
    if payload.client_version is not None and truck.version != payload.client_version:
        raise HTTPException(
            409,
            "This truck was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )

    # Snapshot compliance dates before applying changes
    payload_dict = payload.model_dump(exclude_unset=True, exclude={"client_version"})
    old_dates = {f: str(getattr(truck, f) or "") for f in _COMPLIANCE_FIELDS}

    for field, value in payload_dict.items():
        setattr(truck, field, value)
    truck.version = (truck.version or 1) + 1

    # Log each compliance date that actually changed
    now = datetime.now(timezone.utc)
    for db_field, doc_label in _COMPLIANCE_FIELDS.items():
        if db_field in payload_dict:
            new_val = str(payload_dict[db_field] or "")
            if new_val != old_dates[db_field]:
                db.add(models.ComplianceUpdateHistory(
                    truck_id=truck.id,
                    document_type=doc_label,
                    updated_at=now,
                    updated_by_name=current_user.name or "Unknown",
                ))

    db.commit()
    db.refresh(truck)
    emit("truck_updated", {"id": truck.id})
    return truck


@router.delete("/{truck_id}", status_code=204)
def delete_truck(truck_id: int, db: Session = Depends(get_db)):
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    db.delete(truck)
    db.commit()
    emit("truck_updated", {})
