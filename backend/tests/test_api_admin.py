"""Everything else: login/logout/lockouts, file uploads, settings, running
cost, CFS/yard list, tyre configs, approval queues, default batta, trip
expense rates, notifications, events, notes, celebrations, usage and
activity tracking, and the three backups."""
import secrets
from datetime import date, datetime, timedelta

import pytest

from world import create_driver, create_staff, create_truck, tag

TODAY = date.today()
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200


# ---------------------------------------------------------------- auth

def test_login_logout_and_lockout_reset(api, client):
    password = "Pytest#" + secrets.token_hex(6)
    person = create_staff(api, password=password)
    res = client.post("/auth/login", json={"username": person["username"], "password": password})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/trucks", headers=headers).status_code == 200
    assert client.post("/auth/logout", headers=headers).status_code == 204
    assert client.get("/trucks", headers=headers).status_code == 401  # the token is revoked

    assert client.post("/auth/login", json={"username": person["username"], "password": "wrong"}).status_code == 401
    api.post("/auth/lockouts/reset", json={"ip_address": "testclient", "username": person["username"]})


# ---------------------------------------------------------------- files

def test_file_upload_download_delete(api, client, auth):
    truck = create_truck(api)
    url = f"/files/trucks/{truck['id']}/photo"
    client.post(url, files={"file": ("t.jpg", JPEG, "image/jpeg")}, headers=auth("Admin"))
    assert client.post(url, files={"file": ("t.jpg", JPEG, "image/jpeg")}, headers=auth("Admin")).status_code == 204
    token = auth("Admin")["Authorization"].split()[1]
    got = client.get(url, params={"token": token})
    assert got.status_code == 200 and got.content == JPEG
    assert client.get(url).status_code == 401
    api.delete(url)
    assert client.get(url, params={"token": token}).status_code == 404


# ---------------------------------------------------------------- settings (each put back as it was)

@pytest.mark.parametrize("path,key", [
    ("/settings/device-lock", None), ("/settings/max-shift-hours", "hours"),
    ("/settings/auto-close-enabled", "enabled"), ("/settings/attendance-mandatory", "mandatory"),
    ("/settings/driver-advance-max", "amount"),
])
def test_settings_round_trip(api, api_as, path, key):
    current = api.get(path)
    api_as("Accounts").put(path, json=current, expect=403)
    assert api.put(path, json=current) == current


def test_driver_advance_max(api, api_as):
    path = "/settings/driver-advance-max"
    assert api.get(path) == {"amount": 500}
    assert api_as("Commercial Manager").get(path) == {"amount": 500}
    api_as("Commercial Manager").put(path, json={"amount": 750}, expect=403)
    api.put(path, json={"amount": 0}, expect=400)
    api.put(path, json={"amount": -1}, expect=400)
    assert api.put(path, json={"amount": 750.5}) == {"amount": 750.5}
    assert api_as("Commercial Manager").get(path) == {"amount": 750.5}
    api.put(path, json={"amount": 500})


def test_device_lock_reset_all(api):
    assert api.post("/settings/device-lock/reset-all")


# ---------------------------------------------------------------- running cost & tyre configs

def test_running_cost_state_and_cost_per_km(api, world):
    state = api.get("/running-cost/state")
    api.put("/running-cost/state", json={"Manual": state["Manual"]} if isinstance(state.get("Manual"), dict) else {})
    api.put("/running-cost/cost-per-km", json={"mode": "Manual", "values": {world.truck["truck_id"]: 42.5}})
    api.put("/running-cost/cost-per-km", json={"mode": "Wrong", "values": {}}, expect=400)


def test_tyre_range_and_layout_configs(api):
    tyre_type = f"PT-{tag()}"
    api.put("/tyre-range-config", json={"configs": [{"tyre_type": tyre_type, "range_km": 80000, "base_tyre_cost": 24000}]})
    assert any(c["tyre_type"] == tyre_type for c in api.get("/tyre-range-config"))
    api.put("/tyre-layout-type-config", json={"configs": [{"tyre_layout": "10+1", "tyre_type": tyre_type, "quantity": 11}]})
    api.delete(f"/tyre-range-config/{tyre_type}")


# ---------------------------------------------------------------- CFS / yard list

def test_cfs_yard_lifecycle(api):
    entry = api.post("/cfs-yard", json={"kind": "CFS", "name": f"Pytest CFS {tag()}"})
    renamed = entry["name"] + " 2"
    assert api.put(f"/cfs-yard/{entry['id']}", json={"name": renamed})["name"] == renamed
    api.delete(f"/cfs-yard/{entry['id']}")
    api.post(f"/cfs-yard/{entry['id']}/restore")
    api.delete(f"/cfs-yard/{entry['id']}")
    api.delete(f"/cfs-yard/{entry['id']}/permanent")


# ---------------------------------------------------------------- approval queues

