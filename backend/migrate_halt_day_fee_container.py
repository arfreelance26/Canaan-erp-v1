"""Replace driver_halt_day_fee with halt_day_fee_20ft and halt_day_fee_40ft on branches table."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    for col, label in [("halt_day_fee_20ft", "20FT"), ("halt_day_fee_40ft", "40FT")]:
        try:
            conn.execute(text(f"ALTER TABLE branches ADD COLUMN {col} DECIMAL(10, 2) DEFAULT 0"))
            conn.commit()
            print(f"OK Added {col} column to branches")
        except Exception as e:
            if "Duplicate column name" in str(e):
                print(f"SKIP {col} already exists, skipping")
            else:
                raise

    # Seed new columns from old value so existing branches keep their rate
    try:
        conn.execute(text(
            "UPDATE branches SET halt_day_fee_20ft = driver_halt_day_fee, "
            "halt_day_fee_40ft = driver_halt_day_fee WHERE halt_day_fee_20ft = 0"
        ))
        conn.commit()
        print("OK Seeded halt_day_fee_20ft / halt_day_fee_40ft from driver_halt_day_fee")
    except Exception as e:
        print(f"SKIP Seed step skipped: {e}")
