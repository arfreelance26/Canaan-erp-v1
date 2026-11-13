"""Driver / Staff Attendance and the Attendance Report → View: the person-wise
attendance report (attendance_report.py, GET /exports/attendance-report[/preview])."""
from datetime import date, timedelta
from io import BytesIO

from openpyxl import load_workbook

from world import create_driver, create_staff

# A past week of its own: Mon 2024-06-03 … Sun 2024-06-09.
MON = date(2024, 6, 3)
SUN = MON + timedelta(days=6)


def _preview(api, category, search, start=MON, end=SUN):
    return api.get("/exports/attendance-report/preview", params={
        "category": category, "from_date": start.isoformat(), "to_date": end.isoformat(), "search": search})


def test_driver_counts_match_the_attendance_summary(api, db):
    import models
    d = create_driver(api)
    for i, status in enumerate(["On Trip", "On Trip", "On Halt", "Leave", "On Workshop"]):   # 2 days left unmarked
        db.add(models.DriverAttendance(driver_id=d["driver_id"], date=MON + timedelta(days=i), status=status))
    db.add(models.DriverAttendanceRemark(driver_id=d["driver_id"], date=MON, remark="Loaded late"))
    db.commit()

    out = _preview(api, "driver", d["driver_id"])
    rep = out["report"]
    (x,) = rep["people"]
    assert x["counts"] == {"On Trip": 2, "On Halt": 1, "On Workshop": 1, "Leave": 1, "Absent": 0, "Not Marked": 2}
    assert x["on_duty"] == 4 and x["days"] == 7 and x["rate"] == round(4 / 7 * 100, 1)
    assert x["rows"][0]["note"] == "Loaded late"
    app = {s["code"]: s for s in api.get("/attendance/summary", params={"category": "driver", "from": MON.isoformat(), "to": SUN.isoformat()})}
    a = app[d["driver_id"]]
    assert (a["on_trip"], a["on_halt"], a["leave"], a["on_workshop"], a["not_marked"]) == (2, 1, 1, 1, 2)
    assert [s["name"] for s in out["sheets"]] == ["Summary", "Register", d["name"]]


def test_staff_working_days_skip_sundays_and_holidays(api, db):
    import models
    s = create_staff(api)
    db.add(models.Holiday(date=MON + timedelta(days=2), name="Pytest Holiday", type="Company"))   # Wednesday
    for i in (0, 1):
        db.add(models.StaffAttendance(staff_id=s["id"], staff_name=s["name"], date=MON + timedelta(days=i), status="Present",
                                      check_in_time="09:00 AM", check_out_time="06:30 PM"))
    db.add(models.StaffAttendance(staff_id=s["id"], staff_name=s["name"], date=MON + timedelta(days=3), status="Present",
                                  check_in_time="10:00 AM", check_out_time="11:44 PM", auto_closed=True))
    db.add(models.StaffAttendance(staff_id=s["id"], staff_name=s["name"], date=SUN, status="Present",
                                  check_in_time="10:00 AM", check_out_time="12:00 PM"))   # worked a Sunday
    db.commit()
    try:
        rep = _preview(api, "staff", s["staff_id"])["report"]
        assert rep["counted_days"] == 5          # 7 days − Sunday − the holiday
        (x,) = rep["people"]
        assert x["counts"]["Present"] == 4       # the Sunday worked still counts, as on the Attendance Report
        # The app's rule: working days (5) minus days marked (4, the Sunday included) = 1.
        assert x["counts"]["Not Marked"] == 1
        assert x["hours"] == 21.0                # 9.5 + 9.5 + 2.0 — the shift closed automatically gives no hours
        assert x["auto_closed"] == 1
        app = {r["code"]: r for r in api.get("/attendance/summary", params={"category": "staff", "from": MON.isoformat(), "to": SUN.isoformat()})}
        assert (app[s["staff_id"]]["present"], app[s["staff_id"]]["not_marked"]) == (4, 1)
        wed = x["rows"][2]
        assert wed["status"] == "Holiday" and wed["off"]
    finally:
        db.query(models.Holiday).filter(models.Holiday.name == "Pytest Holiday").delete()
        db.commit()


def test_workbook_register_and_links(api, db, client, auth):
    import models
    d = create_driver(api)
    db.add(models.DriverAttendance(driver_id=d["driver_id"], date=MON, status="On Trip"))
    db.commit()
    res = client.get("/exports/attendance-report", params={
        "category": "driver", "from_date": MON.isoformat(), "to_date": SUN.isoformat(), "search": d["driver_id"]},
        headers=auth("Admin"))
    assert res.status_code == 200
    wb = load_workbook(BytesIO(res.content))
    assert wb.sheetnames == ["Summary", "Register", d["name"][:31]]
    reg = wb["Register"]
    row = next(r for r in reg.iter_rows() if r[0].value == d["name"])
    assert row[1].value == "T" and row[0].hyperlink.location == f"'{d['name'][:31]}'!A1"
    assert wb[d["name"][:31]]["H1"].hyperlink.location == "'Summary'!A1"


def test_bad_requests(api):
    api.get("/exports/attendance-report/preview", params={"category": "nobody", "from_date": "2024-06-01", "to_date": "2024-06-02"}, expect=400)
    api.get("/exports/attendance-report/preview", params={"category": "driver"}, expect=400)
    api.get("/exports/attendance-report/preview", params={"category": "driver", "from_date": "2020-01-01", "to_date": "2024-01-01"}, expect=400)
