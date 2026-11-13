"""Notice Board (routers/notices.py): anyone posts, everyone reads; the author
edits or deletes, Admin deletes or pins anyone's; any emoji reaction; seen-by."""
import pytest

import routers.notices as notices

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
PDF = b"%PDF-1.4" + b"\x00" * 100


@pytest.fixture(autouse=True)
def roomy_daily_limit(monkeypatch):
    # The test database outlives one run; don't let earlier runs today count.
    monkeypatch.setattr(notices, "POSTS_PER_DAY", 100_000)


def _post(who, **body):
    return who.post("/notices", json={"body": "Diesel price changed today", **body})


def _ids(who):
    return {n["id"] for n in who.get("/notices")}


def test_everyone_posts_and_everyone_sees(api, api_as):
    mech, sheets = api_as("Maintenance"), api_as("Trip Sheet Register")
    n = _post(mech, title="Holiday", important=True)
    assert n["author_role"] == "Maintenance" and n["important"] and n["mine"] and n["can_edit"]
    for who in (api, sheets, api_as("Auditor"), api_as("Yard Supervisor")):
        assert n["id"] in _ids(who)
    other = next(x for x in sheets.get("/notices") if x["id"] == n["id"])
    assert not other["mine"] and not other["can_edit"] and not other["can_delete"]
    mech.delete(f"/notices/{n['id']}")


def test_empty_and_oversized_notices_are_refused(api_as):
    mech = api_as("Maintenance")
    mech.post("/notices", json={"body": "  "}, expect=400)
    mech.post("/notices", json={"body": "x" * (notices.MAX_BODY_CHARS + 1)}, expect=(413, 422))
    mech.post("/notices", json={"body": "ok", "expires_in_days": 3}, expect=422)
    n = mech.post("/notices", json={"body": "", "has_images": True})   # pictures follow
    mech.delete(f"/notices/{n['id']}")


def test_only_author_edits_and_admin_deletes_or_pins(api, api_as):
    mech, cm = api_as("Maintenance"), api_as("Commercial Manager")
    n = _post(mech)
    cm.patch(f"/notices/{n['id']}", json={"body": "hacked"}, expect=403)
    api.patch(f"/notices/{n['id']}", json={"body": "admin edit"}, expect=403)   # Admin deletes, doesn't rewrite
    edited = mech.patch(f"/notices/{n['id']}", json={"body": "Diesel ₹94.50 from today", "important": True})
    assert edited["body"].startswith("Diesel ₹94.50") and edited["edited_at"] and edited["important"]

    cm.put(f"/notices/{n['id']}/pin", json={"pinned": True}, expect=403)
    assert api.put(f"/notices/{n['id']}/pin", json={"pinned": True})["pinned"] is True
    assert mech.get("/notices")[0]["id"] == n["id"]          # pinned goes first

    cm.delete(f"/notices/{n['id']}", expect=403)
    api.delete(f"/notices/{n['id']}")                        # Admin removes anyone's
    assert n["id"] not in _ids(mech)
    mech.delete(f"/notices/{n['id']}", expect=404)


def test_any_emoji_reactions_toggle(api, api_as):
    mech, cm = api_as("Maintenance"), api_as("Commercial Manager")
    n = _post(mech)
    cm.put(f"/notices/{n['id']}/reactions", json={"emoji": "🔥"})
    cm.put(f"/notices/{n['id']}/reactions", json={"emoji": "👍"})
    out = api.put(f"/notices/{n['id']}/reactions", json={"emoji": "👍"})
    groups = {g["emoji"]: g for g in out["reactions"]}
    assert groups["👍"]["count"] == 2 and groups["🔥"]["count"] == 1 and groups["👍"]["mine"]
    out = cm.put(f"/notices/{n['id']}/reactions", json={"emoji": "🔥"})   # same again: taken back
    assert "🔥" not in {g["emoji"] for g in out["reactions"]}
    for bad in ("hello", "<b>", "", "a👍"):
        cm.put(f"/notices/{n['id']}/reactions", json={"emoji": bad}, expect=422)
    mech.delete(f"/notices/{n['id']}")


def test_seen_by_and_unseen(api, api_as):
    mech, cm = api_as("Maintenance"), api_as("Commercial Manager")
    n = _post(mech, important=True)
    assert n["id"] in {u["id"] for u in cm.get("/notices/unseen")}
    assert n["id"] not in {u["id"] for u in mech.get("/notices/unseen")}     # not my own
    cm.post("/notices/seen", json={"ids": [n["id"]]})
    cm.post("/notices/seen", json={"ids": [n["id"]]})                          # twice is fine
    assert n["id"] not in {u["id"] for u in cm.get("/notices/unseen")}
    names = [s["name"] for s in mech.get(f"/notices/{n['id']}/seen")]
    assert len(names) == 1
    assert api.get(f"/notices/{n['id']}/seen")                                 # Admin may look
    cm.get(f"/notices/{n['id']}/seen", expect=403)
    assert next(x for x in mech.get("/notices") if x["id"] == n["id"])["seen_count"] == 1
    mech.delete(f"/notices/{n['id']}")


def test_pictures(api_as):
    mech, cm = api_as("Maintenance"), api_as("Commercial Manager")
    n = _post(mech)
    img = mech.post(f"/notices/{n['id']}/images", files={"file": ("shot.png", PNG, "image/png")})
    assert img["mime"] == "image/png"
    assert cm.get(f"/notices/{n['id']}/images/{img['id']}").content == PNG      # everyone can view
    mech.post(f"/notices/{n['id']}/images", files={"file": ("x.pdf", PDF, "image/png")}, expect=415)
    cm.post(f"/notices/{n['id']}/images", files={"file": ("shot.png", PNG, "image/png")}, expect=403)
    for _ in range(notices.MAX_IMAGES - 1):
        mech.post(f"/notices/{n['id']}/images", files={"file": ("shot.png", PNG, "image/png")})
    mech.post(f"/notices/{n['id']}/images", files={"file": ("shot.png", PNG, "image/png")}, expect=400)
    mech.delete(f"/notices/{n['id']}/images/{img['id']}")
    mech.delete(f"/notices/{n['id']}")


def test_daily_post_limit(api_as, monkeypatch, db):
    from routers.notices import _posts_today
    mech = api_as("Maintenance")
    first = _post(mech)
    used = _posts_today(db, first["staff_id"])
    monkeypatch.setattr(notices, "POSTS_PER_DAY", used)
    mech.post("/notices", json={"body": "one more"}, expect=429)
    mech.delete(f"/notices/{first['id']}")


def test_expired_notices_disappear(api_as, db):
    from datetime import timedelta
    import models
    mech = api_as("Maintenance")
    n = _post(mech, expires_in_days=1)
    row = db.get(models.Notice, n["id"])
    row.expires_at = row.expires_at - timedelta(days=2)
    db.commit()
    assert n["id"] not in _ids(mech)
    mech.get(f"/notices/{n['id']}/seen", expect=404)
    _post(mech)                                          # posting sweeps expired ones away
    db.expire_all()
    assert db.get(models.Notice, n["id"]) is None
