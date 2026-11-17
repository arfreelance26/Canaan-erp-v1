"""Trip Sheet → the End KM hint and the KM variance check: what a trip should
run, ONE WAY (trip_km.expected_km) — its Approx KM, else its route's, else
Geoapify (saved onto the route as "auto" when exact). Geoapify is faked here."""
import pytest

import geo_distance
import trip_km
from world import fresh_trip, tag


def _clear_geo_tables():
    """The lasting Geoapify cache and the credit log start empty for each test."""
    import database, models
    db = database.SessionLocal()
    db.query(models.GeoCache).delete()
    db.query(models.GeoUsage).delete()
    db.commit()
    db.close()


@pytest.fixture
def fake_geoapify(monkeypatch):
    """Exact for "Tuticorin Port" / "Salem"; only the town for "VOC Port"."""
    calls = []

    def fake(url, params):
        calls.append(url)
        if url == geo_distance.GEOCODE_URL:
            text = params["text"].lower()
            if text.startswith("voc port"):
                return {"results": [{"lat": 8.80, "lon": 78.13, "formatted": "A. V. M. Pharmacy, Thoothukudi", "state": "Tamil Nadu",
                                     "rank": {"confidence": 1, "match_type": "inner_part"}}]}
            if text.startswith(("tuticorin port", "salem")):
                return {"results": [{"lat": 8.76 if "tuticorin" in text else 11.66, "lon": 78.19 if "tuticorin" in text else 78.14,
                                     "formatted": text.title(), "state": "Tamil Nadu", "rank": {"confidence": 0.95, "match_type": "full_match"}}]}
            return {"results": []}
        return {"features": [{"properties": {"distance": 367_400, "time": 30_000}, "geometry": {"type": "LineString", "coordinates": []}}]}

    monkeypatch.setenv("GEOAPIFY_API_KEY", "test-key")
    _clear_geo_tables()
    monkeypatch.setattr(geo_distance, "_get_json", fake)
    geo_distance._geocode_cached.cache_clear()
    trip_km._GEO_CACHE.clear()
    yield calls
    geo_distance._geocode_cached.cache_clear()
    trip_km._GEO_CACHE.clear()


def _route(api, world, **extra):
    t = tag()
    return api.post(f"/customers/{world.customer['id']}/destinations", json={
        "destination_state": "TAMIL NADU", "destination_address": f"Place {t}", "origin_state": "TAMIL NADU",
        "origin_address": f"Origin {t}", **extra})


def _expected(api, trip, editing=True, basis="one_way"):
    """The sheet open for editing (Geoapify allowed), or read-only (never). These
    Outstation trips are answered "a Return Trip follows" (one way) unless said."""
    return api.post(f"/trips/{trip['id']}/sheet/km-check",
                    json={"vehicle_id": trip["vehicle_id"], "lookup_distance": editing, "km_basis": basis})["expected"]


def test_the_trips_own_approx_km_first(api, world):
    route = _route(api, world, approx_distance_km=500)
    trip = fresh_trip(api, world, trip_category="OUTSTATION", customer_destination_id=route["id"], approx_km=367)
    exp = _expected(api, trip)
    assert (exp["km"], exp["source"], exp["sure"], exp["legs"]) == (367, "trip", True, 1)
    assert exp["detail"] == "this trip's Approx KM, one way"


def test_else_the_routes_km(api, world):
    route = _route(api, world, approx_distance_km=412)
    trip = fresh_trip(api, world, trip_category="OUTSTATION", customer_destination_id=route["id"], approx_km=None)
    exp = _expected(api, trip)
    assert exp["km"] == 412 and exp["source"] == "route" and exp["sure"] is True


def test_else_geoapify_saved_onto_the_route(api, world, fake_geoapify):
    """Exact: the km (one way, no extras) and saved onto the route as "auto" — looked up once."""
    route = _route(api, world)
    trip = fresh_trip(api, world, trip_category="OUTSTATION", customer_destination_id=route["id"], approx_km=None,
                      origin="Tuticorin Port", destination="Salem")
    exp = _expected(api, trip)
    assert exp["km"] == 367 and exp["source"] == "map" and exp["sure"] is True
    assert "Tuticorin Port → Salem" in exp["detail"]
    saved = next(d for d in api.get(f"/customers/{world.customer['id']}/destinations") if d["id"] == route["id"])
    assert float(saved["approx_distance_km"]) == 367 and saved["distance_source"] == "auto"
    calls = len(fake_geoapify)
    assert _expected(api, trip)["source"] == "route" and len(fake_geoapify) == calls   # no more credits


def test_route_pins_are_used_exactly(api, world, fake_geoapify):
    route = _route(api, world, origin_lat=8.7642, origin_lon=78.1956, destination_lat=11.6643, destination_lon=78.146)
    trip = fresh_trip(api, world, trip_category="OUTSTATION", customer_destination_id=route["id"], approx_km=None, origin="Anything", destination="Else")
    exp = _expected(api, trip)
    assert exp["source"] == "map" and exp["sure"] is True and "between the route's pins" in exp["detail"]
    assert geo_distance.GEOCODE_URL not in fake_geoapify            # pins: no address lookup


