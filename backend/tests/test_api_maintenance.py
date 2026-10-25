"""Truck maintenance: records (+ proof files), fuel and AdBlue logs, tyres
(inventory, retread/discard, fitment, swap), maintenance categories and
requests, repair types and SAC codes."""
from datetime import date

import pytest

from world import create_truck, tag

TODAY = date.today().isoformat()
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200


@pytest.fixture()
def truck(api):
    t = create_truck(api)
    api.post(f"/trucks/{t['id']}/odometer-correction", json={"odometer": 50_000, "reason": "pytest start"})
    return t


def _record(api, truck, **extra):
    """Records are only created by approving a maintenance request."""
    req = api.post("/maintenance-requests", json={
        "truck_id": truck["id"], "date": TODAY, "odometer": 49_000, "maintenance_type": "Service", "cost": 2500, **extra,
    })
    record_id = api.put(f"/maintenance-requests/{req['id']}/approve", json={})["record_id"]
    return {"id": record_id}


# ---------------------------------------------------------------- records & proofs

def test_record_proofs_and_delete(api, truck):
    rec = _record(api, truck)
    proof = api.post(f"/maintenance/records/{rec['id']}/proofs", files={"file": ("bill.jpg", JPEG, "image/jpeg")})
    assert [p["id"] for p in api.get(f"/maintenance/records/{rec['id']}/proofs")] == [proof["id"]]
    assert api.get(f"/maintenance/records/{rec['id']}/proofs/{proof['id']}").content == JPEG
    api.delete(f"/maintenance/records/{rec['id']}/proofs/{proof['id']}")
    api.delete(f"/maintenance/records/{rec['id']}")
    assert rec["id"] not in [r["id"] for r in api.get("/maintenance/records", params={"truck_id": truck["id"]})]


def test_only_admin_deletes_records(api, api_as, truck):
    rec = _record(api, truck)
    api_as("Maintenance").delete(f"/maintenance/records/{rec['id']}", expect=403)


# ---------------------------------------------------------------- fuel & AdBlue

def test_fuel_logs(api, truck):
    api.put("/maintenance/fuel-base-config", json={"cost_per_litre": 95.5})
    log = api.post("/maintenance/fuel-logs", json={
        "truck_id": truck["id"], "date": TODAY, "odometer": 50_100, "litres": 100, "price_per_litre": 95.5, "total_cost": 9550,
    })
    api.post("/maintenance/fuel-logs", json={
        "truck_id": truck["id"], "date": TODAY, "odometer": 10, "litres": 1, "price_per_litre": 1, "total_cost": 1,
    }, expect=400)  # odometer below the previous reading
    assert api.put(f"/maintenance/fuel-logs/{log['id']}", json={"fuel_station": "Pytest Fuels"})["fuel_station"] == "Pytest Fuels"
    api.delete(f"/maintenance/fuel-logs/{log['id']}")


def test_adblue_logs_and_manufacturers(api, truck):
    log = api.post("/maintenance/adblue-logs", json={
        "truck_id": truck["id"], "date": TODAY, "odometer": 50_050, "litres": 20, "price_per_litre": 60, "total_cost": 1200,
    })
    assert api.put(f"/maintenance/adblue-logs/{log['id']}", json={"supplier": "Pytest"})["supplier"] == "Pytest"
    api.delete(f"/maintenance/adblue-logs/{log['id']}")

    maker = api.post("/maintenance/adblue-manufacturers", json={"name": f"Pytest Maker {tag()}", "default_price_per_litre": 58})
    assert float(api.put(f"/maintenance/adblue-manufacturers/{maker['id']}", json={"name": maker["name"], "default_price_per_litre": 59})["default_price_per_litre"]) == 59
    api.delete(f"/maintenance/adblue-manufacturers/{maker['id']}")


# ---------------------------------------------------------------- tyres

def _tyre(api, **extra):
    return api.post("/tyre-inventory", json={
        "brand": "MRF", "tyre_number": f"PT{tag()}", "size": "295/80 R22.5", "range_km": 80_000, "cost": 24_000,
        "purchase_date": TODAY, **extra,
    })


def test_tyre_inventory_crud_and_proof(api, api_as):
    tyre = _tyre(api)
    tid = tyre["id"]
    assert api.put(f"/tyre-inventory/{tid}", json={"brand": "Apollo"})["brand"] == "Apollo"
    api.get(f"/tyre-inventory/{tid}/data")
    api.post(f"/tyre-inventory/{tid}/proof", files={"file": ("bill.jpg", JPEG, "image/jpeg")})
    assert api.get(f"/tyre-inventory/{tid}/proof").content == JPEG
    api.delete(f"/tyre-inventory/{tid}/proof")

    mech = api_as("Maintenance")
    api.delete(f"/tyre-inventory/{tid}")
    mech.post(f"/tyre-inventory/{tid}/restore")
    api.delete(f"/tyre-inventory/{tid}")
    mech.delete(f"/tyre-inventory/{tid}/permanent")


