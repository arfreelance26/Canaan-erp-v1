from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user, TokenUser, require_roles
import models, schemas
from duplicate_checks import check_customer_duplicates, check_customer_destination_duplicates
from websocket_manager import emit
from routers.deletion_approvals import auto_reject_stale_requests

router = APIRouter(prefix="/customers", tags=["Customers"])


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

@router.get("/destination-origin-states", response_model=list[str])
def list_destination_origin_states(db: Session = Depends(get_db)):
    rows = (
        db.query(models.CustomerDestination.origin_state)
        .filter(models.CustomerDestination.origin_state.isnot(None), models.CustomerDestination.origin_state != "")
        .distinct()
        .all()
    )
    return sorted({r[0].strip() for r in rows if r[0] and r[0].strip()})


@router.get("/destination-states", response_model=list[str])
def list_destination_states(db: Session = Depends(get_db)):
    rows = (
        db.query(models.CustomerDestination.destination_state)
        .filter(models.CustomerDestination.destination_state.isnot(None), models.CustomerDestination.destination_state != "")
        .distinct()
        .all()
    )
    return sorted({r[0].strip() for r in rows if r[0] and r[0].strip()})


@router.get("", response_model=list[schemas.CustomerOut])
def list_customers(
    search: Optional[str] = Query(None, description="Search by name, GSTIN, phone, email"),
    limit: Optional[int] = Query(None, le=100, description="Max rows (AI use); omit for full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.Customer).filter(models.Customer.deleted_at.is_(None)).order_by(models.Customer.name)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(or_(
            models.Customer.name.ilike(s),
            models.Customer.gstin.ilike(s),
            models.Customer.phone.ilike(s),
            models.Customer.email.ilike(s),
        ))
    if limit is not None:
        q = q.offset(offset).limit(limit)
    return q.all()


class RouteDistanceIn(BaseModel):
    origin_address: Optional[str] = Field(None, max_length=500)
    origin_state: Optional[str] = Field(None, max_length=100)
    destination_address: Optional[str] = Field(None, max_length=500)
    destination_state: Optional[str] = Field(None, max_length=100)
    # Pick on map: an end pinned exactly (both lat and lon), used instead of its address.
    origin_lat: Optional[float] = Field(None, ge=-90, le=90)
    origin_lon: Optional[float] = Field(None, ge=-180, le=180)
    destination_lat: Optional[float] = Field(None, ge=-90, le=90)
    destination_lon: Optional[float] = Field(None, ge=-180, le=180)


# Who can add or edit customer routes (Our Customers): the same roles.
ROUTE_ROLES = [Depends(require_roles("Commercial Manager", "Assistant Commercial Manager", "Accounts"))]


def _pin(lat, lon):
    return (lat, lon) if lat is not None and lon is not None else None


@router.post("/route-distance", dependencies=ROUTE_ROLES)
def route_distance(payload: RouteDistanceIn, current_user: TokenUser = Depends(get_current_user)):
    """Our Customers → Destinations → "Calculate road distance" / "Pick on map":
    the truck road distance (one way) between the route's two ends — pins if
    placed, else the addresses — with what was matched and the path for the map
    (Geoapify, geo_distance.py)."""
    import geo_distance, geo_usage
    o_pin, d_pin = _pin(payload.origin_lat, payload.origin_lon), _pin(payload.destination_lat, payload.destination_lon)
    if not (o_pin or (payload.origin_address or "").strip()) or not (d_pin or (payload.destination_address or "").strip()):
        raise HTTPException(422, "Enter both the origin and destination address, or pin them on the map.")
    try:
        with geo_usage.as_user(current_user):       # credits charged to this person (budget + hourly limit)
            return geo_distance.road_distance(payload.origin_address, payload.origin_state,
                                              payload.destination_address, payload.destination_state, o_pin, d_pin)
    except geo_distance.GeoError as e:
        raise HTTPException(422, str(e))


