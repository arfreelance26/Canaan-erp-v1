"""Trip History → View: the category-wise trip report (trip_report.py,
GET /exports/trip-report[/preview])."""
from datetime import date, timedelta
from io import BytesIO

from openpyxl import load_workbook

from world import add_sheet, complete_and_close, fresh_trip

# A day of its own far ahead, so only this test's trips fall in the range.
DAY = (date.today() + timedelta(days=500)).isoformat()


def _trip(api, world, db, category, hire, expense, km=40, sheet=True):
    import models
    trip = fresh_trip(api, world, trip_category=category, scheduled_date=DAY)
    if sheet:
        complete_and_close(api, trip)
        add_sheet(api, trip)
        s = db.query(models.TripSheet).filter_by(trip_id=trip["id"]).one()
        s.hire_amount, s.total_expense, s.total_km = hire, expense, km
        db.commit()
    return trip


def _preview(api, **params):
    return api.get("/exports/trip-report/preview", params={"from_date": DAY, "to_date": DAY, **params})


def test_category_sheets_add_up(api, world, db):
    import models
    a = _trip(api, world, db, "OUTSTATION", 30_000, 8_000, km=700)
    _trip(api, world, db, "OUTSTATION", 20_000, 5_000, km=500)
    _trip(api, world, db, "RETURN TRIP", 10_000, 1_000, km=0)       # 0 km is flagged
    _trip(api, world, db, "LOCAL", 5_000, 1_500, sheet=False)          # no sheet yet → no money
    gone = _trip(api, world, db, "LOCAL", 9_999, 0)
    t = db.get(models.Trip, gone["id"])
    t.status = "Cancelled"
    db.commit()

    out = _preview(api)
    rep = out["report"]
    tt = rep["totals"]
    assert tt["trips"] == 5 and tt["cancelled"] == 1 and tt["without_sheet"] == 1
    assert tt["hire"] == 60_000 and tt["expense"] == 14_000 and tt["summary"] == 46_000   # cancelled left out
    assert tt["no_km"] == 1
    cats = {c["code"]: c for c in rep["by_category"]}
    assert cats["OUTSTATION"]["totals"]["hire"] == 50_000 and cats["OUTSTATION"]["totals"]["km"] == 1_200
    assert cats["RETURN TRIP"]["totals"]["no_km"] == 1
    assert cats["LOCAL"]["totals"]["cancelled"] == 1 and cats["LOCAL"]["totals"]["hire"] == 0
    assert sum(c["totals"]["hire"] for c in rep["by_category"]) == tt["hire"]
    assert sum(c["totals"]["trips"] for c in rep["by_category"]) == tt["trips"]
    names = [s["name"] for s in out["sheets"]]
    assert names == ["Summary", "Outstation", "Local", "Return Trip", "By Customer"]   # no empty category sheets
    assert any(r["trip_id"] == a["trip_id"] for r in cats["OUTSTATION"]["rows"])


def test_filters_follow_the_page(api, world, db):
    o = _trip(api, world, db, "OUTSTATION", 30_000, 8_000)
    r = _trip(api, world, db, "RETURN TRIP", 10_000, 1_000)
    only_return = _preview(api, trip_category="RETURN TRIP")
    assert [c["code"] for c in only_return["report"]["by_category"]] == ["RETURN TRIP"]
    assert [s["name"] for s in only_return["sheets"]] == ["Summary", "Return Trip", "By Customer"]
    found = _preview(api, search=o["trip_id"])["report"]
    assert found["totals"]["trips"] == 1 and found["totals"]["hire"] == 30_000
    assigned = _preview(api, card="Assigned")["report"]
    assert all(r["stage"] == "Assigned" for c in assigned["by_category"] for r in c["rows"])
    completed = _preview(api, card="Completed")["report"]
    ids = {x["trip_id"] for c in completed["by_category"] for x in c["rows"]}
    assert {o["trip_id"], r["trip_id"]} <= ids
    api.get("/exports/trip-report/preview", params={"from_date": DAY, "to_date": "2000-01-01"}, expect=400)


def test_invoice_hidden_for_commercial_managers(api, api_as, world, db):
    _trip(api, world, db, "OUTSTATION", 30_000, 8_000)
    assert _preview(api)["report"]["show_invoice"] is True
    cm = api_as("Commercial Manager").get("/exports/trip-report/preview", params={"from_date": DAY, "to_date": DAY})
    assert cm["report"]["show_invoice"] is False
    heads = [row for s in cm["sheets"] for row in s["rows"]]
    assert not any("Invoice" == cell for row in heads for cell in row)


def test_workbook_links_and_no_cost_per_km(api, world, db, client, auth):
    _trip(api, world, db, "LOCAL CFS", 7_000, 2_000)
    res = client.get("/exports/trip-report", params={"from_date": DAY, "to_date": DAY}, headers=auth("Admin"))
    assert res.status_code == 200
    wb = load_workbook(BytesIO(res.content))
    assert "Local CFS" in wb.sheetnames
    links = {c.value: c.hyperlink.location for c in wb["Summary"]["A"] if c.hyperlink}
    assert links["Local CFS"] == "'Local CFS'!A1"
    assert wb["Local CFS"]["N1"].hyperlink.location == "'Summary'!A1"
    text = " ".join(str(c.value) for ws in wb for row in ws.iter_rows() for c in row if isinstance(c.value, str)).lower()
    assert "per km" not in text
