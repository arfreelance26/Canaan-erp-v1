"""Trips: booking → status → close → trip sheet → LR → verification → invoice,
plus the sheet hand-over (Yard Supervisor → Trip Sheet Register), the
Auditor's recheck flow, deletion/restore and the bulk/insight reads."""
from datetime import date, datetime, timedelta
from io import BytesIO
from zoneinfo import ZoneInfo

import pytest
from openpyxl import load_workbook

from world import add_sheet, complete_and_close, create_trip, fresh_trip

TODAY = date.today().isoformat()


@pytest.fixture()
def closed_trip(api, world):
    trip = fresh_trip(api, world)
    complete_and_close(api, trip)
    return trip


@pytest.fixture()
def sheeted_trip(api, closed_trip):
    add_sheet(api, closed_trip)
    return closed_trip


def test_edit_and_status(api, world, spec):
    trip = fresh_trip(api, world)
    fields = spec["components"]["schemas"]["TripBase"]["properties"]
    body = {k: v for k, v in trip.items() if k in fields and k != "edit_context"}
    edited = api.put(f"/trips/{trip['id']}", json={**body, "cha_name": "Pytest CHA"})
    assert edited["cha_name"] == "Pytest CHA"
    assert api.patch(f"/trips/{trip['id']}/status", json={"status": "Started"})["status"] == "Started"


def test_only_admin_can_cancel(api_as, world, api):
    trip = fresh_trip(api, world)
    api_as("Commercial Manager").patch(f"/trips/{trip['id']}/status", json={"status": "Cancelled"}, expect=403)
    assert api.patch(f"/trips/{trip['id']}/status", json={"status": "Cancelled"})["status"] == "Cancelled"


def test_close_needs_a_completed_trip(api, world):
    trip = fresh_trip(api, world)
    api.post(f"/trips/{trip['id']}/close", json={"payment_type": "Credit"}, expect=400)
    closure = complete_and_close(api, trip)
    assert api.get(f"/trips/{trip['id']}/closure")["id"] == closure["id"]


def test_sheet_lr_verification_and_invoice(api, closed_trip):
    tid = closed_trip["id"]
    sheet = add_sheet(api, closed_trip)
    assert api.get(f"/trips/{tid}/sheet")["id"] == sheet["id"]
    api.patch(f"/trips/{tid}/lr", json={"lr_consignor": "Pytest Consignor", "lr_weight": "20 T"})
    api.post(f"/trips/{tid}/verify-advance", json={"verified": True})
    assert api.post(f"/trips/{tid}/verify", json={})["verification_status"] == "verified"
    invoiced = api.post(f"/trips/{tid}/invoice", json={"invoice_type": "Tax Invoice", "invoice_date": TODAY})
    invoice = api.get(f"/trips/{tid}/invoice")
    assert invoice["invoice_no"]
    api.get("/trips/invoice-group", params={"invoice_no": invoice["invoice_no"]})
    api.get("/trips/invoices/next-seq", params={"invoice_type": "Tax Invoice"})
    assert invoiced["id"] == tid


def test_return_trip_batta_is_not_derived_from_hire(api, world, spec):
    trip = fresh_trip(api, world, trip_category="RETURN TRIP", transport_hire_amount=10000)
    complete_and_close(api, trip)
    tid = trip["id"]
    sheet = api.post(f"/trips/{tid}/sheet", json={
        "trip_sheet_no": f"TS-{trip['trip_id']}", "trip_sheet_date": TODAY, "trip_type": "RETURN TRIP",
        "hire_amount": 10000, "weight_sheet_expense": 100, "driver_pay": 777,
    })
    assert float(sheet["driver_pay"]) == 777  # saved as typed, not 10% of (hire − weight sheet)
    assert float(sheet["total_expense"]) == 877

    fields = spec["components"]["schemas"]["TripBase"]["properties"]
    body = {k: v for k, v in api.get(f"/trips/{tid}").items() if k in fields and k != "edit_context"}
    api.put(f"/trips/{tid}", json={**body, "transport_hire_amount": 20000})
    after = api.get(f"/trips/{tid}/sheet")
    assert float(after["hire_amount"]) == 20000  # hire still mirrors onto the sheet
    assert float(after["driver_pay"]) == 777 and float(after["total_expense"]) == 877


