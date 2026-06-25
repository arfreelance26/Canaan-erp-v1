from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models  # noqa: F401 — ensure all models are registered before create_all

from routers import trucks, drivers, staff, customers, vendors, trips, attendance, maintenance, finance, dashboard, files

Base.metadata.create_all(bind=engine)

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


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Canaan ERP API"}
