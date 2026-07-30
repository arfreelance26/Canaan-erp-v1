# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

import os
import sys
import pandas as pd
from datetime import datetime

# Add the backend directory to sys.path so we can import from backend modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import TyreInventory, Truck, TyreFitmentRecord

POSITION_MAPPING = {
    "1-AXLE-L-OUT": "Tractor Head - Axle 1 - Left",
    "1-AXLE-R-OUT": "Tractor Head - Axle 1 - Right",
    "2-AXLE-L-OUT": "Tractor Head - Axle 2 - Left 1",
    "2-AXLE-L-IN":  "Tractor Head - Axle 2 - Left 2",
    "2-AXLE-R-OUT": "Tractor Head - Axle 2 - Right 1",
    "2-AXLE-R-IN":  "Tractor Head - Axle 2 - Right 2",
    "3-AXLE-L-OUT": "Trailer - Axle 1 - Left 1",
    "3-AXLE-L-IN":  "Trailer - Axle 1 - Left 2",
    "3-AXLE-R-OUT": "Trailer - Axle 1 - Right 1",
    "3-AXLE-R-IN":  "Trailer - Axle 1 - Right 2",
    "4-AXLE-L-OUT": "Trailer - Axle 2 - Left 1",
    "4-AXLE-L-IN":  "Trailer - Axle 2 - Left 2",
    "4-AXLE-R-OUT": "Trailer - Axle 2 - Right 1",
    "4-AXLE-R-IN":  "Trailer - Axle 2 - Right 2",
    "5-AXLE-L-OUT": "Trailer - Axle 3 - Left 1",
    "5-AXLE-L-IN":  "Trailer - Axle 3 - Left 2",
    "5-AXLE-R-OUT": "Trailer - Axle 3 - Right 1",
    "5-AXLE-R-IN":  "Trailer - Axle 3 - Right 2",
    "SPARE":        "Spare",
}

def parse_date(date_val):
    if pd.isna(date_val):
        return None
    if isinstance(date_val, datetime):
        return date_val.date()
    val_str = str(date_val).strip()
    if not val_str or val_str.lower() == 'nan':
        return None
    try:
        return datetime.strptime(val_str, "%d-%m-%Y").date()
    except Exception as e:
        return None

def main():
    file_path = '../data/Tyre Management CGI.xlsx'
    print(f"Reading {file_path}...")
    try:
        df = pd.read_excel(file_path, engine='calamine')
    except Exception as e:
        print(f"Failed to read excel file: {e}")
        return

    db = SessionLocal()
    success_count = 0
    skip_count = 0
    error_count = 0

    for index, row in df.iterrows():
        try:
            tyre_no = str(row.get('Tyre Number (Required)', '')).strip()
            if not tyre_no or tyre_no.lower() == 'nan':
                continue

            truck_reg = str(row.get('Truck ID / Registration Number (Required)', '')).strip()
            if not truck_reg or truck_reg.lower() == 'nan':
                print(f"Row {index + 2}: Missing truck registration for tyre {tyre_no}")
                error_count += 1
                continue

            raw_position = str(row.get('Position (Select from Valid Positions)', '')).strip()
            mapped_position = POSITION_MAPPING.get(raw_position)

            if not mapped_position:
                print(f"Row {index + 2}: Unknown position '{raw_position}' for tyre {tyre_no}")
                error_count += 1
                continue

            fitted_date = parse_date(row.get('Fitted Date (DD-MM-YYYY)'))
            removed_date = parse_date(row.get('Removed Date (DD-MM-YYYY) (Leave blank if currently fitted)'))

            fitted_odo_val = row.get('Fitted Odometer (km)', 0)
            removed_odo_val = row.get('Removed Odometer (km) (Leave blank if currently fitted)', None)
            
            try:
                fitted_odo = int(fitted_odo_val) if not pd.isna(fitted_odo_val) else 0
            except:
                fitted_odo = 0

            removed_odo = None
            if not pd.isna(removed_odo_val) and str(removed_odo_val).lower() != 'nan':
                try:
                    removed_odo = int(removed_odo_val)
                except:
                    pass

            # Lookup Tyre
            tyre = db.query(TyreInventory).filter(TyreInventory.tyre_number == tyre_no).first()
            if not tyre:
                print(f"Row {index + 2}: Tyre '{tyre_no}' not found in inventory")
                error_count += 1
                continue

            # Lookup Truck
            truck = db.query(Truck).filter(Truck.registration_number == truck_reg).first()
            if not truck:
                print(f"Row {index + 2}: Truck '{truck_reg}' not found")
                error_count += 1
                continue

            # Check if record already exists
            existing = db.query(TyreFitmentRecord).filter(
                TyreFitmentRecord.tyre_id == tyre.id,
                TyreFitmentRecord.truck_id == truck.id,
                TyreFitmentRecord.position == mapped_position,
                TyreFitmentRecord.fitted_date == (fitted_date or datetime.now().date())
            ).first()

            if existing:
                print(f"Row {index + 2}: Fitment record for tyre {tyre_no} on truck {truck_reg} at {mapped_position} already exists. Skipping.")
                skip_count += 1
                continue

            record = TyreFitmentRecord(
                tyre_id=tyre.id,
                truck_id=truck.id,
                position=mapped_position,
                fitted_odometer=fitted_odo,
                fitted_date=fitted_date or datetime.now().date(),
                removed_odometer=removed_odo,
                removed_date=removed_date
            )
            db.add(record)
            db.commit()
            success_count += 1
            print(f"Successfully fit tyre {tyre_no} to {truck_reg} at {mapped_position}")

        except Exception as e:
            db.rollback()
            print(f"Row {index + 2}: Error - {e}")
            error_count += 1

    db.close()
    print(f"\nImport Summary:")
    print(f"Successfully Imported: {success_count}")
    print(f"Skipped (Already Exists): {skip_count}")
    print(f"Errors: {error_count}")

if __name__ == "__main__":
    main()
