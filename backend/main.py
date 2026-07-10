import asyncio
import os
import re
import time

from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, DataError
from database import engine, Base
from security import get_current_user, require_roles, SECRET_KEY, ALGORITHM
from jose import jwt, JWTError
import models  # noqa: F401 — ensure all models are registered before create_all
from websocket_manager import manager as ws_manager, set_event_loop

from routers import trucks, drivers, staff, customers, vendors, trips, attendance, maintenance, finance, dashboard, files, auth, branches, repair_types, sac_codes, pl_summary, exports, edit_approvals, notifications

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
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        conn.commit()

    if _rename_done:
        return  # DB already fully migrated — restarts never touch data

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

    # Role rename, step 3: finalize enums to only the current role names
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

_run_schema_migrations()

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

app = FastAPI(
    title="Canaan ERP API",
    description="Backend for Canaan Global International — Fleet & Logistics ERP",
    version="1.0.0",
)

@app.on_event("startup")
async def _startup():
    set_event_loop(asyncio.get_running_loop())

# CORS: set CORS_ORIGINS in .env (comma-separated) to restrict in production,
# e.g. CORS_ORIGINS=https://erp.canaanglobal.com
_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
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
# Finance data additionally requires the Finance Manager (or Admin) role.
FINANCE = [Depends(require_roles("Finance Manager"))]

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

    return JSONResponse(
        status_code=400,
        content={"detail": f"Database integrity error: {error_msg}"},
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
    return JSONResponse(status_code=422, content={"detail": f"Invalid data: {error_msg}"})

@app.exception_handler(OperationalError)
async def sqlalchemy_operational_exception_handler(request: Request, exc: OperationalError):
    error_msg = str(exc.orig) if exc.orig else str(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Database error: {error_msg}"},
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal error: {type(exc).__name__}: {exc}"},
    )

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Canaan ERP API"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        await websocket.close(code=1008)  # policy violation: bad/expired token
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
