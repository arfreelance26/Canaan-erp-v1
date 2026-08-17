# Canaan ERP — Software Development Quotation

**Prepared for:** Canaan (Client)
**Prepared by:** [Your Name] — Independent Software Developer
**Date:** 05 August 2026
**Quotation Ref:** CAN-ERP-2026-001
**Validity:** 30 days from date of issue

---

## 1. Executive Summary

Canaan ERP is a custom-built, end-to-end **fleet & transport management platform** developed specifically for Canaan's container-transport operations at Chennai port. It digitises the complete trip lifecycle — from booking and assignment, through yard collection and documentation, to reconciliation, accounts verification, and automated invoicing — while managing the full fleet, drivers, staff, finances, and compliance in a single system.

The platform is delivered as:
- A **web application** (accessible on any browser),
- A **Windows desktop application** for office use, and
- A **native mobile app** (Android & iOS) — an Admin-facing companion for on-the-go visibility into trips, fleet, compliance, approvals, and audit.

It supports **role-based access** for every person in the operation (Commercial Manager, Assistant Commercial Manager, Yard Supervisor, Documentation staff, Maintenance, and Accounts), with **live real-time updates** across all screens.

> **A note on pricing:** This quotation is offered at a specially-considered rate as the start of an ongoing working relationship. The pricing below reflects our intent to be Canaan's long-term development partner across this and future projects, rather than a one-off vendor cost.

---

## 2. Scope of Delivery — What the System Does

| # | Module | Description |
|---|--------|-------------|
| 1 | **Trip Management** | Trip assignment, container validation, hire/lift-on rules, scheduling, live status tracking, trip history |
| 2 | **Yard Supervisor Workflow** | Trip-sheet collection, driver advance verification, date tracking, dated PDF reports, alert popups |
| 3 | **Documentation & Reconciliation** | Trip-sheet entry, diesel logging, KM variance checks, flagging, edit-approval workflow |
| 4 | **Accounts & Invoicing** | Verification (approve/reject), automated invoice generation (Tax Invoice / Bill of Supply / Transport Memo) with separate running numbers, GST handling, LR / Consignment Note generation |
| 5 | **Fleet / Truck Master** | Vehicle records, document compliance (FC, permits, PUC, insurance, road tax) with per-document expiry alerts |
| 6 | **Tyre Management** | Tyre inventory, fitment records, base rates |
| 7 | **Fuel & AdBlue** | Fuel logs (auto-synced from trip sheets), AdBlue tracking |
| 8 | **Driver & Staff Management** | Master records, attendance, leave requests & approvals, compensation |
| 9 | **Finance** | EMI tracking, recurring payments, driver/staff compensation |
| 10 | **P&L & Analytics** | Per-trip gross P&L and mileage tracking; full Profitability Summary report with trip-level and truck-level tabs (EMI share deductions, maintenance deductions, document cost amortisation, date-range presets); multi-dimensional profitability filters (cargo, trip type, container, customer, truck); Running Cost Calculator (Manual / Basic / Advanced modes, per-km breakdown: EMI, fuel, AdBlue, tyres, maintenance) with animated calculation flow guide; Customer Route Analytics; Fleet Summary |
| 11 | **Dashboards** | Role-specific dashboards, clickable stat cards, active-booking visibility for all users |
| 12 | **Approvals & Audit** | Edit/delete approval routing, full audit log of every change |
| 13 | **System Foundation** | Secure login & roles, real-time sync, automated cloud backup, data exports |
| 14 | **Mobile App (Android & iOS)** | Native Admin companion app — dashboards, trips & history, fleet & compliance, maintenance, attendance, P&L, approvals, audit log; offline cache; enterprise security (TLS pinning, biometric lock, root/jailbreak block, screenshot protection) |
| 15 | **Security & Hardening** | Full-stack backend hardening (JWT auth on every request, role-based access, authenticated file downloads, upload magic-byte validation, brute-force lockout, JWT revocation/logout, security headers, append-only audit trail) and mobile enterprise security (CA-level TLS pinning, hardware-backed secure storage, root/jailbreak fail-closed gate, biometric app lock, screen-capture protection, R8 + Dart obfuscation) |

---

## 3. Technical Scale (for reference)

| Metric | Count |
|--------|-------|
| Application screens | 42 |
| Reusable UI components | 109 |
| Backend API endpoints | 205 |
| Database tables / entities | 36 |
| User roles supported | 6+ |
| Mobile app screens | 15+ |
| Delivery targets | Web + Windows Desktop + Android + iOS |

