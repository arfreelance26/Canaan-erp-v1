# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

import pandas as pd
from sqlalchemy.orm import Session
from database import engine, SessionLocal
from models import Driver
import math
import datetime
import traceback

def clean_string(val, default="NA"):
    if pd.isna(val) or str(val).strip() == "" or str(val).strip().lower() == "nan":
        return default
    return str(val).strip()

def clean_enum(val, valid_options, default="No"):
    s = clean_string(val, default=default)
    if s not in valid_options:
        return default
    return s

def clean_date(val):
    if pd.isna(val):
        return None
    try:
        # It's usually a pandas Timestamp if parsed by read_excel, else string
        if isinstance(val, str):
            # Try parsing
            return pd.to_datetime(val, dayfirst=True).date()
        elif hasattr(val, 'date'):
            return val.date()
        else:
            return pd.to_datetime(val).date()
    except:
        return None

def seed_drivers():
    print("Loading Canaan Global Drivers.xlsx...")
    df = pd.read_excel("../data/Canaan Global Drivers.xlsx")
    
    db: Session = SessionLocal()
    
    try:
        # Clear existing drivers (optional - doing this to ensure clean seed since it's a new system)
        print("Clearing existing drivers...")
        db.query(Driver).delete()
        db.commit()
        
        inserted_count = 0
        
        for index, row in df.iterrows():
            # Generate ID: CGI-D0001
            driver_id = f"CGI-D{(index + 1):04d}"
            
            # The client shifted address to Date of Joining column
            excel_date_of_joining = row.get("Date of Joining")
            actual_address = clean_string(excel_date_of_joining, default="NA")
            
            # Form 11 and Agreement Signed
            form_11 = clean_enum(row.get("Form 11 (Yes/No)"), ["Yes", "No"], default="No")
            agreement_signed = clean_enum(row.get("Agreement Signed (Yes/No)"), ["Yes", "No"], default="No")
            
            # Dates
            dob = clean_date(row.get("Date of Birth"))
            lic_exp = clean_date(row.get("License Expiry Date"))
            
            driver = Driver(
                driver_id=driver_id,
                name=clean_string(row.get("Name"), default="Unknown"),
                aadhaar_number=clean_string(row.get("Aadhaar Number")),
                date_of_birth=dob,
                date_of_joining=None, # Since the Excel column was swapped with address, we don't have this.
                email=clean_string(row.get("Email")),
                contact_number=clean_string(row.get("Contact Number")),
                address=actual_address,
                license_number=clean_string(row.get("License Number")),
                license_expiry_date=lic_exp,
                form_11=form_11,
                esi_number=clean_string(row.get("ESI Number")),
                pan_number=clean_string(row.get("PAN Number")),
                agreement_signed=agreement_signed,
                bank_name=clean_string(row.get("Bank Name")),
                bank_branch_name=clean_string(row.get("Bank Branch Name")),
                account_number=clean_string(row.get("Account Number")),
                ifsc_code=clean_string(row.get("IFSC Code")),
                username=clean_string(row.get("Username"), default=None) if not pd.isna(row.get("Username")) else None,
                password_hash=clean_string(row.get("Password"), default=None) if not pd.isna(row.get("Password")) else None,
            )
            
            # if email is "NA", convert to None to prevent unique constraint failures
            if driver.email == "NA":
                driver.email = None
                
            # if username is "NA", convert to None to prevent unique constraint failures
            if driver.username == "NA":
                driver.username = None
                
            if driver.password_hash == "NA":
                driver.password_hash = None
                
            db.add(driver)
            inserted_count += 1
            
        db.commit()
        print(f"Successfully inserted {inserted_count} drivers!")
        
    except Exception as e:
        db.rollback()
        print("An error occurred:")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed_drivers()
