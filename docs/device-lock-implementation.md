# Device Lock Implementation — Canaan ERP

Locks each Staff account to the first machine it logs in from via an httpOnly cookie.
Wrong device → 403. An Admin can reset the binding via the staff management UI.

> **Architecture note:** The existing system uses JWT Bearer tokens stored in `sessionStorage`.
> The device cookie is an orthogonal layer added only to `/auth/login` — all other endpoints
> remain unchanged (Bearer header, no `credentials: include`).

---

## How it works

1. On first login, the server generates a random **device token**, stores its SHA-256 hash on the staff row (`device_hash`), and sets the raw token in an httpOnly cookie (1-year expiry).
2. On every subsequent login the browser sends the cookie automatically; the server hashes it and compares against the stored hash. Mismatch → 403.
3. An Admin user can clear `device_hash` (reset), allowing the staff member to re-bind from a new device.
4. The hardcoded admin account (`ADMIN_USERNAME` in `.env`) is **exempt** — no DB row, always passes.

---

## Scope of changes

| File | Change |
|---|---|
| `backend/models.py` | Add `device_hash` column to `Staff` |
| `backend/security.py` | Add device token helpers + cookie constant |
| `backend/routers/auth.py` | Device binding logic in login handler |
| `backend/main.py` | `allow_credentials=True` in CORS |
| `backend/routers/staff.py` | `POST /{id}/reset-device` endpoint |
| `frontend/src/context/AuthContext.tsx` | `credentials: "include"` on login fetch |
| Staff management UI page | "Reset device" button (Admin only) |

---

## 1. Database

Run this once against the live MySQL database before deploying any code:

```sql
ALTER TABLE staff
  ADD COLUMN device_hash VARCHAR(64) DEFAULT NULL
  COMMENT 'SHA-256 of device token; NULL = unbound';
```

SQLAlchemy's `create_all()` does not add columns to existing tables, so this must be run manually.

---

## 2. `backend/models.py`

Add inside the `Staff` class, after `password_hash`:

```python
device_hash = Column(String(64), nullable=True, default=None)
```

---

## 3. `backend/security.py`

Add these helpers alongside the existing JWT utilities:

```python
import hashlib
import secrets

DEVICE_COOKIE  = "app_device"
DEVICE_MAX_AGE = 365 * 24 * 3600   # 1 year in seconds

def new_device_token() -> str:
    """64-char hex token stored client-side in the httpOnly cookie."""
    return secrets.token_hex(32)

def hash_device_token(token: str) -> str:
    """SHA-256 of the raw token — the only value persisted in the DB."""
    return hashlib.sha256(token.encode()).hexdigest()
```

---

## 4. `backend/routers/auth.py`

### Imports to add

```python
from fastapi import Cookie, Response
from security import (
    ...,                          # existing imports
    DEVICE_COOKIE, DEVICE_MAX_AGE,
    new_device_token, hash_device_token,
)
```

### Updated login handler signature

```python
@router.post("/login")
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    app_device: str | None = Cookie(default=None),   # ← new
):
```

### Device lock block (insert after password verification, before token creation)

```python
# ── Device lock (staff only; hardcoded admin skips this block) ────────────
if staff_user is not None:
    device_token = app_device or ""
    bind_device  = False

    if staff_user.device_hash is None:
        # Unbound account → bind to this device now.
        if not device_token:
            device_token = new_device_token()
        staff_user.device_hash = hash_device_token(device_token)
        db.commit()
        bind_device = True
    elif not device_token or hash_device_token(device_token) != staff_user.device_hash:
        raise HTTPException(
            status_code=403,
            detail="This account is locked to another device. Ask an Admin to reset it.",
        )

    if bind_device:
        response.set_cookie(
            key=DEVICE_COOKIE,
            value=device_token,
            httponly=True,
            secure=True,      # set False for local HTTP dev
            samesite="lax",
            path="/",
            max_age=DEVICE_MAX_AGE,
        )
# ── End device lock ────────────────────────────────────────────────────────
```

---

## 5. `backend/main.py`

`allow_credentials=False` → `allow_credentials=True` in the `CORSMiddleware` block.

This is safe because `CORS_ORIGINS` already specifies exact origins (not `*`) in both local and production environments. The CORS spec forbids `allow_credentials=True` with wildcard origins.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,       # ← was False
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 6. `backend/routers/staff.py`

Add this endpoint. The existing `require_roles` dependency already enforces Admin-only access:

```python
@router.post("/{staff_id}/reset-device")
def reset_device(
    staff_id: int,
    db: Session = Depends(get_db),
    _: TokenUser = Depends(require_roles("Admin")),
):
    """Clear device binding so the staff member can re-bind from a new machine."""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found.")
    staff.device_hash = None
    db.commit()
    return {"ok": True}
```

Also expose `device_bound: bool` in the staff list/detail response schema so the frontend knows whether to show the reset button:

```python
# In StaffResponse schema (schemas.py)
device_bound: bool = False

# In the staff serialisation helper
"device_bound": bool(staff.device_hash),
```

---

## 7. `frontend/src/context/AuthContext.tsx`

One-line change in the `login()` function — add `credentials: "include"` to the login fetch only:

```typescript
const res = await fetch(`${API_BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",          // ← add this line
  body: JSON.stringify({ username, password }),
});
```

No other fetch calls need this change. All other requests continue using `Authorization: Bearer` only.

---

## 8. Staff management UI

Find the staff list page (Admin section). Add a **Reset device** button that is visible only when:
- The logged-in user is `"Admin"`
- The staff row has `device_bound: true`

```tsx
{currentUser?.softwareDesignation === "Admin" && member.device_bound && (
  <button
    onClick={() => handleResetDevice(member.id, member.name)}
    className="text-red-600 hover:underline text-xs"
  >
    Reset device
  </button>
)}
```

```typescript
async function handleResetDevice(id: number, name: string) {
  if (!confirm(`Reset device binding for "${name}"?`)) return;
  try {
    await req(`/staff/${id}/reset-device`, { method: "POST" });
    alert("Device reset. The user can now log in from a new machine.");
  } catch (err: unknown) {
    alert(err instanceof Error ? err.message : "Reset failed.");
  }
}
```

---

## 9. Security notes

| Property | Detail |
|---|---|
| Raw token never stored | Only `SHA-256(token)` in DB — a DB leak doesn't expose device tokens |
| httpOnly cookie | JS cannot read the device token; XSS cannot steal it |
| Cookie ≠ hardware | Clearing browser cookies unbinds without admin reset — educate users |
| Admin exempt | Hardcoded admin (`ADMIN_USERNAME`) bypasses device check entirely |
| Same 401 for bad credentials | Username enumeration unchanged from existing behaviour |
| CORS `credentials: true` | Required for cookie to travel cross-origin; safe because origins are already explicit |
| Bearer tokens unchanged | All non-login endpoints continue using `Authorization: Bearer` — no regressions |

---

## Verification checklist

1. **First login (unbound):** Browser DevTools → Application → Cookies shows `app_device` (httpOnly, 1-year). DB: `staff.device_hash` is now a 64-char hex string.
2. **Same device re-login:** Cookie sent automatically → 200 OK.
3. **Wrong device:** Incognito/different browser → 403 "locked to another device".
4. **Admin login:** Always succeeds regardless of device.
5. **Reset flow:** Admin clicks "Reset device" → `device_hash` becomes NULL → staff re-binds on next login.
6. **CORS header:** Network tab preflight shows `Access-Control-Allow-Credentials: true`.
