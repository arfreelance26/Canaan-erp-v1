from database import SessionLocal
import models
from datetime import date
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
dummy_hash = pwd_ctx.hash("password123")

def seed_staff():
    db = SessionLocal()
    try:
        # -------------------------------------------------------------------
        # 1. BRANCHES
        # -------------------------------------------------------------------
        branches = [
            models.Branch(name="CHENNAI",   halt_day_fee_20ft=500, halt_day_fee_40ft=700, driver_halt_day_percentage=5),
            models.Branch(name="TUTICORIN", halt_day_fee_20ft=450, halt_day_fee_40ft=650, driver_halt_day_percentage=5),
        ]
        db.add_all(branches)
        
        # -------------------------------------------------------------------
        # 2. STAFF (Admins & Managers)
        # -------------------------------------------------------------------
        staff = [
            models.Staff(
                staff_id="STF-1001", name="Alan", department="Management",
                designation="System Administrator", software_designation="Admin",
                date_of_birth=date(1985, 6, 15), date_of_joining=date(2015, 1, 1),
                email="admin@canaan.com", contact_number="1234567890",
                address="123, Main Street, Head Office, Chennai - 600001",
                username="admin", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1002", name="Karthik Subramaniam", department="Operations",
                designation="Fleet Operations Manager", software_designation="Trip Sheet Register",
                date_of_birth=date(1987, 3, 22), date_of_joining=date(2018, 4, 10),
                email="karthik.s@canaan.com", contact_number="9876543210",
                address="23, Nandanam Extension, Chennai - 600035",
                username="karthik.subramaniam", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1003", name="Priya Natarajan", department="Finance",
                designation="Finance Manager", software_designation="Accounts",
                date_of_birth=date(1990, 8, 14), date_of_joining=date(2019, 7, 22),
                email="priya.n@canaan.com", contact_number="9876543211",
                address="45, T Nagar, Chennai - 600017",
                username="priya.natarajan", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1004", name="Ramesh Krishnan", department="Maintenance",
                designation="Tyre Manager", software_designation="Maintenance",
                date_of_birth=date(1982, 11, 5), date_of_joining=date(2017, 2, 18),
                email="ramesh.k@canaan.com", contact_number="9876543212",
                address="12, Velachery Main Road, Chennai - 600042",
                username="ramesh.krishnan", password_hash=dummy_hash,
            ),
        ]
        db.add_all(staff)
        
        db.commit()
        print("Successfully seeded Branches and Staff!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding staff: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_staff()
