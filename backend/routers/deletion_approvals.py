from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from excel_utils import build_excel_response
from security import get_current_user, TokenUser, require_roles
import models, schemas
from websocket_manager import emit

router = APIRouter(prefix="/deletion-approvals", tags=["Deletion Approvals"])


def auto_reject_stale_requests(db: Session, resource_type: str, resource_id: int, actor_name: str) -> None:
    """Called wherever a resource is permanently (hard) deleted — any other still-
    Pending DeletionApprovalRequest row for the same resource would otherwise sit
    forever, or later get approved against a resource that no longer exists.
    approve_deletion() now rejects that case loudly rather than silently marking
    "Approved" with nothing actually deleted (the root cause of a driver vanishing
    from the Archive page despite an approved deletion), but auto-resolving here
    keeps the Deletion Approvals page from showing a stale Pending row at all.

    Updates rows individually (not a bulk .update()) so each can attribute
    approved_by_name to the admin who triggered the permanent delete — same
    field every manual reject sets — and so each fires its own
    deletion_approval_updated event, letting an open Deletion Approvals page
    live-refresh instead of showing a stale "Pending" row until its next poll.
    """
    stale = db.query(models.DeletionApprovalRequest).filter(
        models.DeletionApprovalRequest.resource_type == resource_type,
        models.DeletionApprovalRequest.resource_id == resource_id,
        models.DeletionApprovalRequest.status == "Pending",
    ).all()
    now = datetime.now(timezone.utc)
    for req in stale:
        req.status = "Rejected"
        req.approved_by_name = actor_name
        req.approved_at = now
        req.admin_note = "Auto-rejected: this record was permanently deleted before the request could be reviewed."
        emit("deletion_approval_updated", {"id": req.id, "status": "Rejected"})