def test_waive_invoice_after_verification(api, sheeted_trip):
    tid = sheeted_trip["id"]
    api.post(f"/trips/{tid}/waive-invoice", expect=400)  # not verified yet
    api.post(f"/trips/{tid}/verify", json={})
    assert api.post(f"/trips/{tid}/waive-invoice")["invoice_waived"] is True


def test_reject_and_resubmit_verification(api, sheeted_trip):
    tid = sheeted_trip["id"]
    api.post(f"/trips/{tid}/resubmit-verification", expect=400)  # only rejected trips
    assert api.post(f"/trips/{tid}/reject-verification", json={"reason": "Wrong km"})["verification_status"] == "rejected"
    assert api.post(f"/trips/{tid}/resubmit-verification")["verification_status"] == "pending"


def test_flag(api, sheeted_trip):
    assert api.post(f"/trips/{sheeted_trip['id']}/flag")["verification_status"] == "flagged"


def _export_trip_ids(api, **params):
    res = api.get("/exports/audit-verified", params=params)
    rows = list(load_workbook(BytesIO(res.content)).active.values)
    return rows[0], [r[0] for r in rows[1:]], rows[1:]


def test_audit_verified_export_filters(api, api_as, world):
    trip = fresh_trip(api, world)
    other = fresh_trip(api, world)
    auditor = api_as("Auditor")
    auditor.post(f"/trips/{trip['id']}/recheck-verify", json={"remark": "All good"})
    auditor.post(f"/trips/{other['id']}/recheck-verify", json={})
    code, other_code = trip["trip_id"], other["trip_id"]
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()

    headers, ids, rows = _export_trip_ids(api)
    assert "Verified On" in headers and {code, other_code} <= set(ids)
    row = rows[ids.index(code)]
    assert row[headers.index("Verification Note")] == "All good" and row[headers.index("Was Disputed")] == "No"

    assert code in _export_trip_ids(api, from_date=today.isoformat(), to_date=today.isoformat())[1]
    assert code not in _export_trip_ids(api, to_date=(today - timedelta(days=1)).isoformat())[1]
    assert code not in _export_trip_ids(api, from_date=(today + timedelta(days=1)).isoformat())[1]
    assert _export_trip_ids(api, search=f" {code.lower()} ")[1] == [code]


def test_audit_verified_hides_deleted_trips(api, api_as, world):
    trip = fresh_trip(api, world)
    tid, code = trip["id"], trip["trip_id"]
    api_as("Auditor").post(f"/trips/{tid}/recheck-verify", json={})
    listed = lambda: any(t["trip_id"] == tid for t in api.get("/trips/audit-verified"))
    assert listed() and code in _export_trip_ids(api)[1]

    api.delete(f"/trips/{tid}", json={"reason": "Duplicate booking"})
    assert not listed() and code not in _export_trip_ids(api)[1]

    api.post(f"/trips/{tid}/restore")
    assert listed() and code in _export_trip_ids(api)[1]


def test_audit_verified_export_uses_ist_days(api, monkeypatch):
    # 20:00 UTC on the 1st is 01:30 IST on the 2nd.
    monkeypatch.setattr("routers.trips.audit_verified_rows", lambda db: [{
        "trip_id_str": "TRP-IST", "driver_name": None, "origin": None, "destination": None, "scheduled_date": None,
        "verified_by": "Auditor", "verified_role": "Auditor", "verified_at": datetime(2026, 1, 1, 20, 0),
        "verified_remark": "", "was_disputed": False,
    }])
    assert _export_trip_ids(api, from_date="2026-01-02", to_date="2026-01-02")[1] == ["TRP-IST"]
    assert _export_trip_ids(api, to_date="2026-01-01")[1] == []


