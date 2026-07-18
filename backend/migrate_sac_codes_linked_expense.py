"""
Migration: Add linked_expense and version columns to sac_codes table.
Safe to run multiple times (checks if column exists first).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

ADD_COLUMNS = [
    "ALTER TABLE sac_codes ADD COLUMN linked_expense VARCHAR(200) NULL",
    "ALTER TABLE sac_codes ADD COLUMN version INT NOT NULL DEFAULT 1",
]

with engine.connect() as conn:
    for sql in ADD_COLUMNS:
        col = sql.split("ADD COLUMN ")[1].split(" ")[0]
        exists = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'sac_codes' AND column_name = :col"
        ), {"col": col}).scalar()
        if exists:
            print(f"  Column '{col}' already exists — skipping.")
        else:
            conn.execute(text(sql))
            conn.commit()
            print(f"  Column '{col}' added successfully.")

print("Done.")
