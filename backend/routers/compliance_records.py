"""
Truck compliance document history (RC, FC, Road Tax, Insurance, permits, PUC).

Every document a truck has held is a TruckComplianceRecord row: its first
entry (Add Truck, or the existing data at migration), then one row per
renewal. Nothing is overwritten, so Our Fleet → Compliance History can show
every past document with its cost and file.

  Renew   (Compliance & Renewals) — a NEW row; the previous one keeps its file.
  Correct (Compliance & Renewals) — fixes a mistake on the LATEST row, noting
                                    what was changed. Not a renewal.

The truck's own compliance columns always mirror the latest row, so every
existing reader (expiry alerts, cards, Running Cost, exports) is unchanged.
The latest row's file lives on the truck (the same column it always has);
a row only gets its own file_blob once a renewal supersedes it.
"""
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session, undefer

import models
from audit import record_audit
from database import get_db
from security import TokenUser, get_current_user, require_roles
from websocket_manager import emit
from routers.files import MAX_FILE_SIZE, ALLOWED_UPLOAD_MIMES, IMAGE_MIMES, _sniff_mime, _require_file_token

router = APIRouter(prefix="/compliance-records", tags=["Compliance Records"])
# File download — public route (opened by <img>/fetch with ?token=); auth done inside.
file_router = APIRouter(prefix="/compliance-records", tags=["Compliance Records"])

# Compliance & Renewals is open to these roles (Admin always passes).
MANAGERS = ("Commercial Manager", "Assistant Commercial Manager")

# doc key → the truck columns that hold its CURRENT values.
#   history: ComplianceUpdateHistory.document_type (Running Cost's issue-date anchor)
#   issue:   the truck's issue-date column, where one exists
DOCS: dict[str, dict] = {
    "rc":              {"label": "RC", "history": "RC", "date": "rc_validity_date", "expense": "rc_expenses",
                        "file": "rc_document_url", "blob": "rc_document_blob", "number": None, "issue": "rc_date"},
    "fc":              {"label": "FC (Fitness Certificate)", "history": "FC (Fitness Certificate)", "date": "fc_expiry_date",
                        "expense": "fc_expenses", "file": "fc_document_file_name", "blob": "fc_document_blob",
                        "number": None, "issue": "fc_date"},
    "road_tax":        {"label": "Road Tax", "history": "Road Tax", "date": "road_tax_date", "expense": "road_tax_expenses",
                        "file": "road_tax_document_file_name", "blob": "road_tax_document_blob",
                        "number": "road_tax_number", "issue": None},
    "insurance":       {"label": "Insurance", "history": "Insurance", "date": "insurance_expiry_date",
                        "expense": "insurance_expenses", "file": "insurance_document_proof_file_name",
                        "blob": "insurance_document_proof_blob", "number": None, "issue": None},
    "national_permit": {"label": "National Permit", "history": "National Permit", "date": "national_permit_date",
                        "expense": "national_permit_expenses", "file": "national_permit_proof_file_name",
                        "blob": "national_permit_proof_blob", "number": "national_permit_number", "issue": None},
    "local_permit":    {"label": "Local Permit", "history": "Local Permit", "date": "local_permit_date",
                        "expense": "local_permit_expenses", "file": "local_permit_proof_file_name",
                        "blob": "local_permit_proof_blob", "number": "local_permit_number", "issue": None},
    "pollution_cert":  {"label": "Pollution Certificate", "history": "Pollution Certificate",
                        "date": "pollution_certificate_date", "expense": "pollution_certificate_expenses",
                        "file": "pollution_certificate_proof_file_name", "blob": "pollution_certificate_blob",
                        "number": "pollution_certificate_number", "issue": None},
}

# Every truck column a document owns — Edit Truck may not change these any more
# (see routers/trucks.py update_truck); only Renew / Correct here can.
COMPLIANCE_TRUCK_FIELDS = {
    col for d in DOCS.values() for col in (d["date"], d["expense"], d["file"], d["number"], d["issue"]) if col
}


def _doc(doc_type: str) -> dict:
    spec = DOCS.get(doc_type)
    if spec is None:
        raise HTTPException(404, f"Unknown document: {doc_type}")
    return spec


