"""Activity Log: how requests are classified, and the Events list's count."""
import pytest

import activity_tracker


@pytest.fixture()
def captured(monkeypatch):
    rows = []
    monkeypatch.setattr(activity_tracker, "_push", rows.append)
    return rows


@pytest.fixture()
def token(staff):
    from conftest import headers_for
    return headers_for(staff["Accounts"])["Authorization"]


@pytest.mark.parametrize("method,path,kind", [
    ("GET", "/exports/trip-report", "export"),          # an Excel download is a GET, but counts as an export
    ("GET", "/maintenance/records/export", "export"),
    ("POST", "/trucks", "save"),
    ("PUT", "/trucks/4", "save"),
    ("DELETE", "/trucks/4", "delete"),
    ("POST", "/tyre-fitment/remove-bulk", "delete"),
    ("POST", "/auth/logout", "logout"),
])
def test_request_kinds(captured, token, method, path, kind):
    activity_tracker.record_request(method, path, 200, 12.0, token, "127.0.0.1")
    assert [r["kind"] for r in captured] == [kind]


def test_plain_reads_are_counted_not_logged_one_by_one(captured, token):
    activity_tracker.record_request("GET", "/trucks", 200, 5.0, token, None)
    assert captured == []


def test_logins_and_anonymous_requests_are_ignored(captured, token):
    activity_tracker.record_request("POST", "/auth/login", 200, 5.0, token, None)
    activity_tracker.record_request("POST", "/trucks", 200, 5.0, None, None)
    assert captured == []


def test_route_template_groups_ids():
    assert activity_tracker.route_template("/trips/1438/invoice") == "/trips/{id}/invoice"


def test_events_count_is_admin_only(client, auth):
    res = client.get("/activity/events/count", headers=auth("Admin"))
    assert res.status_code == 200 and isinstance(res.json()["total"], int)
    assert client.get("/activity/events/count", headers=auth("Accounts")).status_code == 403


def test_presence_for_the_invite_dialog(api, api_as, db):
    """Active = did something in the last 5 minutes, idle = only a page open,
    offline = last seen earlier; the Activity Log's "Online now" agrees."""
    import models
    from datetime import datetime, timedelta
    from world import create_staff

    active, idle, earlier, never = (create_staff(api) for _ in range(4))
    now = datetime.utcnow()
    seen = lambda p, at, kind="view", route="/trips/history": models.ActivityEvent(
        created_at=at, user_key=str(p["id"]), user_name=p["name"], role="Accounts", kind=kind, method="GET", route=route)
    db.add(seen(active, now - timedelta(minutes=1)))
    db.add(seen(idle, now - timedelta(hours=1)))  # a page opened earlier today, still refreshing itself
    db.add(models.ActivityMinute(user_key=str(idle["id"]), route="/trips", minute=now.replace(second=0, microsecond=0),
                                 user_name=idle["name"], count=3, first_at=now, last_at=now))
    db.add(seen(earlier, now - timedelta(hours=2), kind="save", route="/trucks"))
    group = models.ChatConversation(kind="group", title="Pytest Presence Group")
    db.add(group)
    db.flush()
    for p in (active, idle, earlier, never):
        db.add(models.ChatParticipant(conversation_id=group.id, staff_id=p["id"]))
    db.commit()

    got = api.get("/activity/presence")
    status = lambda p: got["people"][str(p["id"])]
    assert status(active)["status"] == "active" and status(active)["screen"] == "/trips/history"
    assert status(idle)["status"] == "idle"
    assert status(earlier)["status"] == "offline" and status(earlier)["last_at"]
    assert status(never) == {"status": "offline", "screen": None, "last_at": None}
    assert got["groups"][str(group.id)] == 2

    online = {o["user_name"]: o["status"] for o in api.get("/activity/overview")["online"]}
    assert online.get(active["name"]) == "active" and online.get(idle["name"]) == "idle"
    assert earlier["name"] not in online and never["name"] not in online
    api_as("Accounts").get("/activity/presence", expect=403)
