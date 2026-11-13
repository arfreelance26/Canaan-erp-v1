"""Every page's report opens for the same roles as its page (lib/nav-config.ts
ROLE_HREFS) — so Reports Center, which shows each role only its own pages'
reports, can't be used to reach anything else."""
import pytest

ROLES = ["Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance",
         "Trip Sheet Register", "Yard Supervisor", "Auditor"]
MANAGERS = {"Commercial Manager", "Assistant Commercial Manager"}
PERIOD = {"from_date": "2026-01-01", "to_date": "2026-01-31"}

# (path, params, roles allowed besides Admin)
CASES = [
    ("/exports/maintenance-report/preview", {}, {"Maintenance"}),
    ("/exports/fuel-report/preview", {}, {"Maintenance", "Trip Sheet Register"}),
    ("/exports/trip-report/preview", {}, MANAGERS | {"Accounts"}),
    ("/exports/attendance-report/preview", {"category": "driver", **PERIOD}, MANAGERS),
    ("/exports/attendance-report/preview", {"category": "staff", **PERIOD}, set()),
    ("/exports/resource-report/preview", {"kind": "drivers"}, MANAGERS),
    ("/exports/resource-report/preview", {"kind": "fleet"}, MANAGERS),
    ("/exports/resource-report/preview", {"kind": "customers"}, MANAGERS | {"Accounts"}),
    ("/exports/resource-report/preview", {"kind": "vendors"}, {"Maintenance"}),
    ("/exports/resource-report/preview", {"kind": "staff"}, set()),
    ("/exports/resource-report/preview", {"kind": "tripsummary", **PERIOD}, set()),
]


@pytest.mark.parametrize("role", ROLES)
def test_reports_follow_page_roles(api_as, role):
    user = api_as(role)
    for path, params, allowed in CASES:
        user.get(path, params=params, expect=200 if role in allowed else 403)


def test_admin_opens_every_report(api):
    for path, params, _ in CASES:
        api.get(path, params=params)
