const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  LevelFormat, Header, Footer, TabStopType, SimpleField, PageBreak
} = require('docx');
const fs = require('fs');

const NAVY        = "1B3157";
const GOLD        = "C9A84C";
const BODY        = "333333";
const LABEL       = "555555";
const GRAY_LIGHT  = "F5F5F5";
const WHITE       = "FFFFFF";
const HEADER_GRAY = "888888";
const CW = 9746;
const DATE = "03 October 2026";

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
    rows: [new TableRow({ children: [
      new TableCell({
        borders: { top: thinBorder, bottom: thinBorder, right: thinBorder, left: { style: BorderStyle.SINGLE, size: 16, color: GOLD } },
        shading: { fill: "FFF7E6", type: ShadingType.CLEAR },
        margins: { top: 140, bottom: 140, left: 200, right: 200 },
        children: [
          new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: label, bold: true, size: 19, color: NAVY, font: "Calibri" })] }),
          new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text, size: 19, color: BODY, font: "Calibri" })] }),
        ]
      })
    ]})]
  });
}

function metaRow(label, value, fill) {
  return new TableRow({ children: [
    new TableCell({ width: { size: 2800, type: WidthType.DXA }, borders: noBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 0, right: 120 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: label, size: 20, color: LABEL, font: "Calibri" })] })] }),
    new TableCell({ width: { size: CW-2800, type: WidthType.DXA }, borders: noBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 0 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: value, bold: true, size: 20, color: NAVY, font: "Calibri" })] })] }),
  ]});
}

function dataTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const norm = colWidths.map(w => Math.round(w / total * CW));
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: norm,
    rows: [
      new TableRow({ children: headers.map((h, i) => new TableCell({
        width: { size: norm[i], type: WidthType.DXA }, borders: thinBorders,
        shading: { fill: NAVY, type: ShadingType.CLEAR },
        margins: { top: 90, bottom: 90, left: 120, right: 120 },
        children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing:{before:0,after:0}, children: [new TextRun({ text: h, bold: true, size: 18, color: WHITE, font: "Calibri" })] })]
      }))}),
      ...rows.map((r, ri) => new TableRow({ children: r.map((cell, ci) => new TableCell({
        width: { size: norm[ci], type: WidthType.DXA }, borders: thinBorders,
        shading: { fill: ri % 2 === 0 ? WHITE : GRAY_LIGHT, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.TOP,
        children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing:{before:0,after:0}, children: [new TextRun({ text: cell, size: 18, color: ci === 0 ? NAVY : BODY, bold: ci === 0, font: "Calibri" })] })]
      }))}))
    ]
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 20, color: BODY } } } },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 240 } }, run: { color: GOLD, size: 20 } } }]
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
              new TextRun({ text: "QUOTATION BREAKDOWN  ·  CANAAN GLOBAL INTERNATIONAL", size: 14, color: HEADER_GRAY, font: "Calibri" }),
              new TextRun({ text: "\t", size: 14, font: "Calibri" }),
              new TextRun({ text: DATE, size: 14, color: HEADER_GRAY, font: "Calibri" }),
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
              new TextRun({ text: "Confidential  ·  Quotation Breakdown: Canaan ERP", size: 14, color: HEADER_GRAY, font: "Calibri" }),
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
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: "QUOTATION BREAKDOWN", bold: true, size: 56, color: NAVY, font: "Calibri" })] }),
      new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: "Canaan ERP: Phase-by-Phase Project Value", size: 26, color: GOLD, font: "Calibri" })] }),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [2800, CW - 2800],
        rows: [
          metaRow("Prepared for",  "Canaan Global International (Client)", WHITE),
          metaRow("Prepared by",   "Independent Software Developer", GRAY_LIGHT),
          metaRow("Date",          DATE, WHITE),
        ]
      }),

      gap(180),

      callout("Note on how this document was built", "The original ₹2,50,000 quotation predates the detailed module-by-module quotation on file (Quotation2, ₹4,00,000 fully-built-system quote) and is not itself preserved as a standalone document. This breakdown reconstructs the Phase 1 baseline by working backwards from the confirmed original figure and the confirmed final figure of ₹4,07,000, using Quotation2's module list and the verified build history of the system as the source of truth for what was added and when. Every rupee figure attached to Phases 2 to 4 is an indicative allocation of the additional ₹1,57,000 in scope, not a reconstruction of individual historical invoices."),

      gap(220),

      // ══════ 1. EXECUTIVE SUMMARY ══════
      h1("1.  Executive Summary"),
      gap(60),
      body("Canaan ERP began as a focused, single-platform system to digitize the core of Canaan Global International's transport operations: trip booking, basic documentation, basic invoicing, fleet records, and staff and driver management. Over the course of development, the operational reality of running a container-transport business surfaced requirements that a basic ERP could not support: multi-type automated invoicing with GST handling, a dedicated yard-collection workflow, tyre and maintenance lifecycle tracking, profitability analytics down to the per-trip and per-truck level, and the security, auditability, and production engineering needed to run a system that handles real driver payments, real customer invoices, and real business data every day."),
      gap(140),
      dataTable(
        ["Item", "Amount"],
        [
          ["Original quotation", "₹2,50,000"],
          ["Additional scope (Phases 2 to 4)", "₹1,57,000"],
          ["Final project value", "₹4,07,000"],
          ["Increase over original scope", "62.8%"],
        ],
        [65, 35]
      ),
      gap(120),
      body("This document traces that journey in four phases, provides a complete feature inventory of the final system, and explains in plain business terms why scope growth of this kind reliably increases development cost."),

      gap(200),

      // ══════ 2. PHASE 1 ══════
      h1("2.  Phase 1: Original ERP Scope"),
      gap(60),
      body("Original quotation: ₹2,50,000", { after: 120 }),
      body("The original engagement was scoped as a basic, single-platform ERP: the minimum viable system to get Canaan's core trip operations off spreadsheets and onto a shared, real-time system.", { after: 120 }),

      h2("Core modules"),
      bullet("Trip Management: booking a trip, assigning a driver and truck, tracking status through to completion."),
      bullet("Documentation & Reconciliation (basic): recording trip-sheet data and linking it back to the original booking."),
      bullet("Accounts & Invoicing (basic): one invoice type per trip, without the later GST and multi-invoice-type handling."),
      bullet("Fleet / Truck Management: a master record of every vehicle and its key documents."),
      bullet("Driver & Staff Management: master records for every driver and staff member."),
      bullet("Attendance: daily attendance marking, without the later leave-approval workflow."),
      bullet("Finance (basic): a simple ledger of driver and staff payments, without EMI tracking or compensation-type logic."),
      bullet("Dashboards (basic): a single summary screen per login, not yet role-differentiated."),
      bullet("Reports (basic): Excel export of raw records, without the analytics layer added later."),

      h2("Users and roles"),
      body("A small set of roles (Admin and Staff) with simple login-based access, with no granular, per-action permission model yet."),

      h2("Database, platform, security and deployment"),
      bullet("Database: a MySQL schema covering the core entities (trips, trucks, drivers, staff, basic invoices)."),
      bullet("Platform: a single web application accessible from any browser, with no desktop app, mobile apps, or in-app chat."),
      bullet("Security: basic login and password authentication with session-based access, not yet the hardened model described in Phase 4."),
      bullet("Deployment: delivery to a single server, with no formal backup automation, monitoring, or disaster-recovery plan."),

      gap(120),
      body("This is the baseline against which all subsequent scope growth is measured."),

      gap(200),
      pageBreak(),

      // ══════ 3. PHASE 2 ══════
      h1("3.  Phase 2: Business Workflow Expansion"),
      gap(60),
      body("Once the core system was in use, it became clear that Canaan's operations involve more moving parts than a basic trip-to-invoice flow. This phase covers the requirements that surfaced from real operational use.", { after: 120 }),

      dataTable(
        ["Requirement", "Feature Built", "Business Purpose", "Technical Impact", "Cost Impact"],
        [
          ["Yard staff need a dedicated way to process incoming trips", "Yard Supervisor Workflow: trip-sheet collection, driver-advance verification, pending-collection alerts", "Removes a manual, paper-based yard handover step; yard staff work from the same live data as everyone else", "New role, new screens, new backend endpoints scoped to yard-only data", "Medium"],
          ["One invoice type wasn't enough for how Canaan actually bills", "Multi-type Automated Invoicing: Tax Invoice, Bill of Supply, and Transport Memo, each with its own running number sequence, plus GST (CGST/SGST/IGST) and Driver Advance Bills", "Matches real tax and billing requirements; avoids manual GST calculation errors", "Three distinct document generators, each with its own numbering and tax logic, all reading the same trip data", "High"],
          ["Trip data needed more rigor before it reached accounts", "Full Documentation & Reconciliation: diesel logging, KM variance checks, flagging of inconsistent entries, edit-approval routing", "Catches data-entry errors and fuel or mileage anomalies before they reach billing", "Cross-checks between trip-sheet fields, plus a formal approval routing layer", "Medium to High"],
          ["Customers, vendors, and pricing lived in scattered spreadsheets", "Resource Hub: centralized customer, vendor, staff, and pricing-table management", "One source of truth for every party the business deals with", "New master-data module feeding every invoicing and trip-assignment screen", "Medium"],
          ["No formal record of who changed what", "Approvals & Audit: edit and delete approval routing plus a system-wide audit log", "Protects data integrity; every change to sensitive records is reviewable", "An audit trail requires every write path to log through it, not just the record it touches", "Medium"],
          ["System-wide settings had no admin interface", "Admin Settings: branches and expense rates", "Lets the business configure the system without a developer", "Configuration screens that feed calculations elsewhere (e.g. branch-based compensation %)", "Low to Medium"],
          ["PDF and Excel output was needed beyond raw exports", "Structured PDF and Excel generation for invoices, LR / Consignment Notes, and collection records", "Documents ready to print, email, or file, not just raw data dumps", "Each document type needs its own layout engine, not a generic table export", "Medium"],
        ],
        [18, 24, 20, 25, 13]
      ),

      gap(120),
      body("Phase 2 turned the system from records trips into running the actual paperwork of the business."),

      gap(200),
      pageBreak(),

      // ══════ 4. PHASE 3 ══════
      h1("4.  Phase 3: Advanced Operations, Analytics & Automation"),
      gap(60),
      body("This phase covers the features that moved the ERP beyond CRUD screens into a genuine transport-management and decision-support system.", { after: 120 }),

      dataTable(
        ["Feature", "Why It Required Additional Development"],
        [
          ["Tyre Management (inventory, fitment history, lifespan tracking, plus a full soft-delete, Deletion Approval, Tyre Archive, Restore or Permanently Delete lifecycle)", "Not a simple table. It is a stateful lifecycle with its own approval workflow, mirrored across three linked screens and kept in sync in real time."],
          ["Fuel & AdBlue Tracking", "Auto-synced from trip-sheet data rather than manually re-entered, so the module has to understand trip-sheet structure, not just store numbers."],
          ["Maintenance Management (repair logs, KM-based maintenance alerts, and an admin-configurable Maintenance Category and Repair Type system feeding a dependent dropdown on the Truck Maintenance form)", "A genuinely dynamic form: the Repair Type options change based on which Maintenance Type (Category) was picked, and both are admin-editable, not hardcoded."],
          ["Diesel & Advance Management", "Driver advances, outstanding-advance calculations, and expense reconciliation, all computed live from trip-sheet data rather than stored as static numbers."],
          ["Finance module (EMI tracking, recurring costs, and driver and staff compensation with a live Net Payable calculation: Driver Batta Amount minus Outstanding Advance, with trip-category-specific exclusion rules)", "This formula touches trip data, trip-sheet data, and compensation-type configuration at once, and had to stay consistent across every screen that shows a Salary figure."],
          ["P&L & Profitability Analytics (per-trip and per-truck P&L, EMI-share and maintenance-cost amortization, Running Cost Calculator in Manual, Basic, and Advanced modes, Customer Route Analytics, Fleet Summary)", "Analytics of this depth pulls and correctly weights numbers from nearly every other module. It is the most cross-module-dependent part of the system."],
          ["Role-Specific Dashboards (Admin, Finance, Fleet, Staff, Auditor)", "Each role sees a different slice of the same live data, so the dashboard layer is built per role, not as one generic screen."],
          ["Driver Record & Salary Breakdown (Auditor-facing): per-driver trip history with expandable detail, a date-range Total Trips and Salary summary, and a Salary Breakdown with a numeric and a proportional visual explanation of each trip's salary", "Purpose-built for a read-only audit role. Every figure has to be traceable and explainable on demand, which is a more demanding requirement than an editable data-entry screen."],
          ["Reports & Automated Cloud Backup", "Scheduled, unattended backups must not corrupt the live database. That is a different engineering problem from an on-demand Excel export."],
        ],
        [45, 55]
      ),

      gap(120),
      body("Every item in this phase depends on data from at least two other modules being correct and current. This is the layer where the system stopped being a set of independent screens and became genuinely integrated."),

      gap(200),

      // ══════ 5. PHASE 4 ══════
      h1("5.  Phase 4: Production-Grade System, Security & Final Scope"),
      gap(60),
      body("The final phase covers everything required to turn a working system into one the business can safely run every day, with real money and real driver and customer data flowing through it."),

      h2("Security"),
      bullet("Authentication and session management, hardened beyond the basic Phase 1 login."),
      bullet("Role-based access control enforced per API endpoint, not just per screen, including least-privilege scoping (e.g. an Auditor can see driver salary aggregates without being granted the full Finance module)."),
      bullet("Read-only enforcement that holds under direct interaction, not just visual styling. Date pickers and number-spinner fields in read-only dialogs were hardened so a restricted role cannot edit data through a control that merely looks disabled."),
      bullet("Input validation and protection against SQL injection and XSS."),
      bullet("Secure file handling for uploaded documents (photos, licenses, compliance documents)."),
      bullet("A full audit log of sensitive changes (deletion requests, approvals, restores)."),
      bullet("Data-access restrictions that hold when modules overlap: a soft-deleted record must disappear from every screen that lists it, not just the one it was deleted from."),

      h2("Infrastructure"),
      bullet("Production deployment to the live server."),
      bullet("Database schema managed through idempotent migrations: every schema change (new columns, new tables, widened enum values) runs safely against a live database with existing data, without a manual, risky one-off script."),
      bullet("Environment configuration separating development from production."),
      bullet("A defined backup strategy for disaster recovery."),

      h2("Production engineering"),
      bullet("Systematic error handling and input validation across every form and API endpoint, not just the happy path."),
      bullet("Performance work, e.g. lazy, concurrency-limited fetching of trip-sheet detail so pages with hundreds of records stay responsive."),
      bullet("Resilience patterns: a page that depends on a role-gated data source is built so one blocked request does not blank the whole screen for that role."),
      bullet("Real, disposable-data testing against the live database before any new workflow is trusted. Destructive operations are never tested against real business records."),
      bullet("Ongoing bug fixing and refinement based on real usage, not just the original spec."),
      bullet("Production support and responsiveness to issues found after go-live."),

      h2("Final ERP scope"),
      body("By the end of this phase, Canaan ERP is a role-based, real-time, production-hardened transport-management platform covering the complete operational, financial, and compliance lifecycle of the business, not the basic trip-tracking tool originally quoted."),

      gap(200),
      pageBreak(),

      // ══════ 6. FEATURE INVENTORY ══════
      h1("6.  Complete Feature Inventory: Final System"),
      gap(60),
      dataTable(
        ["Module", "Feature", "Description", "Business Purpose", "Complexity"],
        [
          ["Trip Management", "Booking & Assignment", "Create a trip, assign driver and truck, set container and cargo details", "Central entry point for every job the business runs", "Medium"],
          ["", "Live Status Tracking", "Trip status updates in real time across every screen", "Everyone sees the same, current picture", "Medium"],
          ["", "Verification & Closure", "Booking-sheet closure workflow with review before completion", "Ensures a trip is not marked done with incomplete data", "Medium"],
          ["Documentation & Reconciliation", "Trip Sheet Entry", "Diesel, expenses, advances, KM readings per trip", "Captures everything needed to compute cost and driver pay", "High"],
          ["", "KM Variance Checks", "Flags inconsistent odometer readings", "Catches data-entry errors before they reach accounts", "Medium"],
          ["", "Edit-Approval Routing", "Changes to closed records require approval", "Protects finalized data from silent edits", "Medium"],
          ["Accounts & Invoicing", "Tax Invoice / Bill of Supply / Transport Memo", "Three distinct, separately numbered document types", "Matches real billing and tax requirements", "High"],
          ["", "GST Handling (CGST/SGST/IGST)", "Automatic tax calculation on invoices", "Removes manual tax-calculation error", "High"],
          ["", "LR / Consignment Note Generation", "Structured shipping documents", "Required paperwork for cargo movement", "Medium"],
          ["Yard Supervisor Workflow", "Trip-Sheet Collection", "Dedicated intake screen for yard staff", "Digitizes a previously paper-based handover", "Medium"],
          ["", "Driver-Advance Verification", "Cross-checks advance amounts on collection", "Prevents advance-reconciliation disputes", "Medium"],
          ["", "Pending-Collection Alerts", "Flags trips awaiting yard action", "Nothing falls through the cracks", "Low"],
          ["Fleet / Truck Management", "Vehicle Master Records", "Full vehicle detail per truck", "Single source of truth for fleet data", "Low"],
          ["", "Document Expiry Alerts", "Insurance, permits, FC, and PUC tracked with alerts", "Avoids compliance lapses and fines", "Medium"],
          ["Tyre Management", "Tyre Inventory & Fitment History", "Per-tyre lifecycle from purchase to removal", "Tracks tyre cost and lifespan accurately", "Medium"],
          ["", "Soft-Delete / Archive / Restore Workflow", "Deletion Approval, then Tyre Archive, then Restore or Permanently Delete", "Prevents accidental, unreviewed data loss", "Medium to High"],
          ["Fuel & AdBlue", "Fuel Log Auto-Sync", "Pulled from trip-sheet data, not re-entered", "Removes duplicate data entry and drift", "Medium"],
          ["", "AdBlue Purchase & Consumption Tracking", "Logs AdBlue use alongside fuel", "Complete running-cost picture", "Low"],
          ["Maintenance", "Repair Logs & Costs", "Full maintenance history per truck", "Basis for maintenance-cost analytics", "Medium"],
          ["", "KM-Based Maintenance Alerts", "Automatic reminders based on mileage", "Prevents missed scheduled maintenance", "Medium"],
          ["", "Maintenance Category / Repair Type Management", "Admin-configurable categories, each with its own repair types", "Keeps the Truck Maintenance form's dropdowns accurate without developer involvement", "Medium"],
          ["Driver & Staff Management", "Master Records", "Photos, documents, and contact detail per person", "Central HR-style record", "Low"],
          ["", "Role-Based Access", "Each person's system access matches their job", "Prevents over-permissioning", "Medium"],
          ["Attendance & Leave", "Daily Attendance", "Marking and monthly reporting", "Replaces manual attendance registers", "Low"],
          ["", "Leave Requests & Approvals", "Formal request, then approval routing", "Auditable leave records", "Low"],
          ["Finance", "EMI Tracking", "Truck loan schedules and payments", "Ties fleet cost to financial planning", "Medium"],
          ["", "Driver/Staff Compensation", "Salary and advance tracking, with live Net Payable calculation", "Accurate, formula-driven pay figures, not manual computation", "High"],
          ["P&L & Profitability Analytics", "Per-Trip / Per-Truck P&L", "Profitability broken down by trip and by vehicle", "Shows exactly where the business makes or loses money", "High"],
          ["", "Running Cost Calculator (Manual / Basic / Advanced)", "Per-km cost breakdown across EMI, fuel, tyres, and maintenance", "Data-driven pricing and route decisions", "High"],
          ["", "Customer Route Analytics", "Profitability by customer and route", "Identifies the business's most valuable relationships", "Medium"],
          ["Dashboards", "Role-Specific Dashboards", "Admin, Finance, Fleet, Staff, and Auditor each see a tailored view", "Relevant information only, no clutter", "Medium"],
          ["Resource Hub", "Customers, Vendors, Staff, Pricing Tables", "Centralized master data", "One source of truth feeding every other module", "Medium"],
          ["Admin Settings", "Branch Configuration, Expense Rates", "System-wide configuration screens", "Business can self-configure without a developer", "Low to Medium"],
          ["Reports & Backup", "Excel Export", "Structured data export", "Feeds external reporting and accounting needs", "Low"],
          ["", "Automated Cloud Backup", "Scheduled, unattended backup of system data", "Protects against data loss", "Medium"],
          ["Approvals & Audit", "Edit / Delete Approval Routing", "Sensitive changes require review", "Prevents silent, unreviewed data changes", "Medium"],
          ["", "Full Audit Log", "Every significant action is logged", "Accountability and traceability", "Medium"],
          ["Driver Record (Auditor)", "Date-Range-Scoped Trip & Salary Summary", "Per-driver trip count and salary for a selected period", "Read-only oversight view for audit purposes", "Medium"],
          ["", "Salary Breakdown (Visual + Numeric)", "Per-trip explanation of how salary was computed", "Makes a formula-driven figure fully explainable, not a black box", "Medium"],
          ["System Foundation", "Real-Time Sync", "Every screen reflects live data via WebSockets", "No stale data, no manual refresh needed", "High"],
          ["", "Authentication & Session Security", "Hardened login and session handling", "Protects the system's entry point", "Medium"],
          ["Security & Hardening", "Role-Based API Access Control", "Every endpoint checks the caller's role, not just the screen", "Prevents access via direct API calls, not just UI restriction", "High"],
          ["", "Read-Only Enforcement", "Disabled controls are genuinely non-interactive, not just styled that way", "Closes the gap between looks locked and is locked", "Medium"],
          ["", "Input Validation & Injection Protection", "Guards against malformed or malicious input", "Protects data integrity and system security", "Medium"],
          ["", "Audit Trail", "Logged history of sensitive actions", "Supports accountability during disputes or reviews", "Medium"],
          ["Production Engineering", "Idempotent Database Migrations", "Schema changes apply safely to a live, populated database", "Zero-downtime, zero-data-loss schema evolution", "Medium to High"],
          ["", "Error Handling & Validation", "Systematic handling across every form and endpoint", "A production system fails gracefully, not silently", "Medium"],
          ["", "Performance Optimization", "Lazy, concurrency-limited data fetching for large record sets", "Keeps the system responsive as data volume grows", "Medium"],
        ],
        [17, 22, 25, 25, 11]
      ),

      gap(200),
      pageBreak(),

      // ══════ 7. PRICE EVOLUTION ══════
      h1("7.  Price Evolution: ₹2,50,000 to ₹4,07,000"),
      gap(60),
      dataTable(
        ["Phase", "Scope Added", "Incremental Cost", "Cumulative Cost"],
        [
          ["Phase 1", "Original ERP: core trip, basic invoicing, fleet, driver and staff, attendance, basic finance, dashboards and reports, single web app, basic security", "Original", "₹2,50,000"],
          ["Phase 2", "Business Workflow Expansion: Yard Supervisor Workflow, multi-type invoicing with GST, full documentation and reconciliation, Resource Hub, Approvals & Audit, Admin Settings, PDF and Excel document generation", "₹45,000", "₹2,95,000"],
          ["Phase 3", "Advanced Operations, Analytics & Automation: Tyre Management, Fuel & AdBlue, Maintenance Management, Finance and Compensation logic, P&L & Profitability Analytics, role-specific dashboards, Driver Record & Salary Breakdown, automated backup", "₹75,000", "₹3,70,000"],
          ["Phase 4", "Production-Grade System, Security & Final Scope: full RBAC and API security hardening, read-only enforcement fixes, production deployment, idempotent migrations, error handling, performance work, production support", "₹37,000", "₹4,07,000"],
        ],
        [13, 57, 15, 15]
      ),

      gap(140),
      body("Arithmetic check: ₹45,000 + ₹75,000 + ₹37,000 = ₹1,57,000, and ₹2,50,000 + ₹1,57,000 = ₹4,07,000. ✔", { after: 140 }),
      callout("Indicative allocation", "The phase groupings and feature attributions above are accurate to what was actually built. The specific rupee split of the additional ₹1,57,000 across Phases 2 to 4 is a scope-weighted estimate for the purpose of this breakdown, not a reconstruction of individual historical invoices."),

      gap(200),

      // ══════ 8. FROM BASIC ERP TO INTEGRATED TMS ══════
      h1("8.  From Basic ERP to Integrated Transport Management System"),
      gap(60),
      dataTable(
        ["Stage", "Cost", "What It Adds"],
        [
          ["Initial requirement", "Starting point", "Digitize trip booking and basic records"],
          ["Core ERP (Phase 1)", "₹2,50,000", "Real operations need real paperwork: GST invoices, yard handovers, audit trails"],
          ["Operational workflows (Phase 2)", "+₹45,000", "The business needs to see, not just record: tyres, maintenance, profitability, compensation"],
          ["Analytics & automation (Phase 3)", "+₹75,000", "Real money and real data demand a system that is genuinely safe to run daily"],
          ["Security & production engineering (Phase 4)", "+₹37,000", "Hardening that protects every module built in Phases 1 to 3"],
          ["Final integrated ERP", "₹4,07,000", "One platform covering the full business"],
        ],
        [36, 18, 46]
      ),

      gap(120),
      body("Each stage did not replace the one before it. It sat on top of it. The trip-booking flow from Phase 1 is still the foundation every later module reads from, and Phase 4's security hardening protects every module built in Phases 1 to 3, not just the newest ones."),

      gap(200),

      // ══════ 9. WHY COST INCREASES ══════
      h1("9.  Why ERP Development Cost Increases With Scope"),
      gap(60),
      body("A common client question is: Why does adding what sounds like one small thing cost real money? The honest answer is that almost nothing in a connected system is really one small thing. A single visible change typically touches several layers:", { after: 120 }),
      body("Database, Backend, API, Validation, UI, Reports, Calculations, Testing", { after: 140 }),

      h2("A concrete example from this system"),
      body("Adding the Repair Type field to the Truck Maintenance form (Phase 3) sounds like adding one dropdown. In practice it required:", { after: 80 }),
      bullet("Database: a new column on the maintenance-records table, added through a live, data-safe migration."),
      bullet("Backend: new fields on the create and update logic for maintenance records."),
      bullet("API: new endpoints to manage the Maintenance Category and Repair Type lists, so the dropdown options are admin-editable rather than hardcoded."),
      bullet("Validation: a Repair Type can only be picked once a Maintenance Type (Category) is selected, and it must belong to that category."),
      bullet("UI: a dropdown whose options change based on another field's value, and reset correctly when that field changes."),
      bullet("Reports: the new field flows correctly into any export or record view that shows maintenance history."),
      bullet("Testing: verifying the whole chain against real but disposable data before trusting it with real records."),

      gap(120),
      body("Multiply that pattern across dozens of features (Tyre Management's soft-delete lifecycle, the Salary Breakdown's live formula, GST-aware invoicing) and the reason scope growth costs real development time becomes concrete rather than abstract.", { after: 120 }),

      h2("What each layer involves, in business terms"),
      dataTable(
        ["Layer", "What It Involves"],
        [
          ["Database design", "Deciding how information is stored so it can be retrieved correctly and safely, for good"],
          ["Backend development", "The rules that decide what is allowed to happen (e.g. only an Admin can permanently delete a record)"],
          ["API development", "The communication channel between the visible screen and the stored data"],
          ["Business logic", "The formulas and rules specific to Canaan's operations (e.g. how driver salary is calculated)"],
          ["UI development", "What the user actually sees and interacts with"],
          ["Reports & document generation", "Turning stored data into something a person can read, print, or file with authorities"],
          ["Security", "Making sure only the right people can see or change the right data"],
          ["Testing & debugging", "Catching problems before they reach real business data"],
          ["Deployment & production support", "Getting the system running reliably, and keeping it that way"],
        ],
        [30, 70]
      ),

      gap(200),
      pageBreak(),

      // ══════ 10. FINAL SUMMARY ══════
      h1("10.  Final Project Summary"),
      gap(60),
      dataTable(
        ["Item", "Value"],
        [
          ["Original quotation", "₹2,50,000"],
          ["Additional scope (Phases 2 to 4)", "₹1,57,000"],
          ["Final project value", "₹4,07,000"],
          ["Percentage increase", "62.8%"],
        ],
        [65, 35]
      ),

      gap(160),
      h2("Major categories responsible for the increase"),
      bullet("Multi-type, GST-aware automated invoicing and document generation"),
      bullet("A dedicated Yard Supervisor workflow"),
      bullet("Tyre and maintenance lifecycle management, including a full approval-and-archive workflow"),
      bullet("Profitability and running-cost analytics across trips, trucks, and customers"),
      bullet("Formula-driven, fully explainable driver compensation (Salary Breakdown)"),
      bullet("Production-grade security hardening and role-based API access control"),
      bullet("Production engineering: safe database migrations, error handling, and performance work"),

      h2("Final system scope"),
      bullet("20+ integrated modules spanning trip operations, documentation, accounts, fleet, tyres, fuel, maintenance, HR and attendance, finance, analytics, and administration."),
      bullet("Role-based access across Admin, Finance, Fleet, Staff, and Auditor views, each with a tailored dashboard and permission set."),
      bullet("Real-time updates across every screen."),
      bullet("Production-grade security: role-based API access control, genuinely enforced read-only restrictions, input validation, and a full audit trail."),
      bullet("Deep analytics: per-trip and per-truck P&L, running-cost breakdowns, and customer and route profitability."),
      bullet("Automation: document expiry alerts, KM-based maintenance alerts, auto-synced fuel logging, and automated cloud backup."),

      gap(140),
      body("Why the final system is substantially larger than originally quoted: the original ₹2,50,000 scope answered the question how do we get trip records off spreadsheets? The final ₹4,07,000 system answers a much bigger question: how do we run and audit the entire transport business safely, from booking to payment to compliance, with confidence in every number the system shows us? That shift, not scope-padding, is what accounts for the difference.", { after: 160 }),

      callout("Reference", "This breakdown should be read alongside Quotation2, which remains the most detailed module-by-module cost reference available for the final-scope system."),

      gap(200),

      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 } },
        spacing: { before: 80, after: 40 }, alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Independent Software Developer", bold: true, size: 24, color: NAVY, font: "Calibri" })]
      }),
      new Paragraph({ spacing: { before: 0, after: 0 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Quotation Breakdown  ·  " + DATE, size: 20, color: LABEL, italic: true, font: "Calibri" })] }),

    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(__dirname + "/Canaan_ERP_Quotation_Breakdown.docx", buf);
  console.log("Done");
});
