from typing import Optional
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone
# Pydantic v2 resolves annotations via get_type_hints(), folding the class's
# own namespace into the lookup — a field literally named `date` annotated as
# Optional[date] resolves the type reference to the field itself (None)
# instead of datetime.date, silently corrupting it into an always-None field.
from datetime import date as _DateType
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
import maintenance_reminders
from websocket_manager import emit
from routers.deletion_approvals import auto_reject_stale_requests
from security import get_current_user, TokenUser, require_roles

router = APIRouter(tags=["Maintenance"])

EXPIRING_SOON_DAYS = 30


def _iqr_filter(intervals: list[dict]) -> list[dict]:
    """Remove outlier intervals using the Modified Z-score (MAD-based) method.

    More robust than Tukey IQR for small datasets because median and MAD are
    both resistant to the outlier that would otherwise widen the IQR fences.

    Requires ≥ 4 intervals; fewer → returned unchanged.
    Threshold = 3.5 (standard Iglewicz-Hoaglin recommendation).
    """
    if len(intervals) < 4:
        return intervals
    mileages = [r["mileage"] for r in intervals if r["mileage"] > 0]
    if len(mileages) < 4:
        return intervals

    sorted_m = sorted(mileages)
    n = len(sorted_m)
    # Median
    mid = n // 2
    median = (sorted_m[mid - 1] + sorted_m[mid]) / 2 if n % 2 == 0 else sorted_m[mid]
    # Median Absolute Deviation
    abs_devs = sorted(abs(m - median) for m in sorted_m)
    mad = (abs_devs[mid - 1] + abs_devs[mid]) / 2 if n % 2 == 0 else abs_devs[mid]

    if mad == 0:
        # All values identical — no outliers possible
        return intervals

    # Modified Z-score: 0.6745 = 1 / qnorm(0.75), so score ~ standard deviations
    threshold = 3.5
    return [
        r for r in intervals
        if (0.6745 * abs(r["mileage"] - median) / mad) <= threshold
    ]


def _compliance_status(expiry_date) -> str:
    if not expiry_date:
        return "Expired"
    today = date.today()
    if expiry_date < today:
        return "Expired"
    if expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS):
        return "Expiring Soon"
    return "Valid"


# ---------------------------------------------------------------------------
# Maintenance Records
# ---------------------------------------------------------------------------

@router.get("/maintenance/ai-counts", tags=["Maintenance"])
def get_maintenance_ai_counts(db: Session = Depends(get_db)):
    """Pure SQL counts for AI assistant — no row loading."""
    from sqlalchemy import func
    total_records = db.query(func.count(models.MaintenanceRecord.id)).scalar() or 0
    total_fuel_logs = db.query(func.count(models.FuelLog.id)).scalar() or 0
    total_cost = float(db.query(func.coalesce(func.sum(models.MaintenanceRecord.cost), 0)).scalar() or 0)
    total_fuel_spend = float(db.query(func.coalesce(func.sum(models.FuelLog.total_cost), 0)).scalar() or 0)
    total_litres = float(db.query(func.coalesce(func.sum(models.FuelLog.litres), 0)).scalar() or 0)
    return {
        "total_maintenance_records": total_records,
        "total_fuel_log_entries": total_fuel_logs,
        "total_maintenance_cost": total_cost,
        "total_fuel_spend": total_fuel_spend,
        "total_litres_consumed": total_litres,
    }


@router.get("/maintenance/records", response_model=list[schemas.MaintenanceRecordOut], tags=["Maintenance"])
def list_maintenance_records(
    truck_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None, description="Search by maintenance type or description"),
    limit: Optional[int] = Query(None, le=100, description="Max rows (AI use); omit for full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    from sqlalchemy import or_
    q = db.query(models.MaintenanceRecord)
    if truck_id:
        q = q.filter(models.MaintenanceRecord.truck_id == truck_id)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(or_(
            models.MaintenanceRecord.maintenance_type.ilike(s),
            models.MaintenanceRecord.description.ilike(s),
        ))
    q = q.order_by(models.MaintenanceRecord.date.desc())
    if limit is not None:
        q = q.offset(offset).limit(limit)
    rows = q.all()
    # One grouped query for every record's Proof of Payment count.
    if rows:
        counts = dict(
            db.query(models.MaintenanceProof.record_id, func.count(models.MaintenanceProof.id))
            .filter(models.MaintenanceProof.record_id.in_([r.id for r in rows]))
            .group_by(models.MaintenanceProof.record_id)
            .all()
        )
        for r in rows:
            r.proof_count = int(counts.get(r.id, 0))
    return rows


@router.get("/maintenance/record-edit-events", response_model=list[schemas.MaintenanceRecordEditEventListOut], tags=["Maintenance"])
def list_all_maintenance_record_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete event ever logged, across every maintenance
    record — the page-wide "Edit History" log on Truck Maintenance, so
    who-changed-what is searchable in one place. Most recent first.
    """
    events = (
        db.query(models.MaintenanceRecordEditEvent)
        .order_by(models.MaintenanceRecordEditEvent.created_at.desc(), models.MaintenanceRecordEditEvent.id.desc())
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
            "record_id": e.record_id,
            "maintenance_type": e.maintenance_type,
            "record_date": e.record_date,
            "event": e.event,
            "actor_name": e.actor_name,
            "actor_role": e.actor_role,
            "created_at": e.created_at,
        })
    return result


@router.get("/maintenance/emi-records", response_model=list[schemas.EmiRecordOut], tags=["Maintenance"])
def list_emi_records_readonly(db: Session = Depends(get_db)):
    """Read-only EMI listing for roles that need to see loan/EMI data without the
    full financial write access `routers/finance.py`'s /finance/emi requires
    (that whole router is Accounts/Admin-only). Currently used by Auditor's
    "Truck EMI Record" page — same query as finance.list_emi, no mutation here."""
    return db.query(models.EmiRecord).order_by(models.EmiRecord.emi_name).all()


def _apply_maintenance_by(db: Session, data: dict) -> dict:
    """Maintenance By → Vendor links the record to a real vendor (Our Vendors →
    View Record lists by vendor_id) and snapshots that vendor's current name;
    → Individual is just a typed name with no vendor link."""
    kind = data.get("maintenance_by_type")
    vendor_id = data.get("vendor_id")
    if kind == "Individual":
        data["vendor_id"] = None
    elif vendor_id:
        vendor = db.get(models.Vendor, vendor_id)
        if not vendor or vendor.deleted_at is not None:
            raise HTTPException(400, "The selected vendor no longer exists. Please pick another.")
        data["maintenance_by_type"] = "Vendor"
        data["maintenance_by"] = vendor.name
    return data


def check_new_record(db: Session, payload: schemas.MaintenanceRecordCreate, check_odometer: bool = True) -> models.Truck:
    """The checks a new maintenance record must pass — run when it's
    submitted for approval and again when it's approved (the truck or vendor
    may have changed in between)."""
    truck = db.get(models.Truck, payload.truck_id)
    if not truck or truck.deleted_at is not None:
        raise HTTPException(404, "Truck not found")
    current_odo = int(truck.odometer or 0)
    if check_odometer and current_odo > 0 and int(payload.odometer) > current_odo:
        raise HTTPException(400, f"Odometer ({payload.odometer} km) cannot exceed the truck's current odometer ({current_odo} km).")
    _apply_maintenance_by(db, payload.model_dump())
    return truck


def create_record(
    db: Session, payload: schemas.MaintenanceRecordCreate, *, entered_by_name: str, actor_role: str | None,
    source: str | None, trip_id: int | None = None, check_odometer: bool = True,
) -> models.MaintenanceRecord:
    """Adds the real record (and its "Record Created" log). There's no direct
    endpoint for this any more — every new record goes through Maintenance
    Approvals (routers/maintenance_requests.py). Doesn't commit."""
    truck = check_new_record(db, payload, check_odometer)
    data = _apply_maintenance_by(db, payload.model_dump())
    remind_at = data.pop("remind_at_odometer", None)
    record = models.MaintenanceRecord(**data, trip_id=trip_id, entered_by_name=entered_by_name, source=source)
    maintenance_reminders.set_reminder(record, truck, remind_at)
    db.add(record)
    db.flush()
    db.add(models.MaintenanceRecordEditEvent(
        truck_id=record.truck_id, record_id=record.id,
        maintenance_type=record.maintenance_type, record_date=record.date,
        event="Record Created",
        actor_name=entered_by_name, actor_role=actor_role,
    ))
    return record


# -- Proof of Payment (files on a maintenance record) ---------------------------
#
# Up to 5 images (JPG, PNG, WEBP, GIF, BMP) and 3 PDFs per record, 10 MB each.
# Type is checked by the
# file's actual bytes (not its name or the browser's claim), same as the
# /files router. Downloads go through the normal Authorization header — the
# frontend fetches them as blobs — so no token ever lands in a URL.

PROOF_MAX_IMAGES = 5
PROOF_MAX_PDFS = 3
PROOF_MAX_BYTES = 10 * 1024 * 1024
PROOF_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}


def _proof_mime(data: bytes) -> str | None:
    """True type from the file's first bytes — the shared /files sniffer plus BMP."""
    from routers.files import _sniff_mime
    if data[:2] == b"BM" and len(data) > 26:
        return "image/bmp"
    return _sniff_mime(data)


