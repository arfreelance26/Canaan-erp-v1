"""Insights → View (profit_reports.py): Trip Summary, Customer Profitability
and Running Cost as designed reports — each matching its page's figures."""


def _rep(api, kind, **params):
    return api.get("/exports/resource-report/preview", params={"kind": kind, **params})["report"]


def _money(text: str) -> float:
    return float(text.replace("₹", "").replace(",", ""))


def test_trip_summary_matches_the_page(api):
    page = api.get("/trips/pnl-summary", params={"limit": 1})
    rep = _rep(api, "tripsummary")
    assert int(rep["kpis"][0]["value"]) == page["total_count"]
    assert abs(_money(rep["kpis"][1]["value"]) - page["total_hire"]) < 0.01
    assert abs(_money(rep["kpis"][3]["value"]) - page["total_pnl"]) < 0.01
    assert rep["items"][-1]["title"] == "Loss-making trips"


def test_customer_profitability_matches_the_page(api):
    customers = api.get("/trips/customer-profitability")
    rep = _rep(api, "custprofit", resource_type="Basic")
    assert len(rep["items"]) == len(customers)                       # a sheet per customer
    revenue = sum(c["total_revenue"] for c in customers)
    assert abs(_money(rep["kpis"][0]["value"]) - revenue) < 0.01
    final = sum(c["total_profit"] - c["truck_cost"]["Basic"] for c in customers)
    assert abs(_money(rep["kpis"][2]["value"]) - final) < 0.05
    assert "Cost/KM Basic" in rep["period"]["label"]


def test_running_cost_matches_the_calculator(api, world):
    tid = world.truck["truck_id"]
    server = api.get("/running-cost/cost-breakdown-all")["Advanced"].get(tid) or {}
    rep = _rep(api, "runningcost", search=tid, resource_type="Advanced")
    row = next(r for r in rep["tables"][0]["rows"] if r[1] == tid)
    assert (row[-1] is None) == (server.get("total") is None)
    if server.get("total") is not None:
        assert abs(row[-1] - server["total"]) < 0.001
    (item,) = [i for i in rep["items"] if tid in i["subtitle"]]
    assert {t["title"].split(" — ")[0] for t in item["tables"]} >= {"DIESEL", "TYRES", "EMI"}    # how each part was worked out


def test_admin_only(api_as):
    for kind in ("tripsummary", "custprofit", "runningcost"):
        api_as("Accounts").get("/exports/resource-report/preview", params={"kind": kind}, expect=403)
