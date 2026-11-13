"""Truck Maintenance → View: the truck-wise report (maintenance_report.py,
GET /exports/maintenance-report[/preview])."""
from datetime import date, timedelta
from io import BytesIO

from openpyxl import load_workbook

import maintenance_report
from world import create_truck

DAY = date.today() - timedelta(days=3)
ISO = DAY.isoformat()


def _record(api, truck, cost, mtype="Service", day=ISO, **extra):
    req = api.post("/maintenance-requests", json={
        "truck_id": truck["id"], "date": day, "odometer": 49_000, "maintenance_type": mtype, "cost": cost, **extra})
    api.put(f"/maintenance-requests/{req['id']}/approve", json={})
    return req


def _truck(api):
    t = create_truck(api)
    api.post(f"/trucks/{t['id']}/odometer-correction", json={"odometer": 50_000, "reason": "pytest start"})
    return t


def _preview(api, **params):
    return api.get("/exports/maintenance-report/preview", params={"from_date": ISO, "to_date": ISO, **params})


def test_totals_add_up_and_waiting_is_not_counted(api):
    a, b = _truck(api), _truck(api)
    _record(api, a, 1000, "Service")
    _record(api, a, 500, "Brakes")
    _record(api, b, 2500, "Engine")
    api.post("/maintenance-requests", json={  # waiting for approval — listed, never added in
        "truck_id": a["id"], "date": ISO, "odometer": 49_100, "maintenance_type": "Clutch", "cost": 9999})
    api.post("/maintenance-requests", params={"schedule": "true"}, json={  # scheduled, no cost yet
        "truck_id": b["id"], "date": ISO, "odometer": 49_100, "maintenance_type": "Tyres"})

    rep = _preview(api, search=a["registration_number"])["report"]
    (ta,) = rep["trucks"]
    assert ta["cost"] == 1500 and ta["records"] == 2 and len(ta["rows"]) == 2
    assert [w["status"] for w in ta["waiting"]] == ["Waiting for approval"]
    assert rep["totals"]["cost"] == 1500 and rep["totals"]["pending"] == 1 and rep["totals"]["pending_cost"] == 9999

    both = _preview(api)["report"]
    mine = [x for x in both["trucks"] if x["id"] in (a["id"], b["id"])]
    assert sum(x["cost"] for x in mine) == 4000
    assert abs(sum(x["cost"] for x in both["trucks"]) - both["totals"]["cost"]) < 0.01
    for x in both["trucks"]:
        assert abs(sum(r["cost"] for r in x["rows"]) - x["cost"]) < 0.01
    tb = next(x for x in both["trucks"] if x["id"] == b["id"])
    assert [w["status"] for w in tb["waiting"]] == ["Waiting for its cost"]


def test_dates_and_search_narrow_the_report(api):
    a = _truck(api)
    _record(api, a, 700)
    _record(api, a, 300, day=(DAY - timedelta(days=40)).isoformat())
    rep = _preview(api, search=a["truck_id"])["report"]
    assert [x["id"] for x in rep["trucks"]] == [a["id"]]
    assert rep["trucks"][0]["cost"] == 700                     # the older bill is outside the dates
    wide = api.get("/exports/maintenance-report/preview", params={"search": a["registration_number"]})["report"]
    assert wide["trucks"][0]["cost"] == 1000 and wide["period"]["label"] == "All time"
    api.get("/exports/maintenance-report/preview", params={"from_date": ISO, "to_date": "2000-01-01"}, expect=400)


def test_workbook_has_a_sheet_per_truck_with_links(api, client, auth):
    a, idle = _truck(api), _truck(api)
    _record(api, a, 1200)
    res = client.get("/exports/maintenance-report", params={"from_date": ISO, "to_date": ISO,
                                                            "search": a["registration_number"][:-1]},
                     headers=auth("Admin"))
    assert res.status_code == 200
    wb = load_workbook(BytesIO(res.content))
    assert wb.sheetnames[:2] == ["Summary", "All Trucks"] and wb.sheetnames[-1] == "By Vendor"
    assert a["registration_number"] in wb.sheetnames
    if idle["registration_number"].startswith(a["registration_number"][:-1]):
        assert idle["registration_number"] not in wb.sheetnames   # no maintenance → no empty sheet
    links = {c.value: c.hyperlink.location for c in wb["All Trucks"]["A"] if c.hyperlink}
    assert links[a["registration_number"]] == f"'{a['registration_number']}'!A1"
    assert wb[a["registration_number"]]["N1"].hyperlink.location == "'All Trucks'!A1"


def test_one_truck_report(api):
    a = _truck(api)
    _record(api, a, 450, remind_at_odometer=50_300)
    out = api.get("/exports/maintenance-report/preview", params={"truck_id": a["id"]})
    rep = out["report"]
    assert rep["single_truck"] and [x["id"] for x in rep["trucks"]] == [a["id"]]
    assert [s["name"] for s in out["sheets"]] == ["Summary", "All Trucks", a["registration_number"], "By Vendor"]
    assert out["filename"].startswith(f"Truck_Maintenance_{a['registration_number']}")
    rem = rep["trucks"][0]["next_reminder"]
    assert rem["remind_at"] == 50_300 and rem["state"] == "Due soon" and rem["km_left"] == 300


def test_reminder_closes_when_done_again(api):
    a = _truck(api)
    _record(api, a, 100, "Oil change", day=(DAY - timedelta(days=10)).isoformat(), remind_at_odometer=50_100)
    _record(api, a, 100, "Oil change")
    rep = api.get("/exports/maintenance-report/preview", params={"truck_id": a["id"]})["report"]
    (x,) = rep["trucks"]
    assert x["reminders"][0]["state"] == "Done again" and x["next_reminder"] is None


def test_sheet_names_are_valid_and_unique():
    names = maintenance_report._sheet_names(["TN/01:AB*1", "Summary", "TN01AB1", "X" * 40, "X" * 40, "tn01ab1"])
    assert len(set(n.lower() for n in names)) == len(names)
    for n in names:
        assert len(n) <= 31 and not any(ch in n for ch in "[]:*?/\\'")
    assert names[1] != "Summary"
