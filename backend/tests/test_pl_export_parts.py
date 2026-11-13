"""Profitability → View → Trip Profitability / Truck Profitability / Both
(pl_export.build `part`): each half keeps its own sheets plus Rates, never
points at a sheet it dropped, and names the other half's total."""
import re
from io import BytesIO

from openpyxl import load_workbook

Q = {"start_date": "2026-01-01", "end_date": "2026-12-31", "mode": "Advanced"}


def _book(api, part):
    res = api.get("/pl-summary/export", params={**Q, "part": part})
    return load_workbook(BytesIO(res.content)), res.headers["content-disposition"]


def _summary(api, part):
    return api.get("/pl-summary/export-preview", params={**Q, "part": part})["sheets"][0]["rows"]


def test_each_part_keeps_its_own_sheets(api):
    sheets = {}
    for part in ("both", "trips", "trucks"):
        wb, disp = _book(api, part)
        sheets[part] = wb.sheetnames
        names = set(wb.sheetnames)
        for ws in wb.worksheets:                         # no formula points at a sheet this file doesn't have
            for row in ws.iter_rows():
                for c in row:
                    if isinstance(c.value, str) and c.value.startswith("="):
                        assert set(re.findall(r"([A-Za-z][A-Za-z ]+)!", c.value)) <= names, (part, ws.title, c.value)
        assert {"both": "Profitability_", "trips": "Trip_Profitability_", "trucks": "Truck_Profitability_"}[part] in disp
    assert sheets["both"] == ["Summary", "Trips", "Trip Expenses", "Trucks", "Rates", "Maintenance", "EMI"]
    assert sheets["trips"] == ["Summary", "Trips", "Trip Expenses", "Rates"]
    assert sheets["trucks"] == ["Summary", "Trucks", "Rates", "Maintenance", "EMI"]
    assert api.get("/pl-summary/export", params=Q).headers["content-disposition"] == _book(api, "both")[1]   # default = both


def test_each_half_names_the_others_total(api):
    full = _summary(api, "both")
    profits = [r[1] for r in full if r and str(r[0]).startswith("Profit after all costs")]
    trip_total, truck_total = profits[0], profits[1]
    trips, trucks = _summary(api, "trips"), _summary(api, "trucks")
    assert trips[0][0] == "Trip Profitability Report" and trucks[0][0] == "Truck Profitability Report"
    assert next(r[1] for r in trips if str(r[0]).startswith("Truck Profitability for the same period")) == truck_total
    assert next(r[1] for r in trucks if str(r[0]).startswith("Trip Profitability for the same period")) == trip_total
    assert not any("TRUCK PROFITABILITY —" in str(r[0]) for r in trips)
    assert not any("TRIP PROFITABILITY —" in str(r[0]) or "HOW ONE TRIP" in str(r[0]) for r in trucks)
