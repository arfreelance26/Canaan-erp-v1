"""Finance (EMI, recurring payments, driver/staff compensation), P&L summary
and truck compliance documents (renew, correct, undo, files)."""
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
    assert "spreadsheet" in res.headers["content-type"] or res.content[:2] == b"PK"
    trip = sheeted_trip(api, world)
    breakdown = api_as("Accounts").get(f"/pl-summary/trip-breakdown/{trip['id']}")
    assert breakdown


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
