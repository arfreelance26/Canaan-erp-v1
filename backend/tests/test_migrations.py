"""Startup migrations: the database they produce must match the models, and
running them again (every restart) must change nothing and lose nothing."""
import re

import pytest
from sqlalchemy import Enum as SAEnum, UniqueConstraint, text


def _schema(conn):
    cols, idx = {}, set()
    for t, col, ctype in conn.execute(text(
        "SELECT table_name, column_name, column_type FROM information_schema.columns WHERE table_schema = DATABASE()"
    )):
        cols.setdefault(t, {})[col] = ctype
    for t, name in conn.execute(text(
        "SELECT DISTINCT table_name, index_name FROM information_schema.statistics WHERE table_schema = DATABASE()"
    )):
        idx.add((t, name))
    return cols, idx


def _schema_problems():
    from database import Base, engine
    with engine.connect() as conn:
        cols, idx = _schema(conn)
    problems = []
    for table in Base.metadata.sorted_tables:
        if table.name not in cols:
            problems.append(f"missing table {table.name}")
            continue
        for col in table.columns:
            have = cols[table.name].get(col.name)
            if have is None:
                problems.append(f"missing column {table.name}.{col.name}")
            elif isinstance(col.type, SAEnum):
                values = set(re.findall(r"'((?:[^']|'')*)'", have))
                missing = [v for v in col.type.enums if v not in values]
                if missing:
                    problems.append(f"ENUM {table.name}.{col.name} lacks {missing}")
        for ix in table.indexes:
            if ix.name and (table.name, ix.name) not in idx:
                problems.append(f"missing index {table.name}.{ix.name}")
        for cons in table.constraints:
            if isinstance(cons, UniqueConstraint) and cons.name and (table.name, cons.name) not in idx:
                problems.append(f"missing unique {table.name}.{cons.name}")
    return problems


def _enum_counts():
    from database import engine
    counts = {}
    with engine.connect() as conn:
        for t, col in conn.execute(text(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND data_type = 'enum'"
        )).fetchall():
            counts[f"{t}.{col}"] = dict(conn.execute(text(f"SELECT `{col}`, COUNT(*) FROM `{t}` GROUP BY `{col}`")).fetchall())
    return counts


def test_schema_matches_models(app):
    assert _schema_problems() == []


@pytest.mark.parametrize("fk", [
    ("maintenance_records", "fk_maintenance_vendor"),
    ("trips", "fk_trips_customer_destination"),
    ("tyre_inventory", "fk_tyre_inventory_vendor"),
])
def test_foreign_keys_exist(app, fk):
    from database import engine
    with engine.connect() as conn:
        found = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() "
            "AND constraint_type = 'FOREIGN KEY' AND table_name = :t AND constraint_name = :n"
        ), {"t": fk[0], "n": fk[1]}).scalar()
    assert found == 1


def test_rerunning_migrations_keeps_every_enum_value(app, db, staff):
    """An older migration narrows edit_approval_requests.resource_type to a list
    without 'MaintenanceRecord'. On non-strict MySQL that would silently blank
    the value — the _enum_change_drops_data guard must skip it."""
    import main
    import models

    req = models.EditApprovalRequest(
        staff_db_id=staff["Maintenance"].id, staff_name="Pytest", resource_type="MaintenanceRecord",
        resource_id=1, resource_name="guard check", action="Edit", reason="pytest",
    )
    db.add(req)
    db.commit()
    before = _enum_counts()

    # The schema steps of a restart, in startup order — an ENUM narrowed by an
    # old statement in one step can be widened again by a later one.
    main._run_schema_migrations()
    main._run_chat_migrations()
    main._run_staff_history_migrations()
    main._widen_blob_columns()

    db.rollback()  # end the session's snapshot so the migrations' changes are visible
    assert db.get(models.EditApprovalRequest, req.id).resource_type == "MaintenanceRecord"
    assert _enum_counts() == before
    assert _schema_problems() == []
    db.delete(db.get(models.EditApprovalRequest, req.id))
    db.commit()


def test_enum_guard_detects_narrowing(app):
    import main
    from database import engine
    narrowing = ("ALTER TABLE edit_approval_requests MODIFY COLUMN resource_type "
                 "ENUM('Customer','Vendor') NOT NULL")
    widening = ("ALTER TABLE edit_approval_requests MODIFY COLUMN resource_type "
                "ENUM('Customer','Vendor','BookingSheet','TripSheet','TripData','Trip','FuelLog','Driver','Truck',"
                "'MaintenanceRecord','Extra') NOT NULL")
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO edit_approval_requests (staff_db_id, staff_name, resource_type, resource_id, "
            "resource_name, action, reason, status, created_at) "
            "VALUES (0, 'guard', 'Truck', 1, 'guard', 'Edit', 'pytest', 'Pending', NOW())"
        ))
        try:
            assert main._enum_change_drops_data(conn, narrowing) is True
            assert main._enum_change_drops_data(conn, widening) is False
        finally:
            conn.rollback()