def test_audit_flagged_export(api, api_as, world):
    def export(**params):
        rows = list(load_workbook(BytesIO(api.get("/exports/audit-flagged", params=params).content)).active.values)
        return rows[0], {r[0]: r for r in rows[1:]}

    trip = fresh_trip(api, world)
    tid, code, day = trip["id"], trip["trip_id"], trip["scheduled_date"]
    returned = fresh_trip(api, world)
    plain = fresh_trip(api, world)
    auditor = api_as("Auditor")
    auditor.post(f"/trips/{tid}/recheck-flag", json={"remark": "Wrong toll"})
    auditor.post(f"/trips/{returned['id']}/recheck-flag", json={"remark": "Check hire"})
    api.post(f"/trips/{returned['id']}/recheck-return", json={"remark": "Fixed"})

    headers, rows = export()
    assert code in rows and returned["trip_id"] in rows and plain["trip_id"] not in rows
    assert rows[code][headers.index("Reason")] == "Wrong toll"
    assert rows[code][headers.index("Status")] == "Under Review"
    assert rows[code][headers.index("Flagged By")] and rows[code][headers.index("Flagged On")]
    assert rows[returned["trip_id"]][headers.index("Status")] == "Returned - awaiting Auditor"

    d = date.fromisoformat(day)
    assert code in export(from_date=day, to_date=day)[1]
    assert code not in export(to_date=(d - timedelta(days=1)).isoformat())[1]
    assert code not in export(from_date=(d + timedelta(days=1)).isoformat())[1]
    assert set(export(search=f" {code.lower()} ")[1]) == {code}
    assert code in export(search="wrong TOLL")[1]

    api.delete(f"/trips/{tid}", json={"reason": "Duplicate booking"})
    assert code not in export()[1]


def test_trips_export_follows_search_and_dates(api, world):
    day = date.today().isoformat()
    other_day = (date.today() + timedelta(days=30)).isoformat()
    mine = fresh_trip(api, world, scheduled_date=day)
    complete_and_close(api, mine)  # the same truck can then take its next trip
    mine_later = create_trip(api, world, driver_id=mine["driver_id"], vehicle_id=mine["vehicle_id"], scheduled_date=other_day)
    other = fresh_trip(api, world, scheduled_date=day)
    truck = next(t for t in api.get("/trucks") if t["truck_id"] == mine["vehicle_id"])

    def export(**params):
        rows = list(load_workbook(BytesIO(api.get("/exports/trips", params={"status": "Assigned,Completed", **params}).content)).active.values)
        return {r[0] for r in rows[1:]}

    codes = {mine["trip_id"], mine_later["trip_id"], other["trip_id"]}
    assert codes <= export()  # no search: everything, as before
    for term in (truck["registration_number"].lower(), mine["vehicle_id"], mine["trip_id"]):
        assert mine["trip_id"] in export(search=term) and other["trip_id"] not in export(search=term)
    found = export(search=truck["registration_number"], from_date=day, to_date=day)
    assert found == {mine["trip_id"]}  # that truck, those dates, nothing else
    assert export(search="NO-SUCH-TRUCK") == set()


def test_undo_verification(api, api_as, world):
    tid = fresh_trip(api, world)["id"]
    auditor = api_as("Auditor")
    api_as("Accounts").post(f"/trips/{tid}/recheck-verify", json={}, expect=403)
    auditor.post(f"/trips/{tid}/recheck-undo-verify", json={"remark": "Oops"}, expect=409)  # not verified yet
    auditor.post(f"/trips/{tid}/recheck-verify", json={})
    assert any(t["trip_id"] == tid for t in api.get("/trips/audit-verified"))

    api_as("Accounts").post(f"/trips/{tid}/recheck-undo-verify", json={"remark": "Oops"}, expect=403)
    auditor.post(f"/trips/{tid}/recheck-undo-verify", json={"remark": "  "}, expect=400)
    undone = auditor.post(f"/trips/{tid}/recheck-undo-verify", json={"remark": "Clicked by mistake"})
    assert undone["audit_verified"] is False and undone["flagged_for_recheck"] is False
    assert not any(t["trip_id"] == tid for t in api.get("/trips/audit-verified"))
    assert [e["event"] for e in api.get(f"/trips/{tid}/recheck-history")] == ["Verified", "Verification Undone"]
    assert any(e["event"] == "Verification Undone" for e in api.get("/trips/recheck-events"))
    assert auditor.post(f"/trips/{tid}/recheck-verify", json={})["audit_verified"] is True  # decided again


