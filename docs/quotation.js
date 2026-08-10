const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  LevelFormat, Header, Footer, TabStopType, SimpleField, PageBreak
} = require('docx');
const fs = require('fs');

const NAVY = "1B3157";
const GOLD = "C9A84C";
const BODY = "333333";
const LABEL = "555555";
const GRAY_LIGHT = "F5F5F5";
const LIGHT_BLUE = "EFF6FF";
const WHITE = "FFFFFF";
const HEADER_GRAY = "888888";
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
    spacing: { before: 300, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 30, color: NAVY, font: "Calibri" })]
  });
}

function h2(text) {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color: NAVY, font: "Calibri" })]
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 0, after: opts.after ?? 100 },
    children: [new TextRun({ text, size: 20, color: BODY, font: "Calibri", italic: opts.italic || false })]
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 30, after: 30 },
    children: [new TextRun({ text, size: 20, color: BODY, font: "Calibri" })]
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
          margins: { top: 140, bottom: 140, left: 200, right: 200 },
          children: [
            new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: label, bold: true, size: 19, color: NAVY, font: "Calibri" })] }),
            new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text, size: 19, color: BODY, font: "Calibri" })] }),
          ]
        })
      ]
    })]
  });
}

// Meta row for cover table
function metaRow(label, value, fill) {
  return new TableRow({
    children: [
      new TableCell({ width: { size: 2800, type: WidthType.DXA }, borders: noBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 0, right: 120 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: label, size: 20, color: LABEL, font: "Calibri" })] })] }),
      new TableCell({ width: { size: CW - 2800, type: WidthType.DXA }, borders: noBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 0 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: value, bold: true, size: 20, color: NAVY, font: "Calibri" })] })] }),
    ]
  });
}

// Generic data table
function dataTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const norm = colWidths.map(w => Math.round(w / total * CW));
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: norm,
    rows: [
      new TableRow({
        children: headers.map((h, i) => new TableCell({
          width: { size: norm[i], type: WidthType.DXA }, borders: thinBorders,
          shading: { fill: NAVY, type: ShadingType.CLEAR },
          margins: { top: 90, bottom: 90, left: 120, right: 120 },
          children: [new Paragraph({ alignment: i === norm.length - 1 && h.includes("(") ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: h, bold: true, size: 18, color: WHITE, font: "Calibri" })] })]
        }))
      }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((cell, ci) => new TableCell({
          width: { size: norm[ci], type: WidthType.DXA }, borders: thinBorders,
          shading: { fill: ri % 2 === 0 ? WHITE : GRAY_LIGHT, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          verticalAlign: VerticalAlign.TOP,
          children: [new Paragraph({ alignment: ci === r.length - 1 && (cell.includes(",") && cell.includes("0")) ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: cell, size: 18, color: ci === 0 ? NAVY : BODY, bold: ci === 0, font: "Calibri" })] })]
        }))
      }))
    ]
  });
}

// Pricing row
function priceRow(num, module, deliverables, amount, isTotal = false) {
  const fill = isTotal ? NAVY : WHITE;
  const altFill = "F8F9FF";
  const sz = isTotal ? 20 : 18;
  const rowFill = isTotal ? NAVY : (parseInt(num) % 2 === 0 ? WHITE : GRAY_LIGHT);
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 400, type: WidthType.DXA }, borders: thinBorders,
        shading: { fill: isTotal ? NAVY : NAVY, type: ShadingType.CLEAR },
        margins: { top: 90, bottom: 90, left: 100, right: 80 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: isTotal ? "" : num, bold: true, size: sz, color: WHITE, font: "Calibri" })] })]
      }),
      new TableCell({
        width: { size: 2400, type: WidthType.DXA }, borders: thinBorders,
        shading: { fill: rowFill, type: ShadingType.CLEAR },
        margins: { top: 90, bottom: 90, left: 120, right: 80 },
        verticalAlign: VerticalAlign.TOP,
        children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: module, bold: true, size: sz, color: isTotal ? WHITE : NAVY, font: "Calibri" })] })]
      }),
      new TableCell({
        width: { size: CW - 400 - 2400 - 1600, type: WidthType.DXA }, borders: thinBorders,
        shading: { fill: rowFill, type: ShadingType.CLEAR },
        margins: { top: 90, bottom: 90, left: 120, right: 80 },
        verticalAlign: VerticalAlign.TOP,
        children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: deliverables, size: 17, color: isTotal ? WHITE : BODY, font: "Calibri" })] })]
      }),
      new TableCell({
        width: { size: 1600, type: WidthType.DXA }, borders: thinBorders,
        shading: { fill: isTotal ? NAVY : rowFill, type: ShadingType.CLEAR },
        margins: { top: 90, bottom: 90, left: 80, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: amount, bold: true, size: sz, color: isTotal ? WHITE : NAVY, font: "Calibri" })] })]
      }),
    ]
  });
}

