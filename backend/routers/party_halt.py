"""Customer Detention: party (customer-caused) halt — the halt pay the company
owes the driver for customer delays — and whether it has been billed to the
customer and paid back.

  Not billed          the trip isn't invoiced yet
  Missed on invoice   invoiced, but no line linked to "Halt Pay"
  Invoice waived      the trip's invoice was waived, so there's nothing to bill
  Billed              an invoice line linked to "Halt Pay" (SAC Code Management)
  Paid                marked paid on the Customer Detention page

Billed is read from the invoice itself, so it can't drift from it; only Paid
is stored (party_halt_recoveries), with who saved it, when, and an optional
proof of payment."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session, undefer

import models
from database import get_db
from security import TokenUser, get_current_user, require_roles

router = APIRouter(prefix="/party-halt", tags=["Customer Detention"])
ROLES = ("Accounts",)  # plus Admin (require_roles)
HALT_EXPENSE = "Halt Pay"
OPEN_STATUSES = ("Not billed", "Missed on invoice", "Billed")
IST = timezone(timedelta(hours=5, minutes=30))


def party_halt_amount(closure: models.TripClosure) -> float:
    """The customer's share of the halt pay — the saved part, or for trips
    closed before the parts were saved, the total split equally by day
    (frontend lib/halt-pay.ts haltPayFromClosure)."""
    party_days = closure.party_halt_days or 0
    if party_days <= 0:
        return 0.0
    if closure.company_halt_pay is not None and closure.party_halt_pay is not None:
        return float(closure.party_halt_pay)
    total_days = party_days + (closure.company_halt_days or 0)
    return round(float(closure.driver_halt_compensation or 0) / total_days * party_days, 2)


def _billed_halt(invoice: models.TripInvoice | None, halt_ids: set[str], halt_names: set[str]) -> float:
    """What this invoice charges on lines linked to Halt Pay."""
    total = 0.0
    for line in (invoice.services or []) if invoice else []:
        if str(line.get("sacId") or "") in halt_ids or (not line.get("sacId") and line.get("descriptionOfService") in halt_names):
            try:
                total += float(line.get("rate") or 0) * float(line.get("quantity") or 1)
            except (TypeError, ValueError):
                pass
    return round(total, 2)


def _iso(dt: datetime | None) -> str | None:
    return dt.replace(tzinfo=timezone.utc).isoformat() if dt else None


def rows(db: Session) -> list[dict]:
    """Every trip with party halt, newest completed first."""
    halt = db.query(models.SacCode.id, models.SacCode.description).filter(models.SacCode.linked_expense == HALT_EXPENSE).all()
    halt_ids, halt_names = {str(i) for i, _ in halt}, {d for _, d in halt}
    customers = dict(db.query(models.Customer.id, models.Customer.name).all())
    paid = {r.trip_id: r for r in db.query(models.PartyHaltRecovery)}
    trips = (db.query(models.Trip, models.TripClosure)
             .join(models.TripClosure, models.TripClosure.trip_id == models.Trip.id)
             .filter(models.Trip.deleted_at.is_(None), models.TripClosure.party_halt_days > 0)
             .order_by(models.TripClosure.trip_completed_date.desc()).all())
    invoices = {i.trip_id: i for i in db.query(models.TripInvoice).filter(
        models.TripInvoice.trip_id.in_([t.id for t, _ in trips]))} if trips else {}
    # A combined invoice may carry its halt line on another trip's row.
    numbers = [i.invoice_no for i in invoices.values() if i.invoice_no]
    by_number: dict[str, list] = {}
    for inv in db.query(models.TripInvoice).filter(models.TripInvoice.invoice_no.in_(numbers)) if numbers else []:
        by_number.setdefault(inv.invoice_no, []).append(inv)

    out = []
    for trip, closure in trips:
        amount = party_halt_amount(closure)
        if amount <= 0:
            continue
        inv = invoices.get(trip.id)
        billed = sum(_billed_halt(i, halt_ids, halt_names) for i in by_number.get(inv.invoice_no, [inv])) if inv else 0.0
        rec = paid.get(trip.id)
        if rec:
            status = "Paid"
        elif trip.invoice_waived and not trip.is_invoiced:
            status = "Invoice waived"
        elif not trip.is_invoiced:
            status = "Not billed"
        elif billed <= 0:
            status = "Missed on invoice"
        else:
            status = "Billed"
        out.append({
            "trip_db_id": trip.id, "trip_id": trip.trip_id,
            "customer": customers.get(trip.customer_id) or trip.custom_customer_name or trip.shipper_consignee or "—",
            "completed_date": closure.trip_completed_date.isoformat() if closure.trip_completed_date else None,
            "party_days": closure.party_halt_days, "amount": amount,
            "invoice_no": inv.invoice_no if inv else None,
            "invoice_date": inv.invoice_date.isoformat() if inv and inv.invoice_date else None,
            "billed_amount": round(billed, 2), "status": status,
            "paid_on": rec.received_on.isoformat() if rec else None,
            "paid_amount": float(rec.amount) if rec else None,
            "paid_note": rec.note if rec else None,
            "paid_by": rec.marked_by_name if rec else None,
            "paid_saved_at": _iso(rec.marked_at) if rec else None,
            "proof_file_name": rec.proof_file_name if rec else None,
            "proof_size_bytes": rec.proof_size_bytes if rec else None,
        })
    return out


def totals(items: list[dict], today: date | None = None) -> dict:
    today = today or datetime.now(IST).date()
    month = today.isoformat()[:7]
    outstanding = [r for r in items if r["status"] in OPEN_STATUSES]
    return {
        "outstanding_amount": round(sum(r["amount"] for r in outstanding), 2),
        "outstanding_trips": len(outstanding),
        "missed_on_invoice": sum(1 for r in items if r["status"] == "Missed on invoice"),
        "billed_trips": sum(1 for r in items if r["status"] == "Billed"),
        "billed_amount": round(sum(r["amount"] for r in items if r["status"] == "Billed"), 2),
        "paid_amount": round(sum(r["paid_amount"] or 0 for r in items if r["status"] == "Paid"), 2),
        "paid_this_month": round(sum(r["paid_amount"] or 0 for r in items
                                     if r["status"] == "Paid" and (r["paid_on"] or "").startswith(month)), 2),
    }


def _filtered(items: list[dict], status: str | None, search: str | None, start: str | None, end: str | None) -> list[dict]:
    q = (search or "").strip().lower()
    return [r for r in items
            if (not status or r["status"] == status)
            and (not q or any(q in (v or "").lower() for v in (r["trip_id"], r["customer"], r["invoice_no"])))
            and (not (start or end) or (r["completed_date"] and (not start or r["completed_date"] >= start)
                                        and (not end or r["completed_date"] <= end)))]


@router.get("", dependencies=[Depends(require_roles(*ROLES))])
def list_party_halt(db: Session = Depends(get_db)):
    items = rows(db)
    return {"rows": items, "totals": totals(items)}


@router.get("/export", dependencies=[Depends(require_roles(*ROLES))])
def export_party_halt(
    status: Optional[str] = Query(None), search: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    to_date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
):
    """The page's list as Excel, following its status chip, search and dates."""
    from excel_utils import build_excel_response
    items = _filtered(rows(db), status, search, from_date, to_date)
    headers = ["Trip ID", "Customer", "Completed", "Party Halt Days", "Amount", "Invoice No", "Invoice Date",
               "Halt on Invoice", "Status", "Paid On", "Paid Amount", "Paid By", "Saved At", "Note", "Proof"]
    data = [[r["trip_id"], r["customer"], date.fromisoformat(r["completed_date"]) if r["completed_date"] else None,
             r["party_days"], r["amount"], r["invoice_no"], date.fromisoformat(r["invoice_date"]) if r["invoice_date"] else None,
             r["billed_amount"], r["status"], date.fromisoformat(r["paid_on"]) if r["paid_on"] else None, r["paid_amount"],
             r["paid_by"], datetime.fromisoformat(r["paid_saved_at"]).astimezone(IST).replace(tzinfo=None) if r["paid_saved_at"] else None,
             r["paid_note"], r["proof_file_name"] or ""] for r in items]
    return build_excel_response([("Customer Detention", headers, data)], "customer_detention.xlsx")


