"""Maintenance Approvals — every new maintenance record waits for Admin or
Accounts before it reaches the truck's record.

A request is created by the Update Maintenance Record form ("Web") or by a
Trip Sheet's Major Repairs ("Trip Sheet", one per repair line). Until it's
approved nothing else sees it: the truck's records, running cost, P&L, vendor
records and reminders only ever read real MaintenanceRecord rows, which are
created here on approval (routers/maintenance.create_record).

A job whose cost isn't known yet can be saved as "Scheduled" instead: it
keeps the details (and the real date of the work) and waits in the truck's
Scheduled Records until someone adds the costs, which sends it on as
"Pending". Nothing counts a scheduled job — no record, cost, P&L or running
cost — until it's approved, and then on its own date, so the right period's
figures change. The places that show figures warn when a job in their
period is still waiting for its cost.

A rejected request can be fixed and sent back by the person who submitted
it (Maintenance Requests → Submit for Re-Verification): the same request
returns to Pending with the edited details, keeping the last rejection's
reason for the approver. A trip-sheet repair keeps its line fingerprint, so
re-saving the sheet neither duplicates nor cancels it.

Edits to existing records are unchanged — they still go to Edit Approvals.
Admin and Accounts may approve their own requests.
"""
import hashlib
import json
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.maintenance import (
    PROOF_IMAGE_MIMES, PROOF_MAX_BYTES, PROOF_MAX_IMAGES, PROOF_MAX_PDFS,
    _apply_maintenance_by, _clean_items, _proof_mime, check_new_record, create_record,
)
from security import TokenUser, get_current_user, require_roles
from websocket_manager import emit

router = APIRouter(prefix="/maintenance-requests", tags=["Maintenance Approvals"])

APPROVER_ROLES = ("Admin", "Accounts")
# Who may add the costs to a scheduled job besides the person who scheduled it.
SCHEDULE_EDITOR_ROLES = ("Admin", "Maintenance")
# A scheduled job waiting this long reminds its owner and shows in the recap.
SCHEDULED_REMIND_DAYS = 7
approver = require_roles("Accounts")       # Admin always passes


def _is_approver(user: TokenUser) -> bool:
    return user.role in APPROVER_ROLES


def _mine(user: TokenUser):
    """Requests this person submitted — by staff id, or by name for the staff-less admin login."""
    if user.id is not None:
        return models.MaintenanceRequest.submitted_by_id == user.id
    return (models.MaintenanceRequest.submitted_by_id.is_(None)) & (models.MaintenanceRequest.submitted_by_name == user.name)


def _is_submitter(req: models.MaintenanceRequest, user: TokenUser) -> bool:
    return req.submitted_by_id == user.id if user.id is not None else req.submitted_by_name == user.name


def _changed() -> None:
    emit("maintenance_request_updated", {})


def _out(db: Session, rows: list[models.MaintenanceRequest]) -> list[schemas.MaintenanceRequestOut]:
    """Requests with their truck / trip labels and proof counts, in a few grouped queries."""
    if not rows:
        return []
    trucks = {
        t.id: t for t in db.query(models.Truck.id, models.Truck.truck_id, models.Truck.registration_number)
        .filter(models.Truck.id.in_({r.truck_id for r in rows}))
    }
    trip_ids = {r.trip_id for r in rows if r.trip_id}
    trips = dict(
        db.query(models.Trip.id, models.Trip.trip_id).filter(models.Trip.id.in_(trip_ids))
    ) if trip_ids else {}
    counts = dict(
        db.query(models.MaintenanceRequestProof.request_id, func.count(models.MaintenanceRequestProof.id))
        .filter(models.MaintenanceRequestProof.request_id.in_([r.id for r in rows]))
        .group_by(models.MaintenanceRequestProof.request_id)
    )
    out = []
    for r in rows:
        t = trucks.get(r.truck_id)
        item = schemas.MaintenanceRequestOut.model_validate(r)
        item.truck_id_str = t.truck_id if t else None
        item.registration_number = t.registration_number if t else None
        item.trip_id_str = trips.get(r.trip_id)
        item.proof_count = int(counts.get(r.id, 0))
        out.append(item)
    return out


