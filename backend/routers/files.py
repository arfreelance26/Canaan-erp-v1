"""
File upload / download router.
Stores binary blobs in the database and serves them back with the correct MIME type.

Upload:  POST /files/{entity}/{entity_id}/{field}   multipart/form-data  file=<binary>
Download: GET  /files/{entity}/{entity_id}/{field}
"""
import mimetypes
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/files", tags=["Files"])

# Map (entity, field) → (Model class, column attribute name)
FIELD_MAP: dict[str, dict[str, str]] = {
    "drivers": {
        "photo":   "photo_blob",
        "aadhaar": "aadhaar_blob",
        "license": "license_blob",
    },
    "staff": {
        "photo":   "photo_blob",
        "aadhar":  "aadhar_document_blob",
    },
    "customers": {
        "photo": "photo_blob",
    },
    "trucks": {
        "photo":            "photo_blob",
        "rc":               "rc_document_blob",
        "fc":               "fc_document_blob",
        "road_tax":         "road_tax_document_blob",
        "national_permit":  "national_permit_proof_blob",
        "local_permit":     "local_permit_proof_blob",
        "pollution_cert":   "pollution_certificate_blob",
    },
}

MODEL_MAP: dict[str, type] = {
    "drivers":   models.Driver,
    "staff":     models.Staff,
    "customers": models.Customer,
    "trucks":    models.Truck,
}


def _get_record(entity: str, entity_id: int, db: Session):
    model = MODEL_MAP.get(entity)
    if model is None:
        raise HTTPException(404, f"Unknown entity: {entity}")
    record = db.get(model, entity_id)
    if record is None:
        raise HTTPException(404, f"{entity} {entity_id} not found")
    return record


def _col_name(entity: str, field: str) -> str:
    fields = FIELD_MAP.get(entity, {})
    col = fields.get(field)
    if col is None:
        raise HTTPException(400, f"Unknown field '{field}' for entity '{entity}'")
    return col


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/{entity}/{entity_id}/{field}", status_code=204)
async def upload_file(
    entity: str,
    entity_id: int,
    field: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    record = _get_record(entity, entity_id, db)
    col = _col_name(entity, field)
    data = await file.read()
    setattr(record, col, data)
    # Store original filename in the corresponding _file_name column if it exists
    name_col = col.replace("_blob", "_file_name").replace("photo_blob", "photo_url")
    if hasattr(record, name_col) and name_col != col:
        setattr(record, name_col, file.filename)
    db.commit()


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

@router.get("/{entity}/{entity_id}/{field}")
def download_file(
    entity: str,
    entity_id: int,
    field: str,
    db: Session = Depends(get_db),
):
    record = _get_record(entity, entity_id, db)
    col = _col_name(entity, field)
    data: bytes | None = getattr(record, col, None)
    if not data:
        raise HTTPException(404, "No file stored for this field")
    # Try to infer MIME type from stored filename
    name_col = col.replace("_blob", "_file_name")
    filename: str = getattr(record, name_col, None) or f"{field}.bin"
    mime, _ = mimetypes.guess_type(filename)
    mime = mime or "application/octet-stream"
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