**Technology stack:** Next.js 16 / React 19 (frontend), FastAPI / Python (backend), MySQL (database), WebSockets (real-time), Electron (desktop), Flutter / Dart with Riverpod (mobile — Android & iOS), Google Drive (automated backups).

---

## 4. Cost Breakdown

Pricing is presented **module-wise** so each area of the system is transparent.

| # | Module / Work Package | Amount (₹) |
|---|------------------------|-----------:|
| 1 | Requirements analysis, architecture & database design | 15,000 |
| 2 | System foundation — authentication, roles, real-time sync, audit log | 15,000 |
| 3 | Trip Management (assignment, validation, scheduling, tracking) | 35,000 |
| 4 | Yard Supervisor workflow | 15,000 |
| 5 | Documentation & Reconciliation (trip sheets, diesel, approvals) | 33,000 |
| 6 | Accounts & Automated Invoicing (3 invoice types, GST, LR generation) | 30,000 |
| 7 | Fleet / Truck master + compliance alerts | 18,000 |
| 8 | Tyre, Fuel & AdBlue modules | 15,000 |
| 9 | Driver, Staff, Attendance & Leave management | 10,000 |
| 10 | Finance (EMI, recurring payments, driver/staff compensation) | 12,000 |
| 11 | P&L & Profitability Analytics — per-trip P&L & mileage; full P&L Summary (trip + truck profitability tabs, date presets, multi-dimensional profitability filters by cargo / trip type / container / customer); Running Cost Calculator (Manual / Basic / Advanced modes, per-km cost breakdown across EMI, mileage, AdBlue, tyres and maintenance, animated calculation flow guide); Customer Route Analytics; Fleet Summary; backend pro-rated EMI & document amortisation for accurate net truck P&L | 35,000 |
| 12 | Reports, PDF exports & automated cloud backup | 10,000 |
| 13 | Desktop (Windows) application packaging | 8,000 |
| 14 | Testing, deployment, data seeding & UAT support | 10,000 |
| 15 | Mobile app (Android & iOS) — Admin companion, offline cache, enterprise security, store-ready builds | 9,000 |
| 16 | Security & Hardening — full-stack backend security (JWT auth, RBAC, authenticated file access, upload validation, brute-force protection, audit trail, security headers) + mobile enterprise security (TLS certificate pinning, hardened secure storage, root/jailbreak block, biometric app lock, screen-capture protection, build obfuscation) | 30,000 |
| | **Total — One-Time Development** | **3,00,000** |

> All figures are in Indian Rupees (₹).

---

## 5. Payment Schedule

| Milestone | % | Amount (₹) |
|-----------|---|-----------:|
| On project confirmation (advance) | 40% | 1,20,000 |
| On completion of core trip & accounts modules | 30% | 90,000 |
| On final delivery & go-live | 30% | 90,000 |
| **Total** | **100%** | **3,00,000** |

---

## 6. Ongoing Support & Maintenance (Optional)

After go-live, the following support is available. As an ongoing partner, minor tweaks and quick fixes will always be handled promptly.

| Plan | Coverage | Annual Cost (₹) |
|------|----------|----------------:|
| **Standard Support** | Bug fixes, updates, backup monitoring, response within business hours | 40,000 / year |
| **Priority Support** | Above + priority response and minor feature changes as needed | 60,000 / year |

*The first 60 days after go-live are covered free as a warranty period.*

---

## 7. What's Included

- Complete source code and ownership on final payment
- Deployment to your server / hosting
- Admin & user training (up to 2 sessions)
- User documentation
- 60-day post-launch warranty

## 8. What's Not Included (chargeable separately)

- Third-party costs: server/hosting, domain, MySQL hosting, Google Drive/API charges
- Any new modules or major feature changes beyond the scope above (quoted separately, at partner rates)

---

## 9. Assumptions

- Requirements are as captured in the client brief and implemented feature list.
- Content, master data (customers, rates, locations), and approvals are provided by the client in a timely manner.
- One combined round of UAT feedback is included before go-live.

---

## 10. Acceptance

Kindly confirm acceptance by signing below or replying to this quotation.

| | |
|---|---|
| **For Canaan** | **Developer** |
| Name: ____________________ | Name: ____________________ |
| Signature: _______________ | Signature: _______________ |
| Date: ____________________ | Date: ____________________ |

---

*Thank you for the opportunity and the continued trust. I look forward to being Canaan's long-term development partner on this and future projects.*
