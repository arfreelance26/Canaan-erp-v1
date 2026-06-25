from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from database import get_db
import models, schemas

router = APIRouter(prefix="/trips", tags=["Trips"])

ACTIVE_STATUSES = {"Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"}


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
    if db.query(models.Trip).filter(models.Trip.trip_id == payload.trip_id).first():
        raise HTTPException(400, f"Trip ID {payload.trip_id} already exists")
    if db.query(models.Trip).filter(models.Trip.booking_reference_no == payload.booking_reference_no).first():
        raise HTTPException(400, f"Booking reference {payload.booking_reference_no} already exists")
    trip = models.Trip(**payload.model_dump())
    db.add(trip)
    db.commit()
    db.refresh(trip)
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
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(trip, field, value)
    db.commit()
    db.refresh(trip)
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
    return trip


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
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.status != "Completed":
        raise HTTPException(400, "Only Completed trips can be closed")
    if trip.closure:
        # Allow re-closure (update)
        closure = trip.closure
        for field, value in payload.model_dump().items():
            setattr(closure, field, value)
        db.commit()
        db.refresh(closure)
        return closure
    closure = models.TripClosure(trip_id=trip_id, **payload.model_dump())
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
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not trip.closure:
        raise HTTPException(400, "Trip must be closed before adding a trip sheet")

    data = payload.model_dump(exclude={"diesel_entries"})
    diesel_entries_data = payload.diesel_entries

    if trip.sheet:
        sheet = trip.sheet
        for field, value in data.items():
            setattr(sheet, field, value)
        # Replace diesel entries
        for entry in sheet.diesel_entries:
            db.delete(entry)
        db.flush()
    else:
        sheet = models.TripSheet(trip_id=trip_id, **data)
        db.add(sheet)
        db.flush()

    for entry_data in diesel_entries_data:
        entry = models.TripSheetDieselEntry(
            trip_sheet_id=sheet.id,
            **entry_data.model_dump(),
        )
        db.add(entry)

    db.commit()
    db.refresh(sheet)
    return sheet


@router.get("/{trip_id}/sheet", response_model=schemas.TripSheetOut)
def get_trip_sheet(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.sheet).joinedload(models.TripSheet.diesel_entries)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not trip.sheet:
        raise HTTPException(404, "No trip sheet for this trip")
    return trip.sheet


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


@router.post("/{trip_id}/invoice", response_model=schemas.TripOut)
def generate_invoice(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.verification_status != "verified":
        raise HTTPException(400, "Trip must be verified before generating an invoice")
    trip.is_invoiced = True
    db.commit()
    db.refresh(trip)
    return _enrich(trip)
