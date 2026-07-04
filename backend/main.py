import re

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, DataError
from database import engine, Base
import models  # noqa: F401 — ensure all models are registered before create_all

from routers import trucks, drivers, staff, customers, vendors, trips, attendance, maintenance, finance, dashboard, files, auth, branches, repair_types, sac_codes, pl_summary, exports

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # allow all origins in dev; restrict in production
    allow_credentials=False,    # must be False when allow_origins="*"
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trucks.router)
app.include_router(drivers.router)
app.include_router(staff.router)
app.include_router(customers.router)
app.include_router(vendors.router)
app.include_router(trips.router)
app.include_router(attendance.router)
app.include_router(maintenance.router)
app.include_router(finance.router)
app.include_router(dashboard.router)
app.include_router(files.router)
app.include_router(auth.router)
app.include_router(branches.router)
app.include_router(repair_types.router)
app.include_router(sac_codes.router)
app.include_router(pl_summary.router)
app.include_router(exports.router)


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
