"""
Migration: Add container_number_1 and container_number_2 columns to trip_sheets table.
Safe to run multiple times (checks if column exists first).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

ADD_COLUMNS = [
    "ALTER TABLE trip_sheets ADD COLUMN container_number_1 VARCHAR(100) NULL AFTER container_number",
    "ALTER TABLE trip_sheets ADD COLUMN container_number_2 VARCHAR(100) NULL AFTER container_number_1",
]

with engine.connect() as conn:
    for sql in ADD_COLUMNS:
        col = sql.split("ADD COLUMN ")[1].split(" ")[0]
        exists = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'trip_sheets' AND column_name = :col"
        ), {"col": col}).scalar()
        if exists:
            print(f"  Column '{col}' already exists — skipping.")
        else:
            conn.execute(text(sql))
            conn.commit()
            print(f"  Column '{col}' added successfully.")

print("Done.")
