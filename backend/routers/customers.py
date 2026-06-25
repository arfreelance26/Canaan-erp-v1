from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/customers", tags=["Customers"])


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

@router.get("", response_model=list[schemas.CustomerOut])
def list_customers(db: Session = Depends(get_db)):
    return db.query(models.Customer).order_by(models.Customer.name).all()


@router.post("", response_model=schemas.CustomerOut, status_code=201)
def create_customer(payload: schemas.CustomerCreate, db: Session = Depends(get_db)):
    customer = models.Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=schemas.CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    return customer


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db)):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    db.delete(customer)
    db.commit()


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
    if not db.get(models.Customer, customer_id):
        raise HTTPException(404, "Customer not found")
    dest = models.CustomerDestination(customer_id=customer_id, **payload.model_dump())
    db.add(dest)
    db.commit()
    db.refresh(dest)
    return dest


@router.put("/{customer_id}/destinations/{dest_id}", response_model=schemas.CustomerDestinationOut)
def update_destination(customer_id: int, dest_id: int, payload: schemas.CustomerDestinationCreate, db: Session = Depends(get_db)):
    dest = db.query(models.CustomerDestination).filter(
        models.CustomerDestination.id == dest_id,
        models.CustomerDestination.customer_id == customer_id,
    ).first()
    if not dest:
        raise HTTPException(404, "Destination not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(dest, field, value)
    db.commit()
    db.refresh(dest)
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
    return pricing


@router.put("/{customer_id}/pricing/{price_id}", response_model=schemas.CustomerPricingOut)
def update_pricing(customer_id: int, price_id: int, payload: schemas.CustomerPricingCreate, db: Session = Depends(get_db)):
    pricing = db.query(models.CustomerPricing).filter(
        models.CustomerPricing.id == price_id,
        models.CustomerPricing.customer_id == customer_id,
    ).first()
    if not pricing:
        raise HTTPException(404, "Pricing not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(pricing, field, value)
    db.commit()
    db.refresh(pricing)
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