@pytest.mark.parametrize("role", ["Accounts", "Trip Sheet Register", "Admin"])
def test_flag_for_reverification(api, api_as, world, role):
    trip = fresh_trip(api, world)
    tid, code = trip["id"], trip["trip_id"]
    auditor = api_as("Auditor")
    user = api_as(role)
    user.post(f"/trips/{tid}/request-reverification", json={"remark": "Check it"}, expect=409)  # not verified yet
    auditor.post(f"/trips/{tid}/recheck-verify", json={})

    for other in ("Commercial Manager", "Auditor", "Maintenance"):
        api_as(other).post(f"/trips/{tid}/request-reverification", json={"remark": "Check it"}, expect=403)
    user.post(f"/trips/{tid}/request-reverification", json={"remark": " "}, expect=400)
    sent = user.post(f"/trips/{tid}/request-reverification", json={"remark": "Toll looks wrong"})
    assert sent["audit_verified"] is False and sent["flagged_for_recheck"] is False
    assert sent["reverification_remark"] == "Toll looks wrong" and sent["reverification_by"] and sent["reverification_at"]
    assert not any(t["trip_id"] == tid for t in api.get("/trips/audit-verified"))
    user.post(f"/trips/{tid}/request-reverification", json={"remark": "Again"}, expect=409)  # only once

    mine = [n for n in auditor.get("/notifications") if n["trip_id_str"] == code and n["event_type"] == "reverification_requested"]
    assert mine and "Toll looks wrong" in mine[0]["message"]
    assert not [n for n in api_as("Accounts").get("/notifications") if n["event_type"] == "reverification_requested"]

    # The Auditor's decision clears the label, either way.
    done = auditor.post(f"/trips/{tid}/recheck-verify", json={})
    assert done["audit_verified"] is True and done["reverification_remark"] is None
    user.post(f"/trips/{tid}/request-reverification", json={"remark": "Once more"})
    flagged = auditor.post(f"/trips/{tid}/recheck-flag", json={"remark": "Fix the toll"})
    assert flagged["flagged_for_recheck"] is True and flagged["reverification_remark"] is None and flagged["reverification_at"] is None
    assert [e["event"] for e in api.get(f"/trips/{tid}/recheck-history")] == [
        "Verified", "Flagged for Re-Verification", "Verified", "Flagged for Re-Verification", "Flagged"]


def test_auditor_recheck_flow(api, world):
    trip = fresh_trip(api, world)
    tid = trip["id"]
    api.post(f"/trips/{tid}/recheck-flag", json={"remark": "  "}, expect=400)
    flagged = api.post(f"/trips/{tid}/recheck-flag", json={"remark": "Check the toll"})
    assert flagged["flagged_for_recheck"] is True
    api.post(f"/trips/{tid}/recheck-verify", json={}, expect=409)  # must be returned first
    assert api.post(f"/trips/{tid}/recheck-return", json={"remark": "Fixed"})["recheck_returned"] is True
    verified = api.post(f"/trips/{tid}/recheck-verify", json={"remark": "OK"})
    assert verified["audit_verified"] is True and verified["flagged_for_recheck"] is False
    events = [e["event"] for e in api.get(f"/trips/{tid}/recheck-history")]
    assert events == ["Flagged", "Returned for Review", "Verified"]


def test_sheet_handover(api, api_as, closed_trip):
    tid = closed_trip["id"]
    yard, register = api_as("Yard Supervisor"), api_as("Trip Sheet Register")
    register.post(f"/trips/{tid}/receive-sheet", expect=400)  # not delivered yet
    assert yard.post(f"/trips/{tid}/collect-sheet", json={"collected": True})["trip_sheet_collected"] is True
    assert register.post(f"/trips/{tid}/receive-sheet")["trip_sheet_received"] is True


def test_unmark_delivered_sheet(api, api_as, closed_trip):
    tid = closed_trip["id"]
    api_as("Yard Supervisor").post(f"/trips/{tid}/collect-sheet", json={"collected": True})
    assert api.post(f"/trips/{tid}/unmark-sheet", json={"reason": "Marked by mistake"})["trip_sheet_collected"] is False


def test_flag_sheet_missing(api_as, closed_trip):
    api_as("Yard Supervisor").post(f"/trips/{closed_trip['id']}/flag-sheet-missing", json={"remark": "Driver lost it"})


def test_delete_restore_and_permanent_delete(api, world):
    trip = fresh_trip(api, world)
    tid = trip["id"]
    api.delete(f"/trips/{tid}", json={"reason": "  "}, expect=400)
    api.delete(f"/trips/{tid}", json={"reason": "Duplicate booking"})
    assert api.post(f"/trips/{tid}/restore")["id"] == tid
    api.delete(f"/trips/{tid}", json={"reason": "Duplicate booking"})
    api.delete(f"/trips/{tid}/permanent")
    api.get(f"/trips/{tid}", expect=404)


