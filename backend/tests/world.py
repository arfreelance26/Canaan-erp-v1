"""A small, realistic set of records, created through the API itself (so the
create endpoints are exercised too): a branch, vendor, customer with an origin
and a route, two trucks, two drivers (one assigned to a truck) and a trip.

Names carry a random tag, so the same tests also run on a copy of real data."""
import secrets
from datetime import date
from types import SimpleNamespace


def tag() -> str:
    return secrets.token_hex(3).upper()


def container_no() -> str:
    return "PTCU" + str(secrets.randbelow(9_000_000) + 1_000_000)


def create_truck(api, branch=None, **extra):
    t = tag()
    body = {
        "truck_id": api.get("/trucks/next-id")["truck_id"],
        "registration_number": f"TN09PT{t}", "manufacturer": "Tata", "model_name": "Signa 4825",
        "truck_type": "40 FT ARTICULATED", "tyre_layout": "10+1", "odometer_during_purchase": 1000,
        **({"branch": branch} if branch else {}), **extra,
    }
    return api.post("/trucks", json=body)


def create_driver(api, **extra):
    t = tag()
    body = {
        "driver_id": api.get("/drivers/next-id")["driver_id"], "name": f"Pytest Driver {t}",
        "password": "Pytest#" + secrets.token_hex(6), "contact_number": "98" + str(secrets.randbelow(90_000_000) + 10_000_000),
        **extra,
    }
    return api.post("/drivers", json=body)


def create_trip(api, w, **extra):
    t = tag()
    body = {
        "trip_id": f"PT-{t}", "booking_reference_no": f"BK-PT-{t}", "status": "Assigned",
        "assigned_date": date.today().isoformat(), "booking_created_date": date.today().isoformat(),
        "scheduled_date": date.today().isoformat(), "trip_category": "LOCAL", "movement_category": "Own Fleet",
        "customer_id": w.customer["id"], "cargo_classification": "IMPORT",
        "container_specification": "40 FT CONTAINER", "container_number": container_no(),
        "origin": w.origin_name, "destination": w.destination["destination_name"],
        "driver_id": w.driver["driver_id"], "vehicle_id": w.truck["truck_id"],
        "bill_to": "CUSTOMER", "payment_type": "Credit", "approx_km": 40,
        **extra,
    }
    return api.post("/trips", json=body)


def build_world(api):
    w = SimpleNamespace()
    t = tag()
    w.branch = api.post("/branches", json={
        "name": f"PYTEST {t}", "halt_day_fee_20ft": 500, "halt_day_fee_40ft": 700,
        "driver_halt_day_percentage": 5, "cleaner_batta_fee": 300, "workshop_batta_fee": 250,
    })
    w.vendor = api.post("/vendors", json={"name": f"Pytest Vendor {t}", "status": "ACTIVE"})
    w.customer = api.post("/customers", json={"name": f"Pytest Customer {t}", "customer_type": "Shipping"})
    w.origin_name = f"PT ORIGIN {t}"
    w.origin = api.post(f"/customers/{w.customer['id']}/origins", json={"origin_name": w.origin_name})
    w.destination = api.post(f"/customers/{w.customer['id']}/destinations", json={
        "destination_name": f"PT DEST {t}", "destination_state": "Tamil Nadu", "origin_state": "Tamil Nadu",
        "approx_distance_km": 40, "cargo_classification": "IMPORT", "container_type": "40 FT CONTAINER",
        "status": "ACTIVE",
    })
    w.truck = create_truck(api, branch=w.branch["name"])
    w.truck2 = create_truck(api, branch=w.branch["name"])
    w.driver = create_driver(api)
    w.driver2 = create_driver(api)
    w.assignment = api.post("/drivers/assignments", json={
        "driver_id": w.driver["driver_id"], "vehicle_id": w.truck["truck_id"],
    })
    w.trip = create_trip(api, w)
    return w


def fresh_trip(api, w, **extra):
    """A trip on its own new truck and driver, so trips never clash with each
    other's "driver/truck already on a trip" checks."""
    truck, driver = create_truck(api), create_driver(api)
    api.post("/drivers/assignments", json={"driver_id": driver["driver_id"], "vehicle_id": truck["truck_id"]})
    return create_trip(api, w, driver_id=driver["driver_id"], vehicle_id=truck["truck_id"], **extra)


def create_staff(api, role="Accounts", **extra):
    t = tag()
    return api.post("/staff", json={
        "staff_id": f"PTS-{t}", "name": f"Pytest Staff {t}", "software_designation": role,
        "username": f"pts.{t.lower()}", "password": "Pytest#" + secrets.token_hex(6),
        "date_of_joining": "2025-01-01", **extra,
    })


def complete_and_close(api, trip):
    api.patch(f"/trips/{trip['id']}/status", json={"status": "Completed"})
    return api.post(f"/trips/{trip['id']}/close", json={
        "trip_completed_date": date.today().isoformat(), "hire_amount": 12000, "billing_amount": 12000,
        "payment_type": "Credit", "closure_remarks": "pytest",
    })


def add_sheet(api, trip):
    return api.post(f"/trips/{trip['id']}/sheet", json={
        "trip_sheet_no": f"TS-{trip['trip_id']}", "trip_sheet_date": date.today().isoformat(),
        "start_km": 1000, "end_km": 1040, "hire_amount": 12000,
    })


def sheeted_trip(api, w):
    """A completed, closed trip with its trip sheet in."""
    trip = fresh_trip(api, w)
    complete_and_close(api, trip)
    add_sheet(api, trip)
    return trip
