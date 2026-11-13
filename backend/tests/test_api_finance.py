"""Finance (EMI, recurring payments, driver/staff compensation), P&L summary
and truck compliance documents (renew, correct, undo, files)."""
import json
from datetime import date, timedelta

import pytest

from world import create_staff, create_truck, sheeted_trip, tag

TODAY = date.today()
PDF = b"%PDF-1.4\n" + b"0" * 300


def _iso(days=0):
    return (TODAY + timedelta(days=days)).isoformat()


# ---------------------------------------------------------------- finance

def test_emi_records(api, world):
    emi = api.post("/finance/emi", json={
        "emi_name": f"Pytest loan {tag()}", "truck_registration": world.truck["registration_number"],
        "bank_name": "Pytest Bank", "loan_amount": 2_600_000, "emi_amount": 52_000, "tenure_months": 60,
        "emi_start_date": _iso(-30),
    })
    assert api.get(f"/finance/emi/{emi['id']}")["id"] == emi["id"]
    edited = api.put(f"/finance/emi/{emi['id']}", json={"emi_amount": 26_000})
    assert float(edited["emi_amount"]) == 26_000
    api.delete(f"/finance/emi/{emi['id']}")
    api.get(f"/finance/emi/{emi['id']}", expect=404)


def test_finance_is_limited_to_finance_roles(api_as):
    api_as("Maintenance").get("/finance/emi", expect=403)


def test_recurring_payments(api):
    rp = api.post("/finance/recurring-payments", json={
        "title": "Pytest office rent", "amount": 30_000, "frequency": "Monthly", "next_due_date": _iso(10)})
    assert api.get(f"/finance/recurring-payments/{rp['id']}")["title"] == "Pytest office rent"
    assert api.put(f"/finance/recurring-payments/{rp['id']}", json={"status": "Paused"})["status"] == "Paused"
    api.delete(f"/finance/recurring-payments/{rp['id']}")


def test_driver_and_staff_compensation(api, world):
    driver = world.driver2
    tx = api.post("/finance/compensation/drivers", json={
        "person_type": "driver", "person_id": driver["id"], "type": "Advance", "amount": 2000, "date": _iso(-1)})
    api.post("/finance/compensation/drivers", json={
        "person_type": "staff", "person_id": driver["id"], "type": "Advance", "amount": 1, "date": _iso()}, expect=400)
    api.get("/finance/compensation/drivers/monthly-net-payable",
            params={"month": TODAY.strftime("%Y-%m"), "driver_ids": driver["driver_id"]})
    api.get("/finance/compensation/cleaner-batta", params={"driver_id": driver["driver_id"]})
    api.get("/finance/compensation/workshop-batta", params={"driver_id": driver["driver_id"]})
    api.delete(f"/finance/compensation/{tx['id']}")

    person = create_staff(api)
    staff_tx = api.post("/finance/compensation/staff", json={
        "person_type": "staff", "person_id": person["id"], "type": "Salary", "amount": 25_000, "date": _iso(-1)})
    api.delete(f"/finance/compensation/{staff_tx['id']}")


# ---------------------------------------------------------------- P&L

def test_pl_summary(api, api_as, world):
    window = {"start_date": _iso(-60), "end_date": _iso(1)}
    api.get("/pl-summary", params=window)
    api.get("/pl-summary/computed", params=window)
    api.get("/pl-summary/export-preview", params=window)
    res = api.get("/pl-summary/export", params=window)
    nothing = api.get("/pl-summary/export-preview", params={**window, "search": "no such trip zz"})
    assert [r for r in nothing["sheets"][1]["rows"][1:] if r[0].startswith(("TRP", "PT-"))] == []
    assert "no_such_trip_zz" in nothing["filename"]
    assert "spreadsheet" in res.headers["content-type"] or res.content[:2] == b"PK"
    trip = sheeted_trip(api, world)
    assert api.get(f"/pl-summary/trip-breakdown/{trip['id']}")


@pytest.mark.parametrize("role", ["Accounts", "Auditor", "Commercial Manager", "Assistant Commercial Manager",
                                  "Maintenance", "Trip Sheet Register", "Yard Supervisor"])
def test_profit_is_admin_only(api, api_as, world, role):
    """Profitability, its Trip Breakdown and the Trip History report's Trip
    Summary (hire − expenses) never reach anyone but Admin."""
    window = {"start_date": "2020-01-01", "end_date": "2030-12-31"}
    trip = sheeted_trip(api, world)
    user = api_as(role)
    for path in ("/pl-summary", "/pl-summary/computed", "/pl-summary/export-preview", "/pl-summary/export"):
        user.get(path, params=window, expect=403)
    user.get(f"/pl-summary/trip-breakdown/{trip['id']}", expect=403)
    if role in ("Accounts", "Commercial Manager", "Assistant Commercial Manager"):   # they have Trip History
        rep = user.get("/exports/trip-report/preview")
        assert '"summary"' not in json.dumps(rep["report"])
        assert not any("Trip Summary" in str(c) for sh in rep["sheets"] for row in sh.get("rows", []) for c in row)
    admin = api.get("/exports/trip-report/preview")
    assert admin["report"]["show_profit"] is True and "summary" in admin["report"]["totals"]


# ---------------------------------------------------------------- compliance documents

