import re
import json
from decimal import Decimal
from datetime import date as date_type, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, text, or_, inspect as sa_inspect
from sqlalchemy.orm import Session, joinedload
from database import get_db
from security import require_roles, get_current_user, TokenUser
import models, schemas
from duplicate_checks import check_trip_duplicates
from websocket_manager import emit

router = APIRouter(prefix="/trips", tags=["Trips"])

# All roles that should receive trip-event notifications
_ALL_ROLES = "Admin,Commercial Manager,Assistant Commercial Manager,Accounts,Trip Sheet Register,Yard Supervisor,Maintenance"


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


def _enrich(trip: models.Trip, driver_names: dict = {}, truck_regs: dict = {}) -> dict:
    """Return a dict matching TripOut, including computed has_closure / has_sheet."""
    data = {c.name: getattr(trip, c.name) for c in trip.__table__.columns}
    data["has_closure"] = trip.closure is not None
    data["has_sheet"] = trip.sheet is not None
    data["trip_sheet_date"] = trip.sheet.trip_sheet_date if trip.sheet else None
    data["sheet_hire_amount"] = float(trip.sheet.hire_amount) if trip.sheet and trip.sheet.hire_amount is not None else None

    driver_name = driver_names.get(trip.driver_id)
    truck_reg = truck_regs.get(trip.vehicle_id)
    # Single-trip callers (mutation endpoints) don't pass the lookup maps. Resolve the
    # names from the trip's own session so the returned row keeps its driver/truck values —
    # otherwise the frontend's optimistic update blanks them and search-filtered rows vanish
    # until the next full refetch.
    if driver_name is None or truck_reg is None:
        session = sa_inspect(trip).session
        if session is not None:
            if driver_name is None and trip.driver_id:
                driver_name = session.query(models.Driver.name).filter(
                    models.Driver.driver_id == trip.driver_id
                ).scalar()
            if truck_reg is None and trip.vehicle_id:
                truck_reg = session.query(models.Truck.registration_number).filter(
                    models.Truck.truck_id == trip.vehicle_id
                ).scalar()
    data["driver_name"] = driver_name
    data["truck_registration"] = truck_reg
    return data


SHEET_COLLECTOR_ROLES = ("Yard Supervisor",)


