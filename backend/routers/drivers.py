from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from database import get_db
import models, schemas
from duplicate_checks import check_driver_duplicates
from security import require_roles, get_current_user, TokenUser
from websocket_manager import emit

router = APIRouter(prefix="/drivers", tags=["Drivers"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("", response_model=list[schemas.DriverOut])
def list_drivers(
    search: Optional[str] = Query(None, description="Search by name, driver ID, phone, license"),
    limit: Optional[int] = Query(None, le=100, description="Max rows (AI use); omit for full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.Driver).filter(models.Driver.deleted_at.is_(None)).order_by(models.Driver.driver_id)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(or_(
            models.Driver.name.ilike(s),
            models.Driver.driver_id.ilike(s),
            models.Driver.phone.ilike(s),
            models.Driver.license_number.ilike(s),
        ))
    if limit is not None:
        q = q.offset(offset).limit(limit)
    return q.all()


@router.post("", response_model=schemas.DriverOut, status_code=201)
def create_driver(payload: schemas.DriverCreate, db: Session = Depends(get_db)):
    check_driver_duplicates(db, payload)
    if db.query(models.Driver).filter(models.Driver.driver_id == payload.driver_id).first():
        raise HTTPException(400, f"Driver ID {payload.driver_id} already exists")
    data = payload.model_dump()
    data["password_hash"] = pwd_ctx.hash(data.pop("password"))
    driver = models.Driver(**data)
    db.add(driver)
    db.commit()
    db.refresh(driver)
    emit("driver_updated", {"id": driver.id})
    return driver


@router.get("/deleted-ids", dependencies=[Depends(require_roles())])
def list_deleted_driver_ids(db: Session = Depends(get_db)):
    """Admin only: ids of drivers currently soft-deleted. Lets the "Archive" page
    (which lists from the deletion_approval_requests audit trail) tell apart a
    still-deleted driver from one that was since restored, same pattern as
    trips.py's list_deleted_trip_ids. Registered before GET /{driver_id} so
    "deleted-ids" isn't swallowed as a driver_id path param."""
    rows = db.query(models.Driver.id).filter(models.Driver.deleted_at.isnot(None)).all()
    return [i for (i,) in rows]


@router.get("/{driver_id}", response_model=schemas.DriverOut)
def get_driver(driver_id: int, db: Session = Depends(get_db)):
    driver = db.get(models.Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    return driver


@router.put("/{driver_id}", response_model=schemas.DriverOut)
def update_driver(driver_id: int, payload: schemas.DriverUpdate, db: Session = Depends(get_db)):
    check_driver_duplicates(db, payload, exclude_id=driver_id)
    driver = db.query(models.Driver).with_for_update().filter(models.Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(404, "Driver not found")
    if payload.client_version is not None and driver.version != payload.client_version:
        raise HTTPException(
            409,
            "This driver record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    data = payload.model_dump(exclude_unset=True, exclude={"client_version"})
    if "password" in data:
        data["password_hash"] = pwd_ctx.hash(data.pop("password"))
    for field, value in data.items():
        setattr(driver, field, value)
    driver.version = (driver.version or 1) + 1
    db.commit()
    db.refresh(driver)
    emit("driver_updated", {"id": driver.id})
    return driver


@router.delete("/{driver_id}", status_code=204, dependencies=[Depends(require_roles())])
def delete_driver(driver_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: soft-delete a driver (hides them from "Our Drivers" and every
    assignment picker, keeps their trip history, attendance, and compensation/batta
    records intact and still resolvable by name). A self-approved
    DeletionApprovalRequest row is logged for audit visibility, same pattern as
    trips.py's delete_trip.
    """
    driver = db.get(models.Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    if driver.deleted_at is not None:
        raise HTTPException(409, "Driver is already deleted")
    now = datetime.now(timezone.utc)
    driver.deleted_at = now
    if current_user.id is not None:
        db.add(models.DeletionApprovalRequest(
            resource_type="Driver",
            resource_id=driver_id,
            resource_name=f"{driver.driver_id} — {driver.name}",
            requested_by_staff_id=current_user.id,
            requested_by_name=current_user.name,
            reason="Deleted directly by Admin — no approval required.",
            status="Approved",
            approved_by_name=current_user.name,
            approved_at=now,
        ))
    db.commit()
    emit("driver_updated", {})


@router.post("/{driver_id}/restore", response_model=schemas.DriverOut, dependencies=[Depends(require_roles())])
def restore_driver(driver_id: int, db: Session = Depends(get_db)):
    """Admin only: undo a soft-delete — the driver reappears in Our Drivers (and
    every assignment picker) exactly as they were."""
    driver = db.get(models.Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    if driver.deleted_at is None:
        raise HTTPException(409, "Driver is not deleted")
    driver.deleted_at = None
    db.commit()
    db.refresh(driver)
    emit("driver_updated", {})
    return driver


@router.delete("/{driver_id}/permanent", status_code=204, dependencies=[Depends(require_roles())])
def permanently_delete_driver(driver_id: int, db: Session = Depends(get_db)):
    """Admin only: irreversibly delete an already soft-deleted driver. Only
    reachable from the "Archive" page."""
    driver = db.get(models.Driver, driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    db.delete(driver)
    db.commit()
    emit("driver_updated", {})


# ---------------------------------------------------------------------------
# Driver Assignments  (nested under /drivers for clarity)
# ---------------------------------------------------------------------------

@router.get("/assignments/all", response_model=list[schemas.DriverAssignmentOut])
def list_assignments(db: Session = Depends(get_db)):
    return db.query(models.DriverAssignment).all()


@router.post("/assignments", response_model=schemas.DriverAssignmentOut, status_code=201)
def assign_vehicle(payload: schemas.DriverAssignmentCreate, db: Session = Depends(get_db)):
    existing = db.query(models.DriverAssignment).with_for_update().filter(
        models.DriverAssignment.driver_id == payload.driver_id
    ).first()
    if existing:
        existing.vehicle_id = payload.vehicle_id
        db.commit()
        db.refresh(existing)
        emit("driver_updated", {})
        return existing
    assignment = models.DriverAssignment(**payload.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    emit("driver_updated", {})
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
    emit("driver_updated", {})
