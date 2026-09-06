from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user, TokenUser, require_roles
import models, schemas
from duplicate_checks import check_vendor_duplicates
from websocket_manager import emit

router = APIRouter(prefix="/vendors", tags=["Vendors"])


@router.get("", response_model=list[schemas.VendorOut])
def list_vendors(db: Session = Depends(get_db)):
    return db.query(models.Vendor).filter(models.Vendor.deleted_at.is_(None)).order_by(models.Vendor.name).all()


@router.post("", response_model=schemas.VendorOut, status_code=201)
def create_vendor(payload: schemas.VendorCreate, db: Session = Depends(get_db)):
    check_vendor_duplicates(db, payload)
    vendor = models.Vendor(**payload.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    emit("vendor_updated", {})
    return vendor


@router.get("/deleted-ids", dependencies=[Depends(require_roles())])
def list_deleted_vendor_ids(db: Session = Depends(get_db)):
    """Admin only: ids of vendors currently soft-deleted. Lets the "Archive" page
    (which lists from the deletion_approval_requests audit trail) tell apart a
    still-deleted vendor from one that was since restored, same pattern as
    trips.py's list_deleted_trip_ids. Registered before GET /{vendor_id} so
    "deleted-ids" isn't swallowed as a vendor_id path param."""
    rows = db.query(models.Vendor.id).filter(models.Vendor.deleted_at.isnot(None)).all()
    return [i for (i,) in rows]


@router.get("/{vendor_id}", response_model=schemas.VendorOut)
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.get(models.Vendor, vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    return vendor


@router.put("/{vendor_id}", response_model=schemas.VendorOut)
def update_vendor(vendor_id: int, payload: schemas.VendorUpdate, db: Session = Depends(get_db)):
    check_vendor_duplicates(db, payload, exclude_id=vendor_id)
    vendor = db.query(models.Vendor).with_for_update().filter(models.Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if payload.client_version is not None and vendor.version != payload.client_version:
        raise HTTPException(
            409,
            "This vendor record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(vendor, field, value)
    vendor.version = (vendor.version or 1) + 1
    db.commit()
    db.refresh(vendor)
    emit("vendor_updated", {})
    return vendor


@router.delete("/{vendor_id}", status_code=204, dependencies=[Depends(require_roles())])
def delete_vendor(vendor_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: soft-delete a vendor (hides them from "Our Vendors", keeps any
    historical reference to them intact and still resolvable). A self-approved
    DeletionApprovalRequest row is logged for audit visibility, same pattern as
    drivers.py's delete_driver."""
    vendor = db.get(models.Vendor, vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if vendor.deleted_at is not None:
        raise HTTPException(409, "Vendor is already deleted")
    now = datetime.now(timezone.utc)
    vendor.deleted_at = now
    if current_user.id is not None:
        db.add(models.DeletionApprovalRequest(
            resource_type="Vendor",
            resource_id=vendor_id,
            resource_name=vendor.name,
            requested_by_staff_id=current_user.id,
            requested_by_name=current_user.name,
            reason="Deleted directly by Admin — no approval required.",
            status="Approved",
            approved_by_name=current_user.name,
            approved_at=now,
        ))
    db.commit()
    emit("vendor_updated", {})


@router.post("/{vendor_id}/restore", response_model=schemas.VendorOut, dependencies=[Depends(require_roles())])
def restore_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Admin only: undo a soft-delete — the vendor reappears in Our Vendors
    exactly as they were."""
    vendor = db.get(models.Vendor, vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if vendor.deleted_at is None:
        raise HTTPException(409, "Vendor is not deleted")
    vendor.deleted_at = None
    db.commit()
    db.refresh(vendor)
    emit("vendor_updated", {})
    return vendor


@router.delete("/{vendor_id}/permanent", status_code=204, dependencies=[Depends(require_roles())])
def permanently_delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Admin only: irreversibly delete an already soft-deleted vendor. Only
    reachable from the "Archive" page."""
    vendor = db.get(models.Vendor, vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    db.delete(vendor)
    db.commit()
    emit("vendor_updated", {})
