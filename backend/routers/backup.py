"""
Full-database backup endpoints — Admin only.

GET /backup/excel  → multi-sheet .xlsx with every table as its own sheet
GET /backup/sql    → .sql file of INSERT statements that can restore all data
"""
import io
import json
import os
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from sqlalchemy import LargeBinary, Text
from sqlalchemy.orm import Session

import models
from database import get_db
from security import require_roles, TokenUser

router = APIRouter(prefix="/backup", tags=["Backup"])

ADMIN_ONLY = Depends(require_roles())  # Admin always passes in require_roles()

# Every model in the order we want them to appear (dependency-safe for SQL restore)
ALL_MODELS = [
    models.Branch,
    models.Truck,
    models.Driver,
    models.Staff,
    models.Customer,
    models.CustomerOrigin,
    models.CustomerDestination,
    models.CustomerPricing,
    models.FinalCustomerPricing,
    models.Vendor,
    models.SacCode,
    models.RepairType,
    models.DriverAssignment,
    models.Trip,
    models.TripClosure,
    models.TripSheet,
    models.TripInvoice,
    models.DriverAttendance,
    models.DriverAttendanceRemark,
    models.StaffAttendance,
    models.LeaveRequest,
    models.MaintenanceRecord,
    models.FuelLog,
    models.TyreInventory,
    models.TyreFitmentRecord,
    models.EmiRecord,
    models.RecurringPayment,
    models.EditApprovalRequest,
    models.CompensationTransaction,
    models.Notification,
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _exportable_columns(model):
    """Return column names that are safe for spreadsheet / SQL export (skip BLOBs)."""
    return [c for c in model.__table__.columns if not isinstance(c.type, LargeBinary)]


def _blob_columns(model):
    """Return the LargeBinary (file) column names on a model."""
    return [c.name for c in model.__table__.columns if isinstance(c.type, LargeBinary)]


# Blob column → the column that stores its original filename (mirror of files.py FILENAME_COL).
BLOB_FILENAME_COL: dict[str, str] = {
    "photo_blob":                        "photo_url",
    "aadhaar_blob":                      "aadhaar_file_name",
    "aadhar_document_blob":              "aadhar_file_name",
    "license_blob":                      "license_file_name",
    "rc_document_blob":                  "rc_document_url",
    "fc_document_blob":                  "fc_document_file_name",
    "road_tax_document_blob":            "road_tax_document_file_name",
    "insurance_document_proof_blob":     "insurance_document_proof_file_name",
    "national_permit_proof_blob":        "national_permit_proof_file_name",
    "local_permit_proof_blob":           "local_permit_proof_file_name",
    "pollution_certificate_blob":        "pollution_certificate_proof_file_name",
}

# Models that hold uploaded file blobs, with the folder name used inside the ZIP.
BLOB_MODELS = [
    (models.Truck,    "trucks"),
    (models.Driver,   "drivers"),
    (models.Staff,    "staff"),
    (models.Customer, "customers"),
]


def _safe_filename(name: str) -> str:
    """Strip directories and unsafe characters from a stored filename for ZIP entry use."""
    base = os.path.basename(str(name)).strip()
    keep = "".join(ch for ch in base if ch.isalnum() or ch in " ._-()")
    return keep or "file.bin"


def _serialize_xlsx(value: Any):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value


def _serialize_sql(value: Any) -> str:
    """Return a SQL-literal string for a Python value."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return f"'{value.strftime('%Y-%m-%d %H:%M:%S')}'"
    if isinstance(value, date):
        return f"'{value.strftime('%Y-%m-%d')}'"
    # JSON columns (dict/list) — serialize as valid JSON, not Python repr, so MySQL restores cleanly
    if isinstance(value, (dict, list)):
        escaped = json.dumps(value).replace("\\", "\\\\").replace("'", "\\'")
        return f"'{escaped}'"
    # Strings / text — escape single quotes and backslashes
    escaped = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


# ---------------------------------------------------------------------------
# Excel backup
# ---------------------------------------------------------------------------

def build_excel_bytes(db: Session) -> bytes:
    """Build a multi-sheet .xlsx (one sheet per table) and return the raw bytes.
    Shared by the /backup/excel endpoint and the scheduled Drive backup job."""
    wb = Workbook()
    wb.remove(wb.active)

    for model in ALL_MODELS:
        table_name = model.__tablename__
        columns = _exportable_columns(model)
        col_names = [c.name for c in columns]
        headers = [c.name.replace("_", " ").title() for c in columns]

        rows_raw = db.query(model).all()
        rows = [[_serialize_xlsx(getattr(obj, col)) for col in col_names] for obj in rows_raw]

        # Sheet name: max 31 chars, no forbidden chars
        safe_name = "".join(ch for ch in table_name if ch not in ':\\/?*[]')[:31]
        ws = wb.create_sheet(title=safe_name)
        ws.append(headers)
        for row in rows:
            ws.append(row)
        for i, header in enumerate(headers, start=1):
            ws.column_dimensions[get_column_letter(i)].width = max(len(str(header)) + 2, 12)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/excel")
def backup_excel(
    db: Session = Depends(get_db),
    _user: TokenUser = ADMIN_ONLY,
):
    """Download every table as a separate sheet in one .xlsx workbook."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"canaan_erp_backup_{ts}.xlsx"
    return StreamingResponse(
        io.BytesIO(build_excel_bytes(db)),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# SQL backup
# ---------------------------------------------------------------------------

def build_sql_bytes(db: Session) -> bytes:
    """Build a .sql dump of INSERT statements for every table; return raw bytes.
    Shared by the /backup/sql endpoint and the scheduled Drive backup job."""
    lines: list[str] = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines.append(f"-- Canaan ERP — Full Database Backup")
    lines.append(f"-- Generated: {ts}")
    lines.append(f"-- To restore: run this file against a fresh database after CREATE TABLE statements.")
    lines.append("")
    lines.append("SET FOREIGN_KEY_CHECKS = 0;")
    lines.append("SET NAMES utf8mb4;")
    lines.append("")

    for model in ALL_MODELS:
        table_name = model.__tablename__
        columns = _exportable_columns(model)
        col_names = [c.name for c in columns]

        rows_raw = db.query(model).all()
        if not rows_raw:
            lines.append(f"-- Table `{table_name}`: (empty)")
            lines.append("")
            continue

        lines.append(f"-- Table: {table_name} ({len(rows_raw)} rows)")
        col_list = ", ".join(f"`{c}`" for c in col_names)

        for obj in rows_raw:
            values = ", ".join(_serialize_sql(getattr(obj, col)) for col in col_names)
            lines.append(f"INSERT INTO `{table_name}` ({col_list}) VALUES ({values});")

        lines.append("")

    lines.append("SET FOREIGN_KEY_CHECKS = 1;")
    lines.append("")

    return "\n".join(lines).encode("utf-8")


@router.get("/sql")
def backup_sql(
    db: Session = Depends(get_db),
    _user: TokenUser = ADMIN_ONLY,
):
    """Download all data as SQL INSERT statements that can be replayed to restore the database."""
    ts_file = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"canaan_erp_backup_{ts_file}.sql"
    return StreamingResponse(
        io.BytesIO(build_sql_bytes(db)),
        media_type="application/sql",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Files backup (ZIP)
# ---------------------------------------------------------------------------

def build_files_zip_bytes(db: Session) -> bytes:
    """Build a ZIP of every stored document/photo BLOB (with a MANIFEST.csv); return raw bytes.
    Shared by the /backup/files endpoint and the scheduled Drive backup job."""
    buf = io.BytesIO()
    manifest = ["entity,record_id,field,filename,bytes"]

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for model, entity in BLOB_MODELS:
            blob_cols = _blob_columns(model)
            if not blob_cols:
                continue
            for record in db.query(model).all():
                pk = getattr(record, "id", None)
                for col in blob_cols:
                    data = getattr(record, col, None)
                    if not data:
                        continue  # no file stored in this column for this record
                    name_col = BLOB_FILENAME_COL.get(col)
                    original = (getattr(record, name_col, None) if name_col else None) or f"{col}.bin"
                    safe = _safe_filename(original)
                    # Prefix with the blob column so two fields sharing a filename never collide.
                    arcname = f"{entity}/{pk}/{col}__{safe}"
                    zf.writestr(arcname, data)
                    manifest.append(f"{entity},{pk},{col},{safe},{len(data)}")
        zf.writestr("MANIFEST.csv", "\n".join(manifest))

    return buf.getvalue()


@router.get("/files")
def backup_files(
    db: Session = Depends(get_db),
    _user: TokenUser = ADMIN_ONLY,
):
    """Download every stored document/photo (the BLOB columns excluded from the Excel/SQL
    backups) as a single ZIP. Files are foldered by entity and record id, and a MANIFEST.csv
    lists every file so a restore can be mapped back to its record."""
    ts_file = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"canaan_erp_files_{ts_file}.zip"
    return StreamingResponse(
        io.BytesIO(build_files_zip_bytes(db)),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
