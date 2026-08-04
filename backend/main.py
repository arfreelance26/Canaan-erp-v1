import asyncio
import logging
import os
import re
import time

# Configure file + console logging before anything else emits a log line.
# Disabled for now — pending verification with the client. Re-enable to write
# rotating logs to backend/logs/erp.log (see logging_config.py).
# from logging_config import setup_logging
# setup_logging()

_log = logging.getLogger("canaan.app")

from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, DataError
from database import engine, Base
from security import get_current_user, require_roles, decode_token, SECRET_KEY, ALGORITHM, IS_PRODUCTION
from jose import jwt, JWTError
import models  # noqa: F401 — ensure all models are registered before create_all
from websocket_manager import manager as ws_manager, set_event_loop

from routers import trucks, drivers, staff, customers, vendors, trips, attendance, maintenance, finance, dashboard, files, auth, branches, repair_types, sac_codes, pl_summary, exports, edit_approvals, notifications, trip_expense_rates, backup, operating_costs

Base.metadata.create_all(bind=engine)

def _run_schema_migrations():
    """Idempotent ALTER TABLE migrations that create_all cannot handle (enum changes)."""
    migrations = [
        # Ensure bill_to exists before modifying its type (ADD is idempotent; MODIFY fails on missing column)
        "ALTER TABLE trips ADD COLUMN bill_to ENUM('CUSTOMER','CONSIGNEE','SELF/CGI')",
        "ALTER TABLE trip_closures ADD COLUMN bill_to ENUM('CUSTOMER','CONSIGNEE','SELF/CGI')",
        "ALTER TABLE trips MODIFY COLUMN bill_to ENUM('CUSTOMER','CONSIGNEE','SELF/CGI')",
        "ALTER TABLE trip_closures MODIFY COLUMN bill_to ENUM('CUSTOMER','CONSIGNEE','SELF/CGI')",
        "ALTER TABLE emi_records ADD COLUMN cost_per_month DECIMAL(10,2) DEFAULT 0",
        # Optimistic-locking version columns — trips (already existed)
        "ALTER TABLE trip_closures ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE trip_sheets ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE trip_invoices ADD COLUMN version INT NOT NULL DEFAULT 1",
        # Optimistic-locking version columns — all mutable entities
        "ALTER TABLE trucks ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE drivers ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE staff ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE customers ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE vendors ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE branches ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE maintenance_records ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE fuel_logs ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE tyre_inventory ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE emi_records ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE emi_records ADD COLUMN monthly_finance_cost DECIMAL(10,2) NOT NULL DEFAULT 0",
        "ALTER TABLE emi_records ADD COLUMN daily_finance_cost DECIMAL(10,4) NOT NULL DEFAULT 0",
        "ALTER TABLE recurring_payments ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE repair_types ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE sac_codes ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE sac_codes DROP INDEX code",
        # Yard Staff workflow
        "ALTER TABLE trips ADD COLUMN trip_sheet_collected BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE trips ADD COLUMN trip_sheet_collected_at DATETIME NULL",
        # Trip Sheet Register receive-confirmation workflow
        "ALTER TABLE trips ADD COLUMN trip_sheet_received BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE trips ADD COLUMN trip_sheet_received_at DATETIME NULL",
        # Trip category — ensure column exists before modifying enum
        "ALTER TABLE trips ADD COLUMN trip_category ENUM('LOCAL','LOCAL CFS','OUTSTATION','SHIFTING','RETURN TRIP')",
        "ALTER TABLE trips MODIFY COLUMN trip_category ENUM('LOCAL','LOCAL CFS','OUTSTATION','SHIFTING','RETURN TRIP')",
        # RETURN TRIP invoicing flag
        "ALTER TABLE trips ADD COLUMN invoice_required BOOLEAN NOT NULL DEFAULT TRUE",
        # Open Load cargo — rate per ton for hire amount calculation
        "ALTER TABLE trips ADD COLUMN rate_per_ton DECIMAL(10,2) NULL",
        # SAC code expense linkage — maps a SAC code to a trip expense field for invoice auto-fill
        "ALTER TABLE sac_codes ADD COLUMN linked_expense VARCHAR(200) NULL",
        # trips — columns added via one-off scripts, consolidated here for fresh DBs
        "ALTER TABLE trips ADD COLUMN driver_change_remark TEXT NULL",
        "ALTER TABLE trips ADD COLUMN booking_instructions TEXT NULL",
        "ALTER TABLE trips ADD COLUMN verification_status ENUM('pending','verified','flagged') DEFAULT 'pending'",
        "ALTER TABLE trips ADD COLUMN is_invoiced BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE trips ADD COLUMN container_number_1 VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN container_number_2 VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN cargo_reference VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN release_order_reference VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN driver_advance DECIMAL(10,2) NULL",
        "ALTER TABLE trips ADD COLUMN customer_fuel_advance_amount DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE trips ADD COLUMN customer_fuel_advance_litres DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE trips ADD COLUMN transport_crossing_amount DECIMAL(10,2) DEFAULT 0",
        # branches — halt day fees split into 20ft / 40ft rates
        "ALTER TABLE branches ADD COLUMN halt_day_fee_20ft DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE branches ADD COLUMN halt_day_fee_40ft DECIMAL(10,2) DEFAULT 0",
        # trip_sheets — container columns and major_repairs JSON
        "ALTER TABLE trip_sheets ADD COLUMN container_number_1 VARCHAR(100) NULL",
        "ALTER TABLE trip_sheets ADD COLUMN container_number_2 VARCHAR(100) NULL",
        "ALTER TABLE trip_sheets ADD COLUMN major_repairs JSON NULL",
        # trip_closures — halt remarks and additional driver advance
        "ALTER TABLE trip_closures ADD COLUMN halt_remarks TEXT NULL",
        "ALTER TABLE trip_closures ADD COLUMN additional_driver_advance DECIMAL(10,2) NULL",
        # Edit Approval Requests — expand resource_type to include BookingSheet + TripSheet
        "ALTER TABLE edit_approval_requests MODIFY COLUMN resource_type ENUM('Customer','Vendor','BookingSheet','TripSheet','TripData') NOT NULL",
        "ALTER TABLE edit_approval_requests MODIFY COLUMN action ENUM('Edit','Delete') NOT NULL",
        "ALTER TABLE edit_approval_requests MODIFY COLUMN status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending'",
        # Driver attendance — expand status enum with driver-specific statuses
        "ALTER TABLE driver_attendance MODIFY COLUMN status ENUM('Present','Absent','On Leave','Not Marked','On Trip','On Halt','Leave','On Workshop') NOT NULL DEFAULT 'Not Marked'",
        # tyre_fitment_records — removal remark text (required before removal is confirmed)
        "ALTER TABLE tyre_fitment_records ADD COLUMN removal_remark VARCHAR(500) NULL",
        # trip_sheets — rate per ton for open load hire amount calculation
        "ALTER TABLE trip_sheets ADD COLUMN rate_per_ton DECIMAL(10,2) NULL",
        # trips — add RETURN TRIP to cargo_classification enum
        "ALTER TABLE trips MODIFY COLUMN cargo_classification ENUM('IMPORT','EXPORT','EMPTY','CFS LADEN','OPEN LOAD','COASTAL','RETURN TRIP')",
        # open load hire type: Ton Based (weight × rate) vs Fixed (user-entered amount)
        "ALTER TABLE trips ADD COLUMN open_load_hire_type ENUM('Ton Based','Fixed') NULL",
        "ALTER TABLE trip_sheets ADD COLUMN open_load_hire_type ENUM('Ton Based','Fixed') NULL",
        # Performance indexes — CREATE INDEX IF NOT EXISTS is idempotent
        "CREATE INDEX IF NOT EXISTS idx_trips_status ON trips (status)",
        "CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips (driver_id)",
        "CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id ON trips (vehicle_id)",
        "CREATE INDEX IF NOT EXISTS idx_trips_assigned_date ON trips (assigned_date)",
        "CREATE INDEX IF NOT EXISTS idx_maintenance_truck_type ON maintenance_records (truck_id, maintenance_type)",
        "CREATE INDEX IF NOT EXISTS idx_fuel_logs_truck_id ON fuel_logs (truck_id)",
        "CREATE INDEX IF NOT EXISTS idx_tyre_fitment_truck_id ON tyre_fitment_records (truck_id)",
        "CREATE INDEX IF NOT EXISTS idx_customer_pricing_customer_id ON customer_pricing (customer_id)",
        "CREATE INDEX IF NOT EXISTS idx_customer_origins_customer_id ON customer_origins (customer_id)",
        "CREATE INDEX IF NOT EXISTS idx_customer_destinations_customer_id ON customer_destinations (customer_id)",
        # Delete request workflow — add Trip to resource_type enum + admin_note column
        "ALTER TABLE edit_approval_requests MODIFY COLUMN resource_type ENUM('Customer','Vendor','BookingSheet','TripSheet','TripData','Trip') NOT NULL",
        "ALTER TABLE edit_approval_requests ADD COLUMN admin_note TEXT NULL",
        # Approximate KM entered by Commercial Manager at assignment (used for ±10% variance check in trip sheet)
        "ALTER TABLE trips ADD COLUMN approx_km DECIMAL(10,2) NULL",
        # Lift-on amount and remarks (0 for COASTAL, manual for SHIFTING/EMPTY/OPEN, rate-table for others)
        "ALTER TABLE trips ADD COLUMN lift_on_amount DECIMAL(10,2) NULL",
        "ALTER TABLE trips ADD COLUMN lift_on_remarks TEXT NULL",
        # CHA (Customs House Agent) name — auto-filled as CGI when customer is Self
        "ALTER TABLE trips ADD COLUMN cha_name VARCHAR(200) NULL",
        # Flagged for re-checking by Docs staff — trip stays pending until unflagged
        "ALTER TABLE trips ADD COLUMN flagged_for_recheck BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE trips ADD COLUMN flagged_remark TEXT NULL",
        # Advance paid to driver verification by Yard Supervisor
        "ALTER TABLE trips ADD COLUMN advance_verified TINYINT(1) NULL",
        "ALTER TABLE trips ADD COLUMN advance_verification_remark TEXT NULL",
        "ALTER TABLE trips ADD COLUMN advance_corrected_amount DECIMAL(10,2) NULL",
        # Diesel entry in trip sheet
        "ALTER TABLE trip_sheets ADD COLUMN diesel_litres DECIMAL(10,2) NULL",
        "ALTER TABLE trip_sheets ADD COLUMN diesel_rate DECIMAL(10,2) NULL",
        "ALTER TABLE trip_sheets ADD COLUMN diesel_total DECIMAL(10,2) NULL",
        "ALTER TABLE trip_sheets ADD COLUMN diesel_remarks TEXT NULL",
        "ALTER TABLE trip_sheets ADD COLUMN km_variance_remark TEXT NULL",
        # Verification rejection — Accounts rejects trip sheet back to Docs with a reason
        "ALTER TABLE trips ADD COLUMN verification_rejection_reason TEXT NULL",
        "ALTER TABLE trips MODIFY COLUMN verification_status ENUM('pending','verified','flagged','rejected') DEFAULT 'pending'",
        # Multiple diesel entries per trip sheet (replaces single diesel_litres/rate/total)
        "ALTER TABLE trip_sheets ADD COLUMN diesel_entries JSON NULL",
        # Container number format enforcement: exactly 4 letters + 7 digits (e.g. TWCU2081370)
        # MODIFY will silently fail (caught below) if existing rows have non-conforming values —
        # Pydantic validation in TripBase.validate_container_number covers all new writes.
        "ALTER TABLE trips MODIFY COLUMN container_number VARCHAR(11) NULL",
        "ALTER TABLE trips MODIFY COLUMN container_number_1 VARCHAR(11) NULL",
        "ALTER TABLE trips MODIFY COLUMN container_number_2 VARCHAR(11) NULL",
        # Approx distance from customer destination master → stored on trip for carry-forward
        "ALTER TABLE customer_destinations ADD COLUMN destination_name VARCHAR(200) NULL",
        "ALTER TABLE customer_destinations ADD COLUMN approx_distance_km DECIMAL(8,2) NULL",
        "ALTER TABLE customer_destinations ADD COLUMN origin_state VARCHAR(100) NULL",
        "ALTER TABLE customer_destinations ADD COLUMN origin_address VARCHAR(500) NULL",
        "ALTER TABLE trips ADD COLUMN approx_trip_distance DECIMAL(8,2) NULL",
        # User who entered/last modified a fuel log (ERP staff name, not the system marker)
        "ALTER TABLE fuel_logs ADD COLUMN entered_by_name VARCHAR(100) NULL",
        # Source of the fuel log entry: 'Manual Log' or 'Trip Sheet-{trip_id}'
        "ALTER TABLE fuel_logs ADD COLUMN source VARCHAR(200) NULL",
        # Invoice type this SAC code should auto-populate into when generating an invoice
        "ALTER TABLE sac_codes ADD COLUMN auto_populate_invoice_type VARCHAR(50) NULL",
        # branches — driver halt day compensation percentage
        "ALTER TABLE branches ADD COLUMN driver_halt_day_percentage DECIMAL(5,2) DEFAULT 0",
        # LR (Lorry Receipt / Consignment Note) fields on trips
        "ALTER TABLE trips ADD COLUMN lr_consignor TEXT NULL",
        "ALTER TABLE trips ADD COLUMN lr_consignee TEXT NULL",
        "ALTER TABLE trips ADD COLUMN lr_ref_no VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN lr_description_of_goods TEXT NULL",
        "ALTER TABLE trips ADD COLUMN lr_invoice_no VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN lr_sb_be_no VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN lr_seal_no_packages VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN lr_tare VARCHAR(50) NULL",
        "ALTER TABLE trips ADD COLUMN lr_weight VARCHAR(50) NULL",
        "ALTER TABLE trips ADD COLUMN lr_value VARCHAR(100) NULL",
        "ALTER TABLE trips ADD COLUMN lr_to_pay TINYINT(1) DEFAULT 0 NULL",
        "ALTER TABLE trips ADD COLUMN lr_to_be_billed TINYINT(1) DEFAULT 0 NULL",
        "ALTER TABLE trips ADD COLUMN lr_saved_at DATETIME NULL",
        # trip_expense_rates — Admin-configurable default expense rate sets
        "ALTER TABLE trip_expense_rates ADD COLUMN version INT NOT NULL DEFAULT 1",
        "ALTER TABLE trip_expense_rates ADD COLUMN port_pass_expense_auto TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE trip_expense_rates ADD COLUMN weight_sheet_expense_auto TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE trip_expense_rates ADD COLUMN mamol_expense_auto TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE trip_expense_rates ADD COLUMN claimable_mamol_expense_auto TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE trip_expense_rates ADD COLUMN traffic_rto_expense_auto TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE trip_expense_rates ADD COLUMN lift_on_off_expense_auto TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE trip_expense_rates ADD COLUMN crane_operator_expense_auto TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE trip_expense_rates ADD COLUMN parking_expense_auto TINYINT(1) NOT NULL DEFAULT 0",
        # maintenance_records — link to trip sheet for sync on save
        "ALTER TABLE maintenance_records ADD COLUMN trip_id INT NULL",
        "ALTER TABLE maintenance_records ADD CONSTRAINT fk_maintenance_trip_id FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE SET NULL",
        # Initial Disbursed Advance — tracks the actual amount sent to driver when it differs from Driver Advance
        "ALTER TABLE trips ADD COLUMN initial_disbursed_advance DECIMAL(10,2) NULL",
        # Staff attendance — close-shift time (IST, "HH:MM AM/PM")
        "ALTER TABLE staff_attendance ADD COLUMN check_out_time VARCHAR(20) NULL",
        "ALTER TABLE staff_attendance ADD COLUMN admin_override TINYINT(1) NOT NULL DEFAULT 0",
        # AdBlue consumption rate per truck (L/km, 5 d.p.), set manually by admin on the AdBlue Management page
        "ALTER TABLE trucks ADD COLUMN adblue_consumption DECIMAL(8,5) NULL",
        # Widen precision in case column already existed as DECIMAL(6,2) from a previous migration run
        "ALTER TABLE trucks MODIFY COLUMN adblue_consumption DECIMAL(8,5) NULL",
        # NOTE: BLOB widening (MEDIUMBLOB → LONGBLOB for the 25 MB upload limit) is handled
        # by the guarded _widen_blob_columns() step below, NOT here — a blob-type change forces
        # a full table copy, so it must run once (only when needed), never on every restart.
        "ALTER TABLE trips MODIFY COLUMN trip_id VARCHAR(100) NOT NULL",
        "ALTER TABLE trip_closures ADD COLUMN closure_remarks TEXT NULL",
        # Driver name snapshot stored on trip at assignment time
        "ALTER TABLE trips ADD COLUMN driver_name VARCHAR(200) NULL",
        # Driver attendance remarks — late entry flag (set when non-admin marks attendance past the 2-day window)
        "ALTER TABLE driver_attendance_remarks ADD COLUMN is_late_entry TINYINT(1) NOT NULL DEFAULT 0",
    ]
    # Role rename detection must happen BEFORE the enum is expanded: if the column
    # definition already contains 'Yard Staff', the previous intermediate rename
    # (Staff → 'Trip Sheet Coordinator') already ran on this DB.
    _was_intermediate = False
    _rename_done = False
    with engine.connect() as conn:
        try:
            coltype = conn.execute(text(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' "
                "AND COLUMN_NAME = 'software_designation'"
            )).scalar() or ""
            _was_intermediate = "Yard Staff" in coltype
            # Already in final state: has the new role names and none of the old ones.
            # Skip the whole rename block so production restarts never touch data.
            _rename_done = (
                "Trip Sheet Register" in coltype
                and "'Staff'" not in coltype
                and "Trip Sheet Coordinator" not in coltype
            )
        except Exception:
            pass

    if not _rename_done:
        migrations += [
        # Role rename, step 1: expand enums to hold every historical + final value at once
        # (old 'Trip Sheet Coordinator' → 'Yard Staff', old 'Staff' → 'Trip Sheet Register')
        "ALTER TABLE staff MODIFY COLUMN software_designation ENUM('Admin','Fleet Manager','Finance Manager','Tyre Manager','Staff','Trip Sheet Coordinator','Yard Staff','Trip Sheet Register') NOT NULL DEFAULT 'Staff'",
        "ALTER TABLE leave_requests MODIFY COLUMN category ENUM('Driver','Fleet Manager','Tyre Manager','Staff','Trip Sheet Coordinator','Yard Staff','Trip Sheet Register') NOT NULL",
    ]
    # Each statement gets its own connection+commit so a failed ALTER TABLE
    # (e.g. duplicate column) cannot poison subsequent migrations.
    for stmt in migrations:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception:
            pass

    if not _rename_done:
        # Role rename, step 2: data migration. Must be state-aware because a DB may
        # already have run the intermediate rename (Staff → 'Trip Sheet Coordinator'),
        # in which case remaining 'Trip Sheet Coordinator' rows are ex-Staff, not yard people.
        _rename_map_fresh = [  # DB still on original names
            ("Trip Sheet Coordinator", "Yard Staff"),
            ("Staff", "Trip Sheet Register"),
        ]
        _rename_map_intermediate = [  # DB already ran the previous rename
            ("Trip Sheet Coordinator", "Trip Sheet Register"),
        ]
        rename_map = _rename_map_intermediate if _was_intermediate else _rename_map_fresh
        with engine.connect() as conn:
            for table, col in (("staff", "software_designation"), ("leave_requests", "category")):
                for old, new in rename_map:
                    try:
                        conn.execute(text(
                            f"UPDATE {table} SET {col} = :new WHERE {col} = :old"
                        ), {"new": new, "old": old})
                    except Exception:
                        pass
            # Repair rows blanked by an earlier enum truncation (value not in enum → '')
            for table, col, fallback in (
                ("staff", "software_designation", "Trip Sheet Register"),
                ("leave_requests", "category", "Trip Sheet Register"),
            ):
                try:
                    conn.execute(text(
                        f"UPDATE {table} SET {col} = :fb WHERE {col} = ''"
                    ), {"fb": fallback})
                except Exception:
                    pass
            conn.commit()

        # Role rename, step 3: finalize enums to only the round-1 names
        # (round-2 migration below will update further to the final names)
        _final_enums = [
            "ALTER TABLE staff MODIFY COLUMN software_designation ENUM('Admin','Fleet Manager','Finance Manager','Tyre Manager','Trip Sheet Register','Yard Staff') NOT NULL DEFAULT 'Trip Sheet Register'",
            "ALTER TABLE leave_requests MODIFY COLUMN category ENUM('Driver','Fleet Manager','Tyre Manager','Trip Sheet Register','Yard Staff') NOT NULL",
        ]
        with engine.connect() as conn:
            for stmt in _final_enums:
                try:
                    conn.execute(text(stmt))
                except Exception:
                    pass
            conn.commit()

    # ── Role rename round 2 ──────────────────────────────────────────────────
    # Fleet Manager → Commercial Manager / Assistant Commercial Manager
    # Finance Manager → Accounts
    # Tyre Manager → Maintenance
    # Yard Staff → Yard Supervisor
    _r2_done = False
    with engine.connect() as conn:
        try:
            coltype2 = conn.execute(text(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' "
                "AND COLUMN_NAME = 'software_designation'"
            )).scalar() or ""
            _r2_done = "'Commercial Manager'" in coltype2 and "'Fleet Manager'" not in coltype2
        except Exception:
            pass

    if not _r2_done:
        _r2_expand = [
            "ALTER TABLE staff MODIFY COLUMN software_designation ENUM('Admin','Fleet Manager','Finance Manager','Tyre Manager','Trip Sheet Register','Yard Staff','Commercial Manager','Assistant Commercial Manager','Accounts','Maintenance','Yard Supervisor') NOT NULL DEFAULT 'Trip Sheet Register'",
            "ALTER TABLE leave_requests MODIFY COLUMN category ENUM('Driver','Fleet Manager','Finance Manager','Tyre Manager','Trip Sheet Register','Yard Staff','Commercial Manager','Assistant Commercial Manager','Accounts','Maintenance','Yard Supervisor') NOT NULL",
        ]
        with engine.connect() as conn:
            for stmt in _r2_expand:
                try:
                    conn.execute(text(stmt))
                except Exception:
                    pass
            conn.commit()

        _r2_renames = [
            ("Fleet Manager",    "Commercial Manager"),
            ("Finance Manager",  "Accounts"),
            ("Tyre Manager",     "Maintenance"),
            ("Yard Staff",       "Yard Supervisor"),
        ]
        with engine.connect() as conn:
            for table, col in (("staff", "software_designation"), ("leave_requests", "category")):
                for old, new in _r2_renames:
                    try:
                        conn.execute(text(f"UPDATE {table} SET {col} = :new WHERE {col} = :old"), {"new": new, "old": old})
                    except Exception:
                        pass
            conn.commit()

        _r2_final = [
            "ALTER TABLE staff MODIFY COLUMN software_designation ENUM('Admin','Commercial Manager','Assistant Commercial Manager','Accounts','Maintenance','Trip Sheet Register','Yard Supervisor') NOT NULL DEFAULT 'Trip Sheet Register'",
            "ALTER TABLE leave_requests MODIFY COLUMN category ENUM('Driver','Commercial Manager','Assistant Commercial Manager','Accounts','Maintenance','Trip Sheet Register','Yard Supervisor') NOT NULL",
        ]
        with engine.connect() as conn:
            for stmt in _r2_final:
                try:
                    conn.execute(text(stmt))
                except Exception:
                    pass
            conn.commit()

