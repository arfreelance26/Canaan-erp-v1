"""
Fix truck tyre_layout values in the DB.

All trucks currently set to '10+1', '12+1', or '14+1' are actually
tractor-trailer trucks — their fitment records have 'Tractor Head' and
'Trailer' position prefixes which only the tractor-trailer layout types generate.

Mapping applied:
  10+1  → 10+1-tractor-trailer
  12+1  → 14+1-tractor-trailer  (these trucks have up to 14 tyre positions)
  14+1  → 14+1-tractor-trailer
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import Truck

LAYOUT_MAP = {
    "10+1": "10+1-tractor-trailer",
    "12+1": "14+1-tractor-trailer",
    "14+1": "14+1-tractor-trailer",
}

db = SessionLocal()
total = 0

for old_layout, new_layout in LAYOUT_MAP.items():
    trucks = db.query(Truck).filter(Truck.tyre_layout == old_layout).all()
    for t in trucks:
        print(f"  {t.truck_id} ({t.registration_number}): {old_layout} → {new_layout}")
        t.tyre_layout = new_layout
        total += 1

db.commit()
db.close()
print(f"\nDone. Updated {total} truck(s).")
