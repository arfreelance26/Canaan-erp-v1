# Canaan ERP — Complete System Quotation

**Prepared for:** Canaan Global International
**Prepared by:** Independent Software Developer
**Document type:** Fresh, standalone commercial quotation for the complete Canaan ERP system as architected and built — web, desktop, mobile, and backend.

> **How this document was built.** This is not a revision of, or comparison against, any earlier quotation. The scope below was reconstructed independently by reading the actual system: 32 backend routers, ~60 SQLAlchemy data models, 64 frontend pages across 12 functional sections, 7 distinct user roles, and a fully built, security-hardened Flutter mobile app — not from a feature list handed over verbally. Every module, workflow, and technical control described here is grounded in what actually exists in the codebase and its documentation. Where something is a genuine opportunity rather than built scope, it is explicitly marked **Optional / Not Included**.

---

## 1. Executive Summary

Canaan Global International runs a container-transport operation out of Chennai/Tuticorin: trips are booked, containers assigned, trucks and drivers dispatched, trip sheets collected at the yard, expenses and advances reconciled, invoices raised under GST, and the whole fleet — trucks, tyres, fuel, maintenance, compliance documents — kept in working order. Historically, this kind of operation runs on a mix of paper trip sheets, WhatsApp coordination, and spreadsheets for costing — which means data is duplicated, reconciliation is manual and error-prone, and management only sees profitability after the fact, if at all.

**Canaan ERP replaces that entirely.** It is a single, real-time system covering the full trip lifecycle, the full fleet lifecycle, HR/attendance, finance, GST-compliant invoicing, and profitability analytics — accessible from a web browser, a packaged Windows/Mac desktop app, and a dedicated Android/iOS mobile app for admins — with role-based access for seven distinct job functions and a production-grade security architecture protecting real financial and customer data.

| | |
|---|---|
| **Platforms delivered** | Web application, Windows/Mac desktop app, Android & iOS mobile app |
| **User roles** | 7 distinct roles, each with tailored screens and permissions |
| **Functional modules** | 21 (see Section 4) |
| **Web/desktop screens** | 64 |
| **Backend API endpoints** | 205 |
| **Database tables** | ~40 |
| **Total investment** | **₹4,07,000** |
| **Delivery timeline** | ~28 weeks (≈ 7 months) |

---

## 2. Business & Operational Context

**What the business does:** books and executes container-transport trips, using owned trucks and drivers, billing customers under GST, while carrying the ongoing cost of fleet maintenance, tyres, fuel, EMIs, and driver/staff compensation.

**Where the system replaces manual work:**

| Manual pain point today | What the ERP does instead |
|---|---|
| Trip details re-typed at booking, at the yard, and again for invoicing | One trip record flows through booking → yard collection → reconciliation → invoicing, entered once |
| Driver salary and advance balances worked out by hand from trip sheets | Live, formula-driven Net Payable calculation, consistent everywhere it's shown |
| GST invoices, Bills of Supply, and Transport Memos prepared manually per trip | Automated, separately-numbered document generation with GST rules applied automatically |
| Truck document expiry (insurance, permits, FC, PUC) tracked in someone's memory or a spreadsheet | Automatic expiry alerts per document, per truck |
| Maintenance and tyre history scattered across paper logs | Centralized history with KM-based maintenance alerts and full tyre fitment/lifecycle tracking |
| Profitability known only roughly, after the fact | Per-trip and per-truck P&L, running cost per km, and customer/route profitability available on demand |
| No record of who changed or deleted what | A full, append-only audit trail plus a formal approval workflow for edits and deletions |

**Who uses the system:** Admin, Commercial Manager, Assistant Commercial Manager, Accounts, Maintenance, Trip Sheet Register, and Yard Supervisor — each sees only the screens and data relevant to their job, enforced both in the interface and at the API level.

---

## 3. Technical Architecture

| Layer | Technology | Why it was chosen |
|---|---|---|
| **Web frontend** | Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS v4 | Modern, fast, type-safe UI framework with server-side rendering where useful |
| **Desktop app** | Electron, packaging the same Next.js frontend | One codebase serves both the browser and an installable Windows/Mac app |
| **Mobile app** | Flutter (Dart), Riverpod state management, go_router | Single codebase for Android and iOS, native performance, mature ecosystem |
| **Backend API** | FastAPI (Python, ASGI) on Uvicorn | High-performance async framework with automatic request validation |
| **Database** | MySQL 8.0+, ~40 tables, SQLAlchemy 2.0 ORM | Reliable, widely-supported relational database matching the system's highly relational data (trips ↔ trucks ↔ drivers ↔ invoices ↔ compensation) |
| **Real-time sync** | WebSockets, with automatic polling fallback on hosts that don't support them | Every open screen reflects changes made anywhere else, without manual refresh |
| **Authentication** | JWT (JSON Web Tokens), python-jose + passlib/bcrypt | Stateless, scalable session handling with industry-standard password hashing |
| **Document generation** | jsPDF + html2canvas (PDF), openpyxl / SheetJS (Excel) | Print-ready invoices, LR notes, and structured data exports |
| **Automated backup** | Google Drive API | Off-site, scheduled backup without maintaining separate backup infrastructure |