@router.get("/pin-check", dependencies=ROUTE_ROLES)
def pin_check(
    origin_lat: float = Query(..., ge=-90, le=90), origin_lon: float = Query(..., ge=-180, le=180),
    destination_lat: float = Query(..., ge=-90, le=90), destination_lon: float = Query(..., ge=-180, le=180),
    origin_address: Optional[str] = Query(None, max_length=500), origin_state: Optional[str] = Query(None, max_length=100),
    destination_address: Optional[str] = Query(None, max_length=500), destination_state: Optional[str] = Query(None, max_length=100),
    current_user: TokenUser = Depends(get_current_user),
):
    """Pick on map → Use these pins: does each pin agree with its typed address
    (warn when they're far apart), and for an empty address, the map's name for
    the spot to offer (geo_distance.check_pin)."""
    import geo_distance, geo_usage
    try:
        with geo_usage.as_user(current_user):
            return {
                "origin": geo_distance.check_pin(origin_address, origin_state, origin_lat, origin_lon),
                "destination": geo_distance.check_pin(destination_address, destination_state, destination_lat, destination_lon),
                "far_km": geo_distance.FAR_KM,
            }
    except geo_distance.GeoError as e:
        raise HTTPException(422, str(e))


@router.get("/place-search", dependencies=ROUTE_ROLES)
def place_search(text: str = Query(..., max_length=200), state: Optional[str] = Query(None, max_length=100),
                 current_user: TokenUser = Depends(get_current_user)):
    """Pick on map's search box: up to five places to jump to (Geoapify, India only)."""
    import geo_distance, geo_usage
    try:
        with geo_usage.as_user(current_user):
            return geo_distance.search_places(text, state)
    except geo_distance.GeoError as e:
        raise HTTPException(422, str(e))


@router.get("/geo-usage", dependencies=[Depends(require_roles())])
def geo_usage_today():
    """Admin: Geoapify credits used today (India time) against the daily budget,
    who used most, and how many answers are cached (geo_usage.py)."""
    import geo_usage
    return geo_usage.usage_today()


