"""
Migration: Replace major_repair_name + major_repair_cost columns on trip_sheets
with a single major_repairs JSON column that holds an array of {name, cost} objects.
Run ONCE against the running MySQL database.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text, inspect


def run():
    inspector = inspect(engine)
    existing_cols = {col["name"] for col in inspector.get_columns("trip_sheets")}

    with engine.connect() as conn:

        # Drop old single-value columns if they exist
        for col in ("major_repair_name", "major_repair_cost"):
            if col in existing_cols:
                try:
                    conn.execute(text(f"ALTER TABLE trip_sheets DROP COLUMN `{col}`"))
                    conn.commit()
                    print(f"  [DROPPED] {col}")
                except Exception as e:
                    print(f"  [SKIP DROP] {col}: {e}")
            else:
                print(f"  [SKIP] {col} (does not exist)")

        # Add major_repairs JSON column if not already present
        if "major_repairs" not in existing_cols:
            try:
                conn.execute(text("ALTER TABLE trip_sheets ADD COLUMN `major_repairs` JSON NULL"))
                conn.commit()
                print("  [ADDED] major_repairs JSON NULL")
            except Exception as e:
                print(f"  [SKIP ADD] major_repairs: {e}")
        else:
            print("  [EXISTS] major_repairs")

    print("\nMigration complete. trip_sheets.major_repairs is ready.")


if __name__ == "__main__":
    run()
