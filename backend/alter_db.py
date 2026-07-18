from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE emi_records ADD COLUMN cost_per_month DECIMAL(10,2) DEFAULT 0"))
        conn.commit()
        print("Column cost_per_month added successfully!")
    except Exception as e:
        print("Error altering table:", e)
