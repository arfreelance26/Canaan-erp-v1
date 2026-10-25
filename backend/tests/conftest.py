"""Shared pytest setup for the backend.

Every run gets its own throwaway MySQL database (``canaan_pytest`` by default)
on the LOCAL server named in backend/.env — the real database is never
touched:

- It refuses to run unless DB_HOST is localhost / 127.0.0.1 / ::1.
- The test database name must start with ``canaan_pytest``, and it's dropped
  and re-created at the start of the run and dropped again at the end
  (set KEEP_TEST_DB=1 to keep it for a look afterwards).
- TEST_SOURCE_DB=<local db> copies that database in first (needs the
  ``mysqldump`` / ``mysql`` clients), so the tests run against real data
  and the startup migrations upgrade it exactly as they would in production.
  Without it the tests start from an empty database.

Connections use production's NON-STRICT sql_mode (GoDaddy's MySQL), where
e.g. narrowing an ENUM silently blanks values instead of failing.

Run from backend/:   pytest
"""
import os
import secrets
import subprocess
import sys
import urllib.parse
from datetime import date

import pytest
from dotenv import dotenv_values

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BACKEND)
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

_env = {**dotenv_values(os.path.join(BACKEND, ".env")), **os.environ}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
TEST_DB = os.environ.get("TEST_DB_NAME", "canaan_pytest")
SOURCE_DB = os.environ.get("TEST_SOURCE_DB")
PRODUCTION_SQL_MODE = "NO_ENGINE_SUBSTITUTION"

ROLES = (
    "Admin", "Commercial Manager", "Assistant Commercial Manager", "Accounts",
    "Maintenance", "Trip Sheet Register", "Yard Supervisor", "Auditor",
)


def _server_url(db: str = "") -> str:
    pw = urllib.parse.quote_plus(_env.get("DB_PASSWORD") or "")
    return f"mysql+pymysql://{_env.get('DB_USER')}:{pw}@{_env.get('DB_HOST')}/{db}"


def _admin_engine():
    from sqlalchemy import create_engine
    return create_engine(_server_url(), isolation_level="AUTOCOMMIT")


def _copy_source_db() -> None:
    env = {**os.environ, "MYSQL_PWD": _env.get("DB_PASSWORD") or ""}
    login = ["-u", _env.get("DB_USER") or "", "-h", "127.0.0.1"]
    dump = subprocess.Popen(
        ["mysqldump", *login, "--single-transaction", "--routines", "--triggers",
         "--no-tablespaces", "--set-gtid-purged=OFF", SOURCE_DB],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env,
    )
    load = subprocess.run(["mysql", *login, TEST_DB], stdin=dump.stdout, env=env, capture_output=True)
    dump.stdout.close()
    if dump.wait() != 0 or load.returncode != 0:
        pytest.exit(f"Couldn't copy {SOURCE_DB} into {TEST_DB}: {load.stderr.decode()[:300]}", returncode=1)


