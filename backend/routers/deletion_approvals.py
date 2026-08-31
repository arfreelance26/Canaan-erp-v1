from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user, TokenUser
import models, schemas
from websocket_manager import emit

router = APIRouter(prefix="/deletion-approvals", tags=["Deletion Approvals"])


@router.post("", response_model=schemas.DeletionApprovalRequestOut, status_code=201)
def create_deletion_approval(
    payload: schemas.DeletionApprovalRequestCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if current_user.role == "Admin" or current_user.id is None:
        raise HTTPException(400, "Admin can delete directly without an approval request.")
    req = models.DeletionApprovalRequest(
        resource_type=payload.resource_type,
        resource_id=payload.resource_id,
        resource_name=payload.resource_name,
        log_details=payload.log_details,
        requested_by_staff_id=current_user.id,
        requested_by_name=current_user.name,
        reason=payload.reason,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    emit("deletion_approval_created", {"id": req.id, "requested_by_name": req.requested_by_name})
    return req


@router.get("", response_model=list[schemas.DeletionApprovalRequestOut])
def list_deletion_approvals(
    status: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.DeletionApprovalRequest).order_by(
        models.DeletionApprovalRequest.created_at.desc()
    )
    if status:
        q = q.filter(models.DeletionApprovalRequest.status == status)
    if resource_type:
        q = q.filter(models.DeletionApprovalRequest.resource_type == resource_type)
    return q.all()


@router.put("/{req_id}/approve", response_model=schemas.DeletionApprovalRequestOut)
def approve_deletion(
    req_id: int,
    payload: schemas.DeletionApprovalActionPayload,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    from datetime import datetime, timezone
    req = db.get(models.DeletionApprovalRequest, req_id)
    if not req:
        raise HTTPException(404, "Request not found.")
    if req.status != "Pending":
        raise HTTPException(409, f"Request is already {req.status}.")

    # Execute the deletion
    if req.resource_type == "FuelLog":
        record = db.get(models.FuelLog, req.resource_id)
        if record:
            db.delete(record)
            emit("fuel_updated", {})
    elif req.resource_type == "MaintenanceRecord":
        record = db.get(models.MaintenanceRecord, req.resource_id)
        if record:
            db.delete(record)
            emit("maintenance_updated", {})
    elif req.resource_type == "Trip":
        # Soft delete — keeps the trip (and its closure/sheet/invoice) recoverable
        # from the "Deleted Trips" page instead of destroying it outright.
        trip = db.get(models.Trip, req.resource_id)
        if trip and trip.deleted_at is None:
            trip.deleted_at = datetime.now(timezone.utc)
            emit("trip_deleted", {"trip_id": req.resource_id, "trip_id_str": req.resource_name})

    req.status = "Approved"
    req.approved_by_name = current_user.name
    req.approved_at = datetime.now(timezone.utc)
    req.admin_note = payload.admin_note
    db.commit()
    db.refresh(req)
    emit("deletion_approval_updated", {"id": req.id, "status": "Approved"})
    return req


@router.put("/{req_id}/reject", response_model=schemas.DeletionApprovalRequestOut)
def reject_deletion(
    req_id: int,
    payload: schemas.DeletionApprovalActionPayload,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    from datetime import datetime, timezone
    req = db.get(models.DeletionApprovalRequest, req_id)
    if not req:
        raise HTTPException(404, "Request not found.")
    if req.status != "Pending":
        raise HTTPException(409, f"Request is already {req.status}.")
    req.status = "Rejected"
    req.approved_by_name = current_user.name
    req.approved_at = datetime.now(timezone.utc)
    req.admin_note = payload.admin_note
    db.commit()
    db.refresh(req)
    emit("deletion_approval_updated", {"id": req.id, "status": "Rejected"})
    return req
