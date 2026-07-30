# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

import pandas as pd
import math
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Customer, CustomerDestination, CustomerPricing

def clean_str(val):
    if pd.isna(val) or val is None:
        return None
    s = str(val).strip()
    return s if s else None

def map_customer_type(val):
    s = clean_str(val)
    if not s: return None
    s = s.upper()
    if s == "SHIPPING": return "Shipping"
    if s == "TRANSPORTS": return "Transports"
    return "Shipping" # Default if not recognized

def map_yes_no(val, is_gta=False):
    s = clean_str(val)
    if not s: return "No"
    s = s.upper()
    if is_gta:
        if s == "GTA" or s == "YES": return "Yes"
        return "No"
    if s == "YES": return "Yes"
    return "No"

def map_container_type(val):
    s = clean_str(val)
    if not s: return None
    s = s.upper()
    if s == "20 FT" or s == "20 FEET": return "20 FEET"
    if s == "40 FT" or s == "40 FEET": return "40 FEET"
    if s == "2 X 20 FT" or s == "2 X 20 FEET": return "2 X 20 FEET"
    if s == "OPEN LOAD": return "OPEN LOAD"
    return s # Fallback

def map_weight(val):
    s = clean_str(val)
    if not s: return None
    s = s.upper().strip()
    if s == "NORMAL": return "NORMAL"
    if s == "UPTO 20": return "Up to 20 Tons"
    if s == "20 - 25": return "Between 20 - 25 Tons"
    if s == "25 - 28": return "Between 25-28 Tons"
    if s == "28 - 30": return "Between 28-30 Tons"
    return None

def map_status(val):
    s = clean_str(val)
    if not s: return "ACTIVE"
    s = s.upper()
    if s == "INACTIVE": return "INACTIVE"
    if s == "BLACKLISTED": return "BLACKLISTED"
    return "ACTIVE"

def seed_customers():
    db: Session = SessionLocal()
    
    print("Reading Excel files...")
    df_cust = pd.read_excel("../data/Customer List.xlsx")
    df_dest = pd.read_excel("../data/Customer Destination.xlsx")
    df_price = pd.read_excel("../data/Customer Pricing.xlsx")
    
    # 1. Build Destination lookup: name.upper() -> { state, status }
    dest_meta = {}
    for _, row in df_dest.iterrows():
        dest_name = clean_str(row.get('Destination Nam'))
        dest_state = clean_str(row.get('Destination State'))
        dest_status = map_status(row.get('Destination Status'))
        if dest_name:
            dest_meta[dest_name.upper()] = {"state": dest_state, "status": dest_status}

    # 2. Insert Customers
    print("Seeding Customers...")
    customer_name_map = {} # Map uppercase name -> Customer ID
    
    for _, row in df_cust.iterrows():
        name = clean_str(row.get('Customer Name*'))
        if not name:
            continue
            
        gstin = clean_str(row.get('GSTIN'))
        contact = clean_str(row.get('Contact Personnel Name'))
        phone = clean_str(row.get('Phone'))
        email = clean_str(row.get('Email'))
        cust_type = map_customer_type(row.get('Customer Type'))
        address = clean_str(row.get('Address'))
        is_gta = map_yes_no(row.get('Is GTA (Goods Transport Agent)?*'), is_gta=True)
        e_invoice = map_yes_no(row.get('Applicable for E-Invoice?'))
        
        # Check if exists
        cust = db.query(Customer).filter(Customer.name == name).first()
        if not cust and gstin:
            cust = db.query(Customer).filter(Customer.gstin == gstin).first()
            
        if cust:
            # Update existing
            cust.contact_personnel_name = contact or cust.contact_personnel_name
            cust.phone = phone or cust.phone
            cust.email = email or cust.email
            cust.customer_type = cust_type or cust.customer_type
            cust.address = address or cust.address
            cust.is_gta = is_gta
            cust.applicable_for_e_invoice = e_invoice
        else:
            cust = Customer(
                name=name,
                gstin=gstin,
                contact_personnel_name=contact,
                phone=phone,
                email=email,
                address=address,
                customer_type=cust_type,
                is_gta=is_gta,
                applicable_for_e_invoice=e_invoice
            )
            db.add(cust)
            db.commit()
            db.refresh(cust)
            
        customer_name_map[name.upper()] = cust.id
        
    db.commit()
    print(f"Loaded {len(customer_name_map)} customers.")

    # 3. Process Pricing and dynamically insert Destinations
    print("Seeding Pricing and Destinations...")
    
    destinations_inserted = set() # (customer_id, destination_name.upper())
    
    # Pre-fill destinations_inserted from DB
    existing_dests = db.query(CustomerDestination).all()
    for d in existing_dests:
        if d.destination_name:
            destinations_inserted.add((d.customer_id, d.destination_name.upper()))
            
    for _, row in df_price.iterrows():
        raw_cust_name = clean_str(row.get('Customer Name'))
        raw_dest = clean_str(row.get('Customer Destination'))
        
        if not raw_cust_name or not raw_dest:
            continue
            
        cust_id = customer_name_map.get(raw_cust_name.upper())
        if not cust_id:
            print(f"Warning: Customer '{raw_cust_name}' not found for pricing. Skipping.")
            continue
            
        dest_upper = raw_dest.upper()
        
        # Insert Destination if it doesn't exist for this customer
        if (cust_id, dest_upper) not in destinations_inserted:
            meta = dest_meta.get(dest_upper, {})
            new_dest = CustomerDestination(
                customer_id=cust_id,
                destination_name=raw_dest,
                destination_state=meta.get("state"),
                status=meta.get("status", "ACTIVE"),
            )
            db.add(new_dest)
            destinations_inserted.add((cust_id, dest_upper))
            db.commit() # commit immediately to satisfy foreign keys for pricing if needed (though not strictly FK to dest)
            
        # Insert Pricing
        load_type = clean_str(row.get('Load Type'))
        container_type = map_container_type(row.get('Container Type'))
        weight = map_weight(row.get('Weight (In tons)'))
        rate_val = row.get('Rate (Hire Amount)')
        rate = float(rate_val) if pd.notna(rate_val) else None
        pricing_status = map_status(row.get('Status'))

        # Check if pricing exists to prevent duplicates
        existing_price = db.query(CustomerPricing).filter(
            CustomerPricing.customer_id == cust_id,
            CustomerPricing.customer_destination == raw_dest,
            CustomerPricing.cargo_classification == load_type,
            CustomerPricing.container_type == container_type,
            CustomerPricing.weight_in_tons == weight
        ).first()

        if not existing_price:
            price = CustomerPricing(
                customer_id=cust_id,
                customer_destination=raw_dest,
                cargo_classification=load_type,
                container_type=container_type,
                weight_in_tons=weight,
                rate=rate,
                status=pricing_status,
            )
            db.add(price)
            
    db.commit()
    print("Pricing and Destinations seeded successfully!")

if __name__ == "__main__":
    try:
        seed_customers()
    except Exception as e:
        print(f"An error occurred: {e}")
