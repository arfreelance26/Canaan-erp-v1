"""Master data: trucks, drivers, staff, branches, vendors, vendor categories,
customers (with origins, routes, pricing). Create → read → edit → soft-delete
→ restore → delete permanently, plus each record's special actions."""
import secrets
from datetime import date

from world import create_driver, create_truck, tag


# ---------------------------------------------------------------- trucks

def test_truck_lifecycle(api, world):
    truck = create_truck(api, branch=world.branch["name"])
    tid = truck["id"]
    assert api.get(f"/trucks/{tid}")["registration_number"] == truck["registration_number"]

    edited = api.put(f"/trucks/{tid}", json={"model_name": "Signa 5530", "client_version": truck["version"]})
    assert edited["model_name"] == "Signa 5530"

    api.delete(f"/trucks/{tid}")
    assert tid in [t["id"] for t in api.get("/trucks/removed")]
    api.post(f"/trucks/{tid}/restore")
    assert api.get(f"/trucks/{tid}")["id"] == tid

    api.delete(f"/trucks/{tid}")
    api.delete(f"/trucks/{tid}/permanent")
    api.get(f"/trucks/{tid}", expect=404)


def test_truck_odometer_correction(api, world):
    truck = create_truck(api)
    api.post(f"/trucks/{truck['id']}/odometer-correction", json={"odometer": 2500, "reason": "Meter replaced"})
    reading = api.get(f"/trucks/{truck['id']}/odometer")
    assert reading["odometer"] == 2500 and reading["corrections"]


def test_truck_permanent_branch_change(api, world):
    truck = create_truck(api)
    api.post(f"/trucks/{truck['id']}/branch-change", json={
        "mode": "permanent", "branch_name": world.branch["name"], "note": "Moved to the pytest branch",
    })
    assert api.get(f"/trucks/{truck['id']}")["branch_registered_to"] == world.branch["name"]
    assert api.get(f"/trucks/{truck['id']}/branch-history")


def test_sell_truck(api):
    truck = create_truck(api)
    api.post(f"/trucks/{truck['id']}/sell", json={"sold_date": date.today().isoformat(), "sold_odometer": 1500, "note": "Sold"})
    assert truck["id"] in [t["id"] for t in api.get("/trucks/sold")]
    api.post(f"/trucks/{truck['id']}/restore", expect=409)  # a sold truck can't come back


def test_run_config_and_base_tyre_cost(api):
    api.put("/trucks/run-config", json={"configs": [{"tyre_layout": "10+1", "km_per_month": 6000, "km_per_day": 230}]})
    assert any(c["tyre_layout"] == "10+1" for c in api.get("/trucks/run-config"))
    api.put("/trucks/base-tyre-cost", json={"configs": [{"tyre_layout": "10+1", "cost": 18000}]})
    assert any(c["tyre_layout"] == "10+1" for c in api.get("/trucks/base-tyre-cost"))


# ---------------------------------------------------------------- drivers

def test_driver_lifecycle(api):
    driver = create_driver(api)
    did = driver["id"]
    assert api.put(f"/drivers/{did}", json={"name": "Renamed Driver"})["name"] == "Renamed Driver"
    api.delete(f"/drivers/{did}")
    assert did in api.get("/drivers/deleted-ids")
    api.post(f"/drivers/{did}/restore")
    api.delete(f"/drivers/{did}")
    api.delete(f"/drivers/{did}/permanent")
    api.get(f"/drivers/{did}", expect=404)


def test_driver_assignment_can_be_removed(api):
    truck, driver = create_truck(api), create_driver(api)
    api.post("/drivers/assignments", json={"driver_id": driver["driver_id"], "vehicle_id": truck["truck_id"]})
    api.delete(f"/drivers/assignments/{driver['driver_id']}")
    assert driver["driver_id"] not in [a["driver_id"] for a in api.get("/drivers/assignments/all")]


# ---------------------------------------------------------------- staff

def _new_staff(api, role="Accounts"):
    t = tag()
    return api.post("/staff", json={
        "staff_id": f"PTS-{t}", "name": f"Pytest Staff {t}", "software_designation": role,
        "username": f"pts.{t.lower()}", "password": "Pytest#" + secrets.token_hex(6),
        "date_of_joining": "2025-01-01",
    })


def test_staff_lifecycle(api):
    person = _new_staff(api)
    sid = person["id"]
    assert api.get(f"/staff/{sid}")["staff_id"] == person["staff_id"]
    assert api.put(f"/staff/{sid}", json={"designation": "Senior Accountant"})["designation"] == "Senior Accountant"
    api.delete(f"/staff/{sid}")
    api.post(f"/staff/{sid}/restore")
    api.delete(f"/staff/{sid}")
    api.delete(f"/staff/{sid}/permanent")
    api.get(f"/staff/{sid}", expect=404)


