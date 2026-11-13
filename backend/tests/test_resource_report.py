"""Resource Hub → View: a file per truck / driver (resource_report.py,
GET /exports/resource-report[/preview])."""
from datetime import date, timedelta
from io import BytesIO

from openpyxl import load_workbook

import resource_report
from world import create_driver, create_truck


def _preview(api, kind, search):
    return api.get("/exports/resource-report/preview", params={"kind": kind, "search": search})


def test_mask_keeps_last_four():
    assert resource_report.mask("1234 5678 9012") == "XXXXXXXX9012"
    assert resource_report.mask("ABCDE1234F") == "XXXXXX234F"
    assert resource_report.mask("") == "" and resource_report.mask(None) == ""
    assert resource_report.mask("12") == "12"


def test_driver_file_masks_ids_and_flags_licence(api, db):
    import models
    d = create_driver(api)
    row = db.get(models.Driver, d["id"])
    row.aadhaar_number, row.pan_number, row.account_number = "123456789012", "ABCDE1234F", "000111222333"
    row.license_number, row.license_expiry_date = "TN01X", date.today() - timedelta(days=3)
    db.commit()
    out = _preview(api, "drivers", d["driver_id"])
    rep = out["report"]
    (item,) = rep["items"]
    pairs = {p["label"]: p for b in item["boxes"] for p in b["pairs"]}
    assert pairs["Aadhaar"]["value"] == "XXXXXXXX9012" and pairs["PAN"]["value"] == "XXXXXX234F"
    assert pairs["Account"]["value"] == "XXXXXXXX2333"
    assert pairs["  status"]["tone"] == "bad" and pairs["  status"]["value"].startswith("Expired")
    assert rep["kpis"][1]["value"] == "1"                                        # licences expired
    flat = " ".join(str(c) for s in out["sheets"] for r in s["rows"] for c in r)
    assert "123456789012" not in flat and "000111222333" not in flat             # never in full
    assert len(item["tables"][0]["rows"]) in (12, 13)                            # month by month


def test_truck_file_documents_and_loan(api, db):
    import models
    t = create_truck(api)
    row = db.get(models.Truck, t["id"])
    row.insurance_expiry_date = date.today() + timedelta(days=10)
    row.insurance_expenses = 30_000
    db.add(models.EmiRecord(emi_name=t["registration_number"], truck_registration=t["registration_number"], bank_name="PT Bank",
                            loan_number="LN0001234", emi_amount=25_000, emi_start_date=date.today() - timedelta(days=60),
                            emi_end_date=date.today() + timedelta(days=400)))
    db.commit()
    rep = _preview(api, "fleet", t["registration_number"])["report"]
    (item,) = rep["items"]
    docs = {r[0]: r for r in item["tables"][0]["rows"]}
    ins = docs["Insurance"]
    assert ins[5]["tone"] == "warn" and ins[5]["v"].startswith("Due in")
    loan = {p["label"]: p["value"] for b in item["boxes"] if b["title"] == "LOAN" for p in b["pairs"]}
    assert loan["Lender"] == "PT Bank" and loan["EMI a month (₹)"] == 25_000 and loan["Loan number"].endswith("1234")
    assert loan["Loan number"] != "LN0001234"


def test_workbook_links_and_bad_kind(api, client, auth):
    t = create_truck(api)
    res = client.get("/exports/resource-report", params={"kind": "fleet", "search": t["registration_number"]}, headers=auth("Admin"))
    wb = load_workbook(BytesIO(res.content))
    assert wb.sheetnames == ["Summary", t["registration_number"]]
    links = {c.value: c.hyperlink.location for c in wb["Summary"]["A"] if c.hyperlink}
    assert links[t["registration_number"]] == f"'{t['registration_number']}'!A1"
    assert wb[t["registration_number"]]["F1"].hyperlink.location == "'Summary'!A1"
    text = " ".join(str(c.value) for ws in wb for row in ws.iter_rows() for c in row if isinstance(c.value, str)).lower()
    assert "per km" not in text
    api.get("/exports/resource-report/preview", params={"kind": "nothing"}, expect=400)


def test_customers_by_type_with_pricing_tabs(api, api_as, world):
    cust = world.customer
    rep = api.get("/exports/resource-report/preview", params={"kind": "customers", "search": cust["name"]})
    names = [s["name"] for s in rep["sheets"]]
    assert names[0] == "Summary" and "Shipping customers" in names
    assert names[-3:] == ["Destinations", "Pricing", "Final Pricing"]          # Admin sees Final Pricing
    dest = next(i for i in rep["report"]["items"] if i["sheet"] == "Destinations")
    assert any(r[0] == cust["name"] for r in dest["tables"][0]["rows"])
    cm = api_as("Commercial Manager").get("/exports/resource-report/preview", params={"kind": "customers", "search": cust["name"]})
    assert "Final Pricing" not in [s["name"] for s in cm["sheets"]]             # as on the page


def test_vendors_spend_and_masked_pan(api, db):
    import models
    from datetime import date
    v = api.post("/vendors", json={"name": "PT Spend Vendor XYZ", "category": "PT Category", "status": "ACTIVE", "pan": "ABCDE9876F"})
    t = create_truck(api)
    req = api.post("/maintenance-requests", json={"truck_id": t["id"], "date": date.today().isoformat(), "odometer": 1,
                                                  "maintenance_type": "Brakes", "items": [
                                                      {"repair_type": "Pads", "cost": 4200, "maintenance_by_type": "Vendor", "vendor_id": v["id"]}]})
    api.put(f"/maintenance-requests/{req['id']}/approve", json={})
    rep = api.get("/exports/resource-report/preview", params={"kind": "vendors", "search": "PT Spend Vendor XYZ"})["report"]
    (item,) = rep["items"]
    row = item["tables"][0]["rows"][0]
    assert row[0] == "PT Spend Vendor XYZ" and row[7] == 1 and row[9] == 4200 and row[12] == 4200
    assert row[4] == "XXXXXX876F"


