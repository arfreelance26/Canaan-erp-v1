from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from websocket_manager import emit
from security import get_current_user, TokenUser, require_roles

router = APIRouter(prefix="/finance", tags=["Finance"])

# Read-only finance figures also shown outside the finance pages (e.g. the
# Assign Trip dialog's Customer Insights panel), so the Commercial Manager can
# read them. Mounted separately because `router` is locked to Accounts/Admin.
insights_router = APIRouter(
    prefix="/finance",
    tags=["Finance"],
    dependencies=[Depends(require_roles("Accounts", "Commercial Manager", "Assistant Commercial Manager"))],
)


# ---------------------------------------------------------------------------
# EMI Records
# ---------------------------------------------------------------------------

@router.get("/emi", response_model=list[schemas.EmiRecordOut])
def list_emi(db: Session = Depends(get_db)):
    return db.query(models.EmiRecord).order_by(models.EmiRecord.emi_name).all()


@router.get("/emi/edit-events", response_model=list[schemas.EmiRecordEditEventListOut])
def list_all_emi_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete event ever logged, across every EMI record —
    the page-wide "Edit History" log on EMI Tracking. Most recent first.
    Registered before GET /emi/{emi_id} so "edit-events" isn't swallowed as
    an emi_id path param."""
    events = (
        db.query(models.EmiRecordEditEvent)
        .order_by(models.EmiRecordEditEvent.created_at.desc(), models.EmiRecordEditEvent.id.desc())
        .all()
    )
    return events


@router.post("/emi", response_model=schemas.EmiRecordOut, status_code=201)
def create_emi(
    payload: schemas.EmiRecordCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = models.EmiRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    db.add(models.EmiRecordEditEvent(
        emi_id=record.id, emi_name=record.emi_name, truck_registration=record.truck_registration,
        event="EMI Created", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("finance_updated", {})
    return record


@router.get("/emi/{emi_id}", response_model=schemas.EmiRecordOut)
def get_emi(emi_id: int, db: Session = Depends(get_db)):
    record = db.get(models.EmiRecord, emi_id)
    if not record:
        raise HTTPException(404, "EMI record not found")
    return record


@router.put("/emi/{emi_id}", response_model=schemas.EmiRecordOut)
def update_emi(
    emi_id: int,
    payload: schemas.EmiRecordUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.query(models.EmiRecord).with_for_update().filter(models.EmiRecord.id == emi_id).first()
    if not record:
        raise HTTPException(404, "EMI record not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(
            409,
            "This EMI record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(record, field, value)
    record.version = (record.version or 1) + 1
    db.add(models.EmiRecordEditEvent(
        emi_id=record.id, emi_name=record.emi_name, truck_registration=record.truck_registration,
        event="EMI Edited", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(record)
    emit("finance_updated", {})
    return record


@router.delete("/emi/{emi_id}", status_code=204)
def delete_emi(
    emi_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    record = db.get(models.EmiRecord, emi_id)
    if not record:
        raise HTTPException(404, "EMI record not found")
    db.add(models.EmiRecordEditEvent(
        emi_id=record.id, emi_name=record.emi_name, truck_registration=record.truck_registration,
        event="EMI Deleted", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(record)
    db.commit()
    emit("finance_updated", {})


# ---------------------------------------------------------------------------
# Recurring Payments
# ---------------------------------------------------------------------------

@router.get("/recurring-payments", response_model=list[schemas.RecurringPaymentOut])
def list_recurring(db: Session = Depends(get_db)):
    return db.query(models.RecurringPayment).order_by(models.RecurringPayment.title).all()


@router.post("/recurring-payments", response_model=schemas.RecurringPaymentOut, status_code=201)
def create_recurring(payload: schemas.RecurringPaymentCreate, db: Session = Depends(get_db)):
    payment = models.RecurringPayment(**payload.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    emit("finance_updated", {})
    return payment


@router.get("/recurring-payments/{payment_id}", response_model=schemas.RecurringPaymentOut)
def get_recurring(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(models.RecurringPayment, payment_id)
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    return payment


@router.put("/recurring-payments/{payment_id}", response_model=schemas.RecurringPaymentOut)
def update_recurring(payment_id: int, payload: schemas.RecurringPaymentUpdate, db: Session = Depends(get_db)):
    payment = db.query(models.RecurringPayment).with_for_update().filter(models.RecurringPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    if payload.client_version is not None and payment.version != payload.client_version:
        raise HTTPException(
            409,
            "This recurring payment was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(payment, field, value)
    payment.version = (payment.version or 1) + 1
    db.commit()
    db.refresh(payment)
    emit("finance_updated", {})
    return payment


@router.delete("/recurring-payments/{payment_id}", status_code=204)
def delete_recurring(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(models.RecurringPayment, payment_id)
    if not payment:
        raise HTTPException(404, "Recurring payment not found")
    db.delete(payment)
    db.commit()
    emit("finance_updated", {})


# ---------------------------------------------------------------------------
# Compensation — Drivers
# ---------------------------------------------------------------------------

@router.get("/compensation/drivers", response_model=list[schemas.CompensationTransactionOut])
def list_driver_compensation(
    driver_id: Optional[int] = Query(None, description="Internal driver.id"),
    db: Session = Depends(get_db),
):
    q = db.query(models.CompensationTransaction).filter(
        models.CompensationTransaction.person_type == "driver"
    )
    if driver_id:
        q = q.filter(models.CompensationTransaction.person_id == driver_id)
    return q.order_by(models.CompensationTransaction.date.desc()).all()


@insights_router.get("/compensation/drivers/monthly-net-payable")
def driver_monthly_net_payable(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
    driver_ids: str = Query(..., description="Comma-separated drivers.driver_id values, e.g. CGI-D001,CGI-D002"),
    db: Session = Depends(get_db),
):
    """Total Net Payable per driver for one calendar month — the same rules as
    the Driver Compensation page's Salary Record, computed server-side so the
    Customer Insights panel doesn't have to fetch every trip sheet. Keyed by
    the trip's completion date; each trip's net is Regular Pay − (advance −
    driver expenses), where a return trip whose batta isn't applicable has a
    Regular Pay of 0 (only its leftover advance is deducted)."""
    from datetime import date as _date
    year, mon = (int(p) for p in month.split("-"))
    start = _date(year, mon, 1)
    end = _date(year + (mon == 12), mon % 12 + 1, 1)
    ids = [i.strip() for i in driver_ids.split(",") if i.strip()]
    totals = {i: 0.0 for i in ids}
    if not ids:
        return totals

    rows = (
        db.query(models.Trip, models.TripSheet)
        .join(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
        .filter(
            models.Trip.driver_id.in_(ids),
            models.Trip.deleted_at.is_(None),
            models.TripSheet.trip_completed_date >= start,
            models.TripSheet.trip_completed_date < end,
        )
        .all()
    )
    for trip, sheet in rows:
        # A RETURN TRIP not marked batta-applicable pays no batta (it was paid
        # beforehand) — but any advance left in the driver's hand is still
        # deducted, so it isn't forgotten.
        if trip.trip_category == "RETURN TRIP" and not trip.is_batta_applicable:
            regular_pay = 0.0
        else:
            regular_pay = float(
                trip.driver_advance_amount if trip.driver_advance_amount is not None else (sheet.driver_pay or 0)
            )
        outstanding_advance = float(sheet.driver_advance_amount or 0) - float(sheet.driver_expenses_total or 0)
        totals[trip.driver_id] += regular_pay - outstanding_advance

    return {driver_id: round(total, 2) for driver_id, total in totals.items()}


# Attendance statuses that earn a day of Cleaner Batta. "On Workshop" days
# earn Workshop Batta instead (WORKSHOP_BATTA_STATUSES).
CLEANER_BATTA_STATUSES = ("Present", "On Trip", "On Halt")
# Attendance statuses that earn a day of Workshop Batta.
WORKSHOP_BATTA_STATUSES = ("On Workshop",)


def _daily_batta_rows(db: Session, driver_id: str, statuses, history_model, fee_attr: str, fee_label: str):
    """One row per attendance day in `statuses`, each priced at the branch
    fee `fee_attr` of the branch of the truck the driver had that day, at the
    fee that applied that day:
      truck  — the trip the driver was on that day; else the truck they were
               assigned to that day (assignment history); else their current truck;
      branch — that truck's branch that day (truck branch history);
      fee    — that branch's fee that day (`history_model`)."""
    from bisect import bisect_right

    def day_of(dt):
        return dt.date() if hasattr(dt, "date") and callable(dt.date) else dt

    attendance = (
        db.query(models.DriverAttendance)
        .filter(models.DriverAttendance.driver_id == driver_id,
                models.DriverAttendance.status.in_(statuses))
        .order_by(models.DriverAttendance.date)
        .all()
    )
    if not attendance:
        return []

    # Trips: the truck actually driven, scheduled date → completed date.
    trip_spans = []
    for trip, closure in (
        db.query(models.Trip, models.TripClosure)
        .outerjoin(models.TripClosure, models.TripClosure.trip_id == models.Trip.id)
        .filter(models.Trip.driver_id == driver_id, models.Trip.deleted_at.is_(None),
                models.Trip.scheduled_date.isnot(None), models.Trip.vehicle_id.isnot(None))
        .all()
    ):
        start = trip.scheduled_date
        end = (closure.trip_completed_date if closure and closure.trip_completed_date else start)
        if end < start:
            end = start
        trip_spans.append((start, end, trip.vehicle_id, trip.trip_id))
    trip_spans.sort()

    # Assignment history (as of the end of each day).
    events = (
        db.query(models.DriverAssignmentEditEvent)
        .filter(models.DriverAssignmentEditEvent.driver_id == driver_id)
        .order_by(models.DriverAssignmentEditEvent.created_at)
        .all()
    )
    event_days = [day_of(e.created_at) for e in events]
    current = db.query(models.DriverAssignment).filter(models.DriverAssignment.driver_id == driver_id).first()

    trucks = {t.truck_id: t for t in db.query(models.Truck).all()}
    branch_hist: dict[int, list] = {}
    for h in db.query(models.TruckBranchHistory).order_by(models.TruckBranchHistory.changed_at).all():
        branch_hist.setdefault(h.truck_id, []).append(h)
    branches = {b.name: b for b in db.query(models.Branch).all()}
    fee_hist: dict[int, list] = {}
    for f in db.query(history_model).order_by(history_model.effective_from).all():
        fee_hist.setdefault(f.branch_id, []).append(f)

    def truck_on(d):
        for start, end, vehicle, trip_code in reversed(trip_spans):
            if start <= d <= end:
                return vehicle, f"Trip {trip_code}"
        i = bisect_right(event_days, d)
        if i > 0:
            e = events[i - 1]
            return (e.vehicle_id, "Assigned truck") if e.event == "Driver Assigned" else (None, "No truck assigned")
        return (current.vehicle_id if current else None), "Current truck"

    def branch_on(truck, d):
        hist = branch_hist.get(truck.id, [])
        before = [h for h in hist if day_of(h.changed_at) <= d]
        if before:
            return before[-1].to_branch
        if hist and hist[0].from_branch:
            return hist[0].from_branch
        return truck.branch_registered_to

    def fee_on(branch, d):
        hist = fee_hist.get(branch.id, [])
        before = [f for f in hist if day_of(f.effective_from) <= d]
        if before:
            return float(getattr(before[-1], fee_attr) or 0)
        return float(getattr(hist[0], fee_attr) or 0) if hist else float(getattr(branch, fee_attr) or 0)

    rows = []
    for a in attendance:
        vehicle, source = truck_on(a.date)
        truck = trucks.get(vehicle) if vehicle else None
        branch_name = branch_on(truck, a.date) if truck else None
        branch = branches.get(branch_name) if branch_name else None
        rate = fee_on(branch, a.date) if branch else 0.0
        note = None
        if not truck:
            note = "No truck for this day — no branch fee applied"
        elif not branch:
            note = f"Branch '{branch_name or '—'}' not found"
        elif rate <= 0:
            note = f"No {fee_label} set for {branch.name}"
        rows.append({
            "date": a.date.isoformat(),
            "status": a.status,
            "truck_id": truck.truck_id if truck else None,
            "truck_registration": truck.registration_number if truck else None,
            "truck_source": source,
            "branch": branch.name if branch else branch_name,
            "rate": round(rate, 2),
            "amount": round(rate, 2),
            "note": note,
        })
    rows.reverse()  # newest first
    return rows