def _get(db: Session, request_id: int, lock: bool = False) -> models.MaintenanceRequest:
    q = db.query(models.MaintenanceRequest).filter(models.MaintenanceRequest.id == request_id)
    if lock:
        q = q.with_for_update()
    req = q.first()
    if not req:
        raise HTTPException(404, "Request not found")
    return req


def _payload_json(payload: schemas.MaintenanceRecordCreate) -> dict:
    return json.loads(payload.model_dump_json())


# ── Submit ──────────────────────────────────────────────────────────────────

def _prepared(db: Session, payload: schemas.MaintenanceRecordCreate, *, need_cost: bool) -> schemas.MaintenanceRecordCreate:
    """Checked and with names snapshotted: the vendor's (each repair line's
    too) so the approval card always shows it, and the cost as the total of
    the costs known so far."""
    check_new_record(db, payload, need_cost=need_cost)
    data = _apply_maintenance_by(db, payload.model_dump())
    if data.get("items"):
        data["items"] = _clean_items(db, data["items"], need_cost=need_cost)
        data["cost"] = sum((Decimal(str(i["cost"])) for i in data["items"] if i.get("cost") is not None), Decimal("0"))
    elif need_cost and data.get("cost") is None:
        raise HTTPException(400, "Enter the cost.")
    return schemas.MaintenanceRecordCreate(**data)


