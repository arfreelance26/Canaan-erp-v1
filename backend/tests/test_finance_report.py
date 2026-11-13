"""Finance Hub → View (finance_report.py): Driver Compensation, EMI Tracking,
Customer Detention, Compliance & Renewals and Staff Compensation, served by
GET /exports/resource-report[/preview] like the Resource Hub reports."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from openpyxl import load_workbook

import finance_report as fr
from world import create_driver, create_staff, create_truck

PERIOD = {"from_date": "2031-03-01", "to_date": "2031-03-31"}      # far from other tests' records


def _preview(api, kind, **params):
    return api.get("/exports/resource-report/preview", params={"kind": kind, **params})


def test_every_finance_report_builds_and_downloads(api):
    for kind in ("drivercomp", "emi", "detention", "compliance", "staffcomp"):
        out = _preview(api, kind, **PERIOD)
        assert out["report"]["kind"] == kind and out["sheets"][0]["name"] == "Summary"
        res = api.get("/exports/resource-report", params={"kind": kind, **PERIOD})
        load_workbook(BytesIO(res.content))                   # a real workbook


def test_roles_follow_the_pages(api_as):
    for kind in ("drivercomp", "emi", "detention", "compliance"):
        _ = api_as("Accounts").get("/exports/resource-report/preview", params={"kind": kind, **PERIOD})
        api_as("Maintenance").get("/exports/resource-report/preview", params={"kind": kind}, expect=403)
    api_as("Accounts").get("/exports/resource-report/preview", params={"kind": "staffcomp"}, expect=403)   # Admin only


def test_driver_compensation_lists_recorded_entries_and_masks_the_account(api, db):
    import models
    d = create_driver(api)
    row = db.get(models.Driver, d["id"])
    row.account_number = "000111222333"
    db.add(models.CompensationTransaction(person_type="driver", person_id=d["id"], person_name=row.name, type="Advance",
                                          amount=1500, date=date(2031, 3, 5), note="Pytest advance"))
    db.commit()
    rep = _preview(api, "drivercomp", search=d["driver_id"], **PERIOD)["report"]
    (item,) = rep["items"]
    pairs = {p["label"]: p["value"] for b in item["boxes"] for p in b["pairs"]}
    assert pairs["Account (last 4)"] == "XXXXXXXX2333" and pairs["Advance entries (₹)"] == 1500
    recorded = next(t for t in item["tables"] if t["title"].startswith("ADVANCES"))
    assert recorded["rows"][0][2] == 1500 and recorded["rows"][0][4] == "Pytest advance"
    # The Salary Record matches the page's own (routers/finance.py salary_statement).
    from routers.finance import salary_statement
    st = salary_statement(db, d["driver_id"], "2031-03-01", "2031-03-31")
    assert pairs["= Final Net Payable"] == st["net_payable"]


def test_emi_follows_the_pages_installment_rule(api, db):
    import models
    today = date.today()
    added = today.replace(day=1) - timedelta(days=62)          # about 2–3 months ago
    rec = models.EmiRecord(emi_name="PYTEST EMI", truck_registration="PY01EMI0001", bank_name="Pytest Bank", loan_number="LN987654321",
                           loan_amount=500_000, emi_amount=20_000, tenure_months=24, emi_start_date=added,
                           emi_end_date=added + timedelta(days=730), auto_debit_date=added,
                           created_at=datetime(added.year, added.month, added.day, tzinfo=timezone.utc))
    db.add(rec)
    db.commit()
    dates, nxt = fr._emi_schedule(rec, today)
    # The page's rule (lib/emi-schedule.ts): one installment when added, then one per elapsed Auto-Debit Date.
    months = (today.year - added.year) * 12 + (today.month - added.month) - (1 if today.day < added.day else 0)
    assert len(dates) == min(24, months + 1) and nxt is not None and nxt > today
    paid, remaining = len(dates) * 20_000, (24 - len(dates)) * 20_000

    rep = _preview(api, "emi", search="PYTEST EMI")["report"]
    loan = next(i for i in rep["items"] if i["title"] == "PYTEST EMI")
    pairs = {p["label"]: p["value"] for b in loan["boxes"] for p in b["pairs"]}
    assert pairs["Loan number (last 4)"] == "XXXXXXX4321"
    assert pairs["Amount paid (₹)"] == paid and pairs["Remaining (₹)"] == remaining
    assert any(i["title"] == "Recurring Payments" for i in rep["items"])
    flat = str(rep)
    assert "LN987654321" not in flat and "per km" not in flat.lower()


def test_compliance_statuses_match_the_page(api, db):
    import models
    today = date.today()
    assert fr.compliance_status(None, 30, today) == "Not Uploaded"
    assert fr.compliance_status(today - timedelta(days=1), 30, today) == "Expired"
    assert fr.compliance_status(today + timedelta(days=7), 7, today) == "Expiring Soon"
    assert fr.compliance_status(today + timedelta(days=8), 7, today) == "Valid"

    t = create_truck(api)
    row = db.query(models.Truck).filter_by(truck_id=t["truck_id"]).one()
    row.insurance_expiry_date, row.insurance_expenses = today - timedelta(days=3), 30_000
    row.fc_expiry_date, row.fc_expenses = today + timedelta(days=20), None           # expiring soon, no cost
    db.commit()
    rep = _preview(api, "compliance", search=t["truck_id"])["report"]
    by_doc = {r[0]["v"]: r for r in rep["tables"][0]["rows"]}
    assert by_doc["Insurance"][1] == 1                                                # expired
    assert by_doc["FC"][2] == 1 and by_doc["FC"][5] == 1                              # expiring soon, no cost
    assert by_doc["Pollution Cert."][3] == 1                                          # not uploaded
    fc = next(i for i in rep["items"] if i["title"] == "FC")
    assert fc["tables"][0]["rows"][0][6] == {"v": "No Cost", "tone": "warn"}


def test_compliance_one_document_most_urgent_first(api, db):
    """The page's document filter (Road Tax): only that document, and its trucks
    expired → not uploaded → due soon → valid; inside a group the earliest expiry."""
    import models
    today = date.today()
    dates = {"valid": today + timedelta(days=200), "late2": today - timedelta(days=2), "none": None,
             "soon": today + timedelta(days=5), "late9": today - timedelta(days=9)}
    regs = {}
    for name, day in dates.items():
        t = create_truck(api)
        row = db.query(models.Truck).filter_by(truck_id=t["truck_id"]).one()
        row.road_tax_date = day
        regs[row.registration_number] = name
        db.commit()   # a fresh snapshot, so the next truck is seen

    rep = _preview(api, "compliance", resource_type="Road Tax")["report"]
    assert [i["title"] for i in rep["items"]] == ["Road Tax"]                 # that document only, no Every Truck
    assert [r[0]["v"] for r in rep["tables"][0]["rows"]] == ["Road Tax"]
    assert "Road Tax only" in rep["period"]["label"]
    order = [regs[r[0]] for r in rep["items"][0]["tables"][0]["rows"] if r[0] in regs]
    assert order == ["late9", "late2", "none", "soon", "valid"]

    every = _preview(api, "compliance")["report"]                             # All: every document, as before
    assert len(every["items"]) == len(fr.COMPLIANCE_DOCS) + 1


def test_staff_compensation_groups_by_person(api, db):
    import models
    s = create_staff(api)
    for kind, amount, day in (("Salary", 20_000, 2), ("Advance", 2_000, 10)):
        db.add(models.CompensationTransaction(person_type="staff", person_id=s["id"], person_name=s["name"], type=kind,
                                              amount=amount, date=date(2031, 3, day)))
    db.commit()
    rep = _preview(api, "staffcomp", search=s["staff_id"], **PERIOD)["report"]
    person = rep["items"][0]
    pairs = {p["label"]: p["value"] for b in person["boxes"] for p in b["pairs"]}
    assert pairs["Salary (₹)"] == 20_000 and pairs["Advances (₹)"] == 2_000 and pairs["Total paid out (₹)"] == 22_000
    assert rep["items"][-1]["title"] == "Month by month"