// Payment row
function payRow(milestone, pct, amount, i, isTotal = false) {
  const fill = isTotal ? NAVY : (i % 2 === 0 ? WHITE : GRAY_LIGHT);
  return new TableRow({
    children: [
      new TableCell({ width: { size: CW - 1600 - 1400, type: WidthType.DXA }, borders: thinBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 80 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: milestone, bold: isTotal, size: 19, color: isTotal ? WHITE : NAVY, font: "Calibri" })] })] }),
      new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: thinBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: pct, bold: isTotal, size: 19, color: isTotal ? WHITE : GOLD, font: "Calibri" })] })] }),
      new TableCell({ width: { size: 1400, type: WidthType.DXA }, borders: thinBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: amount, bold: true, size: 19, color: isTotal ? WHITE : NAVY, font: "Calibri" })] })] }),
    ]
  });
}

// Acceptance signature row
function sigRow(left, right) {
  return new TableRow({
    children: [
      new TableCell({ width: { size: CW / 2, type: WidthType.DXA }, borders: thinBorders, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 120 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: left, size: 19, color: BODY, font: "Calibri" })] })] }),
      new TableCell({ width: { size: CW / 2, type: WidthType.DXA }, borders: thinBorders, shading: { fill: GRAY_LIGHT, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 160 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: right, size: 19, color: BODY, font: "Calibri" })] })] }),
    ]
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// Pricing table header row
function priceHeaderRow() {
  return new TableRow({
    children: [
      new TableCell({ width: { size: 400, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 100, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "#", bold: true, size: 18, color: WHITE, font: "Calibri" })] })] }),
      new TableCell({ width: { size: 2400, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 80 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "Module / Work Package", bold: true, size: 18, color: WHITE, font: "Calibri" })] })] }),
      new TableCell({ width: { size: CW - 400 - 2400 - 1600, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 80 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "Key Deliverables", bold: true, size: 18, color: WHITE, font: "Calibri" })] })] }),
      new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "Amount (INR)", bold: true, size: 18, color: WHITE, font: "Calibri" })] })] }),
    ]
  });
}

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 20, color: BODY } } } },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 240 } }, run: { color: GOLD, size: 20 } }
      }]
    }]
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },

    headers: {
      default: new Header({
        children: [
          new Paragraph({
            spacing: { before: 0, after: 80 },
            tabStops: [{ type: TabStopType.RIGHT, position: CW }],
            children: [
              new TextRun({ text: "QUOTATION  \u00B7  CANAAN GLOBAL INTERNATIONAL", size: 14, color: HEADER_GRAY, font: "Calibri" }),
              new TextRun({ text: "\t", size: 14, font: "Calibri" }),
              new TextRun({ text: "08 August 2026", size: 14, color: HEADER_GRAY, font: "Calibri" }),
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
              new TextRun({ text: "Confidential  \u00B7  Ref: CAN-ERP-2026-002", size: 14, color: HEADER_GRAY, font: "Calibri" }),
              new TextRun({ text: "\tPage ", size: 14, color: HEADER_GRAY, font: "Calibri" }),
              new SimpleField("PAGE", undefined),
            ]
          })
        ]
      })
    },

    children: [

      // ══════ COVER ══════
      gap(140),
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: "QUOTATION", bold: true, size: 56, color: NAVY, font: "Calibri" })] }),
      new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: "Canaan ERP: Software Development", size: 26, color: GOLD, font: "Calibri" })] }),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [2800, CW - 2800],
        rows: [
          metaRow("Prepared by", "Independent Software Developer", WHITE),
          metaRow("Prepared for", "Canaan Global International", GRAY_LIGHT),
          metaRow("Date", "08 August 2026", WHITE),
          metaRow("Quotation Ref", "CAN-ERP-2026-002", GRAY_LIGHT),
          metaRow("Validity", "30 days from date of issue", WHITE),
        ]
      }),

      gap(220),

      // ══════ 1. EXECUTIVE SUMMARY ══════
      h1("1.  Executive Summary"),
      gap(60),
      body("Canaan ERP is a full-stack fleet and transport management platform built for Canaan Global International's container operations. It covers the entire business cycle: trip booking, container assignment, yard collection, documentation, reconciliation, accounts verification, and automated invoicing, with fleet, tyres, drivers, staff, attendance, compliance, and finances all in one system."),
      gap(100),
      body("It runs on four platforms:", { after: 80 }),
      bullet("Web application (Next.js 16 and React 19) accessible on any browser"),
      bullet("Windows desktop application (Electron) packaged for office use"),
      bullet("Native Android app (Flutter) as an Admin companion with enterprise security"),
      bullet("Native iOS app (Flutter) as an Admin companion with enterprise security"),
      gap(100),
      body("Seven staff roles are supported, each with its own access level: Admin, Commercial Manager, Assistant Commercial Manager, Accounts, Maintenance, Trip Sheet Register, and Yard Supervisor. All screens update live via WebSocket."),
      gap(100),
      callout("A Note on Pricing", "The \u20B93,00,000 total is a partnership rate, not the market price. A system at this scale (4 delivery targets, 205 endpoints, 46 database tables, full enterprise mobile security) typically costs \u20B95 to 6 lakhs from a senior Indian developer. This number is lower because the goal is an ongoing relationship with Canaan, not a one-time handoff."),

      gap(200),

      // ══════ 2. SCOPE OF DELIVERY ══════
      h1("2.  Scope of Delivery"),
      gap(60),
      body("Every module below has been built and delivered.", { after: 120 }),

      dataTable(
        ["#", "Module", "What Was Built"],
        [
          ["1", "Trip Management", "Full trip lifecycle: booking, container validation, hire and lift-on rules, driver assignment, live status tracking (7 statuses), sheet collection, reconciliation, verification, finalization, trip history, and available, current, and completed trip screens. 28 dedicated API endpoints."],
          ["2", "Documentation and Reconciliation", "Trip-sheet entry with all line items, diesel logging, KM variance checks and flagging, booking-reference linking, and trip closure data."],
          ["3", "Accounts and Automated Invoicing", "Approval and rejection workflow. Automated generation of 3 invoice types: Tax Invoice, Bill of Supply, and Transport Memo, each with separate auto-incrementing running numbers. Full GST handling with SAC code lookup. LR and Consignment Note generation. Driver Advance Bill (DAB) generation."],
          ["4", "Yard Supervisor Workflow", "Trip-sheet collection screen, driver advance verification, date-stamped sheet tracking, and alert popups for pending collections."],
          ["5", "Fleet and Truck Master", "Vehicle records with all specs. Document compliance tracking (FC, permits, insurance, road tax, PUC) with per-document expiry alerts. Document update workflow and tyre layout diagram."],
          ["6", "Tyre Management", "Tyre inventory with full history. Fitment records per truck. Tyre range configuration per tyre type. Tyre management table with status tracking."],
          ["7", "Fuel and AdBlue", "Fuel logs auto-synced from trip sheets. AdBlue manufacturer configuration and per-manufacturer price tracking. AdBlue usage logs."],
          ["8", "Maintenance", "Maintenance records per truck with cost tracking. Configurable maintenance types with KM-interval alerts. Maintenance history dialog and base cost configuration. 34 dedicated API endpoints."],
          ["9", "Driver and Staff Management", "Master records for drivers and staff. Photo and document storage. Role and branch assignment. Password management."],
          ["10", "Attendance and Leave", "Daily attendance marking. Driver and staff attendance with remarks and late-entry log. Monthly attendance reports. Leave requests and approvals. Edit approvals workflow for correction requests."],
          ["11", "Finance", "EMI tracking per truck with loan details, bank, and schedule. Recurring payments. Driver and staff compensation with advance, salary, and transaction history. Compensation tables with payment dialog."],
          ["12", "P&L and Analytics", "Per-trip gross P&L and mileage report. Full Profitability Summary at trip and truck level with EMI, maintenance, and document-cost deductions, date-range presets, and multi-dimensional filters. Running Cost Calculator in Manual, Basic, and Advanced modes. Customer Route Analytics and Fleet Trip Summary."],
          ["13", "Role-specific Dashboards", "4 tailored dashboards for Admin, Finance Manager, Fleet Manager, and Staff. Clickable stat cards and charts covering trip trends, fleet utilisation, and fuel consumption."],
          ["14", "Resource Hub", "Master lists for Staff, Drivers, Fleet, Customers (with origin, destination, and pricing tables), and Vendors, each with full CRUD, search, and pagination."],
          ["15", "Admin Panel", "Branches, Trip Expense Rates, Repair Types, SAC Codes, AdBlue Manufacturer Management, Truck Run Configuration, Tyre Range Configuration, Maintenance Alert Management, and Security and Audit Log."],
          ["16", "Reports and Exports", "21 Excel export endpoints covering all major data domains. PDF invoice print view. Automated Google Drive cloud backup with scheduling."],
          ["17", "AI ERP Agent", "Natural-language query interface covering trips, fleet, finance, and attendance data with intent parsing and structured response formatting."],
          ["18", "Windows Desktop App", "Electron wrapper for the Next.js web app. Windows-native menu bar. Signed release build (.exe installer). Auto-update ready."],
          ["19", "Mobile App (Android and iOS)", "Flutter 3.44 codebase with 15+ screens: dashboard, current trips, trip history, sheet tracking, fleet and compliance, maintenance, attendance, P&L summary, edit approvals, and audit log. 20+ Riverpod providers. Persistent offline cache. Signed APK, App Bundle, and iOS IPA."],
          ["20", "Mobile Security Hardening", "CA-level TLS certificate pinning. AES-256-GCM encrypted secure storage. Biometric app lock. Root and jailbreak detection. Screenshot and screen-recording protection. R8 and Dart obfuscation. Backup restriction."],
          ["21", "Backend Security Hardening", "Constant-time logins. Per-IP brute-force lockout. JWT JTI revocation denylist. Role-based middleware on all 205 endpoints. Security response headers. Authenticated file downloads. Upload magic-byte validation."],
        ],
        [5, 22, 73]
      ),

      gap(200),
      pageBreak(),

      // ══════ 3. TECHNICAL SCALE ══════
      h1("3.  Technical Scale"),
      gap(60),
      body("These numbers come from a line-by-line audit of the codebase, not estimates.", { after: 120 }),

      dataTable(
        ["Metric", "Delivered"],
        [
          ["Web application screens", "41"],
          ["Reusable UI components", "104"],
          ["Backend API endpoints", "205"],
          ["Database tables and entities", "46"],
          ["Pydantic schema classes", "136"],
          ["TypeScript type-definition files", "28"],
          ["Backend Python code (lines)", "~9,700"],
          ["Frontend TypeScript and TSX code (lines)", "~50,000"],
          ["Staff roles supported", "7"],
          ["Navigation sections (web sidebar)", "8 sections, 46 nav items"],
          ["Mobile app screens", "15+"],
          ["Delivery targets", "Web, Windows, Android, iOS"],
        ],
        [65, 35]
      ),
      gap(100),
      body("Technology stack: Next.js 16 and React 19 (web frontend), FastAPI with Python (backend), MySQL (database), WebSockets (real-time), Electron (desktop), Flutter 3.44 with Dart and Riverpod (mobile for Android and iOS), Google Drive API (automated backups).", { italic: true }),

      gap(200),

      // ══════ 4. COST BREAKDOWN ══════
      h1("4.  Cost Breakdown"),
      gap(60),
      body("The pricing breaks down module by module so every rupee is accounted for.", { after: 120 }),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [400, 2400, CW - 400 - 2400 - 1600, 1600],
        rows: [
          priceHeaderRow(),
          priceRow("1", "Requirements, Architecture and Database Design", "Entity-relationship diagram; 46-table schema design; 205-endpoint API contract; 7-role access matrix; system flow diagrams; tech-stack decision", "\u20B912,000"),
          priceRow("2", "System Foundation", "JWT HS256 auth; 7-role RBAC middleware; per-IP brute-force lockout (5 attempts / 15-min window); JWT JTI token revocation denylist; WebSocket real-time broadcast; security headers; CORS policy; append-only audit log", "\u20B912,000"),
          priceRow("3", "Trip Management", "Booking screen; driver assignment; 7 trip statuses; sheet collection; reconciliation; verification; finalization; trip history; available, current, and completed trip screens; 28 dedicated API endpoints", "\u20B928,000"),
          priceRow("4", "Yard Supervisor Workflow", "Trip-sheet collection screen with date stamps; driver advance verification dialog; Driver Advance Bill (DAB) generation; pending-collection alert popups", "\u20B910,000"),
          priceRow("5", "Accounts and Automated Invoicing", "Finance verification flow; automated Tax Invoice, Bill of Supply, and Transport Memo generation with separate auto-incrementing numbers; full GST and SAC code integration; LR and Consignment Note generation", "\u20B918,000"),
          priceRow("6", "Fleet and Compliance", "Truck master with all specs; per-document compliance tracking (FC, permits, insurance, road tax, PUC) with expiry alerts and update workflow; tyre layout diagram", "\u20B912,000"),
          priceRow("7", "Tyre Management", "Tyre inventory with full history; fitment records per truck position; tyre range configuration; tyre management table with status tracking", "\u20B910,000"),
          priceRow("8", "Fuel and AdBlue", "Fuel logs auto-synced from trip sheets; AdBlue manufacturer configuration; per-manufacturer price tracking; AdBlue usage logs", "\u20B98,000"),
          priceRow("9", "Maintenance", "Maintenance records per truck; configurable maintenance types with KM-interval alerts; maintenance history dialog; base cost config; 19 dedicated API endpoints", "\u20B912,000"),
          priceRow("10", "Driver and Staff Management", "Master records for drivers and staff; photo and document storage; role and branch assignment; password management", "\u20B98,000"),
          priceRow("11", "Attendance and Leave", "Daily attendance entry with remarks and late-entry log for drivers and staff; monthly reports; leave requests and approvals; edit approvals workflow", "\u20B910,000"),
          priceRow("12", "Finance", "EMI tracking per truck with loan details and schedule; recurring payments; driver and staff compensation with advance, salary, and full transaction history; compensation tables with payment dialog", "\u20B912,000"),
          priceRow("13", "P&L and Analytics", "Per-trip gross P&L; Profitability Summary (trip and truck level, EMI and maintenance deductions, date-range presets, multi-filter); Running Cost Calculator (3 modes, per-km breakdown); Customer Route Analytics; Fleet Trip Summary", "\u20B918,000"),
          priceRow("14", "Dashboards and Resource Hub", "4 role-specific dashboards with stat cards and charts; Staff, Drivers, Fleet, Customers, and Vendors master lists with full CRUD, search, and pagination", "\u20B912,000"),
          priceRow("15", "Admin Panel", "Branches; Trip Expense Rates; Repair Types; SAC Codes; AdBlue Manufacturer Management; Truck Run Configuration; Tyre Range Configuration; Maintenance Alert Management; Security and Audit Log", "\u20B910,000"),
          priceRow("16", "Reports, Exports and Cloud Backup", "21 Excel export endpoints across all major data domains; PDF invoice print view; automated Google Drive backup with scheduling", "\u20B910,000"),
          priceRow("17", "AI ERP Agent", "Natural-language query interface covering trips, fleet, finance, and attendance; intent parsing; structured response formatting", "\u20B97,000"),
          priceRow("18", "Windows Desktop App (Electron)", "Electron wrapper for the Next.js web app; Windows-native menu bar; signed .exe installer; auto-update ready", "\u20B95,000"),
          priceRow("19", "Mobile App (Android and iOS)", "Flutter 3.44 codebase; 15+ screens; 20+ Riverpod providers; persistent offline cache with TTL and stale fallback; signed APK, App Bundle (Play Store ready), and iOS IPA (TestFlight and App Store ready)", "\u20B930,000"),
          priceRow("20", "Mobile Security Hardening", "CA-level TLS certificate pinning; AES-256-GCM encrypted secure storage; biometric app lock; root and jailbreak detection; screenshot and screen-recording protection; R8 and Dart obfuscation; backup restriction", "\u20B915,000"),
          priceRow("21", "Backend Security Hardening", "Constant-time logins; per-IP brute-force lockout; JWT JTI revocation denylist; role-based middleware on all 205 endpoints; security headers; authenticated file downloads; upload magic-byte validation; production safety checks", "\u20B910,000"),
          priceRow("22", "Testing, Deployment, Data Seeding and UAT", "End-to-end test pass across all modules; production server deployment; MySQL schema migration and initial data seeding; UAT support with one consolidated feedback round per milestone", "\u20B910,000"),
          priceRow("", "Total: One-Time Development", "", "\u20B93,00,000", true),
        ]
      }),

      gap(100),
      callout("Partner-First Rate", "All figures are in Indian Rupees. The \u20B93,00,000 total is a partner-first rate. The market equivalent for this scope (205 API endpoints, 46 database tables, 4 delivery targets, enterprise mobile security) is \u20B95 to 6 lakhs from a senior Indian freelance developer. This price reflects the intent to build a sustained long-term relationship with Canaan, not a one-time transaction."),

      gap(200),
      pageBreak(),

      // ══════ 5. PAYMENT SCHEDULE ══════
      h1("5.  Payment Schedule"),
      gap(60),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [CW - 1600 - 1400, 1600, 1400],
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: CW - 3000, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 80 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "Milestone", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
              new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "Share", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
              new TableCell({ width: { size: 1400, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "Amount", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
            ]
          }),
          payRow("On project confirmation (advance)", "40%", "\u20B91,20,000", 0),
          payRow("On completion of core trip and accounts modules", "30%", "\u20B990,000", 1),
          payRow("On final delivery and go-live across all platforms", "30%", "\u20B990,000", 0),
          payRow("Total", "100%", "\u20B93,00,000", 0, true),
        ]
      }),

      gap(200),

      // ══════ 6. INCLUDED ══════
      h1("6.  What's Included"),
      gap(60),
      bullet("Complete source code and intellectual property ownership transferred on final payment"),
      bullet("Deployment to your server or hosting environment"),
      bullet("Admin and user training (up to 2 sessions of up to 3 hours each)"),
      bullet("User documentation"),
      bullet("60-day post-launch bug-fix warranty"),
      bullet("Android APK (sideload) and App Bundle (Play Store ready)"),
      bullet("iOS IPA (TestFlight and App Store ready, pending Apple Developer account provisioning by client)"),
      bullet("De-obfuscation symbols for crash-report analysis"),

      gap(200),

      // ══════ 7. NOT INCLUDED ══════
      h1("7.  What's Not Included"),
      gap(60),
      bullet("Third-party costs: server and hosting, domain, MySQL, Google Drive API, Apple Developer Program (\u20B98,400 per year), and Google Play Developer (one-time \u20B91,900)"),
      bullet("Play Store and App Store submission and review process (client owns the developer accounts)"),
      bullet("Any new modules or major scope changes beyond the delivered features (quoted separately at partner rates)"),
      bullet("Crash reporting and APM integration such as Sentry or Crashlytics (recommended for production, quoted separately if needed)"),

      gap(200),

      // ══════ 8. ASSUMPTIONS ══════
      h1("8.  Assumptions"),
      gap(60),
      bullet("All requirements are as designed, implemented, and audited in the delivered codebase"),
      bullet("Client provides master data (customers, rates, locations), login credentials, and timely UAT feedback"),
      bullet("iOS App Store submission requires the client to hold or obtain an Apple Developer Program membership"),
      bullet("Server, domain, and database hosting are arranged and funded by the client"),
      bullet("One consolidated round of UAT feedback is included per milestone before go-live"),

      gap(200),

      // ══════ 9. WHY THIS PRICE ══════
      h1("9.  Why This Price?"),
      gap(60),
      body("For full transparency, here is the honest basis for the total.", { after: 120 }),

      dataTable(
        ["Factor", "Detail"],
        [
          ["Development hours (estimated)", "~300 effective hours"],
          ["Effective hourly rate", "\u20B91,000 per hour"],
          ["Market rate for this complexity", "\u20B9800 to 1,500 per hour (senior Indian freelance, 2025 to 2026)"],
          ["Market-rate equivalent total", "\u20B95 to 6 lakhs"],
          ["Codebase delivered", "~60,000 lines (TypeScript, TSX, and Python)"],
          ["API scope", "205 endpoints across 21 domain routers"],
          ["Data model", "46 database tables and 136 schema classes"],
          ["Delivery targets", "4 (Web, Windows Desktop, Android, iOS)"],
          ["Security controls", "10 mobile and 8 backend, all fully implemented"],
        ],
        [45, 55]
      ),
      gap(100),
      body("The \u20B93,00,000 figure is a long-term partnership rate, not the market ceiling for this work. It reflects the intent to build a sustained relationship with Canaan rather than a one-time vendor transaction.", { italic: true }),

      gap(200),

      // ══════ 10. ACCEPTANCE ══════
      h1("10.  Acceptance"),
      gap(60),
      body("Kindly confirm acceptance by signing below or replying to this quotation with written confirmation.", { after: 120 }),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [CW / 2, CW / 2],
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: CW / 2, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 160, right: 120 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "For Canaan Global International", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
              new TableCell({ width: { size: CW / 2, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 160 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "Developer", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
            ]
          }),
          sigRow("Name: _______________________________", "Name: _______________________________"),
          sigRow("Signature: ___________________________", "Signature: ___________________________"),
          sigRow("Date: ________________________________", "Date: ________________________________"),
        ]
      }),

      gap(300),

      // CLOSING NOTE + SIGN-OFF
      new Paragraph({
        spacing: { before: 0, after: 0 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Thank you for the opportunity and the trust placed in this partnership. I look forward to supporting Canaan's growth with this platform and beyond.", size: 20, color: LABEL, italic: true, font: "Calibri" })]
      }),

      gap(200),

      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 } },
        spacing: { before: 80, after: 40 }, alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Independent Software Developer", bold: true, size: 24, color: NAVY, font: "Calibri" })]
      }),
      new Paragraph({ spacing: { before: 0, after: 0 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Ref: CAN-ERP-2026-002  \u00B7  08 August 2026", size: 20, color: LABEL, italic: true, font: "Calibri" })] }),

    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("Canaan_ERP_Quotation_CAN-ERP-2026-002.docx", buf);
  console.log("Done");
});