from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/sac-codes", tags=["SAC Codes"])


@router.get("", response_model=list[schemas.SacCodeOut])
def list_sac_codes(db: Session = Depends(get_db)):
    return db.query(models.SacCode).order_by(models.SacCode.code).all()


@router.post("", response_model=schemas.SacCodeOut, status_code=201)
def create_sac_code(payload: schemas.SacCodeCreate, db: Session = Depends(get_db)):
    if db.query(models.SacCode).filter(models.SacCode.code == payload.code).first():
        raise HTTPException(400, f"SAC code '{payload.code}' already exists")
    record = models.SacCode(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{sac_code_id}", response_model=schemas.SacCodeOut)
def update_sac_code(sac_code_id: int, payload: schemas.SacCodeUpdate, db: Session = Depends(get_db)):
    record = db.get(models.SacCode, sac_code_id)
    if not record:
        raise HTTPException(404, "SAC code not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{sac_code_id}", status_code=204)
def delete_sac_code(sac_code_id: int, db: Session = Depends(get_db)):
    record = db.get(models.SacCode, sac_code_id)
    if not record:
        raise HTTPException(404, "SAC code not found")
    db.delete(record)
    db.commit()
