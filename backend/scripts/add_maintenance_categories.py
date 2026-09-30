"""One-time production script: adds a specific list of Maintenance
Categories (the "Maintenance Management" admin page).

Idempotent — safe to run more than once. It only inserts names that are not
already present (matched case-insensitively), so re-running it will not
create duplicates or raise errors.

Usage (from the backend/ directory, with the same environment/DB config
production uses):
    python scripts/add_maintenance_categories.py --dry-run   # preview only, no writes
    python scripts/add_maintenance_categories.py              # actually insert
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models

NAMES_TO_ADD = [
    "ACCIDENT WORK",
    "AMC",
    "BRAKE SYSTEM",
    "CABIN",
    "CHASSIS & AXLE",
    "DIFFERENTIAL",
    "ELECTRICAL",
    "ENGINE",
    "FABRICATION & WELDING WORK",
    "FC WORK",
    "NEUMATIC",
    "STEERING UNIT",
    "SUSPENSION WORK",
    "TRANSVISION",
]


def main(dry_run: bool):
    db = SessionLocal()
    added = []
    skipped = []
    try:
        existing = {
            (name or "").strip().upper()
            for (name,) in db.query(models.MaintenanceCategory.name).all()
        }
        for name in NAMES_TO_ADD:
            key = name.strip().upper()
            if key in existing:
                skipped.append(name)
                continue
            if not dry_run:
                db.add(models.MaintenanceCategory(name=name.strip()))
            existing.add(key)  # guard against duplicates within NAMES_TO_ADD itself
            added.append(name)

        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    verb = "Would add" if dry_run else "Added"
    print(f"{verb} {len(added)} maintenance categor{'y' if len(added) == 1 else 'ies'}:")
    for n in added:
        print(f"  + {n}")
    print(f"\nSkipped {len(skipped)} (already exist):")
    for n in skipped:
        print(f"  = {n}")
    if dry_run:
        print("\nDry run only - no changes were written. Re-run without --dry-run to apply.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to the database.")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
