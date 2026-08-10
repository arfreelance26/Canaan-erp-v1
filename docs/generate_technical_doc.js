const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  LevelFormat, Header, Footer, TabStopType, SimpleField, PageBreak
} = require('docx');
const fs = require('fs');
const path = require('path');

const NAVY = "1B3157";
const GOLD = "C9A84C";
const BODY = "333333";
const LABEL = "555555";
const GRAY_LIGHT = "F5F5F5";
const LIGHT_BLUE = "EFF6FF";
const WHITE = "FFFFFF";
const HEADER_GRAY = "888888";
const GREEN_DARK = "166534";
const CW = 9746;

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: "D8D8D8" };
const thinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function gap(pts) {
  return new Paragraph({ spacing: { before: 0, after: pts }, children: [new TextRun("")] });
}

function h1(text) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 28, color: NAVY, font: "Calibri" })]
  });
}

function h2(text) {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color: NAVY, font: "Calibri" })]
  });
}

function h3(text) {
  return new Paragraph({
    spacing: { before: 140, after: 60 },
    children: [new TextRun({ text, bold: true, size: 20, color: LABEL, font: "Calibri" })]
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 0, after: opts.after ?? 90 },
    children: [new TextRun({ text, size: 19, color: BODY, font: "Calibri", italic: opts.italic || false, bold: opts.bold || false })]
  });
}

function bullet(text, boldPrefix = "") {
  const children = [];
  if (boldPrefix) {
    children.push(new TextRun({ text: boldPrefix + " ", bold: true, size: 19, color: NAVY, font: "Calibri" }));
  }
  children.push(new TextRun({ text, size: 19, color: BODY, font: "Calibri" }));
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 30, after: 30 },
    children
  });
}

function callout(label, text) {
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({
      children: [
        new TableCell({
          borders: { top: thinBorder, bottom: thinBorder, right: thinBorder, left: { style: BorderStyle.SINGLE, size: 16, color: GOLD } },
          shading: { fill: "FFF7E6", type: ShadingType.CLEAR },
          margins: { top: 120, bottom: 120, left: 180, right: 180 },
          children: [
            new Paragraph({ spacing: { before: 0, after: 30 }, children: [new TextRun({ text: label, bold: true, size: 19, color: NAVY, font: "Calibri" })] }),
            new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text, size: 18, color: BODY, font: "Calibri" })] }),
          ]
        })
      ]
    })]
  });
}

function codeBlock(codeLines) {
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({
      children: [
        new TableCell({
          borders: thinBorders,
          shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 160, right: 160 },
          children: codeLines.map(line => new Paragraph({
            spacing: { before: 10, after: 10 },
            children: [new TextRun({ text: line, size: 16, color: "1E293B", font: "Consolas" })]
          }))
        })
      ]
    })]
  });
}

function metaRow(label, value, fill) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 2800, type: WidthType.DXA },
        borders: noBorders,
        shading: { fill, type: ShadingType.CLEAR },
        margins: { top: 70, bottom: 70, left: 0, right: 120 },
        children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: label, size: 19, color: LABEL, font: "Calibri" })] })]
      }),
      new TableCell({
        width: { size: CW - 2800, type: WidthType.DXA },
        borders: noBorders,
        shading: { fill, type: ShadingType.CLEAR },
        margins: { top: 70, bottom: 70, left: 120, right: 0 },
        children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: value, bold: true, size: 19, color: NAVY, font: "Calibri" })] })]
      }),
    ]
  });
}

function dataTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const norm = colWidths.map(w => Math.round(w / total * CW));
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: norm,
    rows: [
      new TableRow({
        children: headers.map((h, i) => new TableCell({
          width: { size: norm[i], type: WidthType.DXA },
          borders: thinBorders,
          shading: { fill: NAVY, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: h, bold: true, size: 17, color: WHITE, font: "Calibri" })]
          })]
        }))
      }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((cell, ci) => new TableCell({
          width: { size: norm[ci], type: WidthType.DXA },
          borders: thinBorders,
          shading: { fill: ri % 2 === 0 ? WHITE : GRAY_LIGHT, type: ShadingType.CLEAR },
          margins: { top: 70, bottom: 70, left: 100, right: 100 },
          verticalAlign: VerticalAlign.TOP,
          children: [new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 0 },
            children: [new TextRun({
              text: cell,
              size: 17,
              color: ci === 0 ? NAVY : BODY,
              bold: ci === 0,
              font: "Calibri"
            })]
          })]
        }))
      }))
    ]
  });
}

