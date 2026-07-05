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
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin")),
):
    q = db.query(models.EditApprovalRequest)
    if status:
        q = q.filter(models.EditApprovalRequest.status == status)
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


@router.patch("/{request_id}/approve", response_model=schemas.EditApprovalRequestOut)
def approve_edit_request(
    request_id: int,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin")),
):
    req = db.get(models.EditApprovalRequest, request_id)
    if not req:
        raise HTTPException(404, "Edit approval request not found")
    req.status = "Approved"
    req.approved_at = datetime.now(timezone.utc)
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


@router.patch("/{request_id}/reject", response_model=schemas.EditApprovalRequestOut)
def reject_edit_request(
    request_id: int,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin")),
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
