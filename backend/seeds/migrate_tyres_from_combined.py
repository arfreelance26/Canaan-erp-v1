# --- path bootstrap ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# ----------------------

"""
Full tyre migration from combined_updated.xlsx
------------------------------------------------
1. Wipes all TyreFitmentRecord rows (CASCADE also removes them when inventory
   is deleted, but we do it explicitly for clarity).
2. Wipes all TyreInventory rows.
3. Re-imports every row as:
     - TyreInventory  (brand, tyre_type, tyre_number, size, range_km,
                       cost, cost_per_km, purchase_date, condition,
                       retread_count, retread_cost, version=1)
     - TyreFitmentRecord (tyre_id, truck_id, position, fitted_odometer=0,
                          fitted_date=purchase_date)

Column mapping from Excel → DB
  Tyre No       → tyre_number
  Brand         → brand
  Size          → size
  Ply Rating    → tyre_type  (RADIAL → "RADIAL", RETREADED → "RETREADED")
                → condition  (RADIAL → "New",    RETREADED → "Rethreaded")
                → retread_count (RADIAL → 0, RETREADED → 1)
  Used Range    → range_km   (numeric part, e.g. "64660 (2214-11-09)" → 64660)
  Cost          → cost       (0 is valid — means no purchase price recorded)
  Purchase Date → purchase_date  (DD-MM-YYYY)
  Truck         → truck_id   (lookup by Truck.registration_number)
  Tyre Position → position   (stored as-is, e.g. "5-AXLE-L-OUT", "SPARE")

cost_per_km is computed as cost / range_km when both > 0, else NULL.
fitted_date  is set to purchase_date.
fitted_odometer is set to 0 (not available in source data).

Usage:
    python seeds/migrate_tyres_from_combined.py [path/to/combined_updated.xlsx]

Default path resolves to  ../combined_updated.xlsx  relative to this file.
"""

import re
import sys
import argparse
from datetime import datetime
from decimal import Decimal

import pandas as pd
from sqlalchemy import text

from database import SessionLocal
from models import Truck, TyreInventory, TyreFitmentRecord


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def parse_range_km(val) -> int:
    """Extract the leading integer from values like '115000' or '64660 (2214-11-09)'."""
    s = str(val).strip()
    m = re.match(r'^(\d+)', s)
    return int(m.group(1)) if m else 0


def parse_purchase_date(val):
    if pd.isna(val):
        return None
    s = str(val).strip()
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def ply_to_tyre_type(ply: str) -> str:
    return "RETREADED" if str(ply).strip().upper() == "RETREADED" else "RADIAL"


def ply_to_condition(ply: str) -> str:
    return "Rethreaded" if str(ply).strip().upper() == "RETREADED" else "New"


def ply_to_retread_count(ply: str) -> int:
    return 1 if str(ply).strip().upper() == "RETREADED" else 0


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "xlsx",
        nargs="?",
        default=_os.path.join(_os.path.dirname(_BACKEND), "combined_updated.xlsx"),
        help="Path to combined_updated.xlsx",
    )
    args = parser.parse_args()

    print(f"Reading: {args.xlsx}")
    df = pd.read_excel(args.xlsx, engine="calamine")
    print(f"Rows loaded: {len(df)}")

    db = SessionLocal()

    # ------------------------------------------------------------------ #
    # 0. Build truck lookup  registration_number → id
    # ------------------------------------------------------------------ #
    trucks = db.query(Truck).all()
    truck_map = {t.registration_number: t.id for t in trucks}
    print(f"Trucks in DB: {len(truck_map)}")

    # Validate all trucks in Excel exist in DB before touching anything
    missing_trucks = set(df["Truck"].astype(str).str.strip()) - set(truck_map.keys())
    if missing_trucks:
        print(f"\n[ABORT] Trucks in Excel not found in DB: {missing_trucks}")
        print("Add these trucks to the DB first, then re-run.")
        db.close()
        sys.exit(1)

    # ------------------------------------------------------------------ #
    # 1. Wipe existing data  (fitments first due to FK, then inventory)
    # ------------------------------------------------------------------ #
    print("\nWiping TyreFitmentRecord …", end=" ")
    deleted_fit = db.query(TyreFitmentRecord).delete()
    print(f"{deleted_fit} rows deleted")

    print("Wiping TyreInventory …", end=" ")
    deleted_inv = db.query(TyreInventory).delete()
    print(f"{deleted_inv} rows deleted")

    db.execute(text("ALTER TABLE tyre_inventory AUTO_INCREMENT = 1"))
    db.execute(text("ALTER TABLE tyre_fitment_records AUTO_INCREMENT = 1"))
    db.commit()
    print("Auto-increment counters reset to 1")

    # ------------------------------------------------------------------ #
    # 2. Import rows
    # ------------------------------------------------------------------ #
    ok = 0
    errors = []

    for idx, row in df.iterrows():
        tyre_no   = str(row.get("Tyre No", "")).strip()
        truck_reg = str(row.get("Truck", "")).strip()
        position  = str(row.get("Tyre Position", "")).strip()
        ply       = str(row.get("Ply Rating", "")).strip()

        try:
            range_km      = parse_range_km(row.get("Used Range", 0))
            cost          = float(row.get("Cost", 0) or 0)
            purchase_date = parse_purchase_date(row.get("Purchase Date"))
            brand         = str(row.get("Brand", "")).strip() or "Unknown"
            size          = str(row.get("Size", "")).strip()
            tyre_type     = ply_to_tyre_type(ply)
            condition     = ply_to_condition(ply)
            retread_count = ply_to_retread_count(ply)
            cost_per_km   = (
                round(cost / range_km, 6) if cost > 0 and range_km > 0 else None
            )

            inv = TyreInventory(
                tyre_number=tyre_no,
                brand=brand,
                tyre_type=tyre_type,
                size=size,
                range_km=range_km,
                cost=Decimal(str(cost)),
                cost_per_km=Decimal(str(cost_per_km)) if cost_per_km else None,
                purchase_date=purchase_date,
                condition=condition,
                retread_count=retread_count,
                retread_cost=Decimal("0"),
                version=1,
            )
            db.add(inv)
            db.flush()  # assigns inv.id

            truck_id = truck_map[truck_reg]
            fitted_date = purchase_date  # best available date
            if fitted_date is None:
                fitted_date = datetime(2025, 1, 1).date()  # fallback

            fit = TyreFitmentRecord(
                tyre_id=inv.id,
                truck_id=truck_id,
                position=position,
                fitted_odometer=0,
                fitted_date=fitted_date,
            )
            db.add(fit)
            ok += 1

            if ok % 100 == 0:
                print(f"  … {ok} rows processed")

        except Exception as exc:
            db.rollback()
            errors.append((idx, tyre_no, str(exc)))
            print(f"  [ERROR] row {idx} tyre={tyre_no}: {exc}")
            # Re-open session after rollback so we can continue
            db = SessionLocal()
            # Rebuild state after rollback — wipe again if needed
            # (we handle errors but expect none in practice)

    db.commit()
    db.close()

    print(f"\n{'='*50}")
    print(f"Migration complete")
    print(f"  Imported: {ok}")
    print(f"  Errors  : {len(errors)}")
    if errors:
        print("\nError details:")
        for idx, tyre_no, msg in errors:
            print(f"  row {idx} / {tyre_no}: {msg}")
    else:
        print("  All rows imported successfully — no errors.")


if __name__ == "__main__":
    main()
