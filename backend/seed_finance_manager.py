"""
One-time script to create the Finance Manager staff account.
Run from the backend directory:  python seed_finance_manager.py
"""
from database import SessionLocal
import models
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERNAME   = "finance.manager"
PASSWORD   = "Finance@2026"
NAME       = "Finance Manager"
STAFF_ID   = "CGI-FM-002"
ROLE       = "Finance Manager"

def main():
    db = SessionLocal()
    try:
        existing = db.query(models.Staff).filter(models.Staff.username == USERNAME).first()
        if existing:
            print(f"[skip] Staff with username '{USERNAME}' already exists.")
            return

        staff = models.Staff(
            staff_id=STAFF_ID,
            name=NAME,
            username=USERNAME,
            password_hash=pwd_ctx.hash(PASSWORD),
            software_designation=ROLE,
        )
        db.add(staff)
        db.commit()
        print(f"[ok] Finance Manager account created.")
        print(f"     Username : {USERNAME}")
        print(f"     Password : {PASSWORD}")
        print(f"     Staff ID : {STAFF_ID}")
        print(f"     Role     : {ROLE}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
