"""One-time production script: adds a specific list of Repair Types under
their respective Maintenance Categories (the "Maintenance Management" admin
page).

Idempotent — safe to run more than once. For each category it only inserts
repair names that are not already present under that category (matched
case-insensitively), so re-running it will not create duplicates or raise
errors.

Category names below are matched case-insensitively against the
`maintenance_categories` table, with a couple of typo-correction aliases for
known differences between this list's wording and the categories already
seeded by add_maintenance_categories.py ("Transmission" -> "TRANSVISION",
"Pneumatic System" -> "NEUMATIC"). If a category genuinely doesn't exist yet
under any spelling, this script creates it too, so the import never fails
for a missing category — but it should normally be run AFTER
add_maintenance_categories.py so categories line up with their canonical
names.

Usage (from the backend/ directory, with the same environment/DB config the
target database uses):
    python scripts/add_maintenance_category_repairs.py --dry-run
    python scripts/add_maintenance_category_repairs.py
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models

# Known wording differences between this list and the canonical category
# names already in the database — matched after lowercasing.
CATEGORY_ALIASES = {
    "transmission": "TRANSVISION",
    "pneumatic system": "NEUMATIC",
}

CATEGORY_REPAIRS: dict[str, list[str]] = {
    "AMC": [],
    "Cabin": [
        "Cabin Lift Jockey",
        "Cabin Front Shock Absorber",
        "Cabin Rear Shock Absorber",
        "First Axle Shock Absorber",
    ],
    "Engine": [
        "Engine Oil Change – Local",
        "Engine Oil – Company Service",
        "Half Engine Work",
        "Full Engine Work",
        "Nozzle Work",
        "Diesel Feed Pump",
    ],
    "Transmission": [
        "Gearbox Work",
        "Propeller Shaft",
        "Oil Service",
        "Clutch Pedal",
        "Clutch Booster",
        "Clutch Work",
    ],
    "Differential": [
        "Crown & Pinion Work",
        "Axle Shaft",
        "Oil Service",
    ],
    "Pneumatic System": [
        "Air Dryer",
        "Air Compressor",
        "Dual Brake Valve",
        "RG2 Valve",
        "Load Sensing Valve",
        "Distributor Valve",
        "Quick Release Valve",
        "Lift Axle Control Valve",
        "Air Hose",
        "Hose Crimping Work",
    ],
    "Suspension Work": [
        "Pin & Bush Work",
        "Leaf Spring Work",
        "Cabin Shock Absorber",
        "Lift Axle Shock Absorber",
    ],
    "Steering Unit": [
        "Power Steering Pump",
        "Steering Box",
        "Steering Column",
        "Oil Service",
    ],
    "Electrical": [
        "New Starter Motor",
        "Starter Motor O/H",
        "New Alternator",
        "Alternator O/H",
        "Wiring Work",
        "Light Fitting Work",
        "Relay",
        "EDC Work",
        "New Electrical Line Installation",
    ],
    "Brake System": [
        "Brake Master Cylinder",
        "Brake Lining",
        "Brake Booster Cylinder",
        "Brake Pedal Cylinder",
    ],
    "Chassis & Axle": [
        "Chassis Bend Checkup",
        "Axle Work",
        "Hub Grease",
    ],
    "Accident Work": [
        "Major",
        "Minor",
    ],
    "Fabrication & Welding Work": [
        "Fabrication Work",
        "Welding Work",
    ],
    "FC Work": [
        "Water Service",
        "Painting Work",
        "RTO Work",
    ],
}


def resolve_category(label: str, existing_by_lower: dict, db, created: list):
    """Returns the MaintenanceCategory row for `label`, creating it (under
    the alias-corrected name if one applies) if it doesn't exist yet under
    any known spelling."""
    key = label.strip().lower()
    if key in existing_by_lower:
        return existing_by_lower[key]
    canonical = CATEGORY_ALIASES.get(key, label.strip())
    canonical_key = canonical.lower()
    if canonical_key in existing_by_lower:
        record = existing_by_lower[canonical_key]
        existing_by_lower[key] = record
        return record
    record = models.MaintenanceCategory(name=canonical)
    db.add(record)
    db.flush()
    existing_by_lower[canonical_key] = record
    existing_by_lower[key] = record
    created.append(canonical)
    return record


def main(dry_run: bool):
    db = SessionLocal()
    added = []
    skipped = []
    categories_created = []
    try:
        categories_by_lower = {
            c.name.strip().lower(): c
            for c in db.query(models.MaintenanceCategory).all()
        }
        existing_repair_keys = {
            (r.category_id, r.name.strip().lower())
            for r in db.query(models.MaintenanceCategoryRepair).all()
        }

        for label, repair_names in CATEGORY_REPAIRS.items():
            category = resolve_category(label, categories_by_lower, db, categories_created)
            for repair_name in repair_names:
                key = (category.id, repair_name.strip().lower())
                if key in existing_repair_keys:
                    skipped.append((category.name, repair_name))
                    continue
                if not dry_run:
                    db.add(models.MaintenanceCategoryRepair(category_id=category.id, name=repair_name.strip()))
                existing_repair_keys.add(key)
                added.append((category.name, repair_name))

        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    if categories_created:
        cverb = "Would create" if dry_run else "Created"
        print(f"{cverb} {len(categories_created)} maintenance categor{'y' if len(categories_created) == 1 else 'ies'} that didn't exist yet:")
        for c in categories_created:
            print(f"  + {c}")
        print()

    verb = "Would add" if dry_run else "Added"
    print(f"{verb} {len(added)} repair type(s):")
    for cat, name in added:
        print(f"  + [{cat}] {name}")
    print(f"\nSkipped {len(skipped)} (already exist):")
    for cat, name in skipped:
        print(f"  = [{cat}] {name}")
    if dry_run:
        print("\nDry run only - no changes were written. Re-run without --dry-run to apply.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to the database.")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
