# Canaan ERP — Fleet & Logistics Management System

A full-stack Enterprise Resource Planning system for **Canaan Global International**, built around the container-trip lifecycle: booking → driver assignment → on-road execution → trip-sheet reconciliation → accounts verification → GST-compliant invoicing. It also covers fleet maintenance, tyre/fuel tracking, HR/attendance, finance, and P&L analytics.

> **For the full technical deep-dive** — architecture, data model, ER diagram, all API endpoints, request/response examples, and security controls — see [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md).
> **Security explained in plain English** — see [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Roles](#roles)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

---

## Overview

Canaan ERP manages:

- **Trip lifecycle** — assign, execute, collect, reconcile, verify, and invoice container trips
- **Fleet & maintenance** — trucks, compliance documents, maintenance, tyres, fuel & AdBlue logs
- **Resources** — drivers, staff, customers (with rate cards), vendors
- **Attendance & HR** — driver/staff attendance, leave requests & approvals
- **Finance** — EMI tracking, recurring payments, driver/staff compensation, P&L
- **Invoicing** — automated Transport Memo / Bill of Supply / Tax Invoice with GST rules + LR (consignment note) generation
- **Security** — JWT auth, role-based access, append-only audit trail, admin security log

**Architecture:** a **Next.js 16** frontend and a **FastAPI** backend communicating over a JWT-authenticated REST API, backed by **MySQL**.

```
Browser  →  Frontend (Next.js :3000)  →  API (FastAPI :8000)  →  MySQL (:3306)
                                          └─ WebSocket /ws (realtime refresh hints)
```

---

## Tech Stack

### Frontend
- **Next.js 16.2** (App Router) + **React 19.2** + **TypeScript**
- **Tailwind CSS v4** (CSS-variable dark/light theming)
- **lucide-react** (icons), **recharts** (charts)
- **jsPDF + html2canvas** (invoices, LR notes, PDF reports)
- **sweetalert2** (dialogs), **react-haiku** (`useIdle` idle-logout)
- Optionally packaged as an **Electron** desktop app

### Backend
- **FastAPI** (ASGI) on **Uvicorn** (single worker); Passenger ASGI shim for shared hosting
- **SQLAlchemy 2.0** ORM + **PyMySQL** driver
- **Pydantic 2** validation
- **python-jose** (JWT / HS256) + **passlib/bcrypt** (password hashing)

### Database
- **MySQL 8.0+** — ~40 tables, document BLOBs (LONGBLOB), idempotent auto-migrations on startup

---

## Requirements

- **Node.js** 18+ with npm 10+
- **Python** 3.8+
- **MySQL** 8.0+ (local or remote)
- 4 GB RAM (8 GB recommended), ~2 GB free disk

---

## Installation & Setup

### 1. Clone

```bash
git clone <repository-url>
cd Canaan-erp-v1
```

### 2. MySQL database

```bash
# macOS (Homebrew)
brew install mysql && brew services start mysql

# Create the database
mysql -u root -e "CREATE DATABASE IF NOT EXISTS canaan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

> Tables are created and migrated **automatically** the first time the backend starts — there is no separate migration or seed step.

### 3. Backend

```bash
cd backend

# Virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment
cp .env.example .env                # then edit .env (see Environment Variables below)
```

### 4. Frontend

```bash
cd ../frontend
npm install

# Point the frontend at the backend (create if missing)
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local
```

---

## Running the Application

### Terminal 1 — Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

- Frontend: **http://localhost:3000**
- Backend: **http://localhost:8000**
- API docs (Swagger): **http://localhost:8000/docs** — *development only; disabled when `APP_ENV=production`*

**First login:** use the built-in admin (`ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env`), then create staff accounts from the Resource Hub.

---

## Environment Variables

Backend config lives in `backend/.env` (copy from `backend/.env.example`). **Never commit the real `.env`.**

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development` or `production`. Production enables **fail-closed** startup checks and hides `/docs`. |
| `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_NAME` | MySQL connection (note: **not** a single `DATABASE_URL`). |
| `SECRET_KEY` | JWT signing key, **≥ 32 chars**. Generate: `python -c "import secrets; print(secrets.token_hex(32))"`. Rotating it invalidates all sessions. |
| `ACCESS_TOKEN_EXPIRE_HOURS` | Token lifetime (default 12). |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Built-in admin login. In production `ADMIN_PASSWORD` must be strong or the app refuses to start. |
| `MIN_PASSWORD_LENGTH` | Staff/driver password minimum length. |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins. `*` only in dev; set the real origin in production. |
| `ENABLE_HSTS` | Set to `1` only when HTTPS is terminated end-to-end. |

Frontend uses `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Project Structure

```
Canaan-erp-v1/
├── backend/                     # FastAPI backend
│   ├── main.py                  # App bootstrap, middleware, auto-migrations, routers
│   ├── models.py                # SQLAlchemy ORM models (~40 tables)
│   ├── schemas.py               # Pydantic request/response schemas
│   ├── security.py              # JWT, role guards, password policy, token revocation
│   ├── audit.py                 # Append-only audit-log helper + client IP
│   ├── database.py              # Engine + session factory
│   ├── websocket_manager.py     # Realtime broadcast manager
│   ├── logging_config.py        # Rotating file logging (opt-in; see note below)
│   ├── routers/                 # 21 feature routers (trips, drivers, finance, …)
│   ├── requirements.txt
│   └── .env.example
├── frontend/                    # Next.js frontend
│   └── src/
│       ├── app/                 # App Router pages (41 pages)
│       ├── components/          # Feature-grouped React components
│       ├── context/             # Auth, Theme, WebSocket, Notification, …
│       ├── hooks/               # useAutoRefresh, …
│       └── lib/                 # api.ts client, nav-config.ts, helpers, AI agent
├── docs/                        # Technical & security documentation
│   ├── TECHNICAL_DOCUMENTATION.md
│   └── SECURITY.md
└── README.md
```

> **Logging:** `backend/logging_config.py` provides rotating file logs at `backend/logs/erp.log`. It is currently **commented out** in `main.py` pending sign-off — uncomment the `setup_logging()` call to enable.

---

## Roles

Seven roles drive both backend authorization and which pages each user sees:

| Role | Responsibility |
|---|---|
| **Admin** | Full access, approvals, security log |
| **Commercial Manager** | Assign trips/drivers, bookings, customers, P&L |
| **Assistant Commercial Manager** | Same as above + per-trip P&L / mileage, truck master |
| **Accounts** | Verify trip sheets, generate invoices, finance & compliance |
| **Maintenance** | Truck maintenance, tyre management/inventory |
| **Trip Sheet Register** | Reconcile trip sheets, diesel entry, fuel log |
| **Yard Supervisor** | Collect trip sheets, verify driver advances |

See [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md) §3 for per-role route access.

---

## Production Deployment

1. Set `APP_ENV=production` — this **fails closed** if `SECRET_KEY` (< 32 chars) or `ADMIN_PASSWORD` are weak/missing, and it **disables** `/docs`, `/redoc`, and `/openapi.json`.
2. Point the DB variables at the production MySQL server.
3. Set a real `SECRET_KEY` and strong `ADMIN_PASSWORD`.
4. Set `CORS_ORIGINS` to the live frontend origin (no wildcard).
5. Set `ENABLE_HSTS=1` once HTTPS is confirmed end-to-end.
6. Build the frontend: `npm run build && npm run start`.
7. On shared hosting (GoDaddy/cPanel) the backend runs via the Passenger ASGI shim (`passenger_asgi.py`); WebSockets are unavailable there, so the frontend automatically falls back to polling.

Full checklist and security control list: [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md) §12 & §16.

---

## Troubleshooting

**Backend won't start in production** — `APP_ENV=production` requires a `SECRET_KEY` ≥ 32 chars and a strong `ADMIN_PASSWORD`. This is intentional (fail-closed). Set them in `.env`.

**"Connection refused" to MySQL** — ensure MySQL is running (`brew services start mysql`) and the `DB_*` values in `.env` are correct.

**`/docs` returns 404** — expected when `APP_ENV=production`; the API explorer is disabled in production. Use `development` locally.

**Port already in use** — `lsof -i :8000` (or `:3000`), then `kill -9 <PID>`, or run on another port (`uvicorn main:app --port 8001` / `npm run dev -- -p 3001`).

**Frontend can't reach the API** — confirm the backend is up (`curl http://localhost:8000/`) and `frontend/.env.local` has the right `NEXT_PUBLIC_API_URL`.

**Build fails with TypeScript errors** — `npx tsc --noEmit` to see them; clear the cache with `rm -rf .next` and rebuild.

---

## Documentation

| File | Contents |
|---|---|
| [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md) | Full architecture, data model, ER diagram, all 205 endpoints, request/response examples, security features |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security fixes explained in plain-English scenarios |
| `CLAUDE.md` | Client feature requirements & implementation status |
| `AGENTS.md` | Next.js-version-specific notes |

---

## License

Proprietary software for **Canaan Global International**.

---

**Version:** 1.21 · **Maintainer:** Canaan Global International Dev Team