def test_staff_reset_device_and_force_logout(api, client):
    person = _new_staff(api)
    reset = api.post(f"/staff/{person['id']}/reset-device", json={})
    assert reset == {"ok": True, "devices": []}
    assert api.post(f"/staff/{person['id']}/force-logout")["token_version"] == 1


def test_force_logout_ends_existing_sessions(api, client):
    from conftest import headers_for
    import models
    from database import SessionLocal
    person = _new_staff(api)
    s = SessionLocal()
    row = s.get(models.Staff, person["id"])
    old = headers_for(row)
    s.close()
    assert client.get("/trucks", headers=old).status_code == 200
    api.post(f"/staff/{person['id']}/force-logout")
    assert client.get("/trucks", headers=old).status_code == 401


# ---------------------------------------------------------------- branches & vendors

def test_branch_edit_and_delete(api):
    branch = api.post("/branches", json={"name": f"PYTEST TEMP {tag()}", "halt_day_fee_20ft": 400})
    assert float(api.put(f"/branches/{branch['id']}", json={"halt_day_fee_20ft": 450})["halt_day_fee_20ft"]) == 450
    api.delete(f"/branches/{branch['id']}")
    assert branch["id"] not in [b["id"] for b in api.get("/branches")]


def test_vendor_lifecycle(api):
    vendor = api.post("/vendors", json={"name": f"Pytest Vendor {tag()}"})
    vid = vendor["id"]
    assert api.put(f"/vendors/{vid}", json={"status": "INACTIVE"})["status"] == "INACTIVE"
    api.delete(f"/vendors/{vid}")
    api.post(f"/vendors/{vid}/restore")
    api.delete(f"/vendors/{vid}")
    api.delete(f"/vendors/{vid}/permanent")
    api.get(f"/vendors/{vid}", expect=404)


def test_vendor_categories(api):
    cat = api.post("/vendor-categories", json={"name": f"Pytest Category {tag()}"})
    assert cat["id"] in [c["id"] for c in api.get("/vendor-categories")]
    api.delete(f"/vendor-categories/{cat['id']}")
    assert cat["id"] not in [c["id"] for c in api.get("/vendor-categories")]


# ---------------------------------------------------------------- customers

def test_customer_lifecycle(api):
    customer = api.post("/customers", json={"name": f"Pytest Customer {tag()}"})
    cid = customer["id"]
    assert api.put(f"/customers/{cid}", json={"customer_type": "Transports"})["customer_type"] == "Transports"
    api.delete(f"/customers/{cid}")
    api.post(f"/customers/{cid}/restore")
    api.delete(f"/customers/{cid}")
    api.delete(f"/customers/{cid}/permanent")
    api.get(f"/customers/{cid}", expect=404)


def test_customer_origins_routes_and_pricing(api):
    cid = api.post("/customers", json={"name": f"Pytest Customer {tag()}"})["id"]
    origin = api.post(f"/customers/{cid}/origins", json={"origin_name": f"PT ORIGIN {tag()}"})
    route = api.post(f"/customers/{cid}/destinations", json={
        "destination_name": f"PT DEST {tag()}", "destination_state": "Kerala", "origin_state": "Tamil Nadu",
        "cargo_classification": "EXPORT", "container_type": "20 FT CONTAINER", "approx_distance_km": 300,
    })
    route = api.put(f"/customers/{cid}/destinations/{route['id']}", json={
        "destination_name": route["destination_name"], "destination_state": "Kerala", "origin_state": "Tamil Nadu",
        "cargo_classification": "EXPORT", "container_type": "20 FT CONTAINER", "approx_distance_km": 320,
    })
    assert float(route["approx_distance_km"]) == 320

    price = api.post(f"/customers/{cid}/pricing", json={"customer_destination_id": route["id"], "rate": 25000})
    assert float(api.put(f"/customers/{cid}/pricing/{price['id']}", json={
        "customer_destination_id": route["id"], "rate": 26000})["rate"]) == 26000
    final = api.post(f"/customers/{cid}/final-pricing", json={
        "customer_destination_id": route["id"], "customer_destination": route["destination_name"],
        "actual_hire_amount": 27000, "accounts_hire_amount": 26500})
    final = api.put(f"/customers/{cid}/final-pricing/{final['id']}", json={"actual_hire_amount": 27500})
    assert float(final["actual_hire_amount"]) == 27500

    api.delete(f"/customers/{cid}/final-pricing/{final['id']}")
    api.delete(f"/customers/{cid}/pricing/{price['id']}")
    api.delete(f"/customers/{cid}/destinations/{route['id']}")
    api.delete(f"/customers/{cid}/origins/{origin['id']}")
    assert api.get(f"/customers/{cid}/destinations") == []
