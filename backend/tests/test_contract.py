"""Contract checks, run for EACH endpoint separately (one test per endpoint):

- it needs a login (except the few public ones listed below);
- reading it never causes a server error, for any role;
- a write with an empty body / unknown id is refused cleanly (4xx), never a crash;
- deleting something that doesn't exist answers 4xx.
"""
import re

import pytest

import main
from conftest import ROLES
from endpoints import all_endpoints

ENDPOINTS = all_endpoints(main.app)
UNKNOWN = "999999"

# Reachable without the Authorization header, on purpose.
PUBLIC = {
    ("GET", "/"),                                   # health check (internet status pill)
    ("POST", "/auth/login"),
    ("GET", "/files/{entity}/{entity_id}/{field}"),  # <img src> — token comes as ?token=, checked inside
    ("GET", "/compliance-records/{record_id}/file"),  # same: ?token= checked inside
}
# Never call these blind: they'd end the test session or restore over the database.
NOT_BLIND = {("POST", "/auth/logout"), ("POST", "/backup/restore")}
SLOW = {("GET", "/backup/excel"), ("GET", "/backup/sql"), ("GET", "/backup/files")}


def _ids(selected):
    return [e.id for e in selected]


def _fill(path, values):
    def sub(m):
        return str(values.get(m.group(1), UNKNOWN))
    return re.sub(r"\{(\w+)(:\w+)?\}", sub, path)


@pytest.fixture(scope="module")
def real_ids(world):
    """Path-parameter values that exist, so reads reach their real logic."""
    return {
        "truck_id": world.truck["id"], "truck_db_id": world.truck["id"],
        "truck_business_id": world.truck["truck_id"],
        "driver_id": world.driver["id"], "driver_id_str": world.driver["driver_id"],
        "customer_id": world.customer["id"], "dest_id": world.destination["id"],
        "origin_id": world.origin["id"], "vendor_id": world.vendor["id"],
        "branch_id": world.branch["id"], "trip_id": world.trip["id"],
        "entity": "trucks", "entity_id": world.truck["id"], "field": "photo", "doc_type": "rc",
    }


GETS = [e for e in ENDPOINTS if e.method == "GET" and (e.method, e.path) not in SLOW]
WRITES = [e for e in ENDPOINTS if e.method in ("POST", "PUT", "PATCH") and (e.method, e.path) not in NOT_BLIND]
DELETES = [e for e in ENDPOINTS if e.method == "DELETE" and e.params]
PROTECTED = [e for e in ENDPOINTS if (e.method, e.path) not in PUBLIC | NOT_BLIND]


@pytest.mark.parametrize("endpoint", PROTECTED, ids=_ids(PROTECTED))
def test_needs_login(plain_client, endpoint):
    res = plain_client.request(endpoint.method, _fill(endpoint.path, {}))
    assert res.status_code == 401, f"{endpoint.id} answered {res.status_code} without a login"


@pytest.mark.parametrize("role", [*ROLES, "Built-in admin"])
@pytest.mark.parametrize("endpoint", GETS, ids=_ids(GETS))
def test_read_never_errors(client, auth, builtin_admin_headers, real_ids, endpoint, role):
    headers = builtin_admin_headers if role == "Built-in admin" else auth(role)
    res = client.get(_fill(endpoint.path, real_ids), headers=headers)
    assert res.status_code < 500, f"{endpoint.id} as {role} -> {res.status_code}: {res.text[:300]}"


@pytest.mark.parametrize("endpoint", WRITES, ids=_ids(WRITES))
def test_bad_write_is_refused_cleanly(plain_client, auth, endpoint):
    url = _fill(endpoint.path, {})
    res = plain_client.request(endpoint.method, url, headers=auth("Admin"), json={})
    assert res.status_code < 500, f"{endpoint.id} -> {res.status_code}: {res.text[:300]}"


@pytest.mark.parametrize("endpoint", DELETES, ids=_ids(DELETES))
def test_delete_of_unknown_record_is_refused(plain_client, auth, endpoint):
    res = plain_client.delete(_fill(endpoint.path, {}), headers=auth("Admin"))
    assert 400 <= res.status_code < 500, f"{endpoint.id} -> {res.status_code}: {res.text[:300]}"
