import os
import sys
import pandas as pd
from datetime import datetime
import re

# Add the backend directory to sys.path so we can import from backend modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import TyreInventory

def parse_used_range(val):
    if pd.isna(val):
        return 0
    val = str(val)
    match = re.search(r"\((\d+)\)", val)
    if match:
        return int(match.group(1))
    # If no parenthesis, try to extract first number just in case, or default 0
    match = re.search(r"\d+", val)
    if match:
        return int(match.group(0))
    return 0

def parse_ply_rating(val):
    val = str(val).strip()
    if val == "Original" or pd.isna(val):
        return "New", 0
    elif val == "I-RT":
        return "Rethreaded", 1
    elif val == "II-RT":
        return "Rethreaded", 2
    elif val == "III-RT":
        return "Rethreaded", 3
    elif val == "IV-RT":
        return "Rethreaded", 4
    return "New", 0

def main():
    file_path = '../Tyres List - 07.07.2026.xlsx'
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
            tyre_no = str(row.get('Tyre No', '')).strip()
            if not tyre_no or tyre_no == 'nan':
                continue
                
            # Check if tyre already exists
            existing = db.query(TyreInventory).filter(TyreInventory.tyre_number == tyre_no).first()
            if existing:
                print(f"Skipping {tyre_no}: Already exists in database.")
                skip_count += 1
                continue

            brand = str(row.get('Brand', '')).strip()
            if pd.isna(row.get('Brand')): brand = "Unknown"

            size = str(row.get('Size', '')).strip()
            if pd.isna(row.get('Size')): size = ""

            tyre_type = str(row.get('Type', '')).strip()
            if pd.isna(row.get('Type')): tyre_type = ""

            cost_val = row.get('Cost', 0)
            try:
                cost = float(cost_val)
            except:
                cost = 0.0

            # Parse Purchase Date
            purchase_date_str = str(row.get('Purchase Date', ''))
            purchase_date = None
            if purchase_date_str and purchase_date_str != 'nan':
                try:
                    # Depending on excel parsing, it might come as a datetime object or a string DD-MM-YYYY
                    if isinstance(row.get('Purchase Date'), datetime):
                        purchase_date = row.get('Purchase Date').date()
                    else:
                        purchase_date = datetime.strptime(purchase_date_str.strip(), "%d-%m-%Y").date()
                except Exception as de:
                    print(f"Warning: Could not parse date {purchase_date_str} for tyre {tyre_no}")

            condition, retread_count = parse_ply_rating(row.get('Ply Rating'))
            range_km = parse_used_range(row.get('Used Range'))

            new_tyre = TyreInventory(
                tyre_number=tyre_no,
                brand=brand,
                tyre_type=tyre_type,
                size=size,
                range_km=range_km,
                cost=cost,
                condition=condition,
                purchase_date=purchase_date,
                retread_count=retread_count,
                repair_cost=0,
                retread_cost=0
            )

            db.add(new_tyre)
            db.commit()
            success_count += 1
            print(f"Imported {tyre_no} successfully.")

        except Exception as e:
            db.rollback()
            print(f"Error importing row {index} (Tyre: {tyre_no}): {e}")
            error_count += 1

    db.close()
    print(f"\nImport Summary:")
    print(f"Successfully Imported: {success_count}")
    print(f"Skipped (Already Exists): {skip_count}")
    print(f"Errors: {error_count}")

if __name__ == "__main__":
    main()
