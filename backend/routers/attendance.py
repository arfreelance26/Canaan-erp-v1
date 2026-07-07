from datetime import date as date_type, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from websocket_manager import emit

router = APIRouter(prefix="/attendance", tags=["Attendance"])


# ---------------------------------------------------------------------------
# Attendance Summary (date-range report)
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=list[schemas.AttendanceSummaryOut])
def attendance_summary(
    category: str = Query(..., description="'driver' or 'staff'"),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
):
    if category not in ("driver", "staff"):
        raise HTTPException(400, "category must be 'driver' or 'staff'")

    try:
        start = date_type.fromisoformat(date_from)
        end = date_type.fromisoformat(date_to)
    except ValueError:
        raise HTTPException(400, "from/to must be valid dates (YYYY-MM-DD)")
    if end < start:
        raise HTTPException(400, "'to' date cannot be before 'from' date")
    total_days = (end - start).days + 1

    result = []
    if category == "driver":
        people = db.query(models.Driver).order_by(models.Driver.name).all()
        records = db.query(models.DriverAttendance).filter(
            models.DriverAttendance.date >= start,
            models.DriverAttendance.date <= end,
        ).all()
        by_person: dict[str, list] = {}
        for r in records:
            by_person.setdefault(r.driver_id, []).append(r)
        for p in people:
            recs = by_person.get(p.driver_id, [])
            counts = {"On Trip": 0, "On Halt": 0, "Leave": 0, "On Workshop": 0}
            for r in recs:
                if r.status in counts:
                    counts[r.status] += 1
            marked = sum(counts.values())
            result.append(schemas.AttendanceSummaryOut(
                id=str(p.id), code=p.driver_id, name=p.name,
                on_trip=counts["On Trip"], on_halt=counts["On Halt"],
                leave=counts["Leave"], on_workshop=counts["On Workshop"],
                not_marked=max(total_days - marked, 0), total_days=total_days,
            ))
    else:
        people = db.query(models.Staff).order_by(models.Staff.name).all()
        records = db.query(models.StaffAttendance).filter(
            models.StaffAttendance.date >= start,
            models.StaffAttendance.date <= end,
        ).all()
        by_person: dict[int, list] = {}
        for r in records:
            by_person.setdefault(r.staff_id, []).append(r)
        for p in people:
            recs = by_person.get(p.id, [])
            counts = {"Present": 0, "Absent": 0, "On Leave": 0}
            for r in recs:
                if r.status in counts:
                    counts[r.status] += 1
            marked = sum(counts.values())
            result.append(schemas.AttendanceSummaryOut(
                id=str(p.id), code=p.staff_id, name=p.name,
                present=counts["Present"], absent=counts["Absent"], on_leave=counts["On Leave"],
                not_marked=max(total_days - marked, 0), total_days=total_days,
            ))
    return result


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
        emit("attendance_updated", {})
        return existing
    record = models.DriverAttendance(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {})
    return record