This is a genuine multi-platform, real-time, relationally-modeled system — not a set of independent CRUD screens bolted together.

---

## 4. Complete Module Architecture

Twenty-one modules were identified by tracing the system's actual routers, data models, and screens end-to-end, then grouping by business function rather than by database table. For each module: what it's for, what it actually does, how it's built, and why it costs what it costs.

---

### 4.1 Trip Management & Lifecycle

**Business purpose.** The operational core — every job the business runs starts here. Booking, driver/truck assignment, live status tracking, and completion all live in one connected record instead of being re-entered at each stage.

**Core functionality.** Trip booking with container/cargo details; driver and truck assignment (with duplicate/conflict checks); live status transitions (Available → Assigned → Current → Completed / Cancelled / Deleted); trip history with full-text search and filtering; booking-sheet closure with a formal review step before a trip is marked complete.

**Data & business logic.** The `Trip` model is the hub the rest of the system reads from — trip category (Local / Outstation / Return Trip / Shifting) drives different batta and invoicing rules; `is_batta_applicable` on a Return Trip decides whether its pay is counted separately or assumed to ride along with the outbound leg's pay, a rule that has to be applied consistently everywhere salary is calculated.

**Automation.** Auto-suggested next trip ID; live status propagation to every open screen via WebSocket; automatic exclusion of cancelled/incomplete trips from analytics.

**Security & permissions.** Booking and assignment restricted to Commercial Manager / Assistant Commercial Manager / Admin; every role sees trip data scoped to what their job needs (e.g. a Yard Supervisor never sees invoicing detail).

**Integration.** Feeds Documentation & Reconciliation, Accounts & Invoicing, Finance/Compensation, and every analytics module — nothing downstream can be correct if this record is wrong, which is why it was built first and most rigorously.

**Complexity:** High — the central entity every other module depends on, with non-trivial status-transition and trip-category rules.

**Client value:** One accurate trip record replaces re-keying the same booking three or four times across departments.

---

### 4.2 Yard Supervisor Workflow

**Business purpose.** Gives yard staff a purpose-built, role-isolated screen for the one thing their job actually requires: collecting trip sheets and verifying driver advances as trucks come in — without exposing invoicing, salary, or admin data they have no reason to see.

**Core functionality.** Trip-sheet collection intake; driver-advance verification against what was disbursed; PDF collection-record generation; alerts for trips still pending yard collection.

**Business logic.** Cross-checks the advance amount recorded at dispatch against what's confirmed at collection, flagging mismatches before they reach accounts.

**Security.** A dedicated `Yard Supervisor` role with the narrowest data access of any role in the system.

**Integration.** Feeds Documentation & Reconciliation directly; a trip cannot be reconciled until its yard collection is recorded.

**Complexity:** Medium — small in screen count, but the data it collects gates everything downstream, so its validation has to be exact.

**Client value:** Removes a paper handover step that was previously the single biggest source of "we don't know where that trip sheet went."

---

### 4.3 Documentation & Reconciliation

**Business purpose.** The checkpoint between "the trip happened" and "the numbers are trustworthy enough to bill and pay against."

**Core functionality.** Trip-sheet data entry (diesel, expenses, advances, KM readings); KM-variance checking against expected distance; flagging of inconsistent entries; a formal edit-approval routing step for anything touching an already-reconciled record.

**Business logic.** KM variance is computed against the trip's expected distance and flagged outside a tolerance band; diesel and expense totals feed directly into the Finance module's Net Payable calculation, so an error here propagates into driver pay if not caught.

**Automation.** Automatic flagging of variance outliers; automatic routing of post-reconciliation edits into the approval queue rather than allowing silent changes.

**Integration.** Reads from Trip Management, writes the figures Finance and Accounts & Invoicing both depend on.

**Complexity:** Medium-high — the cross-checks and the approval-routing logic are the hard part, not the data entry screens themselves.

**Client value:** Catches costly data-entry errors (a wrong odometer reading, a missed expense) before they reach a customer invoice or a driver's pay.

---

### 4.4 Accounts & Automated Invoicing

**Business purpose.** Turns a completed, reconciled trip into the exact paperwork Canaan needs to get paid and stay GST-compliant, without manual document preparation.

**Core functionality.** Three distinct, separately-numbered document types — Tax Invoice, Bill of Supply, and Transport Memo; automatic CGST/SGST/IGST calculation based on customer location; Driver Advance Bills; LR (Lorry Receipt / Consignment Note) generation; combined-invoice generation across multiple trips for one customer, with correct pagination when printed to PDF.

**Business logic.** GST type (CGST+SGST vs. IGST) is determined automatically from customer state vs. billing branch state; each document type maintains its own independent running number sequence, which has to survive concurrent invoice generation without collisions.

**Reports.** Every generated document is retrievable by trip, by customer, and by date range.

**Security.** Restricted to Accounts and Admin roles; invoice numbering integrity is enforced at the database level, not just in the UI.

