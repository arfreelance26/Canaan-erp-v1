"""
Migration: Rebuild trip_closures table with new simplified 5-section schema.
Run this ONCE against the running MySQL database.
Compatible with MySQL 5.7+
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text, inspect

OLD_COLUMNS = [
    "booking_reference_no", "trip_category", "movement_category", "customer_name",
    "container_specification", "cargo_classification", "container_number",
    "container_number_1", "container_number_2", "cargo_reference", "booking_date",
    "origin_location", "destination_location", "rate_type", "release_order_reference",
    "shipping_line", "vessel_name", "shipper_consignee_name",
    "transport_method", "transporter", "trip_date", "assigned_truck_details",
    "payment_type", "customer_advance", "diesel_advance", "driver_advance_amount",
    "driver_advance_payment_method",
    "transport_hire_amount", "transport_crossing_amount", "transport_halt",
    "transport_unloading", "transport_lifting_charges", "transport_weighment",
    "total_transport_amount",
    "billing_hire_amount", "billing_halt", "billing_unloading",
    "billing_lifting_charges", "billing_weighment", "total_billing_amount",
    "trip_closing_date",
    "starting_odometer", "ending_odometer", "total_distance",
    "gross_weight", "tare_weight", "net_weight",
    "bunk_name", "diesel_quantity", "fuel_total_cost",
    "total_halt_days", "halt_remarks",
    "drivers_compensation", "halt_compensation", "port_pass_expense",
    "weight_sheet_expense", "mamol_expense", "claimable_mamol_expense",
    "traffic_rto_police_expense", "lift_on_off_expense", "crane_operator_expense",
    "parking_expenses", "puncture_expense", "spare_parts_expense",
    "other_expenses", "toll_expenses", "additional_driver_advance_amount",
]

NEW_COLUMNS = [
    # 1. Shipment Information
    ("booking_no", "VARCHAR(50)"),
    ("container_no", "VARCHAR(100)"),
    ("release_order_no", "VARCHAR(100)"),
    ("container_type", "VARCHAR(100)"),
    ("line", "VARCHAR(200)"),
    ("load_type", "VARCHAR(100)"),
    ("movement_category", "VARCHAR(100)"),
    # 2. Assignment
    ("vehicle_id", "VARCHAR(20)"),
    ("driver_id", "VARCHAR(20)"),
    ("assignment_date", "DATE"),
    # 3. Route
    ("from_location", "VARCHAR(200)"),
    ("to_location", "VARCHAR(200)"),
    ("trip_completed_date", "DATE"),
    # 4. Billing
    ("hire_amount", "DECIMAL(10,2) DEFAULT 0"),
    ("transport_amount", "DECIMAL(10,2) DEFAULT 0"),
    ("billing_amount", "DECIMAL(10,2) DEFAULT 0"),
    ("advance_amount", "DECIMAL(10,2) DEFAULT 0"),
    ("payment_mode", "VARCHAR(50)"),
    # 5. Halt Information
    ("company_halt_days", "INT DEFAULT 0"),
    ("party_halt_days", "INT DEFAULT 0"),
    ("driver_halt_compensation", "DECIMAL(10,2) DEFAULT 0"),
]


def run():
    inspector = inspect(engine)
    existing_cols = {col["name"] for col in inspector.get_columns("trip_closures")}

    with engine.connect() as conn:

        # Drop old columns one by one (safe for MySQL 5.7)
        for col in OLD_COLUMNS:
            if col in existing_cols:
                try:
                    conn.execute(text(f"ALTER TABLE trip_closures DROP COLUMN `{col}`"))
                    conn.commit()
                    print(f"  [DROPPED] {col}")
                except Exception as e:
                    print(f"  [SKIP DROP] {col}: {e}")
            else:
                print(f"  [SKIP] {col} (does not exist)")

        # Add new columns one by one
        for col_name, col_def in NEW_COLUMNS:
            if col_name not in existing_cols:
                try:
                    conn.execute(text(f"ALTER TABLE trip_closures ADD COLUMN `{col_name}` {col_def}"))
                    conn.commit()
                    print(f"  [ADDED] {col_name}")
                except Exception as e:
                    print(f"  [SKIP ADD] {col_name}: {e}")
            else:
                print(f"  [EXISTS] {col_name}")

        # Modify bill_to to be ENUM if it is currently VARCHAR
        try:
            conn.execute(text(
                "ALTER TABLE trip_closures MODIFY COLUMN `bill_to` ENUM('CUSTOMER', 'CONSIGNEE')"
            ))
            conn.commit()
            print("  [MODIFIED] bill_to -> ENUM('CUSTOMER','CONSIGNEE')")
        except Exception as e:
            print(f"  [SKIP bill_to modify]: {e}")

        # Add halt_remarks back as new column (it was in old list)
        if "halt_remarks" not in {col["name"] for col in inspector.get_columns("trip_closures")}:
            try:
                conn.execute(text("ALTER TABLE trip_closures ADD COLUMN `halt_remarks` TEXT"))
                conn.commit()
                print("  [ADDED] halt_remarks")
            except Exception as e:
                print(f"  [SKIP halt_remarks add]: {e}")

    print("\nMigration complete. trip_closures table updated to new schema.")


if __name__ == "__main__":
    run()
