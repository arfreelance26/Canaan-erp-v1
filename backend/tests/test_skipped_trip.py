"""A truck's trip sheets go in trip order: a new sheet can't be saved while an
earlier Closed trip of the same truck (after its last trip with km) has no
sheet yet — its km would be swallowed. Admin may save anyway with a reason,
kept in the trip's Edit History (trip_km.missing_sheets)."""
from datetime import date, timedelta

from world import complete_and_close, create_driver, create_trip, create_truck

TODAY = date.today()


def _day(n: int) -> str:
    return (TODAY - timedelta(days=n)).isoformat()


def _sheet(trip, start, end, **extra):
    return {"trip_sheet_no": f"TS-{trip['trip_id']}", "trip_sheet_date": TODAY.isoformat(),
            "trip_scheduled_date": trip["scheduled_date"], "vehicle_id": trip["vehicle_id"],
            "start_km": start, "end_km": end, "hire_amount": 12000, "km_basis": "two_way", **extra}


def _truck_trips(api, world, days_ago: list[int]):
    """Closed trips on one new truck, one per date (oldest first)."""
    truck, driver = create_truck(api), create_driver(api)
    api.post("/drivers/assignments", json={"driver_id": driver["driver_id"], "vehicle_id": truck["truck_id"]})
    trips = []
    for n in days_ago:
        t = create_trip(api, world, driver_id=driver["driver_id"], vehicle_id=truck["truck_id"], scheduled_date=_day(n))
        complete_and_close(api, t)
        trips.append(t)
    return trips


def test_skipping_a_trip_blocks_the_next_sheet(api, api_as, world):
    t1, t2, t3 = _truck_trips(api, world, [10, 5, 0])
    clerk = api_as("Trip Sheet Register")
    clerk.post(f"/trips/{t1['id']}/sheet", json=_sheet(t1, 1000, 1400))

    # t2 skipped: t3 can't go in yet, and the form is told which trip is missing.
    res = clerk.post(f"/trips/{t3['id']}/sheet", json=_sheet(t3, 2100, 2500), expect=409)
    assert f"Enter the trip sheet for {t2['trip_id']}" in res["detail"]
    check = clerk.post(f"/trips/{t3['id']}/sheet/km-check", json={"vehicle_id": t3["vehicle_id"]})
    assert [m["trip_code"] for m in check["missing"]] == [t2["trip_id"]] and check["missing"][0]["date"] == t2["scheduled_date"]

    # Enter t2 (its real km, below t3's — no longer an error) → t3 goes in.
    clerk.post(f"/trips/{t2['id']}/sheet", json=_sheet(t2, 1400, 2100))
    clerk.post(f"/trips/{t3['id']}/sheet", json=_sheet(t3, 2100, 2500))
    assert clerk.post(f"/trips/{t3['id']}/sheet/km-check", json={"vehicle_id": t3["vehicle_id"]})["missing"] == []

    # Editing a saved sheet is never blocked.
    clerk.post(f"/trips/{t1['id']}/sheet", json=_sheet(t1, 1000, 1401, client_version=1))


def test_admin_can_save_over_a_gap_with_a_reason(api, world):
    t1, t2, t3 = _truck_trips(api, world, [10, 5, 0])
    api.post(f"/trips/{t1['id']}/sheet", json=_sheet(t1, 1000, 1400))
    res = api.post(f"/trips/{t3['id']}/sheet", json=_sheet(t3, 2100, 2500), expect=409)
    assert "As Admin you can save anyway with a reason" in res["detail"]

    api.post(f"/trips/{t3['id']}/sheet", json=_sheet(t3, 2100, 2500, skip_reason="TRP sheet lost, driver re-writing it"))
    events = [e for e in api.get("/trips/edit-events") if e["trip_id"] == t3["id"] and e["event"] == "Trip Sheet Saved"]
    assert events and events[0]["remark"] == "Saved before the earlier trip's sheet: TRP sheet lost, driver re-writing it"
    assert "skip_reason" not in api.get(f"/trips/{t3['id']}/sheet")   # not stored on the sheet


def test_only_trips_since_the_last_one_with_km_count(api, api_as, world, db):
    import models
    t0, t1, t2, t3 = _truck_trips(api, world, [20, 10, 5, 0])
    clerk = api_as("Trip Sheet Register")
    # t0 never got a sheet; Admin put t1 in over it (with a reason). From then on t0 is
    # before the truck's last trip with km, so it doesn't block anything.
    clerk.post(f"/trips/{t1['id']}/sheet", json=_sheet(t1, 1000, 1400), expect=409)
    api.post(f"/trips/{t1['id']}/sheet", json=_sheet(t1, 1000, 1400, skip_reason="old trip, sheet never made"))
    # t2 cancelled after closing: not a real trip, doesn't block either.
    db.query(models.Trip).filter(models.Trip.id == t2["id"]).update({"status": "Cancelled"})
    db.commit()
    clerk.post(f"/trips/{t3['id']}/sheet", json=_sheet(t3, 1400, 1800))


def test_first_sheet_of_a_truck_and_same_day_order(api, api_as, world):
    clerk = api_as("Trip Sheet Register")
    # The truck's very first sheet: nothing before it with km — earlier closed trips still count.
    a, b = _truck_trips(api, world, [3, 1])
    res = clerk.post(f"/trips/{b['id']}/sheet", json=_sheet(b, 500, 900), expect=409)
    assert a["trip_id"] in res["detail"]
    clerk.post(f"/trips/{a['id']}/sheet", json=_sheet(a, 100, 500))
    clerk.post(f"/trips/{b['id']}/sheet", json=_sheet(b, 500, 900))

    # Two trips the same day: the one booked first must go in first.
    c, d = _truck_trips(api, world, [0, 0])
    clerk.post(f"/trips/{d['id']}/sheet", json=_sheet(d, 300, 400), expect=409)
    clerk.post(f"/trips/{c['id']}/sheet", json=_sheet(c, 200, 300))
    clerk.post(f"/trips/{d['id']}/sheet", json=_sheet(d, 300, 400))
