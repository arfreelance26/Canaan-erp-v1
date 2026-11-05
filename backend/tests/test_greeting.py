"""Joshine's greeting: what the app tells the frontend about the caller's
last visit, birthday, work anniversary and festivals (routers/celebrations.py)."""
from datetime import date, datetime, timedelta

import models


def _greet(client, preview=None):
    return client.get("/celebrations/greeting", params={"preview": preview} if preview else None)


def test_last_visit_and_first_visit(api_as, db, staff):
    person = staff["Maintenance"]
    me = api_as("Maintenance")
    db.query(models.ActivityEvent).filter(models.ActivityEvent.user_id == person.id).delete()
    db.commit()
    first = _greet(me)
    assert first["first_visit"] is True and first["last_seen"] is None and first["away_days"] is None

    # A visit four days ago counts; this visit's own fresh activity doesn't.
    db.add(models.ActivityEvent(created_at=datetime.utcnow() - timedelta(days=4), user_key=f"staff:{person.id}",
                                user_name=person.name, user_id=person.id, kind="view", route="/"))
    db.add(models.ActivityEvent(created_at=datetime.utcnow(), user_key=f"staff:{person.id}",
                                user_name=person.name, user_id=person.id, kind="view", route="/"))
    db.commit()
    back = _greet(me)
    assert back["first_visit"] is False
    assert back["away_days"] in (3, 4, 5)  # IST date vs UTC clock at day edges


def test_birthday_and_work_anniversary_are_the_callers_own(api, db, staff):
    admin = db.get(models.Staff, staff["Admin"].id)  # the fixture's copy is detached
    old_dob, old_doj = admin.date_of_birth, admin.date_of_joining
    try:
        admin.date_of_birth = date(1990, 3, 14)
        admin.date_of_joining = date(2023, 3, 14)
        db.commit()
        api.put("/celebrations/switch", json={"key": "birthdays", "enabled": True})
        on_the_day = _greet(api, "2026-03-14")
        assert on_the_day["birthday"] is True and on_the_day["work_years"] == 3
        other_day = _greet(api, "2026-03-15")
        assert other_day["birthday"] is False and other_day["work_years"] is None
    finally:
        admin.date_of_birth, admin.date_of_joining = old_dob, old_doj
        db.commit()


def test_festivals_set_by_admin(api, api_as):
    api.put("/celebrations/festivals", json={"key": "nonsense", "enabled": True, "dates": []}, expect=400)
    api_as("Accounts").put("/celebrations/festivals", json={"key": "pongal", "enabled": True, "dates": []}, expect=403)

    saved = api.put("/celebrations/festivals", json={"key": "pongal", "enabled": True, "dates": ["2027-01-15"]})
    assert saved["dates"] == ["2027-01-15"] and saved["name"] == "Pongal"
    assert api.get("/celebrations")["festivals"]["pongal"]["dates"] == ["2027-01-15"]
    assert _greet(api, "2027-01-15")["festival"] == {"key": "pongal", "name": "Pongal"}

    api.put("/celebrations/festivals", json={"key": "pongal", "enabled": False, "dates": ["2027-01-15"]})
    assert _greet(api, "2027-01-15")["festival"] is None
    api.put("/celebrations/festivals", json={"key": "pongal", "enabled": True, "dates": []})


def test_christmas_and_new_year_come_from_the_season_switch(api):
    api.put("/celebrations/switch", json={"key": "season", "enabled": True})
    assert _greet(api, "2026-12-25")["festival"]["key"] == "christmas"
    assert _greet(api, "2027-01-01")["festival"]["key"] == "newyear"
    api.put("/celebrations/switch", json={"key": "season", "enabled": False})
    assert _greet(api, "2026-12-25")["festival"] is None
    api.put("/celebrations/switch", json={"key": "season", "enabled": True})


def test_preview_is_ignored_for_everyone_but_admin(api_as):
    assert _greet(api_as("Accounts"), "2026-12-25")["today"] != "2026-12-25" or date.today().isoformat() == "2026-12-25"


def test_admin_switches_tea_time_for_everyone(api, api_as):
    me = api_as("Accounts")
    assert me.get("/celebrations/tea-time") == {"enabled": True}
    api.put("/celebrations/switch", json={"key": "teatime", "enabled": False})
    assert me.get("/celebrations/tea-time") == {"enabled": False}
    assert api.get("/celebrations")["switches"]["teatime"] is False
    me.put("/celebrations/switch", json={"key": "teatime", "enabled": True}, expect=403)
    api.put("/celebrations/switch", json={"key": "teatime", "enabled": True})
    assert me.get("/celebrations/tea-time") == {"enabled": True}
