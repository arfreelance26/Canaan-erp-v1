"""
Scheduled full backup for Canaan ERP.

Builds the same three artifacts offered on the Admin dashboard —
  • Excel workbook (every table)      -> canaan_erp_backup.xlsx
  • SQL dump (INSERT statements)      -> canaan_erp_backup.sql
  • Documents/photos archive          -> canaan_erp_files.zip
combines them into ONE zip, and uploads that zip to Google Drive.

Run manually:      python backup/run_backup.py
Run via cron 3am:  see backup/README.md

Config (environment variables, optional):
  GDRIVE_BACKUP_FOLDER_ID  Drive folder id to upload into (recommended)
  BACKUP_KEEP_LOCAL        "1" to also keep the zip on disk in backup/archives/
"""
# --- path bootstrap: app modules live in backend/ (this file is in backend/backup/) ---
import os as _os
import sys as _sys

_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------------------------

import io
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone

from database import SessionLocal
from routers.backup import build_excel_bytes, build_sql_bytes, build_files_zip_bytes

HERE = os.path.dirname(os.path.abspath(__file__))
ARCHIVE_DIR = os.path.join(HERE, "archives")
FOLDER_ID = os.getenv("GDRIVE_BACKUP_FOLDER_ID") or None
KEEP_LOCAL = os.getenv("BACKUP_KEEP_LOCAL", "0") == "1"


def _log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def build_combined_zip() -> tuple[str, bytes]:
    """Generate all three artifacts and pack them into a single zip. Returns (filename, bytes)."""
    db = SessionLocal()
    try:
        _log("Building Excel workbook…")
        xlsx = build_excel_bytes(db)
        _log("Building SQL dump…")
        sql = build_sql_bytes(db)
        _log("Building documents/photos archive…")
        files_zip = build_files_zip_bytes(db)
    finally:
        db.close()

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    name = f"canaan_erp_backup_{ts}.zip"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("canaan_erp_backup.xlsx", xlsx)
        zf.writestr("canaan_erp_backup.sql", sql)
        zf.writestr("canaan_erp_files.zip", files_zip)
    return name, buf.getvalue()


def main() -> int:
    _log("=== Canaan ERP scheduled backup starting ===")
    try:
        name, data = build_combined_zip()
        _log(f"Combined archive built: {name} ({len(data) / 1_048_576:.2f} MB)")

        # Write to a temp file (Drive upload needs a filesystem path).
        tmp_dir = tempfile.mkdtemp(prefix="canaan_backup_")
        tmp_path = os.path.join(tmp_dir, name)
        with open(tmp_path, "wb") as f:
            f.write(data)

        try:
            # Import here so a missing google lib doesn't stop local artifact builds.
            from backup.drive_uploader import upload_file

            _log("Uploading to Google Drive…")
            file_id = upload_file(tmp_path, folder_id=FOLDER_ID)
            _log(f"Upload complete. Drive file id: {file_id}")

            if KEEP_LOCAL:
                os.makedirs(ARCHIVE_DIR, exist_ok=True)
                shutil.copy2(tmp_path, os.path.join(ARCHIVE_DIR, name))
                _log(f"Local copy kept at archives/{name}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

        _log("=== Backup finished successfully ===")
        return 0
    except Exception as exc:  # noqa: BLE001 — cron job must log and exit non-zero
        _log(f"!!! BACKUP FAILED: {type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
