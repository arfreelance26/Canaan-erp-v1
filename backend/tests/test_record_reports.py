"""Auditor Pages and AdBlue History → View (record_reports.py)."""
from datetime import date

import models
import record_reports as rec
from world import create_truck


def _rep(api, kind, **params):
    return api.get("/exports/resource-report/preview", params={"kind": kind, **params})["report"]


def test_audit_status_matches_the_badge():
    t = models.Trip(audit_verified=False, flagged_for_recheck=False, recheck_returned=False)
    assert rec.audit_status(t) == "Pending audit"
    t.flagged_for_recheck = True
    assert rec.audit_status(t) == "Under Review"
    t.recheck_returned = True
    assert rec.audit_status(t) == "Returned"
    t.audit_verified, t.flagged_for_recheck = True, False
    assert rec.audit_status(t) == "Verified"
    t.reverification_remark = "Fix the km"
    assert rec.audit_status(t) == "Re-Verification"


def test_auditor_reports_build_and_follow_roles(api, api_as):
    for kind in ("driver_record", "vehicle_record"):
        out = api.get("/exports/resource-report/preview", params={"kind": kind, "from_date": "2031-01-01", "to_date": "2031-01-31"})
        assert out["sheets"][0]["name"] == "Summary"
        api_as("Auditor").get("/exports/resource-report/preview", params={"kind": kind})
        api_as("Accounts").get("/exports/resource-report/preview", params={"kind": kind}, expect=403)


def test_adblue_report(api, api_as, db):
    t = create_truck(api)
    truck = db.query(models.Truck).filter_by(truck_id=t["truck_id"]).one()
    for d, odo, litres in ((date(2031, 2, 1), 10_000, 20), (date(2031, 2, 20), 12_000, 25), (date(2031, 3, 10), 14_000, 20)):
        db.add(models.AdBlueLog(truck_id=truck.id, date=d, odometer=odo, litres=litres, price_per_litre=60,
                                total_cost=litres * 60, supplier="Pytest Pump"))
    db.commit()
    rep = _rep(api, "adblue", search=t["truck_id"])
    (item,) = rep["items"]
    pairs = {p["label"]: p["value"] for b in item["boxes"] for p in b["pairs"]}
    assert pairs["Fills"] == 3 and pairs["Litres"] == 65 and pairs["Spent (₹)"] == 3_900
    assert pairs["Km per litre (lifetime)"] == round(4_000 / 45, 2)          # the app's rule: km between fills ÷ litres
    newest = item["tables"][0]["rows"][0]
    assert newest[5] == 2_000 and newest[6] == 100.0                          # this fill's own interval
    # A period keeps the lifetime figure but only lists its fills.
    rep = _rep(api, "adblue", search=t["truck_id"], from_date="2031-03-01", to_date="2031-03-31")
    assert len(rep["items"][0]["tables"][0]["rows"]) == 1
    api_as("Maintenance").get("/exports/resource-report/preview", params={"kind": "adblue"})
    api_as("Auditor").get("/exports/resource-report/preview", params={"kind": "adblue"}, expect=403)


def test_run_record_matches_the_shared_run_stats(api, api_as, db):
    from routers.running_cost import truck_run_stats_all
    stats = truck_run_stats_all(db)
    rep = _rep(api, "runrecord")
    for row in rep["tables"][0]["rows"]:
        st = stats.get(row[1]) or {}
        assert row[4] == st.get("monthly_avg") and row[5] == st.get("normal_km")     # the calculator's own figures
    total = sum(r[3] for r in rep["tables"][0]["rows"])
    assert abs(sum(r[1] for r in rep["tables"][1]["rows"]) - total) < 0.01        # month by month adds up
    api_as("Maintenance").get("/exports/resource-report/preview", params={"kind": "runrecord"}, expect=403)
