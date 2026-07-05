# Canaan ERP — Security Report

Date: 2026-07-05
Scope: full stack (FastAPI backend + Next.js frontend)

---

## 1. Authentication — JWT tokens on every API request

**Before:** the entire API was open. Anyone who could reach the backend URL could read, modify, or delete any data without logging in. The login endpoint existed but nothing enforced it.

**Now:**
- On login, the backend issues a signed **JWT access token** (`HS256`, signed with `SECRET_KEY` from `.env`), containing the user's id, name, role, and staff ID.
- **Every business endpoint requires a valid token** (`Authorization: Bearer <token>`). Requests without one get `401 Unauthorized`.
- Tokens **expire after 12 hours** (configurable via `ACCESS_TOKEN_EXPIRE_HOURS`).
- The frontend attaches the token automatically to all API calls, Excel downloads, and file uploads, and **auto-redirects to the login page** whenever the backend answers 401 (expired/invalid session).

Files: `backend/security.py` (new), `backend/routers/auth.py`, `backend/main.py`, `frontend/src/lib/api.ts`, `frontend/src/context/AuthContext.tsx`.

Public endpoints (by design):
| Endpoint | Why public |
|---|---|
| `POST /auth/login` | entry point |
| `GET /` | health check used by the login page's "Connected" badge |
| `GET /files/...` | photos are loaded via `<img src>` tags, which cannot send auth headers |

File **uploads** (`POST /files/...`) do require a valid login.

## 2. Role-Based Access Control (RBAC)

Roles come from the staff member's *Software Designation* and are embedded in the signed token — a user cannot forge or change their own role.

- **Finance endpoints** (`/finance/*`, `/pl-summary/*`): only **Finance Manager** and **Admin**. Other roles receive `403 Forbidden` with a clear message.
- **Deleting staff accounts**: **Admin only**.
- All other endpoints: any authenticated user.
- `require_roles(...)` in `security.py` makes adding more per-endpoint rules a one-line change.

## 3. Brute-force protection on login

- **5 failed attempts** for a username → that username is **locked out for 15 minutes** (`429 Too Many Requests` with a countdown message).
- Successful login clears the failure counter.

## 4. Secrets moved to `.env`

**Before:** the admin credentials were hardcoded in source (`admin@canaan.com` / `admin`), and there was no signing key.

**Now** (`backend/.env`, template in `backend/.env.example`):
| Variable | Purpose |
|---|---|
| `SECRET_KEY` | JWT signing key — a random 64-hex-char key was generated and added to your `.env` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | built-in admin account credentials |
| `ACCESS_TOKEN_EXPIRE_HOURS` | session length (default 12) |
| `CORS_ORIGINS` | allowed frontend origins |
| `DB_*` | database credentials (already existed) |

> **ACTION REQUIRED:** `ADMIN_PASSWORD` still falls back to `admin` if unset. Uncomment and set a strong value in `backend/.env` before going live.

## 5. CORS restriction

CORS allowed origins now come from `CORS_ORIGINS` in `.env` (comma-separated). Default stays `*` for development; set your real frontend URL in production so browsers refuse cross-site calls to the API.

## 6. Security headers

Every response now carries:
- `X-Content-Type-Options: nosniff` — blocks MIME-sniffing attacks
- `X-Frame-Options: DENY` — blocks clickjacking via iframes
- `Referrer-Policy: no-referrer` — URLs never leak to third parties
- `Cache-Control: no-store` — API responses aren't cached by proxies/browsers

## 7. Already in place (previous hardening, unchanged)

- **Password hashing:** bcrypt via passlib for staff and driver passwords; plain passwords are never stored or returned by any endpoint.
- **SQL injection:** all queries go through SQLAlchemy ORM parameter binding.
- **Concurrency / duplicate protection:** `SELECT FOR UPDATE` row locks, optimistic-lock `version` columns, unique DB constraints with a global IntegrityError → 409 handler.

---

## Deployment checklist

1. `backend/.env`: set a strong `ADMIN_PASSWORD`, set `CORS_ORIGINS` to the real frontend URL. (`SECRET_KEY` already generated.)
2. Restart the backend. **All users must log in again once** (old sessions have no token).
3. Serve the backend over **HTTPS** in production (tokens travel in headers; TLS protects them in transit).
4. Assign the correct *Software Designation* to each staff member — it now controls real API permissions, not just menu visibility.

## Known limitations / future work

- File **downloads** are unauthenticated (browser `<img>` limitation). Fix would be signed short-lived file URLs.
- Login lockout is in-memory: it resets if the backend restarts, and is per-username rather than per-IP.
- Tokens are stored in `localStorage`; an XSS vulnerability could read them. React escapes output by default, but avoid `dangerouslySetInnerHTML` with user data.
- No audit log yet (who changed what, when). The `version` columns provide conflict detection but not history.