@router.post("", response_model=schemas.MaintenanceRequestOut, status_code=201)
def submit_request(
    payload: schemas.MaintenanceRecordCreate,
    schedule: bool = False,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """The Update Maintenance Record form. Checked now (odometer, vendor) so
    the submitter hears about mistakes straight away, and again on approval.
    ?schedule=true saves it to Scheduled Records instead, costs left for later."""
    payload = _prepared(db, payload, need_cost=not schedule)
    req = models.MaintenanceRequest(
        truck_id=payload.truck_id, source="Web", payload=_payload_json(payload),
        status="Scheduled" if schedule else "Pending",
        submitted_by_id=current_user.id, submitted_by_name=current_user.name, submitted_by_role=current_user.role,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    _changed()
    return _out(db, [req])[0]


@router.post("/{request_id}/proofs", response_model=schemas.MaintenanceRequestProofOut, status_code=201)
async def upload_request_proof(
    request_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Proof of Payment picked in the form — same limits as on a record
    (5 images + 3 PDFs, 10 MB each, type checked by the real bytes)."""
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
    req = _get(db, request_id, lock=True)
    if req.status not in ("Pending", "Scheduled"):
        raise HTTPException(409, "This request has already been decided.")
    if not _is_submitter(req, current_user) and not _is_approver(current_user) and current_user.role not in SCHEDULE_EDITOR_ROLES:
        raise HTTPException(403, "Only the person who submitted this request can add files to it.")
    existing = (
        db.query(func.count(models.MaintenanceRequestProof.id))
        .filter(models.MaintenanceRequestProof.request_id == request_id, models.MaintenanceRequestProof.kind == kind)
        .scalar()
    )
    if existing >= limit:
        db.rollback()
        raise HTTPException(400, f"This request already has the maximum of {limit} {'images' if kind == 'image' else 'PDFs'}.")
    name = (file.filename or ("proof.jpg" if kind == "image" else "proof.pdf")).replace("\\", "/").split("/")[-1][:255]
    proof = models.MaintenanceRequestProof(
        request_id=request_id, kind=kind, file_name=name, size_bytes=len(data),
        data=data, uploaded_by_name=current_user.name,
    )
    db.add(proof)
    db.commit()
    db.refresh(proof)
    _changed()
    return proof


# ── Read ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[schemas.MaintenanceRequestOut])
def list_requests(
    status: str | None = None,
    truck_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin/Accounts: every request (the Maintenance Approvals page).
    Anyone else: one truck's pending requests (its "Pending approval" list),
    or otherwise only their own."""
    q = db.query(models.MaintenanceRequest)
    if status:
        q = q.filter(models.MaintenanceRequest.status == status)
    else:
        # Scheduled jobs aren't up for approval yet: they live in Scheduled Records.
        q = q.filter(models.MaintenanceRequest.status != "Scheduled")
    if truck_id is not None:
        q = q.filter(models.MaintenanceRequest.truck_id == truck_id)
    if not _is_approver(current_user):
        if truck_id is not None:
            q = q.filter(models.MaintenanceRequest.status == "Pending")
        else:
            q = q.filter(_mine(current_user))
    rows = q.order_by(models.MaintenanceRequest.created_at.desc(), models.MaintenanceRequest.id.desc()).limit(500).all()
    return _out(db, rows)


@router.get("/mine", response_model=list[schemas.MaintenanceRequestOut])
def my_requests(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """The caller's own requests, newest first — the bell's "Your Request
    Updates" (100) and the Maintenance Requests page (up to 500)."""
    rows = (
        db.query(models.MaintenanceRequest)
        .filter(_mine(current_user), models.MaintenanceRequest.status.notin_(("Cancelled", "Scheduled")))
        .order_by(models.MaintenanceRequest.created_at.desc(), models.MaintenanceRequest.id.desc())
        .limit(max(1, min(limit, 500))).all()
    )
    return _out(db, rows)


@router.post("/mine/mark-seen")
def mark_mine_seen(db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    db.query(models.MaintenanceRequest).filter(
        _mine(current_user),
        models.MaintenanceRequest.status.in_(("Approved", "Rejected")),
        models.MaintenanceRequest.requester_seen_at.is_(None),
    ).update({"requester_seen_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.get("/{request_id}/proofs", response_model=list[schemas.MaintenanceRequestProofOut])
def list_request_proofs(request_id: int, db: Session = Depends(get_db)):
    _get(db, request_id)
    return (
        db.query(models.MaintenanceRequestProof)
        .filter(models.MaintenanceRequestProof.request_id == request_id)
        .order_by(models.MaintenanceRequestProof.kind.desc(), models.MaintenanceRequestProof.id)
        .all()
    )


@router.get("/{request_id}/proofs/{proof_id}")
def download_request_proof(request_id: int, proof_id: int, db: Session = Depends(get_db)):
    proof = (
        db.query(models.MaintenanceRequestProof)
        .filter(models.MaintenanceRequestProof.id == proof_id, models.MaintenanceRequestProof.request_id == request_id)
        .first()
    )
    if not proof:
        raise HTTPException(404, "Proof not found")
    mime = _proof_mime(proof.data) or ("application/pdf" if proof.kind == "pdf" else "application/octet-stream")
    return Response(
        content=proof.data,
        media_type=mime,
        headers={
            "Content-Disposition": f'inline; filename="{proof.file_name.replace(chr(34), "")}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


# ── Scheduled jobs (cost added later) ─────────────────────────────────────────

def _can_edit_scheduled(req: models.MaintenanceRequest, user: TokenUser) -> bool:
    return _is_submitter(req, user) or user.role in SCHEDULE_EDITOR_ROLES


@router.get("/scheduled", response_model=list[schemas.MaintenanceRequestOut])
def list_scheduled(
    truck_id: int | None = None,
    mine: bool = False,
    min_days: int = 0,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Jobs waiting for their cost, oldest first: a truck's (Scheduled
    Records), every truck's (warnings on Profitability and the Running Cost
    Calculator), or the caller's own waiting at least `min_days` (the bell)."""
    q = db.query(models.MaintenanceRequest).filter(models.MaintenanceRequest.status == "Scheduled")
    if truck_id is not None:
        q = q.filter(models.MaintenanceRequest.truck_id == truck_id)
    if mine:
        q = q.filter(_mine(current_user))
    rows = q.order_by(models.MaintenanceRequest.created_at, models.MaintenanceRequest.id).all()
    if min_days > 0:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=min_days)
        rows = [r for r in rows if r.created_at and r.created_at.replace(tzinfo=None) <= cutoff]
    return _out(db, rows)


@router.put("/{request_id}/costs", response_model=schemas.MaintenanceRequestOut)
def add_scheduled_costs(
    request_id: int,
    payload: schemas.MaintenanceRecordCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Scheduled Records → Add costs: the job, now with every repair's cost,
    goes to Maintenance Approvals. Its date stays the date of the work."""
    req = _get(db, request_id, lock=True)
    if req.status != "Scheduled":
        raise HTTPException(409, "This job isn't waiting for a cost any more.")
    if not _can_edit_scheduled(req, current_user):
        raise HTTPException(403, "Only the person who scheduled this job, Admin or Maintenance can add its costs.")
    if payload.truck_id != req.truck_id:
        raise HTTPException(400, "A scheduled job can't move to another truck.")
    payload = _prepared(db, payload, need_cost=True)
    req.payload = _payload_json(payload)
    req.status = "Pending"
    db.commit()
    db.refresh(req)
    _changed()
    return _out(db, [req])[0]


@router.delete("/{request_id}/scheduled", status_code=204)
def remove_scheduled(request_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """A scheduled job entered by mistake: the person who scheduled it, or Admin."""
    req = _get(db, request_id, lock=True)
    if req.status != "Scheduled":
        raise HTTPException(409, "This job isn't waiting for a cost any more.")
    if not _is_submitter(req, current_user) and current_user.role != "Admin":
        raise HTTPException(403, "Only the person who scheduled this job, or Admin, can remove it.")
    req.status = "Cancelled"
    db.query(models.MaintenanceRequestProof).filter(
        models.MaintenanceRequestProof.request_id == req.id
    ).delete(synchronize_session=False)
    db.commit()
    _changed()


# ── Decide (Admin / Accounts) ───────────────────────────────────────────────

@router.put("/{request_id}/approve", response_model=schemas.MaintenanceRequestOut)
def approve_request(request_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(approver)):
    """Creates the real record — it reaches the truck, costs, P&L, vendor
    records and reminders now — and moves the proof files onto it."""
    req = _get(db, request_id, lock=True)
    if req.status != "Pending":
        raise HTTPException(409, f"This request was already {req.status.lower()}.")
    payload = schemas.MaintenanceRecordCreate(**req.payload)
    record = create_record(
        db, payload,
        entered_by_name=req.submitted_by_name, actor_role=req.submitted_by_role,
        source=req.source, trip_id=req.trip_id,
    )
    proofs = db.query(models.MaintenanceRequestProof).filter(models.MaintenanceRequestProof.request_id == req.id).all()
    for p in proofs:
        db.add(models.MaintenanceProof(
            record_id=record.id, kind=p.kind, file_name=p.file_name, size_bytes=p.size_bytes,
            data=p.data, uploaded_by_name=p.uploaded_by_name, created_at=p.created_at,
        ))
        db.delete(p)
    req.status = "Approved"
    req.record_id = record.id
    req.decided_by_name = current_user.name
    req.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    emit("maintenance_updated", {})
    _changed()
    return _out(db, [req])[0]


@router.put("/{request_id}/reject", response_model=schemas.MaintenanceRequestOut)
def reject_request(
    request_id: int,
    body: schemas.MaintenanceRejectIn,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(approver),
):
    req = _get(db, request_id, lock=True)
    if req.status != "Pending":
        raise HTTPException(409, f"This request was already {req.status.lower()}.")
    req.status = "Rejected"
    req.reject_reason = body.reason
    req.decided_by_name = current_user.name
    req.decided_at = datetime.now(timezone.utc)
    # The files aren't needed any more — a resubmission brings its own.
    db.query(models.MaintenanceRequestProof).filter(
        models.MaintenanceRequestProof.request_id == req.id
    ).delete(synchronize_session=False)
    db.commit()
    db.refresh(req)
    _changed()
    return _out(db, [req])[0]


# ── Re-verification (the submitter fixes a rejected request) ────────────────

@router.put("/{request_id}/resubmit", response_model=schemas.MaintenanceRequestOut)
def resubmit_request(
    request_id: int,
    payload: schemas.MaintenanceRecordCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Maintenance Requests → Submit for Re-Verification: the person who
    submitted a rejected request sends it back, edited, to Maintenance
    Approvals. Checked like a new record; its proof files (removed on
    rejection) are uploaded again afterwards. The same request goes back to
    Pending, so its history stays in one place."""
    req = _get(db, request_id, lock=True)
    if req.status != "Rejected":
        raise HTTPException(409, "Only a rejected request can be sent for re-verification.")
    if not _is_submitter(req, current_user):
        raise HTTPException(403, "Only the person who submitted this request can send it for re-verification.")
    if payload.truck_id != req.truck_id:
        raise HTTPException(400, "A request can't move to another truck.")
    payload = _prepared(db, payload, need_cost=True)
    req.payload = _payload_json(payload)
    req.previous_reject_reason = req.reject_reason
    req.reject_reason = None
    req.decided_by_name = None
    req.decided_at = None
    req.requester_seen_at = None
    req.resubmit_count = (req.resubmit_count or 0) + 1
    req.resubmitted_at = datetime.now(timezone.utc)
    req.status = "Pending"
    db.commit()
    db.refresh(req)
    _changed()
    return _out(db, [req])[0]


# ── Trip Sheet → Major Repairs ──────────────────────────────────────────────

def _line_sig(fields: dict) -> str:
    """Fingerprint of one repair line as it would be recorded."""
    key = json.dumps(
        [fields["maintenance_type"], fields["date"], int(fields["odometer"]),
         f"{float(fields['cost'] or 0):.2f}", fields["description"] or ""],
        separators=(",", ":"),
    )
    return hashlib.sha1(key.encode()).hexdigest()


def sync_trip_repairs(db: Session, trip: models.Trip, truck: models.Truck, lines: list[dict], user: TokenUser) -> None:
    """Called on every save of a trip sheet with its repair lines (already
    resolved to record fields). Instead of deleting and re-creating the
    trip's records each time:

    - a line already submitted (pending, approved or rejected) is left alone;
    - a new or changed line becomes a new request;
    - a line taken off the sheet cancels its pending request, or removes its
      record if it was already approved (as re-saving always did).

    Records from before approvals existed have no request — they're matched
    by their own fields. Doesn't commit."""
    wanted: dict[str, list[dict]] = {}
    for f in lines:
        wanted.setdefault(_line_sig(f), []).append(f)

    def take(sig: str) -> bool:
        bucket = wanted.get(sig)
        if bucket:
            bucket.pop()
            return True
        return False

    requests = (
        db.query(models.MaintenanceRequest)
        .filter(models.MaintenanceRequest.trip_id == trip.id,
                models.MaintenanceRequest.source == "Trip Sheet",
                models.MaintenanceRequest.status != "Cancelled")
        .with_for_update().all()
    )
    tracked_records = {r.record_id for r in requests if r.record_id}
    for r in requests:
        if take(r.line_sig):
            continue
        if r.status == "Pending":
            r.status = "Cancelled"
            r.decided_at = datetime.now(timezone.utc)
            r.decided_by_name = user.name
            r.reject_reason = "Removed or changed on the trip sheet."
        elif r.status == "Approved":
            if r.record_id:
                rec = db.get(models.MaintenanceRecord, r.record_id)
                if rec:
                    db.delete(rec)
            r.status = "Cancelled"
            r.reject_reason = "Removed or changed on the trip sheet after approval."
        # Rejected lines that are no longer on the sheet just stay rejected.

    # Records created before approvals existed (no request behind them).
    for rec in db.query(models.MaintenanceRecord).filter(models.MaintenanceRecord.trip_id == trip.id).all():
        if rec.id in tracked_records:
            continue
        sig = _line_sig({
            "maintenance_type": rec.maintenance_type, "date": rec.date.isoformat(),
            "odometer": rec.odometer, "cost": rec.cost, "description": rec.description,
        })
        if not take(sig):
            db.delete(rec)

    for sig, bucket in wanted.items():
        for f in bucket:
            payload = schemas.MaintenanceRecordCreate(
                truck_id=truck.id, date=date.fromisoformat(f["date"]), odometer=int(f["odometer"]),
                maintenance_type=f["maintenance_type"], description=f["description"], cost=f["cost"],
            )
            db.add(models.MaintenanceRequest(
                truck_id=truck.id, trip_id=trip.id, source="Trip Sheet", line_sig=sig,
                payload=_payload_json(payload), status="Pending",
                submitted_by_id=user.id, submitted_by_name=user.name, submitted_by_role=user.role,
            ))
