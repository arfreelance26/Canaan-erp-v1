"""A maintenance record with several repairs, each with its own cost, place,
vendor or individual, and invoice (Update Maintenance Record's repair cards).
The record's cost is their total; older records show as one line."""
from datetime import date
from io import BytesIO

import pytest
from openpyxl import load_workbook

from world import create_truck, tag

TODAY = date.today().isoformat()


@pytest.fixture()
def truck(api):
    t = create_truck(api)
    api.post(f"/trucks/{t['id']}/odometer-correction", json={"odometer": 50_000, "reason": "pytest start"})
    return t


@pytest.fixture()
def vendors(api):
    return [api.post("/vendors", json={"name": f"Pytest Garage {tag()}"}) for _ in range(2)]


def _body(truck, items, **extra):
    return {"truck_id": truck["id"], "date": TODAY, "odometer": 49_000, "maintenance_type": "Engine",
            "description": "Two repairs", "items": items, **extra}


def _lines(vendors):
    return [
        {"repair_type": "Engine overhaul", "cost": 18500, "maintenance_location": "Chennai",
         "maintenance_by_type": "Vendor", "vendor_id": vendors[0]["id"], "invoice_number": "INV-1", "invoice_date": TODAY},
        {"repair_type": "Clutch plate", "cost": 6200, "maintenance_by_type": "Individual", "maintenance_by": "Ravi",
         "invoice_number": "R-7"},
    ]


def _approved(api, api_as, body):
    req = api_as("Maintenance").post("/maintenance-requests", json=body)
    return api.put(f"/maintenance-requests/{req['id']}/approve", json={})["record_id"]


def _record(api, truck, record_id):
    return next(r for r in api.get("/maintenance/records", params={"truck_id": truck["id"]}) if r["id"] == record_id)


def test_repairs_are_saved_with_their_own_details_and_a_total(api, api_as, truck, vendors):
    rid = _approved(api, api_as, _body(truck, _lines(vendors)))
    rec = _record(api, truck, rid)
    assert float(rec["cost"]) == 24700
    assert rec["repair_type"] == "Engine overhaul, Clutch plate"
    lines = rec["repair_lines"]
    assert [line["repair_type"] for line in lines] == ["Engine overhaul", "Clutch plate"]
    assert lines[0]["maintenance_by"] == vendors[0]["name"] and lines[0]["invoice_number"] == "INV-1"
    assert lines[1]["maintenance_by_type"] == "Individual" and lines[1]["vendor_id"] is None
    # The record's own vendor/invoice fields mirror the first repair.
    assert rec["vendor_id"] == vendors[0]["id"] and rec["invoice_number"] == "INV-1"


def test_each_repair_needs_a_type_and_a_cost(api_as, truck, vendors):
    mech = api_as("Maintenance")
    mech.post("/maintenance-requests", json=_body(truck, []), expect=400)
    mech.post("/maintenance-requests", json=_body(truck, [{"repair_type": "Brakes", "cost": -1}]), expect=400)
    mech.post("/maintenance-requests", json=_body(truck, [{"repair_type": "  ", "cost": 100}]), expect=400)
    mech.post("/maintenance-requests", json=_body(truck, [{"repair_type": "Brakes"}]), expect=400)  # cost only waits when scheduling
    mech.post("/maintenance-requests", json=_body(truck, [
        {"repair_type": "Brakes", "cost": 100, "maintenance_by_type": "Vendor", "vendor_id": 999_999_999}]), expect=400)


def test_editing_replaces_the_repairs_and_the_total(api, api_as, truck, vendors):
    rid = _approved(api, api_as, _body(truck, _lines(vendors)))
    api.put(f"/maintenance/records/{rid}", json={"items": [
        {"repair_type": "Engine overhaul", "cost": 20000, "maintenance_by_type": "Vendor", "vendor_id": vendors[1]["id"]},
    ]})
    rec = _record(api, truck, rid)
    assert float(rec["cost"]) == 20000 and len(rec["repair_lines"]) == 1
    assert rec["repair_lines"][0]["maintenance_by"] == vendors[1]["name"]


def test_older_records_show_as_one_line(api, api_as, truck):
    rid = _approved(api, api_as, {"truck_id": truck["id"], "date": TODAY, "odometer": 49_000,
                                   "maintenance_type": "Service", "cost": 2500, "maintenance_location": "Yard"})
    lines = _record(api, truck, rid)["repair_lines"]
    assert len(lines) == 1 and float(lines[0]["cost"]) == 2500 and lines[0]["maintenance_location"] == "Yard"
    assert lines[0]["repair_type"] == "Service"


