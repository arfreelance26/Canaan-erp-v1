"""Trips: booking → status → close → trip sheet → LR → verification → invoice,
plus the sheet hand-over (Yard Supervisor → Trip Sheet Register), the
Auditor's recheck flow, deletion/restore and the bulk/insight reads."""
from datetime import date

import pytest

from world import add_sheet, complete_and_close, fresh_trip

TODAY = date.today().isoformat()


@pytest.fixture()
def closed_trip(api, world):
    trip = fresh_trip(api, world)
    complete_and_close(api, trip)
    return trip


@pytest.fixture()
def sheeted_trip(api, closed_trip):
    add_sheet(api, closed_trip)
    return closed_trip


def test_edit_and_status(api, world, spec):
    trip = fresh_trip(api, world)
    fields = spec["components"]["schemas"]["TripBase"]["properties"]
    body = {k: v for k, v in trip.items() if k in fields and k != "edit_context"}
    edited = api.put(f"/trips/{trip['id']}", json={**body, "cha_name": "Pytest CHA"})
    assert edited["cha_name"] == "Pytest CHA"
    assert api.patch(f"/trips/{trip['id']}/status", json={"status": "Started"})["status"] == "Started"


def test_only_admin_can_cancel(api_as, world, api):
    trip = fresh_trip(api, world)
    api_as("Commercial Manager").patch(f"/trips/{trip['id']}/status", json={"status": "Cancelled"}, expect=403)
    assert api.patch(f"/trips/{trip['id']}/status", json={"status": "Cancelled"})["status"] == "Cancelled"


def test_close_needs_a_completed_trip(api, world):
    trip = fresh_trip(api, world)
    api.post(f"/trips/{trip['id']}/close", json={"payment_type": "Credit"}, expect=400)
    closure = complete_and_close(api, trip)
    assert api.get(f"/trips/{trip['id']}/closure")["id"] == closure["id"]


def test_sheet_lr_verification_and_invoice(api, closed_trip):
    tid = closed_trip["id"]
    sheet = add_sheet(api, closed_trip)
    assert api.get(f"/trips/{tid}/sheet")["id"] == sheet["id"]
    api.patch(f"/trips/{tid}/lr", json={"lr_consignor": "Pytest Consignor", "lr_weight": "20 T"})
    api.post(f"/trips/{tid}/verify-advance", json={"verified": True})
    assert api.post(f"/trips/{tid}/verify", json={})["verification_status"] == "verified"
    invoiced = api.post(f"/trips/{tid}/invoice", json={"invoice_type": "Tax Invoice", "invoice_date": TODAY})
    invoice = api.get(f"/trips/{tid}/invoice")
    assert invoice["invoice_no"]
    api.get("/trips/invoice-group", params={"invoice_no": invoice["invoice_no"]})
    api.get("/trips/invoices/next-seq", params={"invoice_type": "Tax Invoice"})
    assert invoiced["id"] == tid


def test_waive_invoice_after_verification(api, sheeted_trip):
    tid = sheeted_trip["id"]
    api.post(f"/trips/{tid}/waive-invoice", expect=400)  # not verified yet
    api.post(f"/trips/{tid}/verify", json={})
    assert api.post(f"/trips/{tid}/waive-invoice")["invoice_waived"] is True


def test_reject_and_resubmit_verification(api, sheeted_trip):
    tid = sheeted_trip["id"]
    api.post(f"/trips/{tid}/resubmit-verification", expect=400)  # only rejected trips
    assert api.post(f"/trips/{tid}/reject-verification", json={"reason": "Wrong km"})["verification_status"] == "rejected"
    assert api.post(f"/trips/{tid}/resubmit-verification")["verification_status"] == "pending"


def test_flag(api, sheeted_trip):
    assert api.post(f"/trips/{sheeted_trip['id']}/flag")["verification_status"] == "flagged"


def test_auditor_recheck_flow(api, world):
    trip = fresh_trip(api, world)
    tid = trip["id"]
    api.post(f"/trips/{tid}/recheck-flag", json={"remark": "  "}, expect=400)
    flagged = api.post(f"/trips/{tid}/recheck-flag", json={"remark": "Check the toll"})
    assert flagged["flagged_for_recheck"] is True
    api.post(f"/trips/{tid}/recheck-verify", json={}, expect=409)  # must be returned first
    assert api.post(f"/trips/{tid}/recheck-return", json={"remark": "Fixed"})["recheck_returned"] is True
    verified = api.post(f"/trips/{tid}/recheck-verify", json={"remark": "OK"})
    assert verified["audit_verified"] is True and verified["flagged_for_recheck"] is False
    events = [e["event"] for e in api.get(f"/trips/{tid}/recheck-history")]
    assert events == ["Flagged", "Returned for Review", "Verified"]


def test_sheet_handover(api, api_as, closed_trip):
    tid = closed_trip["id"]
    yard, register = api_as("Yard Supervisor"), api_as("Trip Sheet Register")
    register.post(f"/trips/{tid}/receive-sheet", expect=400)  # not delivered yet
    assert yard.post(f"/trips/{tid}/collect-sheet", json={"collected": True})["trip_sheet_collected"] is True
    assert register.post(f"/trips/{tid}/receive-sheet")["trip_sheet_received"] is True


def test_unmark_delivered_sheet(api, api_as, closed_trip):
    tid = closed_trip["id"]
    api_as("Yard Supervisor").post(f"/trips/{tid}/collect-sheet", json={"collected": True})
    assert api.post(f"/trips/{tid}/unmark-sheet", json={"reason": "Marked by mistake"})["trip_sheet_collected"] is False


def test_flag_sheet_missing(api_as, closed_trip):
    api_as("Yard Supervisor").post(f"/trips/{closed_trip['id']}/flag-sheet-missing", json={"remark": "Driver lost it"})


def test_delete_restore_and_permanent_delete(api, world):
    trip = fresh_trip(api, world)
    tid = trip["id"]
    api.delete(f"/trips/{tid}", json={"reason": "  "}, expect=400)
    api.delete(f"/trips/{tid}", json={"reason": "Duplicate booking"})
    assert api.post(f"/trips/{tid}/restore")["id"] == tid
    api.delete(f"/trips/{tid}", json={"reason": "Duplicate booking"})
    api.delete(f"/trips/{tid}/permanent")
    api.get(f"/trips/{tid}", expect=404)


def test_combined_invoice(api, world):
    trips = []
    for _ in range(2):
        trip = fresh_trip(api, world)
        complete_and_close(api, trip)
        add_sheet(api, trip)
        api.post(f"/trips/{trip['id']}/verify", json={})
        trips.append(trip)
    api.post("/trips/invoice-combined", json={"trips": [{"trip_id": trips[0]["id"]}]}, expect=400)
    result = api.post("/trips/invoice-combined", json={
        "invoice_type": "Tax Invoice", "invoice_date": TODAY,
        "trips": [{"trip_id": t["id"]} for t in trips],
    })
    assert {t["id"] for t in result} == {t["id"] for t in trips}


def test_bulk_and_insight_reads(api, world, sheeted_trip):
    ids = ",".join(str(i) for i in (world.trip["id"], sheeted_trip["id"]))
    for kind in ("sheets", "closures", "invoices"):
        api.get(f"/trips/bulk/{kind}", params={"ids": ids})
    api.get("/trips/customer-profitability/top-trips", params={"customer_id": world.customer["id"]})
    api.get("/trips/route-insights", params={"customer_id": world.customer["id"], "route_id": world.destination["id"]})
