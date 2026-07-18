from database import engine
from sqlalchemy import text

def add_fuel_capacity_column():
    with engine.begin() as conn:
        try:
            # Check if column exists
            result = conn.execute(text("SHOW COLUMNS FROM trucks LIKE 'fuel_capacity'")).fetchone()
            if not result:
                print("Adding fuel_capacity column to trucks table...")
                conn.execute(text("ALTER TABLE trucks ADD COLUMN fuel_capacity NUMERIC(10, 2) NOT NULL DEFAULT 0"))
                print("Successfully added fuel_capacity column.")
            else:
                print("fuel_capacity column already exists in trucks table.")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    add_fuel_capacity_column()
