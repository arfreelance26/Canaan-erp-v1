from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user, require_roles, TokenUser
import models, schemas
from websocket_manager import emit

router = APIRouter(prefix="/edit-approvals", tags=["Edit Approvals"])


@router.post("", response_model=schemas.EditApprovalRequestOut, status_code=201)
def create_edit_approval(
    payload: schemas.EditApprovalRequestCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if current_user.id is None:
        raise HTTPException(400, "Admin has full access and does not need an edit approval request")
    req = models.EditApprovalRequest(
        staff_db_id=current_user.id,
        staff_name=current_user.name,
        staff_code=current_user.staff_id,
        resource_type=payload.resource_type,
        resource_id=payload.resource_id,
        resource_name=payload.resource_name,
        action=payload.action,
        reason=payload.reason,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    emit("edit_approval_created", {
        "id": req.id,
        "staff_db_id": req.staff_db_id,
        "staff_name": req.staff_name,
        "resource_type": req.resource_type,
        "resource_id": req.resource_id,
        "resource_name": req.resource_name,
        "action": req.action,
        "created_at": req.created_at.isoformat() if req.created_at else None,
    })
    return req


@router.get("", response_model=list[schemas.EditApprovalRequestOut])
def list_edit_approvals(
    status: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin", "Commercial Manager")),
):
    q = db.query(models.EditApprovalRequest)
    if status:
        q = q.filter(models.EditApprovalRequest.status == status)
    if resource_type:
        q = q.filter(models.EditApprovalRequest.resource_type == resource_type)
    return q.order_by(models.EditApprovalRequest.created_at.desc()).all()


@router.get("/my-active", response_model=list[schemas.EditApprovalRequestOut])
def get_my_active_approvals(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Returns Approved, non-expired edit requests for the calling user."""
    now = datetime.now(timezone.utc)
    return db.query(models.EditApprovalRequest).filter(
        models.EditApprovalRequest.staff_db_id == current_user.id,
        models.EditApprovalRequest.status == "Approved",
        models.EditApprovalRequest.expires_at > now,
    ).all()


@router.get("/mine", response_model=list[schemas.EditApprovalRequestOut])
def get_my_requests(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Returns all edit requests raised by the calling user (any status)."""
    q = db.query(models.EditApprovalRequest).filter(
        models.EditApprovalRequest.staff_db_id == current_user.id,
    )
    if status:
        q = q.filter(models.EditApprovalRequest.status == status)
    return q.order_by(models.EditApprovalRequest.created_at.desc()).all()


@router.patch("/{request_id}/approve", response_model=schemas.EditApprovalRequestOut)
def approve_edit_request(
    request_id: int,
    payload: Optional[schemas.ApproveDeletePayload] = None,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin", "Commercial Manager")),
):
    req = db.get(models.EditApprovalRequest, request_id)
    if not req:
        raise HTTPException(404, "Edit approval request not found")

    req.status = "Approved"
    req.approved_at = datetime.now(timezone.utc)
    req.approved_by_name = _.name
    req.admin_note = (payload.admin_note or "").strip() if payload else None

    if req.action == "Delete" and req.resource_type == "Trip":
        # Admin approves deletion — cascade-delete the trip immediately
        trip = db.query(models.Trip).filter(models.Trip.id == req.resource_id).first()
        if trip:
            db.delete(trip)
            db.commit()
            emit("trip_deleted", {"trip_id": req.resource_id, "trip_id_str": req.resource_name})
        req.expires_at = None
    else:
        req.expires_at = req.approved_at + timedelta(hours=1)

    db.commit()
    db.refresh(req)
    emit("edit_approval_updated", {
        "id": req.id,
        "staff_db_id": req.staff_db_id,
        "staff_name": req.staff_name,
        "resource_type": req.resource_type,
        "resource_id": req.resource_id,
        "resource_name": req.resource_name,
        "action": req.action,
        "status": "Approved",
        "expires_at": req.expires_at.isoformat() if req.expires_at else None,
    })
    return req


@router.delete("/{request_id}", status_code=204, dependencies=[Depends(require_roles("Admin"))])
def delete_edit_request(request_id: int, db: Session = Depends(get_db)):
    """Admin only: permanently remove an edit approval request."""
    req = db.get(models.EditApprovalRequest, request_id)
    if not req:
        raise HTTPException(404, "Edit approval request not found")
    db.delete(req)
    db.commit()
    emit("edit_approval_deleted", {"id": request_id})


@router.patch("/{request_id}/reject", response_model=schemas.EditApprovalRequestOut)
def reject_edit_request(
    request_id: int,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin", "Commercial Manager")),
):
    req = db.get(models.EditApprovalRequest, request_id)
    if not req:
        raise HTTPException(404, "Edit approval request not found")
    req.status = "Rejected"
    db.commit()
    db.refresh(req)
    emit("edit_approval_updated", {
        "id": req.id,
        "staff_db_id": req.staff_db_id,
        "status": "Rejected",
        "resource_name": req.resource_name,
        "action": req.action,
    })
    return req