def test_staff_by_role_masks_aadhaar_and_gates(api, api_as, db):
    import models
    from world import create_staff
    s = create_staff(api, role="Yard Supervisor")
    row = db.get(models.Staff, s["id"])
    row.aadhar_number = "998877665544"
    t = date.today()
    row.date_of_birth = date(1990, t.month, t.day) if (t.month, t.day) != (2, 29) else date(1990, 3, 1)
    db.commit()
    out = api.get("/exports/resource-report/preview", params={"kind": "staff", "search": s["staff_id"]})
    rep = out["report"]
    (item,) = rep["items"]
    assert item["sheet"] == "Yard Supervisor"
    (r,) = item["tables"][0]["rows"]
    assert r[0] == s["staff_id"] and r[10] == "XXXXXXXX5544"
    assert any(c[0] == s["name"] and c[2] == "Birthday" and c[4] == 0 for c in rep["tables"][1]["rows"])
    flat = " ".join(str(c) for sh in out["sheets"] for row_ in sh["rows"] for c in row_)
    assert "998877665544" not in flat
    for kind in ("staff", "archive", "holidays", "payments"):
        api_as("Maintenance").get("/exports/resource-report/preview", params={"kind": kind}, expect=403)
    api_as("Accounts").get("/exports/resource-report/preview", params={"kind": "payments"})


def test_archive_sheet_per_type(api):
    v = api.post("/vendors", json={"name": "PT Archived Vendor QQ", "category": "PT Category", "status": "ACTIVE"})
    api.delete(f"/vendors/{v['id']}")
    rep = api.get("/exports/resource-report/preview", params={"kind": "archive", "search": "PT Archived Vendor QQ"})["report"]
    (item,) = rep["items"]
    assert item["sheet"] == "Vendors" and item["tables"][0]["rows"][0][0] == "PT Archived Vendor QQ"
    assert item["tables"][0]["rows"][0][6]["v"] == 0
    only_trucks = api.get("/exports/resource-report/preview", params={"kind": "archive", "resource_type": "Truck", "search": "PT Archived Vendor QQ"})
    assert only_trucks["report"]["items"] == []


def test_payments_by_requester(api, api_as, staff):
    A, B = api_as("Maintenance"), api_as("Accounts")
    cid = A.post("/chat/conversations/direct", json={"staff_id": staff["Accounts"].id})["id"]
    paid = A.post(f"/chat/conversations/{cid}/messages", json={"content_type": "payment", "amount": 700, "note": "PTPAY diesel", "text": ""})
    wait = A.post(f"/chat/conversations/{cid}/messages", json={"content_type": "payment", "amount": 300, "note": "PTPAY tea", "text": ""})
    for n in (paid, wait):
        B.post(f"/chat/messages/{n['id']}/payment-status", json={"status": "approved"})
    api.post(f"/payment-requests/{paid['id']}/decision", json={"status": "approved"})
    rep = api.get("/exports/resource-report/preview", params={"kind": "payments", "search": "PTPAY"})["report"]
    (item,) = rep["items"]
    assert item["title"] == staff["Maintenance"].name
    rows = {r[1]: r for r in item["tables"][0]["rows"]}
    assert rows["PTPAY diesel"][2] == 700 and rows["PTPAY diesel"][4]["v"] == "Unpaid"
    assert rows["PTPAY tea"][4]["v"] == "Pending" and rows["PTPAY tea"][10] == 0
    assert len(rep["tables"][1]["rows"]) == 2                                    # both still waiting
    future = (date.today() + timedelta(days=5)).isoformat()
    assert api.get("/exports/resource-report/preview", params={"kind": "payments", "search": "PTPAY", "from_date": future})["report"]["items"] == []


def test_holidays_year(api):
    year = date.today().year + 3
    d = date(year, 8, 15)
    h = api.post("/attendance/holidays", json={"date": d.isoformat(), "name": "PT Holiday", "type": "Government"})
    try:
        rep = api.get("/exports/resource-report/preview", params={"kind": "holidays", "year": year})
        names = [s["name"] for s in rep["sheets"]]
        assert names == ["Summary", "Holidays", "Month by month", "Changes"]
        items = {i["sheet"]: i for i in rep["report"]["items"]}
        (row,) = items["Holidays"]["tables"][0]["rows"]
        assert row[2] == "PT Holiday" and row[3] == "Government" and row[6] is None     # future: nobody worked yet
        aug = items["Month by month"]["tables"][0]["rows"][7]
        sundays = sum(1 for i in range(31) if date(year, 8, 1 + i).weekday() == 6)
        assert aug[2] == sundays and aug[4] == 31 - sundays - (0 if d.weekday() == 6 else 1)
        assert any(c[2] == "PT Holiday" for c in items["Changes"]["tables"][0]["rows"])
    finally:
        api.delete(f"/attendance/holidays/{h['id']}")


def test_old_full_id_exports_are_gone(api):
    """They printed Aadhaar / PAN / bank numbers in full to anyone signed in."""
    for path in ("/exports/drivers", "/exports/staff"):
        api.get(path, expect=404)