**Complexity:** High — three parallel document generators, each with its own layout, numbering, and tax logic, all reading from the same underlying trip data and required to stay consistent with each other.

**Client value:** Removes manual GST calculation entirely — the single highest-risk-of-error task in the old manual process — and produces print-ready, correctly numbered documents on demand.

---

### 4.5 Fleet / Truck Master & Compliance

**Business purpose.** A single source of truth for every vehicle, and an early-warning system for compliance lapses that carry real financial and legal risk (a truck stopped at a checkpoint with an expired permit is a direct cost).

**Core functionality.** Full vehicle master records; document tracking (insurance, permits, FC, PUC, road tax) with individual expiry dates; automatic expiry alerts per document, per truck; branch-history tracking when a truck is reassigned between branches.

**Automation.** Expiry alerts computed daily against every tracked document across the entire fleet, without a human having to check.

**Integration.** Every trip assignment, every maintenance record, and every P&L calculation reads the truck's branch and compliance status from here.

**Complexity:** Medium — the alerting logic across many documents × many trucks is the real engineering, not the master-record screens.

**Client value:** Converts "hope someone remembers the insurance renewal date" into a system that tells you.

---

### 4.6 Tyre Management

**Business purpose.** Tyres are a real, recurring fleet cost; tracking their lifecycle accurately is what makes per-km running-cost figures (Module 4.12) trustworthy.

**Core functionality.** Tyre inventory with purchase and cost detail; fitment history per truck; a **full soft-delete lifecycle** — a delete request routes through Deletion Approval, moves the tyre into a dedicated Tyre Archive, and can be Restored or Permanently Deleted from there, never silently lost; admin-configurable tyre range and cost configuration feeding the Running Cost Calculator.

**Data & logic.** A tyre's fitment record links it to a truck and an odometer reading at fitment and at removal, from which "distance covered on this tyre" is derived — the figure the cost-per-km analytics ultimately depend on.

**Security.** Restricted to Maintenance and Admin roles, including the archive/restore/permanent-delete actions.

**Complexity:** Medium-high — the archive/restore/permanent-delete state machine, mirrored consistently across three linked screens, is genuine workflow engineering, not a simple table.

**Client value:** Accurate tyre cost-per-km, and protection against a tyre record being deleted by mistake with no way back.

---

### 4.7 Fuel & AdBlue Tracking

**Business purpose.** Fuel is the largest recurring operating cost in transport; tracking it accurately (and without duplicate manual entry) is foundational to real running-cost figures.

**Core functionality.** Fuel logs auto-synced from trip-sheet data rather than re-entered; AdBlue purchase and consumption tracking; per-truck fuel and AdBlue history.

**Automation.** Fuel figures flow automatically from the trip sheet into the fuel log — the same number is never entered twice.

**Complexity:** Low-medium — the auto-sync logic (not re-entering data another module already captured) is the notable engineering point.

**Client value:** One accurate fuel figure per trip, feeding cost analytics without duplicate data entry or drift between two separately-maintained numbers.

---

### 4.8 Maintenance Management

**Business purpose.** Keeps trucks running and predictable, and keeps maintenance spend visible rather than buried in scattered receipts.

**Core functionality.** Repair logs with cost per truck; **KM-based automatic maintenance alerts**; an admin-configurable **Maintenance Category / Repair Type** system, where the "Repair Type" dropdown on the maintenance form dynamically changes based on which Category was picked — both fully editable by an admin, not hardcoded; Air Filter R&R (Removal & Replacement) tracking as its own specialized record type; Truck Run Record tracking for mileage-based logic.

**Business logic.** Maintenance-due alerts compare current odometer against the configured KM interval per maintenance type, per truck.

**Complexity:** Medium-high — the dynamic, admin-configurable category → repair-type relationship is a genuinely non-trivial piece of form logic and data modeling, not a static dropdown.

**Client value:** Maintenance stops being reactive; the system tells the business what's due, when, and what it's historically cost.

---

### 4.9 Driver & Staff Management

**Business purpose.** A single, authoritative master record for every person in the operation — the foundation every attendance, compensation, and trip-assignment screen reads from.

**Core functionality.** Full driver and staff profiles including photos and compliance documents (license, Aadhaar); role-based system access tied to each staff record; soft-delete/archive for departed staff, consistent with the same lifecycle pattern used for tyres and trucks.

**Security.** Sensitive documents (ID proofs, licenses) are access-controlled, not publicly served.

**Complexity:** Medium — the file-handling (photos, documents) and the archive lifecycle are the real work beyond a plain master-data table.

**Client value:** One place to confirm who's employed, what their access is, and whether their documents are current.

---

### 4.10 Attendance & Leave Management

**Business purpose.** Replaces manual attendance registers with a system that also drives compensation calculations downstream.

**Core functionality.** Daily attendance marking for drivers and staff; monthly attendance reporting; leave requests with a formal approval routing step; staff holiday calendar management.

**Integration.** Attendance data feeds staff compensation calculations in the Finance module.

**Complexity:** Medium — the approval routing and monthly-report aggregation are the substantive engineering beyond simple daily marking.