def _has_data(truck: models.Truck, spec: dict) -> bool:
    return any(
        getattr(truck, spec[k]) not in (None, "", 0)
        for k in ("date", "expense", "file", "number") if spec[k]
    )


def _latest(db: Session, truck_id: int, doc_type: str) -> Optional[models.TruckComplianceRecord]:
    return (
        db.query(models.TruckComplianceRecord)
        .filter_by(truck_id=truck_id, doc_type=doc_type)
        .order_by(models.TruckComplianceRecord.id.desc())
        .first()
    )


def seed_first_entries(db: Session, truck: models.Truck, actor_name: str,
                       history_dates: Optional[dict[str, datetime]] = None) -> int:
    """Give `truck` a "First entry" row for every document it has data for but
    no record yet. Used by Add Truck and by the startup migration. Doesn't
    commit. Returns how many rows were added."""
    have = {r[0] for r in db.query(models.TruckComplianceRecord.doc_type).filter_by(truck_id=truck.id).distinct()}
    added = 0
    for key, spec in DOCS.items():
        if key in have or not _has_data(truck, spec):
            continue
        # When the document was recorded — its first ComplianceUpdateHistory entry.
        anchor = (history_dates or {}).get(spec["history"])
        issue = getattr(truck, spec["issue"]) if spec["issue"] else None
        db.add(models.TruckComplianceRecord(
            truck_id=truck.id, doc_type=key, kind="First entry",
            doc_number=getattr(truck, spec["number"]) if spec["number"] else None,
            valid_from=issue,  # unknown unless the truck has an issue date
            valid_until=getattr(truck, spec["date"]),
            expense=getattr(truck, spec["expense"]),
            file_name=getattr(truck, spec["file"]),
            created_by_name=actor_name,
            created_at=anchor or datetime.now(timezone.utc),
        ))
        added += 1
    return added


def _parse_date(value: Optional[str], label: str, required: bool = False) -> Optional[date]:
    if not value:
        if required:
            raise HTTPException(400, f"{label} is required.")
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"{label} is not a valid date.")


def _parse_amount(value: Optional[str]) -> Optional[Decimal]:
    if value in (None, ""):
        return None
    try:
        amount = Decimal(value)
    except InvalidOperation:
        raise HTTPException(400, "Cost must be a number.")
    if amount < 0:
        raise HTTPException(400, "Cost can't be negative.")
    return amount


async def _read_upload(file: Optional[UploadFile]) -> Optional[bytes]:
    if file is None or not file.filename:
        return None
    data = await file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large. The maximum allowed size is 25 MB.")
    if _sniff_mime(data) not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(415, "Unsupported file type. Only PDF, JPG, PNG, WEBP or GIF files are allowed.")
    return data


def _locked_truck(db: Session, truck_id: int) -> models.Truck:
    truck = db.query(models.Truck).with_for_update().filter(models.Truck.id == truck_id).first()
    if truck is None:
        raise HTTPException(404, "Truck not found")
    if truck.deleted_at is not None:
        raise HTTPException(400, "This truck has been removed from the fleet.")
    return truck


def _fmt_date(d: Optional[date]) -> str:
    return d.strftime("%d-%m-%Y") if d else "—"


def _fmt_amount(a) -> str:
    return f"₹{float(a):,.2f}" if a not in (None, "") else "—"


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