def _proof_record(db: Session, record_id: int, lock: bool = False) -> models.MaintenanceRecord:
    q = db.query(models.MaintenanceRecord).filter(models.MaintenanceRecord.id == record_id)
    if lock:
        q = q.with_for_update()
    record = q.first()
    if not record:
        raise HTTPException(404, "Maintenance record not found")
    return record


@router.get("/maintenance/records/{record_id}/proofs", response_model=list[schemas.MaintenanceProofOut], tags=["Maintenance"])
def list_maintenance_proofs(record_id: int, db: Session = Depends(get_db)):
    _proof_record(db, record_id)
    return (
        db.query(models.MaintenanceProof)
        .filter(models.MaintenanceProof.record_id == record_id)
        .order_by(models.MaintenanceProof.kind.desc(), models.MaintenanceProof.id)
        .all()
    )


@router.post("/maintenance/records/{record_id}/proofs", response_model=schemas.MaintenanceProofOut, status_code=201, tags=["Maintenance"])
async def upload_maintenance_proof(
    record_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    # Read one byte past the cap so an oversized file is caught without
    # pulling the whole thing into memory.
    data = await file.read(PROOF_MAX_BYTES + 1)
    if len(data) > PROOF_MAX_BYTES:
        raise HTTPException(413, f"File too large. Each proof can be at most {PROOF_MAX_BYTES // (1024 * 1024)} MB.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    mime = _proof_mime(data)
    if mime in PROOF_IMAGE_MIMES:
        kind, limit = "image", PROOF_MAX_IMAGES
    elif mime == "application/pdf":
        kind, limit = "pdf", PROOF_MAX_PDFS
    else:
        raise HTTPException(415, "Only images (JPG, PNG, WEBP, GIF, BMP) and PDF files can be uploaded as Proof of Payment.")
    # Lock the record so two simultaneous uploads can't both slip under the limit.
    _proof_record(db, record_id, lock=True)
    existing = (
        db.query(func.count(models.MaintenanceProof.id))
        .filter(models.MaintenanceProof.record_id == record_id, models.MaintenanceProof.kind == kind)
        .scalar()
    )
    if existing >= limit:
        db.rollback()
        label = "images" if kind == "image" else "PDFs"
        raise HTTPException(400, f"This record already has the maximum of {limit} {label}.")
    name = (file.filename or ("proof.jpg" if kind == "image" else "proof.pdf")).replace("\\", "/").split("/")[-1][:255]
    proof = models.MaintenanceProof(
        record_id=record_id, kind=kind, file_name=name, size_bytes=len(data),
        data=data, uploaded_by_name=current_user.name,
    )
    db.add(proof)
    db.commit()
    db.refresh(proof)
    emit("maintenance_updated", {})
    return proof


@router.get("/maintenance/records/{record_id}/proofs/{proof_id}", tags=["Maintenance"])
def download_maintenance_proof(record_id: int, proof_id: int, db: Session = Depends(get_db)):
    proof = (
        db.query(models.MaintenanceProof)
        .filter(models.MaintenanceProof.id == proof_id, models.MaintenanceProof.record_id == record_id)
        .first()
    )
    if not proof:
        raise HTTPException(404, "Proof not found")
    # Served as whatever the bytes actually are (a PNG stays a PNG).
    mime = _proof_mime(proof.data) or ("application/pdf" if proof.kind == "pdf" else "application/octet-stream")
    safe_name = proof.file_name.replace('"', "")
    return Response(
        content=proof.data,
        media_type=mime,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


# Admin-only, same as deleting a maintenance record outright (non-Admins go
# through deletion approval for records).
@router.delete("/maintenance/records/{record_id}/proofs/{proof_id}", status_code=204, tags=["Maintenance"],
               dependencies=[Depends(require_roles())])
def delete_maintenance_proof(record_id: int, proof_id: int, db: Session = Depends(get_db)):
    deleted = (
        db.query(models.MaintenanceProof)
        .filter(models.MaintenanceProof.id == proof_id, models.MaintenanceProof.record_id == record_id)
        .delete(synchronize_session=False)
    )
    if not deleted:
        raise HTTPException(404, "Proof not found")
    db.commit()
    emit("maintenance_updated", {})


# Fields an edit may never blank out — the record would be invalid without them.
_REQUIRED_RECORD_FIELDS = ("date", "odometer", "maintenance_type")


def apply_maintenance_record_update(
    db: Session,
    record: models.MaintenanceRecord,
    payload: schemas.MaintenanceRecordUpdate,
    actor_name: str,
    actor_role: str,
) -> None:
    """Validate and apply an edit to a maintenance record, and log it. Shared
    by the Admin's direct edit (PUT below) and by an Admin approving a
    non-Admin's edit request (routers/edit_approvals.py). Doesn't commit."""
    updates = payload.model_dump(exclude_unset=True, exclude={"client_version"})
    for f in _REQUIRED_RECORD_FIELDS:
        if f in updates and updates[f] in (None, ""):
            raise HTTPException(400, f"{f.replace('_', ' ').capitalize()} can't be empty.")
    if updates.get("odometer") is not None:
        truck = db.get(models.Truck, record.truck_id)
        if truck:
            current_odo = int(truck.odometer or 0)
            if current_odo > 0 and int(updates["odometer"]) > current_odo:
                raise HTTPException(400, f"Odometer ({updates['odometer']} km) cannot exceed the truck's current odometer ({current_odo} km).")
    if {"vendor_id", "maintenance_by_type"} & updates.keys():
        updates = _apply_maintenance_by(db, updates)
    has_reminder = "remind_at_odometer" in updates
    remind_at = updates.pop("remind_at_odometer", None)
    for field, value in updates.items():
        setattr(record, field, value)
    if has_reminder:
        maintenance_reminders.set_reminder(record, db.get(models.Truck, record.truck_id), remind_at)
    record.entered_by_name = actor_name
    record.version = (record.version or 1) + 1
    db.add(models.MaintenanceRecordEditEvent(
        truck_id=record.truck_id, record_id=record.id,
        maintenance_type=record.maintenance_type, record_date=record.date,
        event="Record Edited",
        actor_name=actor_name, actor_role=actor_role,
    ))


# Admin only, like deleting — other roles raise an Edit Request instead
# (POST /edit-approvals, resource_type "MaintenanceRecord"), which this same
# logic applies once an Admin approves it.
@router.put("/maintenance/records/{record_id}", response_model=schemas.MaintenanceRecordOut, tags=["Maintenance"])
def update_maintenance_record(record_id: int, payload: schemas.MaintenanceRecordUpdate, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if current_user.role != "Admin" and current_user.id is not None:
        raise HTTPException(403, "Only admins can edit maintenance records directly. Please raise an Edit Request.")
    record = db.query(models.MaintenanceRecord).with_for_update().filter(models.MaintenanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(404, "Maintenance record not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This maintenance record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    apply_maintenance_record_update(db, record, payload, current_user.name, current_user.role)
    db.commit()
    db.refresh(record)
    emit("maintenance_updated", {})
    return record


@router.delete("/maintenance/records/{record_id}", status_code=204, tags=["Maintenance"])
def delete_maintenance_record(record_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if current_user.role != "Admin" and current_user.id is not None:
        raise HTTPException(403, "Only admins can delete maintenance records directly.")
    record = db.get(models.MaintenanceRecord, record_id)
    if not record:
        raise HTTPException(404, "Maintenance record not found")
    db.add(models.MaintenanceRecordEditEvent(
        truck_id=record.truck_id, record_id=record.id,
        maintenance_type=record.maintenance_type, record_date=record.date,
        event="Record Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(record)
    db.commit()
    emit("maintenance_updated", {})


# ---------------------------------------------------------------------------
# Compliance
# ---------------------------------------------------------------------------

@router.get("/maintenance/compliance", tags=["Maintenance"])
def get_compliance(db: Session = Depends(get_db)):
    trucks = db.query(models.Truck).all()
    result = []
    for truck in trucks:
        docs = [
            {"doc": "Fitness Certificate", "expiry": truck.fc_expiry_date},
            {"doc": "Road Tax", "expiry": truck.road_tax_date},
            {"doc": "National Permit", "expiry": truck.national_permit_date},
            {"doc": "Pollution Certificate", "expiry": truck.pollution_certificate_date},
            {"doc": "Insurance", "expiry": truck.insurance_expiry_date},
        ]
        for d in docs:
            result.append({
                "truck_id": truck.id,
                "registration_number": truck.registration_number,
                "document": d["doc"],
                "expiry_date": str(d["expiry"]) if d["expiry"] else None,
                "status": _compliance_status(d["expiry"]),
            })
    return result


def maintenance_cost_summary_all(db: Session) -> dict[int, dict]:
    """Per-truck maintenance cost over the last 12 months — the ONE place it's
    worked out (Truck Maintenance → Full Status, the calculator, Profitability).

    The total is spread over the months the truck has actually been on record
    (from when it was added — or its first maintenance bill, if earlier — up
    to today), capped at 12, minimum 1. Dividing by 12 regardless made a truck
    with 3 months of history look about 4 times cheaper to maintain.
        monthly = total ÷ months covered;  per day = monthly ÷ 26 working days
    {truck.id: {total, months, monthly, daily, from, to}}."""
    from cost_units import DAYS_PER_MONTH, WORKING_DAYS_PER_MONTH

    today = date.today()
    try:
        one_year_ago = today.replace(year=today.year - 1)
    except ValueError:
        one_year_ago = today.replace(year=today.year - 1, day=28)

    rows = (
        db.query(
            models.MaintenanceRecord.truck_id,
            func.sum(models.MaintenanceRecord.cost).label("total"),
            func.min(models.MaintenanceRecord.date).label("first"),
        )
        .filter(models.MaintenanceRecord.date >= one_year_ago, models.MaintenanceRecord.date <= today)
        .group_by(models.MaintenanceRecord.truck_id)
        .all()
    )
    added = {
        t.id: (t.created_at.date() if isinstance(t.created_at, datetime) else t.created_at)
        for t in db.query(models.Truck.id, models.Truck.created_at)
    }
    out: dict[int, dict] = {}
    for truck_id, total, first in rows:
        total = float(total or 0)
        if total <= 0:
            continue
        on_record = min(d for d in (added.get(truck_id), first) if d)
        start = max(one_year_ago, on_record)
        months = min(12.0, max(1.0, ((today - start).days + 1) / DAYS_PER_MONTH))
        monthly = total / months
        out[truck_id] = {
            "total": round(total, 2),
            "months": round(months, 4),
            "monthly": monthly,
            "daily": monthly / WORKING_DAYS_PER_MONTH,
            "from": start.isoformat(),
            "to": today.isoformat(),
        }
    return out


@router.get("/maintenance/cost-per-day/all", tags=["Maintenance"])
def get_maintenance_cost_per_day_all(db: Session = Depends(get_db)):
    """
    Per-truck average maintenance cost per working day — see
    maintenance_cost_summary_all (Full Status 'Avg / Day').
    Returns { "<truck_db_id>": avg_daily_cost_float, ... } — only trucks with data.
    """
    return {str(tid): v["daily"] for tid, v in maintenance_cost_summary_all(db).items()}


@router.get("/maintenance/cost-per-km/all", tags=["Maintenance"])
def get_maintenance_cost_per_km_all(db: Session = Depends(get_db)):
    """
    Per-truck maintenance cost/km (Basic): Full Status 'Cost / Km' =
    Avg / Day ÷ km/day for the truck's tyre layout (Admin → Truck Run Config).
    Returns { "<truck_db_id>": cost_per_km_float, ... } — only trucks with data and km/day set.
    """
    summary = maintenance_cost_summary_all(db)
    if not summary:
        return {}
    kpd_map = {c.tyre_layout: float(c.km_per_day or 0) for c in db.query(models.TruckRunConfig).all()}
    result: dict[str, float] = {}
    for truck in db.query(models.Truck).filter(models.Truck.id.in_(list(summary))).all():
        kpd = kpd_map.get(truck.tyre_layout or "", 0)
        if kpd > 0:
            result[str(truck.id)] = summary[truck.id]["daily"] / kpd
    return result


@router.get("/maintenance/trucks/{truck_db_id}/cost-summary", tags=["Maintenance"])
def get_truck_maintenance_cost_summary(truck_db_id: int, db: Session = Depends(get_db)):
    """One truck's maintenance cost summary (Full Status) — zeros when no bills."""
    return maintenance_cost_summary_all(db).get(truck_db_id) or {
        "total": 0.0, "months": 0.0, "monthly": 0.0, "daily": 0.0, "from": None, "to": date.today().isoformat(),
    }


# ---------------------------------------------------------------------------
# Fuel Logs
# ---------------------------------------------------------------------------

@router.get("/maintenance/fuel-logs", response_model=list[schemas.FuelLogOut], tags=["Fuel Logs"])
def list_fuel_logs(
    truck_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, le=100, description="Max rows (AI use); omit for full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.FuelLog)
    if truck_id:
        q = q.filter(models.FuelLog.truck_id == truck_id)
    q = q.order_by(models.FuelLog.date.desc())
    if limit is not None:
        q = q.offset(offset).limit(limit)
    return q.all()


@router.get("/maintenance/fuel-logs/edit-events", response_model=list[schemas.FuelLogEditEventListOut], tags=["Fuel Logs"])
def list_all_fuel_log_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete event ever logged, across every fuel log —
    the page-wide "Edit History" log on Fuel History. Most recent first.
    """
    events = (
        db.query(models.FuelLogEditEvent)
        .order_by(models.FuelLogEditEvent.created_at.desc(), models.FuelLogEditEvent.id.desc())
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
            "log_id": e.log_id,
            "log_date": e.log_date,
            "litres": e.litres,
            "event": e.event,
            "actor_name": e.actor_name,
            "actor_role": e.actor_role,
            "created_at": e.created_at,
        })
    return result


@router.get("/maintenance/fuel-stations", response_model=list[str], tags=["Fuel Logs"])
def list_fuel_stations(db: Session = Depends(get_db)):
    rows = db.query(models.FuelLog.fuel_station).filter(models.FuelLog.fuel_station.isnot(None)).distinct().all()
    stations = {r[0].strip() for r in rows if r[0] and r[0].strip()}
    return sorted(list(stations))


@router.get("/maintenance/fuel-base-config", response_model=schemas.FuelBaseConfigOut, tags=["Fuel Logs"])
def get_fuel_base_config(db: Session = Depends(get_db)):
    row = db.query(models.FuelBaseConfig).first()
    if not row:
        row = models.FuelBaseConfig(cost_per_litre=None)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("/maintenance/fuel-base-config", response_model=schemas.FuelBaseConfigOut, tags=["Fuel Logs"])
def update_fuel_base_config(payload: schemas.FuelBaseConfigUpdate, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if current_user.role != "Admin":
        raise HTTPException(403, "Only Admins can update the fuel base rate.")
    row = db.query(models.FuelBaseConfig).first()
    if not row:
        row = models.FuelBaseConfig(cost_per_litre=payload.cost_per_litre)
        db.add(row)
    else:
        row.cost_per_litre = payload.cost_per_litre
        row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


@router.post("/maintenance/fuel-logs", response_model=schemas.FuelLogOut, status_code=201, tags=["Fuel Logs"])
def create_fuel_log(payload: schemas.FuelLogCreate, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if not db.get(models.Truck, payload.truck_id):
        raise HTTPException(404, "Truck not found")
        
    duplicate = db.query(models.FuelLog).filter(
        models.FuelLog.truck_id == payload.truck_id,
        models.FuelLog.date == payload.date,
        models.FuelLog.litres == payload.litres,
        models.FuelLog.odometer == payload.odometer
    ).first()
    if duplicate:
        raise HTTPException(400, "Duplicate entry: A fuel log with the same date, quantity, and odometer already exists.")
        
    latest_log = db.query(models.FuelLog)\
        .filter(models.FuelLog.truck_id == payload.truck_id)\
        .order_by(models.FuelLog.odometer.desc())\
        .first()
        
    if latest_log and payload.odometer <= latest_log.odometer:
        raise HTTPException(400, f"Odometer ({payload.odometer}) must be greater than the previous reading ({latest_log.odometer}).")
        
    distance = 0
    mileage = 0
    if latest_log:
        distance = payload.odometer - latest_log.odometer
        if float(payload.litres) > 0:
            mileage = float(distance) / float(payload.litres)
            
    log = models.FuelLog(**payload.model_dump(exclude={"entered_by_name", "source"}), distance=distance, mileage=mileage, entered_by_name=current_user.name, source="Manual Log")
    db.add(log)
    db.commit()
    db.refresh(log)
    db.add(models.FuelLogEditEvent(
        truck_id=log.truck_id, log_id=log.id, log_date=log.date, litres=log.litres,
        event="Log Created", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("fuel_updated", {})
    return log


@router.get("/maintenance/fuel-stats/all", tags=["Fuel Logs"])
def get_all_fuel_stats(db: Session = Depends(get_db)):
    """Returns average mileage in km/L keyed by truck_id (as string) for every truck that has fuel logs."""
    logs = (
        db.query(models.FuelLog)
        .order_by(models.FuelLog.truck_id, models.FuelLog.odometer.asc())
        .all()
    )
    # Group raw intervals per truck
    raw: dict[int, list[dict]] = {}
    prev: dict[int, models.FuelLog] = {}
    for log in logs:
        tid = log.truck_id
        litres = float(log.litres or 0)
        if tid in prev and litres > 0:
            dist = max(float(log.odometer) - float(prev[tid].odometer), 0)
            if dist > 0:
                raw.setdefault(tid, []).append({"distance": dist, "litres": litres,
                                                 "mileage": dist / litres})
        prev[tid] = log
    # Apply IQR filter per truck, then compute weighted average
    result = {}
    for tid, intervals in raw.items():
        filtered = _iqr_filter(intervals)
        total_d = sum(r["distance"] for r in filtered)
        total_f = sum(r["litres"]   for r in filtered)
        result[str(tid)] = round(total_d / total_f, 6) if total_f > 0 else 0
    return result


@router.get("/maintenance/trucks/{truck_id}/fuel-stats", response_model=schemas.FuelStats, tags=["Fuel Logs"])
def get_fuel_stats(truck_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Truck, truck_id):
        raise HTTPException(404, "Truck not found")

    logs = (
        db.query(models.FuelLog)
        .filter(models.FuelLog.truck_id == truck_id)
        .order_by(models.FuelLog.odometer.asc())
        .all()
    )

    if not logs:
        return schemas.FuelStats(
            total_distance=0, total_fuel=0, average_mileage=0,
            last_mileage=0, best_mileage=0, worst_mileage=0,
            trend_percentage=0, cost_per_km=0,
        )

    # Derive stats live from raw odometer values so that any stale stored
    # distance/mileage columns (from old code paths) never affect the output.
    raw_intervals = []
    for i in range(1, len(logs)):
        dist   = max(float(logs[i].odometer) - float(logs[i - 1].odometer), 0)
        litres = float(logs[i].litres or 0)
        cost   = float(logs[i].total_cost or 0)
        if dist > 0 and litres > 0:
            raw_intervals.append({"distance": dist, "litres": litres, "cost": cost,
                                   "mileage": dist / litres})

    # IQR outlier removal — keeps stat cards robust against bad odometer entries.
    intervals = _iqr_filter(raw_intervals)

    total_distance = sum(r["distance"] for r in intervals)
    total_fuel     = sum(r["litres"]   for r in intervals)
    total_cost     = sum(r["cost"]     for r in intervals)

    average_mileage = total_distance / total_fuel if total_fuel > 0 else 0
    cost_per_km     = total_cost / total_distance if total_distance > 0 else 0

    mileages      = [r["mileage"] for r in intervals]
    last_mileage  = mileages[-1]  if mileages else 0
    best_mileage  = max(mileages) if mileages else 0
    worst_mileage = min(mileages) if mileages else 0

    trend_percentage = 0
    if average_mileage > 0 and last_mileage > 0:
        trend_percentage = ((last_mileage - average_mileage) / average_mileage) * 100

    return schemas.FuelStats(
        total_distance=total_distance,
        total_fuel=total_fuel,
        average_mileage=average_mileage,
        last_mileage=last_mileage,
        best_mileage=best_mileage,
        worst_mileage=worst_mileage,
        trend_percentage=trend_percentage,
        cost_per_km=cost_per_km,
    )

@router.put("/maintenance/fuel-logs/{log_id}", response_model=schemas.FuelLogOut, tags=["Fuel Logs"])
def update_fuel_log(log_id: int, payload: schemas.FuelLogUpdate, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    log = db.query(models.FuelLog).with_for_update().filter(models.FuelLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "Fuel log not found")
    if payload.client_version is not None and log.version != payload.client_version:
        raise HTTPException(
            409,
            "This fuel log was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )

    new_date = payload.date if payload.date is not None else log.date
    new_litres = payload.litres if payload.litres is not None else log.litres
    new_odometer = payload.odometer if payload.odometer is not None else log.odometer
    
    duplicate = db.query(models.FuelLog).filter(
        models.FuelLog.id != log_id,
        models.FuelLog.truck_id == log.truck_id,
        models.FuelLog.date == new_date,
        models.FuelLog.litres == new_litres,
        models.FuelLog.odometer == new_odometer
    ).first()
    
    if duplicate:
        raise HTTPException(400, "Duplicate entry: A fuel log with the same date, quantity, and odometer already exists.")

    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version", "source"}).items():
        setattr(log, field, value)
    log.entered_by_name = current_user.name
    log.version = (log.version or 1) + 1
    db.add(models.FuelLogEditEvent(
        truck_id=log.truck_id, log_id=log.id, log_date=log.date, litres=log.litres,
        event="Log Edited", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.flush()  # persist field changes before re-sequencing

    # Re-sequence distance/mileage for ALL logs of this truck so that editing
    # any log (odometer or litres) keeps every subsequent row's values correct.
    truck_id = log.truck_id
    all_logs = (
        db.query(models.FuelLog)
        .filter(models.FuelLog.truck_id == truck_id)
        .order_by(models.FuelLog.odometer.asc())
        .all()
    )
    for i, row in enumerate(all_logs):
        if i == 0:
            row.distance = 0
            row.mileage = 0
        else:
            prev = all_logs[i - 1]
            dist = max(float(row.odometer) - float(prev.odometer), 0)
            row.distance = dist
            row.mileage = (dist / float(row.litres)) if float(row.litres) > 0 and dist > 0 else 0

    db.commit()
    db.refresh(log)
    emit("fuel_updated", {})
    return log


@router.delete("/maintenance/fuel-logs/{log_id}", status_code=204, tags=["Fuel Logs"])
def delete_fuel_log(log_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if current_user.role != "Admin" and current_user.id is not None:
        raise HTTPException(403, "Only admins can delete fuel logs directly.")
    log = db.get(models.FuelLog, log_id)
    if not log:
        raise HTTPException(404, "Fuel log not found")
    truck_id = log.truck_id
    db.add(models.FuelLogEditEvent(
        truck_id=truck_id, log_id=log.id, log_date=log.date, litres=log.litres,
        event="Log Deleted", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(log)
    db.flush()  # remove from session so it's excluded from the query below

    # Re-sequence distance & mileage for all remaining logs of this truck so
    # that deleting a middle entry doesn't leave stale values in subsequent rows.
    remaining = (
        db.query(models.FuelLog)
        .filter(models.FuelLog.truck_id == truck_id)
        .order_by(models.FuelLog.odometer.asc())
        .all()
    )
    for i, row in enumerate(remaining):
        if i == 0:
            row.distance = 0
            row.mileage = 0
        else:
            prev = remaining[i - 1]
            dist = float(row.odometer) - float(prev.odometer)
            row.distance = max(dist, 0)
            row.mileage = (dist / float(row.litres)) if float(row.litres) > 0 and dist > 0 else 0

    db.commit()
    emit("fuel_updated", {})


# ---------------------------------------------------------------------------
# AdBlue Logs (Truck's Adblue History) — a record only. Sold and deleted
# trucks' logs are kept but not shown; a deleted truck's come back with it
# when it's restored from the Archive.
# ---------------------------------------------------------------------------

def _active_truck_or_error(db: Session, truck_id: int) -> models.Truck:
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    if truck.deleted_at is not None:
        what = "sold" if truck.disposal_type == "Sold" else "deleted"
        raise HTTPException(400, f"This truck has been {what} — its AdBlue history can't be changed.")
    return truck


@router.get("/maintenance/adblue-logs/edit-events", response_model=list[schemas.AdBlueLogEditEventOut], tags=["AdBlue"])
def list_adblue_log_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete of an AdBlue log, most recent first — the
    page-wide Edit History on Truck's Adblue History. Registered before
    /maintenance/adblue-logs/{log_id} routes."""
    events = db.query(models.AdBlueLogEditEvent).order_by(models.AdBlueLogEditEvent.created_at.desc()).all()
    truck_ids = {e.truck_id for e in events}
    trucks_by_id = {t.id: t for t in db.query(models.Truck).filter(models.Truck.id.in_(truck_ids)).all()} if truck_ids else {}
    result = []
    for e in events:
        truck = trucks_by_id.get(e.truck_id)
        reg = truck.registration_number if truck else "(deleted truck)"
        litres_str = f"{e.litres}L" if e.litres is not None else ""
        date_str = e.log_date.isoformat() if e.log_date else ""
        result.append({
            "id": f"log-{e.id}",
            "label": " · ".join(p for p in [reg, date_str, litres_str] if p),
            "event": e.event, "actor_name": e.actor_name, "actor_role": e.actor_role,
            "created_at": e.created_at,
        })
    return result


@router.get("/maintenance/adblue-logs", response_model=list[schemas.AdBlueLogOut], tags=["AdBlue"])
def list_adblue_logs(
    truck_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.AdBlueLog)
        .join(models.Truck, models.Truck.id == models.AdBlueLog.truck_id)
        .filter(models.Truck.deleted_at.is_(None))
    )
    if truck_id:
        q = q.filter(models.AdBlueLog.truck_id == truck_id)
    return q.order_by(models.AdBlueLog.date.desc(), models.AdBlueLog.id.desc()).all()


@router.post("/maintenance/adblue-logs", response_model=schemas.AdBlueLogOut, status_code=201, tags=["AdBlue"])
def create_adblue_log(
    payload: schemas.AdBlueLogCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    _active_truck_or_error(db, payload.truck_id)
    log = models.AdBlueLog(**payload.model_dump(), entered_by_name=current_user.name)
    db.add(log)
    db.commit()
    db.refresh(log)
    db.add(models.AdBlueLogEditEvent(
        truck_id=log.truck_id, log_id=log.id, log_date=log.date, litres=log.litres,
        event="Log Created", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("adblue_updated", {})
    return log


@router.put("/maintenance/adblue-logs/{log_id}", response_model=schemas.AdBlueLogOut, tags=["AdBlue"])
def update_adblue_log(
    log_id: int,
    payload: schemas.AdBlueLogUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    log = db.query(models.AdBlueLog).with_for_update().filter(models.AdBlueLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "AdBlue log not found")
    _active_truck_or_error(db, log.truck_id)
    if payload.client_version is not None and log.version != payload.client_version:
        raise HTTPException(409, "This record was modified by someone else. Please refresh and try again.")
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(log, field, value)
    log.entered_by_name = current_user.name
    log.version = (log.version or 1) + 1
    db.add(models.AdBlueLogEditEvent(
        truck_id=log.truck_id, log_id=log.id, log_date=log.date, litres=log.litres,
        event="Log Edited", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(log)
    emit("adblue_updated", {})
    return log


@router.delete("/maintenance/adblue-logs/{log_id}", status_code=204, tags=["AdBlue"])
def delete_adblue_log(log_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    log = db.get(models.AdBlueLog, log_id)
    if not log:
        raise HTTPException(404, "AdBlue log not found")
    _active_truck_or_error(db, log.truck_id)
    db.add(models.AdBlueLogEditEvent(
        truck_id=log.truck_id, log_id=log.id, log_date=log.date, litres=log.litres,
        event="Log Deleted", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(log)
    db.commit()
    emit("adblue_updated", {})


# ---------------------------------------------------------------------------
# Truck Manufacturers (Our Fleet → Manufacturers; the Manufacturer list on
# Our Fleet's truck form and the grouping on Truck's Adblue History). URLs
# keep their original "adblue" names from when this list lived on the AdBlue page.
# ---------------------------------------------------------------------------

@router.get("/maintenance/adblue/edit-events", response_model=list[schemas.AdBlueEditEventOut], tags=["Truck Manufacturers"])
def list_all_adblue_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete of a truck manufacturer, most recent first —
    the page-wide Edit History on Admin → Truck Manufacturers."""
    events = db.query(models.AdBlueManufacturerEditEvent).order_by(models.AdBlueManufacturerEditEvent.created_at.desc()).all()
    return [
        {
            "id": f"mfr-{e.id}", "category": "Manufacturer", "label": e.name,
            "event": e.event, "actor_name": e.actor_name, "actor_role": e.actor_role,
            "created_at": e.created_at,
        }
        for e in events
    ]


@router.get("/maintenance/adblue-manufacturers", response_model=list[schemas.AdBlueManufacturerOut], tags=["Truck Manufacturers"])
def list_adblue_manufacturers(db: Session = Depends(get_db)):
    return db.query(models.AdBlueManufacturer).order_by(models.AdBlueManufacturer.name).all()


@router.post("/maintenance/adblue-manufacturers", response_model=schemas.AdBlueManufacturerOut, status_code=201, tags=["Truck Manufacturers"])
def create_adblue_manufacturer(
    payload: schemas.AdBlueManufacturerCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if db.query(models.AdBlueManufacturer).filter_by(name=payload.name).first():
        raise HTTPException(400, f"Manufacturer '{payload.name}' already exists.")
    if payload.default_price_per_litre is not None and payload.default_price_per_litre < 0:
        raise HTTPException(400, "AdBlue cost per litre can't be negative.")
    m = models.AdBlueManufacturer(**payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    db.add(models.AdBlueManufacturerEditEvent(
        manufacturer_id=m.id, name=m.name, event="Manufacturer Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("manufacturers_updated", {})
    return m


@router.put("/maintenance/adblue-manufacturers/{manufacturer_id}", response_model=schemas.AdBlueManufacturerOut, tags=["Truck Manufacturers"])
def update_adblue_manufacturer(
    manufacturer_id: int,
    payload: schemas.AdBlueManufacturerUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    m = db.get(models.AdBlueManufacturer, manufacturer_id)
    if not m:
        raise HTTPException(404, "Manufacturer not found.")
    if payload.name and payload.name != m.name:
        if db.query(models.AdBlueManufacturer).filter_by(name=payload.name).first():
            raise HTTPException(400, f"Manufacturer '{payload.name}' already exists.")
    if payload.default_price_per_litre is not None and payload.default_price_per_litre < 0:
        raise HTTPException(400, "AdBlue cost per litre can't be negative.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(m, field, value)
    db.add(models.AdBlueManufacturerEditEvent(
        manufacturer_id=m.id, name=m.name, event="Manufacturer Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(m)
    emit("manufacturers_updated", {})
    return m


@router.delete("/maintenance/adblue-manufacturers/{manufacturer_id}", status_code=204, tags=["Truck Manufacturers"])
def delete_adblue_manufacturer(
    manufacturer_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    m = db.get(models.AdBlueManufacturer, manufacturer_id)
    if not m:
        raise HTTPException(404, "Manufacturer not found.")
    db.add(models.AdBlueManufacturerEditEvent(
        manufacturer_id=m.id, name=m.name, event="Manufacturer Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(m)
    db.commit()
    emit("manufacturers_updated", {})


# ---------------------------------------------------------------------------
# Tyre Inventory
# ---------------------------------------------------------------------------

@router.get("/tyre-inventory", response_model=list[schemas.TyreInventoryOut], tags=["Tyre"])
def list_tyre_inventory(db: Session = Depends(get_db)):
    return db.query(models.TyreInventory).filter(
        models.TyreInventory.deleted_at.is_(None),
        models.TyreInventory.retread_flagged_at.is_(None),
        models.TyreInventory.discarded_at.is_(None),
    ).order_by(models.TyreInventory.brand).all()


@router.get("/tyre-inventory/available", response_model=list[schemas.TyreInventoryOut], tags=["Tyre"])
def available_tyres(db: Session = Depends(get_db)):
    fitted_ids = {
        r.tyre_id for r in db.query(models.TyreFitmentRecord).filter(models.TyreFitmentRecord.removed_odometer.is_(None)).all()
    }
    return db.query(models.TyreInventory).filter(
        models.TyreInventory.id.notin_(fitted_ids),
        models.TyreInventory.deleted_at.is_(None),
        models.TyreInventory.retread_flagged_at.is_(None),
        models.TyreInventory.discarded_at.is_(None),
    ).all()


@router.get("/tyre-inventory/{tyre_id}/data", response_model=schemas.TyreDataOut, tags=["Tyre"])
def get_tyre_data(tyre_id: int, db: Session = Depends(get_db)):
    """Everything recorded about one tyre: its current record, when it was first
    added to inventory, and every move to/from the Retread Queue or Discarded Tyres."""
    tyre = db.get(models.TyreInventory, tyre_id)
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    created = (
        db.query(models.TyreInventoryEditEvent.created_at)
        .filter(models.TyreInventoryEditEvent.tyre_id == tyre_id,
                models.TyreInventoryEditEvent.event == "Tyre Created")
        .order_by(models.TyreInventoryEditEvent.created_at)
        .first()
    )
    movements = (
        db.query(models.TyreMovementEvent)
        .filter(models.TyreMovementEvent.tyre_id == tyre_id)
        .order_by(models.TyreMovementEvent.created_at, models.TyreMovementEvent.id)
        .all()
    )
    return {
        "tyre": tyre,
        "added_to_inventory_at": created[0] if created else tyre.created_at,
        "movements": movements,
    }


@router.get("/tyre-inventory/retread-queue", response_model=list[schemas.TyreInventoryOut], tags=["Tyre"])
def list_retread_queue(db: Session = Depends(get_db)):
    """Tyres flagged for retreading, oldest flag first. Registered before the
    dynamic /tyre-inventory/{tyre_id} routes so "retread-queue" isn't read as an id."""
    return db.query(models.TyreInventory).filter(
        models.TyreInventory.deleted_at.is_(None),
        models.TyreInventory.retread_flagged_at.isnot(None),
        models.TyreInventory.discarded_at.is_(None),
    ).order_by(models.TyreInventory.retread_flagged_at).all()


@router.get("/tyre-inventory/discarded", response_model=list[schemas.TyreInventoryOut], tags=["Tyre"])
def list_discarded_tyres(db: Session = Depends(get_db)):
    """Tyres written off with "Flag as Discarded", most recent first."""
    return db.query(models.TyreInventory).filter(
        models.TyreInventory.deleted_at.is_(None),
        models.TyreInventory.discarded_at.isnot(None),
    ).order_by(models.TyreInventory.discarded_at.desc()).all()


@router.get("/tyre-inventory/deleted-ids", dependencies=[Depends(require_roles("Maintenance"))], tags=["Tyre"])
def list_deleted_tyre_ids(db: Session = Depends(get_db)):
    """Admin/Maintenance: ids of tyres currently soft-deleted. Lets the "Tyre
    Archive" page (which lists from the deletion_approval_requests audit trail)
    tell apart a still-deleted tyre from one that was since restored, same
    pattern as drivers.py's list_deleted_driver_ids. Registered before any
    dynamic /tyre-inventory/{tyre_id} route so "deleted-ids" isn't swallowed
    as a tyre_id path param."""
    rows = db.query(models.TyreInventory.id).filter(models.TyreInventory.deleted_at.isnot(None)).all()
    return [i for (i,) in rows]


@router.get("/tyre-inventory/edit-events", response_model=list[schemas.TyreInventoryEditEventListOut], dependencies=[Depends(require_roles())], tags=["Tyre"])
def list_all_tyre_inventory_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete/Restore event ever logged, across every tyre
    stock record — the page-wide "Edit History" log on Tyre Inventory.
    Registered before any dynamic /tyre-inventory/{tyre_id} route so
    "edit-events" isn't swallowed as a tyre_id path param."""
    events = (
        db.query(models.TyreInventoryEditEvent)
        .order_by(models.TyreInventoryEditEvent.created_at.desc(), models.TyreInventoryEditEvent.id.desc())
        .all()
    )
    if not events:
        return []
    tyre_ids = {e.tyre_id for e in events}
    tyres_by_id = {t.id: t for t in db.query(models.TyreInventory).filter(models.TyreInventory.id.in_(tyre_ids)).all()}

    result = []
    for e in events:
        tyre = tyres_by_id.get(e.tyre_id)
        result.append({
            "id": e.id,
            "tyre_id": e.tyre_id,
            "tyre_number": tyre.tyre_number if tyre else "(deleted)",
            "brand": tyre.brand if tyre else "",
            "event": e.event,
            "actor_name": e.actor_name,
            "actor_role": e.actor_role,
            "created_at": e.created_at,
        })
    return result


def condition_for_retread_count(count: int) -> str:
    """Condition is derived from the retread count — 0 is New, one or more is Rethreaded."""
    return "Rethreaded" if (count or 0) > 0 else "New"


@router.post("/tyre-inventory", response_model=schemas.TyreInventoryOut, status_code=201, tags=["Tyre"])
def create_tyre(
    payload: schemas.TyreInventoryCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if db.query(models.TyreInventory).filter(models.TyreInventory.tyre_number == payload.tyre_number).first():
        raise HTTPException(400, f"Tyre number {payload.tyre_number} already exists")
    tyre = models.TyreInventory(**_apply_maintenance_by(db, payload.model_dump()))
    tyre.condition = condition_for_retread_count(tyre.retread_count)
    db.add(tyre)
    db.commit()
    db.refresh(tyre)
    db.add(models.TyreInventoryEditEvent(
        tyre_id=tyre.id, event="Tyre Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("tyre_updated", {})
    return tyre


@router.put("/tyre-inventory/{tyre_id}", response_model=schemas.TyreInventoryOut, tags=["Tyre"])
def update_tyre(
    tyre_id: int,
    payload: schemas.TyreInventoryUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    tyre = db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == tyre_id).first()
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    if payload.client_version is not None and tyre.version != payload.client_version:
        raise HTTPException(
            409,
            "This tyre record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    updates = payload.model_dump(exclude_unset=True, exclude={"client_version"})
    # Other screens (Retread Queue etc.) send the whole tyre back — only
    # re-check the vendor when the pick actually changed, so a vendor deleted
    # since doesn't block them.
    if (updates.get("vendor_id", tyre.vendor_id) != tyre.vendor_id
            or updates.get("maintenance_by_type", tyre.maintenance_by_type) != tyre.maintenance_by_type):
        updates = _apply_maintenance_by(db, updates)
    for field, value in updates.items():
        setattr(tyre, field, value)
    tyre.condition = condition_for_retread_count(tyre.retread_count)
    tyre.version = (tyre.version or 1) + 1
    db.add(models.TyreInventoryEditEvent(
        tyre_id=tyre.id, event="Tyre Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(tyre)
    emit("tyre_updated", {})
    return tyre


# -- Proof of Payment/Invoice (one file per tyre) ------------------------------
#
# A PDF or any image a phone/scanner produces, 15 MB max. Type is checked by
# the file's real bytes, never its name. SVG is refused on purpose: it can
# carry scripts. Downloads go through the Authorization header (fetched as a
# blob), same as maintenance proofs.

TYRE_PROOF_MAX_BYTES = 15 * 1024 * 1024


def _tyre_proof_mime(data: bytes) -> str | None:
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return "image/tiff"
    if data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis"):
            return "image/heic"
        if brand in (b"mif1", b"msf1"):
            return "image/heif"
        if brand in (b"avif", b"avis"):
            return "image/avif"
    if data[:4] == b"\x00\x00\x01\x00":
        return "image/x-icon"
    return _proof_mime(data)          # JPG, PNG, WEBP, GIF, BMP, PDF


def _tyre_for_proof(db: Session, tyre_id: int) -> models.TyreInventory:
    tyre = db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == tyre_id).first()
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    return tyre


@router.post("/tyre-inventory/{tyre_id}/proof", response_model=schemas.TyreInventoryOut, tags=["Tyre"])
async def upload_tyre_proof(
    tyre_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Adds or replaces the tyre's Proof of Payment/Invoice."""
    data = await file.read(TYRE_PROOF_MAX_BYTES + 1)
    if len(data) > TYRE_PROOF_MAX_BYTES:
        raise HTTPException(413, "File too large. The proof can be at most 15 MB.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    mime = _tyre_proof_mime(data)
    if not mime or not (mime == "application/pdf" or mime.startswith("image/")):
        raise HTTPException(415, "Only PDF files and images can be uploaded as Proof of Payment/Invoice.")
    tyre = _tyre_for_proof(db, tyre_id)
    tyre.proof_data = data
    tyre.proof_size_bytes = len(data)
    tyre.proof_file_name = (file.filename or "proof").replace("\\", "/").split("/")[-1][:255]
    tyre.version = (tyre.version or 1) + 1
    db.add(models.TyreInventoryEditEvent(
        tyre_id=tyre.id, event="Tyre Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(tyre)
    emit("tyre_updated", {})
    return tyre


@router.get("/tyre-inventory/{tyre_id}/proof", tags=["Tyre"])
def download_tyre_proof(tyre_id: int, db: Session = Depends(get_db)):
    tyre = db.get(models.TyreInventory, tyre_id)
    if not tyre or not tyre.proof_file_name or tyre.proof_data is None:
        raise HTTPException(404, "No proof uploaded for this tyre")
    data = tyre.proof_data
    safe_name = tyre.proof_file_name.replace('"', "")
    return Response(
        content=data,
        media_type=_tyre_proof_mime(data) or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.delete("/tyre-inventory/{tyre_id}/proof", response_model=schemas.TyreInventoryOut, tags=["Tyre"])
def delete_tyre_proof(
    tyre_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    tyre = _tyre_for_proof(db, tyre_id)
    if tyre.proof_file_name:
        tyre.proof_data = None
        tyre.proof_size_bytes = None
        tyre.proof_file_name = None
        tyre.version = (tyre.version or 1) + 1
        db.add(models.TyreInventoryEditEvent(
            tyre_id=tyre.id, event="Tyre Edited",
            actor_name=current_user.name, actor_role=current_user.role,
        ))
        db.commit()
        db.refresh(tyre)
        emit("tyre_updated", {})
    return tyre


@router.delete("/tyre-inventory/{tyre_id}", status_code=204, dependencies=[Depends(require_roles())], tags=["Tyre"])
def delete_tyre(tyre_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: soft-delete a tyre directly (hides it from Tyre Inventory,
    recoverable from "Tyre Archive"). Non-admin roles (e.g. Maintenance) must
    instead file a DeletionApprovalRequest via POST /deletion-approvals,
    reviewed on the "Deletion Approvals" page — see deletion_approvals.py's
    approve_deletion, which performs the same soft-delete once an Admin
    approves. A self-approved DeletionApprovalRequest row is logged here for
    audit visibility, same pattern as drivers.py's delete_driver.
    """
    tyre = db.get(models.TyreInventory, tyre_id)
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    if tyre.deleted_at is not None:
        raise HTTPException(409, "Tyre is already deleted")
    now = datetime.now(timezone.utc)
    tyre.deleted_at = now
    db.add(models.DeletionApprovalRequest(
        resource_type="TyreInventory",
        resource_id=tyre_id,
        resource_name=f"{tyre.tyre_number} ({tyre.brand})",
        requested_by_staff_id=current_user.id or 0,
        requested_by_name=current_user.name,
        reason=f"Deleted directly by {current_user.role} — no approval required.",
        status="Approved",
        approved_by_name=current_user.name,
        approved_at=now,
    ))
    db.add(models.TyreInventoryEditEvent(
        tyre_id=tyre_id, event="Tyre Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("tyre_updated", {})


@router.post("/tyre-inventory/{tyre_id}/flag-retread", response_model=schemas.TyreInventoryOut, tags=["Tyre"], dependencies=[Depends(require_roles("Maintenance"))])
def flag_tyre_for_retread(
    tyre_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Moves a tyre from Tyre Inventory to the Retread Queue. The record is not
    copied — the same row is marked, so the queue shows its full data. A tyre
    still fitted to a truck can't be flagged; it has to be removed first."""
    tyre = db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == tyre_id).first()
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    if tyre.deleted_at is not None:
        raise HTTPException(409, "Tyre is deleted")
    if tyre.retread_flagged_at is not None:
        raise HTTPException(409, "Tyre is already in the Retread Queue")
    if tyre.discarded_at is not None:
        raise HTTPException(409, "Tyre is discarded")
    fitted = db.query(models.TyreFitmentRecord.id).filter(
        models.TyreFitmentRecord.tyre_id == tyre_id,
        models.TyreFitmentRecord.removed_odometer.is_(None),
    ).first()
    if fitted:
        raise HTTPException(409, "Tyre is fitted to a truck — remove it from the truck first")
    tyre.retread_flagged_at = datetime.now(timezone.utc)
    tyre.retread_flagged_by = current_user.name
    db.add(models.TyreMovementEvent(
        tyre_id=tyre.id, event="Flagged for Retreading",
        actor_name=current_user.name, actor_role=current_user.role,
        retread_count=tyre.retread_count or 0,
    ))
    db.commit()
    db.refresh(tyre)
    emit("tyre_updated", {})
    return tyre


@router.post("/tyre-inventory/{tyre_id}/move-to-inventory", response_model=schemas.TyreInventoryOut, tags=["Tyre"], dependencies=[Depends(require_roles("Maintenance"))])
def move_retread_tyre_to_inventory(
    tyre_id: int,
    payload: schemas.TyreMoveToInventory,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Moves a retread-queue tyre back into Tyre Inventory. The retread cost
    becomes the tyre's purchase cost and retread cost, and the entered expected
    range replaces its range. Cost per km is recalculated from them."""
    tyre = db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == tyre_id).first()
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    if tyre.deleted_at is not None:
        raise HTTPException(409, "Tyre is deleted")
    if tyre.retread_flagged_at is None:
        raise HTTPException(409, "Tyre is not in the Retread Queue")
    tyre.cost = payload.retread_cost
    tyre.retread_cost = payload.retread_cost
    tyre.range_km = payload.expected_range
    tyre.cost_per_km = (payload.retread_cost / payload.expected_range).quantize(Decimal("0.000001"))
    tyre.retread_count = (tyre.retread_count or 0) + 1
    tyre.condition = condition_for_retread_count(tyre.retread_count)
    tyre.retread_flagged_at = None
    tyre.retread_flagged_by = None
    db.add(models.TyreMovementEvent(
        tyre_id=tyre.id, event="Moved to Inventory",
        actor_name=current_user.name, actor_role=current_user.role,
        retread_cost=payload.retread_cost, expected_range=payload.expected_range,
        retread_count=tyre.retread_count, retread_done_by=payload.retread_done_by,
    ))
    db.add(models.TyreInventoryEditEvent(
        tyre_id=tyre.id, event="Tyre Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(tyre)
    emit("tyre_updated", {})
    return tyre


@router.post("/tyre-inventory/{tyre_id}/flag-discard", response_model=schemas.TyreInventoryOut, tags=["Tyre"], dependencies=[Depends(require_roles("Maintenance"))])
def flag_tyre_discarded(
    tyre_id: int,
    payload: schemas.TyreDiscardIn,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Writes a tyre off to Discarded Tyres, with a required reason. Works from
    Tyre Inventory or the Retread Queue; the tyre leaves both. A tyre still
    fitted to a truck can't be discarded."""
    tyre = db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == tyre_id).first()
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    if tyre.deleted_at is not None:
        raise HTTPException(409, "Tyre is deleted")
    if tyre.discarded_at is not None:
        raise HTTPException(409, "Tyre is already discarded")
    fitted = db.query(models.TyreFitmentRecord.id).filter(
        models.TyreFitmentRecord.tyre_id == tyre_id,
        models.TyreFitmentRecord.removed_odometer.is_(None),
    ).first()
    if fitted:
        raise HTTPException(409, "Tyre is fitted to a truck - remove it from the truck first")
    tyre.discarded_at = datetime.now(timezone.utc)
    tyre.discarded_by = current_user.name
    tyre.discard_reason = payload.reason
    tyre.retread_flagged_at = None
    tyre.retread_flagged_by = None
    db.add(models.TyreMovementEvent(
        tyre_id=tyre.id, event="Flagged as Discarded",
        actor_name=current_user.name, actor_role=current_user.role,
        retread_count=tyre.retread_count or 0,
    ))
    db.commit()
    db.refresh(tyre)
    emit("tyre_updated", {})
    return tyre


@router.post("/tyre-inventory/{tyre_id}/restore-from-discard", response_model=schemas.TyreInventoryOut, tags=["Tyre"], dependencies=[Depends(require_roles("Maintenance"))])
def restore_tyre_from_discard(
    tyre_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Moves a discarded tyre back into Tyre Inventory."""
    tyre = db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == tyre_id).first()
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    if tyre.discarded_at is None:
        raise HTTPException(409, "Tyre is not discarded")
    if tyre.sold_with_truck_at is not None:
        raise HTTPException(409, "This tyre was sold with a truck — it can't be moved back to inventory.")
    tyre.discarded_at = None
    tyre.discarded_by = None
    tyre.discard_reason = None
    db.add(models.TyreMovementEvent(
        tyre_id=tyre.id, event="Restored from Discard",
        actor_name=current_user.name, actor_role=current_user.role,
        retread_count=tyre.retread_count or 0,
    ))
    db.commit()
    db.refresh(tyre)
    emit("tyre_updated", {})
    return tyre


@router.post("/tyre-inventory/{tyre_id}/restore", response_model=schemas.TyreInventoryOut, dependencies=[Depends(require_roles("Maintenance"))], tags=["Tyre"])
def restore_tyre(
    tyre_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin/Maintenance: undo a soft-delete — the tyre reappears in Tyre
    Inventory exactly as it was."""
    tyre = db.get(models.TyreInventory, tyre_id)
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    if tyre.deleted_at is None:
        raise HTTPException(409, "Tyre is not deleted")
    tyre.deleted_at = None
    db.add(models.TyreInventoryEditEvent(
        tyre_id=tyre.id, event="Tyre Restored",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(tyre)
    emit("tyre_updated", {})
    return tyre


@router.delete("/tyre-inventory/{tyre_id}/permanent", status_code=204, dependencies=[Depends(require_roles("Maintenance"))], tags=["Tyre"])
def permanently_delete_tyre(tyre_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin/Maintenance: irreversibly delete an already soft-deleted tyre. Only
    reachable from the "Tyre Archive" page."""
    tyre = db.get(models.TyreInventory, tyre_id)
    if not tyre:
        raise HTTPException(404, "Tyre not found")
    auto_reject_stale_requests(db, "TyreInventory", tyre_id, current_user.name)
    db.delete(tyre)
    db.commit()
    emit("tyre_updated", {})


@router.get("/tyre-inventory/{tyre_id}/history", response_model=list[schemas.TyreFitmentOut], tags=["Tyre"])
def tyre_fitment_history(tyre_id: int, db: Session = Depends(get_db)):
    if not db.get(models.TyreInventory, tyre_id):
        raise HTTPException(404, "Tyre not found")
    return db.query(models.TyreFitmentRecord).filter(
        models.TyreFitmentRecord.tyre_id == tyre_id
    ).order_by(models.TyreFitmentRecord.fitted_date.desc()).all()


# ---------------------------------------------------------------------------
# Tyre Fitment
# ---------------------------------------------------------------------------

@router.get("/tyre-fitment", response_model=list[schemas.TyreFitmentOut], tags=["Tyre"])
def list_fitments(truck_id: Optional[int] = Query(None), active_only: bool = Query(False), db: Session = Depends(get_db)):
    q = db.query(models.TyreFitmentRecord)
    if truck_id:
        q = q.filter(models.TyreFitmentRecord.truck_id == truck_id)
    if active_only:
        q = q.filter(models.TyreFitmentRecord.removed_odometer.is_(None))
    return q.all()


@router.get("/tyre-fitment/events", response_model=list[schemas.TyreFitmentEventOut], tags=["Tyre"])
def list_all_tyre_fitment_events(db: Session = Depends(get_db)):
    """Every tyre fit/remove ever logged, across every truck — the page-wide
    "Edit History" log on Tyre Management, searchable in one place instead
    of opening each truck's own history individually. Derived directly from
    TyreFitmentRecord (fitted_by_name/removed_by_name were already captured
    there on every fit/remove/swap — this just surfaces them). Most recent
    first. A position swap shows as one "Removed" + one "Fitted" row per
    tyre involved, same as a plain remove/fit — the data doesn't distinguish
    a swap from two separate actions.
    """
    fitments = db.query(models.TyreFitmentRecord).all()
    if not fitments:
        return []
    truck_ids = {f.truck_id for f in fitments}
    tyre_ids = {f.tyre_id for f in fitments}
    trucks_by_id = {t.id: t for t in db.query(models.Truck).filter(models.Truck.id.in_(truck_ids)).all()}
    tyres_by_id = {t.id: t for t in db.query(models.TyreInventory).filter(models.TyreInventory.id.in_(tyre_ids)).all()}

    result = []
    for f in fitments:
        truck = trucks_by_id.get(f.truck_id)
        tyre = tyres_by_id.get(f.tyre_id)
        truck_id_str = truck.truck_id if truck else "—"
        registration_number = truck.registration_number if truck else "(deleted)"
        tyre_number = tyre.tyre_number if tyre else "(deleted)"
        if f.fitted_date:
            result.append({
                "id": f"{f.id}-fit",
                "truck_id": f.truck_id, "truck_id_str": truck_id_str, "registration_number": registration_number,
                "tyre_id": f.tyre_id, "tyre_number": tyre_number, "position": f.position,
                "event": "Tyre Fitted", "actor_name": f.fitted_by_name or "Unknown",
                "event_date": f.fitted_date, "remark": f.fitted_remark,
            })
        if f.removed_date:
            result.append({
                "id": f"{f.id}-remove",
                "truck_id": f.truck_id, "truck_id_str": truck_id_str, "registration_number": registration_number,
                "tyre_id": f.tyre_id, "tyre_number": tyre_number, "position": f.position,
                "event": "Tyre Removed", "actor_name": f.removed_by_name or "Unknown",
                "event_date": f.removed_date, "remark": f.removal_remark,
            })

    result.sort(key=lambda r: (r["event_date"] or _DateType.min, r["id"]), reverse=True)
    return result


@router.post("/tyre-fitment", response_model=schemas.TyreFitmentOut, status_code=201, tags=["Tyre"])
def fit_tyre(payload: schemas.TyreFitmentCreate, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    # Lock the tyre row to prevent concurrent fitting of the same tyre
    db.query(models.TyreInventory).with_for_update().filter(models.TyreInventory.id == payload.tyre_id).first()
    # Ensure tyre is not already fitted elsewhere
    active = db.query(models.TyreFitmentRecord).filter(
        models.TyreFitmentRecord.tyre_id == payload.tyre_id,
        models.TyreFitmentRecord.removed_odometer.is_(None),
    ).first()
    if active:
        raise HTTPException(400, "Tyre is already fitted on another truck/position")
    # Ensure position on the truck is free
    pos_occupied = db.query(models.TyreFitmentRecord).filter(
        models.TyreFitmentRecord.truck_id == payload.truck_id,
        models.TyreFitmentRecord.position == payload.position,
        models.TyreFitmentRecord.removed_odometer.is_(None),
    ).first()
    if pos_occupied:
        raise HTTPException(400, f"Position {payload.position} on this truck already has a tyre")
    record = models.TyreFitmentRecord(**payload.model_dump(), fitted_by_name=current_user.name)
    db.add(record)
    db.commit()
    db.refresh(record)
    emit("tyre_updated", {})
    return record


@router.patch("/tyre-fitment/{fitment_id}/remove", response_model=schemas.TyreFitmentOut, tags=["Tyre"])
def remove_tyre(fitment_id: int, payload: schemas.TyreFitmentRemove, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    record = db.get(models.TyreFitmentRecord, fitment_id)
    if not record:
        raise HTTPException(404, "Fitment record not found")
    if record.removed_odometer is not None:
        raise HTTPException(400, "Tyre already removed")
    record.removed_odometer = payload.removed_odometer
    record.removed_date = payload.removed_date
    record.removal_remark = payload.removal_remark
    record.removed_by_name = current_user.name
    db.commit()
    db.refresh(record)
    emit("tyre_updated", {})
    return record


@router.post("/tyre-fitment/remove-bulk", response_model=list[schemas.TyreFitmentOut], tags=["Tyre"])
def remove_tyres_bulk(
    payload: schemas.TyreFitmentBulkRemove,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Removes several tyres from a truck, all or nothing. Every tyre is checked
    first: the reading must be at least each tyre's fitted odometer. If any check
    fails, nothing is changed."""
    query = db.query(models.TyreFitmentRecord).filter(
        models.TyreFitmentRecord.truck_id == payload.truck_id,
        models.TyreFitmentRecord.removed_odometer.is_(None),
    )
    if payload.fitment_ids:
        query = query.filter(models.TyreFitmentRecord.id.in_(payload.fitment_ids))
    records = query.with_for_update().all()

    if payload.fitment_ids and len(records) != len(set(payload.fitment_ids)):
        raise HTTPException(409, "Some selected tyres are no longer fitted to this truck. Refresh and try again.")
    if not records:
        raise HTTPException(400, "No fitted tyres to remove on this truck.")

    too_low = [r for r in records if payload.removed_odometer < r.fitted_odometer]
    if too_low:
        detail = ", ".join(f"{r.position} (fitted at {r.fitted_odometer} km)" for r in too_low)
        raise HTTPException(
            400,
            f"Removal reading {payload.removed_odometer} km is less than the fitted odometer for: {detail}.",
        )

    for record in records:
        record.removed_odometer = payload.removed_odometer
        record.removed_date = payload.removed_date
        record.removal_remark = payload.removal_remark
        record.removed_by_name = current_user.name
    db.commit()
    for record in records:
        db.refresh(record)
    emit("tyre_updated", {})
    return records


@router.get("/tyre-remark-presets", response_model=list[schemas.TyreRemarkPresetOut], tags=["Tyre"])
def list_tyre_remark_presets(db: Session = Depends(get_db)):
    return db.query(models.TyreRemarkPreset).order_by(models.TyreRemarkPreset.scenario, models.TyreRemarkPreset.text).all()


@router.post("/tyre-remark-presets", response_model=schemas.TyreRemarkPresetOut, status_code=201,
             dependencies=[Depends(require_roles("Maintenance"))], tags=["Tyre"])
def create_tyre_remark_preset(
    payload: schemas.TyreRemarkPresetCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    exists = db.query(models.TyreRemarkPreset).filter(
        models.TyreRemarkPreset.scenario == payload.scenario,
        func.lower(models.TyreRemarkPreset.text) == payload.text.lower(),
    ).first()
    if exists:
        raise HTTPException(409, f"'{payload.text}' is already a {payload.scenario} remark")
    preset = models.TyreRemarkPreset(
        scenario=payload.scenario, text=payload.text, created_by=current_user.name,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


@router.delete("/tyre-remark-presets/{preset_id}", status_code=204,
               dependencies=[Depends(require_roles("Maintenance"))], tags=["Tyre"])
def delete_tyre_remark_preset(preset_id: int, db: Session = Depends(get_db)):
    preset = db.get(models.TyreRemarkPreset, preset_id)
    if not preset:
        raise HTTPException(404, "Remark not found")
    db.delete(preset)
    db.commit()


class _SwapPair(BaseModel):
    position_a: str
    position_b: str


class _SwapBody(BaseModel):
    truck_id: int
    pairs: list[_SwapPair]
    odometer: int
    remark: str
    date: Optional[_DateType] = None


@router.post("/tyre-fitment/swap", response_model=list[schemas.TyreFitmentOut], tags=["Tyre"])
def swap_tyre_positions(payload: _SwapBody, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Close existing fitments and open new ones at swapped positions, preserving full tyre history."""
    from datetime import date as _date
    today = payload.date or _date.today()
    all_affected: list[models.TyreFitmentRecord] = []

    for pair in payload.pairs:
        rec_a = db.query(models.TyreFitmentRecord).filter(
            models.TyreFitmentRecord.truck_id == payload.truck_id,
            models.TyreFitmentRecord.position == pair.position_a,
            models.TyreFitmentRecord.removed_odometer.is_(None),
        ).first()
        rec_b = db.query(models.TyreFitmentRecord).filter(
            models.TyreFitmentRecord.truck_id == payload.truck_id,
            models.TyreFitmentRecord.position == pair.position_b,
            models.TyreFitmentRecord.removed_odometer.is_(None),
        ).first()

        tyre_a_id = rec_a.tyre_id if rec_a else None
        tyre_b_id = rec_b.tyre_id if rec_b else None

        if not tyre_a_id and not tyre_b_id:
            continue  # Both empty — skip this pair

        # Validate odometer is not less than each tyre's fitted odometer
        if rec_a and payload.odometer < rec_a.fitted_odometer:
            raise HTTPException(
                400,
                f"Odometer {payload.odometer} km is less than the fitted odometer "
                f"{rec_a.fitted_odometer} km for position {pair.position_a}.",
            )
        if rec_b and payload.odometer < rec_b.fitted_odometer:
            raise HTTPException(
                400,
                f"Odometer {payload.odometer} km is less than the fitted odometer "
                f"{rec_b.fitted_odometer} km for position {pair.position_b}.",
            )

        # Close the existing fitment records (history entry)
        if rec_a:
            rec_a.removed_odometer = payload.odometer
            rec_a.removed_date = today
            rec_a.removal_remark = payload.remark
            rec_a.removed_by_name = current_user.name
            all_affected.append(rec_a)
        if rec_b:
            rec_b.removed_odometer = payload.odometer
            rec_b.removed_date = today
            rec_b.removal_remark = payload.remark
            rec_b.removed_by_name = current_user.name
            all_affected.append(rec_b)

        # Open new fitments at the swapped positions
        if tyre_a_id:
            new_rec = models.TyreFitmentRecord(
                tyre_id=tyre_a_id,
                truck_id=payload.truck_id,
                position=pair.position_b,
                fitted_odometer=payload.odometer,
                fitted_date=today,
                fitted_by_name=current_user.name,
                fitted_remark=payload.remark,
            )
            db.add(new_rec)
            all_affected.append(new_rec)
        if tyre_b_id:
            new_rec = models.TyreFitmentRecord(
                tyre_id=tyre_b_id,
                truck_id=payload.truck_id,
                position=pair.position_a,
                fitted_odometer=payload.odometer,
                fitted_date=today,
                fitted_by_name=current_user.name,
                fitted_remark=payload.remark,
            )
            db.add(new_rec)
            all_affected.append(new_rec)

    if not all_affected:
        return []  # Nothing to swap — all pairs were empty

    db.commit()
    for r in all_affected:
        db.refresh(r)
    emit("tyre_updated", {})
    return all_affected