def test_a_rough_match_is_shown_not_saved(api, world, fake_geoapify):
    route = _route(api, world)
    trip = fresh_trip(api, world, trip_category="OUTSTATION", customer_destination_id=route["id"], approx_km=None, origin="VOC Port", destination="Salem")
    exp = _expected(api, trip)
    assert exp["sure"] is False and "rough" in exp["detail"]
    saved = next(d for d in api.get(f"/customers/{world.customer['id']}/destinations") if d["id"] == route["id"])
    assert saved["approx_distance_km"] is None and saved["distance_source"] is None


def test_nothing_to_go_on(api, world):
    """No Approx KM anywhere and no Geoapify key (as in every test run): no expected km."""
    trip = fresh_trip(api, world, trip_category="OUTSTATION", approx_km=None, origin=f"Nowhere {tag()}", destination=f"Else {tag()}")
    assert _expected(api, trip) is None


def test_read_only_sheets_never_spend_credits(api, world, fake_geoapify):
    route = _route(api, world)
    trip = fresh_trip(api, world, trip_category="OUTSTATION", customer_destination_id=route["id"], approx_km=None, origin="Tuticorin Port", destination="Salem")
    assert _expected(api, trip, editing=False) is None and fake_geoapify == []


def test_one_way_or_both_ways(api, world):
    """Every category but Return Trip: by the sheet's answer (nothing until
    answered). A Return Trip: one way (it's the way back itself)."""
    out = fresh_trip(api, world, trip_category="OUTSTATION", approx_km=300)
    assert _expected(api, out, basis=None)["pending"] is True and _expected(api, out, basis=None)["legs"] is None
    assert _expected(api, out, basis="one_way")["km"] == 300
    both = _expected(api, out, basis="two_way")
    assert both["km"] == 600 and both["legs"] == 2 and "× 2 (both ways" in both["detail"]
    for category in ("LOCAL", "LOCAL CFS", "SHIFTING"):
        short = fresh_trip(api, world, trip_category=category, approx_km=40)
        assert _expected(api, short, basis=None)["pending"] is True
        assert _expected(api, short, basis="two_way")["km"] == 80 and _expected(api, short, basis="one_way")["km"] == 40
    back = fresh_trip(api, world, trip_category="RETURN TRIP", approx_km=300)
    assert _expected(api, back, basis=None)["km"] == 300


def test_next_booked_trip_is_reported(api, world):
    """A Return Trip booked next for the truck answers the question on the Outstation sheet."""
    from datetime import date, timedelta
    from world import create_trip, complete_and_close
    out = fresh_trip(api, world, trip_category="OUTSTATION", scheduled_date=(date.today() - timedelta(days=2)).isoformat())
    complete_and_close(api, out)
    back = create_trip(api, world, trip_category="RETURN TRIP", driver_id=out["driver_id"], vehicle_id=out["vehicle_id"])
    nxt = api.post(f"/trips/{out['id']}/sheet/km-check", json={"vehicle_id": out["vehicle_id"]})["next_trip"]
    assert nxt["trip_code"] == back["trip_id"] and nxt["category"] == "RETURN TRIP"


def test_sheets_must_say_how_km_are_counted(api, world):
    from world import complete_and_close
    out = fresh_trip(api, world, trip_category="OUTSTATION")
    complete_and_close(api, out)
    body = {"trip_sheet_no": f"TS-{out['trip_id']}", "trip_scheduled_date": out["scheduled_date"], "vehicle_id": out["vehicle_id"],
            "start_km": 1000, "end_km": 1700, "hire_amount": 12000}
    res = api.post(f"/trips/{out['id']}/sheet", json=body, expect=422)
    assert "Is there a Return Trip after this one?" in res["detail"]
    saved = api.post(f"/trips/{out['id']}/sheet", json={**body, "km_basis": "two_way"})
    assert saved["km_basis"] == "two_way"

    local = fresh_trip(api, world, trip_category="LOCAL")
    complete_and_close(api, local)
    local_body = {**body, "trip_sheet_no": f"TS-{local['trip_id']}", "vehicle_id": local["vehicle_id"]}
    api.post(f"/trips/{local['id']}/sheet", json=local_body, expect=422)          # Local is asked too
    assert api.post(f"/trips/{local['id']}/sheet", json={**local_body, "km_basis": "one_way"})["km_basis"] == "one_way"

    back = fresh_trip(api, world, trip_category="RETURN TRIP")
    complete_and_close(api, back)
    saved = api.post(f"/trips/{back['id']}/sheet", json={**body, "trip_sheet_no": f"TS-{back['trip_id']}",
                                                         "vehicle_id": back["vehicle_id"], "km_basis": "two_way"})
    assert saved["km_basis"] is None          # a Return Trip is one way: not asked, not kept