@router.get("/truck/{truck_id}")
def list_truck_records(truck_id: int, db: Session = Depends(get_db)):
    """Every document this truck has held, newest first per document, with
    which one is current. Includes removed trucks (history stays readable)."""
    truck = db.get(models.Truck, truck_id)
    if truck is None:
        raise HTTPException(404, "Truck not found")
    rows = (
        db.query(models.TruckComplianceRecord)
        .filter_by(truck_id=truck_id)
        .order_by(models.TruckComplianceRecord.id.desc())
        .all()
    )
    # Which rows have a stored file, without loading the bytes.
    stored = {
        rid for (rid,) in db.query(models.TruckComplianceRecord.id)
        .filter(models.TruckComplianceRecord.truck_id == truck_id, models.TruckComplianceRecord.file_blob.isnot(None))
    }
    truck_has_file = {
        key: bool(db.query(getattr(models.Truck, spec["blob"]).isnot(None)).filter(models.Truck.id == truck_id).scalar())
        for key, spec in DOCS.items()
    }
    current_ids: dict[str, int] = {}
    for r in rows:
        current_ids.setdefault(r.doc_type, r.id)

    out = []
    for r in rows:
        is_current = current_ids.get(r.doc_type) == r.id
        spec = DOCS.get(r.doc_type)
        if spec is None:
            continue
        out.append({
            "id": r.id,
            "doc_type": r.doc_type,
            "doc_label": spec["label"],
            "kind": r.kind,
            "is_current": is_current,
            "doc_number": r.doc_number,
            "valid_from": r.valid_from,
            "valid_until": r.valid_until,
            "expense": float(r.expense) if r.expense is not None else None,
            # The current row's file is the truck's own (always up to date).
            "file_name": getattr(truck, spec["file"]) if is_current else r.file_name,
            "has_file": truck_has_file[r.doc_type] if is_current else r.id in stored,
            "created_by_name": r.created_by_name,
            "created_at": r.created_at,
            "corrected_by_name": r.corrected_by_name,
            "corrected_at": r.corrected_at,
            "correction_note": r.correction_note,
        })
    return out


@router.get("/truck/{truck_id}/log")
def truck_compliance_log(truck_id: int, db: Session = Depends(get_db)):
    """Everything that happened to this truck's documents, newest first —
    documents added / renewed / updated, corrections, removed files and undone
    renewals (Compliance & Renewals → View Updation History)."""
    by_history = {spec["history"]: key for key, spec in DOCS.items()}
    rows = (
        db.query(models.ComplianceUpdateHistory)
        .filter(models.ComplianceUpdateHistory.truck_id == truck_id)
        .order_by(models.ComplianceUpdateHistory.updated_at.desc(), models.ComplianceUpdateHistory.id.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "doc_type": by_history.get(r.document_type),
            "document_type": r.document_type,
            "action": r.action,
            "note": r.note,
            "actor_name": r.updated_by_name,
            "created_at": r.updated_at,
        }
        for r in rows
    ]


@file_router.get("/{record_id}/file")
def get_record_file(record_id: int, request: Request, db: Session = Depends(get_db)):
    payload = _require_file_token(request)
    rec = (
        db.query(models.TruckComplianceRecord)
        .options(undefer(models.TruckComplianceRecord.file_blob))
        .filter(models.TruckComplianceRecord.id == record_id)
        .first()
    )
    if rec is None:
        raise HTTPException(404, "Record not found")
    spec = _doc(rec.doc_type)
    latest = _latest(db, rec.truck_id, rec.doc_type)
    if latest is not None and latest.id == rec.id:
        truck = db.get(models.Truck, rec.truck_id)
        data, filename = getattr(truck, spec["blob"]), getattr(truck, spec["file"])
    else:
        data, filename = rec.file_blob, rec.file_name
    if not data:
        raise HTTPException(404, "No file stored for this document")
    record_audit(
        "file.download", request=request,
        actor_id=(int(payload["sub"]) if str(payload.get("sub", "")).isdigit() else None),
        actor_name=payload.get("name"), actor_role=payload.get("role"),
        resource=f"compliance-records/{record_id}",
    )
    mime = _sniff_mime(data) or "application/octet-stream"
    disposition = "inline" if mime in IMAGE_MIMES else "attachment"
    safe_name = (filename or f"{rec.doc_type}.bin").replace('"', "")
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": f'{disposition}; filename="{safe_name}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


# ---------------------------------------------------------------------------
# Renew / Correct  (Compliance & Renewals)
# ---------------------------------------------------------------------------

