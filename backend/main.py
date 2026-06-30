from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from database import engine, Base
import models  # noqa: F401 — ensure all models are registered before create_all

from routers import trucks, drivers, staff, customers, vendors, trips, attendance, maintenance, finance, dashboard, files, auth, branches, repair_types, sac_codes, pl_summary

Base.metadata.create_all(bind=engine)

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
    docs_url=None,   # served manually below with self-hosted assets
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # allow all origins in dev; restrict in production
    allow_credentials=False,    # must be False when allow_origins="*"
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="Canaan ERP API - Swagger UI",
        swagger_js_url="/static/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui.css",
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


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Canaan ERP API"}
