"""Pending Audit / Audit Flagged / Audit Verified → View: the Audit Outcomes
reports (audit_report.py through approvals_report.py, GET /exports/approvals-report)."""
from datetime import datetime, timedelta, timezone
from io import BytesIO

from openpyxl import load_workbook

from world import sheeted_trip


def _trip(api, world, db, hire, expense, **trip_fields):
    import models
    t = sheeted_trip(api, world)
    row = db.get(models.Trip, t["id"])
    for k, v in trip_fields.items():
        setattr(row, k, v)
    s = db.query(models.TripSheet).filter_by(trip_id=t["id"]).one()
    s.hire_amount, s.total_expense = hire, expense
    db.commit()
    return t


def _preview(who, kind, **params):
    return who.get("/exports/approvals-report/preview", params={"kind": kind, **params})


def test_pending_matches_the_page_and_groups_by_driver(api, world, db):
    from routers.trips import pending_audit_rows
    t = _trip(api, world, db, 30_000, 8_000, verification_status="verified")
    rep = _preview(api, "pending", search=t["trip_id"])["report"]
    (g,) = rep["groups"]
    (row,) = g["rows"]
    assert row["trip"] == t["trip_id"] and row["hire"] == 30_000 and row["summary"] == 22_000
    assert row["waited"] is not None and row["status"] in ("Up to 7 days", "8–30 days", "Over 30 days")
    assert g["cost"] == 30_000
    everything = _preview(api, "pending")["report"]
    assert everything["total"] == len(pending_audit_rows(db))       # the same list as the Pending Audit page


def test_flagged_by_status_with_flag_and_return(api, world, db):
    import models
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    a = _trip(api, world, db, 10_000, 1_000, flagged_for_recheck=True, flagged_remark="Diesel bill missing")
    b = _trip(api, world, db, 20_000, 2_000, flagged_for_recheck=True, flagged_remark="Wrong km", recheck_returned=True)
    db.add_all([
        models.TripRecheckEvent(trip_id=a["id"], event="Flagged", remark="Diesel bill missing", actor_name="Aud", created_at=now - timedelta(days=5)),
        models.TripRecheckEvent(trip_id=b["id"], event="Flagged", remark="Wrong km", actor_name="Aud", created_at=now - timedelta(days=3)),
        models.TripRecheckEvent(trip_id=b["id"], event="Returned for Review", remark="Fixed", actor_name="Acc", created_at=now - timedelta(days=1)),
    ])
    db.commit()
    rows = {}
    for tid in (a["trip_id"], b["trip_id"]):
        r = _preview(api, "flagged", search=tid)["report"]
        rows[tid] = r["groups"][0]["rows"][0] | {"group": r["groups"][0]["key"]}
    assert rows[a["trip_id"]]["group"] == "Under review" and rows[a["trip_id"]]["days_open"] == 5
    assert rows[b["trip_id"]]["group"] == "Returned — awaiting Auditor"
    assert rows[b["trip_id"]]["returned_by"] == "Acc" and rows[b["trip_id"]]["return_note"] == "Fixed"


def test_verified_marks_disputed_first(api, world, db):
    import models
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    t = _trip(api, world, db, 40_000, 9_000, audit_verified=True)
    db.add_all([
        models.TripRecheckEvent(trip_id=t["id"], event="Flagged", remark="x", actor_name="Aud", created_at=now - timedelta(hours=5)),
        models.TripRecheckEvent(trip_id=t["id"], event="Verified", remark="ok now", actor_name="Aud", actor_role="Auditor", created_at=now - timedelta(hours=1)),
    ])
    db.commit()
    rep = _preview(api, "verified", search=t["trip_id"])["report"]
    (row,) = rep["groups"][0]["rows"]
    assert row["status"] == "Disputed first" and row["note"] == "ok now" and row["hire"] == 40_000


def test_access_and_workbook(api, api_as, world, db, client, auth):
    _trip(api, world, db, 5_000, 500, verification_status="verified")
    _preview(api_as("Accounts"), "pending")
    _preview(api_as("Trip Sheet Register"), "verified")
    api_as("Maintenance").get("/exports/approvals-report/preview", params={"kind": "pending"}, expect=403)
    api_as("Yard Supervisor").get("/exports/approvals-report/preview", params={"kind": "flagged"}, expect=403)
    res = client.get("/exports/approvals-report", params={"kind": "pending"}, headers=auth("Admin"))
    wb = load_workbook(BytesIO(res.content))
    assert wb.sheetnames[0] == "Summary" and len(wb.sheetnames) >= 2
    first_driver = wb.sheetnames[1]
    links = {c.value: c.hyperlink.location for c in wb["Summary"]["A"] if c.hyperlink}
    assert f"'{first_driver}'!A1" in links.values()
    text = " ".join(str(c.value) for ws in wb for row in ws.iter_rows() for c in row if isinstance(c.value, str)).lower()
    assert "per km" not in text
