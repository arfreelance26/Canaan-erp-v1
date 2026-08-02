# Device Lock Implementation — MySQL + FastAPI + Next.js

Locks each user account to the first machine they log in from via an httpOnly cookie.
Wrong device → 403. A superadmin can reset the binding.

---

## How it works

1. On first login, the server generates a random **device token**, stores its SHA-256 hash on the user row, and sets the raw token in an httpOnly cookie (1-year expiry).
2. On every subsequent login, the server reads the cookie, hashes it, and compares it against the stored hash. Mismatch → 403.
3. A superadmin can clear the hash (reset), allowing the user to rebind from a new device on next login.

---

## 1. MySQL schema

```sql
CREATE TABLE users (
    id          VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
    username    VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,          -- scrypt or bcrypt
    role        ENUM('superadmin', 'executive', 'chief') NOT NULL DEFAULT 'chief',
    device_hash VARCHAR(64)  DEFAULT NULL,        -- sha256 of device token; NULL = unbound
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. FastAPI backend

### Dependencies

```
fastapi
uvicorn
sqlalchemy
pymysql          # or mysqlclient
python-jose[cryptography]
passlib[bcrypt]
python-multipart
python-dotenv
```

### Project layout

```
backend/
├── main.py
├── database.py
├── models.py
├── schemas.py
├── auth.py          # password + device helpers
├── session.py       # JWT helpers
└── routers/
    ├── auth.py      # POST /auth/login, POST /auth/logout, POST /auth/refresh
    └── users.py     # GET/POST /users, POST /users/{id}/reset-device
```

---

### `database.py`

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

DATABASE_URL = os.environ["DATABASE_URL"]
# e.g. mysql+pymysql://user:pass@localhost:3306/mydb

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

### `models.py`

```python
from sqlalchemy import Column, String, Enum, DateTime, func
from database import Base

class User(Base):
    __tablename__ = "users"

    id            = Column(String(36), primary_key=True)
    username      = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    role          = Column(Enum("superadmin", "executive", "chief"), nullable=False, default="chief")
    device_hash   = Column(String(64), nullable=True)   # None = unbound
    created_at    = Column(DateTime, server_default=func.now(), nullable=False)
```

---

### `auth.py` — password + device helpers

```python
import hashlib
import secrets
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def new_device_token() -> str:
    """64-char hex opaque token stored client-side in the cookie."""
    return secrets.token_hex(32)


def hash_device_token(token: str) -> str:
    """sha256 of the raw token — the only value persisted in the DB."""
    return hashlib.sha256(token.encode()).hexdigest()
```

---

### `session.py` — JWT helpers

```python
from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError
import os

SECRET_KEY   = os.environ["AUTH_SECRET"]
ALGORITHM    = "HS256"
IDLE_MINUTES = 30
ABSOLUTE_HOURS = 12

SESSION_COOKIE  = "app_session"
DEVICE_COOKIE   = "app_device"
DEVICE_MAX_AGE  = 365 * 24 * 3600   # 1 year


