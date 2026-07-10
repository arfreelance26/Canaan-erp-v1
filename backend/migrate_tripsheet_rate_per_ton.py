"""
Migration: Add rate_per_ton column to trip_sheets table.
Safe to run multiple times (checks if column exists first).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    exists = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = 'trip_sheets' AND column_name = 'rate_per_ton'"
    )).scalar()
    if exists:
        print("  Column 'rate_per_ton' already exists — skipping.")
    else:
        conn.execute(text("ALTER TABLE trip_sheets ADD COLUMN rate_per_ton DECIMAL(10,2) NULL AFTER hire_amount"))
        conn.commit()
        print("  Column 'rate_per_ton' added successfully.")

print("Done.")
