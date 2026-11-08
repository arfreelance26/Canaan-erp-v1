"""Trip and Truck Profitability against hand-worked answers.

A small fleet in early 2024 (dates no other test uses), every figure below
worked out by hand from the rules in pl_compute.py / emi_alloc.py:

  Truck A  EMI ₹60,000 (2023–2030) · diesel ₹100/L at 4 km/L = ₹25/km ·
           tyres ₹50,000 / 1,00,000 km = ₹0.50/km · insurance ₹36,600 for
           2024 (366 days = ₹100 a day) · a ₹12,000 repair on 10 Feb ·
           a 2nd loan ₹30,000 from 16 Mar, 12 months, no end date
           Dec 6,000 km (1 trip) · Jan busy 3 × 2,000 km · Feb quiet 1,500 km
           + a 0-km trip + a 1,000 km trip under audit review · Mar idle ·
           Apr 3,000 km
  Truck B  EMI ₹40,000, never runs
  Truck C  no fuel logs (no diesel rate), a 1,000 km trip in Jan
  Truck D  EMI ₹30,000, a 1,000 km trip on 5 Feb, sold on 15 Feb
"""
import secrets
from datetime import date, datetime

import pytest

import pl_compute

TAG = secrets.token_hex(3).upper()
LAYOUT = f"PT-LAYOUT-{TAG}"      # its own km/day setting: 200 km a day → 5,200 km a month in Basic
TYRE_TYPE = f"PT-TYRE-{TAG}"


def _ids(letter):
    return f"PT-S{letter}{TAG}", f"TN99S{letter}{TAG}"


def _month(y, m):
    from calendar import monthrange
    return date(y, m, 1), date(y, m, monthrange(y, m)[1])


@pytest.fixture(scope="module")
def fleet(app):
    import models
    from database import SessionLocal

    db = SessionLocal()
    db.add(models.TruckRunConfig(tyre_layout=LAYOUT, km_per_day=200))
    db.add(models.TyreRangeConfig(tyre_type=TYRE_TYPE, range_km=100_000))
    trucks = {}
    for letter in "ABCD":
        tid, reg = _ids(letter)
        t = models.Truck(truck_id=tid, registration_number=reg, manufacturer="Tata", model_name="Signa",
                         truck_type="20 FT RIGID", tyre_layout=LAYOUT, odometer=0,
                         created_at=datetime(2023, 1, 1))
        db.add(t)
        trucks[letter] = t
    db.flush()

    def loan(letter, amount, start, end=None, tenure=None):
        db.add(models.EmiRecord(emi_name=f"Pytest {letter}", truck_registration=trucks[letter].registration_number,
                                emi_amount=amount, emi_start_date=start, emi_end_date=end, tenure_months=tenure))

    loan("A", 60_000, date(2023, 1, 1), date(2030, 12, 31))
    loan("A", 30_000, date(2024, 3, 16), None, 12)
    loan("B", 40_000, date(2023, 1, 1), date(2030, 12, 31))
    loan("D", 30_000, date(2023, 1, 1), date(2030, 12, 31))

    # Diesel: ₹100 a litre, 400 km per 100 L = 4 km/L, a fill every month.
    for letter in "AD":
        odo = 0
        for d in ["2023-11-01", "2023-11-15", "2023-12-01", "2024-01-05", "2024-02-05", "2024-03-05", "2024-04-05"]:
            db.add(models.FuelLog(truck_id=trucks[letter].id, date=date.fromisoformat(d), odometer=odo,
                                  litres=100, price_per_litre=100, total_cost=10_000))
            odo += 400

    tyre = models.TyreInventory(brand="Pytest", tyre_number=f"PT-{TAG}", tyre_type=TYRE_TYPE, cost=50_000)
    db.add(tyre)
    db.flush()
    db.add(models.TyreFitmentRecord(tyre_id=tyre.id, truck_id=trucks["A"].id, position="FL",
                                    fitted_odometer=0, fitted_date=date(2023, 11, 1)))
    db.add(models.MaintenanceRecord(truck_id=trucks["A"].id, date=date(2024, 2, 10), odometer=10_000,
                                    maintenance_type="Pytest", cost=12_000))
    db.add(models.TruckComplianceRecord(truck_id=trucks["A"].id, doc_type="insurance", kind="First entry", valid_from=date(2024, 1, 1),
                                        valid_until=date(2025, 1, 1), expense=36_600))

    n = [0]

    def trip(letter, day, km, hire, expense, flagged=False):
        n[0] += 1
        code = f"PT-SC{TAG}-{n[0]}"
        t = models.Trip(trip_id=code, booking_reference_no=code, booking_created_date=date.fromisoformat(day),
                        status="Completed", vehicle_id=trucks[letter].truck_id, flagged_for_recheck=flagged)
        db.add(t)
        db.flush()
        db.add(models.TripSheet(trip_id=t.id, vehicle_id=trucks[letter].truck_id, total_km=km, hire_amount=hire,
                                total_expense=expense, trip_completed_date=date.fromisoformat(day),
                                trip_sheet_date=date.fromisoformat(day)))

    trip("A", "2023-12-01", 6_000, 150_000, 10_000)
    for d in ("2024-01-05", "2024-01-15", "2024-01-25"):
        trip("A", d, 2_000, 60_000, 5_000)
    trip("A", "2024-02-08", 1_500, 40_000, 3_000)
    trip("A", "2024-02-12", 0, 10_000, 500)                     # no km on its sheet
    trip("A", "2024-02-20", 1_000, 99_999, 1, flagged=True)     # under audit review
    trip("A", "2024-04-10", 3_000, 90_000, 6_000)
    trip("C", "2024-01-10", 1_000, 30_000, 2_000)
    trip("D", "2024-02-05", 1_000, 30_000, 2_000)
    db.commit()
    trucks["D"].deleted_at = datetime(2024, 2, 15)
    db.commit()
    ids = {k: v.truck_id for k, v in trucks.items()}
    yield ids
    db.close()