function checklistTable(items) {
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [600, CW - 600],
    rows: items.map((item, idx) => new TableRow({
      children: [
        new TableCell({
          width: { size: 600, type: WidthType.DXA },
          borders: thinBorders,
          shading: { fill: idx % 2 === 0 ? WHITE : GRAY_LIGHT, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 60, right: 60 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "[PASS]", bold: true, size: 16, color: GREEN_DARK, font: "Calibri" })] })]
        }),
        new TableCell({
          width: { size: CW - 600, type: WidthType.DXA },
          borders: thinBorders,
          shading: { fill: idx % 2 === 0 ? WHITE : GRAY_LIGHT, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: item, size: 17, color: BODY, font: "Calibri" })] })]
        })
      ]
    }))
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 19, color: BODY } } } },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: { indent: { left: 420, hanging: 210 } },
          run: { color: GOLD, size: 19 }
        }
      }]
    }]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            spacing: { before: 0, after: 60 },
            tabStops: [{ type: TabStopType.RIGHT, position: CW }],
            children: [
              new TextRun({ text: "TECHNICAL & SECURITY DOCUMENTATION  \u00B7  CANAAN ERP", size: 14, color: HEADER_GRAY, font: "Calibri" }),
              new TextRun({ text: "\t", size: 14, font: "Calibri" }),
              new TextRun({ text: "August 2026", size: 14, color: HEADER_GRAY, font: "Calibri" }),
            ]
          }),
          new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" } }, spacing: { before: 0, after: 0 }, children: [new TextRun("")] }),
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
            spacing: { before: 60, after: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: CW }],
            children: [
              new TextRun({ text: "Confidential  \u00B7  Canaan Global International Fleet ERP", size: 14, color: HEADER_GRAY, font: "Calibri" }),
              new TextRun({ text: "\tPage ", size: 14, color: HEADER_GRAY, font: "Calibri" }),
              new SimpleField("PAGE", undefined),
            ]
          })
        ]
      })
    },

    children: [

      // ══════ COVER SECTION ══════
      gap(100),
      new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: "TECHNICAL SPECIFICATION", bold: true, size: 48, color: NAVY, font: "Calibri" })] }),
      new Paragraph({ spacing: { before: 0, after: 180 }, children: [new TextRun({ text: "Canaan ERP: Complete Technical & Security Architecture", size: 24, color: GOLD, font: "Calibri" })] }),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [2800, CW - 2800],
        rows: [
          metaRow("System Name", "Canaan Global International: Fleet & Logistics ERP", WHITE),
          metaRow("Components", "FastAPI Backend, Next.js 16 Web App, Flutter Mobile App, Electron", GRAY_LIGHT),
          metaRow("Mobile Package", "`canaan_mobile_flutter` (v1.0.0+1, ID: `com.canaanglobal.erp`)", WHITE),
          metaRow("Target Audience", "Software Engineers, System Architects, SREs, Security Auditors", GRAY_LIGHT),
          metaRow("Last Updated", "August 2026 (Enterprise Hardening & Mobile Integration Pass)", WHITE),
          metaRow("Classification", "Confidential: Client Architecture Reference", GRAY_LIGHT),
        ]
      }),

      gap(160),

      // ══════ 1. EXECUTIVE SUMMARY & SYSTEM ARCHITECTURE ══════
      h1("1.  Executive Summary & System Architecture"),
      gap(40),
      body("Canaan ERP is a specialized, trip-centric logistics enterprise system designed for container transport operations in Chennai port logistics. The platform manages the entire operational lifecycle: booking intake, vehicle and driver assignment, on-road tracking, trip-sheet reconciliation, accounts verification, and GST-compliant invoice generation, alongside fleet compliance, maintenance, tyre lifecycle management, fuel logging, staff and driver attendance, finance, and per-truck P&L analytics."),
      gap(60),
      body("The system is deployed as a unified four-tier ecosystem:"),
      bullet("FastAPI (Python 3.10+) serving 205 endpoints across 21 domain routers with token-guarded authentication, optimistic locking, and real-time state broadcasts.", "1. Backend REST API & WebSocket Server:"),
      bullet("MySQL with ~40 normalized tables, document BLOB storage (LONGBLOB up to 25 MB), and automated startup migrations.", "2. Relational Database:"),
      bullet("Next.js 16 (App Router) with React 19 Single Page Application, also packageable as an Electron desktop application.", "3. Web & Desktop Frontend:"),
      bullet("Flutter (iOS & Android) Admin client providing real-time operational monitoring, offline caching, and biometric hardware security.", "4. Mobile Companion App:"),

      gap(80),
      h2("High-Level Ecosystem Topology"),
      codeBlock([
        "+-----------------------------------------------------------------------------+",
        "|                                CLIENT LAYER                                 |",
        "|   +----------------------------------+   +------------------------------+   |",
        "|   |   Web / Desktop App (Next.js 16) |   | Mobile App (Flutter 3.44.x)  |   |",
        "|   |   - 41 App Router pages (React)  |   | - Admin companion client     |   |",
        "|   |   - Electron desktop build       |   | - Android & iOS targets      |   |",
        "|   |   - Client-side PDF generation   |   | - SharedPreferences cache    |   |",
        "|   +-----------------+----------------+   +--------------+---------------+   |",
        "+---------------------|-----------------------------------|-------------------+",
        "                      | HTTPS (Bearer JWT)                | HTTPS (Bearer JWT)",
        "                      | WSS /ws (Realtime hints)          | TLS CA Pinning",
        "                      v                                   v",
        "+-----------------------------------------------------------------------------+",
        "|                           BACKEND & SECURITY LAYER                          |",
        "|   FastAPI Application (Python 3.10+, ASGI / Uvicorn)                        |",
        "|   |-- Security & Auth (JWT HS256, In-Memory Revocation Denylist)            |",
        "|   |-- 7 Software Designation Role Guards                                    |",
        "|   |-- IP + Username Brute-Force Lockout Tracker                             |",
        "|   |-- Real-time Broadcast Middleware (WebSocket connection registry)        |",
        "|   |-- Magic-Byte File Validation & Secure BLOB Serving Engine               |",
        "|   \\-- 21 Feature Routers (205 REST Endpoints)                               |",
        "+--------------------------------------|--------------------------------------+",
        "                                       | PyMySQL / SQLAlchemy 2.0",
        "                                       v",
        "+-----------------------------------------------------------------------------+",
        "|                              DATA STORE LAYER                               |",
        "|   MySQL Relational Database (~40 Normalized Tables, Optimistic Locking)     |",
        "|   |-- Document BLOB Storage (LONGBLOB up to 25 MB)                          |",
        "|   |-- Append-Only Tamper-Evident Audit Trail (audit_logs)                   |",
        "|   \\-- Startup Automated Idempotent Schema Migrations                        |",
        "+-----------------------------------------------------------------------------+"
      ]),

      gap(100),
      h2("Repository Layout"),
      codeBlock([
        "Canaan-erp-v1/",
        "|-- backend/                 # FastAPI REST Engine (21 feature routers, security, audit)",
        "|-- frontend/                # Next.js 16 App Router (41 pages across 7 operational domains)",
        "|-- Canaan_mobile/           # Flutter Android & iOS client (Riverpod, Dio, Secure Storage)",
        "\\-- docs/                    # Technical & Security master documentation"
      ]),

      gap(160),
      pageBreak(),

      // ══════ 2. TECHNOLOGY STACK ══════
      h1("2.  Technology Stack Reference"),
      gap(40),
      h2("Backend Technology Stack"),
      dataTable(
        ["Layer / Concern", "Technology", "Version", "Rationale"],
        [
          ["Web Framework", "FastAPI", "0.104+ (Async / ASGI)", "High throughput, native OpenAPI generation, dependency injection"],
          ["ASGI Server", "Uvicorn / Passenger", "Single-worker (--workers 1)", "Preserves in-process lockout, broadcast, and revocation state"],
          ["ORM", "SQLAlchemy", "2.0 (Declarative)", "Type safety, optimistic locking support, complex joins"],
          ["DB Driver", "PyMySQL + Cryptography", "1.1+", "Native Python MySQL driver supporting TLS and caching sha2"],
          ["Validation", "Pydantic", "2.5+ (V2 Core)", "Fast payload parsing and response serialization"],
          ["Cryptography / Auth", "python-jose + bcrypt", "HS256 / passlib", "Secure JWT signing and salt-hashed password storage"],
          ["File Validation", "python-multipart + magic", "Native binary sniffing", "Validates file headers to reject disguised executables"],
        ],
        [22, 22, 22, 34]
      ),

      gap(100),
      h2("Web Frontend Technology Stack"),
      dataTable(
        ["Layer / Concern", "Technology", "Version", "Rationale"],
        [
          ["Framework", "Next.js", "16.2 (App Router)", "Server-rendered shells, client-side SPA routing, React 19 compatibility"],
          ["UI Library", "React", "19.2", "Modern concurrent rendering, hooks, context API"],
          ["Language", "TypeScript", "5.x", "Strict static typing across models and API clients"],
          ["Styling", "Tailwind CSS", "v4 (CSS Variables)", "Universal dark/light theme remapping without inline class clutter"],
          ["Icons & Charts", "Lucide React + Recharts", "Latest", "Standardized UI iconography and interactive analytics"],
          ["PDF Generation", "jsPDF + html2canvas", "Client-Side", "Instant in-browser generation of LR notes, invoices, and reports"],
          ["Desktop Wrapper", "Electron", "Optional build", "Native desktop window execution for office workstations"],
        ],
        [22, 22, 22, 34]
      ),

      gap(100),
      h2("Mobile Client Technology Stack (Flutter)"),
      dataTable(
        ["Layer / Concern", "Technology", "Version", "Rationale"],
        [
          ["Framework & SDK", "Flutter / Dart", "Flutter 3.44.x / Dart ^3.12.2", "Cross-platform native compilation for Android and iOS"],
          ["State Management", "flutter_riverpod", "^2.5.1", "Declarative, compile-safe dependency and state injection"],
          ["Routing", "go_router", "^14.2.7", "Declarative routing with redirection guards and shell layouts"],
          ["Networking", "dio", "^5.7.0", "Advanced interceptor chain (TLS pinning, auth, caching, 401/403)"],
          ["Secure Storage", "flutter_secure_storage", "^9.2.2", "Hardware-backed KeyStore (Android) / Keychain (iOS)"],
          ["Local Cache", "shared_preferences", "^2.3.2", "Persistent write-through offline fallback cache"],
          ["Biometric Auth", "local_auth", "^2.3.0", "Hardware fingerprint, Face ID, and PIN unlock prompt"],
          ["Root Detection", "safe_device", "^1.1.4", "Anti-tamper, jailbreak, and root detection (fail-closed)"],
        ],
        [22, 22, 22, 34]
      ),

      gap(160),
      pageBreak(),

      // ══════ 3. ROLES & ACCESS CONTROL (RBAC) ══════
      h1("3.  Roles, Permissions & Access Control (RBAC)"),
      gap(40),
      body("The system enforces strict Role-Based Access Control mapped directly to organizational roles. Each staff member is assigned a software_designation stored in their profile and encoded inside their signed JWT access token."),
      gap(60),

      dataTable(
        ["Software Designation", "Staff Person", "Functional Scope", "Primary Workspaces"],
        [
          ["Admin", "Managing Director", "Full unrestricted access, security audit log, lockout resets, edit approvals, deletions", "/, /admin/*, /insights/*, /attendance/*"],
          ["Commercial Manager", "Kumar", "Booking creation, trip and driver assignment, customer rate cards, pricing", "/trips/assign, /trips/current, /resources/customers"],
          ["Assistant Commercial Manager", "Shibu", "Trip assignment, vehicle tracking, per-trip P&L and mileage analysis, fleet master", "/trips/current, /trips/pnl-mileage, /resources/fleet"],
          ["Accounts", "Sunder, Thanamani", "Trip verification, invoice generation, GST/financial accounting, EMI, compensation", "/trips/verification, /trips/finalization, /finance/*, /insights/pl-summary"],
          ["Maintenance", "Jebarson", "Workshop records, tyre inventory and fitment, retreading, compliance renewals", "/maintenance/trucks, /maintenance/tyre-management, /maintenance/compliance"],
          ["Trip Sheet Register (Docs)", "Latha, Siva", "Trip sheet reconciliation (Docs 1 & 2), diesel logging, variance remarks, re-checking", "/trips/reconciliation, /maintenance/fuel-history"],
          ["Yard Supervisor", "Antony", "Physical trip sheet collection, driver advance verification, gate tracking", "/trips/sheet-collection"],
        ],
        [24, 18, 30, 28]
      ),

      gap(100),
      h2("Enforcement Mechanisms"),
      bullet("Every business router requires a valid JWT via Depends(get_current_user). Sensitive endpoints enforce strict role checks (for example: /finance and /pl-summary require Accounts or Admin).", "Backend Route Guards:"),
      bullet("Sidebar.tsx and nav-config.ts maintain a strict ROLE_HREFS map. Unauthorized items are omitted from the DOM. On login, roles without global dashboard access are redirected to their home workspace.", "Frontend Navigation Guards:"),
      bullet("The mobile companion application strictly restricts login to the Admin role, validated client-side prior to token storage and enforced server-side on all endpoints.", "Mobile Client Gating:"),

      gap(160),

      // ══════ 4. DATA MODEL & ENTITY ARCHITECTURE ══════
      h1("4.  Data Model & Entity-Relationship Architecture"),
      gap(40),
      body("The database contains ~40 normalized tables across 8 logical domains. All mutable business entities implement Optimistic Concurrency Control through an integer version column and UTC timestamps (created_at, updated_at)."),
      gap(60),

      codeBlock([
        "Administration  : Branch (Operating branches, halt fees, driver compensation %)",
        "Resource Hub    : Truck, Driver, Staff, Customer (Origins, Destinations, Pricing), Vendor",
        "Trip Operations : DriverAssignment, Trip (Central Hub), TripClosure, TripSheet, TripInvoice",
        "Attendance & HR : DriverAttendance, StaffAttendance, DriverAttendanceRemark, LeaveRequest",
        "Maintenance     : MaintenanceRecord, FuelLog (Auto-synced), AdBlueLog, TyreInventory, TyreFitment",
        "Finance Hub     : EmiRecord, RecurringPayment, CompensationTransaction, EditApprovalRequest",
        "System & Audit  : AuditLog (Append-only security log), Notification (Alerts feed)"
      ]),

      gap(100),
      h2("Architectural Data Rules"),
      bullet("The Trip model holds hard foreign keys to Customer, but stores driver_id and vehicle_id as stable string references (CGI-D001, CGI-T001). Historical manifests remain immutable even if driver or truck records are modified.", "Decoupled Trip Hub:"),
      bullet("When a TripSheet is saved, the backend parses its embedded diesel_entries JSON and automatically creates or updates corresponding entries in FuelLog tagged with source = 'Trip Sheet-{id}'.", "Automatic Diesel Sync:"),
      bullet("CompensationTransaction and LeaveRequest handle both staff and driver records through polymorphic composite keys (person_type + person_id, category + applicant_id).", "Polymorphic Transactions:"),

      gap(160),
      pageBreak(),

      // ══════ 5. CORE BUSINESS WORKFLOWS ══════
      h1("5.  Core Business Workflows"),
      gap(40),
      h2("Six-Stage Container Trip Lifecycle"),
      codeBlock([
        "[1. ASSIGNMENT]   ==>  [2. EXECUTION]   ==>  [3. COLLECTION]",
        "Commercial Mgr         On-Road Tracking       Yard Supervisor",
        "(Kumar)                Status Lifecycle       (Antony)",
        "       |                                             |",
        "       v                                             v",
        "[6. INVOICING]    <==  [5. VERIFY]      <==  [4. RECONCILE]",
        "Accounts Auto          Accounts Team          Docs / Register",
        "TM / BS / Tax          Sunder / Thanamani     (Latha, Siva)"
      ]),

      gap(80),
      bullet("Container Number regex verification requires exactly 4 uppercase letters followed by 7 digits (^[A-Z]{4}[0-9]{7}$) across up to 3 container slots. 'Self' (CGI) logic locks payment to Credit, invoice to Transport Memo (no GST), and hides driver advances.", "Stage 1: Trip Booking & Assignment (Commercial Manager):"),
      bullet("Trip status advances through: Assigned -> Started -> Loaded -> On-Transit -> Reached -> Unloaded -> Completed. Live status changes emit real-time WebSocket broadcasts.", "Stage 2: Trip Execution:"),
      bullet("Yard supervisor collects physical trip sheets upon truck return, verifies cash advances issued to drivers, records ts_received_date, and flags missing sheets if uncollected within 24 hours.", "Stage 3: Trip Sheet Collection (Yard Supervisor):"),
      bullet("Docs team enters odometers, cargo weights, toll expenses, port pass, mamool, and fuel receipts. A +/- 10% KM variance vs approx_km triggers a mandatory remark popup before saving. Fuel receipts auto-replicate to vehicle FuelLog.", "Stage 4: Trip Sheet Reconciliation (Docs Team):"),
      bullet("Accounts verifies freight rates, driver expenses, and net margins. Approval (Tick) locks reconciliation and enables invoice creation. Rejection (Cross) logs reason and shifts trip to rejected status with an alert banner on Docs dashboard.", "Stage 5: Accounts Verification (Accounts Team):"),
      bullet("Automatic document determination: Self (CGI) -> Transport Memo; Customer + GTA -> Bill of Supply; Customer + Non-GTA -> Tax Invoice. Numbering sequences: CGI{FY}/TM{nnnn}, CGI{FY}/BS{nnnn}, CGI{FY}/T{nnnn}. Client-side A4 LR Consignment Note generation.", "Stage 6: Invoice & LR Consignment Generation:"),

      gap(100),
      h2("Edit & Delete Approval Protocol"),
      body("Modifying sensitive records (Customers, Vendors, Bookings, Trip Sheets, Closed Trips) requires an EditApprovalRequest. Upon Admin approval, the backend issues an authorization token granting a strict 1-hour editing window (expires_at)."),

      gap(100),
      h2("Compliance Expiry Warning Engine"),
      body("Fleet compliance documents trigger proactive dashboard warnings: Fitness Certificate (30 days notice), Permits (10 days notice), Road Tax (10 days notice), PUC and Insurance (7 days notice)."),

      gap(160),

      // ══════ 6. BACKEND API REFERENCE ══════
      h1("6.  Backend API Reference & Endpoint Catalog"),
      gap(40),
      body("The FastAPI backend exposes 205 REST endpoints distributed across 21 feature routers, plus WebSocket and health routes."),
      gap(60),

      dataTable(
        ["Router Prefix", "Endpoints", "Functional Scope"],
        [
          ["/auth", "5", "Login, logout, audit trail, lockout list and reset"],
          ["/trips", "28", "Full trip lifecycle, closures, sheets, verification, invoices, LR"],
          ["/trucks", "5", "Fleet master CRUD and compliance tracking"],
          ["/drivers", "8", "Driver master CRUD and truck assignments"],
          ["/staff", "5", "Staff master CRUD, credentials, and designations"],
          ["/customers", "22", "Customers, origin/destinations, rate cards, final pricing"],
          ["/vendors", "5", "Vendor master CRUD and tax categories"],
          ["/attendance", "23", "Staff/driver daily attendance, leave workflows, late logs"],
          ["/maintenance", "19", "Vehicle service records, fuel logs, AdBlue logs"],
          ["/tyre-inventory", "6", "Tyre stock, retreading lifecycle, and condition"],
          ["/tyre-fitment", "4", "Tyre mounting, removal, and axle swaps"],
          ["/finance", "15", "EMI records, recurring bills, compensation (Accounts-only)"],
          ["/edit-approvals", "6", "1-hour time-limited edit/delete authorization workflow"],
          ["/branches", "5", "Operating branch configuration"],
          ["/repair-types", "4", "Standard vehicle repair catalogue"],
          ["/sac-codes", "6", "SAC codes, GST rates, and invoice mappings"],
          ["/operating-costs", "2", "Operating cost calculator and tyre base rates"],
          ["/trip-expense-rates", "2", "Standard default trip expense rates"],
          ["/dashboard", "2", "Role-specific aggregated KPI metrics"],
          ["/pl-summary", "1", "Per-truck P&L financial summary (Accounts-only)"],
          ["/notifications", "4", "Notification feed and read receipts"],
          ["/files", "2", "Token-guarded document/photo upload and download"],
          ["/exports", "20", "Excel and PDF export endpoints across modules"],
          ["/backup", "3", "Database SQL, Excel, and file archive dumps"],
          ["/ws", "WebSocket", "Real-time data change broadcast socket"],
          ["/", "GET", "Public API health check"],
        ],
        [28, 16, 56]
      ),

      gap(160),
      pageBreak(),

      // ══════ 7. FRONTEND ARCHITECTURE ══════
      h1("7.  Frontend Architecture (Web & Desktop)"),
      gap(40),
      body("The web application is structured under the Next.js 16 App Router (frontend/src/app), providing 41 operational pages."),
      gap(60),

      dataTable(
        ["Page Route", "Page Title", "Authorized Roles"],
        [
          ["/", "Main Dashboard", "All Roles (Role-Specific Widgets)"],
          ["/login", "Login", "Public Access"],
          ["/insights/pl-summary", "P&L Summary", "Admin, Accounts"],
          ["/insights/operating-cost-calculator", "Cost Calculator", "Admin"],
          ["/trips/assign", "Assign Trips", "Commercial, Asst Commercial"],
          ["/trips/assign-drivers", "Assign Drivers", "Commercial, Asst Commercial"],
          ["/trips/current", "Current Trips", "Commercial, Asst Commercial"],
          ["/trips/completed", "Completed Trips", "Commercial, Asst Commercial"],
          ["/trips/available", "Available Trips", "Commercial"],
          ["/trips/sheet-collection", "Sheet Collection", "Yard Supervisor"],
          ["/trips/reconciliation", "Trip Reconciliation", "Trip Sheet Register (Docs)"],
          ["/trips/verification", "Verification & Invoicing", "Accounts"],
          ["/trips/finalization", "Finalization", "Accounts"],
          ["/trips/history", "Trip History", "Admin, Commercial, Accounts"],
          ["/trips/pnl-mileage", "P&L & Mileage", "Asst Commercial Manager"],
          ["/resources/staff", "Staff Directory", "Admin"],
          ["/resources/drivers", "Drivers Directory", "Admin, Commercial"],
          ["/resources/fleet", "Fleet Directory", "Admin, Commercial"],
          ["/resources/customers", "Customer Directory", "Admin, Commercial, Accounts"],
          ["/resources/vendors", "Vendor Directory", "Admin"],
          ["/maintenance/trucks", "Truck Maintenance", "Admin, Maintenance"],
          ["/maintenance/tyre-management", "Tyre Management", "Admin, Maintenance"],
          ["/maintenance/tyre-inventory", "Tyre Inventory", "Admin, Maintenance"],
          ["/maintenance/fuel-history", "Fuel History", "Admin, Trip Sheet Register"],
          ["/maintenance/compliance", "Compliance Renewals", "Admin, Accounts"],
          ["/finance/driver-compensation", "Driver Compensation", "Admin, Accounts"],
          ["/finance/staff-compensation", "Staff Compensation", "Admin"],
          ["/finance/emi-tracking", "EMI Tracking", "Admin, Accounts"],
          ["/finance/recurring-payments", "Recurring Payments", "Admin"],
          ["/attendance/mark", "Mark Attendance", "All Staff"],
          ["/attendance/drivers", "Driver Attendance", "Admin, Commercial, Asst Commercial"],
          ["/attendance/staff", "Staff Attendance", "Admin"],
          ["/attendance/leave-requests", "Leave Requests", "All Staff"],
          ["/attendance/leave-approvals", "Leave Approvals", "Admin"],
          ["/attendance/edit-approvals", "Edit Approvals", "Admin, Commercial"],
          ["/attendance/report", "Attendance Report", "Admin"],
          ["/admin/branches", "Branch Management", "Admin"],
          ["/admin/trip-expenses", "Trip Expenses Config", "Admin"],
          ["/admin/repairs", "Repairs Management", "Admin"],
          ["/admin/sac-codes", "SAC Code Config", "Admin, Accounts"],
          ["/admin/adblue", "AdBlue Config", "Admin"],
          ["/admin/security", "Security Log", "Admin"],
        ],
        [32, 28, 40]
      ),

      gap(100),
      h2("State Contexts & Global UX Standards"),
      bullet("Manages session in sessionStorage (isolated per tab) and triggers token revocation on logout.", "AuthContext:"),
      bullet("Remaps Tailwind CSS variables in globals.css for instant dark/light theme switching with glowing card visuals.", "ThemeContext:"),
      bullet("Maintains shared WebSocket connection with reconnect retry caps and 30s heartbeats.", "WebSocketContext:"),
      bullet("Strict 10-rows-per-page pagination with sticky headers; 15-minute idle auto-logout (useIdle); client-side PDF synthesis with jsPDF.", "UX Standards:"),

      gap(160),
      pageBreak(),

      // ══════ 8. MOBILE CLIENT ARCHITECTURE ══════
      h1("8.  Mobile Client Architecture (Flutter)"),
      gap(40),
      body("The mobile companion application (Canaan_mobile) is tailored for executive fleet administration on Android and iOS devices."),
      gap(60),

      dataTable(
        ["Provider", "Type", "Backend Route", "Function"],
        [
          ["authProvider", "StateNotifier", "POST /auth/login", "Session state; checks JWT expiry on boot"],
          ["dashboardProvider", "FutureProvider", "GET /dashboard/overview", "Executive KPI metrics"],
          ["fleetProvider", "FutureProvider", "GET /trucks", "Fleet list with 5-minute cache TTL"],
          ["currentTripsProvider", "FutureProvider", "GET /trips?status=active", "Active on-road trips"],
          ["allTripsProvider", "FutureProvider", "GET /trips", "Complete trip history"],
          ["attendanceProvider", "Future.family", "GET /attendance/summary", "Date-keyed staff attendance"],
          ["driverAttendanceProvider", "Future.family", "GET /attendance/drivers", "Date-keyed driver attendance"],
          ["plSummaryProvider", "FutureProvider", "GET /pl-summary", "Per-truck P&L statement"],
          ["securityLogProvider", "Future.family", "GET /auth/audit-logs", "Paginated security audit trail"],
          ["lockoutsProvider", "FutureProvider", "GET /auth/lockouts", "Active login lockout records"],
          ["themeProvider", "StateNotifier", "Local Storage", "Persisted Light/Dark theme mode"],
        ],
        [28, 22, 24, 26]
      ),

      gap(100),
      h2("Offline Caching Engine (core/cache/api_cache.dart)"),
      bullet("Every successful GET response is stored in device SharedPreferences.", "Write-Through Persistence:"),
      bullet("Network errors or 5xx server failures serve cached data tagged with a stale indicator.", "Offline Fallback:"),
      bullet("Stable resources (such as Fleet Master) return cached data instantly when younger than TTL (5 minutes).", "Cache-First Acceleration:"),
      bullet("Pull-to-refresh gestures explicitly invoke evictCache(path) to force fresh network roundtrips.", "Active Eviction:"),

      gap(160),

      // ══════ 9. REAL-TIME SYNCHRONIZATION ══════
      h1("9.  Real-Time Synchronization & Data Consistency"),
      gap(40),
      body("The platform implements a Persist -> Broadcast -> Refetch consistency model across all clients."),
      gap(60),

      codeBlock([
        "Client Action (POST / PUT / PATCH / DELETE)",
        "                 |",
        "                 v",
        "     FastAPI Backend Router (DB Commit)",
        "                 |",
        "                 v",
        "     Realtime Broadcast Middleware",
        "                 |",
        "                 v",
        "     WebSocket Broadcast (/ws) ==> 'data_changed' { resource: 'trips' }",
        "                 |",
        "                 v",
        "     Frontend Clients (useAutoRefresh)",
        "                 |",
        "                 v",
        "     Debounced REST Re-fetch (300ms) -> UI State Updated"
      ]),

      gap(80),
      bullet("The WebSocket channel emits only lightweight resource change notifications (e.g. {'event': 'data_changed', 'resource': 'trips'}). Zero business data travels over the socket frame.", "Zero Sensitive Payload:"),
      bullet("/ws?token=<jwt> validates token signature, expiry, and revocation denylists. Sockets close automatically (code 4001) if a token expires mid-session.", "Authenticated Sockets:"),
      bullet("Server-side debouncing (250ms) and client-side hook debouncing (300ms) prevent refetch storms during bulk operations.", "Debounced Throttling:"),
      bullet("In environments without persistent WebSocket proxying (such as shared cPanel hosting), useAutoRefresh falls back to 60-second polling and tab focus refreshes.", "Graceful Polling Fallback:"),

      gap(160),
      pageBreak(),

      // ══════ 10. FULL-STACK SECURITY ARCHITECTURE ══════
      h1("10. Full-Stack Security Architecture & Hardening"),
      gap(40),
      h2("Web & Backend Security Controls"),
      codeBlock([
        "1. JWT HS256 Token Auth (12-hour expiry, unique jti, fail-closed secret)",
        "2. Server-Side Token Revocation (Instant jti denylist on logout)",
        "3. IP + Username Lockout (5 failed attempts -> 15 min lock; Admin reset)",
        "4. Authenticated Document Access (Token-guarded /files/..., audit-logged)",
        "5. Magic-Byte Upload Sniffing (File signature validation; 25 MB cap)",
        "6. Append-Only Tamper-Evident Audit Trail (audit_logs table)",
        "7. Constant-Time Admin Authentication (secrets.compare_digest)",
        "8. Hardened Security Headers (CSP, X-Frame-Options: DENY, HSTS opt-in)",
        "9. Safe Error Hygiene (Generic client errors, server-only stack traces)"
      ]),

      gap(100),
      h2("Mobile Client Security Controls"),
      codeBlock([
        "1. CA-Level Certificate Pinning (Pinned to Let's Encrypt CA chain)",
        "2. Hardened OS Storage (EncryptedSharedPreferences / Keychain first_unlock)",
        "3. Proactive + Reactive Session Expiry (Local exp check + 401/403 purge)",
        "4. Root / Jailbreak Detection (Fail-closed SecurityGate block screen)",
        "5. Biometric & Credential App Lock (local_auth, re-locks on background)",
        "6. Native Screen-Capture Protection (FLAG_SECURE / iOS privacy cover)",
        "7. Release Code Hardening (Android R8 Shrinking + Dart Symbol Obfuscation)",
        "8. Cleartext HTTP Blocked & Cloud Backups Disabled"
      ]),

      gap(100),
      bullet("Pins HTTPS traffic to the Let's Encrypt intermediate (YR1) and root (ISRG Root YR) CA chain, surviving 60-day leaf renewals while blocking proxy interception.", "CA-Level TLS Pinning:"),
      bullet("Android uses EncryptedSharedPreferences (AES-256-GCM in KeyStore/StrongBox). iOS uses Keychain with first_unlock_this_device. Cloud backups disabled.", "Hardened Hardware Storage:"),
      bullet("Detects root binaries, test-keys, and Magisk/Jailbreak hooks via safe_device. Compromised devices are halted at a fail-closed block screen.", "Device Integrity Gate:"),
      bullet("Android sets FLAG_SECURE in MainActivity.kt. iOS adds a privacy window overlay in SceneDelegate.swift upon sceneWillResignActive.", "Screen-Capture Protection:"),

      gap(160),

      // ══════ 11. DATABASE MIGRATIONS ══════
      h1("11. Database Migrations & Data Maintenance"),
      gap(40),
      body("The database layer utilizes an automated startup migration pipeline inside backend/main.py:"),
      bullet("Creates any missing tables on application boot.", "Base.metadata.create_all():"),
      bullet("Applies guarded ALTER TABLE statements inside independent transactions. Missing columns, expanded enums, newly added indexes, and foreign keys are provisioned automatically.", "_run_schema_migrations():"),
      bullet("Automatically migrates legacy role names (for example: Fleet Manager -> Commercial Manager, Staff -> Trip Sheet Register) with data backfills.", "Role-Rename Migrations:"),
      bullet("Automatically upgrades document columns from MEDIUMBLOB to LONGBLOB (supporting 25 MB document uploads).", "BLOB Widening:"),
      bullet("Seeds default RepairType and expense rate categories on fresh database instances.", "Default Seeds:"),

      gap(160),
      pageBreak(),

      // ══════ 12. BUILD, RELEASE & DEPLOYMENT ══════
      h1("12. Build, Release & Deployment Guide"),
      gap(40),
      h2("Backend Environment Configuration (backend/.env)"),
      codeBlock([
        "APP_ENV=production",
        "DB_HOST=127.0.0.1",
        "DB_USER=canaan_dbuser",
        "DB_PASSWORD=SecureProductionPassword",
        "DB_NAME=canaan_erp",
        "SECRET_KEY=64HexCharactersGeneratedSecretKeyString",
        "ACCESS_TOKEN_EXPIRE_HOURS=12",
        "ADMIN_USERNAME=admin@canaanglobalinternational.com",
        "ADMIN_PASSWORD=ComplexSuperAdminPassword",
        "CORS_ORIGINS=https://erp.canaanglobalinternational.com",
        "ENABLE_HSTS=1",
        "MIN_PASSWORD_LENGTH=10"
      ]),
      gap(60),
      body("Execute Uvicorn in single-worker mode: `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1`"),

      gap(100),
      h2("Web & Mobile Release Build Commands"),
      codeBlock([
        "# Web Frontend Build",
        "npm install && npm run build && npm run start",
        "",
        "# Mobile Android APK (Direct install / sideloading)",
        "flutter build apk --release --obfuscate --split-debug-info=build/symbols",
        "",
        "# Mobile Android App Bundle (Google Play Store release)",
        "flutter build appbundle --release --obfuscate --split-debug-info=build/symbols",
        "",
        "# Mobile iOS Archive (Apple App Store / TestFlight)",
        "flutter build ipa --release --obfuscate --split-debug-info=build/symbols"
      ]),

      gap(160),

      // ══════ 13. API REQUEST & RESPONSE EXAMPLES ══════
      h1("13. API Request & Response Examples"),
      gap(40),
      h2("Authentication: POST /auth/login"),
      codeBlock([
        "// Request",
        "{ 'username': 'kumar@canaanglobalinternational.com', 'password': 'UserPassword123' }",
        "",
        "// 200 OK Response",
        "{",
        "  'access_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',",
        "  'token_type': 'bearer',",
        "  'id': 4, 'name': 'Kumar', 'email': 'kumar@canaanglobalinternational.com',",
        "  'software_designation': 'Commercial Manager', 'staff_id': 'STF-1004'",
        "}"
      ]),

      gap(80),
      h2("Trip Creation: POST /trips"),
      codeBlock([
        "// Request",
        "{",
        "  'booking_reference_no': 'BR-2026-0450', 'scheduled_date': '2026-08-11',",
        "  'trip_category': 'OUTSTATION', 'customer_id': 12, 'cargo_classification': 'EXPORT',",
        "  'container_specification': '40 FT CONTAINER', 'container_number': 'TWCU2081370',",
        "  'origin': 'Chennai Port', 'destination': 'Bangalore ICD',",
        "  'driver_id': 'CGI-D001', 'vehicle_id': 'CGI-T001', 'bill_to': 'CUSTOMER',",
        "  'payment_type': 'Credit', 'approx_km': 350, 'transport_hire_amount': 28000",
        "}",
        "// 201 Created Response",
        "{ 'id': 1051, 'trip_id': 'TRP-1051', 'status': 'Assigned', 'verification_status': 'pending' }"
      ]),

      gap(80),
      h2("Standard Error Envelope Mapping"),
      dataTable(
        ["HTTP Status", "Trigger Condition"],
        [
          ["400 Bad Request", "Business validation conflict or malformed state transition"],
          ["401 Unauthorized", "Missing, invalid, expired, or revoked Bearer token"],
          ["403 Forbidden", "User software designation lacks endpoint privilege"],
          ["409 Conflict", "Optimistic lock concurrency failure or unique constraint clash"],
          ["422 Unprocessable", "Request body failed Pydantic schema validation"],
          ["429 Rate / Lockout", "Brute-force threshold exceeded (5 failed logins)"],
          ["500 Server Error", "Internal exception; sanitized generic message returned to client"],
        ],
        [35, 65]
      ),

      gap(160),
      pageBreak(),

      // ══════ 14. SECURITY CONTROLS MATRIX & THREAT SCENARIOS ══════
      h1("14. Security Controls Matrix & Real-World Threat Scenarios"),
      gap(40),
      dataTable(
        ["Control ID", "Security Control", "Location", "Web", "Mobile"],
        [
          ["CRITICAL-1", "Authenticated Document Downloads", "routers/files.py", "Active", "Active"],
          ["HIGH-1", "Magic-Byte Upload Validation", "routers/files.py", "Active", "N/A"],
          ["HIGH-2", "Strict CORS Origin Whitelisting", "main.py", "Active", "Enforced by OS"],
          ["HIGH-3", "Admin Constant-Time Auth", "routers/auth.py", "Active", "Active"],
          ["MEDIUM-1", "Rate Limiting Strategy", "Architecture", "Documented", "N/A"],
          ["MEDIUM-2", "Server-Side JWT Revocation", "security.py", "Active", "Active"],
          ["MEDIUM-3", "Composite IP + User Lockout", "routers/auth.py", "Active", "Active"],
          ["MEDIUM-4", "Security Headers (CSP, HSTS)", "main.py", "Active", "Active"],
          ["MEDIUM-5", "Error Sanitization Hygiene", "main.py", "Active", "Active"],
          ["MEDIUM-6", "Append-Only Audit Logging", "audit.py", "Active", "Active"],
          ["LOW-2", "Password Complexity Policy", "security.py", "Active", "Active"],
          ["MOB-1", "CA-Level TLS Pinning", "tls_pinning.dart", "N/A", "Active"],
          ["MOB-2", "Hardened KeyStore Storage", "secure_store.dart", "N/A", "Active"],
          ["MOB-3", "Root & Jailbreak Gate", "device_integrity.dart", "N/A", "Active"],
          ["MOB-4", "Biometric / PIN App Lock", "app_lock.dart", "N/A", "Active"],
          ["MOB-5", "Screen-Capture Protection", "MainActivity.kt", "N/A", "Active"],
          ["MOB-6", "Release Obfuscation", "build.gradle.kts", "N/A", "Active"],
        ],
        [18, 38, 24, 10, 10]
      ),

      gap(100),
      h2("Real-World Threat Scenarios & Mitigations"),
      bullet("An external actor attempts URL enumeration against /files/driver/15/aadhaar. Mitigation: The backend requires an active JWT token; unauthenticated requests receive 401 Unauthorized, and every document access writes to audit_logs.", "Scenario A: Unauthenticated Document Scraping (CRITICAL-1):"),
      bullet("An attacker uploads an executable binary renamed to avatar.jpg. Mitigation: The server inspects the raw binary magic bytes. Non-image headers are rejected immediately regardless of file extension.", "Scenario B: Executable Disguised as Profile Photo (HIGH-1):"),
      bullet("A compromised root certificate or corporate inspection proxy attempts a Man-in-the-Middle attack on mobile traffic. Mitigation: The mobile client trusts only the embedded Let's Encrypt CA chain. Requests through untrusted proxies fail the TLS handshake before data is transmitted.", "Scenario C: Rogue CA / Proxy Interception (MOB-1):"),
      bullet("An attacker makes 5 failed login attempts against an administrator's email. Mitigation: Lockouts are keyed on (IP + Username). Only the attacker's specific composite connection is throttled; legitimate users continue working normally.", "Scenario D: Shared Office IP Brute-Force Lockout (MEDIUM-3):"),

      gap(160),

      // ══════ 15. PRODUCTION READINESS CHECKLIST ══════
      h1("15. Production Readiness Checklist"),
      gap(40),
      h2("Web & Backend Go-Live Checklist"),
      checklistTable([
        "JWT authentication enforced across all 21 feature routers",
        "Server-side token revocation operational on POST /auth/logout",
        "Production SECRET_KEY (>=32 hex chars) generated and populated in backend/.env",
        "Default ADMIN_PASSWORD changed from fallback defaults to a strong production secret",
        "CORS_ORIGINS locked to explicit production domain (https://erp.canaanglobalinternational.com)",
        "Document download routes verified behind token authorization",
        "Startup schema migrations verified on production MySQL instance",
        "HTTPS configured end-to-end; ENABLE_HSTS=1 enabled"
      ]),

      gap(100),
      h2("Mobile Client Go-Live Checklist"),
      checklistTable([
        "Application ID updated to com.canaanglobal.erp across Android and iOS configurations",
        "Production signing keystore (canaan-release.jks) generated and configured in key.properties",
        "Release APK verified signed with production certificate (CN=Canaan...)",
        "Release builds compiled with R8 code shrinking and Dart symbol obfuscation (--obfuscate)",
        "CA-level TLS certificate pinning enabled and verified",
        "Biometric lock and root detection verified on physical hardware",
        "Native screen-capture protection (FLAG_SECURE) confirmed active"
      ]),

      gap(160),
      pageBreak(),

      // ══════ 16. TROUBLESHOOTING & KNOWN LIMITATIONS ══════
      h1("16. Troubleshooting & Known Limitations"),
      gap(40),
      dataTable(
        ["Component", "Symptom", "Root Cause", "Resolution"],
        [
          ["Mobile", "Namespace not specified", "Plugin incompatible with AGP 8", "Update plugin to maintained fork (e.g. safe_device)"],
          ["Mobile", "Biometric prompt fails to appear", "Activity is not FragmentActivity", "Ensure MainActivity.kt extends FlutterFragmentActivity"],
          ["Mobile", "API calls fail after cert renewal", "Backend Certificate Authority changed", "Run OpenSSL s_client to retrieve new CA chain and update security_config.dart"],
          ["Mobile", "Release build missing Play Core", "R8 stripping required classes", "Add -dontwarn com.google.android.play.core.** to proguard-rules.pro"],
          ["Web", "WebSockets failing on cPanel", "Hosting proxy lacks persistent WS", "Expected behavior; useAutoRefresh automatically falls back to 60s polling"],
          ["Backend", "Broadcasts not reaching all users", "Uvicorn running multiple workers", "Run Uvicorn with --workers 1 or migrate connection manager to Redis"],
        ],
        [15, 28, 27, 30]
      ),

      gap(100),
      h2("Architectural Limitations & Future Roadmap"),
      bullet("The token revocation denylist, login lockout counters, and WebSocket broadcast manager operate in-process within Python memory. When scaling horizontally across multiple server instances, provision a centralized Redis cache to manage token denylists and Pub/Sub broadcasts.", "1. In-Memory State Multi-Worker Scaling:"),
      bullet("Files are currently served through token-guarded API endpoints. Future iterations will introduce short-lived HMAC pre-signed URLs (such as S3 or Cloud Storage presigned GET) for offloaded direct file streaming.", "2. Short-Lived Signed Document URLs:"),
      bullet("Implement TOTP (Time-Based One-Time Password) second-factor authentication for administrative accounts on the web client.", "3. Multi-Factor Authentication (MFA):"),

      gap(200),

      // CLOSING NOTE
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 } },
        spacing: { before: 80, after: 40 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "End of Canaan ERP Unified Technical & Security Documentation", bold: true, size: 20, color: NAVY, font: "Calibri" })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 0 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Prepared for Canaan Global International \u00B7 Confidential \u00B7 August 2026", size: 18, color: LABEL, italic: true, font: "Calibri" })]
      }),

    ]
  }]
});

const outputPath = path.join(__dirname, "Canaan_ERP_Technical_Documentation.docx");
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log(`Document generated successfully at: ${outputPath}`);
});
