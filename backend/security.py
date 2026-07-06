"""
JWT auth + role-based access control.

Every router (except /auth/login and /) requires a valid Bearer token.
Tokens are signed with SECRET_KEY from .env and expire after
ACCESS_TOKEN_EXPIRE_HOURS (default 12h).
"""
import os
import secrets
import warnings
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # Random per-process key: tokens survive within a run but all users must
    # re-login after a restart. Set SECRET_KEY in .env for production.
    SECRET_KEY = secrets.token_hex(32)
    warnings.warn(
        "SECRET_KEY is not set in .env — using a temporary random key. "
        "All sessions will be invalidated on every backend restart. "
        "Generate one with:  python -c \"import secrets; print(secrets.token_hex(32))\""
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "12"))


@dataclass
class TokenUser:
    id: int | None
    name: str
    role: str
    staff_id: str | None


def create_access_token(*, user_id: int | None, name: str, role: str, staff_id: str | None) -> str:
    payload = {
        "sub": str(user_id) if user_id is not None else "admin",
        "name": name,
        "role": role,
        "staff_id": staff_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _credentials_error(detail: str = "Not authenticated. Please log in.") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(request: Request) -> TokenUser:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise _credentials_error()
    token = auth.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
