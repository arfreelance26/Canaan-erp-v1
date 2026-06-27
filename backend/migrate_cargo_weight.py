import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE trips MODIFY COLUMN cargo_weight VARCHAR(100)"))
            conn.commit()
            print("Successfully updated cargo_weight to VARCHAR(100) in trips table.")
        except Exception as e:
            print(f"Error modifying column: {e}")

if __name__ == "__main__":
    run()
