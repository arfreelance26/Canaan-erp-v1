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
    marking = {"driver_id": driver["driver_id"], "date": _day(1), "status": "Present"}
    cm.post("/attendance/drivers", json=marking, expect=400)  # no vehicle type chosen
    rec = cm.post("/attendance/drivers", json={**marking, "container_specification": "20 FT CONTAINER"})
    cm.put(f"/attendance/drivers/{rec['id']}", json={"status": "On Trip"}, expect=400)
    updated = cm.put(f"/attendance/drivers/{rec['id']}", json={"status": "On Trip", "container_specification": "40 FT CONTAINER"})
    assert updated["status"] == "On Trip" and updated["container_specification"] == "40 FT CONTAINER"
    api_as("Accounts").post("/attendance/drivers", json={
        "driver_id": driver["driver_id"], "date": _day(2), "status": "Present"}, expect=403)

    remark = cm.post("/attendance/drivers/remarks", json={
        "driver_id": driver["driver_id"], "date": _day(1), "remark": "Came late"})
    assert cm.put(f"/attendance/drivers/remarks/{remark['id']}", json={"remark": "Came 1h late"})["remark"] == "Came 1h late"
    cm.delete(f"/attendance/drivers/remarks/{remark['id']}")
    cm.post("/attendance/drivers/late-entry-log", json={"date": _day(1), "remark": "Marked late — network down"})


def test_workshop_advance_saved_and_shown_in_record(api, api_as):
    cm = api_as("Commercial Manager")
    driver = create_driver(api)
    record_of = lambda: api.get("/finance/compensation/workshop-advance", params={"driver_id": driver["driver_id"]})["rows"]
    day = {"driver_id": driver["driver_id"], "date": _day(0), "status": "On Workshop"}

    cm.post("/attendance/drivers", json=day, expect=400)  # no amount
    cm.post("/attendance/drivers", json={**day, "workshop_advance": -1}, expect=400)
    cm.post("/attendance/drivers", json={**day, "workshop_advance": 500.01}, expect=400)  # above the max
    assert record_of() == []

    rec = cm.post("/attendance/drivers", json={**day, "workshop_advance": 0})  # no advance paid: not in the record
    assert rec["workshop_advance"] == 0 and record_of() == []
    rec = cm.put(f"/attendance/drivers/{rec['id']}", json={"status": "On Workshop", "workshop_advance": 450.5})
    assert rec["workshop_advance"] == 450.5
    assert [(r["date"], r["amount"], r["note"]) for r in record_of()] == [(_day(0), 450.5, None)]
    assert api.get("/attendance/drivers", params={"driver_id": driver["driver_id"]})[0]["workshop_advance"] == 450.5

    cm.put(f"/attendance/drivers/{rec['id']}", json={"status": "On Workshop"}, expect=400)
    assert record_of()[0]["amount"] == 450.5  # a refused change keeps the amount

    # Max raised by an Admin: a bigger amount is now accepted.
    api.put("/settings/driver-advance-max", json={"amount": 1000})
    assert cm.put(f"/attendance/drivers/{rec['id']}", json={"status": "On Workshop", "workshop_advance": 900})["workshop_advance"] == 900
    api.put("/settings/driver-advance-max", json={"amount": 500})

    # No longer On Workshop: the advance goes, on any other status.
    left = cm.put(f"/attendance/drivers/{rec['id']}", json={"status": "Leave", "workshop_advance": 100})
    assert left["workshop_advance"] is None and record_of() == []


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
