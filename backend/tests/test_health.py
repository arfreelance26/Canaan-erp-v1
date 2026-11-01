"""GET / — the public health check the Topbar's internet status pill pings
every 10s (3s while its panel is open) to measure the server reply time."""


def test_health_check_is_public_and_tiny(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert len(res.content) < 200


def test_health_check_is_not_logged_as_activity(client, monkeypatch):
    import activity_tracker
    calls = []
    monkeypatch.setattr(activity_tracker, "record_request", lambda *a, **k: calls.append(a))
    client.get("/")
    assert calls == []


def test_unexpected_error_reaches_the_browser_with_a_reference(plain_client, auth, monkeypatch, caplog):
    import re
    import main
    monkeypatch.setattr("routers.trips.audit_verified_rows", lambda db: 1 / 0)
    origin = main._cors_origins[0] if main._cors_origins[0] != "*" else "https://erp.example.test"
    res = plain_client.get("/trips/audit-verified", headers={**auth("Admin"), "Origin": origin})

    assert res.status_code == 500
    assert res.headers.get("access-control-allow-origin") in (origin, "*")  # or the browser hides this reply
    assert res.headers.get("x-content-type-options") == "nosniff"
    body = res.json()
    assert re.fullmatch(r"ERR-[0-9A-F]{4}", body["reference"])
    assert body["reference"] in body["detail"] and "division" not in body["detail"]  # no internals leaked
    assert body["reference"] in caplog.text  # the same code finds the error in the server log
