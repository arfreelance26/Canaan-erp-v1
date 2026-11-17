"""Geoapify kept cheap and spam-proof (geo_usage.py): a lasting cache, a daily
budget for the whole app, an hourly limit per person, and Admin's usage line.
Geoapify is faked — no key, no credits, no network."""
import pytest

import geo_distance
import geo_usage


def _clear_geo_tables():
    import database, models
    db = database.SessionLocal()
    db.query(models.GeoCache).delete()
    db.query(models.GeoUsage).delete()
    db.commit()
    db.close()


@pytest.fixture
def fake(monkeypatch):
    calls = []

    def fake_get(url, params):
        calls.append(url)
        if url == geo_distance.ROUTING_URL:
            return {"features": [{"properties": {"distance": 367_400, "time": 30_000}, "geometry": {"type": "LineString", "coordinates": []}}]}
        return {"results": []}

    monkeypatch.setenv("GEOAPIFY_API_KEY", "test-key")
    monkeypatch.setattr(geo_distance, "_get_json", fake_get)
    _clear_geo_tables()
    yield calls
    _clear_geo_tables()


PINS = {"origin_lat": 8.7642, "origin_lon": 78.1956, "destination_lat": 11.6643, "destination_lon": 78.146}


def test_the_same_question_is_paid_for_once(api, fake):
    """Answers are kept in the database: a repeat (even after a restart) costs nothing."""
    api.post("/customers/route-distance", json=PINS)
    api.post("/customers/route-distance", json=PINS)
    assert fake.count(geo_distance.ROUTING_URL) == 1
    usage = api.get("/customers/geo-usage")
    assert usage["used"] == 1 and usage["cached_answers"] >= 1 and usage["budget"] == geo_usage.DAILY_CREDITS


def test_the_daily_budget(api, fake, monkeypatch):
    monkeypatch.setattr(geo_usage, "DAILY_CREDITS", 2)
    api.post("/customers/route-distance", json=PINS)
    api.post("/customers/route-distance", json={**PINS, "destination_lat": 11.0})
    res = api.post("/customers/route-distance", json={**PINS, "destination_lat": 10.0}, expect=422)
    assert "Today's road-distance limit is reached" in res["detail"]
    assert len(fake) == 2                                   # the third was never sent


def test_one_persons_hourly_limit(api, api_as, fake, monkeypatch):
    monkeypatch.setattr(geo_usage, "HOURLY_CREDITS", 1)
    cm = api_as("Commercial Manager")
    cm.post("/customers/route-distance", json=PINS)
    res = cm.post("/customers/route-distance", json={**PINS, "destination_lat": 11.0}, expect=422)
    assert "a lot in the last hour" in res["detail"]
    # Someone else isn't held up by it.
    api_as("Accounts").post("/customers/route-distance", json={**PINS, "destination_lat": 11.0})
    by = {p["name"]: p["credits"] for p in api.get("/customers/geo-usage")["by_person"]}
    assert sum(by.values()) == 2 and len(by) == 2


def test_usage_line_is_admin_only(api_as, fake):
    for role in ("Commercial Manager", "Accounts", "Trip Sheet Register"):
        api_as(role).get("/customers/geo-usage", expect=403)
