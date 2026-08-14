"""
JWT auth + role-based access control.

Every router (except /auth/login and /) requires a valid Bearer token.
Tokens are signed with SECRET_KEY from .env and expire after
ACCESS_TOKEN_EXPIRE_HOURS (default 12h).
"""
import hashlib
import os
import re
import secrets
import warnings
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

load_dotenv()

# APP_ENV controls fail-closed behaviour. In production we refuse to run with an
# ephemeral signing key (that would silently invalidate every session on each
# restart and, worse, allow a race where a predictable key is used).
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV in ("production", "prod")

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if IS_PRODUCTION:
        raise RuntimeError(
            "SECRET_KEY is not set and APP_ENV=production. Refusing to start with an "
            "insecure ephemeral signing key. Generate one with:  "
            "python -c \"import secrets; print(secrets.token_hex(32))\"  and set it in the environment."
        )
    # Dev only: random per-process key. Tokens survive within a run but all users
    # must re-login after a restart. Set SECRET_KEY in .env for production.
    SECRET_KEY = secrets.token_hex(32)
    warnings.warn(
        "SECRET_KEY is not set — using a temporary random key (development mode). "
        "All sessions will be invalidated on every backend restart."
    )
elif len(SECRET_KEY) < 32:
    # A short signing key materially weakens HS256; block it everywhere.
    raise RuntimeError("SECRET_KEY must be at least 32 characters. Generate with secrets.token_hex(32).")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "12"))

# ---------------------------------------------------------------------------
# Device lock. Each staff account binds to the first machine it logs in from
# via an httpOnly cookie; the DB stores only the SHA-256 of the raw token.
# Toggle with DEVICE_LOCK_ENABLED in .env (true/false, default true). When
# disabled, login skips binding entirely — no cookie is set and no account is
# ever locked out, but existing device_hash values in the DB are left untouched.
# ---------------------------------------------------------------------------
DEVICE_LOCK_ENABLED = os.getenv("DEVICE_LOCK_ENABLED", "true").strip().lower() in ("1", "true", "yes", "on")
DEVICE_COOKIE = "app_device"
DEVICE_MAX_AGE = 365 * 24 * 3600   # 1 year in seconds


def new_device_token() -> str:
    """64-char hex token stored client-side in the httpOnly cookie."""
    return secrets.token_hex(32)


def hash_device_token(token: str) -> str:
    """SHA-256 of the raw token — the only value persisted in the DB."""
    return hashlib.sha256(token.encode()).hexdigest()

# ---------------------------------------------------------------------------
# Password policy (enforced when staff/driver passwords are set or changed)
# ---------------------------------------------------------------------------
MIN_PASSWORD_LENGTH = int(os.getenv("MIN_PASSWORD_LENGTH", "10"))

# A small denylist of obviously weak passwords. A full breach-corpus check
# (HaveIBeenPwned k-anonymity range API) is the enterprise upgrade path.
_WEAK_PASSWORDS = {
    "password", "password1", "password123", "admin", "admin123", "administrator",
    "12345678", "123456789", "1234567890", "qwerty", "qwertyuiop", "letmein",
    "welcome", "welcome1", "changeme", "canaan", "canaan123", "erp12345",
}


def validate_password_strength(password: str) -> None:
    # Password policy (LOW-2) disabled until confirmed with client — uncomment to re-enable
    # if password is None or len(password) < MIN_PASSWORD_LENGTH:
    #     raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.")
    # if password.strip().lower() in _WEAK_PASSWORDS:
    #     raise ValueError("This password is too common. Choose a stronger, unique password.")
    # if not re.search(r"[a-z]", password) or not re.search(r"[A-Z]", password):
    #     raise ValueError("Password must contain both uppercase and lowercase letters.")
    # if not re.search(r"\d", password):
    #     raise ValueError("Password must contain at least one number.")
    # if not re.search(r"[^A-Za-z0-9]", password):
    #     raise ValueError("Password must contain at least one symbol.")
    pass


@dataclass
class TokenUser:
    id: int | None
    name: str
    role: str
    staff_id: str | None


def create_access_token(*, user_id: int | None, name: str, role: str, staff_id: str | None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id) if user_id is not None else "admin",
        "name": name,
        "role": role,
        "staff_id": staff_id,
        "iat": now,
        "jti": secrets.token_hex(16),  # unique token id — enables future server-side revocation
        "exp": now + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode & verify a JWT, honouring the revocation denylist. Raises JWTError if invalid.

    Shared by the HTTP dependency, the WebSocket handler, and file downloads so
    every entry point enforces the same signature/expiry/revocation checks.
    """
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    jti = payload.get("jti")
    if jti and is_token_revoked(jti):
        raise JWTError("Token has been revoked.")
    return payload


# ---------------------------------------------------------------------------
# Token revocation (in-memory denylist). Backed by a process-local set; for a
# multi-worker/horizontal deployment move this to Redis (see SECURITY_PLAN.md
# MEDIUM-2). Sufficient for the single-worker uvicorn deployment in use today.
# ---------------------------------------------------------------------------
_revoked_jti: set[str] = set()


def revoke_token(jti: str) -> None:
    if jti:
        _revoked_jti.add(jti)


def is_token_revoked(jti: str) -> bool:
    return jti in _revoked_jti


def _credentials_error(detail: str = "Not authenticated. Please log in.") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(request: Request) -> TokenUser:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise _credentials_error()
    token = auth.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except JWTError:
        raise _credentials_error("Session expired or invalid. Please log in again.")
    sub = payload.get("sub")
    return TokenUser(
        id=int(sub) if sub and sub != "admin" else None,
        name=payload.get("name", ""),
        role=payload.get("role", "Trip Sheet Register"),
        staff_id=payload.get("staff_id"),
    )


def require_roles(*roles: str):
    """Dependency factory: allow only users whose role is in `roles`. Admin always passes."""
    allowed = set(roles) | {"Admin"}

    def checker(user: TokenUser = Depends(get_current_user)) -> TokenUser:
        if user.role not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({user.role}) does not have permission for this action.",
            )
        return user

    return checker