**Client value:** Auditable attendance history and a proper leave-approval trail instead of verbal or WhatsApp-based leave requests.

---

### 4.11 Finance & Compensation

**Business purpose.** Tracks the money the business owes and pays — truck loan EMIs, recurring costs, and driver/staff compensation — with figures the business can actually trust because they're computed the same way everywhere they're shown.

**Core functionality.** Truck EMI tracking and schedules; recurring-payment tracking; driver and staff compensation with **live "Net Payable" calculation** — Driver Batta Amount minus Outstanding Advance (itself Total Advance minus Total Expenses), with a specific, consistently-applied exception for Return Trips whose batta is assumed already paid via the outbound leg unless explicitly marked otherwise; a formal payment-request workflow.

**Business logic.** This is the single most cross-module-dependent calculation in the system: it reads trip data, trip-sheet data, and trip-category rules simultaneously, and has to produce the identical figure whether shown in a compensation table, a driver's expanded trip history, or a dedicated "Salary Breakdown" explanation view.

**Reports.** Per-driver, date-range-scoped salary totals; a dedicated Salary Breakdown view showing both the numeric formula and a proportional visual of how a trip's pay was derived.

**Security.** Full compensation detail restricted to Accounts/Admin; narrower, aggregate-only figures made available to roles like Auditor without granting full Finance access — a deliberate least-privilege design, not an oversight.

**Complexity:** High — a formula that has to stay exactly consistent across every screen that shows it, computed live rather than stored, from data spanning three other modules.

**Client value:** Driver pay figures the business — and the driver — can trust and, when asked, fully explain.

---

### 4.12 P&L & Profitability Analytics

**Business purpose.** Answers the question a transport business actually needs answered: where is this operation making money, and where is it losing it?

**Core functionality.** Per-trip and per-truck P&L with EMI-share and maintenance-cost amortization; a **Running Cost Calculator** with Manual, Basic, and Advanced modes, breaking per-km cost across EMI, fuel, tyres, and maintenance; Customer Route Analytics (profitability by customer and route); Fleet Summary.

**Business logic.** Per-truck P&L has to correctly amortize lump-sum costs (an EMI payment, a major repair) across the trips that "used" that truck in the relevant period — this is materially harder than summing simple per-trip revenue and expense.

**Reports.** Date-range presets, multi-dimensional filters (cargo type, trip type, container type, customer, truck), exportable summaries.

**Complexity:** High — this is the most cross-module-dependent analytics module in the system, correctly weighting and combining data from Trip Management, Finance, Maintenance, and Tyre Management simultaneously.

**Client value:** Data-driven answers to "which customers/routes are actually worth running" and "what does this truck really cost me per kilometer" — decisions previously made on instinct.

---

### 4.13 Role-Specific Dashboards

**Business purpose.** Each of the seven roles needs a different first screen — an Admin needs a business-wide overview, a Maintenance user needs fleet-health status, an Accounts user needs pending verifications.

**Core functionality.** A tailored summary dashboard per role, with clickable stat cards linking directly into the relevant module, and live active-booking visibility for every logged-in user.

**Complexity:** Medium — not one dashboard, but a dashboard framework producing a genuinely different, relevant view per role from shared underlying data.

**Client value:** Every user's first screen is immediately useful to their job, not a generic landing page they have to navigate away from.

---

### 4.14 Resource Hub

**Business purpose.** Centralizes every external party the business deals with — customers, vendors, and their pricing terms — that would otherwise live in scattered spreadsheets.

**Core functionality.** Customer master records including origin/destination pairs and rate cards (Customer Pricing, Final Customer Pricing); vendor master records; a unified Archive for soft-deleted records across resource types, mirroring the same lifecycle used elsewhere.

**Integration.** Every invoice and every trip-assignment screen reads customer/vendor data from here — a single source of truth feeding the rest of the system.

**Complexity:** Medium — the pricing-table structure (per customer, per origin/destination pair) is more involved than a flat contact list.

**Client value:** No more "which spreadsheet has the current rate for this customer" — one place, always current.

---

### 4.15 Admin Configuration & System Settings

**Business purpose.** Lets the business tune the system itself — rates, categories, branch structure — without needing a developer for every small change.

**Core functionality.** Branch management; SAC (Service Accounting Code) management for GST; Default Batta Management (compensation-rate configuration by branch/trip-category/container-type); Trip Expense Rate configuration; Tyre Cost/Range configuration; Repairs and Maintenance Alert configuration; Security Log viewing.

**Integration.** These configuration screens are the inputs that Finance, Invoicing, and P&L calculations read from — getting this layer right is what lets the business self-serve changes that would otherwise require a code change and redeployment.

**Complexity:** Low-medium per individual screen, but numerous, and each one is a real dependency for a calculation elsewhere in the system.

**Client value:** The business controls its own rates and rules going forward, rather than depending on a developer for every rate change.

---

### 4.16 Approvals & Audit

**Business purpose.** Protects data integrity in a system where multiple roles can edit or delete records — nothing sensitive changes or disappears without review and a permanent record of who did what.