@router.put("/drivers/{record_id}", response_model=schemas.DriverAttendanceOut)
def update_driver_attendance(record_id: int, payload: schemas.DriverAttendanceUpdate, db: Session = Depends(get_db)):
    record = db.get(models.DriverAttendance, record_id)
    if not record:
        raise HTTPException(404, "Attendance record not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    record.marked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {})
    return record


# ---------------------------------------------------------------------------
# Driver Attendance Remarks
# ---------------------------------------------------------------------------

@router.get("/drivers/remarks", response_model=list[schemas.DriverAttendanceRemarkOut])
def list_driver_remarks(
    driver_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
):
    q = db.query(models.DriverAttendanceRemark)
    if driver_id:
        q = q.filter(models.DriverAttendanceRemark.driver_id == driver_id)
    if date:
        q = q.filter(models.DriverAttendanceRemark.date == date)
    if date_from:
        q = q.filter(models.DriverAttendanceRemark.date >= date_from)
    if date_to:
        q = q.filter(models.DriverAttendanceRemark.date <= date_to)
    return q.order_by(models.DriverAttendanceRemark.date.asc(), models.DriverAttendanceRemark.created_at.asc()).all()


@router.post("/drivers/remarks", response_model=schemas.DriverAttendanceRemarkOut, status_code=201)
def add_driver_remark(payload: schemas.DriverAttendanceRemarkCreate, db: Session = Depends(get_db)):
    remark = models.DriverAttendanceRemark(**payload.model_dump())
    db.add(remark)
    db.commit()
    db.refresh(remark)
    emit("attendance_updated", {})
    return remark


@router.put("/drivers/remarks/{remark_id}", response_model=schemas.DriverAttendanceRemarkOut)
def update_driver_remark(remark_id: int, payload: schemas.DriverAttendanceRemarkUpdate, db: Session = Depends(get_db)):
    remark = db.get(models.DriverAttendanceRemark, remark_id)
    if not remark:
        raise HTTPException(404, "Remark not found")
    remark.remark = payload.remark
    db.commit()
    db.refresh(remark)
    emit("attendance_updated", {})
    return remark


@router.delete("/drivers/remarks/{remark_id}", status_code=204)
def delete_driver_remark(remark_id: int, db: Session = Depends(get_db)):
    remark = db.get(models.DriverAttendanceRemark, remark_id)
    if not remark:
        raise HTTPException(404, "Remark not found")
    db.delete(remark)
    db.commit()
    emit("attendance_updated", {})


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
        emit("attendance_updated", {})
        return existing
    record = models.StaffAttendance(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {})
    return record


@router.put("/staff/{record_id}", response_model=schemas.StaffAttendanceOut)
def update_staff_attendance(record_id: int, payload: schemas.StaffAttendanceUpdate, db: Session = Depends(get_db)):
    record = db.get(models.StaffAttendance, record_id)
    if not record:
        raise HTTPException(404, "Attendance record not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    record.marked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {})
    return record


# ---------------------------------------------------------------------------
# Leave Requests
# ---------------------------------------------------------------------------

@router.get("/lookup-applicant", response_model=schemas.ApplicantLookupOut)
def lookup_applicant(code: str, db: Session = Depends(get_db)):
    code_upper = code.strip().upper()
    # Check Driver
    driver = db.query(models.Driver).filter(models.Driver.driver_id == code_upper).first()
    if driver:
        return schemas.ApplicantLookupOut(
            category="Driver",
            applicant_id=driver.id,
            applicant_name=driver.name,
            applicant_code=driver.driver_id
        )
    # Check Staff
    staff = db.query(models.Staff).filter(models.Staff.staff_id == code_upper).first()
    if staff:
        return schemas.ApplicantLookupOut(
            category=staff.software_designation if staff.software_designation in ["Fleet Manager", "Tyre Manager", "Trip Sheet Register", "Yard Staff"] else "Trip Sheet Register",
            applicant_id=staff.id,
            applicant_name=staff.name,
            applicant_code=staff.staff_id
        )
    raise HTTPException(404, "Applicant not found with the provided code")

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
    emit("leave_request_created", {
        "id": request.id,
        "applicant_name": request.applicant_name,
        "category": request.category,
        "from_date": str(request.from_date),
        "to_date": str(request.to_date),
        "reason": request.reason,
        "applied_at": request.applied_at.isoformat() if request.applied_at else None,
    })
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
    emit("leave_request_updated", {"id": request.id, "status": "Approved"})
    return request


@router.patch("/leave-requests/{request_id}/reject", response_model=schemas.LeaveRequestOut)
def reject_leave(request_id: int, db: Session = Depends(get_db)):
    request = db.get(models.LeaveRequest, request_id)
    if not request:
        raise HTTPException(404, "Leave request not found")
    request.status = "Rejected"
    db.commit()
    db.refresh(request)
    emit("leave_request_updated", {"id": request.id, "status": "Rejected"})
    return request
