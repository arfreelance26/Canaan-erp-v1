"""Proof Pack — Proof and Documents as one PDF (proof_pack.py,
GET /documents/pack and /documents/pack/summary)."""
from datetime import date
from io import BytesIO

import pymupdf
from PIL import Image

import proof_pack
from world import create_truck

DAY = date(2031, 5, 10)                     # far from other tests' records
RANGE = {"from_date": "2031-05-01", "to_date": "2031-05-31"}


def _pdf(pages: int) -> bytes:
    d = pymupdf.open()
    for i in range(pages):
        d.new_page().insert_text((72, 72), f"Bill page {i + 1}")
    return d.tobytes()


def _jpg() -> bytes:
    b = BytesIO()
    Image.new("RGB", (300, 200), (200, 40, 40)).save(b, "JPEG")
    return b.getvalue()


def _seed(api, db):
    """A truck with one job holding three proofs (2-page PDF, photo, junk),
    and a second job with a cost and no proof."""
    import models
    t = create_truck(api)
    truck = db.query(models.Truck).filter_by(truck_id=t["truck_id"]).one()
    rec = models.MaintenanceRecord(truck_id=truck.id, date=DAY, odometer=1, maintenance_type="Pack service",
                                   cost=12_500, maintenance_by="Pack Garage", invoice_number="INV-PK1")
    bare = models.MaintenanceRecord(truck_id=truck.id, date=DAY, odometer=2, maintenance_type="Pack unpaid", cost=800)
    db.add_all([rec, bare])
    db.flush()
    for kind, name, data in (("pdf", "bill.pdf", _pdf(2)), ("image", "receipt.jpg", _jpg()), ("image", "broken.jpg", b"not an image")):
        db.add(models.MaintenanceProof(record_id=rec.id, kind=kind, file_name=name, size_bytes=len(data), data=data))
    db.commit()
    return t


def test_inr_groups_the_indian_way():
    assert proof_pack.inr(1234567.5) == "₹12,34,567.50"
    assert proof_pack.inr(999) == "₹999.00"
    assert proof_pack.inr(None) == "—"


def test_pack_holds_every_file_with_an_index(api, db):
    t = _seed(api, db)
    q = {**RANGE, "truck": t["truck_id"], "include_missing": "true"}

    s = api.get("/documents/pack/summary", params=q)
    assert s["documents"] == 3 and s["missing"] == 1 and not s["too_big"]
    assert s["amount"] == 3 * 12_500                     # each proof carries its job's amount

    res = api.get("/documents/pack", params=q)
    assert res.headers["content-type"] == "application/pdf"
    pdf = pymupdf.open(stream=res.content, filetype="pdf")
    # cover + index + bill (2 pages) + photo + the unreadable one + missing list
    assert pdf.page_count == 1 + 1 + 2 + 1 + 1 + 1
    text = [p.get_text() for p in pdf]
    assert "Proof Pack" in text[0] and "3 documents" in text[0]
    assert "INV-PK1" in text[1] and "Pack Garage" in text[1]
    assert "Bill page 2" in text[3] and "page 2 of 2" in text[3]   # the PDF's own pages, kept as text
    assert pdf[4].get_images()                                       # the photo
    assert "couldn't be added" in text[5]
    assert "Missing proof" in text[6] and "Pack unpaid" in text[6]
    assert f"Page 7 of 7" in text[6]
    toc = pdf.get_toc()
    assert toc[0][1] == "Cover" and any(e[1] == "Maintenance bill" for e in toc)


def test_pack_rules(api, api_as, db, monkeypatch):
    t = _seed(api, db)
    q = {**RANGE, "truck": t["truck_id"]}
    api_as("Maintenance").get("/documents/pack/summary", params=q, expect=403)
    api_as("Maintenance").get("/documents/pack", params=q, expect=403)
    # Accounts may build one; ID documents never join it, whatever is asked.
    s = api_as("Accounts").get("/documents/pack/summary", params={**q, "include_ids": "true"})
    assert s["documents"] == 3
    # Over the cap → refused before anything is built.
    from routers import documents
    monkeypatch.setattr(documents, "PACK_MAX_FILES", 2)
    assert api.get("/documents/pack/summary", params=q)["too_big"]
    api.get("/documents/pack", params=q, expect=413)
