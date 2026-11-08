"""Fixed monthly costs on Profitability — EMI, documents and maintenance, two ways.

Truck Profitability (what really happened): one EMI instalment per calendar
month while a loan runs, whatever the month's length (a 31-day month isn't
31/30 of an EMI); only a month the loan starts or ends in is split, by that
month's own days. See emi_for_period / loan_window.

Trip Profitability (was this trip a good deal?): a STEADY cost per km, so a
trip is judged on its own hire, km and expenses — not on how busy the rest of
the month was, or whether a loan has ended since:

    ₹/km = the truck's monthly cost (as of the trip's month) ÷ a monthly km

    monthly cost  EMI: the instalments due that month (loans running then)
                  Documents: that month's share of the documents held then
                  Maintenance: the truck's normal monthly bills — the 12 months
                  up to the end of that month
    monthly km    Basic:    the km/day setting for its tyre layout × 26
                            (Admin → Truck Run Configuration)
                  Advanced: the truck's NORMAL km a month — the average of the
                            months it actually worked, in the 6 up to the trip's
                            month. Idle months don't count; a month only partly
                            worked (its first month, the month in progress) is
                            scaled up to a full month, and left out altogether
                            when there are full months to go on.

The difference between the two tabs is then real information — EMI for idle
days and quiet months, repairs above normal — shown by pl_compute.reconcile.

Per-km running costs are also taken AS OF THE TRIP'S MONTH, so a past month's
figures don't move when prices or tyres change later (month_running_costs):

    Diesel ₹/km = the average price paid per litre in that month's fuel fills
                  (the whole fleet's, impossible prices left out; Fuel History's
                  base price if there were none) ÷ the truck's mileage from its
                  fills up to that month's end
    Tyres ₹/km  = Advanced: the tyres fitted at that month's end (cost ÷ range)
"""
from calendar import monthrange
from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from cost_units import WORKING_DAYS_PER_MONTH

Month = tuple[int, int]
WINDOW_MONTHS = 6
MODES = ("Basic", "Advanced")
_EARLIEST, _LATEST = date(1900, 1, 1), date(9999, 12, 31)


def _months(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def _shift(month: Month, back: int) -> Month:
    """`back` months before `month` (negative: after)."""
    y, m = divmod(month[0] * 12 + (month[1] - 1) - back, 12)
    return y, m + 1


def month_bounds(month: Month) -> tuple[date, date]:
    y, m = month
    return date(y, m, 1), date(y, m, monthrange(y, m)[1])


def loan_window(rec) -> tuple[date, date]:
    """When a loan runs. No start date: it's been running all along. No end
    date: start + tenure (the day before the first instalment that isn't due),
    or open-ended when there's no tenure either."""
    start = rec.emi_start_date or _EARLIEST
    end = rec.emi_end_date
    if end is None and rec.emi_start_date and rec.tenure_months:
        y, m = _shift((start.year, start.month), -int(rec.tenure_months))
        end = date(y, m, min(start.day, monthrange(y, m)[1])) - timedelta(days=1)
    return start, end or _LATEST


def emi_for_period(amount, loan_start: date | None, loan_end: date | None, start: date, end: date) -> float:
    """A loan's EMI for [start, end]: one instalment per calendar month it
    runs; a month only partly inside (the range's or the loan's ends) counts
    by that month's own days. A missing start/end means open on that side."""
    if not amount:
        return 0.0
    s, e = max(start, loan_start or _EARLIEST), min(end, loan_end or _LATEST)
    if s > e:
        return 0.0
    amt = float(amount)
    total = 0.0
    for month in _months(s, e):
        first, last = month_bounds(month)
        a, b = max(s, first), min(e, last)
        total += amt * ((b - a).days + 1) / ((last - first).days + 1)
    return round(total, 2)


def emi_gaps(amount, loan_start: date | None, loan_end: date | None, start: date, end: date,
             today: date, left: date | None = None) -> dict:
    """Why a loan's EMI for [start, end] can be less than its full instalments
    — so the page can say where the rest is. `full` is one instalment for each
    calendar month the period touches; every day of those months that isn't
    counted is put in a segment with its reason (first that applies):

      outside   before the period's first day / after its last (dates picked)
      loan      before the loan started / after it ended
      sold      after the truck left the fleet
      future    after today (the month isn't over)

    full − Σ segment amounts = the EMI counted (emi_for_period up to today/left)."""
    if not amount:
        return {"full": 0.0, "segments": []}
    amt = float(amount)
    ls, le = loan_start or _EARLIEST, loan_end or _LATEST
    months = list(_months(start, end))
    full = 0.0
    segments: list[dict] = []
    for month in months:
        first, last = month_bounds(month)
        if last < ls or first > le:
            continue   # the loan wasn't running at all this month: no instalment due
        full += amt
        n = (last - first).days + 1
        run: dict | None = None
        d = first
        while d <= last:
            if d < start or d > end:
                why = "outside"
            elif d < ls:
                why = "loan_start"
            elif d > le:
                why = "loan_end"
            elif left is not None and d > left:
                why = "sold"
            elif d > today:
                why = "future"
            else:
                why = None
            if why and run and run["reason"] == why and run["to"] == d - timedelta(days=1):
                run["to"] = d
                run["days"] += 1
            elif why:
                run = {"reason": why, "from": d, "to": d, "days": 1, "month_days": n}
                segments.append(run)
            else:
                run = None
            d += timedelta(days=1)
    out = []
    for s in segments:
        out.append({"reason": s["reason"], "from": s["from"].isoformat(), "to": s["to"].isoformat(),
                    "amount": round(amt * s["days"] / s["month_days"], 2)})
    return {"full": round(full, 2), "segments": out}


def loan_emi(rec, start: date, end: date) -> float:
    return emi_for_period(rec.emi_amount, *loan_window(rec), start, end)


def _loans_by_reg(db: Session) -> dict[str, list]:
    loans: dict[str, list] = {}
    for rec in db.query(models.EmiRecord).all():
        reg = (rec.truck_registration or "").strip().upper()
        if reg:
            loans.setdefault(reg, []).append(rec)
    return loans


def _truck_info(db: Session) -> dict[str, dict]:
    """{truck business id: {id, registration, layout, left (the day it left the fleet)}}."""
    out = {}
    for t in db.query(models.Truck.id, models.Truck.truck_id, models.Truck.registration_number,
                      models.Truck.tyre_layout, models.Truck.deleted_at).all():
        left = t.deleted_at.date() if isinstance(t.deleted_at, datetime) else t.deleted_at
        out[(t.truck_id or "").strip()] = {"id": t.id, "reg": (t.registration_number or "").strip().upper(),
                                            "layout": t.tyre_layout or "", "left": left}
    return out


def _counted_trips(db: Session):
    """(vehicle, km, day) of the trips the page counts: trip sheets with km,
    not deleted, not under audit review."""
    from routers.pl_summary import TRIP_DAY
    return (
        db.query(models.TripSheet.vehicle_id, models.TripSheet.total_km, TRIP_DAY)
        .join(models.Trip, models.Trip.id == models.TripSheet.trip_id)
        .outerjoin(models.TripClosure, models.TripClosure.trip_id == models.TripSheet.trip_id)
        .filter(models.Trip.deleted_at.is_(None), models.Trip.flagged_for_recheck.isnot(True),
                models.TripSheet.total_km > 0)
    ), TRIP_DAY


def _as_day(d):
    return d.date() if isinstance(d, datetime) else d


def _month_km(db: Session, lo: date, hi: date, truck_ids: set[str]) -> dict[tuple[str, Month], float]:
    """km driven per truck per month by the trips the page counts."""
    q, day_col = _counted_trips(db)
    km: dict[tuple[str, Month], float] = {}
    for vid, total_km, day in q.filter(day_col >= lo, day_col <= hi).all():
        vid, day = (vid or "").strip(), _as_day(day)
        if vid in truck_ids and day:
            key = (vid, (day.year, day.month))
            km[key] = km.get(key, 0.0) + float(total_km)
    return km


def _first_trip_days(db: Session, truck_ids: set[str]) -> dict[str, date]:
    q, day_col = _counted_trips(db)
    rows = q.with_entities(models.TripSheet.vehicle_id, func.min(day_col)).group_by(models.TripSheet.vehicle_id).all()
    return {(v or "").strip(): _as_day(d) for v, d in rows if (v or "").strip() in truck_ids and d}


def normal_km(month_km: dict[Month, float], month: Month, first_day: date | None, today: date,
              left: date | None = None) -> tuple[float, int]:
    """(normal km a month, months it's based on) as of `month`: see the top of the file."""
    full, part = [], []
    for m in (_shift(month, i) for i in range(WINDOW_MONTHS)):
        k = month_km.get(m, 0.0)
        if k <= 0:
            continue
        first, last = month_bounds(m)
        start = max(first, first_day) if first_day else first
        end = min(last, today, left) if left else min(last, today)   # a sold truck stopped the day it left
        worked_days = (end - start).days + 1
        all_days = (last - first).days + 1
        if worked_days >= all_days:
            full.append(k)
        elif worked_days > 0:
            part.append(k * all_days / worked_days)
    used = full or part
    return (sum(used) / len(used), len(used)) if used else (0.0, 0)


def normal_km_all(db: Session, month: Month | None = None) -> dict[str, tuple[float, int]]:
    """{truck business id: (normal km a month, months it's based on)} as of
    `month` (default: this month) — what Advanced divides monthly costs by
    everywhere (the calculator, Cost Breakdown, Full Status, EMI Insights)."""
    today = date.today()
    month = month or (today.year, today.month)
    trucks = {(t.truck_id or "").strip() for t in db.query(models.Truck.truck_id).all()} - {""}
    lo = month_bounds(_shift(month, WINDOW_MONTHS - 1))[0]
    km = _month_km(db, lo, month_bounds(month)[1], trucks)
    first_days = _first_trip_days(db, trucks)
    per_truck: dict[str, dict[Month, float]] = {}
    for (tid, m), k in km.items():
        per_truck.setdefault(tid, {})[m] = k
    return {tid: normal_km(per_truck.get(tid, {}), month, first_days.get(tid), today) for tid in trucks}


def month_rates(db: Session, wanted: set[tuple[str, Month]]) -> dict[tuple[str, Month], dict]:
    """For each (truck, month): its EMI, documents and normal maintenance for
    that month, the monthly km each mode divides by, and the steady ₹/km
    they give — {"rates": {"Basic": {...}, "Advanced": {...}}} (None when
    there's no cost or no km)."""
    wanted = {w for w in wanted if w[1]}
    if not wanted:
        return {}
    from compliance_cost import document_periods, share_in_range
    from routers.maintenance import maintenance_cost_summary_all

    loans = _loans_by_reg(db)
    info = _truck_info(db)
    trucks = {t for t, _ in wanted}
    lo = month_bounds(_shift(min(m for _, m in wanted), WINDOW_MONTHS - 1))[0]
    hi = month_bounds(max(m for _, m in wanted))[1]
    km = _month_km(db, lo, hi, trucks)
    first_days = _first_trip_days(db, trucks)
    docs = document_periods(db, {info[t]["id"] for t in trucks if t in info})
    # Normal maintenance as of each month's end (bills known by then).
    maint_by_month = {m: maintenance_cost_summary_all(db, as_of=min(month_bounds(m)[1], date.today()))
                      for m in {m for _, m in wanted}}
    km_per_day = {c.tyre_layout: float(c.km_per_day or 0) for c in db.query(models.TruckRunConfig).all()}
    today = date.today()

    out = {}
    for tid, month in wanted:
        t = info.get(tid) or {"id": None, "reg": "", "layout": "", "left": None}
        first, last = month_bounds(month)
        if t["left"] is not None:
            last = min(last, t["left"])
        held = last >= first
        emi = round(sum(loan_emi(l, first, last) for l in loans.get(t["reg"], [])), 2) if held else 0.0
        doc = round(sum(share_in_range(p, first, last) for p in docs.get(t["id"], [])), 2) if held else 0.0
        maintenance = float((maint_by_month[month].get(t["id"]) or {}).get("monthly") or 0.0)
        per_month = {k[1]: v for k, v in km.items() if k[0] == tid}
        normal, used = normal_km(per_month, month, first_days.get(tid), today, t["left"])
        setting = km_per_day.get(t["layout"], 0.0) * WORKING_DAYS_PER_MONTH
        divisor = {"Basic": setting, "Advanced": normal}
        out[(tid, month)] = {
            "month": f"{month[0]}-{month[1]:02d}",
            "emi": emi, "documents": doc, "maintenance": round(maintenance, 2),
            "normal_km": round(normal, 1), "months_used": used, "setting_km": round(setting, 1),
            "rates": {
                mode: {
                    "km": round(divisor[mode], 1),
                    "emi": emi / divisor[mode] if emi > 0 and divisor[mode] > 0 else None,
                    "documents": doc / divisor[mode] if doc > 0 and divisor[mode] > 0 else None,
                    "maintenance": maintenance / divisor[mode] if maintenance > 0 and divisor[mode] > 0 else None,
                }
                for mode in MODES
            },
        }
    return out


def month_running_costs(db: Session, wanted: set[tuple[str, Month]]) -> dict[tuple[str, Month], dict]:
    """For each (truck, month): the diesel price that month, the truck's
    mileage as of the month's end and the diesel ₹/km they give, and (for
    Advanced) the tyre ₹/km of the tyres fitted at the month's end."""
    wanted = {w for w in wanted if w[1]}
    if not wanted:
        return {}
    from routers.maintenance import fuel_mileage_all
    from routers.running_cost import _fuel_base_price

    info = _truck_info(db)
    base_price = _fuel_base_price(db)
    today = date.today()
    ranges = {r.tyre_type: r.range_km for r in db.query(models.TyreRangeConfig).all() if r.range_km}
    fitments = db.query(models.TyreFitmentRecord.truck_id, models.TyreFitmentRecord.fitted_date,
                        models.TyreFitmentRecord.removed_date, models.TyreInventory.cost, models.TyreInventory.tyre_type) \
        .join(models.TyreInventory, models.TyreInventory.id == models.TyreFitmentRecord.tyre_id).all()

    by_month: dict[Month, dict] = {}
    for month in {m for _, m in wanted}:
        first, last = month_bounds(month)
        ref = min(last, today)
        # Average price paid per litre that month — a fill whose own price is
        # impossible (₹0, or a total typed in the price box) is left out.
        lo_p, hi_p = (base_price * 0.5, base_price * 2) if base_price else (50.0, 200.0)
        fills = [(float(l), float(c)) for l, c in db.query(models.FuelLog.litres, models.FuelLog.total_cost)
                 .filter(models.FuelLog.date >= first, models.FuelLog.date <= last).all()
                 if l and c and float(l) > 0 and lo_p <= float(c) / float(l) <= hi_p]
        fill_litres = sum(l for l, _ in fills)
        paid = sum(c for _, c in fills) / fill_litres if fill_litres > 0 else None
        tyres: dict[int, float] = {}
        for truck_id, fitted, removed, tyre_cost, tyre_type in fitments:
            rng = ranges.get(tyre_type)
            if fitted and fitted <= ref and (removed is None or removed > ref) and tyre_cost and rng:
                tyres[truck_id] = tyres.get(truck_id, 0.0) + float(tyre_cost) / rng
        by_month[month] = {
            "price": paid or base_price or None, "price_paid": paid is not None,
            "mileage": fuel_mileage_all(db, until=ref), "tyres": tyres,
        }

    out = {}
    for tid, month in wanted:
        m = by_month[month]
        db_id = (info.get(tid) or {}).get("id")
        mileage = m["mileage"].get(str(db_id)) if db_id is not None else None
        out[(tid, month)] = {
            "diesel_price": m["price"], "price_paid": m["price_paid"], "mileage": mileage,
            "diesel_rate": m["price"] / mileage if m["price"] and mileage else None,
            "tyre_rate": m["tyres"].get(db_id),
        }
    return out


def trip_month(trip_date) -> Month | None:
    if not trip_date:
        return None
    d = date.fromisoformat(str(trip_date)[:10])
    return d.year, d.month
