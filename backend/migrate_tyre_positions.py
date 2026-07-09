"""
Migration: Fix truncated tyre_fitment_records.position column.

What this script does:
  1. Widens the position column from VARCHAR(20) to VARCHAR(60) in the DB
  2. Deletes all 655 corrupted fitment records (positions were silently truncated)
  3. Re-imports all fitment records from the Excel file with full position names

Run with:
    python3 migrate_tyre_positions.py

IMPORTANT: The Excel file '../Tyre Management CGI.xlsx' must be present relative
to the backend directory before running.
"""

import os
import sys
import pandas as pd
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import SessionLocal, engine
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
    if not val_str or val_str.lower() == "nan":
        return None
    try:
        return datetime.strptime(val_str, "%d-%m-%Y").date()
    except Exception:
        return None


def main():
    excel_path = "../Tyre Management CGI.xlsx"
    if not os.path.exists(excel_path):
        print(f"ERROR: Excel file not found at {excel_path}")
        print("Please place 'Tyre Management CGI.xlsx' one directory above the backend folder.")
        sys.exit(1)

    # ── Step 1: Widen the column ──────────────────────────────────────────────
    print("Step 1: Widening position column to VARCHAR(60)...")
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE tyre_fitment_records MODIFY position VARCHAR(60) NOT NULL"
        ))
        conn.commit()
    print("  Column widened successfully.")

    db = SessionLocal()

    # ── Step 2: Delete all corrupted records ──────────────────────────────────
    existing_count = db.query(TyreFitmentRecord).count()
    print(f"\nStep 2: Deleting {existing_count} corrupted fitment records...")
    db.query(TyreFitmentRecord).delete()
    db.commit()
    print("  All corrupted records deleted.")

    # ── Step 3: Re-import from Excel ──────────────────────────────────────────
    print(f"\nStep 3: Re-importing from {excel_path}...")
    try:
        df = pd.read_excel(excel_path, engine="calamine")
    except Exception as e:
        print(f"ERROR reading Excel file: {e}")
        db.close()
        sys.exit(1)

    success_count = 0
    skip_count = 0
    error_count = 0

    for index, row in df.iterrows():
        try:
            tyre_no = str(row.get("Tyre Number (Required)", "")).strip()
            if not tyre_no or tyre_no.lower() == "nan":
                continue

            truck_reg = str(row.get("Truck ID / Registration Number (Required)", "")).strip()
            if not truck_reg or truck_reg.lower() == "nan":
                print(f"  Row {index + 2}: Missing truck registration for tyre {tyre_no}")
                error_count += 1
                continue

            raw_position = str(row.get("Position (Select from Valid Positions)", "")).strip()
            mapped_position = POSITION_MAPPING.get(raw_position)
            if not mapped_position:
                print(f"  Row {index + 2}: Unknown position '{raw_position}' for tyre {tyre_no}")
                error_count += 1
                continue

            fitted_date = parse_date(row.get("Fitted Date (DD-MM-YYYY)"))
            removed_date = parse_date(row.get("Removed Date (DD-MM-YYYY) (Leave blank if currently fitted)"))

            fitted_odo_val = row.get("Fitted Odometer (km)", 0)
            removed_odo_val = row.get("Removed Odometer (km) (Leave blank if currently fitted)", None)

            try:
                fitted_odo = int(fitted_odo_val) if not pd.isna(fitted_odo_val) else 0
            except Exception:
                fitted_odo = 0

            removed_odo = None
            if removed_odo_val is not None and not pd.isna(removed_odo_val) and str(removed_odo_val).lower() != "nan":
                try:
                    removed_odo = int(removed_odo_val)
                except Exception:
                    pass

            tyre = db.query(TyreInventory).filter(TyreInventory.tyre_number == tyre_no).first()
            if not tyre:
                print(f"  Row {index + 2}: Tyre '{tyre_no}' not found in inventory — skipping")
                error_count += 1
                continue

            truck = db.query(Truck).filter(Truck.registration_number == truck_reg).first()
            if not truck:
                print(f"  Row {index + 2}: Truck '{truck_reg}' not found — skipping")
                error_count += 1
                continue

            record = TyreFitmentRecord(
                tyre_id=tyre.id,
                truck_id=truck.id,
                position=mapped_position,
                fitted_odometer=fitted_odo,
                fitted_date=fitted_date or datetime.now().date(),
                removed_odometer=removed_odo,
                removed_date=removed_date,
            )
            db.add(record)
            db.commit()
            success_count += 1

        except Exception as e:
            db.rollback()
            print(f"  Row {index + 2}: Error — {e}")
            error_count += 1

    db.close()

    print(f"\n{'='*50}")
    print(f"Migration complete.")
    print(f"  Imported:  {success_count}")
    print(f"  Skipped:   {skip_count}")
    print(f"  Errors:    {error_count}")
    print(f"{'='*50}")

    if error_count > 0:
        print("\nSome rows had errors. Check output above for details.")
    else:
        print("\nAll records imported successfully. Tyre positions are now correct.")


if __name__ == "__main__":
    main()