def test_vendor_lists_and_exports_include_any_repair_by_that_vendor(api, api_as, truck, vendors):
    lines = _lines(vendors)
    lines.append({"repair_type": "Radiator", "cost": 3000, "maintenance_by_type": "Vendor", "vendor_id": vendors[1]["id"]})
    rid = _approved(api, api_as, _body(truck, lines))

    # The second vendor only did the third repair, yet the record is theirs too.
    assert rid in [r["id"] for r in api.get(f"/vendors/{vendors[1]['id']}/maintenance-records")]
    assert rid in [r["id"] for r in api.get(f"/vendors/{vendors[0]['id']}/maintenance-records")]

    res = api.client.get("/exports/maintenance-records", params={"vendor_id": vendors[1]["id"]}, headers=api.headers)
    rows = list(load_workbook(BytesIO(res.content)).active.iter_rows(values_only=True))
    header, data = rows[0], rows[1:]
    repair = header.index("Repair Type")
    assert [r[repair] for r in data if r[1] == truck["registration_number"]] == ["Radiator"]


# ---------------------------------------------------------------- scheduled jobs (cost added later)

def test_a_job_can_be_scheduled_without_its_cost(api, api_as, db, truck, vendors):
    import models
    mech = api_as("Maintenance")
    lines = [{**line, "cost": None} for line in _lines(vendors)]
    req = mech.post("/maintenance-requests", params={"schedule": "true"}, json=_body(truck, lines, date="2026-10-02"))
    assert req["status"] == "Scheduled"

    # Not up for approval, and nothing counted: no record exists yet.
    assert req["id"] not in [r["id"] for r in api.get("/maintenance-requests")]
    assert req["id"] in [r["id"] for r in mech.get("/maintenance-requests/scheduled", params={"truck_id": truck["id"]})]
    assert not db.query(models.MaintenanceRecord).filter_by(truck_id=truck["id"]).count()

    # Costs are needed before it goes on; then it waits for approval as usual.
    mech.put(f"/maintenance-requests/{req['id']}/costs", json=_body(truck, lines, date="2026-10-02"), expect=400)
    priced = [{**line, "cost": c} for line, c in zip(lines, (18500, 6200))]
    sent = mech.put(f"/maintenance-requests/{req['id']}/costs", json=_body(truck, priced, date="2026-10-02"))
    assert sent["status"] == "Pending"
    mech.put(f"/maintenance-requests/{req['id']}/costs", json=_body(truck, priced), expect=409)

    # Approved weeks later, it lands on the date of the work.
    record_id = api.put(f"/maintenance-requests/{req['id']}/approve", json={})["record_id"]
    record = _record(api, truck, record_id)
    assert record["date"] == "2026-10-02" and float(record["cost"]) == 24700


def test_who_can_add_costs_or_remove_a_scheduled_job(api, api_as, truck):
    body = _body(truck, [{"repair_type": "Brakes"}])
    req = api_as("Maintenance").post("/maintenance-requests", params={"schedule": "true"}, json=body)
    priced = _body(truck, [{"repair_type": "Brakes", "cost": 900}])
    api_as("Accounts").put(f"/maintenance-requests/{req['id']}/costs", json=priced, expect=403)
    api_as("Accounts").delete(f"/maintenance-requests/{req['id']}/scheduled", expect=403)
    other_truck = create_truck(api)
    api_as("Maintenance").put(f"/maintenance-requests/{req['id']}/costs", json={**priced, "truck_id": other_truck["id"]}, expect=400)
    api.delete(f"/maintenance-requests/{req['id']}/scheduled", expect=204)
    assert req["id"] not in [r["id"] for r in api.get("/maintenance-requests/scheduled", params={"truck_id": truck["id"]})]
    api.put(f"/maintenance-requests/{req['id']}/costs", json=priced, expect=409)


def test_a_long_wait_reminds_the_owner_and_shows_in_the_recap(api, api_as, db, truck):
    import models
    import daily_summary
    from datetime import datetime, timedelta, timezone
    mech = api_as("Maintenance")
    req = mech.post("/maintenance-requests", params={"schedule": "true"}, json=_body(truck, [{"repair_type": "Brakes"}]))
    assert req["id"] not in [r["id"] for r in mech.get("/maintenance-requests/scheduled", params={"mine": "true", "min_days": 7})]
    row = db.get(models.MaintenanceRequest, req["id"])
    row.created_at = datetime.now(timezone.utc) - timedelta(days=9)
    db.commit()
    assert req["id"] in [r["id"] for r in mech.get("/maintenance-requests/scheduled", params={"mine": "true", "min_days": 7})]
    assert req["id"] not in [r["id"] for r in api_as("Accounts").get("/maintenance-requests/scheduled", params={"mine": "true"})]

    summary = daily_summary.build(db, daily_summary.now_ist().date())
    assert summary["metrics"]["Repairs waiting for a cost"] >= 1
    texts = " ".join(line["text"] for line in summary["attention"])
    assert "still" in texts and "no cost" in texts