def _trip_with_halt(db: Session, trip_id: int) -> float:
    trip = db.get(models.Trip, trip_id)
    closure = db.query(models.TripClosure).filter(models.TripClosure.trip_id == trip_id).first()
    if not trip or trip.deleted_at is not None or not closure:
        raise HTTPException(404, "Trip not found")
    amount = party_halt_amount(closure)
    if amount <= 0:
        raise HTTPException(400, "This trip has no party halt to recover.")
    return amount


@router.post("/{trip_id}/paid", dependencies=[Depends(require_roles(*ROLES))])
async def mark_paid(
    trip_id: int,
    received_on: date = Form(...),
    amount: Optional[str] = Form(None, description="Defaults to the party halt amount; less for a part payment"),
    note: Optional[str] = Form(None, max_length=500),
    proof: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Mark Customer Detention paid. The proof of payment is optional; who
    saved it and when are recorded."""
    from routers.maintenance import _read_retread_proof
    halt_amount = _trip_with_halt(db, trip_id)
    if received_on > datetime.now(IST).date():
        raise HTTPException(400, "The date received can't be in the future.")
    try:
        paid = Decimal(amount) if amount not in (None, "") else Decimal(str(halt_amount))
    except InvalidOperation:
        raise HTTPException(422, "Enter the amount received as a number.")
    if paid <= 0:
        raise HTTPException(400, "The amount received must be more than ₹0.")
    file = await _read_retread_proof(proof)
    rec = db.get(models.PartyHaltRecovery, trip_id)
    if rec:
        raise HTTPException(409, "This detention is already marked paid. An Admin can undo it first.")
    rec = models.PartyHaltRecovery(
        trip_id=trip_id, received_on=received_on, amount=paid, note=(note or "").strip() or None,
        marked_by_id=current_user.id, marked_by_name=current_user.name, marked_at=datetime.now(timezone.utc),
    )
    if file:
        rec.proof_data, rec.proof_file_name = file
        rec.proof_size_bytes = len(file[0])
    db.add(rec)
    db.commit()
    return next(r for r in rows(db) if r["trip_db_id"] == trip_id)


@router.delete("/{trip_id}/paid", dependencies=[Depends(require_roles())])
def undo_paid(trip_id: int, db: Session = Depends(get_db)):
    """Admin only: undo a payment marked by mistake (its proof goes with it)."""
    rec = db.get(models.PartyHaltRecovery, trip_id)
    if not rec:
        raise HTTPException(404, "This detention isn't marked paid.")
    db.delete(rec)
    db.commit()
    return next((r for r in rows(db) if r["trip_db_id"] == trip_id), None)


@router.get("/{trip_id}/proof", dependencies=[Depends(require_roles(*ROLES))])
def download_proof(trip_id: int, db: Session = Depends(get_db)):
    from routers.maintenance import _tyre_proof_mime
    rec = (db.query(models.PartyHaltRecovery).options(undefer(models.PartyHaltRecovery.proof_data))
           .filter(models.PartyHaltRecovery.trip_id == trip_id).first())
    if not rec or rec.proof_data is None:
        raise HTTPException(404, "No proof of payment for this detention")
    return Response(
        content=rec.proof_data,
        media_type=_tyre_proof_mime(rec.proof_data) or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{(rec.proof_file_name or "proof").replace(chr(34), "")}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )
