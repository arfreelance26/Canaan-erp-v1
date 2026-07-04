from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from duplicate_checks import check_branch_duplicates

router = APIRouter(prefix="/branches", tags=["Branches"])


@router.get("", response_model=list[schemas.BranchOut])
def list_branches(db: Session = Depends(get_db)):
    return db.query(models.Branch).order_by(models.Branch.name).all()


@router.post("", response_model=schemas.BranchOut, status_code=201)
def create_branch(payload: schemas.BranchCreate, db: Session = Depends(get_db)):
    check_branch_duplicates(db, payload)
    existing = db.query(models.Branch).filter(models.Branch.name == payload.name).first()
    if existing:
        raise HTTPException(400, f"Branch '{payload.name}' already exists")
    branch = models.Branch(**payload.model_dump())
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.get("/{branch_id}", response_model=schemas.BranchOut)
def get_branch(branch_id: int, db: Session = Depends(get_db)):
    branch = db.get(models.Branch, branch_id)
    if not branch:
        raise HTTPException(404, "Branch not found")
    return branch


@router.put("/{branch_id}", response_model=schemas.BranchOut)
def update_branch(branch_id: int, payload: schemas.BranchUpdate, db: Session = Depends(get_db)):
    check_branch_duplicates(db, payload, exclude_id=branch_id)
    branch = db.query(models.Branch).with_for_update().filter(models.Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(404, "Branch not found")
    if payload.client_version is not None and branch.version != payload.client_version:
        raise HTTPException(
            409,
            "This branch record was modified by someone else while you were editing. "
            "Please refresh the page to get the latest data and try again."
        )
    for field, value in payload.model_dump(exclude_unset=True, exclude={"client_version"}).items():
        setattr(branch, field, value)
    branch.version = (branch.version or 1) + 1
    db.commit()
    db.refresh(branch)
    return branch


@router.delete("/{branch_id}", status_code=204)
def delete_branch(branch_id: int, db: Session = Depends(get_db)):
    branch = db.get(models.Branch, branch_id)
    if not branch:
        raise HTTPException(404, "Branch not found")
    db.delete(branch)
    db.commit()
