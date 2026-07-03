import re
import pandas as pd
from database import SessionLocal
import models
import datetime

def parse_fuel_capacity(val):
    """Fuel Capacity is sometimes a single number, sometimes a range like '300 to 365'.
    For ranges, use the highest number."""
    if pd.isnull(val):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    numbers = re.findall(r"\d+(?:\.\d+)?", str(val))
    return max((float(n) for n in numbers), default=0.0)

def main():
    db = SessionLocal()
    df = pd.read_excel("../CGI Fleet Data.xlsx")
    
    # Clean NaN values
    df = df.where(pd.notnull(df), None)
    
    # Get current max truck_id to determine next ID
    # Query all truck_ids starting with "CGI-T"
    existing_trucks = db.query(models.Truck.truck_id).filter(models.Truck.truck_id.like("CGI-T%")).all()
    
    max_id = 0
    for (tid,) in existing_trucks:
        try:
            # Parse number from "CGI-T0001"
            num = int(tid.replace("CGI-T", ""))
            if num > max_id:
                max_id = num
        except ValueError:
            pass
            
    next_id_num = max_id + 1
    
    count = 0
    
    for idx, row in df.iterrows():
        # Auto-generate truck_id
        truck_id = f"CGI-T{next_id_num:04d}"
        
        reg_number = str(row['Registration Number']).strip() if row['Registration Number'] else "NA"
        
        # Check if truck already exists
        if db.query(models.Truck).filter(models.Truck.registration_number == reg_number).first():
            print(f"Truck with registration {reg_number} already exists, skipping.")
            continue
            
        manufacturer = str(row['Manufacturer']).strip() if row['Manufacturer'] else "NA"
        model_name = str(row['Model Name']).strip() if row['Model Name'] else "NA"
        
        # Enforce ENUM values
        truck_type_val = str(row['Truck Type (20 FT RIGID / 20 FT ARTICULATED / 40 FT RIGID / 40 FT ARTICULATED)']).strip()
        valid_truck_types = ["20 FT RIGID", "20 FT ARTICULATED", "40 FT RIGID", "40 FT ARTICULATED"]
        if truck_type_val not in valid_truck_types:
            truck_type_val = "20 FT RIGID"
            
        tyre_layout = str(row['Tyre Layout (e.g. 6+1, 10+1)']).strip() if row['Tyre Layout (e.g. 6+1, 10+1)'] else "NA"
        branch = str(row['Branch Assigned To']).strip() if row['Branch Assigned To'] else "NA"
        chassis = str(row['Chassis Number']).strip() if row['Chassis Number'] else "NA"
        year = str(row['Year of Manufacture']).strip() if row['Year of Manufacture'] else "NA"
        if len(year) > 4 and year.endswith(".0"):
            year = year[:-2]
            
        def get_float(val):
            return float(val) if pd.notnull(val) else 0.0
            
        def get_date(val):
            return pd.to_datetime(val, dayfirst=True).date() if pd.notnull(val) else None
            
        def get_str(val):
            return str(val).strip() if pd.notnull(val) else None
            
        record = models.Truck(
            truck_id=truck_id,
            branch_registered_to=branch,
            registration_number=reg_number,
            manufacturer=manufacturer,
            model_name=model_name,
            truck_type=truck_type_val,
            chassis_number=chassis,
            year_of_manufacture=year,
            tyre_layout=tyre_layout,
            fuel_capacity=parse_fuel_capacity(row['Fuel Capacity']),
            odometer_during_purchase=get_float(row['Odometer During Purchase']),
            odometer=get_float(row['Current Odometer']),
            rc_date=get_date(row['RC Date (YYYY-MM-DD)']),
            rc_validity_date=get_date(row['RC Validity Date (YYYY-MM-DD)']),
            rc_expenses=get_float(row['RC Expenses']),
            fc_date=get_date(row['FC Date (YYYY-MM-DD)']),
            fc_expiry_date=get_date(row['FC Expiry Date (YYYY-MM-DD)']),
            fc_expenses=get_float(row['FC Expenses']),
            road_tax_date=get_date(row['Road Tax Date (YYYY-MM-DD)']),
            road_tax_number=get_str(row['Road Tax Number']),
            road_tax_expenses=get_float(row['Road Tax Expenses']),
            insurance_expiry_date=get_date(row['Insurance Expiry Date (YYYY-MM-DD)']),
            insurance_expenses=get_float(row['Insurance Expenses']),
            national_permit_number=get_str(row['National Permit Number']),
            national_permit_date=get_date(row['National Permit Date (YYYY-MM-DD)']),
            national_permit_expenses=get_float(row['National Permit Expenses']),
            local_permit_number=get_str(row['Local Permit Number']),
            local_permit_date=get_date(row['Local Permit Date (YYYY-MM-DD)']),
            local_permit_expenses=get_float(row['Local Permit Expenses']),
            pollution_certificate_number=get_str(row['Pollution Certificate Number']),
            pollution_certificate_date=get_date(row['Pollution Certificate Date (YYYY-MM-DD)']),
            pollution_certificate_expenses=get_float(row['Pollution Certificate Expenses']),
        )
        
        db.add(record)
        count += 1
        next_id_num += 1
        
    db.commit()
    db.close()
    print(f"Successfully seeded {count} Truck records.")

if __name__ == "__main__":
    main()