def test_retread_and_discard(api, api_as):
    mech = api_as("Maintenance")
    tyre = _tyre(api)
    tid = tyre["id"]
    mech.post(f"/tyre-inventory/{tid}/move-to-inventory", json={
        "retread_cost": 6000, "expected_range": 40000, "retread_done_by": "Pytest Retreads"}, expect=409)
    mech.post(f"/tyre-inventory/{tid}/flag-retread", json={})
    moved = mech.post(f"/tyre-inventory/{tid}/move-to-inventory", json={
        "retread_cost": 6000, "expected_range": 40000, "retread_done_by": "Pytest Retreads"})
    assert moved["retread_flagged_at"] is None
    mech.post(f"/tyre-inventory/{tid}/flag-discard", json={"reason": "Sidewall cut"})
    assert mech.post(f"/tyre-inventory/{tid}/restore-from-discard")["discarded_at"] is None


def test_fit_remove_swap(api, truck):
    t1, t2, t3 = _tyre(api), _tyre(api), _tyre(api)
    fit = lambda tyre, pos: api.post("/tyre-fitment", json={
        "tyre_id": tyre["id"], "truck_id": truck["id"], "position": pos, "fitted_odometer": 50_000, "fitted_date": TODAY})
    f1, f2 = fit(t1, "FL"), fit(t2, "FR")
    api.post("/tyre-fitment", json={"tyre_id": t1["id"], "truck_id": truck["id"], "position": "RL1",
                                    "fitted_odometer": 50_000, "fitted_date": TODAY}, expect=400)  # already fitted
    swapped = api.post("/tyre-fitment/swap", json={
        "truck_id": truck["id"], "pairs": [{"position_a": "FL", "position_b": "FR"}], "odometer": 50_200, "remark": "Even wear"})
    assert swapped
    current = {f["tyre_id"]: f for f in api.get("/tyre-fitment", params={"truck_id": truck["id"]}) if not f.get("removed_date")}
    api.patch(f"/tyre-fitment/{current[t1['id']]['id']}/remove", json={
        "removed_odometer": 50_300, "removed_date": TODAY, "removal_remark": "Puncture"})
    fit(t3, "RL1")
    api.post("/tyre-fitment/remove-bulk", json={
        "truck_id": truck["id"], "removed_odometer": 50_400, "removed_date": TODAY, "removal_remark": "Truck to workshop"})
    assert api.get(f"/tyre-inventory/{t1['id']}/history")
    assert f1["id"] and f2["id"]


def test_tyre_remark_presets(api):
    preset = api.post("/tyre-remark-presets", json={"scenario": "Removal", "text": f"Pytest preset {tag()}"})
    api.post("/tyre-remark-presets", json={"scenario": "Nonsense", "text": "x"}, expect=422)
    api.delete(f"/tyre-remark-presets/{preset['id']}")


# ---------------------------------------------------------------- categories, requests, repair types, SAC

def test_maintenance_categories(api_as):
    mech = api_as("Maintenance")
    cat = mech.post("/maintenance-categories", json={"name": f"Pytest Cat {tag()}"})
    mech.put(f"/maintenance-categories/{cat['id']}", json={"name": cat["name"] + " X"})
    mech.post(f"/maintenance-categories/{cat['id']}/repairs", json={"name": "Bad, name"}, expect=400)
    repair = mech.post(f"/maintenance-categories/{cat['id']}/repairs", json={"name": "Clutch plate"})
    mech.put(f"/maintenance-categories/{cat['id']}/repairs/{repair['id']}", json={"name": "Clutch plate set"})
    mech.delete(f"/maintenance-categories/{cat['id']}/repairs/{repair['id']}")
    mech.delete(f"/maintenance-categories/{cat['id']}")


def test_maintenance_requests(api, api_as, truck):
    mech = api_as("Maintenance")
    body = {"truck_id": truck["id"], "date": TODAY, "odometer": 49_500, "maintenance_type": "Brake job", "cost": 4000}
    req = mech.post("/maintenance-requests", json=body)
    proof = mech.post(f"/maintenance-requests/{req['id']}/proofs", files={"file": ("bill.jpg", JPEG, "image/jpeg")})
    assert [p["id"] for p in api.get(f"/maintenance-requests/{req['id']}/proofs")] == [proof["id"]]
    assert api.get(f"/maintenance-requests/{req['id']}/proofs/{proof['id']}").content == JPEG
    assert api.put(f"/maintenance-requests/{req['id']}/approve", json={})["status"] == "Approved"
    api.put(f"/maintenance-requests/{req['id']}/approve", json={}, expect=409)

    other = mech.post("/maintenance-requests", json=body)
    assert api.put(f"/maintenance-requests/{other['id']}/reject", json={"reason": "Duplicate"})["status"] == "Rejected"
    mech.post("/maintenance-requests/mine/mark-seen")


def test_repair_types(api, api_as):
    api_as("Accounts").post("/repair-types", json={"name": "x"}, expect=403)
    rt = api.post("/repair-types", json={"name": f"Pytest Repair {tag()}", "default_cost": 500})
    assert float(api.put(f"/repair-types/{rt['id']}", json={"default_cost": 650})["default_cost"]) == 650
    api.delete(f"/repair-types/{rt['id']}")


def test_sac_codes(api):
    sac = api.post("/sac-codes", json={"description": "Pytest freight", "code": f"99{tag()[:4]}", "gst_rate": 5})
    api.put(f"/sac-codes/{sac['id']}", json={"gst_rate": 12})
    assert api.patch(f"/sac-codes/{sac['id']}/link-expense", json={"expense": "Toll"})["linked_expense"] == "Toll"
    api.patch(f"/sac-codes/{sac['id']}/auto-populate", json={"invoice_type": "Tax Invoice"})
    api.delete(f"/sac-codes/{sac['id']}")
