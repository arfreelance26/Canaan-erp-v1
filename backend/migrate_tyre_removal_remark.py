"""
Migration: Add removal_remark column to tyre_fitment_records table.
Safe to run multiple times (checks if column exists first).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    exists = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = 'tyre_fitment_records' AND column_name = 'removal_remark'"
    )).scalar()
    if exists:
        print("  Column 'removal_remark' already exists — skipping.")
    else:
        conn.execute(text("ALTER TABLE tyre_fitment_records ADD COLUMN removal_remark VARCHAR(500) NULL"))
        conn.commit()
        print("  Column 'removal_remark' added successfully.")

print("Done.")
