import asyncio
import os
import re

from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, DataError
from database import engine, Base
from security import get_current_user, require_roles, SECRET_KEY, ALGORITHM
from jose import jwt, JWTError
import models  # noqa: F401 — ensure all models are registered before create_all
from websocket_manager import manager as ws_manager, set_event_loop

from routers import trucks, drivers, staff, customers, vendors, trips, attendance, maintenance, finance, dashboard, files, auth, branches, repair_types, sac_codes, pl_summary, exports, edit_approvals

Base.metadata.create_all(bind=engine)

def _run_schema_migrations():
    """Idempotent ALTER TABLE migrations that create_all cannot handle (enum changes)."""
    migrations = [
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
        # Trip Sheet Coordinator workflow
        "ALTER TABLE trips ADD COLUMN trip_sheet_collected BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE trips ADD COLUMN trip_sheet_collected_at DATETIME NULL",
        "ALTER TABLE staff MODIFY COLUMN software_designation ENUM('Admin','Fleet Manager','Finance Manager','Tyre Manager','Staff','Trip Sheet Coordinator') NOT NULL DEFAULT 'Staff'",
        "ALTER TABLE leave_requests MODIFY COLUMN category ENUM('Driver','Fleet Manager','Tyre Manager','Staff','Trip Sheet Coordinator') NOT NULL",
        # Edit Approval Requests — expand resource_type to include BookingSheet + TripSheet
        "ALTER TABLE edit_approval_requests MODIFY COLUMN resource_type ENUM('Customer','Vendor','BookingSheet','TripSheet') NOT NULL",
        "ALTER TABLE edit_approval_requests MODIFY COLUMN action ENUM('Edit','Delete') NOT NULL",
        "ALTER TABLE edit_approval_requests MODIFY COLUMN status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending'",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
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

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Canaan ERP API"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        await websocket.close(code=1008)
        return
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive; client can send pings
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