def test_compliance_renew_correct_undo_and_files(api, client, auth):
    truck = create_truck(api)
    url = f"/compliance-records/truck/{truck['id']}/insurance"
    api.post(f"{url}/renew", data={"valid_until": _iso(-10), "valid_from": _iso(10)}, expect=400)  # from after until
    api.post(f"{url}/renew", data={"valid_from": _iso(-365), "valid_until": _iso(1), "expense": "40000"}, files={"file": ("policy1.pdf", PDF, "application/pdf")})
    api.post(f"{url}/renew", data={"valid_from": _iso(1), "valid_until": _iso(366), "expense": "42000"}, files={"file": ("policy2.pdf", PDF, "application/pdf")})
    api.post(f"{url}/correct", data={"expense": "41500", "note": "Premium was entered wrong"})

    records = [r for r in api.get(f"/compliance-records/truck/{truck['id']}") if r["doc_type"] == "insurance"]
    current = next(r for r in records if r["is_current"])
    assert current["expense"] == 41500
    old = next(r for r in records if not r["is_current"] and r["has_file"])
    token = auth("Admin")["Authorization"].split()[1]
    res = client.get(f"/compliance-records/{old['id']}/file", params={"token": token})
    assert res.status_code == 200 and res.content == PDF
    assert client.get(f"/compliance-records/{old['id']}/file").status_code == 401

    api.post(f"{url}/undo-renewal", data={"reason": " "}, expect=400)
    api.post(f"{url}/undo-renewal", data={"reason": "Renewed the wrong truck"})
    assert api.get(f"/compliance-records/truck/{truck['id']}/log")


def test_only_admin_undoes_a_renewal(api_as):
    api_as("Commercial Manager").post("/compliance-records/truck/1/insurance/undo-renewal",
                                      data={"reason": "x"}, expect=403)


def test_salary_record_adds_up_every_part(api, api_as, world, db):
    """Final Net Payable = Trip Salary Record + halt pay + Cleaner Batta + Workshop Batta − Workshop Advance,
    each part exactly what its own record shows for the period."""
    import models
    trip = sheeted_trip(api, world)
    driver_id = trip["driver_id"]
    closure = db.query(models.TripClosure).filter_by(trip_id=trip["id"]).one()
    closure.company_halt_days, closure.party_halt_days, closure.driver_halt_compensation = 1, 2, 750
    sheet = db.query(models.TripSheet).filter_by(trip_id=trip["id"]).one()
    sheet.trip_completed_date = date.today()  # the Trip Salary Record counts a trip by its sheet's completed date
    db.commit()
    today, yesterday = _iso(), _iso(-1)
    api.post("/attendance/drivers", json={"driver_id": driver_id, "date": yesterday, "status": "Present",
                                          "container_specification": "20 FT CONTAINER"})
    api.post("/attendance/drivers", json={"driver_id": driver_id, "date": today, "status": "On Workshop", "workshop_advance": 200})

    period = {"driver_id": driver_id, "from_date": yesterday, "to_date": today}
    s = api.get("/finance/compensation/salary-statement", params=period)
    part = {p["key"]: p for p in s["parts"]}
    in_period = lambda rows: [r for r in rows if yesterday <= r["date"] <= today]
    record = lambda path: sum(r["amount"] for r in in_period(api.get(f"/finance/compensation/{path}", params={"driver_id": driver_id})["rows"]))

    month = api.get("/finance/compensation/drivers/monthly-net-payable", params={"month": today[:7], "driver_ids": driver_id})
    if yesterday[:7] == today[:7]:
        assert part["trips"]["amount"] == month[driver_id]
    assert [r["trip_id"] for r in part["trips"]["rows"]] == [trip["trip_id"]]
    assert part["halt"]["amount"] == 750 and part["halt"]["rows"][0]["party_days"] == 2
    assert part["cleaner"]["amount"] == record("cleaner-batta") and part["cleaner"]["count"] == 1
    assert part["workshop"]["amount"] == record("workshop-batta") and part["workshop"]["count"] == 1
    assert part["workshopAdvance"]["amount"] == record("workshop-advance") == 200 and part["workshopAdvance"]["sign"] == -1
    expected = part["trips"]["amount"] + 750 + part["cleaner"]["amount"] + part["workshop"]["amount"] - 200
    assert s["net_payable"] == round(expected, 2)

    before = api.get("/finance/compensation/salary-statement", params={**period, "to_date": _iso(-5), "from_date": _iso(-9)})
    assert before["net_payable"] == 0 and all(p["count"] == 0 for p in before["parts"])   # nothing in an earlier period
    everything = api.get("/finance/compensation/salary-statement", params={"driver_id": driver_id})
    assert everything["net_payable"] == s["net_payable"]                                    # all time = the only activity

    from io import BytesIO
    from openpyxl import load_workbook
    wb = load_workbook(BytesIO(api.get("/finance/compensation/salary-statement/export", params=period).content))
    assert wb.sheetnames == ["Salary Record", "Trips", "Halt Pay", "Cleaner Batta", "Workshop Batta", "Workshop Advance"]
    last = list(wb["Salary Record"].values)[-1]
    assert last[0] == "Final Net Payable" and last[3] == s["net_payable"]

    api.get("/finance/compensation/salary-statement", params={"driver_id": "NO-SUCH"}, expect=404)
    api.get("/finance/compensation/salary-statement", params={**period, "from_date": "bad"}, expect=422)
    api_as("Maintenance").get("/finance/compensation/salary-statement", params=period, expect=403)
