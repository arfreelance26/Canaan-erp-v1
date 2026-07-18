"""
Migration: add 'SELF/CGI' to bill_to ENUM in trips and trip_closures tables.
Run once: python migrate_bill_to_self_cgi.py
"""
from database import engine

with engine.connect() as conn:
    conn.execute(
        __import__("sqlalchemy").text(
            "ALTER TABLE trips MODIFY COLUMN bill_to ENUM('CUSTOMER','CONSIGNEE','SELF/CGI')"
        )
    )
    conn.execute(
        __import__("sqlalchemy").text(
            "ALTER TABLE trip_closures MODIFY COLUMN bill_to ENUM('CUSTOMER','CONSIGNEE','SELF/CGI')"
        )
    )
    conn.commit()
    print("Done — bill_to enum updated in trips and trip_closures.")
