"""Admin morning summary: every figure matches the page it comes from, it's
saved once each morning (one notification), and Refresh shows the live data."""
import json
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import func

import daily_summary
import models
from world import create_trip, create_truck, fresh_trip

YESTERDAY = daily_summary.now_ist().date() - timedelta(days=1)


def metrics(db, day=YESTERDAY):
    db.commit()  # a fresh read: the session would otherwise keep seeing its first snapshot
    return daily_summary.build(db, day)["metrics"]


def test_trips_and_fuel_match_their_pages(api, world, db):
    before = metrics(db)
    fresh_trip(api, world, booking_created_date=YESTERDAY.isoformat())
    truck = create_truck(api)
    api.post("/maintenance/fuel-logs", json={"truck_id": truck["id"], "date": YESTERDAY.isoformat(), "odometer": 70_000,
                                             "litres": 120, "price_per_litre": 95, "total_cost": 11_400})
    after = metrics(db)
    assert after["Trips booked"] == before["Trips booked"] + 1
    assert after["Diesel litres"] == before["Diesel litres"] + 120
    booked = db.query(func.count(models.Trip.id)).filter(models.Trip.booking_created_date == YESTERDAY,
                                                          models.Trip.deleted_at.is_(None)).scalar()
    assert after["Trips booked"] == booked


def test_pending_invoices_match_the_dashboard(api, db):
    pending = len(api.get("/dashboard/trips-overview")["pending_invoice_trips"])
    assert metrics(db)["Trips waiting to be invoiced"] == pending


def _open_for_invoicing(db):
    T = models.Trip
    return [t for t in db.query(T).filter(T.status == "Completed", T.deleted_at.is_(None), T.invoice_waived.is_(False)).all()
            if not t.is_invoiced]


def test_waiting_to_be_invoiced_matches_verification_page(db):
    """Only trips with a sheet, not waived or deleted — Verification & Invoicing's
    Pending + Rejected + Verified. Completed trips without a sheet are counted
    separately, as waiting for a trip sheet."""
    m = metrics(db)
    trips = _open_for_invoicing(db)
    assert m["Trips waiting to be invoiced"] == sum(1 for t in trips if t.sheet is not None)
    assert m["Trips waiting for a trip sheet"] == sum(1 for t in trips if t.sheet is None)


def test_waived_and_deleted_trips_are_not_waiting(db):
    open_trips = _open_for_invoicing(db)
    if len(open_trips) < 2:
        open_trips = [t for t in db.query(models.Trip).filter(models.Trip.deleted_at.is_(None)).limit(2)]
        for t in open_trips:
            t.status, t.is_invoiced = "Completed", False
        db.commit()
    waived, deleted = open_trips[:2]
    def waiting(m):
        return m["Trips waiting to be invoiced"] + m["Trips waiting for a trip sheet"]
    before = waiting(metrics(db))
    try:
        waived.invoice_waived = True
        deleted.deleted_at = datetime.now()
        assert waiting(metrics(db)) == before - 2
    finally:
        waived.invoice_waived = False
        deleted.deleted_at = None
        db.commit()


def test_staff_work_matches_the_work_report(api, db):
    report = api.client.get("/activity/work-report", params={"day": YESTERDAY.isoformat()}, headers=api.headers)
    total = sum(p["work_count"] for p in report.json()["staff"]) if report.status_code == 200 else 0
    assert metrics(db)["Work items"] == total


def test_audit_queue_matches_pending_audit(api, db):
    assert metrics(db)["Trips waiting for audit"] == len(api.get("/trips/pending-audit"))


def test_a_quiet_day_says_so(db):
    summary = daily_summary.build(db, date(2001, 1, 1))
    assert summary["headline"].startswith("A quiet day")
    assert summary["day_label"] == "Monday, 1 January" and summary["today_label"] == "Tuesday, 2 January"
    assert all(not line["text"].startswith("**Booked:**") for s in summary["sections"] for line in s["lines"])


def test_saved_once_each_morning_with_one_notification(db):
    morning = datetime(2001, 3, 6, 9, 0, tzinfo=daily_summary.IST)        # covers 5 March
    early = datetime(2001, 3, 6, 7, 59, tzinfo=daily_summary.IST)
    notes = lambda: db.query(models.Notification).filter_by(event_type=daily_summary.NOTIFY_EVENT).filter(
        models.Notification.title.like("%5 March%")).count()

    assert daily_summary.ensure_saved(db, early) is None and notes() == 0   # not due before 8 AM
    first = daily_summary.ensure_saved(db, morning)
    again = daily_summary.ensure_saved(db, morning + timedelta(hours=3))   # another worker, later
    assert first["day"] == "2001-03-05" and again == first
    assert notes() == 1
    note = db.query(models.Notification).filter_by(event_type=daily_summary.NOTIFY_EVENT).filter(
        models.Notification.title.like("%5 March%")).one()
    assert note.target_roles == "Admin" and "headline" in json.loads(note.message)


def test_the_saved_message_stays_and_refresh_is_live(api, world, db, monkeypatch):
    morning = daily_summary.now_ist().replace(hour=9, minute=0)
    monkeypatch.setattr(daily_summary, "now_ist", lambda: morning)
    saved = api.get("/daily-summary")["summary"]
    assert saved["day"] == YESTERDAY.isoformat()

    fresh_trip(api, world, booking_created_date=YESTERDAY.isoformat())    # entered after the morning
    assert api.get("/daily-summary")["summary"] == saved                    # the morning message doesn't change
    live = api.get("/daily-summary/live")["summary"]["metrics"]
    assert live == metrics(db) and live["Trips booked"] >= saved["metrics"]["Trips booked"] + 1


@pytest.mark.parametrize("role", ["Accounts", "Commercial Manager", "Auditor"])
def test_admin_only(api_as, role):
    api_as(role).get("/daily-summary", expect=403)
    api_as(role).get("/daily-summary/live", expect=403)
