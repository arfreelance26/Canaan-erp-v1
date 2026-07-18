import re

routers_to_patch = {
    "customers.py": {
        "import_func": "check_customer_duplicates, check_customer_destination_duplicates",
        "create_customer": ("payload: schemas.CustomerCreate, db: Session = Depends(get_db)):", "    check_customer_duplicates(db, payload)"),
        "update_customer": ("def update_customer(customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db)):", "    check_customer_duplicates(db, payload, exclude_id=customer_id)"),
        "create_customer_destination": ("payload: schemas.CustomerDestinationCreate, db: Session = Depends(get_db)):", "    check_customer_destination_duplicates(db, payload, customer_id)"),
        "update_customer_destination": ("def update_customer_destination(customer_id: int, dest_id: int, payload: schemas.CustomerDestinationUpdate, db: Session = Depends(get_db)):", "    check_customer_destination_duplicates(db, payload, customer_id, exclude_id=dest_id)"),
    },
    "vendors.py": {
        "import_func": "check_vendor_duplicates",
        "create_vendor": ("payload: schemas.VendorCreate, db: Session = Depends(get_db)):", "    check_vendor_duplicates(db, payload)"),
        "update_vendor": ("def update_vendor(vendor_id: int, payload: schemas.VendorUpdate, db: Session = Depends(get_db)):", "    check_vendor_duplicates(db, payload, exclude_id=vendor_id)"),
    },
    "trucks.py": {
        "import_func": "check_truck_duplicates",
        "create_truck": ("payload: schemas.TruckCreate, db: Session = Depends(get_db)):", "    check_truck_duplicates(db, payload)"),
        "update_truck": ("def update_truck(truck_id: int, payload: schemas.TruckUpdate, db: Session = Depends(get_db)):", "    check_truck_duplicates(db, payload, exclude_id=truck_id)"),
    },
    "drivers.py": {
        "import_func": "check_driver_duplicates",
        "create_driver": ("payload: schemas.DriverCreate, db: Session = Depends(get_db)):", "    check_driver_duplicates(db, payload)"),
        "update_driver": ("def update_driver(driver_id: int, payload: schemas.DriverUpdate, db: Session = Depends(get_db)):", "    check_driver_duplicates(db, payload, exclude_id=driver_id)"),
    },
    "staff.py": {
        "import_func": "check_staff_duplicates",
        "create_staff": ("payload: schemas.StaffCreate, db: Session = Depends(get_db)):", "    check_staff_duplicates(db, payload)"),
        "update_staff": ("def update_staff(staff_id: int, payload: schemas.StaffUpdate, db: Session = Depends(get_db)):", "    check_staff_duplicates(db, payload, exclude_id=staff_id)"),
    },
    "branches.py": {
        "import_func": "check_branch_duplicates",
        "create_branch": ("payload: schemas.BranchCreate, db: Session = Depends(get_db)):", "    check_branch_duplicates(db, payload)"),
        "update_branch": ("def update_branch(branch_id: int, payload: schemas.BranchUpdate, db: Session = Depends(get_db)):", "    check_branch_duplicates(db, payload, exclude_id=branch_id)"),
    },
    "trips.py": {
        "import_func": "check_trip_duplicates",
        "create_trip": ("payload: schemas.TripCreate, db: Session = Depends(get_db)):", "    check_trip_duplicates(db, payload)"),
        "update_trip": ("def update_trip(trip_id: int, payload: schemas.TripUpdate, db: Session = Depends(get_db)):", "    check_trip_duplicates(db, payload, exclude_id=trip_id)"),
    }
}

import os
for router_file, config in routers_to_patch.items():
    filepath = os.path.join("routers", router_file)
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        continue
        
    with open(filepath, "r") as f:
        lines = f.readlines()
        
    new_lines = []
    import_added = False
    
    for i, line in enumerate(lines):
        new_lines.append(line)
        
        # Add import after the first import block
        if not import_added and line.startswith("import models"):
            new_lines.append(f"from duplicate_checks import {config['import_func']}\n")
            import_added = True
            
        for action, val in config.items():
            if action == "import_func":
                continue
            target, injection = val
            if target in line:
                # Add injection in the next line
                new_lines.append(f"{injection}\n")
                
    with open(filepath, "w") as f:
        f.writelines(new_lines)

print("Patching complete!")
