from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from duplicate_checks import check_truck_duplicates
from websocket_manager import emit

router = APIRouter(prefix="/trucks", tags=["Trucks"])


@router.get("", response_model=list[schemas.TruckOut])
def list_trucks(db: Session = Depends(get_db)):
    return db.query(models.Truck).order_by(models.Truck.truck_id).all()


@router.post("", response_model=schemas.TruckOut, status_code=201)
def create_truck(payload: schemas.TruckCreate, db: Session = Depends(get_db)):
    check_truck_duplicates(db, payload)
    if db.query(models.Truck).filter(models.Truck.truck_id == payload.truck_id).first():
        raise HTTPException(400, f"Truck ID {payload.truck_id} already exists")
    if db.query(models.Truck).filter(models.Truck.registration_number == payload.registration_number).first():
        raise HTTPException(400, f"Registration number {payload.registration_number} already exists")
    truck = models.Truck(**payload.model_dump())
    db.add(truck)
    db.commit()
    db.refresh(truck)
    emit("truck_updated", {"id": truck.id})
    return truck


@router.get("/{truck_id}", response_model=schemas.TruckOut)
def get_truck(truck_id: int, db: Session = Depends(get_db)):
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    return truck


@router.put("/{truck_id}", response_model=schemas.TruckOut)
def update_truck(truck_id: int, payload: schemas.TruckUpdate, db: Session = Depends(get_db)):
    check_truck_duplicates(db, payload, exclude_id=truck_id)
    truck = db.query(models.Truck).with_for_update().filter(models.Truck.id == truck_id).first()
    if not truck:
        raise HTTPException(404, "Truck not found")
    if payload.client_version is not None and truck.version != payload.client_version:
        raise HTTPException(
            409,
            "This truck was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(truck, field, value)
    truck.version = (truck.version or 1) + 1
    db.commit()
    db.refresh(truck)
    emit("truck_updated", {"id": truck.id})
    return truck


@router.delete("/{truck_id}", status_code=204)
def delete_truck(truck_id: int, db: Session = Depends(get_db)):
    truck = db.get(models.Truck, truck_id)
    if not truck:
        raise HTTPException(404, "Truck not found")
    db.delete(truck)
    db.commit()
    emit("truck_updated", {})
