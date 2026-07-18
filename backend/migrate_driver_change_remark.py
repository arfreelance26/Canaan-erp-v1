"""Add driver_change_remark column to trips table."""
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE trips ADD COLUMN driver_change_remark TEXT NULL"))
        conn.commit()
        print("✓ Added driver_change_remark column to trips table.")
    except Exception as e:
        if "Duplicate column" in str(e) or "already exists" in str(e):
            print("Column already exists, skipping.")
        else:
            raise
