"""Tyre Records → View (tyre_reports.py): the five tyre reports."""
from datetime import date

import models
import tyre_reports as tr
from world import create_truck

TAG = "PYTYRE"


def _rep(api, kind, **params):
    return api.get("/exports/resource-report/preview", params={"kind": kind, **params})["report"]


def _seed(api, db):
    """A truck at 100,000 km with two tyres: one fitted at 40,000 (60,000 km run),
    one fitted with odometer 0 (imported: km unknown); one in stock, one
    waiting for retread with a retread done, one discarded."""
    t = create_truck(api)
    truck = db.query(models.Truck).filter_by(truck_id=t["truck_id"]).one()
    truck.odometer = 100_000
    tyres = {}
    for n, extra in (("FIT", {}), ("OLD", {}), ("STOCK", {}),
                     ("RET", {"retread_flagged_at": date(2031, 6, 1), "retread_flagged_by": "Pytest"}),
                     ("DIS", {"discarded_at": date(2031, 6, 2), "discarded_by": "Pytest", "discard_reason": "Cut"})):
        ty = models.TyreInventory(brand=f"{TAG} Brand", tyre_type="RADIAL", tyre_number=f"{TAG}-{n}-{t['truck_id']}", size="10R20",
                                  range_km=100_000, cost=20_000, purchase_date=date(2031, 5, 1), **extra)
        db.add(ty)
        db.flush()
        tyres[n] = ty
    db.add(models.TyreFitmentRecord(tyre_id=tyres["FIT"].id, truck_id=truck.id, position="Axle 1 - Left", fitted_odometer=40_000,
                                    fitted_date=date(2031, 5, 2)))
    db.add(models.TyreFitmentRecord(tyre_id=tyres["OLD"].id, truck_id=truck.id, position="Axle 1 - Right", fitted_odometer=0,
                                    fitted_date=date(2031, 5, 2)))
    db.add(models.TyreFitmentRecord(tyre_id=tyres["DIS"].id, truck_id=truck.id, position="Axle 2 - Left", fitted_odometer=10_000,
                                    removed_odometer=40_000, fitted_date=date(2031, 5, 2), removed_date=date(2031, 5, 20)))
    db.add(models.TyreMovementEvent(tyre_id=tyres["STOCK"].id, event="Moved to Inventory", actor_name="Pytest", retread_cost=6_000,
                                    retread_count=1, retread_done_by="Pytest Retreads", expected_range=60_000))
    db.commit()
    return t, tyres


def test_tyre_reports(api, api_as, db):
    t, tyres = _seed(api, db)
    d = tr._Data(db)
    assert d.status(tyres["FIT"]) == "Fitted" and d.status(tyres["STOCK"]) == "In stock"
    assert d.status(tyres["RET"]) == "Waiting for retread" and d.status(tyres["DIS"]) == "Discarded"
    assert d.km(tyres["FIT"]) == 60_000 and d.used(tyres["FIT"])["v"] == 60.0
    assert d.used(tyres["OLD"]) == {"v": "km unknown", "tone": None}            # odometer 0 isn't counted as the truck's whole life

    q = {"search": TAG}
    inv = _rep(api, "tyre_inventory", **q)
    assert inv["kpis"][0]["value"] == "5" and {i["title"] for i in inv["items"]} == set(tr.STATUSES)
    c = api.get("/exports/tyre-report-counts", params=q)
    assert c["stages"] == {"Fitted": 2, "In stock": 1, "Waiting for retread": 1, "Discarded": 1}
    assert api.get("/exports/tyre-report-counts", params={**q, "stage": "Fitted"})["brands"] == {f"{TAG} Brand": 2}

    mg = _rep(api, "tyre_management", search=t["truck_id"])
    (truck,) = mg["items"]
    fitted = truck["tables"][0]["rows"]
    assert len(fitted) == 2 and {r[1] for r in fitted} == {tyres["FIT"].tyre_number, tyres["OLD"].tyre_number}

    ret = _rep(api, "tyre_retread", **q)
    assert ret["items"][0]["tables"][0]["rows"][0][0] == tyres["RET"].tyre_number
    assert ret["items"][1]["tables"][0]["rows"][0][6] == 6_000                  # the retread done

    dis = _rep(api, "tyre_discarded", **q)
    (row,) = dis["items"][0]["tables"][0]["rows"]
    assert row[7] == "Cut" and row[8] == 30_000                                 # km it gave

    _rep(api, "tyre_archive", **q)
    api_as("Maintenance").get("/exports/resource-report/preview", params={"kind": "tyre_inventory", **q})
    api_as("Accounts").get("/exports/resource-report/preview", params={"kind": "tyre_inventory"}, expect=403)