**Core functionality.** Edit-approval routing for changes to finalized records; deletion-approval routing (request → review → approve/reject → soft-delete, with Restore and Permanently-Delete actions available afterward from a dedicated Archive); a full, append-only audit log of significant system actions.

**Security.** This module *is* a security control as much as a feature — the audit log is designed to be tamper-evident (append-only) so it remains trustworthy under review.

**Complexity:** Medium — the approval state machine, replicated consistently across every resource type it covers (trips, drivers, trucks, staff, customers, vendors, tyres), is workflow engineering, not a single table.

**Client value:** A defensible answer to "who changed this and when" — important both operationally and in any dispute.

---

### 4.17 In-App Chat & Messaging

**Business purpose.** Keeps operational coordination inside the system where it's visible and searchable, rather than fragmented across personal WhatsApp threads with no business record.

**Core functionality.** Real-time messaging between staff, available on web, desktop, and mobile.

**Technical basis.** Built on the same real-time (WebSocket) infrastructure as the rest of the system's live updates, rather than as a bolted-on separate service.

**Complexity:** Medium-high — real-time message delivery, conversation/participant management, and cross-platform consistency (web, desktop, mobile all seeing the same conversation state instantly) is non-trivial infrastructure.

**Client value:** Operational conversations tied to the same system as the work they're about, not lost in a personal phone's chat history when someone leaves.

---

### 4.18 Reports, Exports & Automated Cloud Backup

**Business purpose.** Gets data out of the system when it's needed elsewhere (accountant, external reporting), and protects the business against data loss.

**Core functionality.** Structured Excel export across major modules; scheduled, unattended automated backup to Google Drive.

**Complexity:** Medium — a scheduled backup that must never corrupt or interrupt the live database is a different (and more demanding) engineering problem than an on-demand export button.

**Client value:** Data is portable when needed, and protected against loss without anyone having to remember to back it up.

---

### 4.19 Notifications System

**Business purpose.** Surfaces the things a user actually needs to act on — a pending approval, an alert, a message — without them having to go looking.

**Core functionality.** In-app notification delivery tied to real-time events across the system (approvals, alerts, chat).

**Complexity:** Low-medium — mostly infrastructure shared with the real-time and chat systems rather than standalone engineering.

**Client value:** Nothing important sits unnoticed in a queue.

---

### 4.20 Admin Mobile App (Android & iOS)

**Business purpose.** Gives an Admin real visibility into the business away from a desk — the single most valuable "smart" addition to a system like this, because fleet and transport businesses run all day, not just at a desk.

**Core functionality.** Dashboards, trips and history, fleet and compliance, maintenance records, attendance, P&L summary, edit-approval review, a security/audit log, and in-app chat — a genuine companion to the web system, not a stripped-down copy.

**Technical basis.** Flutter (Dart) with Riverpod state management, go_router navigation, and Dio networking with a persistent offline-friendly cache (write-through, cache-first for slower-changing data like Fleet, offline fallback on network failure).

**Security — this is where the mobile app earns its complexity:**
- CA-level TLS certificate pinning (survives certificate renewals, defeats interception even by a compromised or rogue CA)
- Hardened secure storage (Android EncryptedSharedPreferences / iOS Keychain — never plain local storage for tokens)
- Proactive JWT expiry checking on launch **and** reactive session kill on any 401/403 from the server
- Root/jailbreak detection with a fail-closed "Security Check Failed" screen on a compromised device
- Biometric / device-credential app lock, re-locking every time the app returns from the background
- Native screenshot and screen-recording protection (Android `FLAG_SECURE`, iOS app-switcher privacy cover) — not a third-party plugin, because none were compatible with the current Android/Kotlin toolchain
- Cleartext HTTP blocked entirely; app data excluded from device/cloud backups
- R8 code shrinking + Dart obfuscation on release builds
- Admin-only login, enforced both client-side and by the backend

**Complexity:** Very high — this is not "the web app in a wrapper." It's a separate codebase with its own state management, networking layer, offline caching strategy, and a security stack most consumer apps never implement at all.

**Client value:** Real, secure, on-the-go visibility into the business, with the same security posture expected of a banking app — appropriate for a companion app that shows financial and operational data.

---

### 4.21 Windows / Mac Desktop Application

**Business purpose.** Office staff get a focused, installable application rather than "a browser tab," which matters for a system used at a desk all day.

**Core functionality.** The same Next.js frontend packaged via Electron into an installable Windows (and Mac) application, with its own application identity, icon, and installer.

**Complexity:** Low-medium — the packaging and build/release configuration is real, ongoing work (installer generation, code-signing considerations, auto-update path), but it reuses the web frontend rather than duplicating it.

**Client value:** A dedicated, always-available application for office use, without maintaining a second UI codebase.

---

## 5. Cross-Module Intelligence — the ERP as One System

The value of an ERP over a set of independent apps is in what happens *between* modules, automatically. This system was architected with that connectivity as the point, not an afterthought:

