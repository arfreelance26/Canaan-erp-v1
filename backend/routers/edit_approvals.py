import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, get_args
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from excel_utils import build_excel_response
from security import get_current_user, require_roles, TokenUser
import models, schemas
from websocket_manager import emit

router = APIRouter(prefix="/edit-approvals", tags=["Edit Approvals"])
_log = logging.getLogger("canaan.app")

# A handful of legacy rows predate resource_type validation and carry an
# empty string. response_model=list[...] validates every row before sending
# a response, so one bad row 500s the request for every caller — filter
# those out here rather than letting stale data take down the whole list.
_VALID_RESOURCE_TYPES = set(get_args(schemas.EditApprovalResourceType))


def _drop_invalid_resource_type(rows: list["models.EditApprovalRequest"]) -> list["models.EditApprovalRequest"]:
    valid = [r for r in rows if r.resource_type in _VALID_RESOURCE_TYPES]
    if len(valid) != len(rows):
        _log.warning(
            "Dropped %d edit-approval row(s) with invalid resource_type: ids=%s",
            len(rows) - len(valid),
            [r.id for r in rows if r.resource_type not in _VALID_RESOURCE_TYPES],
        )
    return valid


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
        proposed_changes=payload.proposed_changes,
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
    _: TokenUser = Depends(require_roles("Admin", "Commercial Manager", "Assistant Commercial Manager")),
):
    q = db.query(models.EditApprovalRequest)
    if status:
        q = q.filter(models.EditApprovalRequest.status == status)
    if resource_type:
        q = q.filter(models.EditApprovalRequest.resource_type == resource_type)
    rows = q.order_by(models.EditApprovalRequest.created_at.desc()).all()
    return _drop_invalid_resource_type(rows)


_IST = timezone(timedelta(hours=5, minutes=30))


def _fmt_ist(dt: Optional[datetime]) -> str:
    """Stored timestamps are UTC (naive or aware); exports show IST."""
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_IST).strftime("%d-%m-%Y %I:%M %p")


@router.get("/export")
def export_edit_approvals(
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD (inclusive, on the requested date, IST)"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD (inclusive, on the requested date, IST)"),
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin", "Commercial Manager")),
):
    """Excel export of the Edit Approvals list (every status), same roles as the page."""
    reqs = db.query(models.EditApprovalRequest).order_by(models.EditApprovalRequest.created_at.desc()).all()
    headers = [
        "Requested By", "Staff Code", "Resource Type", "Resource", "Action", "Reason",
        "Status", "Requested At", "Decided By", "Decided At", "Access Expires At", "Admin Note",
    ]
    rows = []
    for r in reqs:
        created = r.created_at
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            day = created.astimezone(_IST).date().isoformat()
            if from_date and day < from_date:
                continue
            if to_date and day > to_date:
                continue
        elif from_date or to_date:
            continue
        # Mirror the page's buckets: an Approved request whose 8-hour edit window
        # has run out is shown as "Completed".
        status = r.status
        if status == "Approved" and r.expires_at is not None:
            exp = r.expires_at if r.expires_at.tzinfo else r.expires_at.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                status = "Completed"
        rows.append([
            r.staff_name, r.staff_code or "", r.resource_type, r.resource_name, r.action, r.reason,
            status, _fmt_ist(r.created_at), r.approved_by_name or "", _fmt_ist(r.approved_at),
            _fmt_ist(r.expires_at), r.admin_note or "",
        ])
    suffix = f"_{from_date or ''}_to_{to_date or ''}" if from_date or to_date else ""
    return build_excel_response([("Edit Approvals", headers, rows)], f"edit_approvals{suffix}.xlsx")


@router.get("/my-active", response_model=list[schemas.EditApprovalRequestOut])
def get_my_active_approvals(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Returns Approved, non-expired edit requests for the calling user."""
    now = datetime.now(timezone.utc)
    rows = db.query(models.EditApprovalRequest).filter(
        models.EditApprovalRequest.staff_db_id == current_user.id,
        models.EditApprovalRequest.status == "Approved",
        models.EditApprovalRequest.expires_at > now,
    ).all()
    return _drop_invalid_resource_type(rows)


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
    rows = q.order_by(models.EditApprovalRequest.created_at.desc()).all()
    return _drop_invalid_resource_type(rows)


@router.patch("/{request_id}/approve", response_model=schemas.EditApprovalRequestOut)
def approve_edit_request(
    request_id: int,
    payload: Optional[schemas.ApproveDeletePayload] = None,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin", "Commercial Manager", "Assistant Commercial Manager")),
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
    elif req.action == "Edit" and req.resource_type == "FuelLog":
        # Apply the proposed field changes to the fuel log immediately
        log = db.get(models.FuelLog, req.resource_id)
        if log:
            changes = req.proposed_changes or {}
            if "date" in changes:
                log.date = changes["date"]
            if "odometer" in changes:
                log.odometer = changes["odometer"]
            if "litres" in changes:
                log.litres = changes["litres"]
            if "price_per_litre" in changes:
                log.price_per_litre = changes["price_per_litre"]
            if "total_cost" in changes:
                log.total_cost = changes["total_cost"]
            if "fuel_station" in changes:
                log.fuel_station = changes["fuel_station"]
            log.version = (log.version or 1) + 1

            # Re-sequence distance/mileage for all logs of this truck
            truck_id = log.truck_id
            db.flush()
            remaining = (
                db.query(models.FuelLog)
                .filter(models.FuelLog.truck_id == truck_id)
                .order_by(models.FuelLog.odometer.asc())
                .all()
            )
            for i, row in enumerate(remaining):
                if i == 0:
                    row.distance = 0
                    row.mileage = 0
                else:
                    prev = remaining[i - 1]
                    dist = max(float(row.odometer) - float(prev.odometer), 0)
                    row.distance = dist
                    row.mileage = (dist / float(row.litres)) if float(row.litres) > 0 and dist > 0 else 0
            emit("fuel_updated", {})
        req.expires_at = None
    else:
        req.expires_at = req.approved_at + timedelta(minutes=480)

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
    _: TokenUser = Depends(require_roles("Admin", "Commercial Manager", "Assistant Commercial Manager")),
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