@router.get("/compensation/cleaner-batta")
def driver_cleaner_batta(
    driver_id: str = Query(..., description="drivers.driver_id, e.g. CGI-D0001"),
    db: Session = Depends(get_db),
):
    """Driver Compensation → Cleaner Batta Record: each Present / On Trip /
    On Halt day at the branch's Cleaner Batta Fee (see _daily_batta_rows)."""
    rows = _daily_batta_rows(db, driver_id, CLEANER_BATTA_STATUSES,
                             models.BranchCleanerBattaFeeHistory, "cleaner_batta_fee", "Cleaner Batta Fee")
    return {"statuses": list(CLEANER_BATTA_STATUSES), "rows": rows}


@router.get("/compensation/workshop-batta")
def driver_workshop_batta(
    driver_id: str = Query(..., description="drivers.driver_id, e.g. CGI-D0001"),
    db: Session = Depends(get_db),
):
    """Driver Compensation → Workshop Batta Record: each On Workshop day at the
    branch's On Workshop Batta Fee (see _daily_batta_rows)."""
    rows = _daily_batta_rows(db, driver_id, WORKSHOP_BATTA_STATUSES,
                             models.BranchWorkshopBattaFeeHistory, "workshop_batta_fee", "On Workshop Batta Fee")
    return {"statuses": list(WORKSHOP_BATTA_STATUSES), "rows": rows}