@router.post("", response_model=schemas.DeletionApprovalRequestOut, status_code=201)
def create_deletion_approval(
    payload: schemas.DeletionApprovalRequestCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    if current_user.role == "Admin" or current_user.id is None:
        raise HTTPException(400, "Admin can delete directly without an approval request.")
    existing = db.query(models.DeletionApprovalRequest).filter(
        models.DeletionApprovalRequest.resource_type == payload.resource_type,
        models.DeletionApprovalRequest.resource_id == payload.resource_id,
        models.DeletionApprovalRequest.status == "Pending",
    ).first()
    if existing:
        raise HTTPException(409, f"A deletion request for this {payload.resource_type.lower()} is already pending approval.")
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


_IST = timezone(timedelta(hours=5, minutes=30))


def _to_ist(dt: Optional[datetime]) -> Optional[datetime]:
    """Stored timestamps are UTC (naive or aware); exports show IST."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_IST)


def _fmt_ist(dt: Optional[datetime]) -> str:
    local = _to_ist(dt)
    return local.strftime("%d-%m-%Y %I:%M %p") if local else ""


@router.get("/export")
def export_deletion_approvals(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive, on the requested date, IST)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive, on the requested date, IST)"),
    db: Session = Depends(get_db),
):
    """Excel export of the Deletion Approvals list (every status). Same audience
    as the list endpoint above; the record snapshot (log_details) is left out."""
    reqs = db.query(models.DeletionApprovalRequest).order_by(models.DeletionApprovalRequest.created_at.desc()).all()
    headers = [
        "Resource Type", "Resource", "Reason", "Requested By", "Requested At",
        "Status", "Decided By", "Decided At", "Admin Note",
    ]
    rows = []
    for r in reqs:
        asked = _to_ist(r.created_at)
        if asked is not None:
            day = asked.date().isoformat()
            if from_date and day < from_date:
                continue
            if to_date and day > to_date:
                continue
        elif from_date or to_date:
            continue
        rows.append([
            r.resource_type, r.resource_name, r.reason, r.requested_by_name, _fmt_ist(r.created_at),
            r.status, r.approved_by_name or "", _fmt_ist(r.approved_at), r.admin_note or "",
        ])
    suffix = f"_{from_date or ''}_to_{to_date or ''}" if from_date or to_date else ""
    return build_excel_response([("Deletion Approvals", headers, rows)], f"deletion_approvals{suffix}.xlsx")


@router.get("/archive-export", dependencies=[Depends(require_roles())])
def export_archive(
    resource_type: Optional[str] = Query(None, description="Driver, Truck, Staff, Customer or Vendor; omit for all"),
    db: Session = Depends(get_db),
):
    """Admin only: Excel export of the Archive page. Mirrors the page: the latest
    Approved deletion request per resource that is still soft-deleted (restored
    resources are excluded)."""
    models_by_type = {
        "Driver": models.Driver, "Truck": models.Truck, "Staff": models.Staff,
        "Customer": models.Customer, "Vendor": models.Vendor,
    }
    if resource_type and resource_type not in models_by_type:
        raise HTTPException(400, "Invalid resource_type.")
    kinds = [resource_type] if resource_type else list(models_by_type)
    latest = {}
    for kind in kinds:
        model = models_by_type[kind]
        still_deleted = {i for (i,) in db.query(model.id).filter(model.deleted_at.isnot(None)).all()}
        reqs = (
            db.query(models.DeletionApprovalRequest)
            .filter(
                models.DeletionApprovalRequest.status == "Approved",
                models.DeletionApprovalRequest.resource_type == kind,
            )
            .all()
        )
        for r in reqs:
            if r.resource_id not in still_deleted:
                continue
            key = (kind, r.resource_id)
            cur = latest.get(key)
            if cur is None or (r.approved_at or datetime.min) > (cur.approved_at or datetime.min):
                latest[key] = r
    ordered = sorted(latest.items(), key=lambda kv: kv[1].approved_at or datetime.min, reverse=True)
    headers = ["Type", "Name", "Deleted By", "Reason", "Approved By", "Deletion Date", "Admin Note"]
    rows = [
        [kind, r.resource_name, r.requested_by_name, r.reason, r.approved_by_name or "", _fmt_ist(r.approved_at), r.admin_note or ""]
        for (kind, _), r in ordered
    ]
    suffix = f"_{resource_type.lower()}" if resource_type else ""
    return build_excel_response([("Archive", headers, rows)], f"archive{suffix}.xlsx")


@router.put("/{req_id}/approve", response_model=schemas.DeletionApprovalRequestOut, dependencies=[Depends(require_roles())])
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

    # Execute the deletion. A missing underlying row (hard-deleted since, or a
    # stale duplicate request for the same resource) fails loudly instead of
    # silently marking the request "Approved" with nothing actually deleted —
    # that silent-success case is exactly how a driver could vanish from the
    # Archive page forever despite showing as an approved deletion. An already
    # soft-deleted row (a legitimate second approval of a genuine duplicate
    # request) is not an error — the desired end state already holds.
    if req.resource_type == "FuelLog":
        record = db.get(models.FuelLog, req.resource_id)
        if not record:
            raise HTTPException(409, "This fuel log no longer exists — the request may be a stale duplicate. Reject it instead.")
        db.delete(record)
        emit("fuel_updated", {})
    elif req.resource_type == "MaintenanceRecord":
        record = db.get(models.MaintenanceRecord, req.resource_id)
        if not record:
            raise HTTPException(409, "This maintenance record no longer exists — the request may be a stale duplicate. Reject it instead.")
        db.delete(record)
        emit("maintenance_updated", {})
    elif req.resource_type == "Trip":
        # Soft delete — keeps the trip (and its closure/sheet/invoice) recoverable
        # from the "Deleted Trips" page instead of destroying it outright.
        trip = db.get(models.Trip, req.resource_id)
        if not trip:
            raise HTTPException(409, "This trip no longer exists — the request may be a stale duplicate. Reject it instead.")
        if trip.deleted_at is None:
            trip.deleted_at = datetime.now(timezone.utc)
            emit("trip_deleted", {"trip_id": req.resource_id, "trip_id_str": req.resource_name})
    elif req.resource_type == "Driver":
        # Soft delete — keeps the driver recoverable from the "Archive" page
        # instead of destroying it outright, same pattern as drivers.py's
        # delete_driver (which handles the Admin-direct-delete path).
        driver = db.get(models.Driver, req.resource_id)
        if not driver:
            raise HTTPException(409, "This driver no longer exists — the request may be a stale duplicate. Reject it instead.")
        if driver.deleted_at is None:
            driver.deleted_at = datetime.now(timezone.utc)
            emit("driver_updated", {})
    elif req.resource_type == "Truck":
        truck = db.get(models.Truck, req.resource_id)
        if not truck:
            raise HTTPException(409, "This truck no longer exists — the request may be a stale duplicate. Reject it instead.")
        if truck.deleted_at is None:
            truck.deleted_at = datetime.now(timezone.utc)
            emit("truck_updated", {})
    elif req.resource_type == "Staff":
        staff = db.get(models.Staff, req.resource_id)
        if not staff:
            raise HTTPException(409, "This staff member no longer exists — the request may be a stale duplicate. Reject it instead.")
        if staff.deleted_at is None:
            staff.deleted_at = datetime.now(timezone.utc)
    elif req.resource_type == "Customer":
        customer = db.get(models.Customer, req.resource_id)
        if not customer:
            raise HTTPException(409, "This customer no longer exists — the request may be a stale duplicate. Reject it instead.")
        if customer.deleted_at is None:
            customer.deleted_at = datetime.now(timezone.utc)
            emit("customer_updated", {})
    elif req.resource_type == "Vendor":
        vendor = db.get(models.Vendor, req.resource_id)
        if not vendor:
            raise HTTPException(409, "This vendor no longer exists — the request may be a stale duplicate. Reject it instead.")
        if vendor.deleted_at is None:
            vendor.deleted_at = datetime.now(timezone.utc)
            emit("vendor_updated", {})

    req.status = "Approved"
    req.approved_by_name = current_user.name
    req.approved_at = datetime.now(timezone.utc)
    req.admin_note = payload.admin_note
    db.commit()
    db.refresh(req)
    emit("deletion_approval_updated", {"id": req.id, "status": "Approved"})
    return req


@router.put("/{req_id}/reject", response_model=schemas.DeletionApprovalRequestOut, dependencies=[Depends(require_roles())])
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