def _widen_blob_columns():
    """Widen document BLOB columns MEDIUMBLOB (16 MB) → LONGBLOB (up to 4 GB) so the
    standardized 25 MB upload limit is not truncated at the old ceiling.

    Safety properties (important because production already holds files):
    - MEDIUMBLOB → LONGBLOB is a *widening* conversion: MySQL copies every existing
      byte unchanged. There is no truncation and no corruption of stored files.
    - The columns stay NULL-able exactly as before (plain LONGBLOB, no NOT NULL added).
    - A blob-type change forces a full table copy, so this runs ONLY when a column is
      not already LONGBLOB. On a DB that's already widened it does nothing (no re-copy,
      no lock), making backend restarts cheap and safe.
    - Each column is handled independently in its own try/except; one failure never
      leaves the rest unwidened and never aborts startup.
    """
    blob_targets = [
        ("trucks",    "photo_blob"),
        ("trucks",    "rc_document_blob"),
        ("trucks",    "fc_document_blob"),
        ("trucks",    "road_tax_document_blob"),
        ("trucks",    "insurance_document_proof_blob"),
        ("trucks",    "national_permit_proof_blob"),
        ("trucks",    "local_permit_proof_blob"),
        ("trucks",    "pollution_certificate_blob"),
        ("drivers",   "photo_blob"),
        ("drivers",   "aadhaar_blob"),
        ("drivers",   "license_blob"),
        ("staff",     "photo_blob"),
        ("staff",     "aadhar_document_blob"),
        ("customers", "photo_blob"),
    ]
    with engine.connect() as conn:
        for table, column in blob_targets:
            try:
                current_type = conn.execute(text(
                    "SELECT DATA_TYPE FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
                ), {"t": table, "c": column}).scalar()
                # Column missing (fresh DB — create_all made it LONGBLOB already) or
                # already widened → skip. Only convert genuine narrower blob types.
                if current_type is None or current_type.lower() == "longblob":
                    continue
                conn.execute(text(f"ALTER TABLE `{table}` MODIFY COLUMN `{column}` LONGBLOB NULL"))
                conn.commit()
                print(f"[migration] widened {table}.{column} ({current_type} → longblob)")
            except Exception as e:
                # Never block startup; log and continue with the next column.
                print(f"[migration] skip widening {table}.{column}: {e}")


