"""Truck Maintenance → Edit: only Admins edit records directly; everyone else
raises an Edit Request, which is applied the moment an Admin approves it."""
import pytest

import models


def _request(client, headers, record_id, changes):
    res = client.post("/edit-approvals", headers=headers, json={
        "resource_type": "MaintenanceRecord", "resource_id": record_id, "resource_name": "pytest record",
        "action": "Edit", "reason": "pytest", "proposed_changes": changes,
    })
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _status(db, request_id):
    db.rollback()  # end the session's snapshot so the app's commits are visible
    return db.get(models.EditApprovalRequest, request_id).status


@pytest.mark.parametrize("role", ["Maintenance", "Commercial Manager", "Accounts"])
def test_non_admin_cannot_edit_directly(client, auth, maintenance_record, role):
    res = client.put(f"/maintenance/records/{maintenance_record.id}", headers=auth(role), json={"odometer": 39_000})
    assert res.status_code == 403


def test_admin_edits_directly(client, auth, builtin_admin_headers, maintenance_record):
    url = f"/maintenance/records/{maintenance_record.id}"
    assert client.put(url, headers=auth("Admin"), json={"odometer": 39_000}).json()["odometer"] == 39_000
    assert client.put(url, headers=builtin_admin_headers, json={"odometer": 39_500}).status_code == 200


@pytest.mark.parametrize("field", ["date", "odometer", "maintenance_type"])
def test_required_fields_cannot_be_blanked(client, auth, maintenance_record, field):
    res = client.put(f"/maintenance/records/{maintenance_record.id}", headers=auth("Admin"), json={field: None})
    assert res.status_code == 400


def test_odometer_cannot_exceed_the_trucks(client, auth, maintenance_record, truck):
    res = client.put(f"/maintenance/records/{maintenance_record.id}", headers=auth("Admin"),
                     json={"odometer": int(truck.odometer) + 1})
    assert res.status_code == 400


def test_approving_a_request_applies_it(client, auth, db, staff, maintenance_record):
    rid = _request(client, auth("Maintenance"), maintenance_record.id, {"odometer": 38_000})
    res = client.patch(f"/edit-approvals/{rid}/approve", headers=auth("Admin"))
    assert res.status_code == 200 and res.json()["status"] == "Approved"
    db.rollback()  # end the session's snapshot so the app's commits are visible
    record = db.get(models.MaintenanceRecord, maintenance_record.id)
    assert record.odometer == 38_000
    assert record.entered_by_name == staff["Maintenance"].name
    assert client.patch(f"/edit-approvals/{rid}/approve", headers=auth("Admin")).status_code == 409


def test_invalid_change_leaves_request_pending(client, auth, db, maintenance_record, truck):
    rid = _request(client, auth("Maintenance"), maintenance_record.id, {"odometer": int(truck.odometer) + 100_000})
    assert client.patch(f"/edit-approvals/{rid}/approve", headers=auth("Admin")).status_code == 400
    assert _status(db, rid) == "Pending"


def test_garbage_changes_are_refused(client, auth, db, maintenance_record):
    rid = _request(client, auth("Maintenance"), maintenance_record.id, {"odometer": "abc"})
    assert client.patch(f"/edit-approvals/{rid}/approve", headers=auth("Admin")).status_code == 400
    assert _status(db, rid) == "Pending"


def test_deleted_record_cannot_be_approved(client, auth, db):
    rid = _request(client, auth("Maintenance"), 99_999_999, {"odometer": 1})
    assert client.patch(f"/edit-approvals/{rid}/approve", headers=auth("Admin")).status_code == 409
    assert _status(db, rid) == "Pending"
