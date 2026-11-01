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


def check(db: Session, trip: models.Trip, vehicle_id: str | None, scheduled_date,
          start_km, end_km) -> dict:
    """Warnings for a sheet with these readings, plus the neighbouring trips
    and what saving would do to the truck's odometer."""
    vehicle_id = (vehicle_id or "").strip() or (trip.vehicle_id or "").strip()
    truck = db.query(models.Truck).filter(models.Truck.truck_id == vehicle_id).first() if vehicle_id else None
    result = {"warnings": [], "previous": None, "next": None, "highest_other_reading": None, "odometer_note": None}
    if not truck:
        return result
    start, end = _km(start_km), _km(end_km)
    d = scheduled_date or sheet_date(trip.sheet, trip)
    key = (d or date_type.min, start or end)
    others = truck_sheets(db, truck.truck_id, exclude_trip_id=trip.id)
    prev = next((o for o in reversed(others) if (o["date"] or date_type.min, o["start_km"]) <= key), None)
    nxt = next((o for o in others if (o["date"] or date_type.min, o["start_km"]) > key), None)
    result["previous"], result["next"] = prev, nxt
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
