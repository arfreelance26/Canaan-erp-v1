import re
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
import maintenance_reminders
import odometer
from duplicate_checks import check_truck_duplicates
from websocket_manager import emit
from security import get_current_user, TokenUser, require_roles
from routers.deletion_approvals import auto_reject_stale_requests
from routers.compliance_records import COMPLIANCE_TRUCK_FIELDS, seed_first_entries

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
    return db.query(models.Truck).filter(models.Truck.deleted_at.is_(None)).order_by(models.Truck.truck_id).all()


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
    # A new truck's current odometer starts at its purchase reading — not 0
    # until its first trip sheet.
    if not truck.odometer and truck.odometer_during_purchase:
        truck.odometer = int(truck.odometer_during_purchase)
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
    # Each document the truck arrives with becomes its first Compliance History entry.
    seed_first_entries(db, truck, current_user.name or "Unknown")
    db.add(models.TruckEditEvent(
        truck_id=truck.id, event="Truck Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()

    emit("truck_updated", {"id": truck.id})
    return truck


# ---------------------------------------------------------------------------
# Static routes MUST come before /{truck_id: int}
# ---------------------------------------------------------------------------

@router.get("/next-id")
def get_next_truck_id(db: Session = Depends(get_db)):
    """Suggests the next CGI-T### truck ID. Computed over ALL trucks, including
    soft-deleted/archived ones — the same universe create_truck's uniqueness
    check uses — so this never suggests an ID that's still reserved by an
    archived-but-not-yet-resolved truck (would otherwise 400 on submit)."""
    ids = db.query(models.Truck.truck_id).all()
    max_number = 0
    for (truck_id,) in ids:
        match = re.search(r"(\d+)$", truck_id or "")
        if match:
            max_number = max(max_number, int(match.group(1)))
    return {"truck_id": f"CGI-T{max_number + 1:03d}"}


# ---------------------------------------------------------------------------
# Truck Run Configuration
# ---------------------------------------------------------------------------

@router.get("/run-config", response_model=list[schemas.TruckRunConfigOut])
def get_run_config(db: Session = Depends(get_db)):
    return db.query(models.TruckRunConfig).order_by(models.TruckRunConfig.tyre_layout).all()


@router.get("/run-config/edit-events", response_model=list[schemas.TruckRunConfigEditEventListOut])
def list_run_config_edit_events(db: Session = Depends(get_db)):
    """Every "Save Configuration" click on Truck Run Configuration ever
    logged — the page-wide "Edit History" log. Most recent first.
    Registered before GET /{truck_id}-shaped routes so "run-config/edit-events"
    isn't swallowed as a truck_id path param."""
    return (
        db.query(models.TruckRunConfigEditEvent)
        .order_by(models.TruckRunConfigEditEvent.created_at.desc(), models.TruckRunConfigEditEvent.id.desc())
        .all()
    )


@router.put("/run-config", response_model=list[schemas.TruckRunConfigOut])
def save_run_config(payload: schemas.TruckRunConfigBulkSave, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if current_user.role != "Admin":
        raise HTTPException(403, "Only Admins can modify Truck Run Configuration.")
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
    db.add(models.TruckRunConfigEditEvent(
        event="Run Configuration Saved", actor_name=current_user.name, actor_role=current_user.role,
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

def _compliance_per_day_all(db: Session) -> dict[int, float]:
    """Per-truck total compliance cost per WORKING day — mirrors the Cost
    Breakdown dialog's "Per Day" total: Σ (expense ÷ validity days) per
    document, restated per working day (× 30.44 ÷ 26) like every other per-day
    cost in the app. Validity days = most-recent history entry → expiry date.
    {truck.id: ₹/working day}."""
    from cost_units import per_working_day_from_calendar

    result: dict[int, float] = {}
    for truck_id, docs in compliance_docs_all(db).items():
        total_per_day = sum(d["per_calendar_day"] for d in docs if d["per_calendar_day"])
        if total_per_day > 0:
            result[truck_id] = per_working_day_from_calendar(total_per_day)
    return result


# (expense_field, expiry_date_field, history_doc_type)
COMPLIANCE_COST_DOCS = [
    ("rc_expenses",                   "rc_validity_date",           "RC"),
    ("fc_expenses",                   "fc_expiry_date",             "FC (Fitness Certificate)"),
    ("road_tax_expenses",             "road_tax_date",              "Road Tax"),
    ("national_permit_expenses",      "national_permit_date",       "National Permit"),
    ("local_permit_expenses",         "local_permit_date",          "Local Permit"),
    ("pollution_certificate_expenses","pollution_certificate_date", "Pollution Certificate"),
    ("insurance_expenses",            "insurance_expiry_date",      "Insurance"),
]


def compliance_docs_all(db: Session) -> dict[int, list[dict]]:
    """Every truck's 7 documents with what each costs per calendar day
    (expense ÷ validity days; None when it can't be worked out, with why) —
    behind _compliance_per_day_all and the calculator's "How is this
    calculated?" window. Validity days = the document's most recent
    set/renewed date (ComplianceUpdateHistory) → its expiry date."""
    from datetime import date as _date, datetime

    # All compliance history, most-recent entry per (truck_id, document_type).
    # Store only the DATE portion — mirrors the frontend daysBetween() which strips
    # the time component with setHours(0,0,0,0) before computing the difference.
    history_map: dict[int, dict[str, _date]] = {}
    for row in db.query(models.ComplianceUpdateHistory).filter(models.ComplianceUpdateHistory.action.is_(None)):
        issued_date = row.updated_at.date() if isinstance(row.updated_at, datetime) else row.updated_at
        prev = history_map.setdefault(row.truck_id, {}).get(row.document_type)
        if prev is None or issued_date > prev:
            history_map[row.truck_id][row.document_type] = issued_date
    # A "Valid from" typed in on the current version beats the day it was
    # entered — same start-date rule as the P&L (see compliance_cost.py).
    from compliance_cost import HISTORY_LABEL
    latest_ids = (
        db.query(func.max(models.TruckComplianceRecord.id))
        .group_by(models.TruckComplianceRecord.truck_id, models.TruckComplianceRecord.doc_type)
    )
    for tid, doc, valid_from in db.query(
        models.TruckComplianceRecord.truck_id, models.TruckComplianceRecord.doc_type, models.TruckComplianceRecord.valid_from,
    ).filter(models.TruckComplianceRecord.id.in_(latest_ids), models.TruckComplianceRecord.valid_from.isnot(None)):
        if doc in HISTORY_LABEL:
            history_map.setdefault(tid, {})[HISTORY_LABEL[doc]] = valid_from
    docs_spec = COMPLIANCE_COST_DOCS
    out: dict[int, list[dict]] = {}
    for truck in db.query(models.Truck).all():
        truck_history = history_map.get(truck.id, {})
        rows = []
        for exp_field, date_field, doc_type in docs_spec:
            expense = float(getattr(truck, exp_field) or 0)
            expiry  = getattr(truck, date_field)
            issued_date = truck_history.get(doc_type)
            row = {"label": doc_type, "expense": expense, "issued": issued_date, "expiry": expiry,
                   "validity_days": None, "per_calendar_day": None, "skipped": None}
            if expense <= 0:
                row["skipped"] = "no cost entered"
            elif not expiry:
                row["skipped"] = "no expiry date"
            elif not issued_date:
                row["skipped"] = "no date it was last set or renewed"
            else:
                # Both sides are pure dates — matches frontend daysBetween() exactly
                validity_days = (expiry - issued_date).days
                if validity_days <= 0:
                    row["skipped"] = "expiry is not after the date it was set"
                else:
                    row["validity_days"] = validity_days
                    row["per_calendar_day"] = expense / validity_days
            rows.append(row)
        out[truck.id] = rows
    return out


@router.get("/compliance-per-km/all", tags=["Trucks"])
def get_compliance_per_km_all(db: Session = Depends(get_db)):
    """
    Per-truck compliance Cost/km (Basic): Cost Breakdown dialog 'Per KM' =
    total Per Day ÷ km/day for the truck's tyre layout.
    Returns { "<truck_db_id>": per_km_float, ... } — only trucks with data and km/day set.
    """
    kpd_map: dict[str, float] = {
        rc.tyre_layout: float(rc.km_per_day or 0) for rc in db.query(models.TruckRunConfig).all()
    }
    layout_by_id = {t.id: t.tyre_layout for t in db.query(models.Truck.id, models.Truck.tyre_layout)}
    result: dict[str, float] = {}
    for truck_id, per_day in _compliance_per_day_all(db).items():
        kpd = kpd_map.get(layout_by_id.get(truck_id) or "", 0)
        if kpd > 0:
            result[str(truck_id)] = per_day / kpd
    return result


@router.get("/compliance-per-day/all", tags=["Trucks"])
def get_compliance_per_day_all(db: Session = Depends(get_db)):
    """
    Per-truck total daily compliance cost (Cost Breakdown dialog 'Per Day'
    total). Cost/km (Advanced) = this ÷ the truck's Monthly Distance Average.
    Returns { "<truck_db_id>": per_day_float, ... } — only trucks with data.
    """
    return {str(k): v for k, v in _compliance_per_day_all(db).items()}


# ---------------------------------------------------------------------------
# Fleet Cost/Km ranking — "which truck would be most profitable" suggestion
# ---------------------------------------------------------------------------

@router.get("/cost-per-km-ranking", tags=["Trucks"])
def get_cost_per_km_ranking(db: Session = Depends(get_db)):
    """
    Ranks trucks by "Cost/Km (Efficiency)" — fuel/mileage + tyre +
    maintenance per km (AdBlue isn't counted — Truck's Adblue History is a record only) — cheapest first. Powers the "recommended truck"
    suggestion in the Assign Trip dialog's customer insights panel.

    Deliberately EXCLUDES EMI and compliance from the ranking metric: those
    are financing/legal-admin costs tied to how the truck was bought and
    registered, not to how efficiently it actually runs (fuel economy, tyre
    wear, service frequency). Including them would rank a truck as "cheap"
    or "expensive" for reasons that have nothing to do with its operating
    efficiency. Both are still computed and returned in `breakdown` (and
    folded into `total_cost_per_km`) for reference.

    A truck is only included once fuel, maintenance AND tyre cost/km are all
    available — those being absent means missing config, not a genuine zero,
    and defaulting them to 0 would wrongly rank an under-configured truck as
    "efficient". EMI and compliance legitimately can be zero (no
    active loan / no compliance history yet), so those
    default to 0 and never block inclusion.
    """
    from routers.maintenance import get_maintenance_cost_per_km_all, get_all_fuel_stats

    trucks = db.query(models.Truck).filter(models.Truck.deleted_at.is_(None)).all()
    if not trucks:
        return []

    maintenance_map = get_maintenance_cost_per_km_all(db)
    compliance_map = get_compliance_per_km_all(db)

    fuel_cfg = db.query(models.FuelBaseConfig).first()
    cost_per_litre = float(fuel_cfg.cost_per_litre) if fuel_cfg and fuel_cfg.cost_per_litre else 0.0
    # Same "Lifetime Average" mileage (km/L) source used everywhere else in
    # the app (Running Cost Calculator, TruckStatusDialog, etc.) — IQR-filtered.
    mileage_map = get_all_fuel_stats(db)

    tyre_layout_costs = {
        c.tyre_layout: float(c.cost or 0)
        for c in db.query(models.TyreLayoutCostConfig).all()
        if c.cost and float(c.cost) > 0
    }

    emi_totals: dict[str, float] = {}
    for rec in db.query(models.EmiRecord).all():
        if not rec.truck_registration:
            continue
        # Rough completed-loan exclusion: an EMI with an end date already
        # passed no longer represents an ongoing per-km finance cost.
        if rec.emi_end_date and rec.emi_end_date < datetime.now(timezone.utc).date():
            continue
        reg = rec.truck_registration.strip().upper()
        emi_totals[reg] = emi_totals.get(reg, 0.0) + float(rec.emi_cost_per_km or 0)

    results = []
    for truck in trucks:
        maint_per_km = maintenance_map.get(str(truck.id))
        tyre_per_km = tyre_layout_costs.get(truck.tyre_layout or "")
        mileage = mileage_map.get(str(truck.id))
        # The three operating-efficiency components must be present — see docstring.
        if not maint_per_km or not tyre_per_km or not mileage or cost_per_litre <= 0:
            continue
        fuel_per_km = cost_per_litre / mileage

        compliance_km = compliance_map.get(str(truck.id), 0.0)
        emi_per_km = emi_totals.get(truck.registration_number.strip().upper(), 0.0)

        efficiency = fuel_per_km + tyre_per_km + maint_per_km
        total = efficiency + compliance_km + emi_per_km
        results.append({
            "truck_db_id": str(truck.id),
            "truck_id": truck.truck_id,
            "registration_number": truck.registration_number,
            "manufacturer": truck.manufacturer,
            "efficiency_cost_per_km": round(efficiency, 4),
            "total_cost_per_km": round(total, 4),
            "breakdown": {
                "fuel_per_km": round(fuel_per_km, 4),
                "tyre_per_km": round(tyre_per_km, 4),
                "maintenance_per_km": round(maint_per_km, 4),
                "compliance_per_km": round(compliance_km, 4),
                "emi_per_km": round(emi_per_km, 4),
            },
        })

    results.sort(key=lambda r: r["efficiency_cost_per_km"])
    return results


@router.get("/sold", response_model=list[schemas.TruckOut])
def list_sold_trucks(db: Session = Depends(get_db)):
    """Our Fleet → Sold Trucks: every truck removed with "Sell Truck", most
    recent sale first. Registered before GET /{truck_id}."""
    return (
        db.query(models.Truck)
        .filter(models.Truck.deleted_at.isnot(None), models.Truck.disposal_type == "Sold")
        .order_by(models.Truck.sold_date.desc(), models.Truck.id.desc())
        .all()
    )


@router.get("/removed", response_model=list[schemas.TruckOut])
def list_removed_trucks(db: Session = Depends(get_db)):
    """Every truck no longer in the fleet — sold or deleted (disposal_type
    tells which) — for Auditor Pages → Vehicle Record, so their past trips can
    still be audited. Registered before GET /{truck_id}."""
    return (
        db.query(models.Truck)
        .filter(models.Truck.deleted_at.isnot(None))
        .order_by(models.Truck.truck_id)
        .all()
    )


@router.get("/deleted-ids", dependencies=[Depends(require_roles())])
def list_deleted_truck_ids(db: Session = Depends(get_db)):
    """Admin only: ids of trucks currently soft-deleted. Lets the "Archive" page
    (which lists from the deletion_approval_requests audit trail) tell apart a
    still-deleted truck from one that was since restored, same pattern as
    trips.py's list_deleted_trip_ids. Registered before GET /{truck_id} so
    "deleted-ids" isn't swallowed as a truck_id path param."""
    # Sold trucks live under Our Fleet → Sold Trucks, not in the Archive.
    rows = db.query(models.Truck.id).filter(
        models.Truck.deleted_at.isnot(None),
        or_(models.Truck.disposal_type.is_(None), models.Truck.disposal_type != "Sold"),
    ).all()
    return [i for (i,) in rows]


@router.get("/edit-events", response_model=list[schemas.TruckEditEventListOut])
def list_all_truck_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete/Restore event ever logged, across every
    truck — the page-wide "Edit History" log on Our Fleet, so
    who-changed-what is searchable in one place instead of opening each
    truck individually. Most recent first. Registered before GET
    /{truck_id} so "edit-events" isn't swallowed as a truck_id path param.
    """
    events = (
        db.query(models.TruckEditEvent)
        .order_by(models.TruckEditEvent.created_at.desc(), models.TruckEditEvent.id.desc())
        .all()
    )
    if not events:
        return []
    truck_ids = {e.truck_id for e in events}
    trucks_by_id = {t.id: t for t in db.query(models.Truck).filter(models.Truck.id.in_(truck_ids)).all()}

    result = []
    for e in events:
        truck = trucks_by_id.get(e.truck_id)
        result.append({
            "id": e.id,
            "truck_id": e.truck_id,
            "truck_id_str": truck.truck_id if truck else "—",
            "registration_number": truck.registration_number if truck else "(deleted)",
            "event": e.event,
            "actor_name": e.actor_name,
            "actor_role": e.actor_role,
            "created_at": e.created_at,
        })
    return result


@router.get("/compliance-history/all", response_model=list[schemas.ComplianceEditEventOut], tags=["Trucks"])
def list_all_compliance_history(db: Session = Depends(get_db)):
    """Every compliance document update ever logged, across every truck —
    the page-wide "Edit History" log on Compliance & Renewals, derived
    directly from ComplianceUpdateHistory (already populated by Truck
    create/update). Most recent first."""
    events = (
        db.query(models.ComplianceUpdateHistory)
        .order_by(models.ComplianceUpdateHistory.updated_at.desc(), models.ComplianceUpdateHistory.id.desc())
        .all()
    )
    if not events:
        return []
    truck_ids = {e.truck_id for e in events}
    trucks_by_id = {t.id: t for t in db.query(models.Truck).filter(models.Truck.id.in_(truck_ids)).all()}

    result = []
    for e in events:
        truck = trucks_by_id.get(e.truck_id)
        result.append({
            "id": e.id,
            "truck_id": e.truck_id,
            "truck_id_str": truck.truck_id if truck else "—",
            "registration_number": truck.registration_number if truck else "(deleted)",
            "document_type": e.document_type,
            "actor_name": e.updated_by_name,
            "created_at": e.updated_at,
            "action": e.action,
            "note": e.note,
        })
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
        .filter(models.ComplianceUpdateHistory.truck_id == truck_id,
                models.ComplianceUpdateHistory.action.is_(None))  # set / renewed only — the cost anchor
        .order_by(models.ComplianceUpdateHistory.updated_at.desc())
        .all()
    )


@router.get("/{truck_id}/odometer", response_model=schemas.OdometerInfoOut)
def get_odometer_info(truck_id: int, db: Session = Depends(get_db)):
    """Current odometer, the highest readings recorded elsewhere, and the
    correction history — for the Correct Odometer window."""
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    corrections = (
        db.query(models.TruckOdometerCorrection)
        .filter(models.TruckOdometerCorrection.truck_id == truck_id)
        .order_by(models.TruckOdometerCorrection.created_at.desc())
        .all()
    )
    return {"odometer": int(truck.odometer or 0), **odometer.readings(db, truck), "corrections": corrections}


@router.post("/{truck_id}/odometer-correction", response_model=schemas.TruckOut, dependencies=[Depends(require_roles())])
def correct_odometer(
    truck_id: int,
    payload: schemas.OdometerCorrectionIn,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin sets the truck's current odometer — up or down — with a reason.
    The only way it goes down (e.g. undoing a typo'd trip sheet End KM)."""
    truck = db.query(models.Truck).with_for_update().filter(models.Truck.id == truck_id).first()
    if not truck:
        raise HTTPException(404, "Truck not found")
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(400, "Please give a reason for this correction.")
    old = int(truck.odometer or 0)
    if payload.odometer == old:
        raise HTTPException(400, f"The odometer is already {old:,} km.")
    truck.odometer = payload.odometer
    truck.version = (truck.version or 1) + 1
    db.add(models.TruckOdometerCorrection(
        truck_id=truck.id, old_odometer=old, new_odometer=payload.odometer, reason=reason,
        actor_name=current_user.name or "Unknown", actor_role=current_user.role,
    ))
    if payload.odometer > old:
        maintenance_reminders.check_truck(db, truck)
    db.commit()
    db.refresh(truck)
    emit("truck_updated", {"id": truck.id})
    return truck


@router.get("/{truck_id}/branch-history", response_model=list[schemas.TruckBranchHistoryOut])
def get_branch_history(truck_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.TruckBranchHistory)
        .filter(models.TruckBranchHistory.truck_id == truck_id)
        .order_by(models.TruckBranchHistory.changed_at.desc())
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

    # Snapshot compliance dates + branch before applying changes
    payload_dict = payload.model_dump(exclude_unset=True, exclude={"client_version", "branch_change_note", "skip_edit_log"})
    # The current odometer moves only through trip sheets (odometer.advance) and
    # Admin's Correct Odometer — an Edit Truck save carries the form's copy of
    # it, possibly older than the truck's, and used to write that back.
    payload_dict.pop("odometer", None)
    # Documents (dates, costs, numbers, files) change only through Compliance &
    # Renewals → Renew / Correct, which keep their history — never via Edit Truck.
    for f in COMPLIANCE_TRUCK_FIELDS:
        payload_dict.pop(f, None)
    old_dates = {f: str(getattr(truck, f) or "") for f in _COMPLIANCE_FIELDS}
    old_branch = truck.branch_registered_to

    branch_changed = False
    if "branch_registered_to" in payload_dict:
        new_branch = payload_dict["branch_registered_to"]
        if new_branch and new_branch != old_branch:
            if not (payload.branch_change_note or "").strip():
                raise HTTPException(400, "Please add a note explaining this branch change.")
            branch_changed = True

    for field, value in payload_dict.items():
        setattr(truck, field, value)
    truck.version = (truck.version or 1) + 1

    if branch_changed:
        # A manual/permanent edit here supersedes any "This Trip Only" arrangement
        # in effect — the truck no longer has a branch to snap back to.
        truck.temp_branch_original = None
        truck.temp_branch_trip_id = None

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

    if "branch_registered_to" in payload_dict and truck.branch_registered_to != old_branch:
        db.add(models.TruckBranchHistory(
            truck_id=truck.id,
            from_branch=old_branch,
            to_branch=truck.branch_registered_to,
            note=(payload.branch_change_note or "").strip(),
            changed_by=current_user.id,
            changed_by_name=current_user.name or "Unknown",
            changed_at=now,
        ))

    if not payload.skip_edit_log:
        db.add(models.TruckEditEvent(
            truck_id=truck.id, event="Truck Edited",
            actor_name=current_user.name, actor_role=current_user.role,
        ))

    db.commit()
    db.refresh(truck)
    emit("truck_updated", {"id": truck.id})
    return truck


@router.post("/{truck_id}/branch-change", response_model=schemas.TruckOut)
def change_truck_branch(
    truck_id: int,
    payload: schemas.TruckBranchChangeIn,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Reassign a truck's branch from the Assign Trip flow.

    Two modes:
      - "trip_only": the branch flips for the duration of one trip only. The
        original branch is remembered on the truck (temp_branch_original) and
        automatically restored — with its own system-logged history row — the
        moment that trip's invoice is generated or waived (see routers/trips.py).
      - "permanent": an ordinary reassignment, same as the PUT endpoint's
        branch_change_note path, just reached from a different dialog.
    """
    truck = db.query(models.Truck).with_for_update().filter(models.Truck.id == truck_id).first()
    if not truck:
        raise HTTPException(404, "Truck not found")

    old_branch = truck.branch_registered_to
    if payload.branch_name == old_branch:
        return truck

    now = datetime.now(timezone.utc)

    if payload.mode == "permanent":
        if not (payload.note or "").strip():
            raise HTTPException(400, "Please add a note explaining this branch change.")
        truck.branch_registered_to = payload.branch_name
        truck.temp_branch_original = None
        truck.temp_branch_trip_id = None
        note = payload.note.strip()
    else:
        if not (payload.trip_id or "").strip():
            raise HTTPException(400, "A trip is required for a trip-only branch change.")
        if not (payload.note or "").strip():
            raise HTTPException(400, "Please add a note explaining this branch change.")
        # If a temp assignment is already active, preserve the branch it should
        # ultimately revert to rather than overwriting it with the current
        # (itself temporary) branch.
        truck.temp_branch_original = truck.temp_branch_original or old_branch
        truck.temp_branch_trip_id = payload.trip_id.strip()
        truck.branch_registered_to = payload.branch_name
        note = (
            f"Temporarily assigned to Trip {payload.trip_id.strip()} by {current_user.name or 'Unknown'}. "
            f"Reason: {payload.note.strip()}"
        )

    db.add(models.TruckBranchHistory(
        truck_id=truck.id,
        from_branch=old_branch,
        to_branch=truck.branch_registered_to,
        note=note,
        changed_by=current_user.id,
        changed_by_name=current_user.name or "Unknown",
        changed_at=now,
    ))
    db.add(models.TruckEditEvent(
        truck_id=truck.id, event="Truck Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(truck)
    emit("truck_updated", {"id": truck.id})
    return truck


def release_truck_drivers(db: Session, truck: models.Truck, actor_name: str, actor_role: Optional[str]) -> int:
    """A sold or deleted truck can't keep a driver — otherwise the driver stays
    tied to a truck nobody can see and can't be assigned anywhere else. Logged
    in the driver's assignment history like a manual unassign. Doesn't commit."""
    assignments = db.query(models.DriverAssignment).filter(models.DriverAssignment.vehicle_id == truck.truck_id).all()
    for a in assignments:
        driver = db.query(models.Driver).filter(models.Driver.driver_id == a.driver_id).first()
        db.add(models.DriverAssignmentEditEvent(
            driver_id=a.driver_id, driver_name=driver.name if driver else a.driver_id, vehicle_id=None,
            event="Assignment Removed", actor_name=actor_name, actor_role=actor_role,
        ))
        db.delete(a)
    if assignments:
        emit("driver_updated", {})
    return len(assignments)


_TYRE_ACTION_LABEL = {
    "sold": "sold with the truck",
    "stock": "returned to stock",
    "retread": "sent to Retread Queue",
    "discard": "discarded",
}


def apply_truck_tyre_plan(
    db: Session,
    truck: models.Truck,
    plan: Optional[schemas.TruckTyrePlan],
    actor_name: str,
    actor_role: Optional[str],
    context: str,
) -> dict:
    """The tyre step of Sell / Delete Truck. Every tyre still fitted to the
    truck must have a choice: its fitment is closed (date, odometer, who, why)
    and the tyre goes to stock, the Retread Queue, Discarded Tyres, or leaves
    with the truck. context is "deleted" or "sold" — used in the remarks.
    Validates everything before changing anything; doesn't commit."""
    open_fitments = (
        db.query(models.TyreFitmentRecord)
        .filter(models.TyreFitmentRecord.truck_id == truck.id,
                models.TyreFitmentRecord.removed_odometer.is_(None))
        .with_for_update()
        .all()
    )
    if not open_fitments:
        return {}
    if plan is None:
        raise HTTPException(400, f"This truck has {len(open_fitments)} tyre(s) fitted — choose what happens to each one.")
    choices = {c.fitment_id: c.action for c in plan.tyres}
    missing = [f for f in open_fitments if f.id not in choices]
    if missing:
        raise HTTPException(
            400,
            f"{len(missing)} fitted tyre(s) have no choice — every tyre needs one "
            "(this happens if tyres were fitted after the choices were made).",
        )
    tyres = {
        t.id: t for t in db.query(models.TyreInventory)
        .filter(models.TyreInventory.id.in_([f.tyre_id for f in open_fitments]))
        .with_for_update().all()
    }
    for f in open_fitments:
        label = tyres[f.tyre_id].tyre_number if f.tyre_id in tyres else f.position
        if plan.removed_odometer < (f.fitted_odometer or 0):
            raise HTTPException(400, f"Odometer {plan.removed_odometer:,} km is below tyre {label}'s fitted odometer ({f.fitted_odometer:,} km).")
        if f.fitted_date and plan.removed_date < f.fitted_date:
            raise HTTPException(400, f"Removal date is before tyre {label} was fitted ({f.fitted_date}).")

    now = datetime.now(timezone.utc)
    truck_label = f"{truck.registration_number} ({truck.truck_id})"
    counts: dict[str, int] = {}
    for f in open_fitments:
        action = choices[f.id]
        f.removed_odometer = plan.removed_odometer
        f.removed_date = plan.removed_date
        f.removed_by_name = actor_name
        f.removal_remark = f"Truck {context} — {_TYRE_ACTION_LABEL[action]}"
        tyre = tyres.get(f.tyre_id)
        if tyre is not None and tyre.deleted_at is None:
            if action == "retread" and tyre.discarded_at is None:
                tyre.retread_flagged_at = now
                tyre.retread_flagged_by = actor_name
                db.add(models.TyreMovementEvent(
                    tyre_id=tyre.id, event="Flagged for Retreading",
                    actor_name=actor_name, actor_role=actor_role,
                    retread_count=tyre.retread_count or 0,
                ))
            elif action in ("discard", "sold"):
                tyre.discarded_at = now
                tyre.discarded_by = actor_name
                tyre.retread_flagged_at = None
                tyre.retread_flagged_by = None
                if action == "sold":
                    tyre.sold_with_truck_at = now
                    tyre.discard_reason = f"Sold with truck {truck_label} (truck {context})"
                else:
                    tyre.discard_reason = f"Discarded when truck {truck_label} was {context}"
                db.add(models.TyreMovementEvent(
                    tyre_id=tyre.id, event="Sold with Truck" if action == "sold" else "Flagged as Discarded",
                    actor_name=actor_name, actor_role=actor_role,
                    retread_count=tyre.retread_count or 0,
                ))
        counts[action] = counts.get(action, 0) + 1
    emit("tyre_updated", {})
    return counts


@router.delete("/{truck_id}", status_code=204, dependencies=[Depends(require_roles("Assistant Commercial Manager"))])
def delete_truck(
    truck_id: int,
    payload: Optional[schemas.TruckRemovalIn] = Body(None),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin / Assistant Commercial Manager only: soft-delete a truck directly
    (hides it from "Our Fleet" and every assignment picker, keeps its
    fuel/adblue/maintenance logs, tyre fitments, compliance history, and
    branch history intact and still resolvable). Every other role must file a
    DeletionApprovalRequest via POST /deletion-approvals instead, reviewed on
    the "Deletion Approvals" page — see deletion_approvals.py's
    approve_deletion, which performs the same soft-delete once an Admin
    approves. A self-approved DeletionApprovalRequest row is logged here for
    audit visibility, same pattern as drivers.py's delete_driver.
    """
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    if truck.deleted_at is not None:
        raise HTTPException(409, "Truck is already deleted")
    # Tyres first — refuses the whole delete if any fitted tyre has no choice.
    apply_truck_tyre_plan(db, truck, payload.tyre_plan if payload else None,
                          current_user.name, current_user.role, "deleted")
    release_truck_drivers(db, truck, current_user.name, current_user.role)
    now = datetime.now(timezone.utc)
    truck.deleted_at = now
    truck.disposal_type = "Deleted"
    # Always log the audit row (even for the built-in "admin" login, whose
    # current_user.id is None) — see drivers.py's delete_driver for rationale.
    db.add(models.DeletionApprovalRequest(
        resource_type="Truck",
        resource_id=truck_id,
        resource_name=f"{truck.truck_id} — {truck.registration_number}",
        requested_by_staff_id=current_user.id or 0,
        requested_by_name=current_user.name,
        reason="Deleted via Our Fleet (Admin action or pre-approved edit request).",
        status="Approved",
        approved_by_name=current_user.name,
        approved_at=now,
    ))
    db.add(models.TruckEditEvent(
        truck_id=truck_id, event="Truck Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("truck_updated", {})


def sell_truck_now(
    db: Session,
    truck: models.Truck,
    payload: schemas.TruckSellIn,
    actor_name: str,
    actor_role: Optional[str],
) -> None:
    """Mark a truck sold: its tyres follow the tyre choices (closed at the
    sale date/odometer), it leaves the active fleet (deleted_at) and shows
    under Our Fleet → Sold Trucks. Shared by the direct sale and an approved
    sell request. Doesn't commit."""
    if truck.deleted_at is not None:
        raise HTTPException(409, "This truck is no longer in the active fleet.")
    plan = payload.tyre_plan
    if plan is not None:
        # The sale date/odometer are what close the tyres.
        plan = plan.model_copy(update={"removed_date": payload.sold_date, "removed_odometer": payload.sold_odometer})
    apply_truck_tyre_plan(db, truck, plan, actor_name, actor_role, "sold")
    release_truck_drivers(db, truck, actor_name, actor_role)
    truck.deleted_at = datetime.now(timezone.utc)
    truck.disposal_type = "Sold"
    truck.sold_date = payload.sold_date
    truck.sold_odometer = payload.sold_odometer
    truck.sold_note = (payload.note or "").strip() or None
    truck.sold_by_name = actor_name
    db.add(models.TruckEditEvent(
        truck_id=truck.id, event="Truck Sold",
        actor_name=actor_name, actor_role=actor_role,
    ))


@router.post("/{truck_id}/sell", response_model=schemas.TruckOut, dependencies=[Depends(require_roles("Assistant Commercial Manager"))])
def sell_truck(
    truck_id: int,
    payload: schemas.TruckSellIn,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin / Assistant Commercial Manager: sell a truck directly. Other roles
    raise a request on Deletion Approvals (log_details.action = "sell")."""
    truck = db.query(models.Truck).with_for_update().filter(models.Truck.id == truck_id).first()
    if not truck:
        raise HTTPException(404, "Truck not found")
    sell_truck_now(db, truck, payload, current_user.name, current_user.role)
    db.commit()
    db.refresh(truck)
    emit("truck_updated", {})
    return truck


@router.post("/{truck_id}/restore", response_model=schemas.TruckOut, dependencies=[Depends(require_roles())])
def restore_truck(
    truck_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin only: undo a soft-delete — the truck reappears in Our Fleet (and
    every assignment picker) exactly as it was."""
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    if truck.deleted_at is None:
        raise HTTPException(409, "Truck is not deleted")
    if truck.disposal_type == "Sold":
        raise HTTPException(409, "This truck was sold — it can't be restored from the Archive.")
    truck.deleted_at = None
    truck.disposal_type = None
    db.add(models.TruckEditEvent(
        truck_id=truck.id, event="Truck Restored",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(truck)
    emit("truck_updated", {})
    return truck


@router.delete("/{truck_id}/permanent", status_code=204, dependencies=[Depends(require_roles())])
def permanently_delete_truck(truck_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: irreversibly delete an already soft-deleted truck. Only
    reachable from the "Archive" page."""
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    if truck.disposal_type == "Sold":
        raise HTTPException(409, "A sold truck's records are kept — it can't be permanently deleted.")
    auto_reject_stale_requests(db, "Truck", truck_id, current_user.name)
    db.delete(truck)
    db.commit()
    emit("truck_updated", {})
