from fastapi import HTTPException
from sqlalchemy.orm import Session
import models

def check_duplicate(db: Session, model, field_name: str, value: str, exclude_id: int = None):
    if not value: return
    query = db.query(model).filter(getattr(model, field_name) == value)
    if exclude_id is not None:
        query = query.filter(model.id != exclude_id)
    if query.first():
        friendly_field = field_name.replace("_", " ").title()
        raise HTTPException(400, f"{model.__name__} with {friendly_field} '{value}' already exists.")

def check_customer_duplicates(db: Session, payload, exclude_id=None):
    if getattr(payload, "name", None): check_duplicate(db, models.Customer, "name", payload.name, exclude_id)
    if getattr(payload, "gstin", None): check_duplicate(db, models.Customer, "gstin", payload.gstin, exclude_id)
    if getattr(payload, "email", None): check_duplicate(db, models.Customer, "email", payload.email, exclude_id)
    if getattr(payload, "phone", None): check_duplicate(db, models.Customer, "phone", payload.phone, exclude_id)

def check_customer_destination_duplicates(db: Session, payload, customer_id: int, exclude_id=None):
    if getattr(payload, "destination_name", None):
        query = db.query(models.CustomerDestination).filter(
            models.CustomerDestination.customer_id == customer_id,
            models.CustomerDestination.destination_name == payload.destination_name
        )
        if exclude_id: query = query.filter(models.CustomerDestination.id != exclude_id)
        if query.first():
            raise HTTPException(400, f"Destination '{payload.destination_name}' already exists for this customer.")

    # A "route" is the combination of these 7 fields. Two destinations for the
    # same customer with identical values on all 7 are the same route and are
    # rejected; differing on even one field makes it a distinct route.
    ROUTE_FIELDS = (
        "origin_state", "origin_address", "destination_state", "destination_address",
        "cargo_classification", "container_type", "weight_in_tons",
    )

    def normalize(v):
        return (v or "").strip().casefold()

    payload_route = {f: normalize(getattr(payload, f, None)) for f in ROUTE_FIELDS}

    query = db.query(models.CustomerDestination).filter(
        models.CustomerDestination.customer_id == customer_id
    )
    if exclude_id: query = query.filter(models.CustomerDestination.id != exclude_id)
    for existing in query.all():
        existing_route = {f: normalize(getattr(existing, f, None)) for f in ROUTE_FIELDS}
        if existing_route == payload_route:
            raise HTTPException(400, "This exact route (origin, destination, cargo, container & weight combination) already exists for this customer.")

def check_vendor_duplicates(db: Session, payload, exclude_id=None):
    if getattr(payload, "name", None): check_duplicate(db, models.Vendor, "name", payload.name, exclude_id)
    if getattr(payload, "gstin", None): check_duplicate(db, models.Vendor, "gstin", payload.gstin, exclude_id)
    if getattr(payload, "pan", None): check_duplicate(db, models.Vendor, "pan", payload.pan, exclude_id)
    if getattr(payload, "email", None): check_duplicate(db, models.Vendor, "email", payload.email, exclude_id)
    if getattr(payload, "contact_number", None): check_duplicate(db, models.Vendor, "contact_number", payload.contact_number, exclude_id)

def check_truck_duplicates(db: Session, payload, exclude_id=None):
    if getattr(payload, "registration_number", None): check_duplicate(db, models.Truck, "registration_number", payload.registration_number, exclude_id)

def check_driver_duplicates(db: Session, payload, exclude_id=None):
    if getattr(payload, "email", None): check_duplicate(db, models.Driver, "email", payload.email, exclude_id)
    if getattr(payload, "username", None):
        check_duplicate(db, models.Driver, "username", payload.username, exclude_id)
        if db.query(models.Staff).filter(models.Staff.username == payload.username).first():
            raise HTTPException(400, f"Username '{payload.username}' is already taken by a staff member.")
    if getattr(payload, "contact_number", None): check_duplicate(db, models.Driver, "contact_number", payload.contact_number, exclude_id)
    if getattr(payload, "aadhaar_number", None): check_duplicate(db, models.Driver, "aadhaar_number", payload.aadhaar_number, exclude_id)
    if getattr(payload, "license_number", None): check_duplicate(db, models.Driver, "license_number", payload.license_number, exclude_id)

def check_staff_duplicates(db: Session, payload, exclude_id=None):
    if getattr(payload, "email", None): check_duplicate(db, models.Staff, "email", payload.email, exclude_id)
    if getattr(payload, "username", None):
        check_duplicate(db, models.Staff, "username", payload.username, exclude_id)
        if db.query(models.Driver).filter(models.Driver.username == payload.username).first():
            raise HTTPException(400, f"Username '{payload.username}' is already taken by a driver.")
    if getattr(payload, "contact_number", None): check_duplicate(db, models.Staff, "contact_number", payload.contact_number, exclude_id)

def check_branch_duplicates(db: Session, payload, exclude_id=None):
    if getattr(payload, "name", None): check_duplicate(db, models.Branch, "name", payload.name, exclude_id)

def check_trip_duplicates(db: Session, payload, exclude_id=None):
    if getattr(payload, "booking_reference_no", None): check_duplicate(db, models.Trip, "booking_reference_no", payload.booking_reference_no, exclude_id)