def test_deletion_approval_requests(api, api_as):
    cm = api_as("Commercial Manager")
    api.post("/deletion-approvals", json={"resource_type": "Driver", "resource_id": 1, "resource_name": "x", "reason": "x"}, expect=400)
    d1, d2 = create_driver(api), create_driver(api)
    body = lambda d: {"resource_type": "Driver", "resource_id": d["id"], "resource_name": d["name"], "reason": "Left the company"}
    req = cm.post("/deletion-approvals", json=body(d1))
    cm.post("/deletion-approvals", json=body(d1), expect=409)  # already pending
    assert api.put(f"/deletion-approvals/{req['id']}/approve", json={"admin_note": "OK"})["status"] == "Approved"
    assert d1["id"] in api.get("/drivers/deleted-ids")
    other = cm.post("/deletion-approvals", json=body(d2))
    assert api.put(f"/deletion-approvals/{other['id']}/reject", json={"admin_note": "Still active"})["status"] == "Rejected"
    cm.post("/deletion-approvals/mine/mark-seen")


def test_edit_approval_reject_delete_and_seen(api, api_as, world):
    cm = api_as("Commercial Manager")
    body = {"resource_type": "Trip", "resource_id": world.trip["id"], "resource_name": world.trip["trip_id"],
            "action": "Edit", "reason": "Fix container number"}
    req = cm.post("/edit-approvals", json=body)
    assert api.patch(f"/edit-approvals/{req['id']}/reject", json={"admin_note": "Not needed"})["status"] == "Rejected"
    cm.post("/edit-approvals/mine/mark-seen")
    api.delete(f"/edit-approvals/{req['id']}")


# ---------------------------------------------------------------- rates & batta

def test_default_batta_and_trip_expense_rates(api, api_as, world):
    body = {"branch_id": world.branch["id"], "trip_type": "LOCAL", "cargo_type": "40FT CONTAINER", "amount": 800}
    assert float(api.put("/default-batta-rates", json=body)["amount"]) == 800
    api.put("/default-batta-rates", json={**body, "trip_type": "MOON"}, expect=400)
    api_as("Accounts").put("/default-batta-rates", json=body, expect=403)
    current = api.get("/trip-expense-rates")
    api.put("/trip-expense-rates", json={"port_pass_expense": current.get("port_pass_expense") or 0})


# ---------------------------------------------------------------- notifications, events, notes, celebrations

def test_notifications_read(api, world):
    items = api.get("/notifications")
    items = items.get("items", items) if isinstance(items, dict) else items
    assert items, "creating the world's trip should have raised a notification"
    api.post(f"/notifications/{items[0]['id']}/read")
    api.post("/notifications/read-all")


def test_events(api, api_as, staff):
    starts = (datetime.now() + timedelta(days=1)).replace(microsecond=0).isoformat()
    api.post("/events", json={"title": "Nobody", "starts_at": starts, "targets": []}, expect=422)
    ev = api.post("/events", json={"title": "Pytest review", "starts_at": starts,
                                   "targets": [{"target_type": "user", "target_id": staff["Accounts"].id}]})
    api_as("Auditor").post(f"/events/{ev['id']}/complete", expect=404)  # not invited
    assert api_as("Accounts").post(f"/events/{ev['id']}/complete")["completed_at"]
    api.delete(f"/events/{ev['id']}")


def test_notes(api_as):
    me = api_as("Yard Supervisor")
    note = me.post("/notes", json={"title": "Pytest", "body": "Gate 4 closed", "pinned": False})
    assert me.get(f"/notes/{note['id']}")["body"] == "Gate 4 closed"
    me.patch(f"/notes/{note['id']}", json={"body": "Gate 4 open again"})
    api_as("Admin").get(f"/notes/{note['id']}", expect=404)  # private, even from Admin
    me.delete(f"/notes/{note['id']}")


def test_celebrations(api):
    api.get("/celebrations")
    api.put("/celebrations/switch", json={"key": "nonsense", "enabled": True}, expect=400)
    api.put("/celebrations/switch", json={"key": "birthdays", "enabled": True})
    api.put("/celebrations/messages", json={})


# ---------------------------------------------------------------- usage & activity

def test_usage_heartbeat_and_reports(api, api_as, staff):
    api_as("Accounts").post("/usage/heartbeat", json={"module": "trips", "active_seconds": 30, "idle_seconds": 5})
    sid = staff["Accounts"].id
    api.get(f"/usage/daily-active/{sid}", params={"date_from": (TODAY - timedelta(days=7)).isoformat(), "date_to": TODAY.isoformat()})
    api.get(f"/usage/detail/{sid}")


