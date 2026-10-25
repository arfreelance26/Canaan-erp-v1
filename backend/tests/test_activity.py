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
    ("GET", "/exports/trips", "export"),          # an Excel download is a GET, but counts as an export
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
