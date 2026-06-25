#!/usr/bin/env python3
from database import engine, Base
import models

def clear_database():
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    print("Recreating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Database cleared and schema recreated successfully!")

if __name__ == "__main__":
    clear_database()