def _now() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def create_session_token(user_id: str, username: str, role: str) -> str:
    now     = _now()
    abs_exp = now + ABSOLUTE_HOURS * 3600
    exp     = min(now + IDLE_MINUTES * 60, abs_exp)
    payload = {
        "sub":      user_id,
        "username": username,
        "role":     role,
        "abs":      abs_exp,
        "exp":      exp,
        "iat":      now,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def refresh_session_token(token: str) -> str | None:
    """Extend the idle window; returns None if the absolute cap is already hit."""
    payload = decode_session_token(token)
    if payload is None:
        return None
    now     = _now()
    abs_exp = payload.get("abs", now + ABSOLUTE_HOURS * 3600)
    if now >= abs_exp:
        return None
    exp = min(now + IDLE_MINUTES * 60, abs_exp)
    payload["exp"] = exp
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_session_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if _now() > payload.get("abs", float("inf")):
            return None   # absolute cap hit
        return payload
    except JWTError:
        return None
```

---

### `routers/auth.py` — login / logout / refresh

```python
from fastapi import APIRouter, Depends, HTTPException, Cookie, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import User
from auth import verify_password, new_device_token, hash_device_token
from session import (
    create_session_token, refresh_session_token,
    SESSION_COOKIE, DEVICE_COOKIE, DEVICE_MAX_AGE,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    app_device: str | None = Cookie(default=None),
):
    user: User | None = db.query(User).filter(User.username == body.username).first()

    # Identical 401 whether user missing or password wrong — no enumeration.
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")

    # ── Device lock ──────────────────────────────────────────────────────────
    device_token = app_device or ""
    bind_device  = False

    if user.device_hash is None:
        # Unbound account → bind to this device now.
        if not device_token:
            device_token = new_device_token()
        user.device_hash = hash_device_token(device_token)
        db.commit()
        bind_device = True
    elif not device_token or hash_device_token(device_token) != user.device_hash:
        raise HTTPException(
            status_code=403,
            detail="This account is locked to another device. Ask a superadmin to reset it.",
        )
    # ── End device lock ──────────────────────────────────────────────────────

    token = create_session_token(user.id, user.username, user.role)

    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=True,          # set False in local dev if not using HTTPS
        samesite="lax",
        path="/",
        max_age=30 * 60,      # idle window; refreshed by /auth/refresh
    )
    if bind_device:
        response.set_cookie(
            key=DEVICE_COOKIE,
            value=device_token,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
            max_age=DEVICE_MAX_AGE,
        )

    return {"ok": True, "role": user.role, "username": user.username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.post("/refresh")
def refresh(
    response: Response,
    app_session: str | None = Cookie(default=None),
):
    """Call this on user activity to extend the idle window."""
    new_token = refresh_session_token(app_session or "")
    if new_token is None:
        raise HTTPException(status_code=401, detail="Session expired.")
    response.set_cookie(
        key=SESSION_COOKIE,
        value=new_token,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=30 * 60,
    )
    return {"ok": True}
```

---

### `routers/users.py` — user management + reset-device

```python
from fastapi import APIRouter, Depends, HTTPException, Cookie
from sqlalchemy.orm import Session

from database import get_db
from models import User
from session import decode_session_token, SESSION_COOKIE

router = APIRouter(prefix="/users", tags=["users"])


def require_superadmin(app_session: str | None = Cookie(default=None)):
    payload = decode_session_token(app_session or "")
    if payload is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only.")
    return payload


@router.post("/{user_id}/reset-device")
def reset_device(
    user_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    """Clear the device binding so the user can log in from a new machine."""
    user: User | None = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.device_hash = None
    db.commit()
    return {"ok": True}
```

---

### `main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, users

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # your Next.js origin
    allow_credentials=True,                    # required for cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
```

> **`allow_credentials=True` is required** — without it the browser won't send cookies cross-origin.

---

## 3. Next.js frontend

### `lib/api.ts` — typed fetch wrapper

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",   // send cookies cross-origin
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  login:       (username: string, password: string) =>
    apiFetch<{ ok: boolean; role: string; username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  logout:      () => apiFetch("/auth/logout", { method: "POST" }),

  refresh:     () => apiFetch("/auth/refresh", { method: "POST" }),

  resetDevice: (userId: string) =>
    apiFetch(`/users/${userId}/reset-device`, { method: "POST" }),
};
```

---

### `app/login/page.tsx` — login form

```tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const username = form.get("username") as string;
    const password = form.get("password") as string;

    try {
      await api.login(username, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm mx-auto mt-20">
      <h1 className="text-2xl font-bold">Sign in</h1>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </p>
      )}

      <input name="username" placeholder="Username" required className="border rounded p-2" />
      <input name="password" type="password" placeholder="Password" required className="border rounded p-2" />

      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 text-white rounded p-2 disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

---

### `app/dashboard/admin/users/page.tsx` — reset device button (superadmin)

```tsx
"use client";

import { api } from "@/lib/api";

interface User {
  id: string;
  username: string;
  role: string;
  device_bound: boolean;
}

export default function UsersPage({ users }: { users: User[] }) {
  async function handleReset(userId: string, username: string) {
    if (!confirm(`Reset device binding for "${username}"?`)) return;
    try {
      await api.resetDevice(userId);
      alert("Device reset. The user can now log in from a new machine.");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Reset failed.");
    }
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left p-2">Username</th>
          <th className="text-left p-2">Role</th>
          <th className="text-left p-2">Device</th>
          <th className="p-2" />
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} className="border-t">
            <td className="p-2">{u.username}</td>
            <td className="p-2">{u.role}</td>
            <td className="p-2">{u.device_bound ? "Bound" : "Unbound"}</td>
            <td className="p-2">
              {u.device_bound && (
                <button
                  onClick={() => handleReset(u.id, u.username)}
                  className="text-red-600 hover:underline text-xs"
                >
                  Reset device
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

### Session refresh on activity (`app/layout.tsx`)

```tsx
"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // refresh every 10 min on activity

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    const onActivity = () => { lastActivity.current = Date.now(); };
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);

    const interval = setInterval(async () => {
      const idle = Date.now() - lastActivity.current;
      if (idle < REFRESH_INTERVAL_MS) {
        await api.refresh().catch(() => {
          window.location.href = "/login";
        });
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, []);

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

---

## 4. Environment variables

```bash
# backend/.env
DATABASE_URL=mysql+pymysql://user:pass@localhost:3306/mydb
AUTH_SECRET=<openssl rand -base64 32>
```

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 5. Security notes

| Property | Detail |
|---|---|
| Raw token never stored | Only `sha256(token)` is saved in the DB — a DB leak doesn't expose device tokens |
| httpOnly cookie | JS can't read the device token; XSS can't steal it |
| Same 401 for bad user/pass | No username enumeration |
| Credential-only isn't enough | Attacker with the password but not the device cookie is blocked at 403 |
| Cookie ≠ hardware | Clearing browser cookies unbinds without admin reset — educate users not to do this |
| CORS + `credentials: include` | Must be set on both sides for cookies to travel cross-origin |
