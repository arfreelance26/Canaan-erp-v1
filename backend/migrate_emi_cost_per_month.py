"""Add cost_per_month column to emi_records table."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text(
            "ALTER TABLE emi_records ADD COLUMN cost_per_month DECIMAL(10, 2) DEFAULT 0"
        ))
        conn.commit()
        print("✓ Added cost_per_month column to emi_records")
    except Exception as e:
        if "Duplicate column name" in str(e):
            print("⚠ Column already exists, skipping")
        else:
            raise