```
Master Data                 (Trucks, Drivers, Staff, Customers, Vendors)
   ↓
Operational Transactions    (Trip booking → assignment → yard collection → reconciliation)
   ↓
Expenses & Compliance       (Fuel, Tyres, Maintenance, Document expiry)
   ↓
Financial Calculations      (GST invoicing, EMI, driver/staff compensation — Net Payable)
   ↓
Analytics                   (Per-trip/per-truck P&L, running cost per km, customer profitability)
   ↓
Management Decisions        (Role-specific dashboards, on web, desktop, and mobile)
```

**Concrete examples of automatic cross-module effects already built into the system:**

- A trip's fuel figure is never re-entered — it's read directly from the trip sheet by the Fuel module.
- A truck's document expiring doesn't require anyone to check a calendar — the Fleet module computes it daily against every tracked document.
- A driver's "Salary" figure is identical whether viewed in Driver Compensation, in a driver's expanded trip history, or in the dedicated Salary Breakdown explainer — because all three read the same live calculation, not three separately-maintained numbers.
- A tyre's soft-delete doesn't just hide it from Tyre Inventory — it routes through Deletion Approval, and only fully disappears from every screen once approved, with a Restore path available the whole time.
- Per-truck P&L doesn't just sum trip revenue — it pulls and amortizes EMI and maintenance cost from two entirely separate modules to produce one trustworthy figure.

This is what "architected as an ERP" means in practice: the system enforces that a number means the same thing everywhere it appears.

---

## 6. Security Architecture

Security spans both **implemented, confirmed scope** and areas that are already live but could be hardened further as an optional next step. Nothing below is claimed as done unless it is genuinely built and verifiable in the codebase.

### 6.1 Confirmed / implemented — Backend & Web

- JWT-based authentication (python-jose, HS256) with a configurable token lifetime
- Role-based access control enforced **at the API level**, not just hidden in the UI — every endpoint checks the caller's role directly
- Password hashing via passlib/bcrypt, with a configurable minimum password length
- Session revocation support (token versioning / JTI-based revocation)
- Fail-closed production startup checks — the backend refuses to start in production with a weak `SECRET_KEY` or a weak admin password
- API documentation (`/docs`, `/redoc`) automatically disabled in production
- CORS locked to explicit allowed origins in production (no wildcard)
- Append-only audit logging of significant actions
- A formal approval workflow gating sensitive edits and deletions (Section 4.16)
- HSTS support once HTTPS is confirmed end-to-end

### 6.2 Confirmed / implemented — Mobile App

The full mobile security stack detailed in Section 4.20: CA-level TLS pinning, hardened secure storage, proactive + reactive session security, root/jailbreak fail-closed detection, biometric app lock, native screenshot/recording protection, and release-build obfuscation.

### 6.3 Optional hardening (not claimed as built — genuine next steps if desired)

- Centralized rate-limiting / brute-force lockout at the API gateway level (beyond current application-level protections)
- Automated JWT invalidation across all devices on password change/reset
- Structured application monitoring/alerting (e.g. Sentry-style crash and error reporting) in production
- Formal penetration testing / third-party security audit before a high-stakes go-live

Keeping this list separate from Section 6.1 is deliberate — the client should know exactly what protection exists today versus what is available as additional, clearly-scoped hardening.

---

## 7. Production-Grade Engineering

Getting from "the system works when I run it" to "the business can depend on this every day" is real, largely invisible engineering work:

- **Idempotent database migrations** — every schema change (a new column, a new table, a widened value list) is written to apply safely to a live, populated database, with no manual, risky one-off scripts and no downtime
- **Systematic error handling and input validation** across every form and API endpoint, not just the features that were easy to demo
- **Performance engineering** — lazy, concurrency-limited data fetching so pages with hundreds of records (trip history, driver records) stay responsive rather than loading everything at once
- **Resilience patterns** — a page depending on a role-gated data source is built so one blocked request doesn't blank the entire screen for that role, rather than failing silently or completely
- **Real, disposable-data testing** against the live database before any workflow is trusted with real business records — genuinely destructive operations are never tested against real data
- **Environment separation** — development and production configuration are kept strictly apart, with production enforcing stricter defaults automatically
- **Deployment configuration** for shared hosting environments (Passenger ASGI shim), including graceful fallback from WebSockets to polling where the host doesn't support them

---

## 8. Complete Module-Wise Commercial Breakdown

Pricing reflects actual scope, complexity, and cross-module dependency — not an even split across modules. A module with live financial calculations, multi-document generation, or a full mobile security stack costs materially more than a configuration screen, and is priced accordingly.