_run_schema_migrations()
_widen_blob_columns()

def _normalize_shipping_lines():
    """Normalise historical shipping_line typos/variants to canonical names."""
    rewrites = [
        ("CMACGM",      "CMA CGM"),
        ("HAPAG LLOYD",  "HAPAG-LLOYD"),
        ("HAPAG-LL0YD",  "HAPAG-LLOYD"),  # zero instead of O
        ("HAPAGLLOYD",   "HAPAG-LLOYD"),
        ("HAPAH LLOYD",  "HAPAG-LLOYD"),
    ]
    with engine.connect() as conn:
        for old, new in rewrites:
            try:
                conn.execute(
                    text("UPDATE trips SET shipping_line = :new WHERE shipping_line = :old"),
                    {"new": new, "old": old},
                )
            except Exception as e:
                print(f"[migration] shipping_line normalise '{old}' → '{new}': {e}")
        conn.commit()

_normalize_shipping_lines()

_DEFAULT_REPAIR_TYPES = [
    "Tyre Puncture", "Tyre Replacement", "Engine Oil Change", "Brake Repair",
    "Battery Replacement", "Clutch Repair", "Engine Repair", "Gearbox Repair",
    "Radiator / Cooling System Repair", "Suspension Repair",
]

def _seed_repair_types():
    from database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(models.RepairType).count() == 0:
            db.add_all([models.RepairType(name=name, default_cost=0) for name in _DEFAULT_REPAIR_TYPES])
            db.commit()
    finally:
        db.close()

