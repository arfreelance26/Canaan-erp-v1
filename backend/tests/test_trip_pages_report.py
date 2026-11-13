"""Trip and Driver Management → View (trip_pages_report.py): each page's
pills, the counts behind the Reports Center window, and the reports."""
from datetime import datetime, timedelta, timezone

import models
import trip_pages_report as tp
from world import fresh_trip

NOW = datetime.now(timezone.utc)
CTX = {"requests": {}}


def _trip(**kw):
    t = models.Trip(id=kw.pop("id", 1), **kw)
    return t


def test_available_follows_the_route_steps():
    assert tp.stages("trips_available", _trip(status="Assigned"), CTX, NOW) == ["Booked"]
    assert tp.stages("trips_available", _trip(status="On-Transit"), CTX, NOW) == ["Current"]
    done = _trip(status="Completed")
    assert tp.stages("trips_available", done, CTX, NOW) == ["Completed"]
    done.closure = models.TripClosure()
    assert tp.stages("trips_available", done, CTX, NOW) == ["Closed"]
    assert tp.stages("trips_available", _trip(status="Cancelled"), CTX, NOW) == ["Cancelled"]


def test_sheet_collection_overdue_is_received_over_a_day_without_a_sheet():
    t = _trip(status="Completed", trip_sheet_collected=True, trip_sheet_received=True,
              trip_sheet_received_at=(NOW - timedelta(hours=30)).replace(tzinfo=None))
    assert tp.stages("trips_sheets", t, CTX, NOW) == ["Delivered", "Overdue"]
    t.trip_sheet_received_at = (NOW - timedelta(hours=5)).replace(tzinfo=None)
    assert tp.stages("trips_sheets", t, CTX, NOW) == ["Delivered"]
    assert tp.stages("trips_sheets", _trip(status="Completed", trip_sheet_collected=False), CTX, NOW) == ["Pending"]


def test_reconciliation_pills_overlap_as_on_the_page():
    t = _trip(id=7, status="Completed", trip_sheet_collected=True, trip_sheet_received=False, verification_status="rejected")
    t.sheet = models.TripSheet()
    ctx = {"requests": {7: {"Pending", "Approved"}}}
    assert tp.stages("trips_reconciliation", t, ctx, NOW) == ["Pending Receive", "Sheet Entered", "Rejected",
                                                              "Request Raised", "Request Approved"]
    t2 = _trip(id=8, status="Completed", trip_sheet_collected=True, trip_sheet_received=True)
    assert tp.stages("trips_reconciliation", t2, CTX, NOW) == ["Pending Sheet Entry"]


def test_verification_pills():
    v = lambda **kw: tp.stages("trips_verification", _trip(**kw), CTX, NOW)  # noqa: E731
    assert v(verification_status="pending", is_invoiced=False, invoice_waived=False) == ["Pending"]
    assert v(verification_status="verified", is_invoiced=False, invoice_waived=False) == ["Verified"]
    assert v(verification_status="verified", is_invoiced=True, invoice_waived=False) == ["Invoiced"]
    assert v(verification_status="verified", is_invoiced=False, invoice_waived=True) == ["Waived Invoice"]
    assert v(verification_status="rejected", is_invoiced=False, invoice_waived=False) == ["Rejected"]


def test_reports_counts_and_roles(api, api_as, world):
    trip = fresh_trip(api, world, scheduled_date="2031-04-09", trip_category="SHIFTING")
    q = {"kind": "trips_assign", "search": trip["trip_id"], "from_date": "2031-04-01", "to_date": "2031-04-30"}
    rep = api.get("/exports/resource-report/preview", params=q)["report"]
    (item,) = rep["items"]
    assert item["title"] == "Assigned" and item["tables"][0]["rows"][0][0] == trip["trip_id"]

    c = api.get("/exports/trip-report-counts", params={**q, "kind": "trips_available"})
    assert c["stages"]["Booked"] == 1 and c["categories"]["SHIFTING"] == 1 and c["categories"]["LOCAL"] == 0
    # The category narrows the pill counts; the pill narrows the category counts.
    c = api.get("/exports/trip-report-counts", params={**q, "kind": "trips_available", "trip_category": "LOCAL"})
    assert c["stages"]["Booked"] == 0
    c = api.get("/exports/trip-report-counts", params={**q, "kind": "trips_available", "stage": "Closed"})
    assert c["categories"]["SHIFTING"] == 0

    # A stage that matches nothing → an empty report, not an error.
    rep = api.get("/exports/resource-report/preview", params={**q, "kind": "trips_available", "stage": "Closed"})["report"]
    assert rep["items"] == []

    # Each report: the page's roles.
    api_as("Commercial Manager").get("/exports/resource-report/preview", params=q)
    api_as("Accounts").get("/exports/resource-report/preview", params=q, expect=403)
    api_as("Accounts").get("/exports/resource-report/preview", params={**q, "kind": "trips_verification"})
    api_as("Yard Supervisor").get("/exports/trip-report-counts", params={**q, "kind": "trips_sheets"})
    api_as("Yard Supervisor").get("/exports/trip-report-counts", params={**q, "kind": "trips_verification"}, expect=403)


def test_every_trip_page_report_builds(api):
    for kind in list(tp.PILLS) + ["trips_deleted", "driver_assign"]:
        out = api.get("/exports/resource-report/preview", params={"kind": kind, "from_date": "2031-04-01", "to_date": "2031-04-30"})
        assert out["sheets"][0]["name"] == "Summary", kind
