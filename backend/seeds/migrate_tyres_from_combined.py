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


# Canonical tyre-type values used by the frontend (TYRE_TYPE_OPTIONS).
CANON_TYPES = {"RADIAL", "TUBELESS", "NYLON", "RETREADED"}


def norm_tyre_type(val: str) -> str:
    """Preserve the source tyre type, normalised to the frontend's uppercase canon.
    e.g. 'Radial'->'RADIAL', 'Nylon'->'NYLON', 'Tubeless'->'TUBELESS', 'RETREADED'->'RETREADED'.
    Blank falls back to 'RADIAL'."""
    s = str(val).strip().upper()
    return s if s else "RADIAL"


def type_to_condition(val: str) -> str:
    return "Rethreaded" if str(val).strip().upper() == "RETREADED" else "New"


def type_to_retread_count(val: str) -> int:
    return 1 if str(val).strip().upper() == "RETREADED" else 0


def resolve_columns(df) -> dict:
    """Map logical fields → actual column names, supporting both the original
    combined_updated schema and the newer combined.xlsx schema.

      logical      original            newer (combined.xlsx)
      -----------  ------------------  ---------------------
      tyre_no      Tyre No             Tyre No
      brand        Brand               Brand
      size         Size                Size
      tyre_type    Ply Rating          TYRE TYPE
      range_km     Used Range          (absent → range 0, cost_per_km NULL)
      cost         Cost                TYRE COST
      pdate        Purchase Date       Purchase Date
      truck        Truck               Truck
      position     Tyre Position       Tyre Position
    """
    cols = set(df.columns)

    def pick(*names, required=True):
        for n in names:
            if n in cols:
                return n
        if required:
            raise SystemExit(
                f"[ABORT] none of the expected columns {names} present. "
                f"Available: {sorted(cols)}"
            )
        return None

    return {
        "tyre_no":   pick("Tyre No"),
        "brand":     pick("Brand"),
        "size":      pick("Size"),
        "tyre_type": pick("Ply Rating", "TYRE TYPE"),
        "range_km":  pick("Used Range", required=False),
        "cost":      pick("Cost", "TYRE COST"),
        "pdate":     pick("Purchase Date"),
        "truck":     pick("Truck"),
        "position":  pick("Tyre Position"),
    }


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

    C = resolve_columns(df)
    print(f"Resolved columns: {C}")
    if C["range_km"] is None:
        print("NOTE: no 'Used Range' column — range_km=0 and cost_per_km=NULL for all rows.")

    db = SessionLocal()

    # ------------------------------------------------------------------ #
    # 0. Build truck lookup  registration_number → id
    # ------------------------------------------------------------------ #
    trucks = db.query(Truck).all()
    truck_map = {t.registration_number: t.id for t in trucks}
    print(f"Trucks in DB: {len(truck_map)}")

    # Validate all trucks in Excel exist in DB before touching anything
    missing_trucks = set(df[C["truck"]].astype(str).str.strip()) - set(truck_map.keys())
    if missing_trucks:
        print(f"\n[ABORT] Trucks in Excel not found in DB: {missing_trucks}")
        print("Add these trucks to the DB first, then re-run.")
        db.close()
        sys.exit(1)

    # ------------------------------------------------------------------ #
    # 0b. Snapshot existing range_km by tyre_number BEFORE wiping.
    #     When the source file has no range column, we carry range_km
    #     forward for any tyre that reappears (matched by tyre_number)
    #     and recompute cost_per_km from the NEW cost. New tyres not in
    #     the DB keep range_km=0 / cost_per_km=NULL.
    # ------------------------------------------------------------------ #
    existing_range = {
        tn: int(rk)
        for tn, rk in db.query(TyreInventory.tyre_number, TyreInventory.range_km).all()
        if rk and int(rk) > 0
    }
    print(f"Carry-forward pool: {len(existing_range)} existing tyres with range_km>0")
    carried = 0

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
        tyre_no   = str(row.get(C["tyre_no"], "")).strip()
        truck_reg = str(row.get(C["truck"], "")).strip()
        position  = str(row.get(C["position"], "")).strip()
        ply       = str(row.get(C["tyre_type"], "")).strip()

        try:
            range_km      = parse_range_km(row.get(C["range_km"], 0)) if C["range_km"] else 0
            # Carry range forward from the pre-wipe snapshot when the file lacks it.
            if range_km == 0 and tyre_no in existing_range:
                range_km = existing_range[tyre_no]
                carried += 1
            cost          = float(row.get(C["cost"], 0) or 0)
            purchase_date = parse_purchase_date(row.get(C["pdate"]))
            brand         = str(row.get(C["brand"], "")).strip() or "Unknown"
            size          = str(row.get(C["size"], "")).strip()
            tyre_type     = norm_tyre_type(ply)
            condition     = type_to_condition(ply)
            retread_count = type_to_retread_count(ply)
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
    print(f"  Range carried forward (matched tyre_number): {carried}")
    print(f"  Errors  : {len(errors)}")
    if errors:
        print("\nError details:")
        for idx, tyre_no, msg in errors:
            print(f"  row {idx} / {tyre_no}: {msg}")
    else:
        print("  All rows imported successfully — no errors.")


if __name__ == "__main__":
    main()