| # | Module | Complexity | Cost (₹) |
|---|---|---|---:|
| 1 | Trip Management & Lifecycle | High | 19,000 |
| 2 | Yard Supervisor Workflow | Medium | 9,000 |
| 3 | Documentation & Reconciliation | Medium-High | 14,000 |
| 4 | Accounts & Automated Invoicing (GST, 3 document types, LR) | High | 22,000 |
| 5 | Fleet / Truck Master & Compliance | Medium | 12,000 |
| 6 | Tyre Management (inventory, fitment, archive lifecycle, config) | Medium-High | 15,000 |
| 7 | Fuel & AdBlue Tracking | Low-Medium | 7,000 |
| 8 | Maintenance Management (records, categories, alerts, air filter, run record) | Medium-High | 15,000 |
| 9 | Driver & Staff Management | Medium | 9,000 |
| 10 | Attendance & Leave Management | Medium | 9,000 |
| 11 | Finance & Compensation (EMI, recurring payments, live Net Payable) | High | 17,000 |
| 12 | P&L & Profitability Analytics (incl. Running Cost Calculator) | High | 22,000 |
| 13 | Role-Specific Dashboards | Medium | 10,000 |
| 14 | Resource Hub (customers, vendors, pricing, archive) | Medium | 9,000 |
| 15 | Admin Configuration & System Settings | Low-Medium | 9,000 |
| 16 | Approvals & Audit | Medium | 9,000 |
| 17 | In-App Chat & Messaging | Medium-High | 12,000 |
| 18 | Reports, Exports & Automated Cloud Backup | Medium | 9,000 |
| 19 | Notifications System | Low-Medium | 4,000 |
| 20 | Admin Mobile App (Android & iOS, full security stack) | Very High | 28,000 |
| 21 | Windows/Mac Desktop Application | Low-Medium | 5,000 |
| | **Module Development Subtotal** | | **₹2,65,000** |

---

## 9. Shared / Cross-Cutting Engineering

This is the work that spans the entire ERP rather than belonging to any single module — architecture, database, core security infrastructure, testing, and deployment. **These figures are not embedded in the module costs above; they are additive**, so the client is never charged twice for the same work. The module table above prices *feature* development; this table prices the *foundation and cross-cutting discipline* every module depends on.

| Engineering Area | Scope | Cost (₹) |
|---|---|---:|
| Architecture & System Design | Overall system design, module boundaries, data-flow design | 13,000 |
| Database Design & Migrations | ~40-table relational schema, relationships, idempotent migration framework | 13,000 |
| API / Backend Core Framework | Shared backend services, request/response validation framework, WebSocket real-time infrastructure | 19,000 |
| Real-Time Sync Infrastructure | WebSocket broadcast manager + polling fallback, used across every live-updating screen | 10,000 |
| Authentication, RBAC & Security Hardening | JWT framework, role-guard system, backend security controls, mobile security stack integration | 29,000 |
| Document Generation Engine | Shared PDF/Excel generation infrastructure used by invoicing, reports, and collection records | 8,000 |
| Testing, QA & UAT Support | Functional testing, disposable-data verification, client UAT support cycle | 19,000 |
| Deployment & Production Configuration | Server setup, environment separation, shared-hosting deployment, backup configuration | 15,000 |
| Documentation & Knowledge Transfer | Technical documentation, admin/user guides | 8,000 |
| Project Management & Coordination | Requirement tracking, milestone coordination, client communication | 8,000 |
| | **Shared Engineering Subtotal** | **₹1,42,000** |

---

## 10. Project Investment

### 10.1 Development

| | Amount (₹) |
|---|---:|
| Module Development Subtotal (Section 8) | 2,65,000 |
| Shared / Cross-Cutting Engineering (Section 9) | 1,42,000 |
| **Total Development Investment** | **4,07,000** |

### 10.2 Optional Components (outside this quotation)

These are genuine opportunities, not part of the priced scope above — quoted separately only if the client wants them:

- **Dedicated Yard Supervisor mobile app** — a second, role-isolated mobile app built specifically for yard staff (distinct from the Admin app already included), for yard-floor use without a laptop
- **SMS / WhatsApp Business API integration** for automated alerts (document expiry, approval requests) outside the in-app notification system
- **Predictive maintenance** (data-driven maintenance-due forecasting beyond the current KM-threshold alerts) — genuinely useful once enough historical maintenance data has accumulated, not before
- **Multi-language interface support**
- **Formal third-party penetration test / security audit**

### 10.3 Third-Party Costs (not included — billed directly to the client's own accounts)

