"""Attendance: drivers (mark/edit, remarks, late-entry log), staff (Admin
marking, self check-in, close/resume shift, monthly summary), holidays and
leave requests."""
import secrets
from datetime import date, timedelta

from world import create_driver, create_staff

TODAY = date.today()


def _day(offset):
    return (TODAY - timedelta(days=offset)).isoformat()


def test_driver_attendance_and_remarks(api, api_as):
    cm = api_as("Commercial Manager")
    driver = create_driver(api)
    rec = cm.post("/attendance/drivers", json={"driver_id": driver["driver_id"], "date": _day(1), "status": "Present"})
    assert cm.put(f"/attendance/drivers/{rec['id']}", json={"status": "On Trip"})["status"] == "On Trip"
    api_as("Accounts").post("/attendance/drivers", json={
        "driver_id": driver["driver_id"], "date": _day(2), "status": "Present"}, expect=403)

    remark = cm.post("/attendance/drivers/remarks", json={
        "driver_id": driver["driver_id"], "date": _day(1), "remark": "Came late"})
    assert cm.put(f"/attendance/drivers/remarks/{remark['id']}", json={"remark": "Came 1h late"})["remark"] == "Came 1h late"
    cm.delete(f"/attendance/drivers/remarks/{remark['id']}")
    cm.post("/attendance/drivers/late-entry-log", json={"date": _day(1), "remark": "Marked late — network down"})


def test_staff_attendance_by_admin(api):
    person = create_staff(api)
    rec = api.post("/attendance/staff", json={"staff_id": person["id"], "date": _day(1), "status": "Present"})
    assert api.put(f"/attendance/staff/{rec['id']}", json={"status": "Absent"})["status"] == "Absent"


def test_self_check_in_close_and_resume(api, client):
    from conftest import Api, headers_for
    import models
    from database import SessionLocal
    person = create_staff(api)
    s = SessionLocal()
    me = Api(client, headers_for(s.get(models.Staff, person["id"])))
    s.close()

    me.post("/attendance/staff/self-mark", json={"staff_id": person["id"] + 100000, "status": "Present"}, expect=403)
    me.post("/attendance/staff/self-mark", json={"staff_id": person["id"], "status": "Present"})
    me.post("/attendance/staff/self-mark", json={"staff_id": person["id"], "status": "Present"}, expect=400)
    api.post("/attendance/staff/close-shift", params={"staff_id": person["id"]})        # Admin closes for them…
    assert api.post("/attendance/staff/resume-shift", params={"staff_id": person["id"]})["check_out_time"] is None  # …so it can resume
    me.post("/attendance/staff/close-shift", params={"staff_id": person["id"]})           # own close is final
    me.post("/attendance/staff/resume-shift", params={"staff_id": person["id"]}, expect=400)
    summary = me.get("/attendance/staff/self-summary", params={"staff_id": person["id"], "year": TODAY.year, "month": TODAY.month})
    assert summary


def test_summaries(api):
    for category in ("driver", "staff"):
        api.get("/attendance/summary", params={"category": category, "from": _day(30), "to": _day(0)})
        api.get("/attendance/latest-date", params={"category": category})
    api.get("/attendance/summary", params={"category": "truck", "from": _day(1), "to": _day(0)}, expect=400)


def test_holidays_admin_only(api, api_as):
    day = (TODAY + timedelta(days=200 + secrets.randbelow(100))).isoformat()
    api_as("Accounts").post("/attendance/holidays", json={"date": day, "name": "Pytest Day"}, expect=403)
    holiday = api.post("/attendance/holidays", json={"date": day, "name": "Pytest Day", "type": "Company"})
    api.delete(f"/attendance/holidays/{holiday['id']}")


def test_leave_requests(api, world):
    driver = world.driver2
    assert api.get("/attendance/lookup-applicant", params={"code": driver["driver_id"]})["applicant_name"] == driver["name"]
    body = {"category": "Driver", "applicant_id": driver["id"], "applicant_name": driver["name"],
            "applicant_code": driver["driver_id"], "reason": "Family function"}
    api.post("/attendance/leave-requests", json={**body, "from_date": _day(0), "to_date": _day(2)}, expect=400)
    leave = api.post("/attendance/leave-requests", json={**body, "from_date": _day(-10), "to_date": _day(-11)})
    assert api.get(f"/attendance/leave-requests/{leave['id']}")["id"] == leave["id"]
    assert api.patch(f"/attendance/leave-requests/{leave['id']}/approve", json={})["status"] == "Approved"
    other = api.post("/attendance/leave-requests", json={**body, "from_date": _day(-20), "to_date": _day(-20)})
    assert api.patch(f"/attendance/leave-requests/{other['id']}/reject", json={"admin_note": "Busy week"})["status"] == "Rejected"
