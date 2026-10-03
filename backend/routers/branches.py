from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from duplicate_checks import check_branch_duplicates
from security import get_current_user, TokenUser

router = APIRouter(prefix="/branches", tags=["Branches"])


@router.get("", response_model=list[schemas.BranchOut])
def list_branches(db: Session = Depends(get_db)):
    return db.query(models.Branch).order_by(models.Branch.name).all()


@router.get("/edit-events", response_model=list[schemas.BranchEditEventListOut])
def list_all_branch_edit_events(db: Session = Depends(get_db)):
    """Every Create/Edit/Delete event ever logged, across every branch — the
    page-wide "Edit History" log on Branch Management. Most recent first.
    Registered before GET /{branch_id} so "edit-events" isn't swallowed as a
    branch_id path param."""
    return (
        db.query(models.BranchEditEvent)
        .order_by(models.BranchEditEvent.created_at.desc(), models.BranchEditEvent.id.desc())
        .all()
    )


@router.post("", response_model=schemas.BranchOut, status_code=201)
def create_branch(
    payload: schemas.BranchCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    check_branch_duplicates(db, payload)
    existing = db.query(models.Branch).filter(models.Branch.name == payload.name).first()
    if existing:
        raise HTTPException(400, f"Branch '{payload.name}' already exists")
    branch = models.Branch(**payload.model_dump())
    db.add(branch)
    db.commit()
    db.refresh(branch)
    db.add(models.BranchEditEvent(
        branch_id=branch.id, name=branch.name, event="Branch Created",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    return branch


@router.get("/{branch_id}", response_model=schemas.BranchOut)
def get_branch(branch_id: int, db: Session = Depends(get_db)):
    branch = db.get(models.Branch, branch_id)
    if not branch:
        raise HTTPException(404, "Branch not found")
    return branch


@router.put("/{branch_id}", response_model=schemas.BranchOut)
def update_branch(
    branch_id: int,
    payload: schemas.BranchUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
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
    db.add(models.BranchEditEvent(
        branch_id=branch.id, name=branch.name, event="Branch Edited",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.commit()
    db.refresh(branch)
    return branch


@router.delete("/{branch_id}", status_code=204)
def delete_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    branch = db.get(models.Branch, branch_id)
    if not branch:
        raise HTTPException(404, "Branch not found")
    db.add(models.BranchEditEvent(
        branch_id=branch.id, name=branch.name, event="Branch Deleted",
        actor_name=current_user.name, actor_role=current_user.role,
    ))
    db.delete(branch)
    db.commit()
