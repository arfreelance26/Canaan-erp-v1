from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from database import get_db
import models, schemas

router = APIRouter(prefix="/drivers", tags=["Drivers"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("", response_model=list[schemas.DriverOut])
def list_drivers(db: Session = Depends(get_db)):
    return db.query(models.Driver).order_by(models.Driver.driver_id).all()


@router.post("", response_model=schemas.DriverOut, status_code=201)
def create_driver(payload: schemas.DriverCreate, db: Session = Depends(get_db)):
    if db.query(models.Driver).filter(models.Driver.driver_id == payload.driver_id).first():
        raise HTTPException(400, f"Driver ID {payload.driver_id} already exists")
    data = payload.model_dump()
    data["password_hash"] = pwd_ctx.hash(data.pop("password"))
    driver = models.Driver(**data)
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


@router.get("/{driver_id}", response_model=schemas.DriverOut)
def get_driver(driver_id: int, db: Session = Depends(get_db)):
    driver = db.get(models.Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    return driver


@router.put("/{driver_id}", response_model=schemas.DriverOut)
def update_driver(driver_id: int, payload: schemas.DriverUpdate, db: Session = Depends(get_db)):
    driver = db.get(models.Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    data = payload.model_dump(exclude_none=True)
    if "password" in data:
        data["password_hash"] = pwd_ctx.hash(data.pop("password"))
    for field, value in data.items():
        setattr(driver, field, value)
    db.commit()
    db.refresh(driver)
    return driver


@router.delete("/{driver_id}", status_code=204)
def delete_driver(driver_id: int, db: Session = Depends(get_db)):
    driver = db.get(models.Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    db.delete(driver)
    db.commit()


# ---------------------------------------------------------------------------
# Driver Assignments  (nested under /drivers for clarity)
# ---------------------------------------------------------------------------

@router.get("/assignments/all", response_model=list[schemas.DriverAssignmentOut])
def list_assignments(db: Session = Depends(get_db)):
    return db.query(models.DriverAssignment).all()


@router.post("/assignments", response_model=schemas.DriverAssignmentOut, status_code=201)
def assign_vehicle(payload: schemas.DriverAssignmentCreate, db: Session = Depends(get_db)):
    existing = db.query(models.DriverAssignment).filter(
        models.DriverAssignment.driver_id == payload.driver_id
    ).first()
    if existing:
        existing.vehicle_id = payload.vehicle_id
        db.commit()
        db.refresh(existing)
        return existing
    assignment = models.DriverAssignment(**payload.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/assignments/{driver_id_str}", status_code=204)
def remove_assignment(driver_id_str: str, db: Session = Depends(get_db)):
    assignment = db.query(models.DriverAssignment).filter(
        models.DriverAssignment.driver_id == driver_id_str
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    db.delete(assignment)
    db.commit()
