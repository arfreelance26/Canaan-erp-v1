from datetime import date as date_type
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from database import get_db
import models, schemas
from duplicate_checks import check_trip_duplicates

router = APIRouter(prefix="/trips", tags=["Trips"])


def _remember_customer_origin(db: Session, customer_id, origin: Optional[str]):
    """Persist a customer's typed origin so it can be auto-fetched next time the same customer is selected."""
    if not customer_id or not origin or not origin.strip():
        return
    origin = origin.strip()
    exists = db.query(models.CustomerOrigin).filter(
        models.CustomerOrigin.customer_id == customer_id,
        func.lower(models.CustomerOrigin.origin_name) == origin.lower(),
    ).first()
    if not exists:
        db.add(models.CustomerOrigin(customer_id=customer_id, origin_name=origin))
        db.commit()

ACTIVE_STATUSES = {"Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"}


def _check_driver_truck_conflict(db: Session, driver_id, vehicle_id, exclude_trip_id=None):
    """Raise 400 if the driver or truck is already on an active trip."""
    q = db.query(models.Trip).filter(models.Trip.status.in_(ACTIVE_STATUSES))
    if exclude_trip_id is not None:
        q = q.filter(models.Trip.id != exclude_trip_id)
    if driver_id:
        conflict = q.filter(models.Trip.driver_id == driver_id).first()
        if conflict:
            raise HTTPException(
                400,
                f"Driver {driver_id} is already active on trip {conflict.trip_id}. "
                "Close that trip before assigning a new one."
            )
    if vehicle_id:
        conflict = q.filter(models.Trip.vehicle_id == vehicle_id).first()
        if conflict:
            raise HTTPException(
                400,
                f"Truck {vehicle_id} is already active on trip {conflict.trip_id}. "
                "Close that trip before assigning a new one."
            )


def _enrich(trip: models.Trip) -> dict:
    """Return a dict matching TripOut, including computed has_closure / has_sheet."""
    data = {c.name: getattr(trip, c.name) for c in trip.__table__.columns}
    data["has_closure"] = trip.closure is not None
    data["has_sheet"] = trip.sheet is not None
    return data


# ---------------------------------------------------------------------------
# Trips CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=list[schemas.TripOut])
def list_trips(
    status: Optional[str] = Query(None, description="Filter by trip status"),
    db: Session = Depends(get_db),
):
    q = db.query(models.Trip).options(
        joinedload(models.Trip.closure),
        joinedload(models.Trip.sheet),
    )
    if status:
        q = q.filter(models.Trip.status == status)
    return [_enrich(t) for t in q.order_by(models.Trip.booking_created_date.desc()).all()]


@router.post("", response_model=schemas.TripOut, status_code=201)
def create_trip(payload: schemas.TripCreate, db: Session = Depends(get_db)):
    check_trip_duplicates(db, payload)
    if db.query(models.Trip).filter(models.Trip.trip_id == payload.trip_id).first():
        raise HTTPException(400, f"Trip ID {payload.trip_id} already exists")
    if db.query(models.Trip).filter(models.Trip.booking_reference_no == payload.booking_reference_no).first():
        raise HTTPException(400, f"Booking reference {payload.booking_reference_no} already exists")
    _check_driver_truck_conflict(db, payload.driver_id, payload.vehicle_id)
    trip = models.Trip(**payload.model_dump())
    db.add(trip)
    db.commit()
    db.refresh(trip)
    _remember_customer_origin(db, trip.customer_id, trip.origin)
    return _enrich(trip)


