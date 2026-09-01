import calendar as _calendar
from datetime import date as date_type, datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from websocket_manager import emit
from security import get_current_user, TokenUser

_IST = ZoneInfo("Asia/Kolkata")

def _today_ist() -> date_type:
    return datetime.now(_IST).date()


def _holiday_dates_in_range(db: Session, start: date_type, end: date_type) -> set:
    """Government/company holiday dates (from the Holiday master) within [start, end]."""
    rows = db.query(models.Holiday.date).filter(
        models.Holiday.date >= start,
        models.Holiday.date <= end,
    ).all()
    return {r[0] for r in rows}


def _non_working_dates(start: date_type, end: date_type, holiday_dates: set) -> set:
    """All non-working staff days in [start, end] = Sundays ∪ government holidays.
    (Python weekday(): Monday=0 … Sunday=6.)"""
    result = set(d for d in holiday_dates if start <= d <= end)
    d = start
    while d <= end:
        if d.weekday() == 6:  # Sunday
            result.add(d)
        d += timedelta(days=1)
    return result

def _assert_editable_date(record_date, user: Optional[TokenUser] = None, bypass_lock: bool = False) -> None:
    """Raise 403 if record_date is older than today−2 days (IST).
    Admin users and dates with an approved late-entry log bypass this restriction."""
    if user and user.role == "Admin":
        return
    if bypass_lock:
        return
    if isinstance(record_date, str):
        record_date = date_type.fromisoformat(record_date)
    cutoff = _today_ist() - timedelta(days=2)
    if record_date < cutoff:
        raise HTTPException(
            403,
            f"Attendance for {record_date} is locked — only today and the past 2 days can be edited.",
        )

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
        # Staff working days exclude Sundays and government/company holidays.
        staff_non_working = len(_non_working_dates(start, end, _holiday_dates_in_range(db, start, end)))
        staff_working_days = max(total_days - staff_non_working, 0)
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
                not_marked=max(staff_working_days - marked, 0), total_days=staff_working_days,
            ))
    return result
@router.get("/latest-date")
def get_latest_attendance_date(
    category: str = Query(..., description="'driver' or 'staff'"),
    db: Session = Depends(get_db)
):
    if category == "driver":
        latest = db.query(models.DriverAttendance.date).order_by(models.DriverAttendance.date.desc()).first()
    elif category == "staff":
        latest = db.query(models.StaffAttendance.date).order_by(models.StaffAttendance.date.desc()).first()
    else:
        raise HTTPException(400, "category must be 'driver' or 'staff'")
    
    return {"latest_date": latest[0] if latest else None}



# ---------------------------------------------------------------------------
# Driver Attendance
# ---------------------------------------------------------------------------

