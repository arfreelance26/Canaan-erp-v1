#!/usr/bin/env python3
"""
Reset database: Drop all tables and recreate them from updated models.
This will delete ALL DATA and apply all schema changes.
WARNING: This is destructive - all data will be lost!
"""

from database import engine
import models

def reset_database():
    """Drop all tables and recreate them from the current models."""

    print("\n" + "="*70)
    print("🗑️  DATABASE RESET")
    print("="*70)
    print("\n⚠️  WARNING: This will DELETE ALL DATA from the database!")
    print("    All tables will be dropped and recreated from the updated models.")
    print("    This will apply all schema changes including:")
    print("    - Removed 'customer_origin' field")
    print("    - Added 'weight_in_tons' field")
    print("    - Updated 'load_type' and 'container_type' to use Enum")
    print("\n" + "="*70)

    response = input("\nType 'YES I UNDERSTAND' to proceed with database reset: ").strip()

    if response != "YES I UNDERSTAND":
        print("\n❌ Cancelled. Database unchanged.")
        return False

    try:
        print("\n🔄 Dropping all tables...")
        # Drop all tables
        models.Base.metadata.drop_all(bind=engine)
        print("✅ All tables dropped")

        print("\n🔄 Recreating tables from updated models...")
        # Recreate all tables from models
        models.Base.metadata.create_all(bind=engine)
        print("✅ All tables recreated")

        print("\n" + "="*70)
        print("✅ DATABASE RESET COMPLETE!")
        print("="*70)
        print("\n✓ Schema is now up-to-date with all model changes:")
        print("  ✓ CustomerPricing: customer_origin removed")
        print("  ✓ CustomerPricing: weight_in_tons added")
        print("  ✓ CustomerPricing: load_type uses Enum (IMPORT, EXPORT, OPEN LOAD)")
        print("  ✓ CustomerPricing: container_type updated (20 FEET, 40 FEET, etc.)")
        print("  ✓ Customer: Additional fields added (isGta, applicableForEInvoice, etc.)")
        print("\n✓ All data has been cleared")
        print("✓ All tables are empty and ready for new data")
        print("\nYou can now start the backend server and add new data via the API.")
        print("="*70 + "\n")

        return True

    except Exception as e:
        print(f"\n❌ Error resetting database: {e}")
        raise

if __name__ == "__main__":
    import sys

    # Allow --force flag to skip confirmation
    if len(sys.argv) > 1 and sys.argv[1] == "--force":
        print("\n" + "="*70)
        print("🗑️  DATABASE RESET (FORCED)")
        print("="*70)

        try:
            print("\n🔄 Dropping all tables...")
            models.Base.metadata.drop_all(bind=engine)
            print("✅ All tables dropped")

            print("\n🔄 Recreating tables from updated models...")
            models.Base.metadata.create_all(bind=engine)
            print("✅ All tables recreated")

            print("\n" + "="*70)
            print("✅ DATABASE RESET COMPLETE!")
            print("="*70)
            print("\n✓ Schema is now up-to-date with all model changes:")
            print("  ✓ CustomerPricing: customer_origin removed")
            print("  ✓ CustomerPricing: weight_in_tons added")
            print("  ✓ CustomerPricing: load_type uses Enum (IMPORT, EXPORT, OPEN LOAD)")
            print("  ✓ CustomerPricing: container_type updated (20 FEET, 40 FEET, etc.)")
            print("  ✓ Customer: Additional fields added (isGta, applicableForEInvoice, etc.)")
            print("\n✓ All data has been cleared")
            print("✓ All tables are empty and ready for new data")
            print("\nYou can now start the backend server and add new data via the API.")
            print("="*70 + "\n")
            sys.exit(0)
        except Exception as e:
            print(f"\n❌ Error resetting database: {e}")
            sys.exit(1)
    else:
        success = reset_database()
        sys.exit(0 if success else 1)
