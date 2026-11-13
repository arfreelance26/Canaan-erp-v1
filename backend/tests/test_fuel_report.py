"""Truck's Fuel History → View: the truck-wise fuel report (fuel_report.py,
GET /exports/fuel-report[/preview])."""
from datetime import date, timedelta
from io import BytesIO

from openpyxl import load_workbook

from world import create_truck

D0 = date.today() - timedelta(days=20)


def _fills(db, truck, rows):
    """rows: (days after D0, odometer, litres, price, station)."""
    import models
    for days, odo, litres, price, station in rows:
        db.add(models.FuelLog(truck_id=truck["id"], date=D0 + timedelta(days=days), odometer=odo, litres=litres,
                              price_per_litre=price, total_cost=round(litres * price, 2), fuel_station=station,
                              entered_by_name="pytest"))
    db.commit()


def _report(api, truck, **params):
    return api.get("/exports/fuel-report/preview", params={"truck_id": truck["id"], **params})


def test_mileage_checks_and_totals(api, db):
    api.put("/maintenance/fuel-base-config", json={"cost_per_litre": 100})
    t = create_truck(api)
    _fills(db, t, [
        (0, 10_000, 100, 100, "BPCL"),     # first fill — no mileage yet
        (2, 10_400, 100, 100, "BPCL"),     # 4.0 km/L  OK
        (4, 10_800, 100, 100, "IOC"),      # 4.0 km/L  OK
        (5, 10_800, 100, 100, "IOC"),      # same odometer, litres and cost → possible duplicate
        (6, 13_800, 100, 100, "IOC"),      # 30 km/L → not possible
        (7, 14_200, 100, 300, "IOC"),      # 4.0 km/L but a price far from the base price
    ])
    out = _report(api, t)
    (x,) = out["report"]["trucks"]
    status = [r["status"] for r in x["rows"]]
    assert status[0].startswith("First fill") and status[1] == "OK" and status[2] == "OK"
    assert "possible duplicate" in status[3]
    assert "isn't possible" in status[4]
    assert "price looks wrong" in status[5]
    assert x["fills"] == 6 and x["litres"] == 600 and x["cost"] == 80_000
    assert x["checks"] == 3
    assert x["mileage"] == 4.0                       # only the good gaps: 1,200 km ÷ 300 L
    assert abs(sum(r["total"] for r in x["rows"]) - x["cost"]) < 0.01
    assert out["report"]["totals"]["cost"] == x["cost"]
    assert [s["name"] for s in out["report"]["stations"]] == ["IOC", "BPCL"]
    assert [sh["name"] for sh in out["sheets"]] == ["Summary", "All Trucks", t["registration_number"], "By Station"]


def test_dates_and_search(api, db):
    t = create_truck(api)
    _fills(db, t, [(0, 20_000, 50, 100, "A"), (10, 20_200, 50, 100, "A")])
    later = (D0 + timedelta(days=5)).isoformat()
    rep = api.get("/exports/fuel-report/preview", params={"from_date": later, "search": t["truck_id"]})["report"]
    (x,) = rep["trucks"]
    assert x["fills"] == 1 and x["cost"] == 5000
    assert x["rows"][0]["mileage"] == 4.0             # the gap from the earlier fill still counts
    api.get("/exports/fuel-report/preview", params={"from_date": later, "to_date": D0.isoformat()}, expect=400)


def test_workbook_and_links(api, db, client, auth):
    t = create_truck(api)
    _fills(db, t, [(0, 30_000, 40, 100, "X"), (1, 30_160, 40, 100, "X")])
    res = client.get("/exports/fuel-report", params={"search": t["registration_number"]}, headers=auth("Admin"))
    assert res.status_code == 200
    wb = load_workbook(BytesIO(res.content))
    assert wb.sheetnames == ["Summary", "All Trucks", t["registration_number"], "By Station"]
    links = {c.value: c.hyperlink.location for c in wb["All Trucks"]["A"] if c.hyperlink}
    assert links[t["registration_number"]] == f"'{t['registration_number']}'!A1"
    text = " ".join(str(c.value) for ws in wb for row in ws.iter_rows() for c in row if isinstance(c.value, str)).lower()
    assert "per km" not in text