- Server / hosting costs
- Domain registration and renewal
- SSL certificate (Let's Encrypt is free; a paid EV certificate would be a client choice)
- Google Play Console developer account (one-time, ~$25) and Apple Developer Program (annual, ~$99) for app-store publishing — client must own these accounts
- Google Drive API usage (typically within the free tier at this data volume)
- Any SMS/WhatsApp gateway subscription, if the optional integration above is taken up later

---

## 11. Payment Milestones

| Milestone | Coverage | % | Amount (₹) |
|---|---|---|---:|
| 1. Requirement Finalization & Architecture | Confirmed scope, database design, technical architecture sign-off | 10% | 40,700 |
| 2. Core ERP Development | Trip Management, Fleet, Driver/Staff, Documentation & Reconciliation, basic Accounts, System Foundation & Security base | 30% | 1,22,100 |
| 3. Advanced ERP Development | GST Invoicing, Tyre/Maintenance/Fuel, Finance & Compensation, Analytics, Dashboards, Chat, Mobile App build | 30% | 1,22,100 |
| 4. Testing, UAT & Security Hardening | Functional testing, client UAT cycle, security verification (incl. mobile pinning/lock/root-block on real hardware) | 15% | 61,050 |
| 5. Production Deployment & Go-Live | Web + desktop deployment, mobile app store release build, training, handover | 15% | 61,050 |
| **Total** | | **100%** | **4,07,000** |

---

## 12. Timeline

A realistic, scope-driven schedule — not compressed to look attractive:

| Phase | Duration |
|---|---|
| Requirement Finalization & Architecture | 3 weeks |
| Core ERP Development | 8 weeks |
| Advanced ERP Development (incl. Mobile App) | 10 weeks |
| Testing, UAT & Security Hardening | 4 weeks |
| Production Deployment & Go-Live | 3 weeks |
| **Total** | **≈ 28 weeks (≈ 7 months)** |

Mobile app-store review time (Apple/Google) sits at the end of the timeline and is outside the developer's control — typically an additional few days to two weeks per platform.

---

## 13. Assumptions

- The client provides business rules (GST rates, compensation formulas, branch structure) and confirms them during the Requirement phase.
- The client provides initial master data (customer lists, rate cards, driver/staff records) or timely access to source data for seeding.
- The client provides timely feedback during each UAT cycle; delays in feedback extend the timeline proportionally.
- The client owns and provides credentials for third-party accounts required for their own infrastructure (hosting, domain, app-store developer accounts).
- One combined round of UAT feedback per major milestone is included; additional rounds beyond that are handled under the Change Request Policy (Section 15) if they introduce new scope, or absorbed as ordinary refinement if they don't.

---

## 14. Exclusions

The following are outside this quotation's core scope (available separately, as in Section 10.2, where applicable):

- Ongoing hosting, domain, and third-party subscription costs (Section 10.3)
- App-store publishing fees (client-owned developer accounts)
- The optional components listed in Section 10.2
- Any new module or major feature not described in Section 4, introduced after scope sign-off (see Section 15)
- Data migration from a prior system, if one exists and wasn't scoped during Requirement Finalization

---

## 15. Change Request Policy

Scope is fixed at sign-off of the Requirement Finalization milestone (Section 11, Milestone 1). Any major functionality requested after that point — a new module, a materially different workflow, or a new platform — is treated as a **Change Request**: scoped, estimated, and quoted separately before work begins, with the same transparency as this document. Minor clarifications and bug fixes within already-agreed scope are not Change Requests and are handled as part of normal development.

---

## 16. Support & Warranty

| Category | Definition | Coverage |
|---|---|---|
| **Bug fixing** | The system doesn't behave as specified in the agreed scope | **60 days free** after go-live, then covered under a support plan |
| **New functionality** | A capability that didn't exist in the agreed scope | Change Request (Section 15), quoted separately |
| **Change requests** | A modification to how an existing, agreed feature works | Change Request (Section 15), quoted separately |

**Ongoing support plans (optional, after the 60-day warranty):**

| Plan | Coverage | Annual Cost (₹) |
|---|---|---:|
| Standard | Bug fixes, minor updates, backup monitoring, business-hours response | 45,000 / year |
| Priority | Above + priority response time + minor feature changes as needed | 70,000 / year |

---

## 17. Final Executive Summary

**What the client receives:** a complete, real-time transport-management ERP spanning 21 functional modules, delivered across web, Windows/Mac desktop, and Android/iOS mobile — built around Canaan's actual trip-to-invoice-to-payment lifecycle, not a generic template.

**Major capabilities:** GST-compliant multi-document automated invoicing; full fleet, tyre, fuel, and maintenance lifecycle management with automatic compliance and maintenance alerts; live, formula-driven driver/staff compensation with a fully explainable calculation; deep profitability analytics down to the per-trip, per-truck, and per-customer level; role-specific dashboards for seven distinct job functions; real-time in-app chat; and a full approvals-and-audit layer protecting every sensitive change.

**Technical architecture:** a modern, relationally-modeled system (~40 database tables, 205 API endpoints) with real-time sync across every screen, built on Next.js/React, FastAPI/Python, and MySQL — the same frontend also packaged as a desktop app, alongside a genuinely separate, purpose-built Flutter mobile app.

**Security:** production-grade on both the backend (JWT authentication, per-endpoint role enforcement, fail-closed production configuration, append-only audit logging) and the mobile app (CA-level TLS pinning, hardware-backed secure storage, biometric app lock, root/jailbreak fail-closed detection, native screenshot protection, and release-build obfuscation) — a security posture appropriate for a system handling real financial and customer data.

**Automation & analytics:** document-expiry alerts, KM-based maintenance alerts, auto-synced fuel logging, and live cross-module profitability calculations that would otherwise require manual reconciliation across multiple spreadsheets.

**Deployment & support:** production deployment across all three platforms, a 60-day post-launch warranty, and clearly defined ongoing support plans thereafter.

**Final investment:** **₹4,07,000**, delivered over an estimated **28 weeks**, structured across five milestones tied to real development stages — not an arbitrary payment schedule.

This is not a basic record-keeping tool. It is a complete, production-grade operating system for Canaan's transport business — architected as one connected system, not a collection of independent screens — and priced to reflect exactly that scope, with every rupee traceable to a specific module or a specific piece of foundational engineering.
