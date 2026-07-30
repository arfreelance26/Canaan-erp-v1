# Canaan ERP — Enterprise Security Plan

**Author:** Security Engineering (senior review)
**Date:** 2026-07-23
**Scope:** FastAPI backend + Next.js frontend + MySQL, deployed for Canaan Global International (fleet & logistics ERP)
**Classification:** Internal — handles PII (Aadhaar, PAN, driving licences), financial records, and operational data.

> This is a forward-looking remediation **plan**, not just a report. It complements the historical
> `SECURITY.md` (2026-07-05). Findings below are grounded in the current codebase with file references.
> Methodology: OWASP Top 10 (2021), OWASP API Security Top 10 (2023), and OWASP ASVS L2 as the target bar.

---

## 1. Executive Summary

The application already has a solid baseline: JWT auth on every business endpoint, bcrypt password
hashing, role-based access control (`require_roles`), login brute-force throttling, authenticated
WebSockets, and several security headers. That puts it ahead of most SME line-of-business apps.

However, for an **enterprise-grade** bar — especially because the system stores **Aadhaar cards,
driving licences, and PAN documents** — there are gaps that must be closed. The most urgent is that
**uploaded identity documents are downloadable by anyone with no authentication and are trivially
enumerable (IDOR)**. This is a reportable personal-data breach risk under India's DPDP Act, 2023.

**Risk posture at a glance:**

| Severity | Count | Headline items |
|---|---|---|
| 🔴 Critical | 1 | Public, enumerable download of Aadhaar/licence/PAN documents |
| 🟠 High | 3 | Unauthenticated-scope file upload (IDOR write + no validation); wildcard CORS; hardcoded admin backdoor with weak default |
| 🟡 Medium | 6 | No global rate limiting; JWT has no revocation; brute-force state is per-process & username-keyed; missing HSTS/CSP; verbose DB errors; no audit trail |
| 🔵 Low | 3 | Token in WS query string; no password policy; secrets in flat `.env` |

---

## 2. Findings & Remediation

### 🔴 CRITICAL-1 — Sensitive identity documents are publicly downloadable and enumerable
**OWASP:** A01 Broken Access Control / API1 BOLA / A02 Sensitive Data Exposure
**Evidence:** `backend/routers/files.py` — `GET /files/{entity}/{entity_id}/{field}` (`download_file`) has
**no auth dependency** (unlike the POST which requires `get_current_user`). The code comment states GET
is left public so `<img>` tags can render photos. But the same open endpoint also serves
`drivers/{id}/aadhaar`, `drivers/{id}/license`, `staff/{id}/aadhar`, and all truck compliance docs.

**Impact:** An unauthenticated attacker can script `GET /files/drivers/1/aadhaar`,
`/files/drivers/2/aadhaar`, … and harvest every driver's Aadhaar and licence. Direct object reference
with a sequential integer ID = full PII exfiltration. This is the single highest risk in the system.

**Remediation:**
1. Require authentication on **all** document downloads (sensitive fields at minimum).
2. Replace `<img src>` reliance with either (a) short-lived **signed URLs** (HMAC token + expiry) or
   (b) fetch images via JS with the `Authorization` header and render as blob URLs (the frontend
   already does this for Excel exports in `downloadExcel`).
3. Enforce **object-level authorization**: a user may only fetch documents they are entitled to
   (e.g. self, or a role with a legitimate need). Split "public-ish" thumbnails from regulated ID docs.
4. Log every access to a regulated document (who, what, when) for the audit trail (MEDIUM-6).

---

### 🟠 HIGH-1 — File upload: no authorization scoping, no type/size validation
**OWASP:** A01 / API1 BOLA / A08 Data Integrity / unrestricted file upload
**Evidence:** `files.py` `upload_file` — requires only *any* logged-in user (`get_current_user`), then
writes to `record = _get_record(entity, entity_id, …)` for **any** entity_id. `data = await file.read()`
loads the whole file into memory. No content-type allowlist, no extension check, no size cap, no magic-byte
verification.

**Impact:**
- **IDOR write:** a low-privilege user (e.g. Yard Supervisor) can overwrite any driver's/truck's documents.
- **DoS / memory exhaustion:** unbounded `file.read()` of a multi-GB upload.
- **Stored malicious content:** an HTML/SVG with script stored and later served `inline` can drive stored XSS against the document viewer.

