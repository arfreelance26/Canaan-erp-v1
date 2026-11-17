"""Our Customers → Destinations → "Calculate road distance" (geo_distance.py),
with Geoapify replaced by a fake: no key, no credits, no network."""
import pytest

import geo_distance

PLACES = {
    "chennai port": {"lat": 13.0950, "lon": 80.2920, "formatted": "Chennai Port, Chennai 600001, Tamil Nadu, India",
                     "state": "Tamil Nadu", "rank": {"confidence": 0.95, "match_type": "full_match"}, "result_type": "amenity"},
    "kochi": {"lat": 9.9312, "lon": 76.2673, "formatted": "Kochi, Kerala, India",
              "state": "Kerala", "rank": {"confidence": 0.9, "match_type": "full_match"}, "result_type": "city"},
    "nh 66": {"lat": 15.0, "lon": 74.0, "formatted": "NH66, Goa, India",
              "state": "Goa", "rank": {"confidence": 0.3, "match_type": "full_match"}, "result_type": "street"},
    # Only the town matched (as Geoapify did for "V.O.C Port, Thoothukudi"): sure of itself, but not the port.
    "voc port": {"lat": 8.80, "lon": 78.13, "formatted": "A. V. M. Pharmacy, Thoothukudi - 628001, TN, India",
                 "state": "Tamil Nadu", "rank": {"confidence": 1, "match_type": "inner_part"}, "result_type": "amenity"},
}


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
    calls = []

    def fake(url, params):
        calls.append((url, dict(params)))
        if url == geo_distance.GEOCODE_URL:
            text = params["text"].lower()
            hit = next((v for k, v in PLACES.items() if text.startswith(k)), None)
            return {"results": [hit] if hit else []}
        if url == geo_distance.REVERSE_URL:
            return {"results": [{"name": "Tuticorin Port", "distance": 12, "suburb": "Harbour Estate", "city": "Thoothukudi",
                                 "postcode": "628004", "state": "Tamil Nadu"}]}
        if url == geo_distance.ROUTING_URL:
            return {"features": [{"properties": {"distance": 692_400, "time": 41_400},
                                  "geometry": {"type": "MultiLineString",
                                               "coordinates": [[[80.29, 13.09], [78.0, 11.0]], [[78.0, 11.0], [76.27, 9.93]]]}}]}
        return {}

    monkeypatch.setenv("GEOAPIFY_API_KEY", "test-key")
    _clear_geo_tables()
    monkeypatch.setattr(geo_distance, "_get_json", fake)
    geo_distance._geocode_cached.cache_clear()
    geo_distance._search_cached.cache_clear()
    geo_distance._reverse_cached.cache_clear()
    yield calls
    geo_distance._geocode_cached.cache_clear()
    geo_distance._search_cached.cache_clear()


BODY = {"origin_address": "Chennai Port", "origin_state": "TAMIL NADU",
        "destination_address": "Kochi", "destination_state": "KERALA"}


def test_truck_road_distance_with_the_places_matched(api, fake_geoapify):
    res = api.post("/customers/route-distance", json=BODY)
    assert res["km"] == 692.4 and res["minutes"] == 690 and res["mode"] == "truck"
    assert res["origin"]["matched"].startswith("Chennai Port") and res["destination"]["state"] == "Kerala"
    assert res["warnings"] == [] and res["sure"] is True
    geo = [p for u, p in fake_geoapify if u == geo_distance.GEOCODE_URL]
    assert geo[0]["text"] == "chennai port, tamil nadu, india" and geo[0]["filter"] == "countrycode:in"
    route = next(p for u, p in fake_geoapify if u == geo_distance.ROUTING_URL)
    assert route["mode"] == "truck" and route["waypoints"] == "13.095,80.292|9.9312,76.2673"


def test_same_place_is_looked_up_once(api, fake_geoapify):
    api.post("/customers/route-distance", json=BODY)
    api.post("/customers/route-distance", json=BODY)
    assert sum(1 for u, _ in fake_geoapify if u == geo_distance.GEOCODE_URL) == 2   # cached: no extra credits


def test_doubtful_matches_are_flagged(api, fake_geoapify):
    res = api.post("/customers/route-distance", json={**BODY, "destination_address": "NH 66"})
    assert res["sure"] is False and any("wasn't found exactly" in w for w in res["warnings"])   # low confidence
    assert any("matched in Goa, not Kerala" in w for w in res["warnings"])

    # Confident but only part of it matched: still not sure, so the form won't fill the km itself.
    res = api.post("/customers/route-distance", json={**BODY, "origin_address": "VOC Port"})
    assert res["sure"] is False and res["origin"]["match_type"] == "inner_part"
    assert any("\"VOC Port\" wasn't found exactly" in w and "Pharmacy" in w for w in res["warnings"])


def test_plain_errors(api, fake_geoapify, monkeypatch):
    res = api.post("/customers/route-distance", json={**BODY, "destination_address": "Nowhere Xyz"}, expect=422)
    assert "Couldn't find" in res["detail"]
    monkeypatch.setenv("GEOAPIFY_API_KEY", "")
    geo_distance._geocode_cached.cache_clear()
    res = api.post("/customers/route-distance", json=BODY, expect=422)
    assert "isn't set up yet" in res["detail"]


