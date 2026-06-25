from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/attendance", tags=["Attendance"])


# ---------------------------------------------------------------------------
# Driver Attendance
# ---------------------------------------------------------------------------

@router.get("/drivers", response_model=list[schemas.DriverAttendanceOut])
def list_driver_attendance(
    date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD"),
    driver_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.DriverAttendance)
    if date:
        q = q.filter(models.DriverAttendance.date == date)
    if driver_id:
        q = q.filter(models.DriverAttendance.driver_id == driver_id)
    return q.order_by(models.DriverAttendance.date.desc()).all()


@router.post("/drivers", response_model=schemas.DriverAttendanceOut, status_code=201)
def mark_driver_attendance(payload: schemas.DriverAttendanceCreate, db: Session = Depends(get_db)):
    existing = db.query(models.DriverAttendance).filter(
        models.DriverAttendance.driver_id == payload.driver_id,
        models.DriverAttendance.date == payload.date,
    ).first()
    if existing:
        # Upsert — update in place
        for field, value in payload.model_dump().items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing
    record = models.DriverAttendance(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/drivers/{record_id}", response_model=schemas.DriverAttendanceOut)
def update_driver_attendance(record_id: int, payload: schemas.DriverAttendanceUpdate, db: Session = Depends(get_db)):
    record = db.get(models.DriverAttendance, record_id)
    if not record:
        raise HTTPException(404, "Attendance record not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


# ---------------------------------------------------------------------------
# Staff Attendance
# ---------------------------------------------------------------------------

@router.get("/staff", response_model=list[schemas.StaffAttendanceOut])
def list_staff_attendance(
    date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD"),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.StaffAttendance)
    if date:
        q = q.filter(models.StaffAttendance.date == date)
    if staff_id:
        q = q.filter(models.StaffAttendance.staff_id == staff_id)
    return q.order_by(models.StaffAttendance.date.desc()).all()


@router.post("/staff", response_model=schemas.StaffAttendanceOut, status_code=201)
def mark_staff_attendance(payload: schemas.StaffAttendanceCreate, db: Session = Depends(get_db)):
    existing = db.query(models.StaffAttendance).filter(
        models.StaffAttendance.staff_id == payload.staff_id,
        models.StaffAttendance.date == payload.date,
    ).first()
    if existing:
        for field, value in payload.model_dump().items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing
    record = models.StaffAttendance(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/staff/{record_id}", response_model=schemas.StaffAttendanceOut)
def update_staff_attendance(record_id: int, payload: schemas.StaffAttendanceUpdate, db: Session = Depends(get_db)):
    record = db.get(models.StaffAttendance, record_id)
    if not record:
        raise HTTPException(404, "Attendance record not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


# ---------------------------------------------------------------------------
# Leave Requests
# ---------------------------------------------------------------------------

@router.get("/leave-requests", response_model=list[schemas.LeaveRequestOut])
def list_leave_requests(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.LeaveRequest)
    if status:
        q = q.filter(models.LeaveRequest.status == status)
    return q.order_by(models.LeaveRequest.applied_at.desc()).all()


@router.post("/leave-requests", response_model=schemas.LeaveRequestOut, status_code=201)
def create_leave_request(payload: schemas.LeaveRequestCreate, db: Session = Depends(get_db)):
    request = models.LeaveRequest(**payload.model_dump())
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get("/leave-requests/{request_id}", response_model=schemas.LeaveRequestOut)
def get_leave_request(request_id: int, db: Session = Depends(get_db)):
    request = db.get(models.LeaveRequest, request_id)
    if not request:
        raise HTTPException(404, "Leave request not found")
    return request


@router.patch("/leave-requests/{request_id}/approve", response_model=schemas.LeaveRequestOut)
def approve_leave(request_id: int, db: Session = Depends(get_db)):
    request = db.get(models.LeaveRequest, request_id)
    if not request:
        raise HTTPException(404, "Leave request not found")
    request.status = "Approved"
    db.commit()
    db.refresh(request)
    return request


@router.patch("/leave-requests/{request_id}/reject", response_model=schemas.LeaveRequestOut)
def reject_leave(request_id: int, db: Session = Depends(get_db)):
    request = db.get(models.LeaveRequest, request_id)
    if not request:
        raise HTTPException(404, "Leave request not found")
    request.status = "Rejected"
    db.commit()
    db.refresh(request)
    return request
