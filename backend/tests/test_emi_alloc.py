"""EMI and documents on Profitability (emi_alloc.py): one instalment per
calendar month on the Trucks tab; on the Trips tab a steady ₹/km — the
month's cost ÷ the truck's normal km per month — so a trip's figure doesn't
swing with how busy the rest of the month was."""
from calendar import monthrange
from datetime import date

import emi_alloc
from emi_alloc import emi_for_period
from world import complete_and_close, fresh_trip, tag

LOAN = (date(2024, 1, 5), date(2028, 12, 5))


def test_a_whole_month_is_one_instalment_whatever_its_length():
    for start, end in [(date(2026, 9, 1), date(2026, 9, 30)), (date(2026, 10, 1), date(2026, 10, 31)),
                       (date(2026, 2, 1), date(2026, 2, 28))]:
        assert emi_for_period(50_000, *LOAN, start, end) == 50_000
    assert emi_for_period(50_000, *LOAN, date(2026, 1, 1), date(2026, 12, 31)) == 600_000


def test_part_of_a_month_counts_by_that_months_days():
    assert emi_for_period(31_000, *LOAN, date(2026, 10, 1), date(2026, 10, 15)) == 15_000
    # The loan's own first and last months are split the same way.
    assert emi_for_period(30_000, date(2026, 9, 16), date(2027, 1, 1), date(2026, 9, 1), date(2026, 9, 30)) == 15_000
    assert emi_for_period(30_000, *LOAN, date(2029, 1, 1), date(2029, 1, 31)) == 0
    assert emi_for_period(None, *LOAN, date(2026, 9, 1), date(2026, 9, 30)) == 0


def _truck_with_loan(api, world, emi=60_000):
    trip = fresh_trip(api, world)
    truck = next(t for t in api.get("/trucks") if t["truck_id"] == trip["vehicle_id"])
    api.post("/finance/emi", json={
        "emi_name": f"Pytest loan {tag()}", "truck_registration": truck["registration_number"],
        "bank_name": "Pytest Bank", "loan_amount": 2_600_000, "emi_amount": emi, "tenure_months": 60,
        "emi_start_date": "2024-01-01", "emi_end_date": "2030-01-01",
    })
    return trip, truck


def test_busy_and_quiet_months_get_the_same_steady_rate(api, world, db, monkeypatch):
    _, truck = _truck_with_loan(api, world)
    tid = truck["truck_id"]
    # Six months: one busy, one quiet, one normal, three idle.
    km = {(2026, 4): 9_000, (2026, 5): 3_000, (2026, 6): 0, (2026, 7): 0, (2026, 8): 0, (2026, 9): 6_000}
    monkeypatch.setattr(emi_alloc, "_month_km",
                        lambda db, lo, hi, trucks: {(tid, m): k for m, k in km.items() if k})
    rates = emi_alloc.month_rates(db, {(tid, (2026, 9)), (tid, (2026, 5))})
    sep, may = rates[(tid, (2026, 9))], rates[(tid, (2026, 5))]
    # (9,000 + 3,000 + 6,000) ÷ 3 — the idle months don't drag the normal down.
    assert sep["normal_km"] == 6_000 and sep["months_used"] == 3
    assert abs(sep["rates"]["Advanced"]["emi"] - 10.0) < 1e-9          # ₹60,000 ÷ 6,000 km
    # May looks back at its own 6 months: April and May.
    assert may["normal_km"] == 6_000 and abs(may["rates"]["Advanced"]["emi"] - 10.0) < 1e-9


def test_a_trip_carries_the_steady_rate_on_both_page_and_breakdown(api, world):
    trip, truck = _truck_with_loan(api, world, emi=52_000)
    complete_and_close(api, trip)
    api.post(f"/trips/{trip['id']}/sheet", json={
        "trip_sheet_no": f"TS-{trip['trip_id']}", "trip_sheet_date": date.today().isoformat(),
        "vehicle_id": trip["vehicle_id"], "start_km": 1000, "end_km": 1040, "hire_amount": 12000,
    })
    today = date.today()
    window = {"start_date": today.replace(day=1).isoformat(),
              "end_date": today.replace(day=monthrange(today.year, today.month)[1]).isoformat()}
    # The Trucks tab counts this month up to today; trips use the month's full instalment.
    due = emi_for_period(52_000, date(2024, 1, 1), date(2030, 1, 1), today.replace(day=1), today)
    for mode in ("Basic", "Advanced"):
        res = api.get("/pl-summary/computed", params={**window, "mode": mode})
        row = next(e for e in res["trucks"] if e["truck_id"] == truck["truck_id"])
        assert float(row["emi_share"]) == due
        mine = [t for t in res["trips"] if t["truck_id"] == truck["truck_id"]]
        assert len(mine) == 1
        # This test truck has no fuel logs, so no diesel rate: the trip isn't judged.
        assert mine[0]["money"]["final_profit"] is None
        why = res["truck_totals"]["why_differ"]
        assert set(why) >= {"trips_final", "emi", "maintenance", "documents", "other", "no_km_trips"}

    # Its only month on record — its first, still in progress, worked since its
    # first trip today — is scaled to a full month: 40 km a day.
    fm = api.get(f"/pl-summary/trip-breakdown/{trip['id']}")["fixed_month"]
    first, last = emi_alloc.month_bounds((today.year, today.month))
    full_month = 40 * ((last - first).days + 1)
    assert fm["emi"] == 52_000 and abs(fm["normal_km"] - round(full_month, 1)) < 0.11
    assert abs(fm["rates"]["Advanced"]["emi"] - 52_000 / full_month) < 0.01


