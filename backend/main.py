import asyncio
import json
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

# ---------------------------------------------------------------------------
# Redact session tokens out of the WebSocket connection log line.
#
# The frontend authenticates its realtime connection as `GET /ws?token=<jwt>`
# (a WebSocket handshake can't carry an Authorization header from a browser),
# and uvicorn's own access/error loggers print the full request target —
# including that query string — for every connect/reconnect. Canaan Chat
# reconnects on every tab open and network blip, so without this a valid,
# still-live session token was landing in plaintext in the server log on a
# very regular basis; anyone with log access could hijack that session until
# it expired. This applies unconditionally, independent of whether the
# app's own structured logging (logging_config.setup_logging) is enabled,
# because uvicorn's default handlers emit the line before that ever runs.
# ---------------------------------------------------------------------------
class _RedactTokenFilter(logging.Filter):
    _TOKEN_RE = re.compile(r'([?&]token=)[^&\s"\']+')

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str) and "token=" in record.msg:
            record.msg = self._TOKEN_RE.sub(r"\1[redacted]", record.msg)
        if record.args:
            record.args = tuple(
                self._TOKEN_RE.sub(r"\1[redacted]", a) if isinstance(a, str) and "token=" in a else a
                for a in record.args
            )
        return True


_token_filter = _RedactTokenFilter()
for _logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    logging.getLogger(_logger_name).addFilter(_token_filter)

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
from websocket_manager import manager as ws_manager, set_event_loop, ensure_event_loop

from routers import trucks, drivers, staff, customers, vendors, vendor_categories, trips, attendance, maintenance, finance, dashboard, files, auth, branches, repair_types, sac_codes, pl_summary, exports, edit_approvals, notifications, trip_expense_rates, backup, settings, running_cost, maintenance_types, tyre_range_config, deletion_approvals, tyre_layout_type_config, chat, payment_requests, default_batta, maintenance_categories, usage_analytics

Base.metadata.create_all(bind=engine)

# Every startup replays each ENUM's whole history of MODIFY statements, oldest
# (narrowest) first. On a MySQL/MariaDB server NOT in strict mode — as on the
# production cPanel host — narrowing an ENUM silently rewrites every row whose
# value isn't in the new list to '' (strict mode refuses instead, which is why
# local dev never saw it). That is how deletion/edit approval requests for
# trips, drivers, trucks, etc. lost their type in production. This guard skips
# any ENUM change that would drop a value the table still holds, so a re-run of
# an old, narrower definition can never erase data again — whatever the mode.
_ENUM_MODIFY_RE = re.compile(r"ALTER TABLE\s+`?(\w+)`?\s+MODIFY COLUMN\s+`?(\w+)`?\s+ENUM\((.*?)\)", re.I | re.S)