**Remediation:**
1. Add role/ownership checks to the upload path (who may write which entity's documents).
2. Enforce a **size limit** (stream + reject over N MB) and an **allowlist** of MIME types + extensions
   (pdf/jpg/png only), validated by **magic bytes**, not the client-sent content-type.
3. Serve downloads with `Content-Disposition: attachment` (not `inline`) for non-image types, and set a
   restrictive `Content-Security-Policy` on file responses.
4. Consider moving blob storage out of MySQL to object storage (S3/GCS) with server-side encryption.

---

### 🟠 HIGH-2 — CORS is a hardcoded wildcard, ignoring configured origins
**OWASP:** A05 Security Misconfiguration
**Evidence:** `backend/main.py:352` — `allow_origins=["*"]`, even though `.env` defines a proper
`CORS_ORIGINS=https://erp.canaanglobalinternational.com,…`. The env value is never read.

**Impact:** Any website can call the API from a victim's browser. Severity is reduced because
`allow_credentials=False` and the API uses bearer tokens (not cookies), but wildcard CORS still enables
cross-origin API abuse and broadens the attack surface for any XSS-stolen token.

**Remediation:** Read `CORS_ORIGINS` from the environment and pass the parsed list to
`CORSMiddleware`. Fall back to `["*"]` only when the value is literally `*` (dev). Never ship `*` to prod.

---

### 🟠 HIGH-3 — Hardcoded admin backdoor with weak default & plaintext comparison
**OWASP:** A07 Identification & Authentication Failures
**Evidence:** `backend/routers/auth.py` — `ADMIN_USERNAME`/`ADMIN_PASSWORD` from env with defaults
`admin@canaan.com` / **`admin`**. The check is `payload.password == ADMIN_PASSWORD` (plaintext, non-constant-time),
and this account bypasses the database entirely with full `Admin` role.

**Impact:** If `ADMIN_PASSWORD` is unset in any environment, the credentials are `admin@canaan.com` / `admin`.
Plaintext comparison is timing-observable and the secret sits in process env/`.env` unhashed.

**Remediation:**
1. **Remove the insecure default** — fail closed (refuse to start) if `ADMIN_PASSWORD` is not set.
2. Store the admin as a real hashed record (bcrypt) rather than a plaintext env comparison, or at minimum
   use `secrets.compare_digest` for constant-time comparison.
3. Enforce a strong admin passphrase + MFA (see roadmap). Rotate the current shared password immediately.

---

### 🟡 MEDIUM-1 — No global rate limiting / abuse protection
Only `/auth/login` is throttled. Every other endpoint (list, export, backup, file download) is unmetered →
scraping, enumeration, and application-layer DoS are possible. **Fix:** add per-IP + per-user rate limiting
(e.g. `slowapi`/Redis token bucket) at the gateway or middleware; stricter limits on `/backup/*`,
`/exports/*`, and `/files/*`.

### 🟡 MEDIUM-2 — JWT has no revocation / logout is client-side only
**Evidence:** `security.py` issues 12h HS256 tokens with no `jti` and no server-side blocklist. A leaked
token is valid until expiry; "logout" only drops it client-side. **Fix:** add a `jti` + a Redis
denylist checked on each request (or short access tokens + refresh tokens with rotation). Support
server-side session invalidation on password change / role change / suspected compromise.

### 🟡 MEDIUM-3 — Brute-force protection is per-process and username-keyed
**Evidence:** `auth.py` `_failed_attempts` is an in-memory dict. Two problems: (a) it resets on restart
and is **not shared across workers/instances**, so horizontal scaling defeats it; (b) it is keyed on
username only, so an attacker can **lock out a legitimate user** by spamming their username (account-lockout DoS).
**Fix:** move counters to Redis; key on **IP + username** with separate thresholds; add exponential backoff
and optional CAPTCHA after N failures.

### 🟡 MEDIUM-4 — Missing HSTS and Content-Security-Policy headers
**Evidence:** `main.py` `security_headers` sets `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Cache-Control` — but **no** `Strict-Transport-Security`, `Content-Security-Policy`,
or `Permissions-Policy`, and no HTTPS redirect at the app layer. **Fix:** add HSTS (once HTTPS is
confirmed end-to-end), a locked-down CSP for the frontend, and `Permissions-Policy`. Terminate TLS 1.2+
only, redirect HTTP→HTTPS at the proxy.

### 🟡 MEDIUM-5 — Verbose database errors returned to clients
**Evidence:** `main.py` `IntegrityError` handler parses and returns duplicate-key values and column names
to the caller. This leaks schema/data detail. **Fix:** return a generic user-facing message; log the
detail server-side only.

### 🟡 MEDIUM-6 — No security audit trail
No tamper-resistant log of security-relevant events (logins, failed logins, privilege use, deletes,
document access, backups downloaded). `EditApprovalRequest` is a business workflow, not a security log.
**Fix:** structured, append-only audit logging (actor, action, resource, IP, timestamp) shipped to a
central store (SIEM/immutable bucket). Required for DPDP breach investigations.

---

### 🔵 LOW findings
- **LOW-1 — WS token in query string** (`main.py:475`): tokens in URLs can land in proxy/access logs.
  Prefer a subprotocol header or a short-lived ticket exchanged for the socket.
- **LOW-2 — No password policy**: bcrypt is used, but no complexity/length/rotation policy or breach-list
  check on staff passwords. Add server-side policy + block known-breached passwords.
- **LOW-3 — Secrets in flat `.env`**: `.env` is correctly git-ignored, but the production DB password and
  `SECRET_KEY` live in plaintext on disk. Move to a secrets manager (Vault / AWS Secrets Manager / GCP
  Secret Manager) with rotation. Rotate `SECRET_KEY` and DB creds on a schedule and after any staff offboarding.

---

## 3. Positive controls already in place (keep & maintain)
- JWT bearer auth enforced on all business routers (`AUTH`/`FINANCE` dependencies, `main.py`).
- RBAC via `require_roles`, Admin-gated destructive/admin operations (staff/trip deletes, backups).
- bcrypt password hashing via passlib (`auth.py`, `drivers.py`).
- Login throttling (5 attempts / 15 min).
- Authenticated WebSocket with server-side token-expiry re-check (`main.py:474`).
- Baseline security headers + `.env` git-ignored + `.env.example` committed.
- ORM-based data access (parameterized) → low SQL-injection surface; raw `text()` is used only for static
  startup migrations with bound parameters.
- Backup endpoints are Admin-only and read-only.

---

## 4. Remediation Roadmap (prioritized)

**Phase 0 — Emergency (this week)**
- [ ] CRITICAL-1: authenticate + authorize all document downloads; kill open Aadhaar/licence access.
- [ ] HIGH-3: remove admin default password (fail-closed) + rotate current admin credential.
- [ ] HIGH-2: wire CORS to `CORS_ORIGINS` env; remove wildcard in prod.

**Phase 1 — Hardening (2–4 weeks)**
- [ ] HIGH-1: upload authorization + type/size/magic-byte validation + attachment disposition.
- [ ] MEDIUM-1: global rate limiting (Redis).
- [ ] MEDIUM-3: distributed, IP+username brute-force counters.
- [ ] MEDIUM-4: HSTS/CSP/Permissions-Policy + enforce HTTPS.
- [ ] MEDIUM-5: generic error responses.

**Phase 2 — Enterprise controls (1–2 months)**
- [ ] MEDIUM-2: JWT revocation (jti + denylist) or refresh-token rotation.
- [ ] MEDIUM-6: centralized, append-only security audit logging → SIEM.
- [ ] LOW-3: secrets manager + rotation policy.
- [ ] MFA for Admin and privileged roles.
- [ ] Move document blobs to encrypted object storage.

**Phase 3 — Assurance & process (ongoing)**
- [ ] Dependency scanning (pip-audit / npm audit) + SAST (Semgrep, Bandit) + secret scanning (Gitleaks) in CI.
- [ ] Annual third-party penetration test; quarterly internal review against this plan.
- [ ] Backup restore drills (verify the `/backup/sql` output restores cleanly, incl. JSON columns).
- [ ] Least-privilege DB user for the app (no DDL in prod once schema is stable).
- [ ] Incident response runbook + DPDP breach-notification procedure.

---

## 5. Compliance note — India DPDP Act, 2023
This system is a **Data Fiduciary** processing sensitive personal data (Aadhaar, PAN, licences, contact
details of drivers/staff/customers). Obligations that this plan supports:
- **Reasonable security safeguards** (§8): access control, encryption at rest/in transit, audit logging.
- **Breach notification**: requires the audit trail (MEDIUM-6) and IR runbook (Phase 3).
- **Purpose limitation & retention**: define retention for uploaded ID documents; purge when no longer needed.
- **Data minimization**: avoid exposing full Aadhaar where a masked reference suffices.

CRITICAL-1 and HIGH-1 are the items most directly tied to a notifiable personal-data breach and should be
treated as compliance-blocking for go-live.

---

## 6. Verification / Definition of Done
For each fix: unit/integration test proving the control (e.g. unauthenticated `GET /files/drivers/1/aadhaar`
returns `401`), plus a manual re-test of the abuse case. Track closure against the checkboxes in §4. Re-run
the full review after Phase 1 to confirm no regressions and update the risk table in §1.
