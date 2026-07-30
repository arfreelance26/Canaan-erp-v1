# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

"""
Reset all STAFF data and recreate the staff-related schema.

Deletes ONLY staff-related rows — trucks, drivers, trips, customers, vendors,
finance and maintenance data are untouched.

What it removes:
  1. compensation_transactions where person_type = 'staff'
  2. leave_requests raised by staff (every category except 'Driver')
  3. edit_approval_requests (all rows — they are always raised by staff)
  4. staff_attendance (dropped with the staff table)
  5. staff (table dropped and recreated with the current role enum:
     Admin / Fleet Manager / Finance Manager / Tyre Manager /
     Trip Sheet Register / Yard Staff)

Run from the backend directory:
    python reset_staff.py
"""

import sys

from sqlalchemy import text

from database import engine, Base
import models  # noqa: F401 — register all models so create_all sees them


def main():
    print("== Staff data reset ==")

    with engine.connect() as conn:
        # Show what will be deleted
        for label, sql in [
            ("staff rows", "SELECT COUNT(*) FROM staff"),
            ("staff_attendance rows", "SELECT COUNT(*) FROM staff_attendance"),
            ("staff leave_requests", "SELECT COUNT(*) FROM leave_requests WHERE category != 'Driver'"),
            ("edit_approval_requests", "SELECT COUNT(*) FROM edit_approval_requests"),
            ("staff compensation_transactions",
             "SELECT COUNT(*) FROM compensation_transactions WHERE person_type = 'staff'"),
        ]:
            try:
                n = conn.execute(text(sql)).scalar()
                print(f"  {label}: {n}")
            except Exception as e:
                print(f"  {label}: table missing? ({e})")

    answer = input("Delete all of the above and recreate the staff schema? [yes/no] ").strip().lower()
    if answer != "yes":
        print("Aborted — nothing was changed.")
        sys.exit(0)

    with engine.connect() as conn:
        # 1. Staff-linked rows in shared tables (no FK, so explicit deletes)
        conn.execute(text("DELETE FROM compensation_transactions WHERE person_type = 'staff'"))
        conn.execute(text("DELETE FROM leave_requests WHERE category != 'Driver'"))
        conn.execute(text("DELETE FROM edit_approval_requests"))

        # 2. Drop staff tables — child first (FK), then parent
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        conn.execute(text("DROP TABLE IF EXISTS staff_attendance"))
        conn.execute(text("DROP TABLE IF EXISTS staff"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        conn.commit()

    # 3. Recreate from the current models (fresh enum, empty tables)
    Base.metadata.create_all(bind=engine, tables=[
        models.Staff.__table__,
        models.StaffAttendance.__table__,
    ])

    print("Done. staff + staff_attendance recreated empty; staff-linked rows removed.")
    print("NOTE: there are now no logins — create the first Admin via seed.py or an INSERT.")


if __name__ == "__main__":
    main()