def test_usage_detail_survives_tables_with_mixed_collations(api, staff, db):
    """The detail page merges every *_edit_events table with UNION ALL. A
    database whose tables don't all share one collation (old tables from a
    dump, newer ones from create_all) made MySQL refuse that UNION -> 503."""
    from sqlalchemy import text
    import usage_actions
    table = usage_actions.ACTION_TABLES[0].__tablename__
    col = db.execute(text(
        "SELECT COLUMN_TYPE, IS_NULLABLE, COLLATION_NAME FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = 'actor_name'"), {"t": table}).one()
    nullable = "NULL" if col.IS_NULLABLE == "YES" else "NOT NULL"
    # Not a _bin collation: MySQL lets a _bin side win a mix, which would hide the bug.
    other = "utf8mb4_general_ci" if col.COLLATION_NAME != "utf8mb4_general_ci" else "utf8mb4_unicode_ci"
    db.execute(text(f"ALTER TABLE `{table}` MODIFY actor_name {col.COLUMN_TYPE} COLLATE {other} {nullable}"))
    db.commit()
    try:
        res = api.get(f"/usage/detail/{staff['Accounts'].id}")
        assert res["staff_id"] == staff["Accounts"].id
    finally:
        db.execute(text(f"ALTER TABLE `{table}` MODIFY actor_name {col.COLUMN_TYPE} COLLATE {col.COLLATION_NAME} {nullable}"))
        db.commit()


def test_activity_batch_and_timeline(api, api_as, staff):
    api_as("Accounts").post("/activity/batch", json={"events": [{"kind": "view", "route": "/trips/history"}]})
    api_as("Accounts").post("/activity/batch", json={"events": [{"kind": "hack", "route": "/x"}]}, expect=422)
    api.get("/activity/timeline", params={"user_name": staff["Accounts"].name})


# ---------------------------------------------------------------- backups

@pytest.mark.parametrize("path", ["/backup/excel", "/backup/sql", "/backup/files"])
def test_backups(api, api_as, path):
    res = api.get(path)
    assert res.content
    api_as("Accounts").get(path, expect=403)


def test_freeze_and_unfreeze_staff(api, api_as, client, db):
    import settings_store
    settings_store.set_chat_owner_view_password(db, "pytest-freeze-pass")
    password = "Pytest#" + secrets.token_hex(6)
    person = create_staff(api, password=password)
    sid = person["id"]
    login = {"username": person["username"], "password": password}
    token = client.post("/auth/login", json=login).json()["access_token"]
    body = {"reason": "Left the company", "owner_password": "pytest-freeze-pass"}

    api_as("Accounts").post(f"/staff/{sid}/freeze", json=body, expect=403)
    api.post(f"/staff/{sid}/freeze", json={**body, "reason": "  "}, expect=400)
    api.post(f"/staff/{sid}/freeze", json={**body, "owner_password": "wrong"}, expect=403)
    api.post(f"/staff/{sid}/unfreeze", json=body, expect=409)  # not frozen yet
    api.post("/staff/999999/freeze", json=body, expect=404)

    frozen = api.post(f"/staff/{sid}/freeze", json=body)
    assert frozen["frozen_at"] and frozen["frozen_reason"] == "Left the company"
    api.post(f"/staff/{sid}/freeze", json=body, expect=409)  # only once
    assert client.post("/auth/login", json=login).status_code == 403
    assert client.get("/trucks", headers={"Authorization": f"Bearer {token}"}).status_code == 401  # session ended

    api_as("Accounts").post(f"/staff/{sid}/unfreeze", json=body, expect=403)
    api.post(f"/staff/{sid}/unfreeze", json={**body, "owner_password": "wrong"}, expect=403)
    unfrozen = api.post(f"/staff/{sid}/unfreeze", json={**body, "reason": "Rejoined"})
    assert unfrozen["frozen_at"] is None and unfrozen["frozen_reason"] is None
    assert client.post("/auth/login", json=login).status_code == 200
    events = api.get("/staff/freeze-events", params={"staff_id": sid})
    assert [e["event"] for e in events] == ["Unfrozen", "Frozen"]


def test_download_document(api, api_as, db):
    import models
    driver = create_driver(api)
    row = db.query(models.Driver).filter_by(driver_id=driver["driver_id"]).first()
    row.license_blob, row.license_file_name = JPEG, "licence.jpg"
    db.commit()
    key = f"dr-{row.id}-license"

    res = api.get(f"/documents/file/{key}")
    assert res.content == JPEG and res.headers["content-type"].startswith("image/")
    assert res.headers["x-content-type-options"] == "nosniff" and "licence.jpg" in res.headers["content-disposition"]
    api_as("Accounts").get(f"/documents/file/{key}", expect=403)  # personal ID documents are Admin only
    api_as("Maintenance").get(f"/documents/file/{key}", expect=403)  # no access to the page at all
    for missing in ("dr-999999-license", f"dr-{row.id}-nonsense", "dr-abc", "nope"):
        api.get(f"/documents/file/{missing}", expect=404)