def pytest_configure(config):
    from sqlalchemy import text

    if (_env.get("DB_HOST") or "").strip().lower() not in LOCAL_HOSTS:
        pytest.exit("Tests only run against a LOCAL MySQL server — DB_HOST in backend/.env isn't local.", returncode=1)
    if not TEST_DB.startswith("canaan_pytest"):
        pytest.exit("TEST_DB_NAME must start with 'canaan_pytest'.", returncode=1)
    if SOURCE_DB and SOURCE_DB == TEST_DB:
        pytest.exit("TEST_SOURCE_DB can't be the test database itself.", returncode=1)

    eng = _admin_engine()
    with eng.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS `{TEST_DB}`"))
        conn.execute(text(f"CREATE DATABASE `{TEST_DB}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
    eng.dispose()
    if SOURCE_DB:
        _copy_source_db()

    # Must be set before anything imports database.py / main.py.
    os.environ["DATABASE_URL"] = _server_url(TEST_DB)

    import database
    from sqlalchemy import event

    @event.listens_for(database.engine, "connect")
    def _production_sql_mode(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute(f"SET SESSION sql_mode='{PRODUCTION_SQL_MODE}'")
        cur.close()


def pytest_unconfigure(config):
    if os.environ.get("KEEP_TEST_DB") or "database" not in sys.modules:
        return
    from sqlalchemy import text
    sys.modules["database"].engine.dispose()
    eng = _admin_engine()
    with eng.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS `{TEST_DB}`"))
    eng.dispose()


# ---------------------------------------------------------------------------
# App, client, database session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app():
    import main  # runs every startup migration against the test database
    return main.app


@pytest.fixture(scope="session")
def spec(app):
    return app.openapi()


@pytest.fixture(scope="session")
def endpoints(app):
    from endpoints import all_endpoints
    return all_endpoints(app)


@pytest.fixture(scope="session")
def client(app, endpoints):
    """Records every endpoint it calls — test_zz_coverage.py checks that each
    one succeeded at least once."""
    from endpoints import RecordingClient
    RecordingClient.endpoints = endpoints
    with RecordingClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def plain_client(app):
    """A client that doesn't count towards coverage (for deliberately bad requests)."""
    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


class Api:
    """client calls that assert the expected status and return the JSON body.

        api.post("/trucks", json={...})            # expects 2xx
        api.get("/trucks/999", expect=404)
    """

    def __init__(self, client, headers):
        self.client, self.headers = client, headers

    def call(self, method, url, expect=None, headers=None, **kw):
        res = self.client.request(method, url, headers={**self.headers, **(headers or {})}, **kw)
        ok = (200 <= res.status_code < 300) if expect is None else res.status_code in (
            expect if isinstance(expect, (tuple, list, set)) else (expect,))
        assert ok, f"{method} {url} -> {res.status_code}: {res.text[:400]}"
        if not res.content or "json" not in res.headers.get("content-type", ""):
            return res
        return res.json()

    def get(self, url, **kw):
        return self.call("GET", url, **kw)

    def post(self, url, **kw):
        return self.call("POST", url, **kw)

    def put(self, url, **kw):
        return self.call("PUT", url, **kw)

    def patch(self, url, **kw):
        return self.call("PATCH", url, **kw)

    def delete(self, url, **kw):
        return self.call("DELETE", url, **kw)


@pytest.fixture(scope="session")
def api(client, auth):
    """Admin API helper."""
    return Api(client, auth("Admin"))


@pytest.fixture(scope="session")
def api_as(client, auth):
    """api_as("Maintenance").get(...)"""
    return lambda role: Api(client, auth(role))


@pytest.fixture()
def db(app):
    from database import SessionLocal
    session = SessionLocal()
    yield session
    session.close()


# ---------------------------------------------------------------------------
# People and tokens
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def staff(app):
    """One active staff member per software role: {role: Staff}."""
    import models
    from database import SessionLocal
    session = SessionLocal()
    people = {}
    try:
        for role in ROLES:
            tag = secrets.token_hex(3).upper()
            person = models.Staff(
                staff_id=f"PT-{tag}", name=f"Pytest {role}", software_designation=role,
                department="QA", designation="Tester", date_of_joining=date(2024, 1, 1),
                username=f"pytest.{tag.lower()}", password_hash="!", token_version=0,
            )
            session.add(person)
            session.flush()
            people[role] = person
        session.commit()
        for person in people.values():
            session.refresh(person)
            session.expunge(person)
    finally:
        session.close()
    return people


def headers_for(person) -> dict:
    from security import create_access_token
    token = create_access_token(
        user_id=person.id, name=person.name, role=person.software_designation,
        staff_id=person.staff_id, token_version=person.token_version or 0,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def auth(staff):
    """auth("Maintenance") -> Authorization header for that role's staff member."""
    return lambda role: headers_for(staff[role])


@pytest.fixture(scope="session")
def builtin_admin_headers(app):
    """The .env ADMIN_USERNAME login — an Admin with no staff row (user id None)."""
    from security import create_access_token
    token = create_access_token(user_id=None, name="Built-in Admin", role="Admin", staff_id=None)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Fleet data
# ---------------------------------------------------------------------------

@pytest.fixture()
def truck(db):
    import models
    tag = secrets.token_hex(3).upper()
    t = models.Truck(
        truck_id=f"PT-T{tag}", registration_number=f"TN01PT{tag}", manufacturer="Tata",
        model_name="Signa", truck_type="20 FT RIGID", tyre_layout="10+1", odometer=50_000,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@pytest.fixture()
def maintenance_record(db, truck):
    import models
    rec = models.MaintenanceRecord(
        truck_id=truck.id, date=date(2026, 1, 15), odometer=40_000,
        maintenance_type="Service", cost=1500,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@pytest.fixture(scope="session")
def world(api):
    """Shared records created through the API — see tests/world.py."""
    from world import build_world
    return build_world(api)
