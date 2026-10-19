from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from duplicate_checks import check_branch_duplicates
from security import get_current_user, TokenUser

# A branch's first fee covers every earlier day too (its history starts here).
FEE_HISTORY_START = datetime(2000, 1, 1)


def record_fee_change(db: Session, history_model, fee_attr: str, branch, actor_name: str):
    """Log a new Cleaner / Workshop Batta Fee from now on — past days keep the
    fee they had. Exception: while the branch has never had a fee (its history
    is only ₹0), the first fee applies to all past days too, so setting it for
    the first time doesn't leave every earlier day at ₹0."""
    fee = getattr(branch, fee_attr) or 0
    hist = db.query(history_model).filter(history_model.branch_id == branch.id).all()
    if all(float(getattr(h, fee_attr) or 0) == 0 for h in hist):
        for h in hist:
            db.delete(h)
        effective_from = FEE_HISTORY_START
    else:
        effective_from = datetime.now(timezone.utc)
    db.add(history_model(branch_id=branch.id, **{fee_attr: fee},
                         effective_from=effective_from, changed_by_name=actor_name))

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
    record_fee_change(db, models.BranchCleanerBattaFeeHistory, "cleaner_batta_fee", branch, current_user.name)
    record_fee_change(db, models.BranchWorkshopBattaFeeHistory, "workshop_batta_fee", branch, current_user.name)
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
    updates = payload.model_dump(exclude_unset=True, exclude={"client_version"})
    old_fee = float(branch.cleaner_batta_fee or 0)
    old_workshop_fee = float(branch.workshop_batta_fee or 0)
    old_name = branch.name
    for field, value in updates.items():
        setattr(branch, field, value)
    # Trucks, staff and truck branch history refer to a branch by name; carry a
    # rename over so halt fees, batta fees and branch lookups keep finding it.
    if branch.name and branch.name != old_name:
        new_name = branch.name
        db.query(models.Truck).filter(models.Truck.branch_registered_to == old_name) \
            .update({models.Truck.branch_registered_to: new_name}, synchronize_session=False)
        db.query(models.Truck).filter(models.Truck.temp_branch_original == old_name) \
            .update({models.Truck.temp_branch_original: new_name}, synchronize_session=False)
        db.query(models.Staff).filter(models.Staff.branch == old_name) \
            .update({models.Staff.branch: new_name}, synchronize_session=False)
        db.query(models.TruckBranchHistory).filter(models.TruckBranchHistory.from_branch == old_name) \
            .update({models.TruckBranchHistory.from_branch: new_name}, synchronize_session=False)
        db.query(models.TruckBranchHistory).filter(models.TruckBranchHistory.to_branch == old_name) \
            .update({models.TruckBranchHistory.to_branch: new_name}, synchronize_session=False)
    # A new Cleaner / Workshop Batta Fee applies from now on; past days keep the old one.
    if "cleaner_batta_fee" in updates and float(branch.cleaner_batta_fee or 0) != old_fee:
        record_fee_change(db, models.BranchCleanerBattaFeeHistory, "cleaner_batta_fee", branch, current_user.name)
    if "workshop_batta_fee" in updates and float(branch.workshop_batta_fee or 0) != old_workshop_fee:
        record_fee_change(db, models.BranchWorkshopBattaFeeHistory, "workshop_batta_fee", branch, current_user.name)
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