@router.post("/truck/{truck_id}/{doc_type}/renew")
async def renew_document(
    truck_id: int,
    doc_type: str,
    valid_until: str = Form(...),
    valid_from: Optional[str] = Form(None),
    expense: Optional[str] = Form(None),
    doc_number: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles(*MANAGERS)),
):
    """A new document replaces the current one. The current one is kept as
    history, with its own file."""
    spec = _doc(doc_type)
    until = _parse_date(valid_until, "New validity date", required=True)
    start = _parse_date(valid_from, "Valid from")
    if start and until and start >= until:
        raise HTTPException(400, "Valid from must be before the validity date.")
    amount = _parse_amount(expense)
    data = await _read_upload(file)
    number = (doc_number or "").strip() or None

    truck = _locked_truck(db, truck_id)
    actor = current_user.name or "Unknown"
    # A truck saved before this feature with no first entry yet.
    seed_first_entries(db, truck, actor)
    db.flush()

    prev = _latest(db, truck.id, doc_type)
    if prev is not None:
        # The superseded document takes its file with it.
        prev.file_blob = getattr(truck, spec["blob"])
        prev.file_name = getattr(truck, spec["file"])

    now = datetime.now(timezone.utc)
    if spec["number"] and number is None:
        number = getattr(truck, spec["number"])  # same number unless a new one is given
    db.add(models.TruckComplianceRecord(
        truck_id=truck.id, doc_type=doc_type, kind="Renewal" if prev is not None else "First entry",
        doc_number=number if spec["number"] else None,
        valid_from=start, valid_until=until, expense=amount,
        file_name=file.filename if data else None,
        created_by_name=actor, created_at=now,
    ))

    setattr(truck, spec["date"], until)
    setattr(truck, spec["expense"], amount)
    setattr(truck, spec["file"], file.filename if data else None)
    setattr(truck, spec["blob"], data)
    if spec["number"]:
        setattr(truck, spec["number"], number)
    if spec["issue"]:
        # Profitability amortises RC / FC from this issue date — never leave it
        # blank: without a Valid From the new document counts from today.
        setattr(truck, spec["issue"], start or now.date())
    truck.version = (truck.version or 1) + 1

    # Running Cost's issue-date anchor + the page's Edit History log.
    db.add(models.ComplianceUpdateHistory(
        truck_id=truck.id, document_type=spec["history"], updated_at=now, updated_by_name=actor,
    ))
    db.commit()
    emit("truck_updated", {"id": truck.id})
    return {"ok": True}


@router.post("/truck/{truck_id}/{doc_type}/correct")
async def correct_document(
    truck_id: int,
    doc_type: str,
    valid_until: Optional[str] = Form(None),
    valid_from: Optional[str] = Form(None),
    expense: Optional[str] = Form(None),
    doc_number: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    remove_file: bool = Form(False),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles(*MANAGERS)),
):
    """Fix a mistake on the CURRENT document (wrong date, cost, number or
    file — or remove a wrong file without a replacement). Doesn't create a
    renewal; the row records what was changed."""
    spec = _doc(doc_type)
    until = _parse_date(valid_until, "Validity date")
    start = _parse_date(valid_from, "Valid from")
    if start and until and start >= until:
        raise HTTPException(400, "Valid from must be before the validity date.")
    amount = _parse_amount(expense)
    data = await _read_upload(file)
    if data and remove_file:
        raise HTTPException(400, "Either attach the right file or remove the current one — not both.")
    number = (doc_number or "").strip() or None

    truck = _locked_truck(db, truck_id)
    actor = current_user.name or "Unknown"
    seed_first_entries(db, truck, actor)
    db.flush()
    rec = _latest(db, truck.id, doc_type)
    if rec is None:
        raise HTTPException(400, f"This truck has no {spec['label']} on record yet — use Renew to add one.")

    changes = []
    if rec.valid_until != until:
        changes.append(f"Validity {_fmt_date(rec.valid_until)} → {_fmt_date(until)}")
    if rec.valid_from != start:
        changes.append(f"Valid from {_fmt_date(rec.valid_from)} → {_fmt_date(start)}")
    old_amount = Decimal(rec.expense) if rec.expense is not None else None
    if old_amount != amount:
        changes.append(f"Cost {_fmt_amount(old_amount)} → {_fmt_amount(amount)}")
    if spec["number"] and (rec.doc_number or None) != number:
        changes.append(f"Number {rec.doc_number or '—'} → {number or '—'}")
    if data:
        changes.append(f"File replaced ({getattr(truck, spec['file']) or 'none'} → {file.filename})")
    if remove_file:
        if getattr(truck, spec["blob"]) is None and not getattr(truck, spec["file"]):
            raise HTTPException(400, "This document has no file to remove.")
        changes.append(f"File removed ({getattr(truck, spec['file']) or 'unnamed'})")
    if not changes:
        raise HTTPException(400, "Nothing was changed.")

    rec.valid_until, rec.valid_from, rec.expense = until, start, amount
    if spec["number"]:
        rec.doc_number = number
        setattr(truck, spec["number"], number)
    setattr(truck, spec["date"], until)
    setattr(truck, spec["expense"], amount)
    if spec["issue"] and start:
        setattr(truck, spec["issue"], start)
    if data or remove_file:
        rec.file_name = file.filename if data else None
        setattr(truck, spec["file"], file.filename if data else None)
        setattr(truck, spec["blob"], data)
    truck.version = (truck.version or 1) + 1

    note = (note or "").strip()
    entry = "; ".join(changes) + (f" — {note}" if note else "")
    rec.correction_note = f"{rec.correction_note}\n{entry}" if rec.correction_note else entry
    rec.corrected_by_name = actor
    rec.corrected_at = datetime.now(timezone.utc)
    db.add(models.ComplianceUpdateHistory(
        truck_id=truck.id, document_type=spec["history"], updated_at=rec.corrected_at,
        updated_by_name=actor, action="Corrected", note=entry,
    ))
    db.commit()
    emit("truck_updated", {"id": truck.id})
    return {"ok": True}