def _enum_change_drops_data(conn, stmt: str) -> bool:
    m = _ENUM_MODIFY_RE.search(stmt)
    if not m:
        return False
    table, column, raw = m.groups()
    allowed = {v.strip().strip("'") for v in raw.split(",")}
    try:
        present = [r[0] for r in conn.execute(text(f"SELECT DISTINCT `{column}` FROM `{table}`"))]
    except Exception:
        return False  # table/column not there yet — let the statement run as before
    return any(v not in (None, "") and v not in allowed for v in present)


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
        # Device lock — comma-separated SHA-256(s) of the bound device token(s); NULL = unbound
        "ALTER TABLE staff ADD COLUMN device_hash VARCHAR(64) DEFAULT NULL",
        # Widen to hold multiple hashes (admins may bind several devices)
        "ALTER TABLE staff MODIFY COLUMN device_hash VARCHAR(1024) DEFAULT NULL",
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
        # Leave requests — who filed it (scopes the Leave Requests page to the user) and who decided it
        "ALTER TABLE leave_requests ADD COLUMN submitted_by INT NULL",
        "ALTER TABLE leave_requests ADD COLUMN decided_at DATETIME NULL",
        "ALTER TABLE leave_requests ADD COLUMN decided_by_name VARCHAR(100) NULL",
        # Delete request workflow — add Trip to resource_type enum + admin_note column
        "ALTER TABLE edit_approval_requests MODIFY COLUMN resource_type ENUM('Customer','Vendor','BookingSheet','TripSheet','TripData','Trip') NOT NULL",
        "ALTER TABLE edit_approval_requests ADD COLUMN admin_note TEXT NULL",
        # Fuel log edit requests — add FuelLog resource type + proposed_changes JSON column
        "ALTER TABLE edit_approval_requests MODIFY COLUMN resource_type ENUM('Customer','Vendor','BookingSheet','TripSheet','TripData','Trip','FuelLog') NOT NULL",
        "ALTER TABLE edit_approval_requests ADD COLUMN proposed_changes JSON NULL",
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
        # Auditor recheck workflow: corrected-and-returned sub-state (see TripRecheckEvent for history)
        "ALTER TABLE trips ADD COLUMN recheck_returned BOOLEAN NOT NULL DEFAULT FALSE",
        # Terminal "closed, verified by Audit" state — see models.py for the full state machine
        "ALTER TABLE trips ADD COLUMN audit_verified BOOLEAN NOT NULL DEFAULT FALSE",
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
        # "This Trip Only" branch reassignment — see routers/trucks.py branch-change endpoint
        "ALTER TABLE trucks ADD COLUMN temp_branch_original VARCHAR(200) NULL",
        "ALTER TABLE trucks ADD COLUMN temp_branch_trip_id VARCHAR(100) NULL",
        # NOTE: BLOB widening (MEDIUMBLOB → LONGBLOB for the 25 MB upload limit) is handled
        # by the guarded _widen_blob_columns() step below, NOT here — a blob-type change forces
        # a full table copy, so it must run once (only when needed), never on every restart.
        "ALTER TABLE trips MODIFY COLUMN trip_id VARCHAR(100) NOT NULL",
        "ALTER TABLE trip_closures ADD COLUMN closure_remarks TEXT NULL",
        # Driver name snapshot stored on trip at assignment time
        "ALTER TABLE trips ADD COLUMN driver_name VARCHAR(200) NULL",
        # Driver attendance remarks — late entry flag (set when non-admin marks attendance past the 2-day window)
        "ALTER TABLE driver_attendance_remarks ADD COLUMN is_late_entry TINYINT(1) NOT NULL DEFAULT 0",
        # Edit approvals — store who approved so requestors can see the approver's name
        "ALTER TABLE edit_approval_requests ADD COLUMN approved_by_name VARCHAR(100) NULL",
        # Trip sheet — individual driver advance breakdown (base + additional), separate from the computed total
        "ALTER TABLE trip_sheets ADD COLUMN driver_advance DECIMAL(10,2) NULL",
        "ALTER TABLE trip_sheets ADD COLUMN additional_driver_advance DECIMAL(10,2) NULL",
        # maintenance_records — who entered / source of entry (Web / App)
        "ALTER TABLE maintenance_records ADD COLUMN entered_by_name VARCHAR(100) NULL",
        "ALTER TABLE maintenance_records ADD COLUMN source VARCHAR(200) NULL",
        # deletion_approval_requests — expand resource_type to include MaintenanceRecord
        "ALTER TABLE deletion_approval_requests MODIFY COLUMN resource_type ENUM('FuelLog','MaintenanceRecord') NOT NULL",

        # tyre_range_configs — base cost per tyre type and derived cost per km
        "ALTER TABLE tyre_range_configs ADD COLUMN base_tyre_cost DECIMAL(12,2) NULL",
        "ALTER TABLE tyre_range_configs ADD COLUMN base_cost_per_km DECIMAL(10,4) NULL",
        # trips — invoice waiver flag (verified trips where invoicing is intentionally skipped)
        "ALTER TABLE trips ADD COLUMN invoice_waived TINYINT(1) NOT NULL DEFAULT 0",
        # tyre_inventory — repair_cost field removed from UI and schema
        "ALTER TABLE tyre_inventory DROP COLUMN repair_cost",
        # trucks — adblue_consumption removed: AdBlue consumption is now derived
        # live from Truck's Adblue History logs (see get_all_adblue_consumption)
        # instead of this frozen, manually-entered snapshot.
        "ALTER TABLE trucks DROP COLUMN adblue_consumption",
        # emi_records — cost per km derived from EMI amount and expected km
        "ALTER TABLE emi_records ADD COLUMN emi_cost_per_km DECIMAL(10,6) NOT NULL DEFAULT 0",
        # branches — cleaner batta daily fee
        "ALTER TABLE branches ADD COLUMN cleaner_batta_fee DECIMAL(10,2) DEFAULT 0",
        # tyre_inventory — cost per km derived from cost / range_km
        "ALTER TABLE tyre_inventory ADD COLUMN cost_per_km DECIMAL(10,6) NULL",
        # trip_sheets — driver compensation type (Normal / FIXED), carried from trip assignment
        "ALTER TABLE trip_sheets ADD COLUMN driver_compensation_type VARCHAR(50) NULL",
        # staff — token_version for JWT invalidation (force-logout / revoke all sessions)
        "ALTER TABLE staff ADD COLUMN token_version INT NOT NULL DEFAULT 0",
        # trips — RETURN TRIP driver batta already paid beforehand by default; this flag lets
        # the Commercial Manager mark it as still owed, so it counts toward Net Payable
        "ALTER TABLE trips ADD COLUMN is_batta_applicable TINYINT(1) NOT NULL DEFAULT 0",
        # trips — soft-delete marker so a deleted trip can be restored from the
        # "Deleted Trips" page instead of being gone forever
        "ALTER TABLE trips ADD COLUMN deleted_at DATETIME NULL",
        # deletion_approval_requests — non-Admin trip deletion requests (see trips/history
        # page) now go through this same system instead of edit_approval_requests, so
        # "Deleted Trips" has one consistent, admin-reviewable audit trail across all
        # deletable resource types.
        "ALTER TABLE deletion_approval_requests MODIFY COLUMN resource_type ENUM('FuelLog','MaintenanceRecord','Trip') NOT NULL",
        # chat_messages.reply_to_id — the column has existed since replies shipped, but the
        # self-referential FK the model declares (ON DELETE SET NULL) was never actually
        # added to the DB. Low-risk in practice (a reply is only ever created within the same
        # conversation as its parent, so both are always removed together by the conversation's
        # own CASCADE), but the constraint should exist to match models.py and catch anything
        # that could otherwise leave a dangling reply_to_id.
        "ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_message_reply_to "
        "FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL",
        # New role: Auditor. Widen both role-list enums that mirror staff.software_designation
        # (see the historical role-rename block below for why these two columns are kept in sync).
        "ALTER TABLE staff MODIFY COLUMN software_designation "
        "ENUM('Admin','Commercial Manager','Assistant Commercial Manager','Accounts','Maintenance','Trip Sheet Register','Yard Supervisor','Auditor') "
        "NOT NULL DEFAULT 'Trip Sheet Register'",
        "ALTER TABLE leave_requests MODIFY COLUMN category "
        "ENUM('Driver','Commercial Manager','Assistant Commercial Manager','Accounts','Maintenance','Trip Sheet Register','Yard Supervisor','Auditor') "
        "NOT NULL",
        # Air Filter R&R — odometer reading snapshot at log-entry time (distinct
        # from trucks.odometer, which a log may be entered well after the fact).
        "ALTER TABLE air_filter_records ADD COLUMN current_odometer INT NOT NULL DEFAULT 0",
        # Truck Maintenance — Update Record dialog: date -> start/end date pair,
        # plus compliance/location/performed-by fields. `date` itself is kept as
        # "Maintenance Start Date" (still the field every date-range query filters
        # on — pl_summary, exports, alerts); `description` is kept as "Remarks".
        "ALTER TABLE maintenance_records ADD COLUMN maintenance_end_date DATE NULL",
        "ALTER TABLE maintenance_records ADD COLUMN compliant ENUM('Yes','No') NULL",
        "ALTER TABLE maintenance_records ADD COLUMN maintenance_location VARCHAR(200) NULL",
        "ALTER TABLE maintenance_records ADD COLUMN maintenance_by VARCHAR(200) NULL",
        # Compliant was briefly a Yes/No enum; widened to free text per follow-up request.
        "ALTER TABLE maintenance_records MODIFY COLUMN compliant TEXT NULL",
        # Driver soft-delete — "Our Drivers" -> Delete used to hard-delete the row,
        # which cascade-destroyed attendance and (via an ORM-only delete-orphan
        # cascade) compensation/batta history. Now it only sets this flag.
        "ALTER TABLE drivers ADD COLUMN deleted_at DATETIME NULL",
        "ALTER TABLE deletion_approval_requests MODIFY COLUMN resource_type ENUM('FuelLog','MaintenanceRecord','Trip','Driver') NOT NULL",
        # "To Be Paid" payment type — verifying a trip billed this way auto-waives
        # its invoice, same as SHIFTING (see routers/trips.py verify_trip).
        "ALTER TABLE trips MODIFY COLUMN payment_type ENUM('Credit','Cash','Fuel','To Be Paid')",
        # Cargo Classification / Container Type / Cargo Weight moved from
        # CustomerPricing to CustomerDestination — a destination is now 1:1
        # with a single cargo/container/weight combo. The old columns stay on
        # customer_pricing (see backfill below) until the data is copied
        # forward, then get dropped.
        "ALTER TABLE customer_destinations ADD COLUMN cargo_classification ENUM('IMPORT','EXPORT','CFS LADEN','EMPTY','OPEN LOAD','COASTAL') NULL",
        "ALTER TABLE customer_destinations ADD COLUMN container_type ENUM('20 FEET','40 FEET','2 X 20 FEET','OPEN LOAD') NULL",
        "ALTER TABLE customer_destinations ADD COLUMN weight_in_tons ENUM('NORMAL','Up to 20 Tons','Between 20 - 25 Tons','Between 25-28 Tons','Between 28-30 Tons') NULL",
        # Backfill: only where a (customer, destination label) pair had exactly
        # ONE customer_pricing row — an unambiguous 1:1 copy. Where a destination
        # had multiple pricing rows (different cargo/container/weight combos for
        # the same place — the exact ambiguity this migration exists to remove
        # going forward), this is intentionally left NULL rather than guessing
        # which combo "wins": that data isn't lost, it's still readable on the
        # old customer_pricing columns (kept, just no longer used by the app)
        # until someone splits it into separate destination rows via the UI.
        "UPDATE customer_destinations d "
        "JOIN customer_pricing p ON p.customer_id = d.customer_id "
        "  AND p.customer_destination = COALESCE(d.destination_name, d.destination_address) "
        "JOIN (SELECT customer_id, customer_destination FROM customer_pricing "
        "      GROUP BY customer_id, customer_destination HAVING COUNT(*) = 1) uniq "
        "  ON uniq.customer_id = p.customer_id AND uniq.customer_destination = p.customer_destination "
        "SET d.cargo_classification = p.cargo_classification, "
        "    d.container_type = p.container_type, "
        "    d.weight_in_tons = p.weight_in_tons "
        "WHERE d.cargo_classification IS NULL",
        "ALTER TABLE customer_pricing ADD COLUMN commission_amount DECIMAL(10,2) NULL",
        "ALTER TABLE trips ADD COLUMN transport_commission_amount DECIMAL(10,2) NULL",
        # Edit-approval workflow (previously Customer/Vendor only, gated to the
        # "Trip Sheet Register" role) now also covers Driver and Truck edits,
        # gated to every non-Admin role — see resources/drivers & resources/fleet pages.
        "ALTER TABLE edit_approval_requests MODIFY COLUMN resource_type "
        "ENUM('Customer','Vendor','BookingSheet','TripSheet','TripData','Trip','FuelLog','Driver','Truck') NOT NULL",
        # Driver Compensation Type gains DEFAULT (fetched from Default Batta
        # Management by branch/trip category/container type) and CUSTOM
        # (freely editable) alongside Normal — FIXED is retired below.
        "ALTER TABLE trips MODIFY COLUMN driver_compensation_type ENUM('Normal','FIXED','DEFAULT','CUSTOM')",
        # FIXED retired entirely — it meant a freely-editable prefilled amount,
        # which is exactly what CUSTOM now is. Backfill existing rows before
        # narrowing the enum so no row is left holding a now-invalid value.
        "UPDATE trips SET driver_compensation_type = 'CUSTOM' WHERE driver_compensation_type = 'FIXED'",
        "ALTER TABLE trips MODIFY COLUMN driver_compensation_type ENUM('Normal','DEFAULT','CUSTOM')",
        # Truck soft-delete — "Our Fleet" -> Delete used to hard-delete the row,
        # which cascade-destroyed fuel/adblue/maintenance logs, tyre fitments,
        # compliance history, and branch history. Now it only sets this flag.
        "ALTER TABLE trucks ADD COLUMN deleted_at DATETIME NULL",
        "ALTER TABLE deletion_approval_requests MODIFY COLUMN resource_type ENUM('FuelLog','MaintenanceRecord','Trip','Driver','Truck') NOT NULL",
        # Staff soft-delete — "Our Staff" -> Delete used to hard-delete the row.
        # Now it only sets this flag, so attendance, payment/compensation history,
        # and chat all keep resolving the staff member instead of going orphaned.
        "ALTER TABLE staff ADD COLUMN deleted_at DATETIME NULL",
        "ALTER TABLE deletion_approval_requests MODIFY COLUMN resource_type ENUM('FuelLog','MaintenanceRecord','Trip','Driver','Truck','Staff') NOT NULL",
        # Customer/Vendor soft-delete — "Our Customers"/"Our Vendors" -> Delete used
        # to hard-delete the row (cascade-destroying a customer's origins,
        # destinations, pricing, and final-pricing rows). Now it only sets this flag.
        "ALTER TABLE customers ADD COLUMN deleted_at DATETIME NULL",
        "ALTER TABLE vendors ADD COLUMN deleted_at DATETIME NULL",
        "ALTER TABLE deletion_approval_requests MODIFY COLUMN resource_type ENUM('FuelLog','MaintenanceRecord','Trip','Driver','Truck','Staff','Customer','Vendor') NOT NULL",
        # emi_records — Auto-Debit Date: the calendar date the bank actually debits
        # the EMI, distinct from emi_payment_date (a day-of-month reminder).
        "ALTER TABLE emi_records ADD COLUMN auto_debit_date DATE NULL",
        # tyre_fitment_records — who performed each fit/removal, for the
        # "View Truck History" log (Tyre Rotation / Removal / Attachment).
        "ALTER TABLE tyre_fitment_records ADD COLUMN fitted_by_name VARCHAR(100) NULL",
        "ALTER TABLE tyre_fitment_records ADD COLUMN removed_by_name VARCHAR(100) NULL",
        # tyre_fitment_records — remark captured when a tyre is attached
        # (mirrors removal_remark), so "View Truck History" has something
        # real to show for Attachment rows too.
        "ALTER TABLE tyre_fitment_records ADD COLUMN fitted_remark VARCHAR(500) NULL",
        # trips — SHIFTING trips aren't billed to a customer by default, so
        # Payment & Advances stays locked; this flag lets a specific shifting
        # trip be marked billable instead, unlocking that section.
        "ALTER TABLE trips ADD COLUMN is_billing_applicable TINYINT(1) NOT NULL DEFAULT 1",
        # edit_approval_requests — set when the staff member actually saves an
        # edit under this approval, distinguishing "approved but unused" from
        # "approved and acted on" (Trip Reconciliation Completed/Pending split).
        "ALTER TABLE edit_approval_requests ADD COLUMN used_at DATETIME NULL",
        # air_filter_records — "Current Odometer" (a manually-entered snapshot
        # that went stale) is replaced by "Odometer Value for Next Change" (the
        # target reading at which the next air filter change is due). Running
        # distance/due-in are now computed live against the truck's current
        # odometer instead of a stored snapshot.
        "ALTER TABLE air_filter_records ADD COLUMN next_change_odometer INT NOT NULL DEFAULT 0",
        "ALTER TABLE air_filter_records DROP COLUMN current_odometer",
        # final_customer_pricing — the route this final price applies to, so a
        # customer can't end up with several conflicting final amounts for the
        # same route (a unique index enforces one row per customer+route below).
        "ALTER TABLE final_customer_pricing ADD COLUMN customer_destination VARCHAR(200) NULL",
        "ALTER TABLE final_customer_pricing ADD UNIQUE INDEX uq_final_pricing_customer_destination (customer_id, customer_destination)",
        # Completes the migration started above (see the big comment on
        # customer_destinations.cargo_classification etc.): CustomerPricing and
        # FinalCustomerPricing were still matching routes by a free-text label,
        # so two destinations sharing the same address text but a different
        # container type (e.g. two "CHENNAI TO HOSUR" rows, one 20FT one 40FT)
        # could never both get a price — the second was invisibly treated as
        # "already priced" the moment the first got a rate. Both now key off
        # the actual CustomerDestination row via a real FK.
        "ALTER TABLE customer_pricing ADD COLUMN customer_destination_id INT NULL",
        "ALTER TABLE customer_pricing ADD CONSTRAINT fk_customer_pricing_destination "
        "FOREIGN KEY (customer_destination_id) REFERENCES customer_destinations (id) ON DELETE SET NULL",
        "ALTER TABLE final_customer_pricing ADD COLUMN customer_destination_id INT NULL",
        "ALTER TABLE final_customer_pricing ADD CONSTRAINT fk_final_pricing_destination "
        "FOREIGN KEY (customer_destination_id) REFERENCES customer_destinations (id) ON DELETE SET NULL",
        # Swap the old text-based uniqueness for id-based — same reasoning as
        # the FK above; drop only succeeds once (idempotent via the try/except
        # around every statement in this list).
        "ALTER TABLE final_customer_pricing DROP INDEX uq_final_pricing_customer_destination",
        "ALTER TABLE final_customer_pricing ADD UNIQUE INDEX uq_final_pricing_customer_destination_id (customer_id, customer_destination_id)",
        # Backfill: only where a (customer, destination label) pair matches
        # exactly ONE customer_destinations row — an unambiguous link. Where
        # the label matches several destinations (the exact ambiguity this
        # migration removes going forward), this is intentionally left NULL
        # rather than guessing which route the historical price was really
        # for — editing that pricing row in the UI lets it be re-linked.
        "UPDATE customer_pricing p "
        "JOIN (SELECT customer_id, COALESCE(destination_name, destination_address) AS label, "
        "             MIN(id) AS only_id, COUNT(*) AS n "
        "      FROM customer_destinations GROUP BY customer_id, label) d "
        "  ON d.customer_id = p.customer_id AND d.label = p.customer_destination AND d.n = 1 "
        "SET p.customer_destination_id = d.only_id "
        "WHERE p.customer_destination_id IS NULL",
        "UPDATE final_customer_pricing p "
        "JOIN (SELECT customer_id, COALESCE(destination_name, destination_address) AS label, "
        "             MIN(id) AS only_id, COUNT(*) AS n "
        "      FROM customer_destinations GROUP BY customer_id, label) d "
        "  ON d.customer_id = p.customer_id AND d.label = p.customer_destination AND d.n = 1 "
        "SET p.customer_destination_id = d.only_id "
        "WHERE p.customer_destination_id IS NULL",
        # maintenance_base_config — removed entirely. Confirmed unused: nothing
        # ever read this value except the "Set Base Maintenance Cost" button on
        # Truck Maintenance echoing its own saved number back to the admin who
        # set it. Every real maintenance Cost/Km figure in the app (Running
        # Cost Calculator, Cost-Per-KM Ranking, P&L) comes from actual
        # MaintenanceRecord history, not this.
        "DROP TABLE IF EXISTS maintenance_base_config",
        # Combined invoices: several trips billed under one shared invoice_no
        # (see generate_combined_invoice). This flag — not invoice_no equality —
        # is the source of truth for "is this trip part of a combined invoice",
        # since some legacy trips happen to share an old-format invoice_no by
        # accident and must never be mistaken for a real combined invoice.
        "ALTER TABLE trip_invoices ADD COLUMN is_combined BOOLEAN NOT NULL DEFAULT FALSE",
        # Dedicated passport-size identity photo for staff, distinct from the
        # existing profile photo (photo_blob).
        "ALTER TABLE staff ADD COLUMN identity_image_url TEXT",
        "ALTER TABLE staff ADD COLUMN identity_image_blob LONGBLOB",
        # Soft delete for Tyre Inventory, recoverable via the new "Tyre Archive" page.
        "ALTER TABLE tyre_inventory ADD COLUMN deleted_at DATETIME NULL",
        "ALTER TABLE deletion_approval_requests MODIFY COLUMN resource_type "
        "ENUM('FuelLog','MaintenanceRecord','Trip','Driver','Truck','Staff','Customer','Vendor','TyreInventory') NOT NULL",
        # "Repair Type" on a maintenance record — populated from the selected
        # Maintenance Type category's repair types (see maintenance_categories.py).
        "ALTER TABLE maintenance_records ADD COLUMN repair_type VARCHAR(200) NULL",
        # Trip soft-delete/restore now gets logged in Trip Edit History too,
        # same as every other soft-deletable entity.
        "ALTER TABLE trip_edit_events MODIFY COLUMN event "
        "ENUM('Booking Created','Booking Edited','Trip Sheet Saved','Trip Updated',"
        "'Trip Closed','Verification Confirmed','Verification Rejected',"
        "'Trip Deleted','Trip Restored') NOT NULL",
        # Event Management — "Mark as Completed" (any participant) moves a meeting
        # from Upcoming into the History tab (own history for everyone, all-users
        # history for Admin).
        "ALTER TABLE events ADD COLUMN completed_at DATETIME NULL",
        "ALTER TABLE events ADD COLUMN completed_by INT NULL",
        "ALTER TABLE events ADD COLUMN completed_by_name VARCHAR(100) NULL",
        # Plain CREATE INDEX (MySQL 8 has no IF NOT EXISTS for indexes); a re-run
        # fails with "duplicate key name" and is skipped like every other step.
        "CREATE INDEX ix_event_completed_at ON events (completed_at)",
        # Invite inbox — every browser polls the last few minutes of room_summons.
        "CREATE INDEX ix_room_summon_created ON room_summons (created_at)",
        # Maintenance By → Vendor is now a real link to the vendor (Our Vendors →
        # View Record), not just the name typed into maintenance_by.
        "ALTER TABLE maintenance_records ADD COLUMN maintenance_by_type VARCHAR(12) NULL",
        "ALTER TABLE maintenance_records ADD COLUMN vendor_id INT NULL",
        "ALTER TABLE maintenance_records ADD CONSTRAINT fk_maintenance_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON DELETE SET NULL",
        "CREATE INDEX ix_maintenance_records_vendor_id ON maintenance_records (vendor_id)",
        # Activity Log — per-employee timeline/drill-down filters by user_name.
        "CREATE INDEX ix_activity_name_time ON activity_events (user_name, created_at)",
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
                if _enum_change_drops_data(conn, stmt):
                    continue
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