_seed_repair_types()

# In production, hide the interactive API explorer and schema so the full endpoint
# surface isn't published. These are only served in development.
app = FastAPI(
    title="Canaan ERP API",
    description="Backend for Canaan Global International — Fleet & Logistics ERP",
    version="1.0.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

@app.on_event("startup")
async def _startup():
    set_event_loop(asyncio.get_running_loop())

# HIGH-2: CORS origins come from the environment. Wildcard is allowed only when
# CORS_ORIGINS is literally "*" (development). Production must set the real origin(s).
_cors_env = os.getenv("CORS_ORIGINS", "*").strip()
if _cors_env == "*":
    _cors_origins = ["*"]
else:
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enable HSTS only when TLS is terminated end-to-end (set ENABLE_HSTS=1 in prod).
_ENABLE_HSTS = os.getenv("ENABLE_HSTS", "0") == "1"
# A conservative CSP for the JSON API. The Next.js frontend is served separately
# and ships its own CSP; this protects any HTML the API itself might return.
_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"



@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(), payment=()"
    response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
    # File responses set their own CSP (sandbox); don't override those.
    response.headers.setdefault("Content-Security-Policy", _API_CSP)
    if _ENABLE_HSTS:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response


_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Paths whose mutations should NOT trigger a broadcast (auth = login attempts, ws = n/a)
_REALTIME_EXEMPT_PREFIXES = ("/auth", "/ws")


@app.middleware("http")
async def realtime_broadcast(request: Request, call_next):
    """After any successful mutating request, notify all connected clients which
    resource changed so open pages can refetch instantly instead of polling."""
    response = await call_next(request)
    if (
        request.method in _MUTATING_METHODS
        and response.status_code < 400
        and not request.url.path.startswith(_REALTIME_EXEMPT_PREFIXES)
    ):
        # "/trips/12/collect-sheet" -> resource "trips"
        resource = request.url.path.strip("/").split("/", 1)[0]
        if resource:
            ws_manager.emit_soon("data_changed", {"resource": resource, "path": request.url.path})
    return response


# All business routers require a valid JWT (see security.py).
AUTH = [Depends(get_current_user)]
# Finance data additionally requires the Accounts (or Admin) role.
FINANCE = [Depends(require_roles("Accounts"))]

app.include_router(auth.router)                              # public: /auth/login
app.include_router(files.router)                             # GET public (img tags), POST guarded inside
app.include_router(trucks.router, dependencies=AUTH)
app.include_router(drivers.router, dependencies=AUTH)
app.include_router(staff.router, dependencies=AUTH)
app.include_router(customers.router, dependencies=AUTH)
app.include_router(vendors.router, dependencies=AUTH)
app.include_router(trips.router, dependencies=AUTH)
app.include_router(attendance.router, dependencies=AUTH)
app.include_router(maintenance.router, dependencies=AUTH)
app.include_router(finance.router, dependencies=FINANCE)
app.include_router(dashboard.router, dependencies=AUTH)
app.include_router(branches.router, dependencies=AUTH)
app.include_router(repair_types.router, dependencies=AUTH)
app.include_router(sac_codes.router, dependencies=AUTH)
app.include_router(pl_summary.router, dependencies=FINANCE)
app.include_router(exports.router, dependencies=AUTH)
app.include_router(edit_approvals.router, dependencies=AUTH)
app.include_router(notifications.router, dependencies=AUTH)
app.include_router(trip_expense_rates.router, dependencies=AUTH)
app.include_router(backup.router, dependencies=AUTH)
app.include_router(operating_costs.router, dependencies=AUTH)


@app.exception_handler(IntegrityError)
async def sqlalchemy_integrity_exception_handler(request: Request, exc: IntegrityError):
    error_msg = str(exc.orig) if exc.orig else str(exc)

    duplicate_match = re.search(r"Duplicate entry '(.+?)' for key '([^']+)'", error_msg)
    if duplicate_match:
        value, key = duplicate_match.groups()
        field = key.split(".")[-1].replace("_", " ")
        field = re.sub(r"^(uq|idx|ix)[\s_]+", "", field).strip()
        return JSONResponse(
            status_code=409,
            content={"detail": f"'{value}' already exists for {field}. Please use a different value."},
        )

    if re.search(r"foreign key constraint fails", error_msg, re.IGNORECASE):
        return JSONResponse(
            status_code=409,
            content={"detail": "This record is referenced by other data and cannot be modified or deleted."},
        )

    # MEDIUM-5: don't echo raw DB error text to the client. Log it server-side.
    _log.warning("Unhandled IntegrityError on %s %s: %s", request.method, request.url.path, error_msg)
    return JSONResponse(
        status_code=400,
        content={"detail": "The request conflicts with existing data. Please review your input and try again."},
    )

@app.exception_handler(DataError)
async def sqlalchemy_data_exception_handler(request: Request, exc: DataError):
    error_msg = str(exc.orig) if exc.orig else str(exc)
    truncation = re.search(r"Data truncated for column '(\w+)'", error_msg)
    if truncation:
        col = truncation.group(1).replace("_", " ")
        return JSONResponse(
            status_code=422,
            content={"detail": f"Invalid value for '{col}'. The value is not allowed by the database."},
        )
    _log.warning("DataError on %s %s: %s", request.method, request.url.path, error_msg)
    return JSONResponse(status_code=422, content={"detail": "One or more values are invalid. Please check your input."})

@app.exception_handler(OperationalError)
async def sqlalchemy_operational_exception_handler(request: Request, exc: OperationalError):
    error_msg = str(exc.orig) if exc.orig else str(exc)
    _log.error("OperationalError on %s %s: %s", request.method, request.url.path, error_msg)
    return JSONResponse(
        status_code=503,
        content={"detail": "The service is temporarily unavailable. Please try again shortly."},
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak exception type/stack to the client. Full detail goes to the server log.
    _log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again or contact support."},
    )

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Canaan ERP API"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    try:
        payload = decode_token(token)  # enforces signature, expiry AND revocation
    except JWTError:
        await websocket.close(code=1008)  # policy violation: bad/expired/revoked token
        return
    token_exp = payload.get("exp", 0)

    if not await ws_manager.connect(websocket):
        return  # server at connection capacity
    try:
        while True:
            # Wake up at least every 60s to re-check token expiry even if idle
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                msg = None
            if token_exp and time.time() > token_exp:
                await websocket.close(code=4001)  # session expired — client should re-auth
                break
            if msg == "ping":
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(websocket)
