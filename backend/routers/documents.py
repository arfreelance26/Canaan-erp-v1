"""Proof and Documents — every proof of payment and document in the app, in
one place.

Nothing is uploaded here: files stay where they're attached (maintenance
records, Maintenance Approvals, Tyre Inventory, retreads, Our Fleet /
Compliance & Renewals, Our Drivers, Our Staff). This page only lists them,
serves them (with ITS OWN role check, whatever the source page allows) and
lists the costs that still have no proof.

Who sees what:
  Admin                     everything
  Accounts                  everything except personal ID documents
Personal ID documents (driver Aadhaar/licence, staff Aadhaar/identity) are
Admin only, and every download of them — and of truck documents — is audited.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from audit import record_audit
from database import get_db
from excel_utils import build_excel_response
from security import TokenUser, get_current_user

router = APIRouter(prefix="/documents", tags=["Proof and Documents"])

# category → (label, roles that may see it; Admin always may)
CATEGORIES: dict[str, tuple[str, tuple[str, ...]]] = {
    "maintenance":     ("Maintenance bill", ("Accounts",)),
    "request":         ("Maintenance request (awaiting approval)", ("Accounts",)),
    "tyre":            ("Tyre purchase", ("Accounts",)),
    "retread":         ("Tyre retread", ("Accounts",)),
    "detention":       ("Customer detention payment", ("Accounts",)),
    "truck_doc":       ("Truck document", ("Accounts",)),
    "truck_doc_old":   ("Truck document (previous)", ("Accounts",)),
    "truck_photo":     ("Truck photo", ("Accounts",)),
    "driver_id":       ("Driver ID document", ()),
    "staff_id":        ("Staff ID document", ()),
}
PAGE_ROLES = {"Admin", "Accounts"}
TRUCK_PHOTOS = {"photo": ("photo_blob", "truck_photos_file_name", "Vehicle identity image"),
                "front_view": ("front_view_blob", "front_view_file_name", "Front view"),
                "rear_view": ("rear_view_blob", "rear_view_file_name", "Rear view"),
                "left_view": ("left_view_blob", "left_view_file_name", "Left view"),
                "right_view": ("right_view_blob", "right_view_file_name", "Right view")}
DRIVER_DOCS = {"aadhaar": ("aadhaar_blob", "aadhaar_file_name", "Aadhaar"),
               "license": ("license_blob", "license_file_name", "Driving licence")}
STAFF_DOCS = {"aadhar": ("aadhar_document_blob", "aadhar_file_name", "Aadhaar"),
              "identity": ("identity_image_blob", "identity_image_url", "Identity image")}


def _allowed(role: str) -> set[str]:
    if role == "Admin":
        return set(CATEGORIES)
    return {c for c, (_, roles) in CATEGORIES.items() if role in roles}


def _require_page(user: TokenUser) -> set[str]:
    if user.role not in PAGE_ROLES:
        raise HTTPException(403, "You don't have access to Proof and Documents.")
    return _allowed(user.role)


def _num(v) -> Optional[float]:
    return float(v) if v is not None else None


def _name(v: Optional[str], fallback: str) -> str:
    v = (v or "").strip()
    # Some columns hold a path/URL rather than a bare name.
    return v.replace("\\", "/").split("/")[-1].split("?")[0] or fallback


def _item(key, category, *, date_=None, title, truck=None, party=None, invoice_number=None,
          invoice_date=None, amount=None, file_name, size=None, uploaded_by=None, uploaded_at=None,
          status=None, link=None, ref=None) -> dict:
    return {
        "key": key, "category": category, "category_label": CATEGORIES[category][0],
        "date": date_.isoformat() if isinstance(date_, (date, datetime)) else date_,
        "title": title, "truck_id": truck.truck_id if truck else None,
        "registration_number": truck.registration_number if truck else None,
        "party": party, "invoice_number": invoice_number,
        "invoice_date": invoice_date.isoformat() if invoice_date else None,
        "amount": _num(amount), "file_name": file_name, "size_bytes": int(size) if size else None,
        "uploaded_by": uploaded_by,
        "uploaded_at": uploaded_at.isoformat() if uploaded_at else None,
        "status": status, "link": link, "ref": ref,
    }


def collect(db: Session, cats: set[str]) -> list[dict]:
    """Every document in the categories asked for, newest first."""
    from routers.compliance_records import DOCS
    trucks = {t.id: t for t in db.query(models.Truck).all()}
    out: list[dict] = []

    if "maintenance" in cats:
        rows = (db.query(models.MaintenanceProof, models.MaintenanceRecord)
                .join(models.MaintenanceRecord, models.MaintenanceRecord.id == models.MaintenanceProof.record_id).all())
        for p, r in rows:
            out.append(_item(f"mp-{p.id}", "maintenance", date_=r.date, title=r.maintenance_type,
                             truck=trucks.get(r.truck_id), party=r.maintenance_by, invoice_number=r.invoice_number,
                             invoice_date=r.invoice_date, amount=r.cost, file_name=p.file_name, size=p.size_bytes,
                             uploaded_by=p.uploaded_by_name, uploaded_at=getattr(p, "created_at", None),
                             link="/maintenance/trucks", ref=f"Maintenance record #{r.id}"))

    if "request" in cats:
        rows = (db.query(models.MaintenanceRequestProof, models.MaintenanceRequest)
                .join(models.MaintenanceRequest, models.MaintenanceRequest.id == models.MaintenanceRequestProof.request_id)
                .filter(models.MaintenanceRequest.status != "Approved").all())   # approved → copied to the record
        for p, q in rows:
            pl = q.payload or {}
            inv_date = None
            try:
                inv_date = date.fromisoformat(pl["invoice_date"]) if pl.get("invoice_date") else None
            except (TypeError, ValueError):
                pass
            out.append(_item(f"rp-{p.id}", "request", date_=pl.get("date"), title=pl.get("maintenance_type") or "Maintenance",
                             truck=trucks.get(q.truck_id), party=pl.get("maintenance_by"),
                             invoice_number=pl.get("invoice_number"), invoice_date=inv_date, amount=pl.get("cost"),
                             file_name=p.file_name, size=p.size_bytes, uploaded_by=p.uploaded_by_name,
                             uploaded_at=p.created_at, status=q.status, link="/attendance/maintenance-approvals",
                             ref=f"Maintenance request #{q.id}"))

    if "tyre" in cats:
        rows = (db.query(models.TyreInventory)
                .filter(models.TyreInventory.proof_file_name.isnot(None), models.TyreInventory.deleted_at.is_(None)).all())
        for t in rows:
            out.append(_item(f"ty-{t.id}", "tyre", date_=t.invoice_date or t.purchase_date,
                             title=f"{t.brand} {t.tyre_number}".strip(), party=t.maintenance_by,
                             invoice_number=t.invoice_number, invoice_date=t.invoice_date, amount=t.cost,
                             file_name=t.proof_file_name, size=t.proof_size_bytes,
                             link="/maintenance/tyre-inventory", ref=f"Tyre {t.tyre_number}"))

    if "detention" in cats:
        from routers.party_halt import party_halt_amount
        customers = dict(db.query(models.Customer.id, models.Customer.name).all())
        for rec, trip, closure in (db.query(models.PartyHaltRecovery, models.Trip, models.TripClosure)
                                   .join(models.Trip, models.Trip.id == models.PartyHaltRecovery.trip_id)
                                   .join(models.TripClosure, models.TripClosure.trip_id == models.Trip.id)
                                   .filter(models.PartyHaltRecovery.proof_file_name.isnot(None)).all()):
            out.append(_item(f"ph-{trip.id}", "detention", date_=rec.received_on,
                             title=f"Customer detention · {trip.trip_id}",
                             party=customers.get(trip.customer_id) or trip.custom_customer_name,
                             amount=rec.amount or party_halt_amount(closure), file_name=rec.proof_file_name,
                             size=rec.proof_size_bytes, uploaded_by=rec.marked_by_name, uploaded_at=rec.marked_at,
                             link="/finance/customer-detention", ref=f"Trip {trip.trip_id}"))

    if "retread" in cats:
        rows = (db.query(models.TyreMovementEvent, models.TyreInventory)
                .join(models.TyreInventory, models.TyreInventory.id == models.TyreMovementEvent.tyre_id)
                .filter(models.TyreMovementEvent.proof_file_name.isnot(None)).all())
        for ev, t in rows:
            out.append(_item(f"rt-{ev.id}", "retread", date_=ev.invoice_date or ev.created_at,
                             title=f"Retread #{ev.retread_count or ''} · {t.brand} {t.tyre_number}".strip(),
                             party=ev.retread_done_by, invoice_number=ev.invoice_number, invoice_date=ev.invoice_date,
                             amount=ev.retread_cost, file_name=ev.proof_file_name, size=ev.proof_size_bytes,
                             uploaded_by=ev.proof_uploaded_by or ev.actor_name, uploaded_at=ev.created_at,
                             link="/maintenance/tyre-inventory", ref=f"Tyre {t.tyre_number}"))

    if "truck_doc" in cats or "truck_doc_old" in cats:
        # Current documents live on the truck; earlier ones on their compliance row.
        latest = {}
        for rec in db.query(models.TruckComplianceRecord).order_by(models.TruckComplianceRecord.id):
            latest[(rec.truck_id, rec.doc_type)] = rec
        if "truck_doc" in cats:
            for key, spec in DOCS.items():
                blob = getattr(models.Truck, spec["blob"])
                for tid, size, fname in (db.query(models.Truck.id, func.length(blob), getattr(models.Truck, spec["file"]))
                                         .filter(blob.isnot(None)).all()):
                    if not size:
                        continue
                    rec, truck = latest.get((tid, key)), trucks.get(tid)
                    out.append(_item(f"td-{tid}-{key}", "truck_doc",
                                     date_=(rec.valid_from or (rec.created_at.date() if rec.created_at else None)) if rec else None,
                                     title=spec["label"] + (f" · valid until {rec.valid_until.strftime('%d-%m-%Y')}" if rec and rec.valid_until else ""),
                                     truck=truck, invoice_number=rec.doc_number if rec else None,
                                     amount=rec.expense if rec else None, file_name=_name(fname, f"{key}.pdf"), size=size,
                                     uploaded_by=rec.created_by_name if rec else None,
                                     uploaded_at=rec.created_at if rec else None,
                                     status="Removed truck" if truck and truck.deleted_at else "Current",
                                     link="/maintenance/compliance", ref=spec["label"]))
        if "truck_doc_old" in cats:
            rows = (db.query(models.TruckComplianceRecord.id, func.length(models.TruckComplianceRecord.file_blob))
                    .filter(models.TruckComplianceRecord.file_blob.isnot(None)).all())
            sizes = {rid: size for rid, size in rows if size}
            for rec in db.query(models.TruckComplianceRecord).filter(models.TruckComplianceRecord.id.in_(list(sizes) or [0])):
                spec = DOCS.get(rec.doc_type, {"label": rec.doc_type})
                out.append(_item(f"tc-{rec.id}", "truck_doc_old",
                                 date_=rec.valid_from or (rec.created_at.date() if rec.created_at else None),
                                 title=spec["label"] + (f" · valid until {rec.valid_until.strftime('%d-%m-%Y')}" if rec.valid_until else ""),
                                 truck=trucks.get(rec.truck_id), invoice_number=rec.doc_number, amount=rec.expense,
                                 file_name=_name(rec.file_name, f"{rec.doc_type}.pdf"), size=sizes[rec.id],
                                 uploaded_by=rec.created_by_name, uploaded_at=rec.created_at,
                                 status="Superseded", link="/maintenance/compliance", ref=spec["label"]))

    if "truck_photo" in cats:
        for field, (blob_col, name_col, label) in TRUCK_PHOTOS.items():
            blob = getattr(models.Truck, blob_col)
            for tid, size, fname in (db.query(models.Truck.id, func.length(blob), getattr(models.Truck, name_col))
                                     .filter(blob.isnot(None)).all()):
                if size:
                    truck = trucks.get(tid)
                    out.append(_item(f"tp-{tid}-{field}", "truck_photo", title=label, truck=truck,
                                     file_name=_name(fname, f"{field}.jpg"), size=size,
                                     status="Removed truck" if truck and truck.deleted_at else None,
                                     link="/resources/fleet", ref=label))

    for cat, model, docs, link, who in (("driver_id", models.Driver, DRIVER_DOCS, "/resources/drivers", "driver"),
                                        ("staff_id", models.Staff, STAFF_DOCS, "/resources/staff", "staff")):
        if cat not in cats:
            continue
        people = {p.id: p for p in db.query(model).filter(model.deleted_at.is_(None))}
        for field, (blob_col, name_col, label) in docs.items():
            blob = getattr(model, blob_col)
            for pid, size, fname in (db.query(model.id, func.length(blob), getattr(model, name_col))
                                     .filter(blob.isnot(None)).all()):
                person = people.get(pid)
                if size and person:
                    code = getattr(person, "driver_id", None) or getattr(person, "staff_id", None) or ""
                    out.append(_item(f"{'dr' if who == 'driver' else 'st'}-{pid}-{field}", cat,
                                     title=f"{label} · {person.name}", party=f"{person.name} ({code})" if code else person.name,
                                     file_name=_name(fname, f"{field}.pdf"), size=size, link=link, ref=label))

    out.sort(key=lambda d: (d["date"] or d["uploaded_at"] or ""), reverse=True)
    return out


@router.get("")
def list_documents(db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    cats = _require_page(current_user)
    return {
        "categories": [{"key": c, "label": CATEGORIES[c][0]} for c in CATEGORIES if c in cats],
        "items": collect(db, cats),
    }


def missing_proofs(db: Session, cats: set[str]) -> list[dict]:
    """Costs that still have no proof: maintenance jobs, tyre purchases,
    retreads, and (Admin/Accounts) truck documents with an expense but no file."""
    from routers.compliance_records import DOCS
    trucks = {t.id: t for t in db.query(models.Truck).all()}
    out = []
    if "maintenance" in cats:
        with_proof = {rid for (rid,) in db.query(models.MaintenanceProof.record_id).distinct()}
        for r in db.query(models.MaintenanceRecord).filter(models.MaintenanceRecord.cost > 0):
            if r.id not in with_proof:
                out.append(_item(f"mr-{r.id}", "maintenance", date_=r.date, title=r.maintenance_type,
                                 truck=trucks.get(r.truck_id), party=r.maintenance_by, invoice_number=r.invoice_number,
                                 invoice_date=r.invoice_date, amount=r.cost, file_name=None,
                                 link="/maintenance/trucks", ref=f"Maintenance record #{r.id}"))
    if "tyre" in cats:
        for t in db.query(models.TyreInventory).filter(models.TyreInventory.proof_file_name.is_(None),
                                                       models.TyreInventory.deleted_at.is_(None),
                                                       models.TyreInventory.cost > 0):
            out.append(_item(f"tm-{t.id}", "tyre", date_=t.invoice_date or t.purchase_date,
                             title=f"{t.brand} {t.tyre_number}".strip(), party=t.maintenance_by,
                             invoice_number=t.invoice_number, invoice_date=t.invoice_date, amount=t.cost, file_name=None,
                             link="/maintenance/tyre-inventory", ref=f"Tyre {t.tyre_number}"))
    if "retread" in cats:
        rows = (db.query(models.TyreMovementEvent, models.TyreInventory)
                .join(models.TyreInventory, models.TyreInventory.id == models.TyreMovementEvent.tyre_id)
                .filter(models.TyreMovementEvent.event == "Moved to Inventory",
                        models.TyreMovementEvent.proof_file_name.is_(None),
                        models.TyreMovementEvent.retread_cost > 0).all())
        for ev, t in rows:
            out.append(_item(f"rm-{ev.id}", "retread", date_=ev.invoice_date or ev.created_at,
                             title=f"Retread #{ev.retread_count or ''} · {t.brand} {t.tyre_number}".strip(),
                             party=ev.retread_done_by, invoice_number=ev.invoice_number, invoice_date=ev.invoice_date,
                             amount=ev.retread_cost, file_name=None,
                             link="/maintenance/tyre-inventory", ref=f"Tyre {t.tyre_number}"))
    if "truck_doc" in cats:
        latest = {}
        for rec in db.query(models.TruckComplianceRecord).order_by(models.TruckComplianceRecord.id):
            latest[(rec.truck_id, rec.doc_type)] = rec
        for key, spec in DOCS.items():
            blob = getattr(models.Truck, spec["blob"])
            has_file = {tid for tid, size in db.query(models.Truck.id, func.length(blob)).filter(blob.isnot(None)) if size}
            for (tid, doc_type), rec in latest.items():
                truck = trucks.get(tid)
                if doc_type == key and rec.expense and float(rec.expense) > 0 and tid not in has_file \
                        and truck is not None and truck.deleted_at is None:
                    out.append(_item(f"tdm-{tid}-{key}", "truck_doc",
                                     date_=rec.valid_from or (rec.created_at.date() if rec.created_at else None),
                                     title=spec["label"], truck=truck, invoice_number=rec.doc_number, amount=rec.expense,
                                     file_name=None, link="/maintenance/compliance", ref=spec["label"]))
    out.sort(key=lambda d: d["date"] or "", reverse=True)
    return out


@router.get("/missing")
def list_missing(db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    return missing_proofs(db, _require_page(current_user))


def _file_for(db: Session, key: str) -> tuple[str, bytes, str]:
    """(category, bytes, file name) for one document key."""
    from routers.compliance_records import DOCS, _latest
    from sqlalchemy.orm import undefer
    parts = key.split("-")
    kind = parts[0]
    try:
        rid = int(parts[1])
    except (IndexError, ValueError):
        raise HTTPException(404, "Document not found")
    field = "-".join(parts[2:]) if len(parts) > 2 else None

    if kind == "mp":
        p = db.query(models.MaintenanceProof).options(undefer(models.MaintenanceProof.data)).filter_by(id=rid).first()
        if p:
            return "maintenance", p.data, p.file_name
    elif kind == "rp":
        p = db.query(models.MaintenanceRequestProof).options(undefer(models.MaintenanceRequestProof.data)).filter_by(id=rid).first()
        if p:
            return "request", p.data, p.file_name
    elif kind == "ty":
        t = db.query(models.TyreInventory).options(undefer(models.TyreInventory.proof_data)).filter_by(id=rid).first()
        if t and t.proof_data:
            return "tyre", t.proof_data, t.proof_file_name
    elif kind == "ph":
        rec = (db.query(models.PartyHaltRecovery).options(undefer(models.PartyHaltRecovery.proof_data))
               .filter_by(trip_id=rid).first())
        if rec and rec.proof_data:
            return "detention", rec.proof_data, rec.proof_file_name
    elif kind == "rt":
        ev = db.query(models.TyreMovementEvent).options(undefer(models.TyreMovementEvent.proof_data)).filter_by(id=rid).first()
        if ev and ev.proof_data:
            return "retread", ev.proof_data, ev.proof_file_name
    elif kind == "td" and field in DOCS:
        t = db.get(models.Truck, rid)
        spec = DOCS[field]
        data = getattr(t, spec["blob"]) if t else None
        if data:
            return "truck_doc", data, _name(getattr(t, spec["file"]), f"{field}.pdf")
    elif kind == "tc":
        rec = (db.query(models.TruckComplianceRecord).options(undefer(models.TruckComplianceRecord.file_blob))
               .filter_by(id=rid).first())
        if rec:
            latest = _latest(db, rec.truck_id, rec.doc_type)
            if latest is not None and latest.id == rec.id and rec.doc_type in DOCS:   # the current file is on the truck
                t = db.get(models.Truck, rec.truck_id)
                spec = DOCS[rec.doc_type]
                data, name = getattr(t, spec["blob"]), getattr(t, spec["file"])
            else:
                data, name = rec.file_blob, rec.file_name
            if data:
                return "truck_doc_old", data, _name(name, f"{rec.doc_type}.pdf")
    elif kind == "tp" and field in TRUCK_PHOTOS:
        t = db.get(models.Truck, rid)
        blob_col, name_col, _ = TRUCK_PHOTOS[field]
        data = getattr(t, blob_col) if t else None
        if data:
            return "truck_photo", data, _name(getattr(t, name_col), f"{field}.jpg")
    elif kind in ("dr", "st"):
        model, docs, cat = (models.Driver, DRIVER_DOCS, "driver_id") if kind == "dr" else (models.Staff, STAFF_DOCS, "staff_id")
        if field in docs:
            person = db.get(model, rid)
            blob_col, name_col, _ = docs[field]
            data = getattr(person, blob_col) if person and person.deleted_at is None else None
            if data:
                return cat, data, _name(getattr(person, name_col), f"{field}.pdf")
    raise HTTPException(404, "Document not found")


@router.get("/file/{key}")
def download_document(key: str, request: Request, db: Session = Depends(get_db),
                      current_user: TokenUser = Depends(get_current_user)):
    """One document's file — checked against THIS page's rules (e.g. personal
    ID documents are Admin only, whatever the source page allows)."""
    from routers.maintenance import _tyre_proof_mime
    allowed = _require_page(current_user)
    category, data, name = _file_for(db, key)
    if category not in allowed:
        raise HTTPException(403, "You don't have access to this document.")
    if category in ("driver_id", "staff_id", "truck_doc", "truck_doc_old"):
        record_audit("file.download", request=request, actor_id=current_user.id, actor_name=current_user.name,
                     actor_role=current_user.role, resource=f"documents/{key}")
    mime = _tyre_proof_mime(data) or "application/octet-stream"
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": f'inline; filename="{(name or key).replace(chr(34), "")}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.get("/export")
def export_documents(
    missing: bool = Query(False, description="The Missing proof list instead"),
    category: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    cats = _require_page(current_user)
    if category:
        cats = cats & {category}
    rows = missing_proofs(db, cats) if missing else collect(db, cats)
    rows = [r for r in rows if (not from_date or (r["date"] or "")[:10] >= from_date)
            and (not to_date or (r["date"] or "9999")[:10] <= to_date)]
    headers = ["Date", "Type", "Document", "Truck ID", "Registration", "Vendor / Person", "Invoice / Doc No.",
               "Invoice Date", "Amount", "File", "Size (KB)", "Uploaded By", "Status", "Belongs To"]
    data = [[(r["date"] or "")[:10], r["category_label"], r["title"], r["truck_id"] or "", r["registration_number"] or "",
             r["party"] or "", r["invoice_number"] or "", r["invoice_date"] or "", r["amount"],
             r["file_name"] or ("— missing —" if missing else ""), round(r["size_bytes"] / 1024, 1) if r["size_bytes"] else "",
             r["uploaded_by"] or "", r["status"] or "", r["ref"] or ""] for r in rows]
    name = "missing_proofs" if missing else "proof_and_documents"
    return build_excel_response([("Missing Proofs" if missing else "Proof and Documents", headers, data)], f"{name}.xlsx")
