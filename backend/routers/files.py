"""
File upload / download router.
Stores binary blobs in the database and serves them back with the correct MIME type.

Upload:  POST /files/{entity}/{entity_id}/{field}   multipart/form-data  file=<binary>
Download: GET  /files/{entity}/{entity_id}/{field}?token=<jwt>

Security (see SECURITY_PLAN.md CRITICAL-1 / HIGH-1):
  - Downloads REQUIRE a valid session token, accepted either as an Authorization
    header OR a `?token=` query param. The query param exists so <img src> tags
    (which cannot send headers) can still render photos while remaining
    authenticated. Without a valid token the endpoint returns 401 — this closes
    the previous open, enumerable access to Aadhaar/licence/PAN documents.
  - Uploads validate size, MIME allowlist AND magic bytes (not the client-sent
    content-type), and serve non-images as attachments.
  - Access to regulated ID documents is written to the security audit trail.
"""
import mimetypes
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from jose import JWTError
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user, decode_token
from audit import record_audit
import models

router = APIRouter(prefix="/files", tags=["Files"])

# Fields that contain regulated personal identity documents. Access to these is
# audited, and they are always served as downloads (never inline/renderable).
SENSITIVE_FIELDS = {"aadhaar", "aadhar", "license", "pan", "rc", "fc",
                    "road_tax", "insurance", "national_permit", "local_permit", "pollution_cert"}

# Allowlisted upload types, verified by magic bytes. Maps a detector to its label.
# (extension/content-type from the client is NOT trusted.)
def _sniff_mime(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None

ALLOWED_UPLOAD_MIMES = {"image/jpeg", "image/png", "application/pdf", "image/webp", "image/gif"}
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _require_file_token(request: Request) -> dict:
    """Authenticate a download request via Authorization header or ?token= query.
    Returns the decoded token payload. Raises 401 when absent/invalid."""
    token = ""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    if not token:
        token = request.query_params.get("token", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required to access this file.")
    try:
        return decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please log in again.")

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
        "insurance":        "insurance_document_proof_blob",
        "national_permit":  "national_permit_proof_blob",
        "local_permit":     "local_permit_proof_blob",
        "pollution_cert":   "pollution_certificate_blob",
    },
}

# Maps blob column name → the filename/url column that stores the original filename.
FILENAME_COL: dict[str, str] = {
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

MODEL_MAP: dict[str, type] = {
    "drivers":   models.Driver,
    "staff":     models.Staff,
    "customers": models.Customer,
    "trucks":    models.Truck,
}

# Standard upload cap for every file type (photos + compliance/ID documents).
# Backing columns are LONGBLOB, so 25 MB fits comfortably; MySQL max_allowed_packet
# on the server must be >= ~32 MB for writes of this size to succeed.
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


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

@router.post("/{entity}/{entity_id}/{field}", status_code=204, dependencies=[Depends(get_current_user)])
async def upload_file(
    entity: str,
    entity_id: int,
    field: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    record = _get_record(entity, entity_id, db)
    col = _col_name(entity, field)
    # Enforce the 25 MB standard cap. Read one byte past the limit so an oversized
    # file is detected without pulling the entire (potentially huge) body into memory.
    data = await file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File too large. The maximum allowed size is 25 MB.",
        )
    # HIGH-1: verify the true content type by magic bytes, not the client-supplied
    # content-type/extension. Rejects HTML/SVG/scripts and disguised executables.
    sniffed = _sniff_mime(data)
    if sniffed is None or sniffed not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Only PDF, JPG, PNG, WEBP or GIF files are allowed.",
        )
    setattr(record, col, data)
    name_col = FILENAME_COL.get(col)
    if name_col and hasattr(record, name_col):
        setattr(record, name_col, file.filename)
    db.commit()
    db.refresh(record)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

@router.get("/{entity}/{entity_id}/{field}")
def download_file(
    entity: str,
    entity_id: int,
    field: str,
    request: Request,
    db: Session = Depends(get_db),
):
    # CRITICAL-1: no valid token → 401. Closes public/enumerable PII access.
    payload = _require_file_token(request)

    record = _get_record(entity, entity_id, db)
    col = _col_name(entity, field)
    data: bytes | None = getattr(record, col, None)
    if not data:
        raise HTTPException(404, "No file stored for this field")

    # Audit every access to a regulated identity/compliance document.
    if field in SENSITIVE_FIELDS:
        record_audit(
            "file.download", request=request,
            actor_id=(int(payload["sub"]) if payload.get("sub", "").isdigit() else None),
            actor_name=payload.get("name"), actor_role=payload.get("role"),
            resource=f"{entity}/{entity_id}/{field}",
        )

    name_col = FILENAME_COL.get(col)
    filename: str = (getattr(record, name_col, None) if name_col else None) or f"{field}.bin"
    # Serve by the true (sniffed) type; fall back to the filename guess. Never honour
    # a stored type that could drive the browser to execute content.
    mime = _sniff_mime(data) or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    # Images may render inline (needed for <img>); everything else is forced to
    # download so a stored HTML/SVG payload cannot execute in the document viewer.
    disposition = "inline" if mime in IMAGE_MIMES else "attachment"
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )
