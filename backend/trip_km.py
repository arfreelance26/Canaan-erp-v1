"""Trip sheet Start/End KM against the same truck's other trips — one set of
rules for the Trip Sheet form (new sheets and edits), the save, and the
one-time report.

The truck's current odometer only helps on a brand-new sheet: once a sheet is
saved the odometer has already moved to its End KM. So the checks compare a
sheet with the truck's trips just before and after it (by scheduled date,
same-day trips by Start KM) and with the truck's highest reading recorded
anywhere else. They are warnings — the user can still save.

Lowering End KM on an edit: when the truck's odometer came from this sheet's
old End KM, it is lowered to the new End KM or the highest other reading,
whichever is higher — never below a reading recorded elsewhere — and logged
like Admin's Correct Odometer.
"""
from datetime import date as date_type
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

import models

GAP_WARN_KM = 5000      # Start KM this far past the previous trip's End KM
JUMP_WARN_KM = 20000    # End KM this far above every other reading (an extra digit)


def _km(v) -> int:
    try:
        return int(Decimal(str(v or 0)))
    except Exception:
        return 0


def _fmt(v: int) -> str:
    return f"{v:,}"


def _fmt_date(d) -> str:
    return d.strftime("%d %b %Y") if d else "no date"


def sheet_date(sheet: models.TripSheet | None, trip: models.Trip):
    """The date a trip is ordered by — its scheduled date, else the nearest one we have."""
    s = sheet
    return ((s.trip_scheduled_date or s.trip_completed_date) if s else None) or trip.assigned_date or trip.booking_created_date


def truck_sheets(db: Session, vehicle_id: str, exclude_trip_id: int | None = None) -> list[dict]:
    """The truck's trip sheets that have readings, in trip order."""
    q = (
        db.query(models.Trip, models.TripSheet)
        .join(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
        .filter(models.Trip.vehicle_id == vehicle_id)
    )
    if exclude_trip_id is not None:
        q = q.filter(models.Trip.id != exclude_trip_id)
    out = []
    for trip, sheet in q.all():
        start, end = _km(sheet.start_km), _km(sheet.end_km)
        if start <= 0 and end <= 0:
            continue
        out.append({"trip_db_id": trip.id, "trip_code": trip.trip_id, "date": sheet_date(sheet, trip),
                    "start_km": start, "end_km": end})
    out.sort(key=lambda r: (r["date"] or date_type.min, r["start_km"], r["trip_db_id"]))
    return out


def highest_other_reading(db: Session, truck: models.Truck, trip_id: int, include_odometer: bool = True) -> int | None:
    """The truck's highest reading recorded anywhere except this trip's own
    sheet — its End KM, the diesel entries copied from it and its repairs all
    share the same (possibly typo'd) number, so they don't count.
    include_odometer=False leaves out trucks.odometer itself (when it is the
    value being corrected)."""
    sheet_saved_end = db.query(models.TripSheet.end_km).filter(models.TripSheet.trip_id == trip_id).scalar()
    values = [
        db.query(func.max(models.TripSheet.end_km)).join(models.Trip, models.TripSheet.trip_id == models.Trip.id)
          .filter(models.Trip.vehicle_id == truck.truck_id, models.Trip.id != trip_id).scalar(),
        db.query(func.max(models.FuelLog.odometer)).filter(
            models.FuelLog.truck_id == truck.id,
            (models.FuelLog.logged_by.is_(None)) | (~models.FuelLog.logged_by.like(f"trip:{trip_id}:%"))).scalar(),
        db.query(func.max(models.AdBlueLog.odometer)).filter(models.AdBlueLog.truck_id == truck.id).scalar(),
    ]
    from_this_trip = [r for (r,) in db.query(models.MaintenanceRequest.record_id).filter(
        models.MaintenanceRequest.trip_id == trip_id, models.MaintenanceRequest.record_id.isnot(None)).all()]
    mq = db.query(func.max(models.MaintenanceRecord.odometer)).filter(models.MaintenanceRecord.truck_id == truck.id)
    if from_this_trip:
        mq = mq.filter(models.MaintenanceRecord.id.notin_(from_this_trip))
    values.append(mq.scalar())
    # The odometer itself counts unless it is exactly this sheet's End KM
    # (then it most likely came from this sheet).
    odo = _km(truck.odometer)
    if include_odometer and odo and odo != _km(sheet_saved_end):
        values.append(odo)
    nums = [_km(v) for v in values if v is not None and _km(v) > 0]
    return max(nums) if nums else None


# ── Expected km (Trip Sheet → the End KM hint and the KM variance check) ─────
# What this trip should run, ONE WAY (every trip is one way; the way back is its
# own Return Trip), so a wrong End KM stands out. First found wins:
#   trip    the trip's Approx KM (copied from its route at booking)
#   route   its customer route's Approx Distance (added after the booking)
#   map     Geoapify: between the route's pins (exact), else from the trip's origin
#           and destination text. An exact result is saved onto the route as
#           "auto" (only when the route has no km) — credits once per route, and
#           Assign Trip fills it for the next booking. A rough match (a place not
#           found exactly) is shown but not saved, and the form asks no reason for it.
# It's a check, never written into the sheet: End KM stays the real odometer reading.

EXPECTED_TOLERANCE = 0.15   # the KM variance check asks for a reason beyond this
_GEO_CACHE: dict[tuple, dict] = {}   # Geoapify answers this run (successes only)


def _geo_estimate(o_addr, o_state, d_addr, d_state, o_pin, d_pin) -> dict | None:
    """Geoapify's one-way road km for these ends, or None (no key, not found, offline)."""
    import geo_distance
    key = (o_addr, o_state, d_addr, d_state, o_pin, d_pin)
    if key in _GEO_CACHE:
        return _GEO_CACHE[key]
    try:
        r = geo_distance.road_distance(o_addr, o_state, d_addr, d_state, o_pin, d_pin)
    except geo_distance.GeoError:
        return None
    _GEO_CACHE[key] = r
    return r


# How many legs a sheet's km cover, by the sheet's answer to "Is there a Return
# Trip after this one?" — "one_way" (a Return Trip follows; the way back is on its
# sheet) or "two_way" (the truck comes back empty). Asked on every category but
# Return Trip, which is the way back itself: one way.
BOTH_WAYS_CATEGORIES: set[str] = set()
ASKED_CATEGORIES = {"OUTSTATION", "LOCAL", "LOCAL CFS", "SHIFTING"}


def legs_for(category: str | None, basis: str | None) -> int | None:
    """1 or 2 legs for this sheet — None when the sheet hasn't answered yet (all but Return Trip)."""
    c = (category or "").upper()
    if c in ASKED_CATEGORIES:
        return {"one_way": 1, "two_way": 2}.get(basis or "")
    return 2 if c in BOTH_WAYS_CATEGORIES else 1


def expected_km(db: Session, trip: models.Trip, allow_geo: bool = False, basis: str | None = None) -> dict | None:
    """What this sheet should run: the route's one-way km × its legs (legs_for),
    where that comes from, and whether it's sure enough to ask for a reason when
    the sheet is far off — or None. An unanswered sheet (not a Return Trip) gets
    legs=None and pending=True (no hint, no check until answered).
    allow_geo: Geoapify may be asked (credits) — only for a sheet open for editing."""
    base = _one_way_km(db, trip, allow_geo)
    if not base:
        return None
    legs = legs_for(trip.trip_category, basis or (trip.sheet.km_basis if trip.sheet else None))
    one_way = base["km"]
    if legs is None:
        return {**base, "one_way_km": one_way, "legs": None, "pending": True}
    return {**base, "km": one_way * legs, "one_way_km": one_way, "legs": legs, "pending": False,
            "detail": base["detail"] + (f", × 2 (both ways: {_fmt(one_way)} km there and back)" if legs == 2 else ", one way")}


def _one_way_km(db: Session, trip: models.Trip, allow_geo: bool = False) -> dict | None:
    """The route's one-way km, where that comes from, and whether it's sure."""
    own = _km(trip.approx_km)
    if own > 0:
        return {"km": own, "source": "trip", "sure": True, "detail": "this trip's Approx KM"}
    route = db.get(models.CustomerDestination, trip.customer_destination_id) if trip.customer_destination_id else None
    if route is not None and _km(route.approx_distance_km) > 0:
        return {"km": _km(route.approx_distance_km), "source": "route", "sure": True, "detail": "the route's Approx Distance"}

    # Geoapify: the route's pins, else the trip's own text (the route's states help the lookup).
    pins = None
    if route is not None and None not in (route.origin_lat, route.origin_lon, route.destination_lat, route.destination_lon):
        pins = ((float(route.origin_lat), float(route.origin_lon)), (float(route.destination_lat), float(route.destination_lon)))
    o_addr = (trip.origin or (route.origin_address if route else "") or "").strip()
    d_addr = (trip.destination or (route.destination_address if route else "") or "").strip()
    if not allow_geo or (not pins and not (o_addr and d_addr)):
        return None
    r = _geo_estimate(o_addr, route.origin_state if route else None, d_addr, route.destination_state if route else None,
                      pins[0] if pins else None, pins[1] if pins else None)
    if not r or r["km"] < 1:
        return None
    km = round(r["km"])
    if r["sure"] and route is not None and _km(route.approx_distance_km) <= 0:
        route.approx_distance_km = km
        route.distance_source = "auto"
        db.commit()
    where = "between the route's pins" if pins else f"{o_addr} → {d_addr}"
    return {"km": km, "source": "map", "sure": bool(r["sure"]),
            "detail": f"worked out by Geoapify, {where}" + ("" if r["sure"] else " (rough: a place wasn't found exactly)")}


def next_trip(db: Session, trip: models.Trip, vehicle_id: str | None = None) -> dict | None:
    """The same truck's next trip after this one (any stage; not cancelled or deleted)."""
    vehicle_id = (vehicle_id or "").strip() or (trip.vehicle_id or "").strip()
    day = trip_day(trip)
    if not vehicle_id or not day:
        return None
    after = []
    for t in (db.query(models.Trip).filter(models.Trip.vehicle_id == vehicle_id, models.Trip.id != trip.id,
                                           models.Trip.deleted_at.is_(None), models.Trip.status != "Cancelled").all()):
        d = trip_day(t)
        if d and (d > day or (d == day and t.id > trip.id)):
            after.append((d, t.id, t))
    if not after:
        return None
    d, _, t = min(after, key=lambda x: (x[0], x[1]))
    return {"trip_db_id": t.id, "trip_code": t.trip_id, "category": (t.trip_category or "").upper(), "date": d.isoformat()}


# ── Skipped trips ────────────────────────────────────────────────────────────
# A trip's Start KM follows the End KM of the truck's trip before it. A Closed
# trip (booking sheet closed) between the truck's last trip with km and this one
# that has no trip sheet yet is a gap: its sheet must be entered first, or this
# one's km swallow its distance. Saving a new sheet over such a gap is blocked
# for everyone but Admin (with a reason).

def trip_day(trip: models.Trip):
    """A trip's date for ordering when it may have no sheet: its scheduled date, else the nearest one."""
    return trip.scheduled_date or trip.assigned_date or trip.booking_created_date


def missing_sheets(db: Session, trip: models.Trip, vehicle_id: str | None, scheduled_date=None) -> list[dict]:
    """The truck's Closed trips with no trip sheet, between its last trip with
    km and this one (oldest first). Cancelled and deleted trips don't count."""
    vehicle_id = (vehicle_id or "").strip() or (trip.vehicle_id or "").strip()
    if not vehicle_id:
        return []
    day = scheduled_date or trip_day(trip)
    if not day:
        return []
    others = truck_sheets(db, vehicle_id, exclude_trip_id=trip.id)
    before = [o for o in others if o["date"] and o["date"] <= day]
    since = before[-1]["date"] if before else None
    since_id = before[-1]["trip_db_id"] if before else None
    q = (db.query(models.Trip)
         .join(models.TripClosure, models.TripClosure.trip_id == models.Trip.id)
         .outerjoin(models.TripSheet, models.TripSheet.trip_id == models.Trip.id)
         .filter(models.Trip.vehicle_id == vehicle_id, models.Trip.id != trip.id,
                 models.Trip.deleted_at.is_(None), models.Trip.status != "Cancelled",
                 models.TripSheet.id.is_(None)))
    out = []
    for t in q.all():
        d = trip_day(t)
        if not d:
            continue
        # Before this trip (same day: booked earlier), and not before the last trip with km.
        if d > day or (d == day and t.id > trip.id):
            continue
        if since and (d < since or (d == since and t.id < since_id)):
            continue
        out.append({"trip_db_id": t.id, "trip_code": t.trip_id, "date": d})
    out.sort(key=lambda r: (r["date"], r["trip_db_id"]))
    return out


def missing_message(missing: list[dict]) -> str:
    names = ", ".join(f"{m['trip_code']} ({_fmt_date(m['date'])})" for m in missing[:3])
    more = f" and {len(missing) - 3} more" if len(missing) > 3 else ""
    one = len(missing) == 1
    return (f"Enter the trip sheet for {names}{more} first. {'It is' if one else 'They are'} this truck's earlier "
            f"closed trip{'' if one else 's'} with no trip sheet, so this trip's km would include "
            f"{'its' if one else 'their'} distance.")


def check(db: Session, trip: models.Trip, vehicle_id: str | None, scheduled_date,
          start_km, end_km, allow_geo: bool = False, km_basis: str | None = None) -> dict:
    """Warnings for a sheet with these readings, plus the neighbouring trips
    and what saving would do to the truck's odometer."""
    vehicle_id = (vehicle_id or "").strip() or (trip.vehicle_id or "").strip()
    truck = db.query(models.Truck).filter(models.Truck.truck_id == vehicle_id).first() if vehicle_id else None
    result = {"warnings": [], "previous": None, "next": None, "highest_other_reading": None, "odometer_note": None,
              "missing": [], "expected": None, "next_trip": None}
    if not truck:
        return result
    start, end = _km(start_km), _km(end_km)
    d = scheduled_date or sheet_date(trip.sheet, trip)
    key = (d or date_type.min, start or end)
    others = truck_sheets(db, truck.truck_id, exclude_trip_id=trip.id)
    prev = next((o for o in reversed(others) if (o["date"] or date_type.min, o["start_km"]) <= key), None)
    nxt = next((o for o in others if (o["date"] or date_type.min, o["start_km"]) > key), None)
    result["previous"], result["next"] = prev, nxt
    # The truck's real previous trip: the latest Closed trip with no sheet, if it is after `prev`.
    result["missing"] = missing_sheets(db, trip, vehicle_id, d)
    # What the trip should run: the End KM hint and the KM variance check.
    result["expected"] = expected_km(db, trip, allow_geo, km_basis)
    # The truck's next booked trip after this one — a Return Trip there answers
    # "Is there a Return Trip after this one?" on the sheet.
    result["next_trip"] = next_trip(db, trip, vehicle_id)
    warn = lambda field, msg: result["warnings"].append({"field": field, "message": msg})

    if prev and start and prev["end_km"]:
        if start < prev["end_km"]:
            warn("start", f"{prev['trip_code']} ({_fmt_date(prev['date'])}) ended at {_fmt(prev['end_km'])} km — "
                          f"this Start KM is {_fmt(prev['end_km'] - start)} km lower.")
        elif start - prev["end_km"] > GAP_WARN_KM:
            warn("start", f"{_fmt(start - prev['end_km'])} km since {prev['trip_code']} ({_fmt_date(prev['date'])}) "
                          f"ended at {_fmt(prev['end_km'])} km — a missing trip, or a typo?")
    if nxt and end and nxt["start_km"] and end > nxt["start_km"]:
        warn("end", f"{nxt['trip_code']} ({_fmt_date(nxt['date'])}) started at {_fmt(nxt['start_km'])} km — "
                    f"this End KM is {_fmt(end - nxt['start_km'])} km higher.")

    highest = highest_other_reading(db, truck, trip.id)
    result["highest_other_reading"] = highest
    if end and highest and end - highest > JUMP_WARN_KM:
        warn("end", f"This End KM is {_fmt(end - highest)} km above this truck's highest other reading "
                    f"({_fmt(highest)} km). Is it correct?")

    saved_end = _km(trip.sheet.end_km) if trip.sheet else 0
    odo = _km(truck.odometer)
    if saved_end and end and end < saved_end and odo == saved_end:
        new_odo = max(end, highest or 0)
        if new_odo < odo:
            result["odometer_note"] = (
                f"The truck's odometer ({_fmt(odo)} km) came from this sheet's End KM. Saving will lower it to "
                f"{_fmt(new_odo)} km" + (" (its highest other reading)" if new_odo > end else "") +
                " — recorded in the truck's odometer correction history.")
        else:
            result["odometer_note"] = (
                f"The truck's odometer stays at {_fmt(odo)} km — another record for this truck has that reading.")
    return result


def lower_after_edit(db: Session, truck: models.Truck, trip: models.Trip, old_end, new_end,
                     actor_name: str, actor_role: str | None) -> int | None:
    """After an edit lowered this sheet's End KM: if the truck's odometer was
    this sheet's old End KM, bring it down to the new End KM or the highest
    other reading (whichever is higher) and log it. Returns the new odometer
    when it changed. Doesn't commit."""
    old_end, new_end, odo = _km(old_end), _km(new_end), _km(truck.odometer)
    if not (old_end and new_end and new_end < old_end and odo == old_end):
        return None
    # The sheet already holds the new End KM here; other readings are what matter.
    target = max(new_end, highest_other_reading(db, truck, trip.id, include_odometer=False) or 0)
    if target >= odo:
        return None
    truck.odometer = target
    truck.version = (truck.version or 1) + 1
    db.add(models.TruckOdometerCorrection(
        truck_id=truck.id, old_odometer=odo, new_odometer=target,
        reason=f"Trip sheet {trip.trip_id}: End KM corrected from {_fmt(old_end)} to {_fmt(new_end)} km",
        actor_name=actor_name or "Unknown", actor_role=actor_role,
    ))
    return target


def report(db: Session) -> list[dict]:
    """Every saved trip sheet that breaks the rules today (the one-time list)."""
    rows = []
    vehicles = [v for (v,) in db.query(models.Trip.vehicle_id).join(
        models.TripSheet, models.TripSheet.trip_id == models.Trip.id).distinct().all() if v]
    for v in vehicles:
        sheets = truck_sheets(db, v)
        for a, b in zip(sheets, sheets[1:]):
            if a["end_km"] and b["start_km"]:
                if b["start_km"] < a["end_km"]:
                    rows.append({"vehicle_id": v, "trip": b["trip_code"], "date": b["date"],
                                 "problem": f"Start {_fmt(b['start_km'])} is below {a['trip_code']}'s End {_fmt(a['end_km'])} "
                                            f"({_fmt(a['end_km'] - b['start_km'])} km overlap)"})
                elif b["start_km"] - a["end_km"] > GAP_WARN_KM:
                    rows.append({"vehicle_id": v, "trip": b["trip_code"], "date": b["date"],
                                 "problem": f"Gap of {_fmt(b['start_km'] - a['end_km'])} km after {a['trip_code']} "
                                            f"(End {_fmt(a['end_km'])} → Start {_fmt(b['start_km'])})"})
        for s in sheets:
            if s["start_km"] and s["end_km"] and s["end_km"] <= s["start_km"]:
                rows.append({"vehicle_id": v, "trip": s["trip_code"], "date": s["date"],
                             "problem": f"End {_fmt(s['end_km'])} is not above Start {_fmt(s['start_km'])}"})
    return rows
