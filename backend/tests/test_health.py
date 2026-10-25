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
