"""Maintenance Requests → Submit for Re-Verification: the person who submitted
a rejected maintenance request fixes it and sends the same request back to
Maintenance Approvals (routers/maintenance_requests.resubmit_request)."""
from datetime import date

import pytest

from world import build_world, create_truck

TODAY = date.today().isoformat()
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200


@pytest.fixture()
def truck(api):
    t = create_truck(api)
    api.post(f"/trucks/{t['id']}/odometer-correction", json={"odometer": 50_000, "reason": "pytest start"})
    return t


def _body(truck, **extra):
    return {"truck_id": truck["id"], "date": TODAY, "odometer": 49_500,
            "maintenance_type": "Brake job", "cost": 4000, **extra}


def _rejected(api, mech, truck, reason="Cost doesn't match the invoice"):
    req = mech.post("/maintenance-requests", json=_body(truck))
    mech.post(f"/maintenance-requests/{req['id']}/proofs", files={"file": ("bill.jpg", JPEG, "image/jpeg")})
    api.put(f"/maintenance-requests/{req['id']}/reject", json={"reason": reason})
    return req


def test_resubmit_goes_back_to_pending_with_history(api, api_as, truck):
    mech = api_as("Maintenance")
    req = _rejected(api, mech, truck)
    # Rejection removed the proof files.
    assert api.get(f"/maintenance-requests/{req['id']}/proofs") == []

    out = mech.put(f"/maintenance-requests/{req['id']}/resubmit", json=_body(truck, cost=4200))
    assert out["id"] == req["id"]
    assert out["status"] == "Pending"
    assert out["payload"]["cost"] in (4200, "4200", "4200.00", 4200.0)
    assert out["previous_reject_reason"] == "Cost doesn't match the invoice"
    assert out["reject_reason"] is None and out["decided_by_name"] is None and out["decided_at"] is None
    assert out["resubmit_count"] == 1 and out["resubmitted_at"]

    # New proof files can be attached again while it's pending.
    mech.post(f"/maintenance-requests/{req['id']}/proofs", files={"file": ("bill2.jpg", JPEG, "image/jpeg")})
    pending = [r for r in api.get("/maintenance-requests", params={"status": "Pending"}) if r["id"] == req["id"]]
    assert pending and pending[0]["proof_count"] == 1

    # Approving it now creates the real record with the corrected cost.
    approved = api.put(f"/maintenance-requests/{req['id']}/approve", json={})
    assert approved["status"] == "Approved" and approved["record_id"]
    assert approved["previous_reject_reason"] == "Cost doesn't match the invoice"


def test_rejected_twice_counts_and_keeps_latest_reason(api, api_as, truck):
    mech = api_as("Maintenance")
    req = _rejected(api, mech, truck, reason="First reason")
    mech.put(f"/maintenance-requests/{req['id']}/resubmit", json=_body(truck))
    api.put(f"/maintenance-requests/{req['id']}/reject", json={"reason": "Second reason"})
    out = mech.put(f"/maintenance-requests/{req['id']}/resubmit", json=_body(truck))
    assert out["resubmit_count"] == 2
    assert out["previous_reject_reason"] == "Second reason"


def test_only_rejected_requests_can_be_resubmitted(api, api_as, truck):
    mech = api_as("Maintenance")
    pending = mech.post("/maintenance-requests", json=_body(truck))
    mech.put(f"/maintenance-requests/{pending['id']}/resubmit", json=_body(truck), expect=409)
    api.put(f"/maintenance-requests/{pending['id']}/approve", json={})
    mech.put(f"/maintenance-requests/{pending['id']}/resubmit", json=_body(truck), expect=409)


def test_only_the_submitter_can_resubmit(api, api_as, truck):
    mech = api_as("Maintenance")
    req = _rejected(api, mech, truck)
    # Not even an approver can resubmit someone else's request.
    api_as("Accounts").put(f"/maintenance-requests/{req['id']}/resubmit", json=_body(truck), expect=403)
    api_as("Trip Sheet Register").put(f"/maintenance-requests/{req['id']}/resubmit", json=_body(truck), expect=403)
    assert api.get("/maintenance-requests", params={"status": "Rejected"})  # still rejected
    mech.put(f"/maintenance-requests/{req['id']}/resubmit", json=_body(truck))


def test_resubmit_is_checked_like_a_new_record(api, api_as, truck):
    mech = api_as("Maintenance")
    req = _rejected(api, mech, truck)
    other = create_truck(api)
    mech.put(f"/maintenance-requests/{req['id']}/resubmit", json=_body(other), expect=400)
    mech.put(f"/maintenance-requests/{req['id']}/resubmit", json=_body(truck, cost=None), expect=400)
    # Still rejected after the failed attempts.
    mine = {r["id"]: r for r in mech.get("/maintenance-requests/mine", params={"limit": 500})}
    assert mine[req["id"]]["status"] == "Rejected"


def test_mine_lists_own_requests_only(api, api_as, truck):
    mech = api_as("Maintenance")
    own = mech.post("/maintenance-requests", json=_body(truck))
    theirs = api_as("Commercial Manager").post("/maintenance-requests", json=_body(truck))
    ids = {r["id"] for r in mech.get("/maintenance-requests/mine", params={"limit": 500})}
    assert own["id"] in ids and theirs["id"] not in ids


def test_trip_sheet_repair_resubmit_survives_sheet_resave(api, db):
    """A resubmitted trip-sheet repair keeps its line fingerprint: re-saving the
    sheet with the same line neither duplicates nor cancels it."""
    import models
    from routers.maintenance_requests import resubmit_request, sync_trip_repairs
    from security import TokenUser
    import schemas

    w = build_world(api)
    trip = db.get(models.Trip, w.trip["id"])
    truck = db.get(models.Truck, w.truck["id"])
    user = TokenUser(id=None, name="pytest-sheet", role="Trip Sheet Register", staff_id=None)
    line = {"maintenance_type": "Clutch plate", "date": TODAY, "odometer": 1000, "cost": 3000.0,
            "description": f"Trip Sheet — {trip.trip_id}"}
    sync_trip_repairs(db, trip, truck, [line], user)
    db.commit()
    req = db.query(models.MaintenanceRequest).filter_by(trip_id=trip.id, status="Pending").one()
    req.status, req.reject_reason = "Rejected", "Wrong cost"
    db.commit()

    out = resubmit_request(
        req.id,
        schemas.MaintenanceRecordCreate(truck_id=truck.id, date=date.fromisoformat(TODAY), odometer=1000,
                                        maintenance_type="Clutch plate", cost=3500,
                                        description=f"Trip Sheet — {trip.trip_id}"),
        db=db, current_user=user,
    )
    assert out.status == "Pending"

    sync_trip_repairs(db, trip, truck, [line], user)   # the sheet re-saved, line unchanged
    db.commit()
    rows = db.query(models.MaintenanceRequest).filter_by(trip_id=trip.id).all()
    assert [(r.id, r.status) for r in rows] == [(req.id, "Pending")]
