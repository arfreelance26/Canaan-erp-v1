from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from database import get_db
import models, schemas

router = APIRouter(prefix="/staff", tags=["Staff"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("", response_model=list[schemas.StaffOut])
def list_staff(db: Session = Depends(get_db)):
    return db.query(models.Staff).order_by(models.Staff.staff_id).all()


@router.post("", response_model=schemas.StaffOut, status_code=201)
def create_staff(payload: schemas.StaffCreate, db: Session = Depends(get_db)):
    if db.query(models.Staff).filter(models.Staff.staff_id == payload.staff_id).first():
        raise HTTPException(400, f"Staff ID {payload.staff_id} already exists")
    data = payload.model_dump()
    data["password_hash"] = pwd_ctx.hash(data.pop("password"))
    member = models.Staff(**data)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.get("/{staff_id}", response_model=schemas.StaffOut)
def get_staff(staff_id: int, db: Session = Depends(get_db)):
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    return member


@router.put("/{staff_id}", response_model=schemas.StaffOut)
def update_staff(staff_id: int, payload: schemas.StaffUpdate, db: Session = Depends(get_db)):
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    data = payload.model_dump(exclude_none=True)
    if "password" in data:
        data["password_hash"] = pwd_ctx.hash(data.pop("password"))
    for field, value in data.items():
        setattr(member, field, value)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{staff_id}", status_code=204)
def delete_staff(staff_id: int, db: Session = Depends(get_db)):
    member = db.get(models.Staff, staff_id)
    if not member:
        raise HTTPException(404, "Staff member not found")
    db.delete(member)
    db.commit()
