"""The CFS/yard directory behind TripFormDialog's "View All CFS" / "View All
Yard" (Route Information, when "Use Yard/CFS instead of Routes" is on).
Seeded once from the lists that used to be hardcoded in lib/lane-places.ts
(see main.py's startup seed) — Admin-editable from here on, same pattern as
Maintenance Types. Deletion is soft (deleted_at) so an approved deletion
lands on the "Archive" page with Restore / Permanently Delete, same as
Driver/Truck/Staff/Customer/Vendor — see deletion_approvals.py's
approve_deletion and resources/archive/page.tsx."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from security import get_current_user, require_roles, TokenUser

router = APIRouter(prefix="/cfs-yard", tags=["CFS/Yard"])


@router.get("", response_model=list[schemas.CfsYardEntryOut])
def list_entries(db: Session = Depends(get_db)):
    return (
        db.query(models.CfsYardEntry)
        .filter(models.CfsYardEntry.deleted_at.is_(None))
        .order_by(models.CfsYardEntry.kind, models.CfsYardEntry.name)
        .all()
    )


@router.get("/deleted-ids", response_model=list[int])
def list_deleted_ids(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles()),  # Admin only
):
    """IDs currently soft-deleted — the Archive page cross-checks this against
    its own Approved-deletion history to decide what's "currently archived"."""
    rows = db.query(models.CfsYardEntry.id).filter(models.CfsYardEntry.deleted_at.isnot(None)).all()
    return [i for (i,) in rows]


@router.post("", response_model=schemas.CfsYardEntryOut, status_code=201)
def create_entry(
    payload: schemas.CfsYardEntryCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name is required.")
    if db.query(models.CfsYardEntry).filter(
        models.CfsYardEntry.kind == payload.kind,
        models.CfsYardEntry.name == name,
        models.CfsYardEntry.deleted_at.is_(None),
    ).first():
        raise HTTPException(400, f"'{name}' already exists.")
    record = models.CfsYardEntry(kind=payload.kind, name=name)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{entry_id}", response_model=schemas.CfsYardEntryOut)
def update_entry(
    entry_id: int,
    payload: schemas.CfsYardEntryUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.query(models.CfsYardEntry).with_for_update().filter(models.CfsYardEntry.id == entry_id).first()
    if not record:
        raise HTTPException(404, "Entry not found.")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This entry was modified by someone else while you were editing. "
            "Please refresh and try again.",
        )
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "Name is required.")
        if db.query(models.CfsYardEntry).filter(
            models.CfsYardEntry.kind == record.kind,
            models.CfsYardEntry.name == name,
            models.CfsYardEntry.id != entry_id,
            models.CfsYardEntry.deleted_at.is_(None),
        ).first():
            raise HTTPException(400, f"'{name}' already exists.")
        record.name = name
    record.version = (record.version or 1) + 1
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{entry_id}", status_code=204, dependencies=[Depends(require_roles())])
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin only: soft-deletes an entry directly (recoverable from the
    Archive page). Every other role must file a DeletionApprovalRequest via
    POST /deletion-approvals instead, reviewed on the "Deletion Approvals"
    page — see deletion_approvals.py's approve_deletion, which performs the
    same soft delete once an Admin approves. A self-approved
    DeletionApprovalRequest row is logged here for audit visibility, same
    pattern as vendors.py's delete_vendor."""
    record = db.get(models.CfsYardEntry, entry_id)
    if not record or record.deleted_at is not None:
        raise HTTPException(404, "Entry not found.")
    now = datetime.now(timezone.utc)
    db.add(models.DeletionApprovalRequest(
        resource_type="CfsYardEntry",
        resource_id=entry_id,
        resource_name=f"{record.kind} — {record.name}",
        requested_by_staff_id=current_user.id or 0,
        requested_by_name=current_user.name,
        reason="Deleted directly by Admin — no approval required.",
        status="Approved",
        approved_by_name=current_user.name,
        approved_at=now,
    ))
    record.deleted_at = now
    db.commit()


@router.post("/{entry_id}/restore", response_model=schemas.CfsYardEntryOut)
def restore_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles()),  # Admin only
):
    record = db.get(models.CfsYardEntry, entry_id)
    if not record or record.deleted_at is None:
        raise HTTPException(404, "Entry not found in the archive.")
    if db.query(models.CfsYardEntry).filter(
        models.CfsYardEntry.kind == record.kind,
        models.CfsYardEntry.name == record.name,
        models.CfsYardEntry.id != entry_id,
        models.CfsYardEntry.deleted_at.is_(None),
    ).first():
        raise HTTPException(400, f"'{record.name}' already exists — rename before restoring.")
    record.deleted_at = None
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{entry_id}/permanent", status_code=204, dependencies=[Depends(require_roles())])
def permanently_delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
):
    record = db.get(models.CfsYardEntry, entry_id)
    if not record or record.deleted_at is None:
        raise HTTPException(404, "Entry not found in the archive.")
    db.delete(record)
    db.commit()
