#!/usr/bin/env python3
from database import engine, Base
import models

from sqlalchemy import text

def clear_database():
    print("Dropping all tables forcefully...")
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        result = conn.execute(text("SHOW TABLES"))
        tables = [row[0] for row in result]
        for table in tables:
            print(f"Dropping {table}...")
            conn.execute(text(f"DROP TABLE IF EXISTS `{table}`"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
    
    print("Recreating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Database cleared and schema recreated successfully!")

if __name__ == "__main__":
    clear_database()
