"""Leave / Edit / Deletion / Maintenance Approvals → View: the shared approvals
report (approvals_report.py, GET /exports/approvals-report[/preview])."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from openpyxl import load_workbook

from world import create_truck

ISO = date.today().isoformat()


def _preview(who, kind, **params):
    return who.get("/exports/approvals-report/preview", params={"kind": kind, **params})


def test_leave_groups_and_days(api, db, staff):
    import models
    tag = datetime.now().strftime("%H%M%S%f")
    for cat, name, frm, days, status in (("Driver", f"PT Driver {tag}", date(2024, 3, 4), 3, "Approved"),
                                         ("Driver", f"PT Driver {tag}", date(2024, 3, 10), 1, "Pending"),
                                         ("Accounts", f"PT Acc {tag}", date(2024, 3, 5), 2, "Rejected")):
        db.add(models.LeaveRequest(category=cat, applicant_id=1, applicant_name=name, applicant_code="X",
                                   from_date=frm, to_date=frm + timedelta(days=days - 1), reason="pytest", status=status))
    db.commit()
    out = _preview(api, "leave", from_date="2024-03-01", to_date="2024-03-31", search="PT ", tab="All")
    rep = out["report"]
    groups = {g["key"]: g for g in rep["groups"]}
    assert groups["Driver"]["count"] == 2 and groups["Accounts"]["count"] == 1
    assert {k["label"]: k["value"] for k in rep["kpis"]}["Approved leave days"] == 3
    per = {row[0]: row for row in groups["Driver"]["extra"]["rows"]}
    assert per[f"PT Driver {tag}"][1:] == [2, 3, 1]          # requests, approved days, pending
    assert [s["name"] for s in out["sheets"]] == ["Summary", "Driver", "Accounts"]
    only_acc = _preview(api, "leave", from_date="2024-03-01", to_date="2024-03-31", tab="Accounts")["report"]
    assert [g["key"] for g in only_acc["groups"]] == ["Accounts"]


def test_edit_statuses_and_use_tracking(api, db, staff):
    import models
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    s = staff["Commercial Manager"]
    base = dict(staff_db_id=s.id, staff_name=s.name, resource_id=1, resource_name="PT trip", reason="pytest")
    rows = [
        models.EditApprovalRequest(resource_type="TripSheet", action="Edit", status="Approved", approved_by_name="Boss",
                                   approved_at=now - timedelta(hours=2), expires_at=now + timedelta(hours=6),
                                   used_at=now - timedelta(hours=1), created_at=now - timedelta(hours=3), **base),
        models.EditApprovalRequest(resource_type="TripSheet", action="Edit", status="Approved", approved_by_name="Boss",
                                   approved_at=now - timedelta(hours=20), expires_at=now - timedelta(hours=12),
                                   created_at=now - timedelta(hours=21), **base),
        models.EditApprovalRequest(resource_type="Customer", action="Edit", status="Approved", approved_by_name="Boss",
                                   approved_at=now - timedelta(hours=20), expires_at=now - timedelta(hours=12),
                                   created_at=now - timedelta(hours=21), **base),
        models.EditApprovalRequest(resource_type="Truck", action="Edit", status="Pending", created_at=now, **base),
    ]
    db.add_all(rows)
    db.commit()
    rep = _preview(api, "edit", search="PT trip")["report"]
    used = {(g["key"], r["status"], r["used"].split(" ")[0]) for g in rep["groups"] for r in g["rows"]}
    assert ("TripSheet", "Approved — active", "Used") in used
    assert ("TripSheet", "Approved — time up", "Not") in used          # "Not used — time up"
    assert any(k == "Customer" and u == "Not" for k, _, u in used)     # Customer isn't tracked → "Not tracked"
    cust = next(r for g in rep["groups"] if g["key"] == "Customer" for r in g["rows"])
    assert cust["used"] == "Not tracked"
    pending = _preview(api, "edit", search="PT trip", tab="Pending")["report"]
    assert [r["status"] for g in pending["groups"] for r in g["rows"]] == ["Pending"]


def test_access_follows_the_pages(api_as):
    _preview(api_as("Commercial Manager"), "edit")
    _preview(api_as("Accounts"), "maintenance")
    for role, kind in (("Commercial Manager", "deletion"), ("Accounts", "leave"), ("Maintenance", "edit"), ("Accounts", "edit")):
        api_as(role).get("/exports/approvals-report/preview", params={"kind": kind}, expect=403)
    api_as("Accounts").get("/exports/approvals-report/preview", params={"kind": "nothing"}, expect=400)


def test_maintenance_by_status_with_costs(api, api_as, client, auth):
    t = create_truck(api)
    mech = api_as("Maintenance")
    body = {"truck_id": t["id"], "date": ISO, "odometer": 1, "maintenance_type": "Brakes", "cost": 1500}
    a = mech.post("/maintenance-requests", json=body)
    b = mech.post("/maintenance-requests", json={**body, "cost": 700})
    api.put(f"/maintenance-requests/{b['id']}/approve", json={})
    rep = _preview(api, "maintenance", search=t["registration_number"], tab="all")["report"]
    groups = {g["key"]: g for g in rep["groups"]}
    assert groups["Pending"]["cost"] == 1500 and groups["Approved"]["cost"] == 700
    assert groups["Pending"]["rows"][0]["waiting"]
    res = client.get("/exports/approvals-report", params={"kind": "maintenance", "search": t["registration_number"], "tab": "all"},
                     headers=auth("Admin"))
    wb = load_workbook(BytesIO(res.content))
    assert wb.sheetnames == ["Summary", "Pending", "Approved"]
    links = {c.value: c.hyperlink.location for c in wb["Summary"]["A"] if c.hyperlink}
    assert links["Pending"] == "'Pending'!A1"
    assert a["id"]