# ---------------------------------------------------------------- edge cases

class _Loan:
    def __init__(self, start=None, end=None, tenure=None, amount=30_000):
        self.emi_start_date, self.emi_end_date, self.tenure_months, self.emi_amount = start, end, tenure, amount


def test_loan_dates_that_are_missing():
    # No end date: start + tenure (60 instalments from Jan 2024 → last month Dec 2028).
    assert emi_alloc.loan_window(_Loan(date(2024, 1, 1), None, 60)) == (date(2024, 1, 1), date(2028, 12, 31))
    assert emi_alloc.loan_emi(_Loan(date(2024, 1, 1), None, 60), date(2024, 1, 1), date(2030, 12, 31)) == 60 * 30_000
    # No end and no tenure: still running. No start: running all along.
    assert emi_alloc.loan_emi(_Loan(date(2024, 1, 1)), date(2026, 9, 1), date(2026, 9, 30)) == 30_000
    assert emi_alloc.loan_emi(_Loan(None, date(2027, 1, 1)), date(2026, 9, 1), date(2026, 9, 30)) == 30_000
    # A loan that hasn't started yet costs nothing.
    assert emi_alloc.loan_emi(_Loan(date(2027, 1, 1), date(2030, 1, 1)), date(2026, 9, 1), date(2026, 9, 30)) == 0


def test_normal_km_ignores_idle_months_and_scales_part_months():
    today = date(2026, 11, 7)
    # Idle months don't count: (6,000 + 3,000) ÷ 2.
    assert emi_alloc.normal_km({(2026, 9): 6_000, (2026, 8): 3_000}, (2026, 9), date(2025, 1, 1), today) == (4_500, 2)
    # A first month only partly worked (from the 16th of a 30-day month) is left
    # out when there are full months; on its own it's scaled to a full month.
    assert emi_alloc.normal_km({(2026, 9): 1_500, (2026, 10): 6_200}, (2026, 10), date(2026, 9, 16), today) == (6_200, 1)
    assert emi_alloc.normal_km({(2026, 9): 1_500}, (2026, 9), date(2026, 9, 16), today) == (3_000, 1)
    # The month in progress (7 of 30 days so far) only counts when nothing else does.
    km, used = emi_alloc.normal_km({(2026, 11): 1_400}, (2026, 11), date(2026, 11, 1), today)
    assert used == 1 and abs(km - 6_000) < 1e-6
    assert emi_alloc.normal_km({(2026, 11): 1_400, (2026, 10): 6_200}, (2026, 11), date(2026, 1, 1), today) == (6_200, 1)
    assert emi_alloc.normal_km({}, (2026, 11), None, today) == (0.0, 0)


def test_basic_divides_by_the_km_per_day_setting(api, world, db, monkeypatch):
    import models
    _, truck = _truck_with_loan(api, world)
    tid = truck["truck_id"]
    layout = db.query(models.Truck).filter(models.Truck.truck_id == tid).one().tyre_layout
    cfg = db.query(models.TruckRunConfig).filter_by(tyre_layout=layout).first()
    monkeypatch.setattr(emi_alloc, "_month_km", lambda db, lo, hi, trucks: {(tid, (2026, 9)): 6_000})
    r = emi_alloc.month_rates(db, {(tid, (2026, 9))})[(tid, (2026, 9))]
    assert r["rates"]["Advanced"]["km"] == 6_000 and abs(r["rates"]["Advanced"]["emi"] - 10.0) < 1e-9
    if cfg and cfg.km_per_day:
        assert r["rates"]["Basic"]["km"] == round(float(cfg.km_per_day) * 26, 1)
        assert abs(r["rates"]["Basic"]["emi"] - 60_000 / (float(cfg.km_per_day) * 26)) < 1e-9


def test_a_trip_without_a_diesel_rate_is_not_judged():
    import pl_compute
    R = {"diesel": {}, "cpk": {"T": 20.0}, "split": {"T": {"parts_known": True, "emi": 5.0, "adblue": None,
                                                         "tyre": 2.0, "maintenance": 3.0, "compliance": None}}}
    m = pl_compute.trip_money({"total_km": 100, "hire_amount": 10_000, "total_expense": 1_000}, "T", R)
    assert m["final_profit"] is None and m["gross"] is None and m["trip_profit"] == 9_000