@router.get("/compensation/edit-events", response_model=list[schemas.CompensationEditEventListOut])
def list_all_compensation_edit_events(
    person_type: Optional[str] = Query(None, description="'driver' or 'staff'; omit for both"),
    db: Session = Depends(get_db),
):
    """Every Add/Delete event ever logged, across every compensation
    transaction — the page-wide "Edit History" log shared by the Driver
    Compensation and Staff Compensation pages (each passes its own
    person_type). Most recent first."""
    q = db.query(models.CompensationEditEvent)
    if person_type:
        q = q.filter(models.CompensationEditEvent.person_type == person_type)
    return q.order_by(models.CompensationEditEvent.created_at.desc(), models.CompensationEditEvent.id.desc()).all()


@router.post("/compensation/drivers", response_model=schemas.CompensationTransactionOut, status_code=201)
def add_driver_compensation(
    payload: schemas.CompensationTransactionCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if payload.person_type != "driver":
        raise HTTPException(400, "person_type must be 'driver' for this endpoint")
    driver = db.get(models.Driver, payload.person_id)
    if not driver:
        raise HTTPException(404, "Driver not found.")
    tx = models.CompensationTransaction(**payload.model_dump(), person_name=driver.name)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    db.add(models.CompensationEditEvent(
        person_type="driver", person_id=tx.person_id, person_name=tx.person_name,
        tx_type=tx.type, amount=tx.amount, tx_date=tx.date,
        event="Transaction Added", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("finance_updated", {})
    return tx


# ---------------------------------------------------------------------------
# Compensation — Staff
# ---------------------------------------------------------------------------

@router.get("/compensation/staff", response_model=list[schemas.CompensationTransactionOut])
def list_staff_compensation(
    staff_id: Optional[int] = Query(None, description="Internal staff.id"),
    db: Session = Depends(get_db),
):
    q = db.query(models.CompensationTransaction).filter(
        models.CompensationTransaction.person_type == "staff"
    )
    if staff_id:
        q = q.filter(models.CompensationTransaction.person_id == staff_id)
    return q.order_by(models.CompensationTransaction.date.desc()).all()


@router.post("/compensation/staff", response_model=schemas.CompensationTransactionOut, status_code=201)
def add_staff_compensation(
    payload: schemas.CompensationTransactionCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if payload.person_type != "staff":
        raise HTTPException(400, "person_type must be 'staff' for this endpoint")
    staff = db.get(models.Staff, payload.person_id)
    if not staff:
        raise HTTPException(404, "Staff member not found.")
    tx = models.CompensationTransaction(**payload.model_dump(), person_name=staff.name)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    db.add(models.CompensationEditEvent(
        person_type="staff", person_id=tx.person_id, person_name=tx.person_name,
        tx_type=tx.type, amount=tx.amount, tx_date=tx.date,
        event="Transaction Added", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("finance_updated", {})
    return tx


@router.delete("/compensation/{tx_id}", status_code=204)
def delete_compensation(
    tx_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    tx = db.get(models.CompensationTransaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    db.add(models.CompensationEditEvent(
        person_type=tx.person_type, person_id=tx.person_id, person_name=tx.person_name,
        tx_type=tx.type, amount=tx.amount, tx_date=tx.date,
        event="Transaction Deleted", actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(tx)
    db.commit()
    emit("finance_updated", {})
