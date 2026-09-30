from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from security import require_roles
import models, schemas

router = APIRouter(prefix="/vendor-categories", tags=["Vendor Categories"])


@router.get("", response_model=list[schemas.VendorCategoryOut])
def list_vendor_categories(db: Session = Depends(get_db)):
    return db.query(models.VendorCategory).order_by(models.VendorCategory.name).all()


@router.post("", response_model=schemas.VendorCategoryOut, status_code=201, dependencies=[Depends(require_roles())])
def create_vendor_category(payload: schemas.VendorCategoryCreate, db: Session = Depends(get_db)):
    if db.query(models.VendorCategory).filter(models.VendorCategory.name == payload.name).first():
        raise HTTPException(400, f"Vendor category '{payload.name}' already exists")
    record = models.VendorCategory(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{vendor_category_id}", status_code=204, dependencies=[Depends(require_roles())])
def delete_vendor_category(vendor_category_id: int, db: Session = Depends(get_db)):
    record = db.get(models.VendorCategory, vendor_category_id)
    if not record:
        raise HTTPException(404, "Vendor category not found")
    db.delete(record)
    db.commit()