def _run(db, start, end, mode):
    r = pl_compute.compute(db, start, end, mode, "", rounded=False)
    return r


def _truck(r, tid):
    return next(e for e in r["trucks"] if e["truck_id"] == tid)


def _trips(r, tid, counted=True):
    return [t for t in r["trips"] if t["truck_id"] == tid and (not counted or not t.get("excluded_from_totals"))]


def approx(a, b, tol=0.01):
    return a is not None and abs(a - b) <= tol


# ── Advanced ─────────────────────────────────────────────────────────────────

def test_busy_month_both_tabs_agree(fleet, db):
    r = _run(db, *_month(2024, 1), "Advanced")
    A = fleet["A"]
    # Normal km for January: December 6,000 and January 6,000 → 6,000.
    for t in _trips(r, A):
        m = t["money"]
        assert approx(m["diesel"], 2_000 * 25)                       # ₹25/km
        assert approx(m["split"]["emi"], 2_000 * 60_000 / 6_000)     # ₹10/km → ₹20,000
        assert approx(m["split"]["tyre"], 2_000 * 0.5)
        assert m["split"]["maintenance"] is None                     # no bills known by 31 Jan
        assert approx(m["split"]["compliance"], 2_000 * 3_100 / 6_000)
        assert approx(m["final_profit"], 60_000 - 5_000 - 50_000 - 20_000 - 1_000 - 2_000 * 3_100 / 6_000)
    e = _truck(r, A)
    assert approx(float(e["emi_share"]), 60_000) and approx(float(e["document_share"]), 3_100)
    assert approx(e["money"]["net"], 180_000 - 15_000 - 150_000 - 3_000 - 0 - 60_000 - 3_100)
    # A normal-length month at normal km: the two tabs agree exactly.
    assert approx(sum(t["money"]["final_profit"] for t in _trips(r, A)), e["money"]["net"])


def test_quiet_month_trips_stay_steady_and_the_truck_shows_the_real_cost(fleet, db):
    r = _run(db, *_month(2024, 2), "Advanced")
    A = fleet["A"]
    normal = (6_000 + 6_000 + 1_500) / 3                             # the flagged trip and the 0-km trip don't count
    judged = [t for t in _trips(r, A) if t["money"]["final_profit"] is not None]
    assert len(judged) == 1
    m = judged[0]["money"]
    assert approx(m["split"]["emi"], 1_500 * 60_000 / normal)       # = ₹20,000: the same ₹13.33/km as any Feb trip
    assert approx(m["split"]["maintenance"], 1_500 * (12_000 / 12) / normal)
    assert approx(m["split"]["compliance"], 1_500 * 2_900 / normal)
    trip_final = 40_000 - 3_000 - 37_500 - 1_500 * 60_000 / normal - 750 - 1_500 * 1_000 / normal - 1_500 * 2_900 / normal
    assert approx(m["final_profit"], trip_final)

    e = _truck(r, A)
    # Trucks tab: the 0-km trip's hire counts; the flagged trip doesn't; the real ₹12,000 bill and the full EMI.
    assert approx(float(e["total_hire_amount"]), 50_000) and approx(float(e["maintenance_expenses"]), 12_000)
    net = 50_000 - 3_500 - 37_500 - 750 - 12_000 - 60_000 - 2_900
    assert approx(e["money"]["net"], net)
    rc = e["money"]["reconcile"]
    assert approx(rc["emi"], 1_500 * 60_000 / normal - 60_000)
    assert approx(rc["maintenance"], 1_500 * 1_000 / normal - 12_000)
    assert approx(rc["other"], 10_000 - 500)                         # the 0-km trip
    assert approx(rc["trips_final"] + rc["emi"] + rc["maintenance"] + rc["documents"] + rc["other"], net)
    # The trip under audit review is listed but in no total.
    assert [t for t in _trips(r, A, counted=False) if t.get("excluded_from_totals")]
    zero = [t for t in _trips(r, A) if float(t["total_km"]) == 0][0]
    assert zero["money"]["final_profit"] is None


