"""Customer Detention (party halt): billed is read from the invoice's Halt Pay
lines; Mark as Paid records who saved it and when, with an optional proof;
the outstanding total reaches the Admin morning summary."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

import pytest
from openpyxl import load_workbook

import daily_summary
import models
from routers.party_halt import party_halt_amount
from world import sheeted_trip

TODAY = date.today().isoformat()
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200


def halted(api, world, db, party_days=2, amount=600):
    trip = sheeted_trip(api, world)
    closure = db.query(models.TripClosure).filter_by(trip_id=trip["id"]).one()
    closure.party_halt_days, closure.company_halt_days = party_days, 1
    closure.driver_halt_compensation = amount + 300
    closure.party_halt_pay, closure.company_halt_pay = amount, 300
    db.commit()
    return trip


def row(api, trip):
    return next(r for r in api.get("/party-halt")["rows"] if r["trip_db_id"] == trip["id"])


def invoice(api, trip, services):
    tid = trip["id"]
    api.patch(f"/trips/{tid}/lr", json={"lr_consignor": "Pytest", "lr_weight": "20 T"})
    api.post(f"/trips/{tid}/verify-advance", json={"verified": True})
    api.post(f"/trips/{tid}/verify", json={})
    api.post(f"/trips/{tid}/invoice", json={"invoice_type": "Tax Invoice", "invoice_date": TODAY, "services": services})


TRANSPORT = {"descriptionOfService": "TRANSPORT", "sacCode": "996511", "sacId": "", "quantity": "1", "rate": "12000"}


@pytest.fixture()
def halt_sac(db):
    sac = models.SacCode(description="PYTEST HALTING CHARGES", code="996511", gst_rate=18, linked_expense="Halt Pay")
    db.add(sac)
    db.commit()
    return sac


def test_not_billed_then_billed_then_paid_with_proof(api, staff, world, db, halt_sac):
    trip = halted(api, world, db)
    assert row(api, trip)["status"] == "Not billed" and row(api, trip)["amount"] == 600

    invoice(api, trip, [TRANSPORT, {"descriptionOfService": halt_sac.description, "sacCode": "996511",
                                    "sacId": str(halt_sac.id), "quantity": "2", "rate": "300"}])
    billed = row(api, trip)
    assert billed["status"] == "Billed" and billed["billed_amount"] == 600 and billed["invoice_no"]

    before = datetime.now(timezone.utc)
    paid = api.post(f"/party-halt/{trip['id']}/paid", data={"received_on": TODAY, "note": "NEFT"},
                    files={"proof": ("receipt.jpg", JPEG, "image/jpeg")})
    assert paid["status"] == "Paid" and paid["paid_amount"] == 600 and paid["paid_note"] == "NEFT"
    assert paid["paid_by"] == staff["Admin"].name                                   # who saved it
    saved_at = datetime.fromisoformat(paid["paid_saved_at"])
    assert before - timedelta(seconds=5) <= saved_at <= datetime.now(timezone.utc) + timedelta(seconds=5)   # when
    assert paid["proof_file_name"] == "receipt.jpg" and paid["proof_size_bytes"] == len(JPEG)
    assert api.get(f"/party-halt/{trip['id']}/proof").content == JPEG
    assert api.get(f"/documents/file/ph-{trip['id']}").content == JPEG               # Proof and Documents too
    assert any(d["key"] == f"ph-{trip['id']}" for d in api.get("/documents")["items"])

    api.post(f"/party-halt/{trip['id']}/paid", data={"received_on": TODAY}, expect=409)   # only once
    assert api.delete(f"/party-halt/{trip['id']}/paid")["status"] == "Billed"        # Admin undo, proof gone
    api.get(f"/party-halt/{trip['id']}/proof", expect=404)


def test_proof_is_optional_and_part_payments_count(api, api_as, staff, world, db):
    trip = halted(api, world, db)
    tid = trip["id"]
    accounts = api_as("Accounts")
    paid = accounts.post(f"/party-halt/{tid}/paid", data={"received_on": TODAY, "amount": "250"})
    assert paid["paid_amount"] == 250 and paid["proof_file_name"] is None and paid["paid_by"] == staff["Accounts"].name
    api.get(f"/party-halt/{tid}/proof", expect=404)
    accounts.delete(f"/party-halt/{tid}/paid", expect=403)                            # undo is Admin only
    api.delete(f"/party-halt/{tid}/paid")


def test_mark_paid_rules(api, api_as, world, db):
    trip = halted(api, world, db)
    tid = trip["id"]
    future = (date.today() + timedelta(days=2)).isoformat()
    api.post(f"/party-halt/{tid}/paid", data={"received_on": future}, expect=400)
    api.post(f"/party-halt/{tid}/paid", data={"received_on": TODAY, "amount": "0"}, expect=400)
    api.post(f"/party-halt/{tid}/paid", data={"received_on": TODAY, "amount": "abc"}, expect=422)
    api.post(f"/party-halt/{tid}/paid", data={"received_on": TODAY},
             files={"proof": ("notes.txt", b"plain text", "text/plain")}, expect=415)
    for role in ("Commercial Manager", "Maintenance", "Auditor", "Trip Sheet Register"):
        api_as(role).get("/party-halt", expect=403)
        api_as(role).post(f"/party-halt/{tid}/paid", data={"received_on": TODAY}, expect=403)
    api.delete(f"/party-halt/{tid}/paid", expect=404)

    plain = sheeted_trip(api, world)  # no party halt
    api.post(f"/party-halt/{plain['id']}/paid", data={"received_on": TODAY}, expect=400)
    api.post("/party-halt/999999/paid", data={"received_on": TODAY}, expect=404)


def test_missed_on_invoice_export_and_the_morning_summary(api, world, db, halt_sac):
    trip = halted(api, world, db)
    invoice(api, trip, [TRANSPORT])
    assert row(api, trip)["status"] == "Missed on invoice"

    wb = load_workbook(BytesIO(api.get("/party-halt/export", params={"status": "Missed on invoice", "search": trip["trip_id"]}).content))
    rows = list(wb.active.values)
    assert rows[0][0] == "Trip ID" and [r[0] for r in rows[1:]] == [trip["trip_id"]]

    db.commit()
    summary = daily_summary.build(db, daily_summary.now_ist().date() - timedelta(days=1))
    assert summary["metrics"]["Party halt to recover"] == round(api.get("/party-halt")["totals"]["outstanding_amount"])
    assert any("left out party halt" in a["text"] and a["href"] == "/finance/customer-detention" for a in summary["attention"])


def test_older_trips_split_the_total_by_day():
    old = models.TripClosure(party_halt_days=2, company_halt_days=1, driver_halt_compensation=900,
                             party_halt_pay=None, company_halt_pay=None)
    assert party_halt_amount(old) == 600
    assert party_halt_amount(models.TripClosure(party_halt_days=0, driver_halt_compensation=900)) == 0
