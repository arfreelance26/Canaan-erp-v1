# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

"""
One-time script to create the Fleet Manager staff account.
Run from the backend directory:  python seed_fleet_manager.py
"""
from database import SessionLocal
import models
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERNAME   = "fleet.manager"
PASSWORD   = "Fleet@2026"
NAME       = "Fleet Manager"
STAFF_ID   = "CGI-FM-001"
ROLE       = "Fleet Manager"

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
        print(f"[ok] Fleet Manager account created.")
        print(f"     Username : {USERNAME}")
        print(f"     Password : {PASSWORD}")
        print(f"     Staff ID : {STAFF_ID}")
        print(f"     Role     : {ROLE}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