def test_deleted_trip_frees_truck_and_driver(api, world):
    trip = fresh_trip(api, world)
    crew = {"driver_id": trip["driver_id"], "vehicle_id": trip["vehicle_id"]}
    api.delete(f"/trips/{trip['id']}", json={"reason": "Booked by mistake"})
    second = create_trip(api, world, **crew)
    api.post(f"/trips/{trip['id']}/restore", expect=400)  # the crew has moved on
    api.patch(f"/trips/{second['id']}/status", json={"status": "Cancelled"})
    assert api.post(f"/trips/{trip['id']}/restore")["id"] == trip["id"]


def test_combined_invoice(api, world):
    trips = []
    for _ in range(2):
        trip = fresh_trip(api, world)
        complete_and_close(api, trip)
        add_sheet(api, trip)
        api.post(f"/trips/{trip['id']}/verify", json={})
        trips.append(trip)
    api.post("/trips/invoice-combined", json={"trips": [{"trip_id": trips[0]["id"]}]}, expect=400)
    result = api.post("/trips/invoice-combined", json={
        "invoice_type": "Tax Invoice", "invoice_date": TODAY,
        "trips": [{"trip_id": t["id"]} for t in trips],
    })
    assert {t["id"] for t in result} == {t["id"] for t in trips}


def test_bulk_and_insight_reads(api, world, sheeted_trip):
    ids = ",".join(str(i) for i in (world.trip["id"], sheeted_trip["id"]))
    for kind in ("sheets", "closures", "invoices"):
        api.get(f"/trips/bulk/{kind}", params={"ids": ids})
    api.get("/trips/customer-profitability/top-trips", params={"customer_id": world.customer["id"]})
    api.get("/trips/route-insights", params={"customer_id": world.customer["id"], "route_id": world.destination["id"]})


@pytest.mark.parametrize("undo", ["undo", "reverify"])
def test_startup_repair_keeps_an_undone_verification(api, api_as, world, undo):
    import main
    tid = fresh_trip(api, world)["id"]
    auditor = api_as("Auditor")
    auditor.post(f"/trips/{tid}/recheck-verify", json={})
    if undo == "undo":
        auditor.post(f"/trips/{tid}/recheck-undo-verify", json={"remark": "Mistake"})
    else:
        api.post(f"/trips/{tid}/request-reverification", json={"remark": "Look again"})
    main._repair_trip_recheck_state()
    trip = api.get(f"/trips/{tid}")
    assert trip["audit_verified"] is False and trip["flagged_for_recheck"] is False
    assert (trip["reverification_remark"] is not None) == (undo == "reverify")


def test_sheet_km_check(api, world):
    first = fresh_trip(api, world)
    complete_and_close(api, first)
    add_sheet(api, first)  # 1000 → 1040 km
    second = create_trip(api, world, driver_id=first["driver_id"], vehicle_id=first["vehicle_id"])
    url = f"/trips/{second['id']}/sheet/km-check"
    later = (date.today() + timedelta(days=1)).isoformat()
    check = lambda **km: api.post(url, json={"trip_scheduled_date": later, **km})

    fine = check(start_km=1040, end_km=1100)
    assert fine["warnings"] == [] and fine["previous"]["trip_code"] == first["trip_id"]
    assert fine["next"] is None and float(fine["highest_other_reading"]) == 1040

    lower = check(start_km=1000, end_km=1100)
    assert [w["field"] for w in lower["warnings"]] == ["start"] and "40 km lower" in lower["warnings"][0]["message"]
    assert [w["field"] for w in check(start_km=9000, end_km=9100)["warnings"]][0] == "start"  # a gap: missing trip or typo
    assert any(w["field"] == "end" for w in check(start_km=1040, end_km=500_000)["warnings"])  # jumped far ahead

    empty = api.post(url, json={"vehicle_id": "NO-SUCH-TRUCK", "start_km": 1, "end_km": 2})
    assert empty["warnings"] == [] and empty["previous"] is None
    api.post("/trips/999999/sheet/km-check", json={}, expect=404)
