from database import engine
from sqlalchemy import text

def add_fuel_logs_columns():
    with engine.begin() as conn:
        try:
            # Check if columns exist
            result = conn.execute(text("SHOW COLUMNS FROM fuel_logs LIKE 'distance'")).fetchone()
            if not result:
                print("Adding distance and mileage columns to fuel_logs table...")
                conn.execute(text("ALTER TABLE fuel_logs ADD COLUMN distance NUMERIC(10, 2) DEFAULT 0"))
                conn.execute(text("ALTER TABLE fuel_logs ADD COLUMN mileage NUMERIC(10, 2) DEFAULT 0"))
                print("Successfully added distance and mileage columns.")
            else:
                print("distance and mileage columns already exist.")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    add_fuel_logs_columns()