@router.get("/drivers", response_model=list[schemas.DriverAttendanceOut])
def list_driver_attendance(
    date: Optional[str] = Query(None, description="Filter by exact date YYYY-MM-DD"),
    driver_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    date_to: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    q = db.query(models.DriverAttendance)
    if date:
        q = q.filter(models.DriverAttendance.date == date)
    else:
        if date_from:
            q = q.filter(models.DriverAttendance.date >= date_from)
        if date_to:
            q = q.filter(models.DriverAttendance.date <= date_to)
    if driver_id:
        q = q.filter(models.DriverAttendance.driver_id == driver_id)
    return q.order_by(models.DriverAttendance.date.asc(), models.DriverAttendance.id.asc()).all()


@router.post("/drivers", response_model=schemas.DriverAttendanceOut, status_code=201)
def mark_driver_attendance(payload: schemas.DriverAttendanceCreate, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    late_entry_exists = db.query(models.DriverAttendanceLateEntryLog).filter(
        models.DriverAttendanceLateEntryLog.date == payload.date
    ).first() is not None
    _assert_editable_date(payload.date, user, bypass_lock=late_entry_exists)
    existing = db.query(models.DriverAttendance).filter(
        models.DriverAttendance.driver_id == payload.driver_id,
        models.DriverAttendance.date == payload.date,
    ).first()
    if existing:
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
def update_driver_attendance(record_id: int, payload: schemas.DriverAttendanceUpdate, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    record = db.get(models.DriverAttendance, record_id)
    if not record:
        raise HTTPException(404, "Attendance record not found")
    late_entry_exists = db.query(models.DriverAttendanceLateEntryLog).filter(
        models.DriverAttendanceLateEntryLog.date == record.date
    ).first() is not None
    _assert_editable_date(record.date, user, bypass_lock=late_entry_exists)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    record.marked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {})
    return record


@router.get("/drivers/late-entry-log", response_model=list[schemas.DriverLateEntryLogOut])
def list_driver_late_entry_logs(
    date: Optional[str] = Query(None, description="Filter by exact date YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    q = db.query(models.DriverAttendanceLateEntryLog)
    if date:
        q = q.filter(models.DriverAttendanceLateEntryLog.date == date)
    return q.order_by(models.DriverAttendanceLateEntryLog.date.desc()).all()


@router.post("/drivers/late-entry-log", response_model=schemas.DriverLateEntryLogOut, status_code=201)
def create_driver_late_entry_log(payload: schemas.DriverLateEntryLogCreate, db: Session = Depends(get_db)):
    """Creates a date-level late-entry log record. This unlocks normal attendance marking
    for that date (bypasses the 2-day lock) and gives admin visibility into why it was late."""
    existing = db.query(models.DriverAttendanceLateEntryLog).filter(
        models.DriverAttendanceLateEntryLog.date == payload.date
    ).first()
    if existing:
        return existing
    log = models.DriverAttendanceLateEntryLog(date=payload.date, remark=payload.remark)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


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
def add_driver_remark(payload: schemas.DriverAttendanceRemarkCreate, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    late_entry_exists = db.query(models.DriverAttendanceLateEntryLog).filter(
        models.DriverAttendanceLateEntryLog.date == payload.date
    ).first() is not None
    _assert_editable_date(payload.date, user, bypass_lock=late_entry_exists)
    remark = models.DriverAttendanceRemark(**payload.model_dump())
    db.add(remark)
    db.commit()
    db.refresh(remark)
    emit("attendance_updated", {})
    return remark


@router.put("/drivers/remarks/{remark_id}", response_model=schemas.DriverAttendanceRemarkOut)
def update_driver_remark(remark_id: int, payload: schemas.DriverAttendanceRemarkUpdate, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    remark = db.get(models.DriverAttendanceRemark, remark_id)
    if not remark:
        raise HTTPException(404, "Remark not found")
    late_entry_exists = db.query(models.DriverAttendanceLateEntryLog).filter(
        models.DriverAttendanceLateEntryLog.date == remark.date
    ).first() is not None
    _assert_editable_date(remark.date, user, bypass_lock=late_entry_exists)
    remark.remark = payload.remark
    db.commit()
    db.refresh(remark)
    emit("attendance_updated", {})
    return remark


@router.delete("/drivers/remarks/{remark_id}", status_code=204)
def delete_driver_remark(remark_id: int, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    remark = db.get(models.DriverAttendanceRemark, remark_id)
    if not remark:
        raise HTTPException(404, "Remark not found")
    late_entry_exists = db.query(models.DriverAttendanceLateEntryLog).filter(
        models.DriverAttendanceLateEntryLog.date == remark.date
    ).first() is not None
    _assert_editable_date(remark.date, user, bypass_lock=late_entry_exists)
    db.delete(remark)
    db.commit()
    emit("attendance_updated", {})


# ---------------------------------------------------------------------------
# Staff Attendance
# ---------------------------------------------------------------------------

@router.post("/staff/self-mark", response_model=schemas.StaffAttendanceOut, status_code=201)
def self_mark_staff_attendance(payload: schemas.StaffSelfMarkCreate, db: Session = Depends(get_db)):
    """
    Self-service endpoint used by the Mark Attendance page.
    Always marks attendance for TODAY (IST) — the client cannot supply a date.
    Creates a new record; rejects if today's record already exists (one mark per day).
    Records check_in_time (IST HH:MM AM/PM) when status is Present.
    """
    today = _today_ist()
    # Sundays and government/company holidays are non-working days — no marking needed.
    if today.weekday() == 6:
        raise HTTPException(400, "Today is a Sunday holiday — attendance marking is not required.")
    holiday = db.query(models.Holiday).filter(models.Holiday.date == today).first()
    if holiday:
        raise HTTPException(400, f"Today is a holiday ({holiday.name}) — attendance marking is not required.")
    existing = db.query(models.StaffAttendance).filter(
        models.StaffAttendance.staff_id == payload.staff_id,
        models.StaffAttendance.date == today,
    ).first()
    if existing:
        raise HTTPException(400, "Attendance already marked for today. Use close-shift to record shift end.")
    staff = db.get(models.Staff, payload.staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found.")
    now_ist = datetime.now(_IST)
    check_in = now_ist.strftime("%I:%M %p") if payload.status == "Present" else None
    record = models.StaffAttendance(
        staff_id=payload.staff_id,
        staff_name=staff.name,
        date=today,
        status=payload.status,
        check_in_time=check_in,
        marked_at=datetime.now(timezone.utc),
        source="Web",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {"staff_id": payload.staff_id})
    return record


@router.post("/staff/close-shift", response_model=schemas.StaffAttendanceOut)
def close_shift(staff_id: int, db: Session = Depends(get_db)):
    """
    Records the shift end time for today's Present attendance record.
    Can only be called once per day (once check_out_time is set it is locked).
    """
    today = _today_ist()
    record = db.query(models.StaffAttendance).filter(
        models.StaffAttendance.staff_id == staff_id,
        models.StaffAttendance.date == today,
    ).first()
    if not record:
        raise HTTPException(404, "No attendance record found for today. Mark attendance first.")
    if record.status != "Present":
        raise HTTPException(400, "Close shift is only applicable for Present status.")
    if record.check_out_time:
        raise HTTPException(400, "Shift already closed for today.")
    record.check_out_time = datetime.now(_IST).strftime("%I:%M %p")
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {"staff_id": staff_id})
    return record


_WORKING_DAYS_PER_MONTH = 26


@router.get("/staff/self-summary", response_model=schemas.StaffSelfSummaryOut)
def get_staff_self_summary(
    staff_id: int = Query(..., description="Numeric staff PK"),
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    """
    Returns the attendance summary for a single staff member for the given month.
    Used by the Mark Attendance page to render the circular percentage ring and
    summary counts without shipping every daily record to the client.
    """
    last_day = _calendar.monthrange(year, month)[1]
    start = date_type(year, month, 1)
    end = date_type(year, month, last_day)
    today = _today_ist()
    effective_end = min(end, today)

    if effective_end < start:
        # Month hasn't started yet (future month viewed — shouldn't happen, but safe)
        return schemas.StaffSelfSummaryOut(
            present=0, absent=0, on_leave=0, not_marked=0, holidays=0,
            days_elapsed=0, working_days=0, percentage=0.0,
        )

    records = (
        db.query(models.StaffAttendance)
        .filter(
            models.StaffAttendance.staff_id == staff_id,
            models.StaffAttendance.date >= start,
            models.StaffAttendance.date <= effective_end,
        )
        .all()
    )

    counts = {"Present": 0, "Absent": 0, "On Leave": 0}
    for r in records:
        if r.status in counts:
            counts[r.status] += 1

    # Working days exclude Sundays and government/company holidays elapsed so far.
    holiday_dates = _holiday_dates_in_range(db, start, effective_end)
    non_working = _non_working_dates(start, effective_end, holiday_dates)
    days_elapsed = (effective_end - start).days + 1
    holidays = len(non_working)
    working_days = max(days_elapsed - holidays, 0)
    marked = sum(counts.values())
    # Only working days can be "not marked" — holidays never count against staff.
    not_marked = max(working_days - marked, 0)
    percentage = round(min((counts["Present"] / working_days) * 100, 100.0), 1) if working_days else 0.0

    return schemas.StaffSelfSummaryOut(
        present=counts["Present"],
        absent=counts["Absent"],
        on_leave=counts["On Leave"],
        not_marked=not_marked,
        holidays=holidays,
        days_elapsed=days_elapsed,
        working_days=working_days,
        percentage=percentage,
    )


@router.get("/staff", response_model=list[schemas.StaffAttendanceOut])
def list_staff_attendance(
    date: Optional[str] = Query(None, description="Filter by exact date YYYY-MM-DD"),
    staff_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive)"),
    date_to: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    q = db.query(models.StaffAttendance)
    if date:
        q = q.filter(models.StaffAttendance.date == date)
    else:
        if date_from:
            q = q.filter(models.StaffAttendance.date >= date_from)
        if date_to:
            q = q.filter(models.StaffAttendance.date <= date_to)
    if staff_id:
        q = q.filter(models.StaffAttendance.staff_id == staff_id)
    return q.order_by(models.StaffAttendance.date.asc(), models.StaffAttendance.id.asc()).all()


@router.post("/staff", response_model=schemas.StaffAttendanceOut, status_code=201)
def mark_staff_attendance(payload: schemas.StaffAttendanceCreate, db: Session = Depends(get_db)):
    staff = db.get(models.Staff, payload.staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found.")
    existing = db.query(models.StaffAttendance).filter(
        models.StaffAttendance.staff_id == payload.staff_id,
        models.StaffAttendance.date == payload.date,
    ).first()
    if existing:
        for field, value in payload.model_dump().items():
            setattr(existing, field, value)
        existing.staff_name = staff.name
        existing.admin_override = True
        db.commit()
        db.refresh(existing)
        emit("attendance_updated", {"staff_id": existing.staff_id})
        return existing
    record = models.StaffAttendance(**payload.model_dump(), staff_name=staff.name)
    record.admin_override = True
    db.add(record)
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {"staff_id": record.staff_id})
    return record


@router.put("/staff/{record_id}", response_model=schemas.StaffAttendanceOut)
def update_staff_attendance(record_id: int, payload: schemas.StaffAttendanceUpdate, db: Session = Depends(get_db)):
    record = db.get(models.StaffAttendance, record_id)
    if not record:
        raise HTTPException(404, "Attendance record not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    record.marked_at = datetime.now(timezone.utc)
    record.admin_override = True
    db.commit()
    db.refresh(record)
    emit("attendance_updated", {"staff_id": record.staff_id})
    return record


# ---------------------------------------------------------------------------
# Holidays (staff attendance only — Sundays are automatic and not stored)
# ---------------------------------------------------------------------------

@router.get("/holidays", response_model=list[schemas.HolidayOut])
def list_holidays(
    date_from: Optional[str] = Query(None, alias="from", description="Range start YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, alias="to", description="Range end YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    q = db.query(models.Holiday)
    if date_from:
        q = q.filter(models.Holiday.date >= date_from)
    if date_to:
        q = q.filter(models.Holiday.date <= date_to)
    return q.order_by(models.Holiday.date.asc()).all()


@router.post("/holidays", response_model=schemas.HolidayOut, status_code=201)
def create_holiday(payload: schemas.HolidayCreate, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    if user.role != "Admin":
        raise HTTPException(403, "Only Admin can manage holidays.")
    existing = db.query(models.Holiday).filter(models.Holiday.date == payload.date).first()
    if existing:
        # A date is either a holiday or not — update the label/type instead of duplicating.
        existing.name = payload.name
        existing.type = payload.type
        db.commit()
        db.refresh(existing)
        emit("attendance_updated", {})
        return existing
    holiday = models.Holiday(**payload.model_dump())
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    emit("attendance_updated", {})
    return holiday


@router.delete("/holidays/{holiday_id}", status_code=204)
def delete_holiday(holiday_id: int, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    if user.role != "Admin":
        raise HTTPException(403, "Only Admin can manage holidays.")
    holiday = db.get(models.Holiday, holiday_id)
    if not holiday:
        raise HTTPException(404, "Holiday not found")
    db.delete(holiday)
    db.commit()
    emit("attendance_updated", {})


# ---------------------------------------------------------------------------
# Leave Requests
# ---------------------------------------------------------------------------

@router.get("/lookup-applicant", response_model=schemas.ApplicantLookupOut)
def lookup_applicant(code: str, db: Session = Depends(get_db)):
    code_upper = code.strip().upper()
    # Check Driver
    driver = db.query(models.Driver).filter(
        models.Driver.driver_id == code_upper, models.Driver.deleted_at.is_(None)
    ).first()
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
            category=staff.software_designation if staff.software_designation in ["Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor"] else "Trip Sheet Register",
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