@router.post("", response_model=schemas.CustomerOut, status_code=201)
def create_customer(
    payload: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    check_customer_duplicates(db, payload)
    customer = models.Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    db.add(models.CustomerEditEvent(
        customer_id=customer.id, event="Customer Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("customer_updated", {})
    return customer


@router.get("/deleted-ids", dependencies=[Depends(require_roles())])
def list_deleted_customer_ids(db: Session = Depends(get_db)):
    """Admin only: ids of customers currently soft-deleted. Lets the "Archive" page
    (which lists from the deletion_approval_requests audit trail) tell apart a
    still-deleted customer from one that was since restored, same pattern as
    trips.py's list_deleted_trip_ids. Registered before GET /{customer_id} so
    "deleted-ids" isn't swallowed as a customer_id path param."""
    rows = db.query(models.Customer.id).filter(models.Customer.deleted_at.isnot(None)).all()
    return [i for (i,) in rows]


@router.get("/edit-events", response_model=list[schemas.CustomerEditEventListOut])
def list_all_customer_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete/Restore event ever logged, across every
    customer — the page-wide "Edit History" log on Our Customers, so
    who-changed-what is searchable in one place instead of opening each
    customer individually. Most recent first. Registered before GET
    /{customer_id} so "edit-events" isn't swallowed as a customer_id path
    param.
    """
    events = (
        db.query(models.CustomerEditEvent)
        .order_by(models.CustomerEditEvent.created_at.desc(), models.CustomerEditEvent.id.desc())
        .all()
    )
    if not events:
        return []
    customer_ids = {e.customer_id for e in events}
    customers_by_id = {c.id: c for c in db.query(models.Customer).filter(models.Customer.id.in_(customer_ids)).all()}

    result = []
    for e in events:
        customer = customers_by_id.get(e.customer_id)
        result.append({
            "id": e.id,
            "customer_id": e.customer_id,
            "customer_name": customer.name if customer else "(deleted)",
            "event": e.event,
            "actor_name": e.actor_name,
            "actor_role": e.actor_role,
            "created_at": e.created_at,
        })
    return result


# Bulk variants of the per-customer list endpoints below — one query across
# every active customer instead of one request per customer. Scoped to
# non-deleted customers, matching what GET /customers returns. Registered
# before GET /{customer_id} so "bulk" isn't swallowed as a customer_id.

def _active_customer_ids(db: Session):
    return db.query(models.Customer.id).filter(models.Customer.deleted_at.is_(None))


@router.get("/bulk/destinations", response_model=list[schemas.CustomerDestinationOut])
def list_all_destinations(db: Session = Depends(get_db)):
    return db.query(models.CustomerDestination).filter(
        models.CustomerDestination.customer_id.in_(_active_customer_ids(db))
    ).all()


@router.get("/bulk/pricing", response_model=list[schemas.CustomerPricingOut])
def list_all_pricing(db: Session = Depends(get_db)):
    return db.query(models.CustomerPricing).filter(
        models.CustomerPricing.customer_id.in_(_active_customer_ids(db))
    ).all()


@router.get("/bulk/final-pricing", response_model=list[schemas.FinalCustomerPricingOut])
def list_all_final_pricing(db: Session = Depends(get_db)):
    return db.query(models.FinalCustomerPricing).filter(
        models.FinalCustomerPricing.customer_id.in_(_active_customer_ids(db))
    ).all()


@router.get("/{customer_id}", response_model=schemas.CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    return customer


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(
    customer_id: int,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    check_customer_duplicates(db, payload, exclude_id=customer_id)
    customer = db.query(models.Customer).with_for_update().filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(404, "Customer not found")
    if payload.client_version is not None and customer.version != payload.client_version:
        raise HTTPException(
            409,
            "This customer record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(customer, field, value)
    customer.version = (customer.version or 1) + 1
    db.add(models.CustomerEditEvent(
        customer_id=customer.id, event="Customer Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(customer)
    emit("customer_updated", {})
    return customer


@router.delete("/{customer_id}", status_code=204, dependencies=[Depends(require_roles())])
def delete_customer(customer_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: soft-delete a customer (hides them from "Our Customers", keeps
    their origins/destinations/pricing/final-pricing and every billed trip intact
    and still resolvable). A self-approved DeletionApprovalRequest row is logged
    for audit visibility, same pattern as drivers.py's delete_driver."""
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    if customer.deleted_at is not None:
        raise HTTPException(409, "Customer is already deleted")
    now = datetime.now(timezone.utc)
    customer.deleted_at = now
    # Always log the audit row (even for the built-in "admin" login, whose
    # current_user.id is None) — see drivers.py's delete_driver for rationale.
    db.add(models.DeletionApprovalRequest(
        resource_type="Customer",
        resource_id=customer_id,
        resource_name=customer.name,
        requested_by_staff_id=current_user.id or 0,
        requested_by_name=current_user.name,
        reason="Deleted directly by Admin — no approval required.",
        status="Approved",
        approved_by_name=current_user.name,
        approved_at=now,
    ))
    db.add(models.CustomerEditEvent(
        customer_id=customer_id, event="Customer Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    emit("customer_updated", {})


@router.post("/{customer_id}/restore", response_model=schemas.CustomerOut, dependencies=[Depends(require_roles())])
def restore_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Admin only: undo a soft-delete — the customer reappears in Our Customers
    exactly as they were."""
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    if customer.deleted_at is None:
        raise HTTPException(409, "Customer is not deleted")
    customer.deleted_at = None
    db.add(models.CustomerEditEvent(
        customer_id=customer.id, event="Customer Restored",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(customer)
    emit("customer_updated", {})
    return customer


@router.delete("/{customer_id}/permanent", status_code=204, dependencies=[Depends(require_roles())])
def permanently_delete_customer(customer_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Admin only: irreversibly delete an already soft-deleted customer (cascades
    to origins/destinations/pricing/final-pricing). Only reachable from the
    "Archive" page."""
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    auto_reject_stale_requests(db, "Customer", customer_id, current_user.name)
    db.delete(customer)
    db.commit()
    emit("customer_updated", {})


# ---------------------------------------------------------------------------
# Customer Origins
# ---------------------------------------------------------------------------

@router.get("/{customer_id}/origins", response_model=list[schemas.CustomerOriginOut])
def list_origins(customer_id: int, db: Session = Depends(get_db)):
    return db.query(models.CustomerOrigin).filter(
        models.CustomerOrigin.customer_id == customer_id
    ).order_by(models.CustomerOrigin.id.desc()).all()


@router.post("/{customer_id}/origins", response_model=schemas.CustomerOriginOut, status_code=201)
def create_origin(customer_id: int, payload: schemas.CustomerOriginCreate, db: Session = Depends(get_db)):
    if not db.get(models.Customer, customer_id):
        raise HTTPException(404, "Customer not found")
    existing = db.query(models.CustomerOrigin).filter(
        models.CustomerOrigin.customer_id == customer_id,
        models.CustomerOrigin.origin_name == payload.origin_name,
    ).first()
    if existing:
        return existing
    origin = models.CustomerOrigin(customer_id=customer_id, **payload.model_dump())
    db.add(origin)
    db.commit()
    db.refresh(origin)
    emit("customer_updated", {})
    return origin


@router.delete("/{customer_id}/origins/{origin_id}", status_code=204)
def delete_origin(customer_id: int, origin_id: int, db: Session = Depends(get_db)):
    origin = db.query(models.CustomerOrigin).filter(
        models.CustomerOrigin.id == origin_id,
        models.CustomerOrigin.customer_id == customer_id,
    ).first()
    if not origin:
        raise HTTPException(404, "Origin not found")
    db.delete(origin)
    db.commit()
    emit("customer_updated", {})


# ---------------------------------------------------------------------------
# Customer Destinations
# ---------------------------------------------------------------------------

@router.get("/{customer_id}/destinations", response_model=list[schemas.CustomerDestinationOut])
def list_destinations(customer_id: int, db: Session = Depends(get_db)):
    return db.query(models.CustomerDestination).filter(
        models.CustomerDestination.customer_id == customer_id
    ).all()


@router.post("/{customer_id}/destinations", response_model=schemas.CustomerDestinationOut, status_code=201)
def create_destination(customer_id: int, payload: schemas.CustomerDestinationCreate, db: Session = Depends(get_db)):
    check_customer_destination_duplicates(db, payload, customer_id)
    if not db.get(models.Customer, customer_id):
        raise HTTPException(404, "Customer not found")
    dest = models.CustomerDestination(customer_id=customer_id, **payload.model_dump())
    db.add(dest)
    db.commit()
    db.refresh(dest)
    emit("customer_updated", {})
    return dest


@router.put("/{customer_id}/destinations/{dest_id}", response_model=schemas.CustomerDestinationOut)
def update_destination(customer_id: int, dest_id: int, payload: schemas.CustomerDestinationCreate, db: Session = Depends(get_db)):
    check_customer_destination_duplicates(db, payload, customer_id, exclude_id=dest_id)
    dest = db.query(models.CustomerDestination).filter(
        models.CustomerDestination.id == dest_id,
        models.CustomerDestination.customer_id == customer_id,
    ).first()
    if not dest:
        raise HTTPException(404, "Destination not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(dest, field, value)
    # Pricing rows keep a copy of the route's label (used for display and for
    # matching legacy rows) — re-sync it, or renaming a route leaves its
    # Customer Pricing / Final Customer Pricing pointing at the old name.
    label = dest.destination_name or dest.destination_address
    for model in (models.CustomerPricing, models.FinalCustomerPricing):
        db.query(model).filter(
            model.customer_id == customer_id,
            model.customer_destination_id == dest_id,
        ).update({model.customer_destination: label}, synchronize_session=False)
    db.commit()
    db.refresh(dest)
    emit("customer_updated", {})
    return dest


@router.delete("/{customer_id}/destinations/{dest_id}", status_code=204)
def delete_destination(customer_id: int, dest_id: int, db: Session = Depends(get_db)):
    dest = db.query(models.CustomerDestination).filter(
        models.CustomerDestination.id == dest_id,
        models.CustomerDestination.customer_id == customer_id,
    ).first()
    if not dest:
        raise HTTPException(404, "Destination not found")
    db.delete(dest)
    db.commit()
    emit("customer_updated", {})


# ---------------------------------------------------------------------------
# Customer Pricing
# ---------------------------------------------------------------------------

def _resolve_destination_label(db: Session, customer_id: int, destination_id: int | None) -> str | None:
    """Looks up the destination's display label (name, falling back to
    address) so customer_destination stays a synced snapshot of whichever
    CustomerDestination row customer_destination_id actually points at —
    the FK is the real match key, this text is only for display/legacy
    matching (see the big comment on CustomerPricing.customer_destination_id).
    """
    if destination_id is None:
        return None
    dest = db.query(models.CustomerDestination).filter(
        models.CustomerDestination.id == destination_id,
        models.CustomerDestination.customer_id == customer_id,
    ).first()
    if not dest:
        raise HTTPException(404, "Destination not found for this customer")
    return dest.destination_name or dest.destination_address


@router.get("/{customer_id}/pricing", response_model=list[schemas.CustomerPricingOut])
def list_pricing(customer_id: int, db: Session = Depends(get_db)):
    return db.query(models.CustomerPricing).filter(
        models.CustomerPricing.customer_id == customer_id
    ).all()


@router.post("/{customer_id}/pricing", response_model=schemas.CustomerPricingOut, status_code=201)
def create_pricing(customer_id: int, payload: schemas.CustomerPricingCreate, db: Session = Depends(get_db)):
    if not db.get(models.Customer, customer_id):
        raise HTTPException(404, "Customer not found")
    data = payload.model_dump()
    if data.get("customer_destination_id") is not None:
        data["customer_destination"] = _resolve_destination_label(db, customer_id, data["customer_destination_id"])
    pricing = models.CustomerPricing(customer_id=customer_id, **data)
    db.add(pricing)
    db.commit()
    db.refresh(pricing)
    emit("customer_updated", {})
    return pricing


@router.put("/{customer_id}/pricing/{price_id}", response_model=schemas.CustomerPricingOut)
def update_pricing(customer_id: int, price_id: int, payload: schemas.CustomerPricingCreate, db: Session = Depends(get_db)):
    pricing = db.query(models.CustomerPricing).filter(
        models.CustomerPricing.id == price_id,
        models.CustomerPricing.customer_id == customer_id,
    ).first()
    if not pricing:
        raise HTTPException(404, "Pricing not found")
    data = payload.model_dump(exclude_unset=True)
    if "customer_destination_id" in data:
        data["customer_destination"] = _resolve_destination_label(db, customer_id, data["customer_destination_id"])
    for field, value in data.items():
        setattr(pricing, field, value)
    db.commit()
    db.refresh(pricing)
    emit("customer_updated", {})
    return pricing


@router.delete("/{customer_id}/pricing/{price_id}", status_code=204)
def delete_pricing(customer_id: int, price_id: int, db: Session = Depends(get_db)):
    pricing = db.query(models.CustomerPricing).filter(
        models.CustomerPricing.id == price_id,
        models.CustomerPricing.customer_id == customer_id,
    ).first()
    if not pricing:
        raise HTTPException(404, "Pricing not found")
    db.delete(pricing)
    db.commit()
    emit("customer_updated", {})


# ---------------------------------------------------------------------------
# Final Customer Pricing (For Accounts)
# ---------------------------------------------------------------------------

@router.get("/{customer_id}/final-pricing", response_model=list[schemas.FinalCustomerPricingOut])
def list_final_pricing(customer_id: int, db: Session = Depends(get_db)):
    return db.query(models.FinalCustomerPricing).filter(
        models.FinalCustomerPricing.customer_id == customer_id
    ).all()


@router.post("/{customer_id}/final-pricing", response_model=schemas.FinalCustomerPricingOut, status_code=201)
def create_final_pricing(customer_id: int, payload: schemas.FinalCustomerPricingCreate, db: Session = Depends(get_db)):
    if not db.get(models.Customer, customer_id):
        raise HTTPException(404, "Customer not found")
    existing = db.query(models.FinalCustomerPricing).filter(
        models.FinalCustomerPricing.customer_id == customer_id,
        models.FinalCustomerPricing.customer_destination_id == payload.customer_destination_id,
    ).first()
    if existing:
        raise HTTPException(400, f"A final price already exists for the route '{payload.customer_destination}'. Edit that entry instead of adding another.")
    data = payload.model_dump()
    data["customer_destination"] = _resolve_destination_label(db, customer_id, data["customer_destination_id"])
    record = models.FinalCustomerPricing(customer_id=customer_id, **data)
    db.add(record)
    db.commit()
    db.refresh(record)
    emit("customer_updated", {})
    return record


@router.put("/{customer_id}/final-pricing/{pricing_id}", response_model=schemas.FinalCustomerPricingOut)
def update_final_pricing(customer_id: int, pricing_id: int, payload: schemas.FinalCustomerPricingUpdate, db: Session = Depends(get_db)):
    record = db.query(models.FinalCustomerPricing).filter(
        models.FinalCustomerPricing.id == pricing_id,
        models.FinalCustomerPricing.customer_id == customer_id,
    ).first()
    if not record:
        raise HTTPException(404, "Final pricing not found")
    if payload.client_version is not None and record.version != payload.client_version:
        raise HTTPException(409, "Record was modified by someone else. Please refresh and try again.")
    data = payload.model_dump(exclude_unset=True, exclude={"client_version"})
    if "customer_destination_id" in data:
        data["customer_destination"] = _resolve_destination_label(db, customer_id, data["customer_destination_id"])
    for field, value in data.items():
        setattr(record, field, value)
    record.version = (record.version or 1) + 1
    db.commit()
    db.refresh(record)
    emit("customer_updated", {})
    return record


@router.delete("/{customer_id}/final-pricing/{pricing_id}", status_code=204)
def delete_final_pricing(customer_id: int, pricing_id: int, db: Session = Depends(get_db)):
    record = db.query(models.FinalCustomerPricing).filter(
        models.FinalCustomerPricing.id == pricing_id,
        models.FinalCustomerPricing.customer_id == customer_id,
    ).first()
    if not record:
        raise HTTPException(404, "Final pricing not found")
    db.delete(record)
    db.commit()
    emit("customer_updated", {})
