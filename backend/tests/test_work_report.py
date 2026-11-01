"""Staff Work Report: only real, successful work counts, staff by staff, and any
day's report survives the activity log's purge and a deleted staff record."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from openpyxl import load_workbook

import models
import work_report
from world import complete_and_close, fresh_trip, tag

IST = ZoneInfo("Asia/Kolkata")


def today():
    return datetime.now(IST).date()


def report(api, day=None):
    return api.get("/activity/work-report", params={"day": (day or today()).isoformat()})


def person(rep, name):
    return next(p for p in rep["staff"] if p["name"] == name)


def closed(api, world):
    trip = fresh_trip(api, world)
    complete_and_close(api, trip)
    return trip


SHEET = {"trip_sheet_date": date.today().isoformat(), "start_km": 1000, "end_km": 1040, "hire_amount": 12000}


def test_every_save_route_is_marked_work_or_not_work(app):
    missing = []
    for route in app.routes:
        for method in getattr(route, "methods", None) or []:
            key = f"{method} {route.path}"
            if method in ("POST", "PUT", "PATCH", "DELETE") and key not in work_report.WORK and key not in work_report.NOT_WORK:
                missing.append(key)
    assert not missing, f"Add these to WORK or NOT_WORK in work_report.py: {missing}"
    assert not set(work_report.WORK) & work_report.NOT_WORK


def test_only_real_successful_work_counts(api, api_as, world, staff):
    trip = closed(api, world)
    role, name = "Trip Sheet Register", staff["Trip Sheet Register"].name
    tsr = api_as(role)
    before = next((p["work_count"] for p in report(api)["staff"] if p["name"] == name), 0) if _has_report(api) else 0

    body = {"trip_sheet_no": f"TS-{trip['trip_id']}", **SHEET}
    tsr.post("/trips/999999/sheet", json=body, expect=404)             # failed: not work
    tsr.post(f"/trips/{trip['id']}/sheet", json=body)                  # work
    tsr.post(f"/trips/{trip['id']}/sheet", json=body)                  # saved again: counts once
    tsr.post("/notes", json={"title": "Not work", "body": "x"}, expect=(200, 201, 422))
    tsr.get("/trucks")                                                 # reading: not work

    me = person(report(api), name)
    assert me["work_count"] == before + 1
    assert any(d["work"] == "Trip sheet entered" and d["record"] == trip["trip_id"] for d in me["details"])
    assert not [d for d in me["details"] if "note" in d["work"].lower()]


def _has_report(api):
    return api.client.get("/activity/work-report", params={"day": today().isoformat()}, headers=api.headers).status_code == 200


def test_a_new_record_is_named_from_the_reply_and_the_reply_is_untouched(api, api_as, world, staff):
    name = f"PT Work Customer {tag()}"
    made = api_as("Commercial Manager").post("/customers", json={"name": name, "customer_type": "Shipping"})
    assert made["name"] == name  # the reply still reaches the browser whole
    me = person(report(api), staff["Commercial Manager"].name)
    assert any(d["work"] == "Customer added" and d["record"] == name for d in me["details"])


def test_admins_are_in_the_report(api, world, staff):
    trip = fresh_trip(api, world)
    me = person(report(api), staff["Admin"].name)
    assert me["role"] == "Admin"
    assert any(d["work"] == "Trip booked" and d["record"] == trip["trip_id"] for d in me["details"])
    assert report(api)["staff"][0]["role"] == "Admin"  # Admins first, then the other roles


def test_a_login_with_no_staff_record_is_left_out(api, db):
    day = date(2024, 2, 6)
    db.add(models.WorkItem(day=day, created_at=datetime(2024, 2, 6, 6, 0), user_key="admin", user_name="No Staff Record",
                           role="Accounts", work="Trip verified", work_group="Accounts", route="POST /x"))
    db.commit()
    assert not any(p["name"] == "No Staff Record" for p in (work_report.build(db, day) or {"staff": []})["staff"])


def test_report_is_admin_only_and_empty_days_say_so(api, api_as):
    params = {"day": today().isoformat()}
    api_as("Accounts").get("/activity/work-report", params=params, expect=403)
    api_as("Accounts").get("/activity/work-report/export", params=params, expect=403)
    api.get("/activity/work-report", params={"day": "2001-01-01"}, expect=404)
    api.get("/activity/work-report", params={"day": "not-a-date"}, expect=400)


def test_excel_is_staff_by_staff(api, api_as, world, staff):
    api_as("Commercial Manager").post("/customers", json={"name": f"PT Excel {tag()}", "customer_type": "Shipping"})
    wb = load_workbook(BytesIO(api.get("/activity/work-report/export", params={"day": today().isoformat()}).content))
    name = staff["Commercial Manager"].name
    assert wb.sheetnames[0] == "Summary" and name in wb.sheetnames
    sheet = wb[name]
    assert sheet["A2"].value.startswith(name)
    assert "Work done" in [c.value for c in sheet["A"]] and "Quiet gaps" in [c.value for c in sheet["A"]]

    me = str(staff["Commercial Manager"].id)
    one = load_workbook(BytesIO(api.get("/activity/work-report/export", params={"day": today().isoformat(), "employee": me}).content))
    assert one.sheetnames == ["Summary", name]


def test_a_saved_day_survives_purge_correction_and_a_deleted_employee(api, db):
    day = date(2024, 3, 5)
    key, name = f"9{tag()[:5]}".lower(), f"Pytest Leaver {tag()}"
    created = datetime(2024, 3, 5, 6, 0)  # 11:30 AM IST
    db.add(models.WorkDayStaff(day=day, user_key=key, user_name=name, role="Accounts", status="Present",
                               check_in="09:00 AM", check_out="06:00 PM", active_seconds=3 * 3600))
    db.add(models.WorkItem(day=day, created_at=created, user_key=key, user_name=name, role="Accounts",
                           work="Invoice generated", work_group="Accounts", record="TRP-1", route="POST /x"))
    db.commit()

    rep = report(api, day)
    me = person(rep, name)
    assert rep["saved"] is True and rep["live"] is False
    assert me["marked_minutes"] == 540 and me["active_minutes"] == 180 and me["work_count"] == 1
    assert me["longest_gap_minutes"] == 390 and len(me["gaps"]) == 2  # 11:30 AM to 6:00 PM
    assert "33%" in me["summary"] and "invoice generated (1)" in me["summary"]


def test_save_days_catches_up_and_never_duplicates(api, world, db, staff):
    day = date(2024, 4, 9)
    work_report.save_day(db, day)
    work_report.save_day(db, day)  # a second worker doing the same
    db.expire_all()
    keys = [r.user_key for r in db.query(models.WorkDayStaff).filter_by(day=day)]
    assert keys and len(keys) == len(set(keys))
    assert work_report.save_due_days(db, work_report._now_ist().date()) >= 0


def test_backfill_rebuilds_old_days_once_without_failures(db):
    db.query(models.AppSetting).filter_by(key=work_report.BACKFILL_DONE_KEY).delete()
    db.commit()
    key = f"7{tag()[:5]}".lower()
    when = datetime(2020, 5, 7, 8, 0)  # before every live row: only older events are rebuilt
    common = dict(created_at=when, user_key=key, user_name="Pytest Old", role="Accounts", kind="save", method="POST")
    db.add(models.ActivityEvent(route="/trips/{id}/verify", status=200, **common))
    db.add(models.ActivityEvent(route="/trips/{id}/verify", status=400, **common))     # failed
    db.add(models.ActivityEvent(route="/notes", status=200, **common))                 # not work
    db.commit()
    work_report.backfill(db)
    work_report.backfill(db)
    rows = db.query(models.WorkItem).filter_by(user_key=key).all()
    assert [(r.work, r.record, r.day) for r in rows] == [("Trip verified", None, date(2020, 5, 7))]


def _item(minute, work="Trip sheet entered", record="TRP-1"):
    return SimpleNamespace(created_at=datetime(2026, 1, 1, 10, minute), work=work, record=record)


def test_repeats_merge_only_for_the_same_record_close_together():
    assert len(work_report.merge_repeats([_item(0), _item(5), _item(9)])) == 1
    assert len(work_report.merge_repeats([_item(0), _item(30)])) == 2
    assert len(work_report.merge_repeats([_item(0), _item(5, record="TRP-2")])) == 2
    assert len(work_report.merge_repeats([_item(0, record=None), _item(1, record=None)])) == 2  # older days can't tell


def test_quiet_gaps():
    t = lambda h, m=0: datetime(1900, 1, 1, h, m)
    gaps = work_report.quiet_gaps([t(10), t(10, 30), t(14, 10)], t(9, 30), t(18, 30))
    assert [(g["from"], g["to"], g["minutes"]) for g in gaps] == [("10:30 AM", "02:10 PM", 220), ("02:10 PM", "06:30 PM", 260)]
    assert work_report.quiet_gaps([t(10)], t(9, 30), t(10, 29)) == []       # under an hour
    assert work_report.quiet_gaps([], None, None) == []                     # no shift, nothing to measure


@pytest.mark.parametrize("status, expected", [("On Leave", "was on leave"), ("Absent", "was marked absent")])
def test_summary_for_days_off(status, expected):
    p = {"name": "Ravi", "status": status, "work_count": 0, "work_done": [], "marked_minutes": None,
         "shift_in": None, "shift_out": None, "active_minutes": 0, "gaps": []}
    assert expected in work_report.summary_text(p)


def test_summary_stays_factual():
    p = {"name": "Ravi", "status": "Present", "work_count": 14, "work_done": [{"work": "Tyre fitted", "count": 9}],
         "marked_minutes": 540, "shift_in": "09:30 AM", "shift_out": "06:30 PM", "active_minutes": 190,
         "gaps": [{"from": "x", "to": "y", "minutes": 160}]}
    text = work_report.summary_text(p)
    assert text == ("Ravi marked 9h 00m (09:30 AM to 06:30 PM) and was active in the software for 3h 10m (35%). "
                    "They completed 14 work items, mostly tyre fitted (9). "
                    "There was 1 quiet gap of 1 hour or more; the longest was 2h 40m.")


def test_opening_a_report_rebuilds_older_days_itself(api, db):
    db.query(models.AppSetting).filter_by(key=work_report.BACKFILL_DONE_KEY).delete()
    db.commit()
    key, name, when = f"6{tag()[:5]}".lower(), f"Pytest Rebuilt {tag()}", datetime(2019, 6, 4, 8, 0)
    db.add(models.ActivityEvent(route="/trips/{id}/invoice", status=200, created_at=when, user_key=key, user_name=name,
                                role="Accounts", kind="save", method="POST"))
    db.commit()
    rep = report(api, date(2019, 6, 4))
    assert rep["limited"] is True and person(rep, name)["work_count"] == 1
    assert api.client.get("/activity/work-report", params={"day": "2019-06-05"}, headers=api.headers).status_code == 404