@router.post("/truck/{truck_id}/{doc_type}/undo-renewal")
def undo_renewal(
    truck_id: int,
    doc_type: str,
    reason: str = Form(...),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles()),  # Admin only
):
    """A renewal entered by mistake: delete it (file included) and make the
    previous document current again — its date, cost, number and file — as if
    the renewal never happened. Only the LATEST renewal can be undone, so older
    history can't be rewritten."""
    spec = _doc(doc_type)
    reason = (reason or "").strip()
    if not reason:
        raise HTTPException(400, "Please give a reason for undoing this renewal.")
    truck = _locked_truck(db, truck_id)
    rows = (
        db.query(models.TruckComplianceRecord)
        .options(undefer(models.TruckComplianceRecord.file_blob))
        .filter_by(truck_id=truck.id, doc_type=doc_type)
        .order_by(models.TruckComplianceRecord.id.desc())
        .limit(2)
        .all()
    )
    if len(rows) < 2 or rows[0].kind != "Renewal":
        raise HTTPException(400, f"The current {spec['label']} isn't a renewal, so there's nothing to undo.")
    wrong, prev = rows

    # The previous document becomes current again; its file moves back onto the truck.
    setattr(truck, spec["date"], prev.valid_until)
    setattr(truck, spec["expense"], prev.expense)
    setattr(truck, spec["file"], prev.file_name)
    setattr(truck, spec["blob"], prev.file_blob)
    if spec["number"]:
        setattr(truck, spec["number"], prev.doc_number)
    if spec["issue"] and prev.valid_from:
        setattr(truck, spec["issue"], prev.valid_from)
    prev.file_blob = None
    truck.version = (truck.version or 1) + 1

    # Drop the renewal's Running Cost anchor so the previous one applies again.
    anchor = (
        db.query(models.ComplianceUpdateHistory)
        .filter(
            models.ComplianceUpdateHistory.truck_id == truck.id,
            models.ComplianceUpdateHistory.document_type == spec["history"],
            models.ComplianceUpdateHistory.action.is_(None),
        )
        .order_by(models.ComplianceUpdateHistory.updated_at.desc(), models.ComplianceUpdateHistory.id.desc())
        .first()
    )
    if anchor is not None:
        db.delete(anchor)

    summary = (
        f"Undid the renewal valid until {_fmt_date(wrong.valid_until)} (cost {_fmt_amount(wrong.expense)}"
        f"{', file ' + wrong.file_name if wrong.file_name else ''}, entered by {wrong.created_by_name}). "
        f"Back to the one valid until {_fmt_date(prev.valid_until)}. Reason: {reason}"
    )
    db.delete(wrong)
    db.add(models.ComplianceUpdateHistory(
        truck_id=truck.id, document_type=spec["history"], updated_at=datetime.now(timezone.utc),
        updated_by_name=current_user.name or "Unknown", action="Renewal undone", note=summary,
    ))
    db.commit()
    emit("truck_updated", {"id": truck.id})
    return {"ok": True}