@pytest.mark.parametrize("role,ok", [("Commercial Manager", True), ("Accounts", True), ("Maintenance", False), ("Auditor", False)])
def test_roles_follow_our_customers(api_as, fake_geoapify, role, ok):
    api_as(role).post("/customers/route-distance", json=BODY, expect=200 if ok else 403)


PINS = {"origin_lat": 8.7642, "origin_lon": 78.1956, "destination_lat": 11.6643, "destination_lon": 78.146}


def test_pins_skip_the_address_lookup(api, fake_geoapify):
    """Pick on map: pinned ends are used as they are — exact, no lookup, 1 credit."""
    res = api.post("/customers/route-distance", json={**PINS, "origin_address": "Tuticorin Port", "destination_address": "Salem"})
    assert res["pinned"] is True and res["sure"] is True and res["warnings"] == []
    assert res["origin"]["kind"] == "pin" and res["origin"]["matched"].startswith("Pinned on map (8.76420")
    assert not [u for u, _ in fake_geoapify if u == geo_distance.GEOCODE_URL]
    route = next(p for u, p in fake_geoapify if u == geo_distance.ROUTING_URL)
    assert route["waypoints"] == "8.7642,78.1956|11.6643,78.146"
    assert res["line"] == [[13.09, 80.29], [11.0, 78.0], [11.0, 78.0], [9.93, 76.27]]   # [lat, lon] for the map


def test_one_end_pinned_one_looked_up(api, fake_geoapify):
    res = api.post("/customers/route-distance", json={"origin_lat": 8.7642, "origin_lon": 78.1956,
                                                      "destination_address": "Kochi", "destination_state": "KERALA"})
    assert res["pinned"] is False and res["sure"] is True and res["destination"]["matched"].startswith("Kochi")


def test_pin_outside_india_and_missing_ends(api, fake_geoapify):
    res = api.post("/customers/route-distance", json={**PINS, "origin_lat": 51.5, "origin_lon": -0.12}, expect=422)
    assert "outside India" in res["detail"]
    res = api.post("/customers/route-distance", json={"origin_address": "Chennai Port"}, expect=422)
    assert "pin them on the map" in res["detail"]


def test_place_search(api, fake_geoapify):
    found = api.get("/customers/place-search", params={"text": "Kochi", "state": "KERALA"})
    assert found and found[0]["label"].startswith("Kochi") and {"lat", "lon", "kind"} <= set(found[0])
    assert api.get("/customers/place-search", params={"text": "ab"}) == []          # too short: no credits spent


def test_route_keeps_its_pins(api, world):
    """The pins and where the km came from are saved on the customer route."""
    cid = world.customer["id"]
    body = {"destination_state": "TAMIL NADU", "destination_address": "Salem", "origin_address": "Tuticorin Port",
            "approx_distance_km": 367, "distance_source": "map", **PINS}
    route = api.post(f"/customers/{cid}/destinations", json=body)
    assert float(route["origin_lat"]) == 8.7642 and float(route["destination_lon"]) == 78.146
    assert route["distance_source"] == "map"
    api.post(f"/customers/{cid}/destinations", json={**body, "destination_address": "Erode", "distance_source": "guess"}, expect=422)


def test_pin_check_name_and_pin_agree_or_not(api, fake_geoapify):
    """Use these pins: warn when a pin is far from its typed address; trust pins
    whose name the map doesn't know; offer the map's name for an empty address."""
    near_kochi = {"origin_lat": 13.10, "origin_lon": 80.29, "destination_lat": 9.94, "destination_lon": 76.27}
    res = api.get("/customers/pin-check", params={**near_kochi, "origin_address": "Chennai Port", "origin_state": "TAMIL NADU",
                                                   "destination_address": "Kochi", "destination_state": "KERALA"})
    assert res["origin"]["status"] == "ok" and res["origin"]["km_apart"] < 2 and res["destination"]["status"] == "ok"

    # Destination typed as Kochi but pinned in Chennai: hundreds of km apart.
    res = api.get("/customers/pin-check", params={**near_kochi, "destination_lat": 13.0, "destination_lon": 80.2,
                                                   "origin_address": "Chennai Port", "destination_address": "Kochi"})
    assert res["destination"]["status"] == "far" and res["destination"]["km_apart"] > res["far_km"]

    # A name the map doesn't know (a CFS): nothing to compare, the pin is trusted.
    res = api.get("/customers/pin-check", params={**near_kochi, "origin_address": "AS CFS", "destination_address": "Kochi"})
    assert res["origin"] == {"status": "unchecked"}

    # Empty address: the map's name for the spot (no postcode), and its state.
    res = api.get("/customers/pin-check", params={**near_kochi, "destination_address": "Kochi"})
    assert res["origin"] == {"status": "empty", "suggestion": {"name": "Tuticorin Port, Harbour Estate, Thoothukudi", "state": "TAMIL NADU"}}
