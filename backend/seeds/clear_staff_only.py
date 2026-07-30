# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

import sys
from sqlalchemy import text
from database import engine, Base, SessionLocal
import models
from datetime import date
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
dummy_hash = pwd_ctx.hash("password123")

def clear_and_reseed_staff():
    print("== Clearing and Recreating Staff Schema ==")
    
    with engine.connect() as conn:
        # 1. Staff-linked rows in shared tables
        conn.execute(text("DELETE FROM compensation_transactions WHERE person_type = 'staff'"))
        conn.execute(text("DELETE FROM leave_requests WHERE category != 'Driver'"))
        conn.execute(text("DELETE FROM edit_approval_requests"))

        # 2. Drop staff tables
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        conn.execute(text("DROP TABLE IF EXISTS staff_attendance"))
        conn.execute(text("DROP TABLE IF EXISTS staff"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        conn.commit()

    print("Tables dropped. Recreating...")
    
    # 3. Recreate from the current models (fresh enum, empty tables)
    Base.metadata.create_all(bind=engine, tables=[
        models.Staff.__table__,
        models.StaffAttendance.__table__,
    ])
    
    print("Schema recreated successfully.")
    
    print("Seeding initial admin and managers...")
    db = SessionLocal()
    try:
        staff = [
            models.Staff(
                staff_id="STF-1001", name="Admin User", department="Administration",
                designation="System Administrator", software_designation="Admin",
                date_of_birth=date(1985, 6, 15), date_of_joining=date(2017, 1, 2),
                email="admin@canaan.com", contact_number="9988776655",
                address="Canaan Global HQ, Anna Salai, Chennai - 600002",
                aadhar_number="1100 2200 3300", username="admin", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1002", name="Karthik Subramaniam", department="Operations",
                designation="Fleet Operations Manager", software_designation="Fleet Manager",
                date_of_birth=date(1987, 3, 22), date_of_joining=date(2018, 4, 10),
                email="karthik.s@canaan.com", contact_number="9876543210",
                address="23, Nandanam Extension, Chennai - 600035",
                aadhar_number="4400 5500 6600", username="karthik.subramaniam", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1003", name="Priyanka Venkatesh", department="Finance",
                designation="Finance Manager", software_designation="Finance Manager",
                date_of_birth=date(1990, 9, 5), date_of_joining=date(2019, 7, 15),
                email="priyanka.v@canaan.com", contact_number="9443221100",
                address="14, Besant Nagar, 2nd Street, Chennai - 600090",
                aadhar_number="7700 8800 9900", username="priyanka.venkatesh", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1004", name="Saravanan Murugesan", department="Maintenance",
                designation="Tyre Manager", software_designation="Tyre Manager",
                date_of_birth=date(1983, 12, 18), date_of_joining=date(2018, 11, 1),
                email="saravanan.m@canaan.com", contact_number="9362554433",
                address="5, Raja Street, Tuticorin - 628001",
                aadhar_number="1122 3344 5566", username="saravanan.murugesan", password_hash=dummy_hash,
            ),
        ]
        db.add_all(staff)
        db.commit()
        print("Successfully seeded initial Staff!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding staff: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clear_and_reseed_staff()