def test_idle_month_and_idle_truck(fleet, db):
    r = _run(db, *_month(2024, 3), "Advanced")
    e = _truck(r, fleet["A"])
    # The 2nd loan starts on 16 March: 16 of 31 days. Insurance: 31 days × ₹100.
    emi = 60_000 + 30_000 * 16 / 31
    assert approx(float(e["emi_share"]), emi) and approx(e["money"]["net"], -(emi + 3_100))
    assert not _trips(r, fleet["A"])
    b = _truck(r, fleet["B"])
    assert approx(float(b["emi_share"]), 40_000) and approx(b["money"]["net"], -40_000)
    assert approx(b["money"]["reconcile"]["emi"], -40_000)


def test_a_loan_with_no_end_date_runs_its_tenure(fleet, db):
    r = _run(db, *_month(2024, 4), "Advanced")
    e = _truck(r, fleet["A"])
    assert approx(float(e["emi_share"]), 90_000)
    normal = (6_000 + 6_000 + 1_500 + 3_000) / 4                     # March (idle) left out
    t = _trips(r, fleet["A"])[0]
    assert approx(t["money"]["split"]["emi"], 3_000 * 90_000 / normal)
    # Ends 12 months on: March 2025 counts 15 of 31 days, April 2025 nothing.
    from emi_alloc import loan_window
    import models
    rec = db.query(models.EmiRecord).filter_by(emi_name="Pytest A", tenure_months=12).one()
    assert loan_window(rec) == (date(2024, 3, 16), date(2025, 3, 15))


def test_a_sold_truck_stops_costing_the_day_it_left(fleet, db):
    r = _run(db, *_month(2024, 2), "Advanced")
    d = _truck(r, fleet["D"])
    assert approx(float(d["emi_share"]), 30_000 * 15 / 29)          # 1–15 Feb of a 29-day February
    t = _trips(r, fleet["D"])[0]
    # Its only month worked, 5–15 Feb (11 days of 29), scaled to a full month.
    assert approx(t["money"]["split"]["emi"], 1_000 * (30_000 * 15 / 29) / (1_000 * 29 / 11))


def test_no_diesel_rate_means_the_trip_is_not_judged(fleet, db):
    r = _run(db, *_month(2024, 1), "Advanced")
    t = _trips(r, fleet["C"])[0]
    assert t["money"]["final_profit"] is None and t["money"]["diesel"] is None
    assert _truck(r, fleet["C"])["money"]["incomplete"]


def test_months_add_up_and_a_part_month_is_split_by_its_own_days(fleet, db):
    A = fleet["A"]
    months = [_run(db, *_month(2024, m), "Advanced") for m in (1, 2, 3, 4)]
    whole = _run(db, date(2024, 1, 1), date(2024, 4, 30), "Advanced")
    assert approx(sum(_truck(r, A)["money"]["net"] for r in months), _truck(whole, A)["money"]["net"], 0.05)
    for r in months:
        for t in _trips(r, A):
            if t["money"]["final_profit"] is not None:
                same = next(x for x in _trips(whole, A) if x["trip_code"] == t["trip_code"])
                assert approx(same["money"]["final_profit"], t["money"]["final_profit"])   # a trip doesn't change with the range
    part = _run(db, date(2024, 1, 15), date(2024, 2, 14), "Advanced")
    assert approx(float(_truck(part, A)["emi_share"]), 60_000 * 17 / 31 + 60_000 * 14 / 29)


# ── Basic ────────────────────────────────────────────────────────────────────

def test_basic_divides_by_the_km_per_day_setting(fleet, db):
    r = _run(db, *_month(2024, 1), "Basic")
    for t in _trips(r, fleet["A"]):
        m = t["money"]
        assert approx(m["diesel"], 2_000 * 25)
        assert approx(m["split"]["emi"], 2_000 * 60_000 / 5_200)     # 200 km a day × 26
        assert approx(m["split"]["compliance"], 2_000 * 3_100 / 5_200)
    e = _truck(r, fleet["A"])
    assert approx(float(e["emi_share"]), 60_000)                     # the Trucks tab is the same in both modes


def test_a_typed_wrong_fill_price_doesnt_change_the_months_diesel_price(fleet, db):
    import emi_alloc
    import models
    a = db.query(models.Truck).filter(models.Truck.truck_id == fleet["A"]).one()
    db.add(models.FuelLog(truck_id=a.id, date=date(2024, 5, 3), odometer=2_800, litres=100, price_per_litre=100, total_cost=10_000))
    db.add(models.FuelLog(truck_id=a.id, date=date(2024, 5, 9), odometer=3_200, litres=7, price_per_litre=1_428, total_cost=9_996))
    db.add(models.FuelLog(truck_id=a.id, date=date(2024, 5, 20), odometer=3_600, litres=100, price_per_litre=0, total_cost=0))
    db.commit()
    may = emi_alloc.month_running_costs(db, {(fleet["A"], (2024, 5))})[(fleet["A"], (2024, 5))]
    assert may["price_paid"] and abs(may["diesel_price"] - 100) < 1e-6
