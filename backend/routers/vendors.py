from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from duplicate_checks import check_vendor_duplicates
from websocket_manager import emit

router = APIRouter(prefix="/vendors", tags=["Vendors"])


@router.get("", response_model=list[schemas.VendorOut])
def list_vendors(db: Session = Depends(get_db)):
    return db.query(models.Vendor).order_by(models.Vendor.name).all()


@router.post("", response_model=schemas.VendorOut, status_code=201)
def create_vendor(payload: schemas.VendorCreate, db: Session = Depends(get_db)):
    check_vendor_duplicates(db, payload)
    vendor = models.Vendor(**payload.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    emit("vendor_updated", {})
    return vendor


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


@router.delete("/{vendor_id}", status_code=204)
def delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.get(models.Vendor, vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    db.delete(vendor)
    db.commit()
    emit("vendor_updated", {})