# ---------------------------------------------------------------------------
# Trips CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=list[schemas.TripOut])
def list_trips(
    status: Optional[str] = Query(None, description="Filter by trip status"),
    search: Optional[str] = Query(None, description="Search trip ID, container, truck, origin, destination"),
    limit: Optional[int] = Query(None, le=100, description="Max rows to return (AI use); omit for full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.Trip).options(
        joinedload(models.Trip.closure),
        joinedload(models.Trip.sheet),
    ).filter(models.Trip.deleted_at.is_(None))
    if status:
        q = q.filter(models.Trip.status == status)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(or_(
            models.Trip.trip_id.ilike(s),
            models.Trip.container_number.ilike(s),
            models.Trip.container_number_1.ilike(s),
            models.Trip.container_number_2.ilike(s),
            models.Trip.vehicle_id.ilike(s),
            models.Trip.origin.ilike(s),
            models.Trip.destination.ilike(s),
        ))
    q = q.order_by(models.Trip.booking_created_date.desc())
    if limit is not None:
        q = q.offset(offset).limit(limit)
    trips = q.all()

    driver_names = {d.driver_id: d.name for d in db.query(models.Driver.driver_id, models.Driver.name).all()}
    truck_regs = {t.truck_id: t.registration_number for t in db.query(models.Truck.truck_id, models.Truck.registration_number).all()}

    return [_enrich(t, driver_names, truck_regs) for t in trips]


@router.get("/customer-profitability", response_model=list[schemas.CustomerProfitabilityOut], tags=["Trips"])
def get_customer_profitability(db: Session = Depends(get_db)):
    """
    Per-customer profitability aggregated from completed trips that have a trip sheet.
    Revenue = trip_sheet.hire_amount, Expense = trip_sheet.total_expense.
    Returns customers ranked by total net profit, with route breakdown and last 20 trips each.
    """
    from collections import defaultdict

    rows = (
        db.query(
            models.Trip.customer_id,
            models.Customer.name.label("customer_name"),
            models.TripSheet.hire_amount,
            models.TripSheet.total_expense,
            models.TripSheet.total_km,
            models.TripSheet.from_location,
            models.TripSheet.to_location,
            models.TripSheet.trip_completed_date,
            models.Trip.trip_id,
        )
        .join(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
        .join(models.Customer, models.Customer.id == models.Trip.customer_id)
        .filter(models.Trip.status == "Completed")
        .order_by(models.TripSheet.trip_completed_date.desc())
        .all()
    )

    customer_map: dict = {}
    customer_trips: dict = defaultdict(list)

    for row in rows:
        cid = str(row.customer_id)
        hire = float(row.hire_amount or 0)
        expense = float(row.total_expense or 0)
        km = float(row.total_km or 0)

        if cid not in customer_map:
            customer_map[cid] = {
                "customer_id": cid,
                "customer_name": row.customer_name or "—",
                "trip_count": 0,
                "total_revenue": 0.0,
                "total_expense": 0.0,
                "total_km": 0.0,
                "routes": defaultdict(lambda: {"trip_count": 0, "revenue": 0.0, "expense": 0.0, "km": 0.0}),
            }

        d = customer_map[cid]
        d["trip_count"] += 1
        d["total_revenue"] += hire
        d["total_expense"] += expense
        d["total_km"] += km

        route_key = f"{(row.from_location or '').strip() or '—'} → {(row.to_location or '').strip() or '—'}"
        r = d["routes"][route_key]
        r["trip_count"] += 1
        r["revenue"] += hire
        r["expense"] += expense
        r["km"] += km

        if len(customer_trips[cid]) < 20:
            trip_profit = hire - expense
            customer_trips[cid].append({
                "trip_id": row.trip_id,
                "date": row.trip_completed_date.isoformat() if row.trip_completed_date else None,
                "route": route_key,
                "revenue": round(hire, 2),
                "expense": round(expense, 2),
                "profit": round(trip_profit, 2),
                "margin_pct": round((trip_profit / hire * 100) if hire > 0 else 0.0, 2),
                "km": round(km, 2),
            })

    result = []
    for cid, d in customer_map.items():
        revenue = d["total_revenue"]
        expense = d["total_expense"]
        profit = revenue - expense
        margin = round((profit / revenue * 100) if revenue > 0 else 0.0, 2)

        routes = []
        for route_name, r in d["routes"].items():
            r_profit = r["revenue"] - r["expense"]
            r_margin = round((r_profit / r["revenue"] * 100) if r["revenue"] > 0 else 0.0, 2)
            routes.append({
                "route": route_name,
                "trip_count": r["trip_count"],
                "revenue": round(r["revenue"], 2),
                "expense": round(r["expense"], 2),
                "profit": round(r_profit, 2),
                "margin_pct": r_margin,
                "avg_km": round(r["km"] / r["trip_count"] if r["trip_count"] > 0 else 0, 2),
            })
        routes.sort(key=lambda x: x["profit"], reverse=True)

        result.append({
            "customer_id": cid,
            "customer_name": d["customer_name"],
            "trip_count": d["trip_count"],
            "total_revenue": round(revenue, 2),
            "total_expense": round(expense, 2),
            "total_profit": round(profit, 2),
            "profit_margin_pct": margin,
            "total_km": round(d["total_km"], 2),
            "routes": routes,
            "recent_trips": customer_trips[cid],
        })

    result.sort(key=lambda x: x["total_profit"], reverse=True)
    return result


@router.post("", response_model=schemas.TripOut, status_code=201)
def create_trip(
    payload: schemas.TripCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
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
    emit("trip_created", {"trip_id": trip.trip_id})
    emit("trip_assigned", {
        "trip_id": trip.trip_id,
        "origin": trip.origin or "",
        "destination": trip.destination or "",
        "assigned_by": current_user.name,
    })
    # Persist so users who were offline still see it on reconnect
    db.add(models.Notification(
        event_type="trip_assigned",
        title=f"Trip {trip.trip_id} assigned",
        message=json.dumps({"origin": trip.origin or "", "destination": trip.destination or "", "by": current_user.name}),
        trip_id_str=trip.trip_id,
        booking_reference_no=trip.booking_reference_no,
        target_roles=_ALL_ROLES,
        created_by=current_user.name,
        created_by_role=current_user.role,
    ))
    db.commit()
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


@router.get("/cargo-references", response_model=list[str])
def list_cargo_references(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Trip.cargo_reference)
        .filter(models.Trip.cargo_reference.isnot(None), models.Trip.cargo_reference != "")
        .distinct()
        .all()
    )
    return sorted({r[0].strip() for r in rows if r[0] and r[0].strip()})


@router.get("/shipping-lines", response_model=list[str])
def list_shipping_lines(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Trip.shipping_line)
        .filter(models.Trip.shipping_line.isnot(None), models.Trip.shipping_line != "")
        .distinct()
        .all()
    )
    return sorted({r[0].strip() for r in rows if r[0] and r[0].strip()})


def _current_fy() -> str:
    today = date_type.today()
    start_year = today.year if today.month >= 4 else today.year - 1
    return f"{str(start_year)[2:]}{str(start_year+1)[2:]}"


# Each invoice series (its prefix + the invoice types that share the counter).
# Bill of Supply and Tax Invoice deliberately share the "T" series so their
# numbers form one continuous, non-overlapping sequence.
def _series_for(invoice_type: str):
    if invoice_type == "Transport Memo":
        return "TM", ["Transport Memo"]
    return "T", ["Bill of Supply", "Tax Invoice"]


def _next_invoice_no(db: Session, invoice_type: str, fy: str) -> str:
    """Next number in the series, computed as MAX(existing suffix) + 1.

    Using the max existing suffix (not COUNT) guarantees the new number is
    strictly greater than every number already issued in this series for the FY,
    so it can never collide with an existing 'T####' or 'BS####' — even if rows
    were ever removed. Existing invoices are never modified.
    """
    prefix, types = _series_for(invoice_type)
    # Also search the old hyphenated FY format (e.g. CGI26-27/...) so the
    # counter stays continuous when invoices were created before this format change.
    fy_old = f"{fy[:2]}-{fy[2:]}"
    rows = db.query(models.TripInvoice.invoice_no).filter(
        models.TripInvoice.invoice_type.in_(types),
        or_(
            models.TripInvoice.invoice_no.like(f"CGI{fy}/%"),
            models.TripInvoice.invoice_no.like(f"CGI{fy_old}/%"),
        ),
    ).all()
    max_seq = 0
    for (no,) in rows:
        if not no:
            continue
        m = re.search(r"(\d+)$", no)  # trailing digits, ignores the letter prefix
        if m:
            max_seq = max(max_seq, int(m.group(1)))
    return f"CGI{fy}/{prefix}{max_seq + 1}"


@router.get("/ai-counts")
def get_ai_counts(db: Session = Depends(get_db)):
    """Pure SQL counts for the AI assistant — no row loading, fast at any scale."""
    _ACTIVE = {"Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"}

    def _count(*filters):
        return db.query(func.count(models.Trip.id)).filter(*filters).scalar() or 0

    return {
        "total_trips": _count(),
        "active": _count(models.Trip.status.in_(_ACTIVE)),
        "pending_sheet_collection": _count(
            models.Trip.trip_sheet_collected == False,
            models.Trip.status.in_(_ACTIVE | {"Completed"}),
        ),
        "pending_reconciliation": _count(
            models.Trip.trip_sheet_collected == True,
            models.Trip.trip_sheet_received == False,
        ),
        "pending_verification": _count(
            models.Trip.trip_sheet_received == True,
            models.Trip.verification_status == "pending",
        ),
        "pending_invoice": _count(
            models.Trip.verification_status == "verified",
            models.Trip.is_invoiced == False,
            models.Trip.invoice_required == True,
        ),
        "invoiced": _count(models.Trip.is_invoiced == True),
    }


@router.get("/invoices/next-seq")
def get_next_invoice_seq(invoice_type: str, db: Session = Depends(get_db)):
    # Preview only — the authoritative number is assigned atomically at save time
    # (see generate_invoice), so this may differ if others save in between.
    return {"invoice_no": _next_invoice_no(db, invoice_type, _current_fy())}


@router.get("/deleted-ids", dependencies=[Depends(require_roles())])
def list_deleted_trip_ids(db: Session = Depends(get_db)):
    """Admin only: ids of trips currently soft-deleted (deleted_at IS NOT NULL).

    Lets the "Deleted Trips" page (which lists from the deletion_approval_requests
    audit trail) tell apart a still-deleted trip from one that was since restored —
    the audit row itself never changes on restore, since it's a historical record,
    not a live status flag.
    """
    rows = db.query(models.Trip.id).filter(models.Trip.deleted_at.isnot(None)).all()
    return [i for (i,) in rows]


@router.get("/{trip_id}", response_model=schemas.TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    return _enrich(trip)


# Fields the trip sheet MIRRORS from the trip (booking). The trip is the source of
# truth; whenever one of these changes on the trip, the linked sheet's copy must be
# updated too — otherwise every screen and P&L calc that reads the sheet copy goes
# stale (this is the general form of the hire-amount drift bug). Keep this in sync with
# the frontend `tripMirroredFields()` in TripSheetDialog.tsx.
#   trip column                →  trip_sheet column
TRIP_TO_SHEET_MIRROR = {
    "booking_reference_no":     "booking_reference_no",
    "container_number":         "container_number",
    "container_number_1":       "container_number_1",
    "container_number_2":       "container_number_2",
    "container_specification":  "container_type",
    "shipping_line":            "line",
    "trip_category":            "trip_type",
    "vehicle_id":               "vehicle_id",
    "driver_id":                "driver_id",
    "booking_created_date":     "booking_date",
    "scheduled_date":           "trip_scheduled_date",
    "origin":                   "from_location",
    "destination":              "to_location",
    "cha_name":                 "clearing_agent",
    # NOTE: cargo_weight is deliberately NOT mirrored — trips.cargo_weight is a category
    # string ("NORMAL", "Between 20-25 Tons"), whereas trip_sheets.cargo_weight is numeric
    # tons. They share a name but are different fields; syncing would corrupt the sheet.
    "open_load_hire_type":      "open_load_hire_type",
    "rate_per_ton":             "rate_per_ton",
    "transport_hire_amount":    "hire_amount",
    "driver_compensation_type": "driver_compensation_type",
}


def _sync_sheet_from_trip(trip: "models.Trip", changed_keys: set) -> None:
    """Propagate every changed mirrored field from the trip to its sheet (if one exists),
    so a booking edit can never leave the sheet — or anything that reads it — stale."""
    sheet = trip.sheet
    if sheet is None:
        return
    for trip_attr, sheet_attr in TRIP_TO_SHEET_MIRROR.items():
        if trip_attr in changed_keys:
            setattr(sheet, sheet_attr, getattr(trip, trip_attr))
    # trip_sheet_no is derived from the booking reference (CGI… → TS…)
    if "booking_reference_no" in changed_keys and (trip.booking_reference_no or "").startswith("CGI"):
        sheet.trip_sheet_no = "TS" + trip.booking_reference_no[3:]

    # RETURN TRIP driver batta is DERIVED from hire: round(10% of (hire − weight sheet)).
    # When hire changes it must be recomputed, or the stored batta (and the expense totals
    # that include it) go stale. batta feeds calcTripExpenses only, so we adjust
    # trip_expenses_total / total_expense by the delta (driver_expenses_total is unaffected).
    if "transport_hire_amount" in changed_keys and (sheet.trip_type or "").upper() == "RETURN TRIP":
        base = float(sheet.hire_amount or 0) - float(sheet.weight_sheet_expense or 0)
        new_batta = round(base * 0.10) if base > 0 else 0
        old_batta = float(sheet.driver_pay or 0)
        delta = new_batta - old_batta
        if delta:
            sheet.driver_pay = Decimal(str(new_batta))
            if sheet.trip_expenses_total is not None:
                sheet.trip_expenses_total = Decimal(str(round(float(sheet.trip_expenses_total) + delta, 2)))
            if sheet.total_expense is not None:
                sheet.total_expense = Decimal(str(round(float(sheet.total_expense) + delta, 2)))


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
    # Only check conflict when driver or vehicle is actually changing
    driver_changing = effective_driver != trip.driver_id
    vehicle_changing = effective_vehicle != trip.vehicle_id
    if driver_changing or vehicle_changing:
        _check_driver_truck_conflict(
            db,
            effective_driver if driver_changing else None,
            effective_vehicle if vehicle_changing else None,
            exclude_trip_id=trip_id,
        )
    for field, value in update_data.items():
        setattr(trip, field, value)
    # Keep the trip sheet's mirrored copies in sync with the booking (see
    # TRIP_TO_SHEET_MIRROR). Prevents the hire-drift class of bug for ANY mirrored field.
    _sync_sheet_from_trip(trip, set(update_data.keys()))
    db.commit()
    db.refresh(trip)
    _remember_customer_origin(db, trip.customer_id, trip.origin)
    emit("trip_updated", {"trip_id": trip.trip_id, "id": trip.id})
    return _enrich(trip)


@router.patch("/{trip_id}/status", response_model=schemas.TripOut)
def update_trip_status(
    trip_id: int,
    payload: schemas.TripStatusUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    # Cancelling a trip is an Admin-only action
    if payload.status == "Cancelled" and current_user.role != "Admin":
        raise HTTPException(403, "Only an Admin can cancel a trip.")
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    trip.status = payload.status
    db.commit()
    db.refresh(trip)
    emit("trip_updated", {"trip_id": trip.trip_id, "id": trip.id, "status": payload.status})
    return _enrich(trip)


@router.delete("/{trip_id}", status_code=204, dependencies=[Depends(require_roles())])
def delete_trip(trip_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: soft-delete a trip (hides it from every normal listing, keeps its
    closure/sheet/invoice intact). Recoverable from "Deleted Trips" via /restore;
    only /permanent there does an actual, unrecoverable DELETE.

    No approval step needed here (Admin has full authority), but a self-approved
    DeletionApprovalRequest row is still logged so this trip shows up on the
    "Deleted Trips" audit page the same way an Accounts/Commercial-Manager-requested
    deletion does — otherwise the most common deletion path (Admin deleting
    directly) would be invisible in that audit trail.
    """
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.deleted_at is not None:
        raise HTTPException(409, "Trip is already deleted")
    trip_id_str = trip.trip_id
    booking_ref = trip.booking_reference_no
    now = datetime.now(timezone.utc)
    trip.deleted_at = now
    if current_user.id is not None:
        db.add(models.DeletionApprovalRequest(
            resource_type="Trip",
            resource_id=trip_id,
            resource_name=booking_ref or trip_id_str,
            requested_by_staff_id=current_user.id,
            requested_by_name=current_user.name,
            reason="Deleted directly by Admin — no approval required.",
            status="Approved",
            approved_by_name=current_user.name,
            approved_at=now,
        ))
    db.commit()
    emit("trip_deleted", {"trip_db_id": trip_id, "trip_id_str": trip_id_str})


@router.post("/{trip_id}/restore", response_model=schemas.TripOut, dependencies=[Depends(require_roles())])
def restore_trip(trip_id: int, db: Session = Depends(get_db)):
    """Admin only: undo a soft-delete — the trip reappears in Trip History (and
    everywhere else) exactly as it was, with its closure/sheet/invoice untouched."""
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.deleted_at is None:
        raise HTTPException(409, "Trip is not deleted")
    trip.deleted_at = None
    db.commit()
    db.refresh(trip)
    emit("trip_updated", {"trip_id": trip.trip_id, "id": trip.id})
    return _enrich(trip)


@router.delete("/{trip_id}/permanent", status_code=204, dependencies=[Depends(require_roles())])
def permanently_delete_trip(trip_id: int, db: Session = Depends(get_db)):
    """Admin only: irreversibly delete an already soft-deleted trip (cascades to
    closure/sheet/invoice). Only reachable from the "Deleted Trips" page."""
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    trip_id_str = trip.trip_id
    db.delete(trip)
    db.commit()
    emit("trip_deleted", {"trip_db_id": trip_id, "trip_id_str": trip_id_str})


# ---------------------------------------------------------------------------
# Trip Closure  — POST /trips/{id}/close
# ---------------------------------------------------------------------------

@router.post("/{trip_id}/close", response_model=schemas.TripClosureOut, status_code=201)
def close_trip(
    trip_id: int,
    payload: schemas.TripClosureCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
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
    emit("trip_closed", {
        "trip_id": trip_id,
        "trip_id_str": trip.trip_id,
        "origin": trip.origin or "",
        "destination": trip.destination or "",
        "closed_by": current_user.name,
    })
    # Persist so users who were offline still see it on reconnect
    db.add(models.Notification(
        event_type="trip_closed",
        title=f"Trip {trip.trip_id} completed",
        message=json.dumps({"origin": trip.origin or "", "destination": trip.destination or "", "by": current_user.name}),
        trip_id_str=trip.trip_id,
        booking_reference_no=trip.booking_reference_no,
        target_roles=_ALL_ROLES,
        created_by=current_user.name,
        created_by_role=current_user.role,
    ))
    db.commit()
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
def upsert_trip_sheet(trip_id: int, payload: schemas.TripSheetCreate, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
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
    emit("sheet_entered", {"trip_db_id": trip_id, "trip_id_str": trip.trip_id, "is_new": is_new})

    # If the Docs user recorded a KM variance remark, persist a notification and
    # alert Admin + Commercial Manager in real time via WebSocket.
    if payload.km_variance_remark:
        notif = models.Notification(
            event_type="km_variance",
            title=f"KM Variance — {trip.trip_id}",
            message=json.dumps({
                "actualKm": str(payload.total_km or ""),
                "approxKm": str(trip.approx_km or ""),
                "kmRemark": payload.km_variance_remark,
            }),
            trip_id_str=trip.trip_id,
            booking_reference_no=trip.booking_reference_no,
            target_roles="Admin,Commercial Manager",
            created_at=datetime.now(timezone.utc),
        )
        db.add(notif)
        db.commit()
        emit("km_variance_alert", {
            "trip_db_id": trip_id,
            "trip_id_str": trip.trip_id,
            "booking_ref": trip.booking_reference_no or "",
            "actual_km": str(payload.total_km or ""),
            "approx_km": str(trip.approx_km or ""),
            "km_remark": payload.km_variance_remark,
        })

    # Resolve the truck — try payload.vehicle_id first, then trip.vehicle_id
    vehicle_id = (payload.vehicle_id or "").strip() or (trip.vehicle_id or "").strip()
    truck = db.query(models.Truck).filter(models.Truck.truck_id == vehicle_id).first() if vehicle_id else None
    print(f"[TripSheet] vehicle_id='{vehicle_id}' truck={'found id='+str(truck.id) if truck else 'NOT FOUND'}", flush=True)

    # Always update the truck's current odometer to end_km if it advances it
    if truck and payload.end_km:
        end_km_val = int(payload.end_km)
        if end_km_val > int(truck.odometer or 0):
            truck.odometer = end_km_val
            db.commit()

    # Auto-sync diesel entries to FuelLog
    entries = payload.diesel_entries or []
    print(f"[TripSheet] diesel_entries count={len(entries)}", flush=True)
    if truck and entries:
        try:
            for i, entry in enumerate(entries):
                litres = float(entry.get("litres") or 0)
                cost_per_litre = float(entry.get("costPerLitre") or 0)
                total_cost = float(entry.get("totalCost") or 0) or round(litres * cost_per_litre, 2)
                if litres <= 0:
                    print(f"[TripSheet] entry {i} skipped: litres={litres}", flush=True)
                    continue
                raw_odometer = entry.get("odometer") or ""
                odometer_val = int(float(raw_odometer)) if str(raw_odometer).strip() else int(payload.end_km or 0)
                log_date = entry.get("date") or payload.trip_sheet_date or date_type.today()
                fuel_station = (entry.get("fuelStation") or "").strip() or "Trip Sheet"
                marker = f"trip:{trip_id}:{i}"
                print(f"[TripSheet] upserting FuelLog marker={marker} litres={litres} date={log_date}", flush=True)
                # Calculate distance/mileage using same formula as manual create
                prev_log = db.query(models.FuelLog)\
                    .filter(models.FuelLog.truck_id == truck.id, models.FuelLog.odometer < odometer_val)\
                    .order_by(models.FuelLog.odometer.desc())\
                    .first()
                distance = float(odometer_val - prev_log.odometer) if prev_log else 0
                mileage = (distance / litres) if (litres > 0 and distance > 0) else 0

                existing_log = db.query(models.FuelLog).filter(
                    models.FuelLog.truck_id == truck.id,
                    models.FuelLog.logged_by == marker,
                ).first()
                if existing_log:
                    existing_log.date = log_date
                    existing_log.odometer = odometer_val
                    existing_log.litres = litres
                    existing_log.price_per_litre = cost_per_litre
                    existing_log.total_cost = total_cost
                    existing_log.fuel_station = fuel_station
                    existing_log.distance = distance
                    existing_log.mileage = mileage
                    existing_log.entered_by_name = current_user.name
                    existing_log.source = f"Trip Sheet-{trip.trip_id}"
                else:
                    db.add(models.FuelLog(
                        truck_id=truck.id,
                        date=log_date,
                        odometer=odometer_val,
                        litres=litres,
                        price_per_litre=cost_per_litre,
                        total_cost=total_cost,
                        fuel_station=fuel_station,
                        distance=distance,
                        mileage=mileage,
                        logged_by=marker,
                        entered_by_name=current_user.name,
                        source=f"Trip Sheet-{trip.trip_id}",
                    ))
            # Remove stale entries (e.g. user deleted one)
            stale = db.query(models.FuelLog).filter(
                models.FuelLog.truck_id == truck.id,
                models.FuelLog.logged_by.like(f"trip:{trip_id}:%"),
            ).all()
            valid_markers = {f"trip:{trip_id}:{i}" for i in range(len(entries))}
            for log in stale:
                if log.logged_by not in valid_markers:
                    db.delete(log)
            db.commit()
            print(f"[TripSheet] FuelLog sync committed for truck id={truck.id}", flush=True)
        except Exception as exc:
            db.rollback()
            print(f"[TripSheet] FuelLog sync FAILED: {exc}", flush=True)
    elif not truck:
        print(f"[TripSheet] FuelLog sync skipped: truck not found for vehicle_id='{vehicle_id}'", flush=True)
    elif not entries:
        print(f"[TripSheet] FuelLog sync skipped: no diesel entries with litres > 0", flush=True)

    # Sync maintenance records from major repairs (runs on every save, not just first)
    if truck:
        record_date = payload.trip_sheet_date or date_type.today()
        default_odometer = int(payload.end_km or 0)
        trip_ref = f"Trip Sheet — {trip.trip_id}"

        # Delete existing trip-linked maintenance records then recreate
        db.query(models.MaintenanceRecord).filter(
            models.MaintenanceRecord.trip_id == trip_id
        ).delete()

        for repair in (payload.major_repairs or []):
            name = (repair.get("name") or "").strip()
            if not name:
                continue
            cost = float(repair.get("cost") or 0)
            try:
                r_date = date_type.fromisoformat(repair["date"]) if repair.get("date") else record_date
            except (ValueError, KeyError):
                r_date = record_date
            r_odometer = int(repair.get("odometer") or default_odometer)
            r_description = (repair.get("description") or "").strip() or trip_ref
            db.add(models.MaintenanceRecord(
                truck_id=truck.id,
                trip_id=trip_id,
                date=r_date,
                odometer=r_odometer,
                maintenance_type=name,
                description=r_description,
                cost=cost,
            ))
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
# Lorry Receipt / Consignment Note
# ---------------------------------------------------------------------------

@router.patch("/{trip_id}/lr")
def save_lr_data(trip_id: int, payload: schemas.LRDataSave, db: Session = Depends(get_db)):
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    for field, val in payload.model_dump().items():
        setattr(trip, field, val)
    trip.lr_saved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(trip)
    return {"ok": True, "lr_saved_at": trip.lr_saved_at.isoformat()}


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
    if trip.invoice_required is False:
        trip.is_invoiced = True
    # SHIFTING trips are never billed to a customer (no bill_to/hire), so there is
    # nothing to invoice — verifying one goes straight to "Waived Invoice" instead
    # of landing in Verified and waiting on a manual Waive Invoice click. This only
    # fires on a genuine approval; a rejected SHIFTING trip sheet still goes back
    # to Docs for correction like any other trip.
    if trip.trip_category == "SHIFTING":
        trip.invoice_waived = True
    db.commit()
    db.refresh(trip)
    return _enrich(trip)


@router.post("/{trip_id}/resubmit-verification", response_model=schemas.TripOut)
def resubmit_verification(trip_id: int, db: Session = Depends(get_db)):
    """Docs re-submits a rejected trip sheet for accounts verification after corrections."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.verification_status != "rejected":
        raise HTTPException(400, "Trip must be in rejected state to re-submit")
    if not trip.sheet:
        raise HTTPException(400, "Trip sheet must exist before re-submitting")
    trip.verification_status = "pending"
    trip.verification_rejection_reason = None
    db.commit()
    db.refresh(trip)
    return _enrich(trip)


class RejectVerificationBody(BaseModel):
    reason: str


@router.post("/{trip_id}/reject-verification", response_model=schemas.TripOut)
def reject_verification(trip_id: int, body: RejectVerificationBody, db: Session = Depends(get_db)):
    """Accounts rejects a trip sheet — sends it back to Docs with a reason."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not trip.sheet:
        raise HTTPException(400, "Trip sheet must exist before rejecting")
    trip.verification_status = "rejected"
    trip.verification_rejection_reason = body.reason
    db.commit()
    db.refresh(trip)
    return _enrich(trip)


@router.post("/{trip_id}/waive-invoice", response_model=schemas.TripOut)
def waive_invoice(trip_id: int, db: Session = Depends(get_db)):
    """Mark a verified trip's invoice as waived — trip is complete without invoicing."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.verification_status != "verified":
        raise HTTPException(400, "Only verified trips can have their invoice waived")
    trip.invoice_waived = True
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

class RecheckFlagBody(BaseModel):
    flagged: bool
    remark: str = ""


@router.post("/{trip_id}/recheck-flag", response_model=schemas.TripOut)
def toggle_recheck_flag(trip_id: int, body: RecheckFlagBody, db: Session = Depends(get_db)):
    """Docs staff toggle: flag a trip for re-checking before confirming sheet entry."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    trip.flagged_for_recheck = body.flagged
    trip.flagged_remark = body.remark if body.flagged else None
    db.commit()
    db.refresh(trip)
    return _enrich(trip)


class AdvanceVerifyBody(BaseModel):
    verified: bool                        # True = correct, False = incorrect
    remark: str = ""
    corrected_amount: Optional[float] = None


@router.post("/{trip_id}/verify-advance", response_model=schemas.TripOut)
def verify_driver_advance(trip_id: int, body: AdvanceVerifyBody, db: Session = Depends(get_db)):
    """Yard Supervisor verifies whether the advance paid to driver matches records."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    trip.advance_verified = body.verified
    trip.advance_verification_remark = body.remark if not body.verified else None
    trip.advance_corrected_amount = body.corrected_amount if not body.verified else None
    db.commit()
    db.refresh(trip)
    return _enrich(trip)


@router.post(
    "/{trip_id}/collect-sheet",
    response_model=schemas.TripOut,
    dependencies=[Depends(require_roles(*SHEET_COLLECTOR_ROLES))],
)
def collect_trip_sheet(trip_id: int, db: Session = Depends(get_db)):
    """Mark a trip sheet as delivered by the Yard Staff."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.status != "Completed":
        raise HTTPException(400, "Trip sheet can only be marked as delivered for Completed trips")
    if not trip.closure:
        raise HTTPException(400, "Trip must be closed before marking the sheet as delivered")
    trip.trip_sheet_collected = not trip.trip_sheet_collected
    trip.trip_sheet_collected_at = datetime.now(timezone.utc) if trip.trip_sheet_collected else None
    if not trip.trip_sheet_collected:
        # Undoing delivery also clears any receive-confirmation
        trip.trip_sheet_received = False
        trip.trip_sheet_received_at = None
    db.commit()
    db.refresh(trip)
    emit("sheet_collected", {"trip_id": trip_id, "collected": trip.trip_sheet_collected})
    return _enrich(trip)


@router.post(
    "/{trip_id}/receive-sheet",
    response_model=schemas.TripOut,
    dependencies=[Depends(require_roles("Trip Sheet Register"))],
)
def receive_trip_sheet(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Confirm the physical trip sheet was received by the Trip Sheet Register."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not trip.trip_sheet_collected:
        raise HTTPException(400, "Trip sheet must be marked as delivered by the Yard Supervisor first")
    if trip.trip_sheet_received:
        raise HTTPException(400, "Trip sheet is already marked as received")
    trip.trip_sheet_received = True
    trip.trip_sheet_received_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(trip)
    emit("sheet_received", {
        "trip_db_id": trip_id,
        "trip_id_str": trip.trip_id,
        "booking_reference_no": trip.booking_reference_no,
        "received_by": current_user.name,
    })
    return _enrich(trip)


@router.post("/{trip_id}/unmark-sheet", response_model=schemas.TripOut)
def unmark_trip_sheet(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Mark a trip sheet as not received — clears delivery status and alerts Admin."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.sheet is not None:
        raise HTTPException(
            400,
            "Trip sheet has already been entered in reconciliation and cannot be unmarked. "
            "Please contact an Admin."
        )
    if not trip.trip_sheet_collected:
        raise HTTPException(400, "Trip sheet is not currently marked as delivered")
    trip.trip_sheet_collected = False
    trip.trip_sheet_collected_at = None
    trip.trip_sheet_received = False
    trip.trip_sheet_received_at = None
    # Persist the alert so Admin sees it even without a live WebSocket connection
    db.add(models.Notification(
        event_type="sheet_not_received",
        title="Trip sheet not received in reconciliation",
        message=(
            f"Trip sheet for {trip.trip_id} ({trip.booking_reference_no}) was marked as "
            f"delivered but was NOT received in reconciliation. "
            f"Reported by {current_user.name} ({current_user.role})."
        ),
        trip_id_str=trip.trip_id,
        booking_reference_no=trip.booking_reference_no,
        target_roles="Admin,Commercial Manager,Assistant Commercial Manager",
        created_by=current_user.name,
        created_by_role=current_user.role,
    ))
    db.commit()
    db.refresh(trip)
    emit("sheet_unmarked", {
        "trip_db_id": trip_id,
        "trip_id_str": trip.trip_id,
        "booking_reference_no": trip.booking_reference_no,
        "reported_by": current_user.name,
    })
    # Admin notification: a person in reconciliation reported the physical sheet is missing
    emit("sheet_not_received_alert", {
        "trip_db_id": trip_id,
        "trip_id_str": trip.trip_id,
        "booking_reference_no": trip.booking_reference_no,
        "reported_by": current_user.name,
        "reported_by_role": current_user.role,
        "message": (
            f"Trip sheet for {trip.trip_id} ({trip.booking_reference_no}) was marked as "
            f"delivered by the Yard Supervisor but was NOT received in reconciliation. "
            f"Reported by {current_user.name} ({current_user.role})."
        ),
    })
    return _enrich(trip)


@router.post(
    "/{trip_id}/flag-sheet-missing",
    response_model=schemas.TripOut,
    dependencies=[Depends(require_roles(*SHEET_COLLECTOR_ROLES))],
)
def flag_sheet_missing(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Flag that a trip sheet has not been received; notifies Admin and Fleet Manager."""
    trip = db.query(models.Trip).options(
        joinedload(models.Trip.closure), joinedload(models.Trip.sheet)
    ).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    # If currently marked as collected but not yet in reconciliation, undo it
    if trip.trip_sheet_collected and trip.sheet is None:
        trip.trip_sheet_collected = False
        trip.trip_sheet_collected_at = None
        trip.trip_sheet_received = False
        trip.trip_sheet_received_at = None
        db.commit()
        db.refresh(trip)
        emit("sheet_unmarked", {
            "trip_db_id": trip_id,
            "trip_id_str": trip.trip_id,
            "booking_reference_no": trip.booking_reference_no,
        })
    # Persist the alert so it survives without a live WebSocket connection
    db.add(models.Notification(
        event_type="sheet_missing",
        title="Trip sheet flagged as missing",
        message=(
            f"Trip sheet for {trip.trip_id} ({trip.booking_reference_no}) was flagged as "
            f"missing by {current_user.name} ({current_user.role})."
        ),
        trip_id_str=trip.trip_id,
        booking_reference_no=trip.booking_reference_no,
        target_roles="Admin,Commercial Manager,Assistant Commercial Manager",
        created_by=current_user.name,
        created_by_role=current_user.role,
    ))
    db.commit()
    # Always broadcast the alert notification
    emit("sheet_alert", {
        "trip_db_id": trip_id,
        "trip_id_str": trip.trip_id,
        "booking_reference_no": trip.booking_reference_no,
    })
    return _enrich(trip)


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
    data = payload.model_dump(exclude_unset=True)
    if existing:
        # Editing an already-generated invoice: keep its original number so it stays
        # stable — never renumber issued invoices.
        data.pop("invoice_no", None)
        for k, v in data.items():
            setattr(existing, k, v)
        existing.version = (existing.version or 1) + 1
        db.commit()
    else:
        # New invoice — assign the running number server-side, serialised across all
        # trips/users with a MySQL named lock so two invoices can't take the same
        # number. The client-supplied invoice_no is ignored in favour of this.
        # We commit while still holding the lock so the next waiter sees this number.
        inv_type = data.get("invoice_type") or "Tax Invoice"
        got_lock = db.execute(text("SELECT GET_LOCK('cgi_invoice_no', 10)")).scalar()
        try:
            data["invoice_no"] = _next_invoice_no(db, inv_type, _current_fy())
            db.add(models.TripInvoice(trip_id=trip_id, **data))
            db.commit()
        finally:
            if got_lock:
                db.execute(text("SELECT RELEASE_LOCK('cgi_invoice_no')"))
    db.refresh(trip)
    return _enrich(trip)
