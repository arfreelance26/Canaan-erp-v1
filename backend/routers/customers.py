from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from duplicate_checks import check_customer_duplicates, check_customer_destination_duplicates
from websocket_manager import emit

router = APIRouter(prefix="/customers", tags=["Customers"])


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

@router.get("", response_model=list[schemas.CustomerOut])
def list_customers(
    search: Optional[str] = Query(None, description="Search by name, GSTIN, phone, email"),
    limit: Optional[int] = Query(None, le=100, description="Max rows (AI use); omit for full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.Customer).order_by(models.Customer.name)
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


@router.post("", response_model=schemas.CustomerOut, status_code=201)
def create_customer(payload: schemas.CustomerCreate, db: Session = Depends(get_db)):
    check_customer_duplicates(db, payload)
    customer = models.Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    emit("customer_updated", {})
    return customer


@router.get("/{customer_id}", response_model=schemas.CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    return customer


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db)):
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
    db.commit()
    db.refresh(customer)
    emit("customer_updated", {})
    return customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
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

@router.get("/{customer_id}/pricing", response_model=list[schemas.CustomerPricingOut])
def list_pricing(customer_id: int, db: Session = Depends(get_db)):
    return db.query(models.CustomerPricing).filter(
        models.CustomerPricing.customer_id == customer_id
    ).all()


@router.post("/{customer_id}/pricing", response_model=schemas.CustomerPricingOut, status_code=201)
def create_pricing(customer_id: int, payload: schemas.CustomerPricingCreate, db: Session = Depends(get_db)):
    if not db.get(models.Customer, customer_id):
        raise HTTPException(404, "Customer not found")
    pricing = models.CustomerPricing(customer_id=customer_id, **payload.model_dump())
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
    for field, value in payload.model_dump(exclude_unset=True).items():
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
    record = models.FinalCustomerPricing(customer_id=customer_id, **payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
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
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(record, field, value)
    record.version = (record.version or 1) + 1
    db.commit()
    db.refresh(record)
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