def test_impossible_fuel_gaps_are_left_out_of_mileage():
    from routers.maintenance import plausible_fuel
    gaps = [{"distance": d, "litres": l, "mileage": d / l} for d, l in [
        (700, 200), (720, 200), (680, 200),   # normal: 3.4–3.6 km/L
        (842_920, 162),                        # an odometer typo
        (2_598, 135),                          # a fill that was never entered (19 km/L)
        (150, 200),                            # 0.75 km/L — a typo the other way
    ]]
    kept = plausible_fuel(gaps)
    assert [g["distance"] for g in kept] == [700, 720, 680]


# ---------------------------------------------------------------- as of the trip's month

def test_figures_as_of_a_past_month(api, world, db):
    """Mileage, maintenance and the month's diesel figures look only at what was
    known by that month's end — later fills and bills don't change a past month."""
    import models
    from routers.maintenance import fuel_mileage_all, maintenance_cost_summary_all
    _, truck = _truck_with_loan(api, world)
    t = db.query(models.Truck).filter(models.Truck.truck_id == truck["truck_id"]).one()
    for d, odo, litres in [("2026-01-05", 10_000, 100), ("2026-01-20", 10_350, 100),   # 3.5 km/L
                           ("2026-03-05", 10_750, 100), ("2026-03-20", 11_150, 100)]:   # then 4.0 km/L
        db.add(models.FuelLog(truck_id=t.id, date=date.fromisoformat(d), odometer=odo, litres=litres,
                              price_per_litre=100, total_cost=litres * 100))
    db.add(models.MaintenanceRecord(truck_id=t.id, date=date(2026, 3, 10), odometer=11_000,
                                    maintenance_type="Pytest", cost=12_000))
    db.commit()
    assert fuel_mileage_all(db, until=date(2026, 1, 31))[str(t.id)] == 3.5
    # By March's end: 350 + 400 + 400 km on 300 litres.
    assert abs(fuel_mileage_all(db, until=date(2026, 3, 31))[str(t.id)] - 1_150 / 300) < 1e-5
    assert t.id not in maintenance_cost_summary_all(db, as_of=date(2026, 2, 28))   # the bill came later
    assert t.id in maintenance_cost_summary_all(db, as_of=date(2026, 3, 31))

    jan = emi_alloc.month_running_costs(db, {(t.truck_id, (2026, 1))})[(t.truck_id, (2026, 1))]
    assert jan["mileage"] == 3.5 and jan["price_paid"] and abs(jan["diesel_price"] - 100) < 1e-6
    assert abs(jan["diesel_rate"] - 100 / 3.5) < 1e-6


def test_compliance_cost_breakdown_uses_the_document_records(api):
    from world import create_truck
    truck = create_truck(api)
    rows = api.get(f"/trucks/{truck['id']}/compliance-cost")
    assert len(rows) == 7 and {"label", "expense", "per_calendar_day", "skipped"} <= set(rows[0])
    api.get("/trucks/999999999/compliance-cost", expect=404)


def test_where_the_rest_of_the_emi_is_when_less_is_counted():
    from emi_alloc import emi_gaps
    today = date(2026, 11, 8)
    # The month isn't over: 8 of 30 days counted, the rest is 9–30 Nov.
    g = emi_gaps(64_066, date(2024, 2, 1), date(2027, 1, 1), date(2026, 11, 1), date(2026, 11, 30), today)
    assert g["full"] == 64_066 and [(s["reason"], s["from"], s["to"]) for s in g["segments"]] == [("future", "2026-11-09", "2026-11-30")]
    assert abs(g["full"] - sum(s["amount"] for s in g["segments"]) - emi_for_period(64_066, date(2024, 2, 1), date(2027, 1, 1), date(2026, 11, 1), today)) < 0.02
    # Dates that cut two months, a loan starting mid-month, a truck sold mid-month.
    reasons = lambda g: [s["reason"] for s in g["segments"]]  # noqa: E731
    assert reasons(emi_gaps(64_066, None, None, date(2026, 10, 15), date(2026, 11, 14), today)) == ["outside", "future", "outside"]
    assert reasons(emi_gaps(30_000, date(2024, 3, 16), None, date(2024, 3, 1), date(2024, 3, 31), today)) == ["loan_start"]
    assert reasons(emi_gaps(30_000, None, None, date(2024, 2, 1), date(2024, 2, 29), today, date(2024, 2, 15))) == ["sold"]
    # A whole month in the past: everything counted.
    assert emi_gaps(64_066, None, None, date(2026, 9, 1), date(2026, 9, 30), today)["segments"] == []