def _chat_column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column}).scalar())


def _run_chat_migrations():
    """Canaan Chat schema, applied idempotently on top of create_all.

    create_all builds the three chat tables on a fresh database but never alters
    existing ones, so this handles installations that already carry an earlier
    draft of the chat schema — which stored message bodies in a plaintext `body`
    TEXT column. That column is migrated into the encrypted `ciphertext` envelope
    and then dropped, so no readable message text is left behind in the database.

    Everything here is in-place and re-runnable. There is deliberately no DROP
    TABLE: a startup path must never be able to destroy a populated table.
    """
    with engine.connect() as conn:
        # -- 1. Add the current columns (ignored when already present) ---------
        additive = [
            "ALTER TABLE chat_conversations ADD COLUMN kind ENUM('direct','group') NOT NULL DEFAULT 'direct'",
            "ALTER TABLE chat_conversations ADD COLUMN title VARCHAR(150) NULL",
            "ALTER TABLE chat_conversations ADD COLUMN direct_key VARCHAR(64) NULL",
            "ALTER TABLE chat_conversations ADD COLUMN last_message_at DATETIME NULL",
            "ALTER TABLE chat_conversations ADD COLUMN updated_at DATETIME NULL",
            # Snapshot of created_by's name at creation time — created_by itself goes
            # NULL if that staff member is later hard-deleted from "Our Staff"; this
            # keeps "who created it" readable regardless.
            "ALTER TABLE chat_conversations ADD COLUMN created_by_name VARCHAR(100) NULL",
            # Group icon — groups only, added once photo upload shipped.
            "ALTER TABLE chat_conversations ADD COLUMN photo_url VARCHAR(255) NULL",
            "ALTER TABLE chat_conversations ADD COLUMN photo_blob LONGBLOB NULL",
            "ALTER TABLE chat_participants ADD COLUMN role ENUM('member','admin') NOT NULL DEFAULT 'member'",
            "ALTER TABLE chat_participants ADD COLUMN last_read_message_id INT NOT NULL DEFAULT 0",
            "ALTER TABLE chat_participants ADD COLUMN muted BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE chat_participants ADD COLUMN left_at DATETIME NULL",
            # Nullable for now: it is backfilled below, then tightened to NOT NULL.
            "ALTER TABLE chat_messages ADD COLUMN ciphertext MEDIUMBLOB NULL",
            "ALTER TABLE chat_messages ADD COLUMN content_type VARCHAR(20) NOT NULL DEFAULT 'text'",
            "ALTER TABLE chat_messages ADD COLUMN reply_to_id INT NULL",
            # Snapshot of the sender's name at send time — see chat_conversations.created_by_name above.
            "ALTER TABLE chat_messages ADD COLUMN sender_name VARCHAR(100) NULL",
            # Voice notes — mime type + duration, added once WhatsApp-style recording shipped.
            "ALTER TABLE chat_messages ADD COLUMN media_mime VARCHAR(100) NULL",
            "ALTER TABLE chat_messages ADD COLUMN media_duration_ms INT NULL",
            # Images/files — original filename + byte size, added once attachments shipped.
            "ALTER TABLE chat_messages ADD COLUMN media_filename VARCHAR(255) NULL",
            "ALTER TABLE chat_messages ADD COLUMN media_size INT NULL",
            # Payment notes — approve/reject decision, added once that workflow shipped.
            "ALTER TABLE chat_messages ADD COLUMN payment_status VARCHAR(20) NULL",
            "ALTER TABLE chat_messages ADD COLUMN payment_decided_by INT NULL",
            "ALTER TABLE chat_messages ADD COLUMN payment_decided_by_name VARCHAR(100) NULL",
            "ALTER TABLE chat_messages ADD COLUMN payment_decided_at DATETIME NULL",
            # Finance's second-stage decision, added once the Payment Requests page shipped.
            "ALTER TABLE chat_messages ADD COLUMN finance_status VARCHAR(20) NULL",
            "ALTER TABLE chat_messages ADD COLUMN finance_decided_by INT NULL",
            "ALTER TABLE chat_messages ADD COLUMN finance_decided_by_name VARCHAR(100) NULL",
            "ALTER TABLE chat_messages ADD COLUMN finance_decided_at DATETIME NULL",
            # "Mark as Paid" — a separate, later action from "Approve for Payment"
            # above, added once the Unpaid/Paid split shipped.
            "ALTER TABLE chat_messages ADD COLUMN paid_by INT NULL",
            "ALTER TABLE chat_messages ADD COLUMN paid_by_name VARCHAR(100) NULL",
            "ALTER TABLE chat_messages ADD COLUMN paid_at DATETIME NULL",
            # Proof-of-payment photo, required to mark a request paid.
            "ALTER TABLE chat_messages ADD COLUMN paid_proof_ciphertext LONGBLOB NULL",
            "ALTER TABLE chat_messages ADD COLUMN paid_proof_mime VARCHAR(100) NULL",
            "ALTER TABLE chat_messages ADD COLUMN edited_at DATETIME NULL",
            "ALTER TABLE chat_messages ADD COLUMN deleted_at DATETIME NULL",
        ]
        for stmt in additive:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        conn.commit()

        # Backfill: any payment note created before this migration added
        # payment_status (i.e. while the feature was cosmetic-only, before the
        # approve/reject workflow shipped) would otherwise sit permanently
        # un-actionable — neither party could ever decide it, since the UI's
        # "pending" check would never match a NULL. One run, then a no-op.
        try:
            conn.execute(text(
                "UPDATE chat_messages SET payment_status = 'pending' "
                "WHERE content_type = 'payment' AND payment_status IS NULL AND deleted_at IS NULL"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Backfill name snapshots for rows written before these columns existed,
        # from whichever staff records are still alive today. One-shot and
        # best-effort: a staff member already deleted before this backfill runs
        # is unrecoverable (there was never anywhere the name could have come
        # from), but going forward every new row is written with its snapshot
        # already in place (see routers/chat.py, routers/payment_requests.py).
        backfill_snapshots = [
            "UPDATE chat_conversations c JOIN staff s ON s.id = c.created_by "
            "SET c.created_by_name = s.name WHERE c.created_by_name IS NULL",
            "UPDATE chat_messages m JOIN staff s ON s.id = m.sender_id "
            "SET m.sender_name = s.name WHERE m.sender_name IS NULL",
            "UPDATE chat_messages m JOIN staff s ON s.id = m.payment_decided_by "
            "SET m.payment_decided_by_name = s.name WHERE m.payment_decided_by_name IS NULL",
            "UPDATE chat_messages m JOIN staff s ON s.id = m.finance_decided_by "
            "SET m.finance_decided_by_name = s.name WHERE m.finance_decided_by_name IS NULL",
            "UPDATE chat_messages m JOIN staff s ON s.id = m.paid_by "
            "SET m.paid_by_name = s.name WHERE m.paid_by_name IS NULL",
        ]
        for stmt in backfill_snapshots:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()

        # -- 2. Carry legacy values across before the old columns go ----------
        if _chat_column_exists(conn, "chat_conversations", "is_group"):
            try:
                conn.execute(text(
                    "UPDATE chat_conversations SET kind = IF(is_group = 1, 'group', 'direct')"
                ))
            except Exception:
                pass
        if _chat_column_exists(conn, "chat_conversations", "name"):
            try:
                conn.execute(text(
                    "UPDATE chat_conversations SET title = name WHERE title IS NULL"
                ))
            except Exception:
                pass
        conn.commit()

        # Encrypt any plaintext bodies from the earlier draft schema. Done in
        # Python because only the app holds the key. Batched so a large table
        # cannot exhaust memory.
        if _chat_column_exists(conn, "chat_messages", "body"):
            from chat_crypto import encrypt_message
            while True:
                rows = conn.execute(text(
                    "SELECT id, conversation_id, sender_id, body FROM chat_messages "
                    "WHERE ciphertext IS NULL AND body IS NOT NULL LIMIT 500"
                )).fetchall()
                if not rows:
                    break
                for msg_id, conv_id, sender_id, body in rows:
                    try:
                        envelope = encrypt_message(
                            body or "", conversation_id=conv_id, sender_id=sender_id
                        )
                    except Exception:
                        continue
                    conn.execute(
                        text("UPDATE chat_messages SET ciphertext = :ct WHERE id = :id"),
                        {"ct": envelope, "id": msg_id},
                    )
                conn.commit()
            _log.info("Canaan Chat: migrated legacy plaintext message bodies to encrypted storage.")

        # Any row still without a body (shouldn't happen) gets an empty envelope
        # so the NOT NULL tightening below cannot fail.
        try:
            from chat_crypto import encrypt_message
            orphans = conn.execute(text(
                "SELECT id, conversation_id, sender_id FROM chat_messages WHERE ciphertext IS NULL"
            )).fetchall()
            for msg_id, conv_id, sender_id in orphans:
                conn.execute(
                    text("UPDATE chat_messages SET ciphertext = :ct WHERE id = :id"),
                    {"ct": encrypt_message("", conversation_id=conv_id, sender_id=sender_id), "id": msg_id},
                )
            conn.commit()
        except Exception:
            pass

        # -- 3. Retire the legacy columns -------------------------------------
        for table, column in (
            ("chat_messages", "body"),          # plaintext — must not survive
            ("chat_conversations", "is_group"),
            ("chat_conversations", "name"),
        ):
            if _chat_column_exists(conn, table, column):
                try:
                    conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
                except Exception:
                    pass
        conn.commit()

        # -- 4. Constraints and indexes ---------------------------------------
        # A deleted staff member must not take their messages out of everyone
        # else's threads, so sender_id becomes nullable with ON DELETE SET NULL
        # (the earlier draft had NOT NULL + ON DELETE CASCADE).
        try:
            fk = conn.execute(text(
                "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_messages' "
                "AND COLUMN_NAME = 'sender_id' AND REFERENCED_TABLE_NAME = 'staff'"
            )).scalar()
            if fk:
                conn.execute(text(f"ALTER TABLE chat_messages DROP FOREIGN KEY `{fk}`"))
            conn.execute(text("ALTER TABLE chat_messages MODIFY COLUMN sender_id INT NULL"))
            conn.execute(text(
                "ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_message_sender "
                "FOREIGN KEY (sender_id) REFERENCES staff (id) ON DELETE SET NULL"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        final = [
            # Widening MEDIUMBLOB -> LONGBLOB is safe on a populated table: MySQL
            # copies every existing byte unchanged, no truncation. Needed so a
            # 25 MB attachment (the app-wide upload standard) fits the envelope.
            "ALTER TABLE chat_messages MODIFY COLUMN ciphertext LONGBLOB NOT NULL",
            "ALTER TABLE chat_participants MODIFY COLUMN last_read_message_id INT NOT NULL DEFAULT 0",
            # Indexes behind the two hot paths (conversation list, history paging).
            "CREATE INDEX ix_chat_message_conv_id ON chat_messages (conversation_id, id)",
            "CREATE INDEX ix_chat_participant_staff ON chat_participants (staff_id, conversation_id)",
            "CREATE INDEX ix_chat_conversations_last_message_at ON chat_conversations (last_message_at)",
            # Makes "open a DM with X" idempotent under concurrent requests.
            "CREATE UNIQUE INDEX uq_chat_direct_key ON chat_conversations (direct_key)",
            "ALTER TABLE chat_participants ADD CONSTRAINT uq_chat_participant UNIQUE (conversation_id, staff_id)",
            # A deleted staff member must not strand a payment note's decision
            # metadata pointing at a nonexistent row — same ON DELETE SET NULL
            # rule already applied to sender_id above.
            "ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_message_payment_decided_by "
            "FOREIGN KEY (payment_decided_by) REFERENCES staff (id) ON DELETE SET NULL",
            "ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_message_finance_decided_by "
            "FOREIGN KEY (finance_decided_by) REFERENCES staff (id) ON DELETE SET NULL",
            "ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_message_paid_by "
            "FOREIGN KEY (paid_by) REFERENCES staff (id) ON DELETE SET NULL",
        ]
        for stmt in final:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        conn.commit()


def _run_staff_history_migrations():
    """Make sure historical records survive a staff member being hard-deleted
    from "Our Staff" (routers/staff.py's DELETE is a real DELETE, not a
    deactivation). Two independent fixes:

    1. staff_attendance.staff_id was ON DELETE CASCADE — deleting a staff row
       destroyed their entire attendance history outright. Switched to SET
       NULL, with a staff_name snapshot so the record still reads sensibly
       once staff_id is gone.
    2. compensation_transactions.person_id has no FK at all (shared between
       drivers and staff), so it was never at risk of being deleted or nulled
       — but it also never stored a name, so once the driver/staff record was
       later removed there was no way left to display who the transaction was
       for. Added person_name for the same reason.

    Idempotent and re-run on every startup, like _run_chat_migrations above.
    """
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE staff_attendance ADD COLUMN staff_name VARCHAR(100) NULL"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE compensation_transactions ADD COLUMN person_name VARCHAR(100) NULL"))
        except Exception:
            pass
        for ddl in (
            "ALTER TABLE tyre_inventory ADD COLUMN retread_flagged_at DATETIME NULL",
            "ALTER TABLE tyre_inventory ADD COLUMN retread_flagged_by VARCHAR(100) NULL",
            "ALTER TABLE tyre_inventory ADD COLUMN discarded_at DATETIME NULL",
            "ALTER TABLE tyre_inventory ADD COLUMN discarded_by VARCHAR(100) NULL",
            "ALTER TABLE tyre_inventory ADD COLUMN discard_reason TEXT NULL",
            "ALTER TABLE staff_attendance ADD COLUMN auto_closed BOOLEAN NOT NULL DEFAULT 0",
            "ALTER TABLE staff_attendance ADD COLUMN closed_by VARCHAR(10) NULL",
            "ALTER TABLE trips ADD COLUMN use_yard_cfs BOOLEAN NOT NULL DEFAULT 0",
            "ALTER TABLE trips ADD COLUMN use_custom_route BOOLEAN NOT NULL DEFAULT 0",
            "ALTER TABLE trips ADD COLUMN customer_destination_id INT NULL",
            "ALTER TABLE deletion_approval_requests MODIFY COLUMN resource_type "
            "ENUM('FuelLog','MaintenanceRecord','Trip','Driver','Truck','Staff','Customer','Vendor','TyreInventory','CfsYardEntry') NOT NULL",
            "ALTER TABLE tyre_movement_events ADD COLUMN retread_done_by VARCHAR(200) NULL",
            "ALTER TABLE activity_minutes ADD COLUMN first_at DATETIME NULL",
            "ALTER TABLE activity_minutes ADD COLUMN last_at DATETIME NULL",
            "ALTER TABLE cfs_yard_entries ADD COLUMN deleted_at DATETIME NULL",
            "ALTER TABLE deletion_approval_requests ADD COLUMN requester_seen_at DATETIME NULL",
            "ALTER TABLE edit_approval_requests ADD COLUMN requester_seen_at DATETIME NULL",
        ):
            # Re-running is expected on every deploy; only "already exists" is ignored.
            if _enum_change_drops_data(conn, ddl):
                continue
            try:
                conn.execute(text(ddl))
            except Exception as exc:
                if "Duplicate column" not in str(exc):
                    raise
        # Index + FK for trips.customer_destination_id — "already exists" on
        # every later start, so each is tried on its own and failures ignored.
        for ddl in (
            "CREATE INDEX ix_trips_customer_destination_id ON trips (customer_destination_id)",
            "ALTER TABLE trips ADD CONSTRAINT fk_trips_customer_destination FOREIGN KEY (customer_destination_id) "
            "REFERENCES customer_destinations(id) ON DELETE SET NULL",
        ):
            try:
                conn.execute(text(ddl))
            except Exception:
                pass
        # cfs_yard_entries used to enforce (kind, name) uniqueness at the DB
        # level, which would block re-adding a name after it's soft-deleted
        # (restore/archive flow below) — dropped in favor of the app-level
        # check in routers/cfs_yard.py that already ignores deleted rows.
        try:
            conn.execute(text("ALTER TABLE cfs_yard_entries DROP INDEX uq_cfs_yard_kind_name"))
        except Exception:
            pass
        # Seed the shared Manage Tyres remark pills with the original defaults.
        # INSERT IGNORE skips anything already present, so re-running is safe.
        for scenario, texts in (
            ("Attachment", ["New Tyre Fitted", "Retreaded Tyre Reused", "Replacement", "Spare Fitted"]),
            ("Removal", ["Puncture", "Powder Work", "LHS to RHS to LHS", "Tyre Side Change", "Retreading",
                         "Tyre Busted", "Tyre Air Fault", "Tyre Side Wall Crack", "Speedometer Issue", "Tyre Rotation"]),
            ("Swap", ["Tyre Rotation", "LHS to RHS to LHS", "Tyre Side Change", "Wear Balancing", "Preventive Rotation"]),
        ):
            for remark in texts:
                conn.execute(text(
                    "INSERT IGNORE INTO tyre_remark_presets (scenario, `text`, created_by, created_at) "
                    "VALUES (:scenario, :remark, 'System', NOW())"
                ), {"scenario": scenario, "remark": remark})
        # Condition follows retread_count (0 = New, 1+ = Rethreaded). Idempotent.
        conn.execute(text(
            "UPDATE tyre_inventory SET `condition` = CASE WHEN retread_count > 0 THEN 'Rethreaded' ELSE 'New' END"
        ))
        # Seed cfs_yard_entries with the directory that used to be hardcoded in
        # lib/lane-places.ts — one-time. cfs_yard_entries has no unique
        # constraint on (kind, name) (dropped above to allow reusing a name
        # after a soft delete), so INSERT IGNORE can no longer dedupe this —
        # checked against existing (kind, name) pairs in Python instead.
        existing_cfs_yard_pairs = {
            (row[0], row[1].strip().lower())
            for row in conn.execute(text("SELECT kind, name FROM cfs_yard_entries")).fetchall()
        }
        for kind, names in (
            ("CFS", [
                "A.S. Shipping Agencies Pvt. Ltd. – CFS", "Central Warehousing Corporation – CFS",
                "Chola Logistiks Pvt. Ltd. – CFS", "Container Corporation of India Ltd. – CFS",
                "DahNay Tuticorin Terminal Pvt. Ltd. – CFS", "Diamond CFS Park",
                "DP World Multimodal Logistics Pvt. Ltd. – CFS", "Hari & Co. – CFS",
                "Indev Infra Pvt. Ltd. – CFS", "KSPS CFS Park Pvt. Ltd.",
                "Prompt Terminals Pvt. Ltd. – CFS", "Raja Agencies – CFS", "Sans CFS Ltd.",
                "SEC Services Pvt. Ltd. – CFS", "SICAL Multimodal & Rail Transport Ltd. – CFS",
                "St. John Freight Systems Ltd. – ICD Division", "Vilsons CFS",
            ]),
            ("YARD", [
                "St Anthony Empty Container Yard", "Sravan Yard (Maersk Yard)", "Zircon Marine 1",
                "Zircon Marine 2", "Zircon Marine 3", "Gloden Horn Container MSC Yard",
                "Gloden Horn Container CMCA Yard", "ACT Container Yard", "Blue Berkhs Container Yard",
                "Indu Bharat Container Yard", "Blue Ocean Yard", "Vilsons Container Yard",
                "Empezar Container Yard", "Dimaond Container Yard",
            ]),
        ):
            for name in names:
                key = (kind, name.strip().lower())
                if key in existing_cfs_yard_pairs:
                    continue
                conn.execute(text(
                    "INSERT INTO cfs_yard_entries (kind, name, version) VALUES (:kind, :name, 1)"
                ), {"kind": kind, "name": name})
                existing_cfs_yard_pairs.add(key)

        # Seed Vendor Categories — used to require running
        # scripts/add_vendor_categories.py by hand after every fresh deploy.
        # vendor_categories.name is UNIQUE, so INSERT IGNORE skips anything
        # already present (including anything since renamed), safe to re-run.
        for name in (
            "TYRE RETREADER", "ADBLUE VENDOR", "SPARES",
            "MECHANICAL & ELECTRICAL WORKSHOP", "TRANSPORT CONTRACTOR",
            "ACCIDENT WORK", "FC WORK", "TOLL", "ENGINE WORKSHOP",
        ):
            conn.execute(text(
                "INSERT IGNORE INTO vendor_categories (name, version, created_at, updated_at) "
                "VALUES (:name, 1, NOW(), NOW())"
            ), {"name": name})

        # Seed Maintenance Categories — used to require running
        # scripts/add_maintenance_categories.py by hand. Same UNIQUE-name
        # dedupe as Vendor Categories above.
        for name in (
            "ACCIDENT WORK", "AMC", "BRAKE SYSTEM", "CABIN", "CHASSIS & AXLE",
            "DIFFERENTIAL", "ELECTRICAL", "ENGINE", "FABRICATION & WELDING WORK",
            "FC WORK", "NEUMATIC", "STEERING UNIT", "SUSPENSION WORK", "TRANSVISION",
        ):
            conn.execute(text(
                "INSERT IGNORE INTO maintenance_categories (name, version, created_at, updated_at) "
                "VALUES (:name, 1, NOW(), NOW())"
            ), {"name": name})
        conn.commit()

        # Seed Maintenance Category Repairs under the categories just above —
        # used to require running scripts/add_maintenance_category_repairs.py
        # by hand. maintenance_category_repairs has no unique constraint on
        # name (repairs are only unique per category), so dedupe here against
        # existing (category_id, name) pairs instead of relying on INSERT IGNORE.
        category_ids_by_name = {
            row[0]: row[1]
            for row in conn.execute(text("SELECT name, id FROM maintenance_categories")).fetchall()
        }
        existing_repair_pairs = {
            (row[0], row[1].strip().lower())
            for row in conn.execute(text("SELECT category_id, name FROM maintenance_category_repairs")).fetchall()
        }
        for category_name, repair_names in (
            ("CABIN", ["Cabin Lift Jockey", "Cabin Front Shock Absorber", "Cabin Rear Shock Absorber", "First Axle Shock Absorber"]),
            ("ENGINE", ["Engine Oil Change – Local", "Engine Oil – Company Service", "Half Engine Work", "Full Engine Work", "Nozzle Work", "Diesel Feed Pump"]),
            ("TRANSVISION", ["Gearbox Work", "Propeller Shaft", "Oil Service", "Clutch Pedal", "Clutch Booster", "Clutch Work"]),
            ("DIFFERENTIAL", ["Crown & Pinion Work", "Axle Shaft", "Oil Service"]),
            ("NEUMATIC", ["Air Dryer", "Air Compressor", "Dual Brake Valve", "RG2 Valve", "Load Sensing Valve", "Distributor Valve", "Quick Release Valve", "Lift Axle Control Valve", "Air Hose", "Hose Crimping Work"]),
            ("SUSPENSION WORK", ["Pin & Bush Work", "Leaf Spring Work", "Cabin Shock Absorber", "Lift Axle Shock Absorber"]),
            ("STEERING UNIT", ["Power Steering Pump", "Steering Box", "Steering Column", "Oil Service"]),
            ("ELECTRICAL", ["New Starter Motor", "Starter Motor O/H", "New Alternator", "Alternator O/H", "Wiring Work", "Light Fitting Work", "Relay", "EDC Work", "New Electrical Line Installation"]),
            ("BRAKE SYSTEM", ["Brake Master Cylinder", "Brake Lining", "Brake Booster Cylinder", "Brake Pedal Cylinder"]),
            ("CHASSIS & AXLE", ["Chassis Bend Checkup", "Axle Work", "Hub Grease"]),
            ("ACCIDENT WORK", ["Major", "Minor"]),
            ("FABRICATION & WELDING WORK", ["Fabrication Work", "Welding Work"]),
            ("FC WORK", ["Water Service", "Painting Work", "RTO Work"]),
        ):
            cat_id = category_ids_by_name.get(category_name)
            if cat_id is None:
                continue
            for repair_name in repair_names:
                key = (cat_id, repair_name.strip().lower())
                if key in existing_repair_pairs:
                    continue
                conn.execute(text(
                    "INSERT INTO maintenance_category_repairs (category_id, name, version, created_at, updated_at) "
                    "VALUES (:cat_id, :name, 1, NOW(), NOW())"
                ), {"cat_id": cat_id, "name": repair_name})
                existing_repair_pairs.add(key)
        conn.commit()

        # Backfill names for rows written before these columns existed, from
        # whichever staff/driver records are still alive today (best-effort —
        # see the equivalent note in _run_chat_migrations).
        backfill = [
            "UPDATE staff_attendance a JOIN staff s ON s.id = a.staff_id "
            "SET a.staff_name = s.name WHERE a.staff_name IS NULL",
            "UPDATE compensation_transactions t JOIN staff s ON s.id = t.person_id "
            "SET t.person_name = s.name WHERE t.person_type = 'staff' AND t.person_name IS NULL",
            "UPDATE compensation_transactions t JOIN drivers d ON d.id = t.person_id "
            "SET t.person_name = d.name WHERE t.person_type = 'driver' AND t.person_name IS NULL",
        ]
        for stmt in backfill:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()

        # staff_attendance.staff_id: CASCADE -> SET NULL, and nullable so a
        # deleted staff member's rows survive instead of vanishing with them.
        try:
            fk = conn.execute(text(
                "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_attendance' "
                "AND COLUMN_NAME = 'staff_id' AND REFERENCED_TABLE_NAME = 'staff'"
            )).scalar()
            if fk:
                conn.execute(text(f"ALTER TABLE staff_attendance DROP FOREIGN KEY `{fk}`"))
            conn.execute(text("ALTER TABLE staff_attendance MODIFY COLUMN staff_id INT NULL"))
            conn.execute(text(
                "ALTER TABLE staff_attendance ADD CONSTRAINT fk_staff_attendance_staff "
                "FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE SET NULL"
            ))
            conn.commit()
        except Exception:
            conn.rollback()


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
_run_chat_migrations()
_run_staff_history_migrations()
_widen_blob_columns()


def _backfill_activity_anonymous():
    try:
        import activity_tracker
        fixed = activity_tracker.backfill_anonymous_logins()
        if fixed:
            print(f"[migration] activity log: attributed {fixed} previously-anonymous login/logout event(s)")
    except Exception as e:
        print(f"[migration] skip activity backfill: {e}")


_backfill_activity_anonymous()


def _backfill_maintenance_vendor_links():
    """Older maintenance records saved Maintenance By as plain text. Link each
    one to a vendor when its text matches exactly ONE vendor's name (ignoring
    case/spaces) — so it shows under Our Vendors → View Record. Ambiguous or
    unmatched records are left untouched rather than guessed. Only looks at
    records never linked or classified, so it's a cheap no-op once done."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        candidates = (
            db.query(models.MaintenanceRecord)
            .filter(models.MaintenanceRecord.vendor_id.is_(None),
                    models.MaintenanceRecord.maintenance_by_type.is_(None),
                    models.MaintenanceRecord.maintenance_by.isnot(None))
            .all()
        )
        if not candidates:
            return
        by_name: dict[str, list[int]] = {}
        for vid, name in db.query(models.Vendor.id, models.Vendor.name).filter(models.Vendor.deleted_at.is_(None)):
            by_name.setdefault(" ".join((name or "").split()).lower(), []).append(vid)
        linked = 0
        for r in candidates:
            ids = by_name.get(" ".join(r.maintenance_by.split()).lower(), [])
            if len(ids) == 1:
                r.vendor_id = ids[0]
                r.maintenance_by_type = "Vendor"
                linked += 1
        db.commit()
        if linked:
            print(f"[migration] maintenance records: linked {linked} to their vendor by name")
    except Exception as e:
        db.rollback()
        print(f"[migration] skip maintenance vendor backfill: {e}")
    finally:
        db.close()


_backfill_maintenance_vendor_links()


def _repair_blank_approval_types():
    """Repair approval requests whose resource_type was wiped to '' by the old
    ENUM-narrowing migrations (see _enum_change_drops_data). A row only gets a
    type back when exactly ONE candidate type has a record with that
    resource_id whose name matches the saved resource_name — otherwise it is
    left blank rather than guessed.

    Deletion requests that were marked Approved while blank never actually
    deleted anything (no branch matched ''), so the record is still live. Those
    are re-opened to Pending — with a note — for an Admin to approve again;
    nothing is deleted automatically here."""
    from database import SessionLocal

    def norm(v) -> str:
        return " ".join(str(v or "").split()).lower()

    def has(name: str, *keys) -> bool:
        return any(norm(k) and norm(k) in name for k in keys)

    def matches(db, rtype: str, rid: int, name: str):
        """(matched, record) for one candidate type."""
        if rtype == "Trip":
            r = db.get(models.Trip, rid)
            return bool(r) and (name in (norm(r.booking_reference_no), norm(r.trip_id)) or has(name, r.booking_reference_no)), r
        if rtype == "Driver":
            r = db.get(models.Driver, rid)
            return bool(r) and has(name, r.name, r.driver_id), r
        if rtype == "Truck":
            r = db.get(models.Truck, rid)
            return bool(r) and has(name, r.registration_number, r.truck_id), r
        if rtype == "Staff":
            r = db.get(models.Staff, rid)
            return bool(r) and has(name, r.name, r.staff_id), r
        if rtype == "Customer":
            r = db.get(models.Customer, rid)
            return bool(r) and has(name, r.name), r
        if rtype == "Vendor":
            r = db.get(models.Vendor, rid)
            return bool(r) and has(name, r.name), r
        if rtype == "TyreInventory":
            r = db.get(models.TyreInventory, rid)
            return bool(r) and has(name, r.tyre_number), r
        if rtype == "CfsYardEntry":
            r = db.get(models.CfsYardEntry, rid)
            return bool(r) and has(name, r.name), r
        if rtype == "FuelLog":
            r = db.get(models.FuelLog, rid)
            return bool(r) and name.startswith("fuel log"), r
        return False, None

    targets = (
        ("deletion_approval_requests",
         ("Trip", "Driver", "Truck", "Staff", "Customer", "Vendor", "TyreInventory", "CfsYardEntry")),
        ("edit_approval_requests", ("Trip", "FuelLog", "Driver", "Truck")),
    )
    db = SessionLocal()
    try:
        for table, candidates in targets:
            rows = db.execute(text(
                f"SELECT id, resource_id, resource_name, status FROM {table} "
                "WHERE resource_type = '' OR resource_type IS NULL"
            )).fetchall()
            fixed = reopened = 0
            unresolved = []
            for row_id, rid, rname, status in rows:
                name = norm(rname)
                hits = []
                for t in candidates:
                    ok, rec = matches(db, t, rid, name)
                    if ok:
                        hits.append((t, rec))
                if len(hits) != 1:
                    unresolved.append(row_id)
                    continue
                rtype, rec = hits[0]
                # Conditional updates: on production several app processes can
                # run this at the same moment — only the first one applies.
                res = db.execute(text(
                    f"UPDATE {table} SET resource_type = :t WHERE id = :i AND (resource_type = '' OR resource_type IS NULL)"
                ), {"t": rtype, "i": row_id})
                if not res.rowcount:
                    continue
                fixed += 1
                if (table == "deletion_approval_requests" and status == "Approved"
                        and getattr(rec, "deleted_at", "n/a") is None):
                    db.execute(text(
                        "UPDATE deletion_approval_requests SET status = 'Pending', approved_at = NULL, "
                        "admin_note = CONCAT(COALESCE(CONCAT(admin_note, ' — '), ''), :note, "
                        "COALESCE(CONCAT(' (first approved by ', approved_by_name, ')'), '')), "
                        "approved_by_name = NULL WHERE id = :i AND status = 'Approved'"
                    ), {"i": row_id, "note": "Re-opened automatically: an earlier approval didn't take effect "
                                            "because of a data bug. Please approve it again."})
                    reopened += 1
            db.commit()
            if fixed or unresolved:
                print(f"[migration] {table}: restored the type on {fixed} request(s), "
                      f"re-opened {reopened} approval(s) that never took effect"
                      + (f"; could not identify {len(unresolved)} (ids {unresolved[:20]})" if unresolved else ""))
    except Exception as e:
        db.rollback()
        print(f"[migration] skip approval type repair: {e}")
    finally:
        db.close()


_repair_blank_approval_types()


def _resync_pricing_route_labels():
    """Routes renamed before the destination-update endpoint re-synced labels
    left Customer Pricing / Final Customer Pricing showing the old route name.
    Copy the linked route's current label back onto them. A single UPDATE
    per table that touches nothing once the labels already agree."""
    total = 0
    try:
        with engine.begin() as conn:
            for table in ("customer_pricing", "final_customer_pricing"):
                total += conn.execute(text(
                    f"UPDATE `{table}` p JOIN customer_destinations d ON d.id = p.customer_destination_id "
                    "SET p.customer_destination = COALESCE(NULLIF(d.destination_name, ''), d.destination_address) "
                    "WHERE NOT (p.customer_destination <=> COALESCE(NULLIF(d.destination_name, ''), d.destination_address))"
                )).rowcount
    except Exception as e:
        print(f"[migration] pricing label re-sync skipped: {e}")
        return
    if total:
        print(f"[migration] re-synced the route name on {total} pricing row(s)")


_resync_pricing_route_labels()


_CONTAINER_TYPE_TO_SPEC = {
    "20 FEET": "20 FT CONTAINER",
    "40 FEET": "40 FT CONTAINER",
    "2 X 20 FEET": "2 X 20 FEET CONTAINERS",
    "OPEN LOAD": "OPEN LOAD CARGO",
}


def _backfill_trip_route_links():
    """Trips saved before trips.customer_destination_id existed only kept the
    route's text. Link each to its customer's route using the same test the
    trip form uses (origin, destination name, cargo, container, weight) — and
    only when exactly ONE route matches; ambiguous or unmatched trips stay
    unlinked rather than guessed. Only looks at unlinked trips, so it's a
    cheap no-op once done."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        trips = (
            db.query(models.Trip)
            .filter(models.Trip.customer_destination_id.is_(None),
                    models.Trip.customer_id.isnot(None),
                    models.Trip.use_custom_route.is_(False),
                    models.Trip.destination.isnot(None),
                    models.Trip.trip_category.notin_(["RETURN TRIP", "SHIFTING"]))
            .all()
        )
        if not trips:
            return
        routes_by_customer: dict[int, list] = {}
        for d in db.query(models.CustomerDestination).filter(
            models.CustomerDestination.customer_id.in_({t.customer_id for t in trips})
        ):
            routes_by_customer.setdefault(d.customer_id, []).append(d)

        def matches(t, d) -> bool:
            if not (d.origin_state and d.destination_state):
                return False  # not shown as an Available Route
            # Same label the trip form builds (destinationName ?? destinationAddress, then state).
            label = d.destination_name if d.destination_name is not None else d.destination_address
            if (label or d.destination_state) != t.destination:
                return False
            if t.cargo_classification != "EXPORT" and (d.origin_address or d.origin_state) != t.origin:
                return False
            if d.cargo_classification and d.cargo_classification != t.cargo_classification:
                return False
            if d.container_type and _CONTAINER_TYPE_TO_SPEC.get(d.container_type, "") != t.container_specification:
                return False
            if d.weight_in_tons and d.weight_in_tons != t.cargo_weight:
                return False
            return True

        linked = ambiguous = 0
        for t in trips:
            hits = [d for d in routes_by_customer.get(t.customer_id, []) if matches(t, d)]
            if len(hits) == 1:
                t.customer_destination_id = hits[0].id
                linked += 1
            elif len(hits) > 1:
                ambiguous += 1
        db.commit()
        if linked or ambiguous:
            print(f"[migration] trips: linked {linked} to their customer route; {ambiguous} matched several routes and were left unlinked")
    except Exception as e:
        db.rollback()
        print(f"[migration] trip route backfill skipped: {e}")
    finally:
        db.close()


_backfill_trip_route_links()

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

def _reset_all_device_locks():
    """One-shot bulk reset of every staff device binding, triggered from .env.

    Set RESET_ALL_DEVICE_LOCKS=true and restart to clear device_hash for all
    staff (everyone can then re-bind on their next login). Remember to set it
    back to false, otherwise every restart wipes all bindings again.
    """
    if os.getenv("RESET_ALL_DEVICE_LOCKS", "false").strip().lower() not in ("1", "true", "yes", "on"):
        return
    try:
        with engine.begin() as conn:
            result = conn.execute(text("UPDATE staff SET device_hash = NULL WHERE device_hash IS NOT NULL"))
        print(f"[device-lock] RESET_ALL_DEVICE_LOCKS=true → cleared {result.rowcount} device binding(s). "
              "Set RESET_ALL_DEVICE_LOCKS=false in .env so this does not repeat on the next restart.")
    except Exception as e:
        print(f"[device-lock] reset-all failed: {e}")

_reset_all_device_locks()

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

_DEFAULT_VENDOR_CATEGORIES = [
    "Tyre Seller", "Tyre Rethreader", "Tyre Worker", "Mechanic", "Tinker",
    "Dealer", "Painter", "Spares", "Others",
]

def _seed_vendor_categories():
    """One-time seed, run only while vendor_categories is empty. The category
    field used to be a free-type combobox, so this also carries over any
    category text already saved on existing vendors — otherwise those vendors'
    categories would vanish from the now-restricted dropdown on first load."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(models.VendorCategory).count() == 0:
            existing = {
                name for (name,) in db.query(models.Vendor.category)
                .filter(models.Vendor.category.isnot(None), models.Vendor.category != "")
                .distinct()
            }
            names = list(dict.fromkeys(_DEFAULT_VENDOR_CATEGORIES + sorted(existing)))
            db.add_all([models.VendorCategory(name=name) for name in names])
            db.commit()
    finally:
        db.close()

_seed_vendor_categories()

def _backfill_emi_finance_fields():
    """One-time (idempotent — safe to run every startup) backfill for EMI
    records whose Daily Finance Cost / Monthly Finance Cost / EMI Cost per Km
    were never computed and saved. These three fields are 100% derived — the
    EMI form (EmiFormDialog) computes and persists them fresh on every save —
    but a record last saved before that computation existed (or never
    re-saved since, e.g. because a later-added required field like
    Auto-Debit Date was blank and silently blocked every save attempt) is
    left with them stuck at their DB default of 0, even though EMI Amount
    itself is correctly set. The Running Cost Calculator's Advanced mode
    reads these stored columns directly with no live fallback (by design),
    so a record stuck like this shows "NIL" there — even though other views
    (e.g. EMI Insights) mask the gap by computing the same numbers live and
    never actually reading the stored value, making it look like nothing is
    wrong.

    Mirrors EmiFormDialog's own formulas exactly:
      monthly_finance_cost = emi_amount / tenure_months   (if tenure set)
      daily_finance_cost   = emi_amount / 26               (26 working days)
      emi_cost_per_km      = daily_finance_cost / km_per_day  (truck's tyre
                              layout, from Admin -> Truck Run Config)

    Only fills in a field that is currently 0/blank — never overwrites an
    already-saved nonzero value, so this can never clobber a real figure.
    """
    from database import SessionLocal
    db = SessionLocal()
    try:
        trucks_by_reg = {
            (t.registration_number or "").strip().upper(): t.tyre_layout
            for t in db.query(models.Truck).all()
            if t.registration_number
        }
        km_per_day_by_layout = {
            rc.tyre_layout: float(rc.km_per_day or 0)
            for rc in db.query(models.TruckRunConfig).all()
        }

        updated = 0
        for rec in db.query(models.EmiRecord).all():
            emi_amount = float(rec.emi_amount or 0)
            if emi_amount <= 0:
                continue

            changed = False

            if not float(rec.monthly_finance_cost or 0):
                tenure = int(rec.tenure_months or 0)
                if tenure > 0:
                    rec.monthly_finance_cost = round(emi_amount / tenure, 2)
                    changed = True

            daily_finance_cost = float(rec.daily_finance_cost or 0)
            if not daily_finance_cost:
                daily_finance_cost = round(emi_amount / 26, 2)
                rec.daily_finance_cost = daily_finance_cost
                changed = True

            if not float(rec.emi_cost_per_km or 0):
                reg = (rec.truck_registration or "").strip().upper()
                tyre_layout = trucks_by_reg.get(reg)
                km_per_day = km_per_day_by_layout.get(tyre_layout, 0) if tyre_layout else 0
                if km_per_day > 0 and daily_finance_cost > 0:
                    rec.emi_cost_per_km = round(daily_finance_cost / km_per_day, 6)
                    changed = True

            if changed:
                updated += 1

        if updated:
            db.commit()
            print(f"[emi-backfill] Filled in missing finance-cost fields for {updated} EMI record(s).")
    except Exception as e:
        print(f"[emi-backfill] failed: {e}")
        db.rollback()
    finally:
        db.close()

_backfill_emi_finance_fields()

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

def _ensure_background_workers() -> None:
    """Start this process's background loops if they aren't running. Each
    start() is a cheap no-op once its thread is alive, so this is safe to call
    on every request — which is what makes the workers run on Passenger even
    when neither the startup event nor the fork hook below gets them going."""
    import auto_close_worker
    auto_close_worker.start()
    import event_reminder_worker
    event_reminder_worker.start()
    # activity_tracker does NOT start a background thread — its flush/purge
    # instead piggyback on real request traffic (see flush_if_due() and the
    # activity_tracking middleware below), so it needs no startup call here
    # and no re-initialization after a Passenger fork.


@app.on_event("startup")
async def _startup():
    set_event_loop(asyncio.get_running_loop())
    _ensure_background_workers()

# Production (cPanel/Phusion Passenger, see passenger_asgi.py) spawns worker
# processes by forking a single preloaded template process ("smart spawning",
# Passenger's default). Python threads do not survive fork() — a background
# thread started before the fork (e.g. by the ASGI startup event above, if it
# happens to run in the template rather than per-worker) simply does not
# exist in the forked child, so auto_close_worker's shift-closing loop and
# event_reminder_worker's reminder loop would silently never run in that
# worker. Passenger's starting_worker_process hook exists specifically to
# re-initialize things like this after every fork — both .start() calls are
# idempotent (see their own _started guards), so calling them again here is
# always safe, whether or not the ASGI startup event also fired in this same
# process. A complete no-op outside Passenger (e.g. local `uvicorn main:app`
# dev) since phusion_passenger isn't importable there.
try:
    import phusion_passenger

    def _passenger_starting_worker_process(forked):
        _ensure_background_workers()

    phusion_passenger.on_event("starting_worker_process", _passenger_starting_worker_process)
except ImportError:
    pass

# HIGH-2: CORS origins come from the environment. Wildcard is allowed only when
# CORS_ORIGINS is literally "*" (development). Production must set the real origin(s).
_cors_env = os.getenv("CORS_ORIGINS", "*").strip()
if _cors_env == "*":
    _cors_origins = ["*"]
else:
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

# The device-lock httpOnly cookie needs credentialed CORS. The spec forbids
# allow_credentials=True together with a wildcard origin, so it is enabled only
# when CORS_ORIGINS lists explicit origins (set CORS_ORIGINS in .env for dev too).
_allow_credentials = _cors_env != "*"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
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
# Paths whose mutations should NOT trigger a broadcast (auth = login attempts, ws = n/a).
# /chat is exempt for two reasons: it pushes its own events to the participants'
# sockets only, and this middleware would otherwise broadcast the request path —
# leaking conversation ids to every connected client — and make every browser in
# the company refetch on each message sent.
_REALTIME_EXEMPT_PREFIXES = ("/auth", "/ws", "/chat")


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


# "/activity" — the Activity Log page's own live refresh would otherwise fill
# the log with "Admin loaded Activity Log ×N"; opening that page is still
# recorded as a normal page view by the browser tracker.
@app.middleware("http")
async def notes_request_size(request: Request, call_next):
    """Refuse oversized Notes / To-do writes before the body is read — FastAPI would
    otherwise load the whole request into memory before validation rejects
    it, so one multi-GB request could exhaust the server's RAM. Chunked
    bodies (no Content-Length) are refused for the same reason; browsers
    always send a length for these JSON requests."""
    path = request.url.path
    if request.method in ("POST", "PATCH", "PUT") and path.startswith(("/notes", "/todos")):
        if path.startswith("/todos"):
            from routers.todos import MAX_REQUEST_BYTES
            too_large = "This task is too large to save."
        else:
            from routers.notes import MAX_REQUEST_BYTES
            too_large = "This note is too large to save."
        length = request.headers.get("content-length")
        if length is None:
            return JSONResponse(status_code=411, content={"detail": "Content-Length required."})
        try:
            too_big = int(length) > MAX_REQUEST_BYTES
        except ValueError:
            too_big = True
        if too_big:
            return JSONResponse(status_code=413, content={"detail": too_large})
    return await call_next(request)


_ACTIVITY_SKIP = ("/usage/heartbeat", "/activity", "/ws")


@app.middleware("http")
async def activity_tracking(request: Request, call_next):
    """Records every API request for the activity log. Bookkeeping only: it never
    fails the request or delays the response (see activity_tracker.py)."""
    import time as _time
    started = _time.perf_counter()
    try:
        # Never rely on the startup event or Passenger's fork hook having run —
        # neither for the background workers nor for the event loop that
        # emit()/emit_to_users() schedule WebSocket pushes on.
        ensure_event_loop()
        _ensure_background_workers()
    except Exception:
        pass
    response = await call_next(request)

    # Piggyback activity_tracker's buffer flush/purge on real traffic — runs
    # as a BackgroundTask *after* this response has already gone out, so it
    # never adds latency here. Attached to every response (even requests this
    # middleware doesn't record below, e.g. "/") so the health-check ping the
    # Topbar sends every 15s is itself enough to keep flushing reliable even
    # on a quiet night with no other activity. flush_if_due() is a cheap
    # no-op on every call where a flush/purge isn't actually due yet.
    from starlette.background import BackgroundTask
    import activity_tracker
    response.background = BackgroundTask(activity_tracker.flush_if_due)

    path = request.url.path
    # CORS preflights carry no Authorization header by spec (the browser sends
    # them bare, before deciding whether the real request is even allowed), so
    # recording them always attributed a phantom "anonymous" event right next
    # to the real, correctly-attributed one for almost every authenticated call.
    # "/" is also excluded (exact match, not a prefix — "/" as a prefix would
    # match every route): it's the unauthenticated health check Topbar polls
    # every 15s for the online/offline dot, not a real person reading anything.
    # GET /files/... is just inline <img> serving (document previews) and is
    # skipped too — but POST/DELETE on that same prefix are real uploads and
    # deletions of someone's license/RC/Aadhaar, so those must still be tracked.
    files_get = request.method == "GET" and path.startswith("/files/")
    # Notes autosave PATCHes every second or so while someone types — one
    # "Saved changes" per keystroke burst would bury the rest of the log.
    # Creating and deleting a note is still recorded.
    note_autosave = request.method == "PATCH" and path.startswith("/notes/")
    if request.method != "OPTIONS" and path != "/" and not files_get and not note_autosave and not path.startswith(_ACTIVITY_SKIP):
        try:
            import activity_tracker
            forwarded = request.headers.get("x-forwarded-for")
            ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
            activity_tracker.record_request(
                request.method, path, response.status_code,
                (_time.perf_counter() - started) * 1000,
                request.headers.get("authorization"), ip,
            )
        except Exception:
            pass
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
app.include_router(vendor_categories.router, dependencies=AUTH)
app.include_router(trips.router, dependencies=AUTH)
app.include_router(attendance.router, dependencies=AUTH)
app.include_router(maintenance.router, dependencies=AUTH)
app.include_router(finance.insights_router)                  # role-gated inside (Accounts + Commercial Managers)
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
app.include_router(settings.router, dependencies=AUTH)
app.include_router(running_cost.router, dependencies=AUTH)
app.include_router(maintenance_types.router, dependencies=AUTH)
from routers import cfs_yard
app.include_router(cfs_yard.router, dependencies=AUTH)
app.include_router(tyre_range_config.router, dependencies=AUTH)
app.include_router(tyre_layout_type_config.router, dependencies=AUTH)
app.include_router(deletion_approvals.router, dependencies=AUTH)
app.include_router(payment_requests.router, dependencies=FINANCE)
app.include_router(chat.router, dependencies=AUTH)
from routers import chat_owner_view
app.include_router(chat_owner_view.router, dependencies=AUTH)
app.include_router(chat.photo_router)                         # GET group photo: public route, auth done inside (img tags)
app.include_router(default_batta.router, dependencies=AUTH)
app.include_router(maintenance_categories.router, dependencies=AUTH)
app.include_router(usage_analytics.router, dependencies=AUTH)
from routers import activity as _activity_router
app.include_router(_activity_router.router, dependencies=AUTH)
from routers import room_summon
app.include_router(room_summon.router, dependencies=AUTH)
from routers import events as _events_router
app.include_router(_events_router.router, dependencies=AUTH)
from routers import notes as _notes_router
app.include_router(_notes_router.router, dependencies=AUTH)
from routers import todos as _todos_router
app.include_router(_todos_router.router, dependencies=AUTH)


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

    # Bind the socket to its authenticated user so chat can address events to
    # specific participants instead of broadcasting them to everyone.
    _sub = payload.get("sub")
    ws_user_id = int(_sub) if _sub and _sub != "admin" else None

    # Was this user already online (another tab/device) before this socket?
    # Only the *first* socket flips them online and the *last* one flips them
    # offline — so opening a second tab doesn't spam presence events.
    was_online = ws_user_id is not None and ws_manager.is_online(ws_user_id)
    # The loop serving this socket is the one pushes must be scheduled on.
    ensure_event_loop()
    if not await ws_manager.connect(websocket, user_id=ws_user_id):
        return  # server at connection capacity
    if ws_user_id is not None and not was_online:
        await ws_manager.broadcast(
            "chat_presence", {"userId": ws_user_id, "online": True, "lastSeen": None}
        )
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
        # If that was the user's last open socket, they've gone offline — stamp
        # a last-seen time and tell everyone so their green dot turns grey.
        if ws_user_id is not None and not ws_manager.is_online(ws_user_id):
            ws_manager.note_last_seen(ws_user_id)
            await ws_manager.broadcast(
                "chat_presence",
                {"userId": ws_user_id, "online": False, "lastSeen": time.time()},
            )