@router.get("/{trip_id}", response_model=schemas.TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    return _enrich(trip)


@router.put("/{trip_id}", response_model=schemas.TripOut)
def update_trip(trip_id: int, payload: schemas.TripBase, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    update_data = payload.model_dump(exclude_unset=True)
    effective_driver = update_data.get("driver_id", trip.driver_id)
    effective_vehicle = update_data.get("vehicle_id", trip.vehicle_id)
    _check_driver_truck_conflict(db, effective_driver, effective_vehicle, exclude_trip_id=trip_id)
    for field, value in update_data.items():
        setattr(trip, field, value)
    db.commit()
    db.refresh(trip)
    _remember_customer_origin(db, trip.customer_id, trip.origin)
    return _enrich(trip)


@router.patch("/{trip_id}/status", response_model=schemas.TripOut)
def update_trip_status(trip_id: int, payload: schemas.TripStatusUpdate, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    trip.status = payload.status
    db.commit()
    db.refresh(trip)
    return _enrich(trip)


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    db.delete(trip)
    db.commit()


# ---------------------------------------------------------------------------
# Trip Closure  — POST /trips/{id}/close
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/close", response_model=schemas.TripClosureOut, status_code=201)
def close_trip(trip_id: int, payload: schemas.TripClosureCreate, db: Session = Depends(get_db)):
    # SELECT FOR UPDATE — serialises concurrent requests on this trip row
    trip = db.query(models.Trip).with_for_update().filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.status != "Completed":
        raise HTTPException(400, "Only Completed trips can be closed")

    data = payload.model_dump(exclude={"client_version"})

    if trip.closure:
        closure = trip.closure
        # Optimistic locking: reject if client is working from a stale version
        if payload.client_version is not None and closure.version != payload.client_version:
            raise HTTPException(
                409,
                "This closure was modified by someone else while you were editing. "
                "Please refresh the page to get the latest data and try again."
            )
        for field, value in data.items():
            setattr(closure, field, value)
        closure.version = (closure.version or 1) + 1
        db.commit()
        db.refresh(closure)
        return closure

    # New closure — UNIQUE constraint on trip_id is the final safety net
    # (global IntegrityError handler converts duplicates to 409)
    closure = models.TripClosure(trip_id=trip_id, **data)
    db.add(closure)
    db.commit()
    db.refresh(closure)
    return closure


@router.get("/{trip_id}/closure", response_model=schemas.TripClosureOut)
def get_closure(trip_id: int, db: Session = Depends(get_db)):
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not trip.closure:
        raise HTTPException(404, "No closure record for this trip")
    return trip.closure


# ---------------------------------------------------------------------------
# Trip Sheet  — POST /trips/{id}/sheet
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/sheet", response_model=schemas.TripSheetOut, status_code=201)
def upsert_trip_sheet(trip_id: int, payload: schemas.TripSheetCreate, db: Session = Depends(get_db)):
    # SELECT FOR UPDATE — serialises concurrent requests on this trip row
    trip = db.query(models.Trip).with_for_update().filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not trip.closure:
        raise HTTPException(400, "Trip must be closed before adding a trip sheet")

    data = payload.model_dump(exclude={"client_version"})
    is_new = not trip.sheet

    if trip.sheet:
        sheet = trip.sheet
        # Optimistic locking: reject if client is working from a stale version
        if payload.client_version is not None and sheet.version != payload.client_version:
            raise HTTPException(
                409,
                "This trip sheet was modified by someone else while you were editing. "
                "Please refresh the page to get the latest data and try again."
            )
        for field, value in data.items():
            setattr(sheet, field, value)
        sheet.version = (sheet.version or 1) + 1
    else:
        # New sheet — UNIQUE constraint on trip_id is the final safety net
        sheet = models.TripSheet(trip_id=trip_id, **data)
        db.add(sheet)

    db.commit()
    db.refresh(sheet)

    # Resolve the truck once — used for both odometer update and maintenance records
    vehicle_id = payload.vehicle_id or trip.vehicle_id
    truck = db.query(models.Truck).filter(models.Truck.truck_id == vehicle_id).first() if vehicle_id else None

    # Always update the truck's current odometer to end_km if it advances it
    if truck and payload.end_km:
        end_km_val = int(payload.end_km)
        if end_km_val > int(truck.odometer or 0):
            truck.odometer = end_km_val
            db.commit()

    # On first save, auto-create a maintenance record for each major repair
    if is_new and truck:
        record_date = payload.trip_sheet_date or date_type.today()
        odometer = int(payload.end_km or 0)
        trip_ref = f"Trip Sheet — {trip.trip_id}"

        auto_records = []
        for repair in (payload.major_repairs or []):
            name = (repair.get("name") or "").strip()
            cost = repair.get("cost", 0) or 0
            if name and cost > 0:
                auto_records.append(models.MaintenanceRecord(
                    truck_id=truck.id,
                    date=record_date,
                    odometer=odometer,
                    maintenance_type=name,
                    description=trip_ref,
                    cost=cost,
                ))
        if auto_records:
            db.add_all(auto_records)
            db.commit()

    return sheet


@router.get("/{trip_id}/sheet", response_model=Optional[schemas.TripSheetOut])
def get_trip_sheet(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    return trip.sheet  # None → serialised as JSON null with 200


# ---------------------------------------------------------------------------
# Verification & Finalization Workflow
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/verify", response_model=schemas.TripOut)
def verify_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not trip.sheet:
        raise HTTPException(400, "Trip sheet must exist before verifying")
    trip.verification_status = "verified"
    db.commit()
    db.refresh(trip)
    return _enrich(trip)


@router.post("/{trip_id}/flag", response_model=schemas.TripOut)
def flag_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    trip.verification_status = "flagged"
    db.commit()
    db.refresh(trip)
    return _enrich(trip)

@router.get("/autocomplete-values")
def get_autocomplete_values(db: Session = Depends(get_db)):
    origins = (
        db.query(models.Trip.origin)
        .filter(models.Trip.origin.isnot(None), models.Trip.origin != "")
        .distinct()
        .all()
    )
    destinations = (
        db.query(models.Trip.destination)
        .filter(models.Trip.destination.isnot(None), models.Trip.destination != "")
        .distinct()
        .all()
    )
    return {
        "origins": sorted({r[0] for r in origins}),
        "destinations": sorted({r[0] for r in destinations}),
    }


@router.get("/invoices/next-seq")
def get_next_invoice_seq(invoice_type: str, db: Session = Depends(get_db)):
    from datetime import date
    today = date.today()
    start_year = today.year if today.month >= 4 else today.year - 1
    fy = f"{str(start_year)[2:]}-{str(start_year+1)[2:]}"

    count = db.query(models.TripInvoice).filter(models.TripInvoice.invoice_type == invoice_type).count()
    next_num = str(count + 1).zfill(3)

    if invoice_type == "Transport Memo":
        invoice_no = f"TM/{fy}/{next_num}"
    elif invoice_type == "Bill of Supply":
        invoice_no = f"CGI/{fy}/{next_num}"
    else:
        invoice_no = f"CGI/{fy}/{next_num}"

    return {"invoice_no": invoice_no}

@router.get("/{trip_id}/invoice", response_model=schemas.TripInvoiceOut)
def get_invoice(trip_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.TripInvoice).filter(models.TripInvoice.trip_id == trip_id).first()
    if not invoice:
        raise HTTPException(404, "No invoice for this trip")
    return invoice


@router.post("/{trip_id}/invoice", response_model=schemas.TripOut)
def generate_invoice(trip_id: int, payload: schemas.TripInvoiceCreate, db: Session = Depends(get_db)):
    # SELECT FOR UPDATE — serialises concurrent invoice generation on the same trip
    trip = db.query(models.Trip).with_for_update().options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not trip.sheet:
        raise HTTPException(400, "Trip sheet must exist before generating an invoice")
    trip.is_invoiced = True
    existing = db.query(models.TripInvoice).filter(models.TripInvoice.trip_id == trip_id).first()
    if existing:
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(existing, k, v)
        existing.version = (existing.version or 1) + 1
    else:
        # New invoice — UNIQUE constraint on trip_id is the final safety net
        db.add(models.TripInvoice(trip_id=trip_id, **payload.model_dump(exclude_unset=True)))
    db.commit()
    db.refresh(trip)
    return _enrich(trip)
