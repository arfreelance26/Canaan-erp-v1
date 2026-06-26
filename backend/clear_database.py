#!/usr/bin/env python3
from database import engine, Base
import models

from sqlalchemy import text

def clear_database():
    print("Dropping all tables...")
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        Base.metadata.drop_all(bind=conn)
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
    
    print("Recreating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Database cleared and schema recreated successfully!")

if __name__ == "__main__":
    clear_database()
