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
const LIGHT_BLUE  = "EFF6FF";
const WHITE       = "FFFFFF";
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

// Meta row for cover table
function metaRow(label, value, fill) {
  return new TableRow({ children: [
    new TableCell({ width: { size: 2800, type: WidthType.DXA }, borders: noBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 0, right: 120 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: label, size: 20, color: LABEL, font: "Calibri" })] })] }),
    new TableCell({ width: { size: CW-2800, type: WidthType.DXA }, borders: noBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 0 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: value, bold: true, size: 20, color: NAVY, font: "Calibri" })] })] }),
  ]});
}

// Generic data table
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
        children: [new Paragraph({ alignment: i === norm.length - 1 && h.includes("(") ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing:{before:0,after:0}, children: [new TextRun({ text: h, bold: true, size: 18, color: WHITE, font: "Calibri" })] })]
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

// Pricing row
function priceRow(num, module, deliverables, amount, isTotal = false) {
  const sz = isTotal ? 20 : 18;
  const rowFill = isTotal ? NAVY : (parseInt(num) % 2 === 0 ? WHITE : GRAY_LIGHT);
  return new TableRow({ children: [
    new TableCell({
      width: { size: 400, type: WidthType.DXA }, borders: thinBorders,
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      margins: { top: 90, bottom: 90, left: 100, right: 80 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing:{before:0,after:0}, children: [new TextRun({ text: isTotal ? "" : num, bold: true, size: sz, color: WHITE, font: "Calibri" })] })]
    }),
    new TableCell({
      width: { size: 2400, type: WidthType.DXA }, borders: thinBorders,
      shading: { fill: rowFill, type: ShadingType.CLEAR },
      margins: { top: 90, bottom: 90, left: 120, right: 80 },
      verticalAlign: VerticalAlign.TOP,
      children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: module, bold: true, size: sz, color: isTotal ? WHITE : NAVY, font: "Calibri" })] })]
    }),
    new TableCell({
      width: { size: CW - 400 - 2400 - 1600, type: WidthType.DXA }, borders: thinBorders,
      shading: { fill: rowFill, type: ShadingType.CLEAR },
      margins: { top: 90, bottom: 90, left: 120, right: 80 },
      verticalAlign: VerticalAlign.TOP,
      children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: deliverables, size: 17, color: isTotal ? WHITE : BODY, font: "Calibri" })] })]
    }),
    new TableCell({
      width: { size: 1600, type: WidthType.DXA }, borders: thinBorders,
      shading: { fill: isTotal ? NAVY : rowFill, type: ShadingType.CLEAR },
      margins: { top: 90, bottom: 90, left: 80, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing:{before:0,after:0}, children: [new TextRun({ text: amount, bold: true, size: sz, color: isTotal ? WHITE : NAVY, font: "Calibri" })] })]
    }),
  ]});
}

// Payment row
function payRow(milestone, pct, amount, i, isTotal = false) {
  const fill = isTotal ? NAVY : (i % 2 === 0 ? WHITE : GRAY_LIGHT);
  return new TableRow({ children: [
    new TableCell({ width: { size: CW - 1600 - 1400, type: WidthType.DXA }, borders: thinBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 80 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: milestone, bold: isTotal, size: 19, color: isTotal ? WHITE : NAVY, font: "Calibri" })] })] }),
    new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: thinBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing:{before:0,after:0}, children: [new TextRun({ text: pct, bold: isTotal, size: 19, color: isTotal ? WHITE : GOLD, font: "Calibri" })] })] }),
    new TableCell({ width: { size: 1400, type: WidthType.DXA }, borders: thinBorders, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing:{before:0,after:0}, children: [new TextRun({ text: amount, bold: true, size: 19, color: isTotal ? WHITE : NAVY, font: "Calibri" })] })] }),
  ]});
}

// Acceptance signature row
function sigRow(left, right) {
  return new TableRow({ children: [
    new TableCell({ width: { size: CW/2, type: WidthType.DXA }, borders: thinBorders, shading: { fill: WHITE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 120 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: left, size: 19, color: BODY, font: "Calibri" })] })] }),
    new TableCell({ width: { size: CW/2, type: WidthType.DXA }, borders: thinBorders, shading: { fill: GRAY_LIGHT, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 160 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: right, size: 19, color: BODY, font: "Calibri" })] })] }),
  ]});
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// Pricing table header row
function priceHeaderRow() {
  return new TableRow({ children: [
    new TableCell({ width: { size: 400, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 100, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing:{before:0,after:0}, children: [new TextRun({ text: "#", bold: true, size: 18, color: WHITE, font: "Calibri" })] })] }),
    new TableCell({ width: { size: 2400, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 80 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: "Work Package", bold: true, size: 18, color: WHITE, font: "Calibri" })] })] }),
    new TableCell({ width: { size: CW - 400 - 2400 - 1600, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 80 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: "Key Deliverables", bold: true, size: 18, color: WHITE, font: "Calibri" })] })] }),
    new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing:{before:0,after:0}, children: [new TextRun({ text: "Amount (₹)", bold: true, size: 18, color: WHITE, font: "Calibri" })] })] }),
  ]});
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
              new TextRun({ text: "QUOTATION  ·  CANAAN GLOBAL INTERNATIONAL", size: 14, color: HEADER_GRAY, font: "Calibri" }),
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
              new TextRun({ text: "Confidential  ·  Ref: CAN-ERP-2026-002", size: 14, color: HEADER_GRAY, font: "Calibri" }),
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
      new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: "Canaan ERP: Software Development Quotation", size: 26, color: GOLD, font: "Calibri" })] }),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [2800, CW - 2800],
        rows: [
          metaRow("Prepared for",  "Canaan Global International (Client)", WHITE),
          metaRow("Prepared by",   "[Your Name], Independent Software Developer", GRAY_LIGHT),
          metaRow("Date",          "08 August 2026", WHITE),
        ]
      }),

      gap(180),

      callout("Note on this document", "This quotation is based on the fully developed and tested software system. The system includes extensive features such as mobile apps, a web dashboard, desktop software, and advanced security. The pricing reflects a special long term partnership rate of ₹3,00,000, which is significantly lower than standard market rates for a system of this scale."),

      gap(220),

      // ══════ 1. EXECUTIVE SUMMARY ══════
      h1("1.  Executive Summary"),
      gap(60),
      body("Canaan ERP is a complete, ready to use fleet and transport management platform designed specifically for Canaan Global International's operations. It digitizes every part of your business, from booking trips and assigning containers to tracking yard collections, verifying accounts, and generating automated invoices. It also manages your entire fleet, tyres, drivers, staff, attendance, and finances in one easy to use system."),
      gap(100),
      body("The platform is available on four different devices:", { after: 80 }),
      bullet("A Web Application, accessible on any internet browser"),
      bullet("A Windows Desktop Application, designed for fast, focused office use"),
      bullet("An Android App, a secure mobile app for managing operations on the go"),
      bullet("An iOS App, a secure mobile app for iPhones"),
      gap(100),
      body("It supports 7 different user roles with specific permissions (like Admin, Finance, Yard Supervisor, etc.) and ensures that all screens update instantly in real time."),
      gap(100),
      callout("A note on pricing", "The ₹3,00,000 total is offered as a special long term partnership rate. The standard market rate for a system of this size and quality (covering web, desktop, and mobile apps with advanced security) is typically ₹5 to ₹6 lakhs. This price is a deliberate choice to build a strong, ongoing relationship with Canaan."),

      gap(200),

      // ══════ 2. SCOPE OF DELIVERY ══════
      h1("2.  Scope of Delivery: What the System Does"),
      gap(60),

      dataTable(
        ["#", "Module", "What It Does"],
        [
          ["1", "Trip Management", "Handles everything from booking to trip completion, including driver assignment, live status tracking, and final verification."],
          ["2", "Documentation & Reconciliation", "Manages trip data entry, fuel logging, mileage checks, and links all data to the original booking."],
          ["3", "Accounts & Automated Invoicing", "Automates the creation of Tax Invoices, Bills of Supply, and Transport Memos. Handles GST calculations and Driver Advance Bills."],
          ["4", "Yard Supervisor Workflow", "Provides a dedicated screen for collecting trip sheets, verifying driver advances, and sending alerts for pending collections."],
          ["5", "Fleet / Truck Management", "Keeps track of all vehicle details and sends automatic alerts when important documents (like insurance or permits) are about to expire."],
          ["6", "Tyre Management", "Tracks your tyre inventory, installation history on trucks, and monitors tyre lifespan."],
          ["7", "Fuel & AdBlue", "Automatically tracks fuel usage from trip sheets and manages AdBlue purchases and consumption."],
          ["8", "Maintenance", "Keeps a log of all truck repairs and costs, and sends automatic alerts when maintenance is due based on mileage."],
          ["9", "Driver & Staff Management", "Stores all driver and staff details, including photos and documents, and manages their access to the system."],
          ["10", "Attendance & Leave", "Tracks daily attendance for drivers and staff, generates monthly reports, and handles leave requests and approvals."],
          ["11", "Finance", "Tracks truck EMI payments, recurring costs, and manages driver and staff salaries and advances."],
          ["12", "Profit & Loss Analytics", "Provides detailed reports on your profits per trip and per truck, calculates running costs per kilometer, and summarizes overall business performance."],
          ["13", "Role Specific Dashboards", "Gives tailored, easy to read summary screens for Admins, Finance Managers, Fleet Managers, and Staff."],
          ["14", "Resource Hub", "A central place to manage lists of customers, vendors, staff, and pricing tables."],
          ["15", "Admin Settings", "Allows you to configure the system, manage branches, set expense rates, and view security logs."],
          ["16", "Reports & Cloud Backup", "Exports data to Excel and automatically backs up your system data securely to the cloud."],
          ["17", "Approvals & Audit", "Ensures all important changes are approved by a manager and keeps a secure log of all system activities."],
          ["18", "System Foundation", "Provides a secure, real time core system with strict user access controls."],
          ["19", "Mobile App (Android & iOS)", "A powerful companion app for admins to view dashboards, track trips, manage attendance, and handle approvals on the go, even offline."],
          ["20", "Advanced Security", "Protects your data with bank level security features, secure logins, encryption, and protection against unauthorized access or screen recording."],
        ],
        [5, 25, 70]
      ),

      gap(200),
      pageBreak(),

      // ══════ 3. SCALE OF THE SYSTEM ══════
      h1("3.  Scale of the System"),
      gap(60),
      body("This is a massive, fully custom built system designed specifically for your needs.", { after: 120 }),

      dataTable(
        ["Metric", "What is Included"],
        [
          ["Web & Desktop Screens", "47 different screens"],
          ["Mobile App Screens", "15+ dedicated mobile screens"],
          ["User Roles", "7 distinct staff roles"],
          ["Platforms Supported", "Web, Windows, Android, and iOS"],
          ["Technology Used", "Modern, industry standard tools (similar to those used by top tech companies) to ensure speed, reliability, and security."],
        ],
        [35, 65]
      ),

      gap(200),

      // ══════ 4. COST BREAKDOWN ══════
      h1("4.  Cost Breakdown"),
      gap(60),
      body("Pricing is presented module by module so every rupee is clearly accounted for.", { after: 120 }),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [400, 2400, CW - 400 - 2400 - 1600, 1600],
        rows: [
          priceHeaderRow(),
          priceRow("1",  "System Design & Setup",          "Planning the system structure, database design, and choosing the right technology.",                    "12,000"),
          priceRow("2",  "Core System & Security",         "Building the secure foundation, user logins, access controls, and real time communication.",            "12,000"),
          priceRow("3",  "Trip Management",                "Building the entire process for booking, tracking, and completing trips.",                              "28,000"),
          priceRow("4",  "Yard Supervisor Workflow",       "Creating the tools for tracking trip sheets and verifying driver advances.",                            "10,000"),
          priceRow("5",  "Data Entry & Checks",            "Systems for entering trip data, fuel logs, and verifying mileage.",                                     "20,000"),
          priceRow("6",  "Automated Invoicing",            "Automatic generation of invoices, memos, and GST calculations.",                                        "28,000"),
          priceRow("7",  "Fleet & Compliance",             "Tracking truck details and automated document expiry alerts.",                                          "12,000"),
          priceRow("8",  "Tyre Management",                "Tracking tyre inventory, usage, and lifespan.",                                                         "8,000"),
          priceRow("9",  "Fuel & AdBlue Tracking",         "Managing fuel and AdBlue logs and expenses.",                                                           "7,000"),
          priceRow("10", "Maintenance Tracking",           "Logging repairs, costs, and automated maintenance alerts.",                                             "10,000"),
          priceRow("11", "Staff & Attendance",             "Managing staff profiles, daily attendance, and leave approvals.",                                       "13,000"),
          priceRow("12", "Finance & Salaries",             "Tracking truck loans and managing staff/driver payments.",                                              "10,000"),
          priceRow("13", "Profitability Reports",          "Detailed analytics on trip profits, truck profits, and per kilometer running costs.",                    "25,000"),
          priceRow("14", "Dashboards",                     "Easy to read summary screens and charts for different managers.",                                       "15,000"),
          priceRow("15", "Admin Configuration",            "Tools for setting up branches, rates, and system rules.",                                               "15,000"),
          priceRow("16", "Exports & Backups",              "Excel reports and automated cloud backups.",                                                            "10,000"),
          priceRow("17", "Windows Desktop App",            "Creating the installable desktop version of the software.",                                             "15,000"),
          priceRow("18", "Mobile Apps (Android & iOS)",    "Building the mobile apps with offline support and smooth performance.",                                  "13,000"),
          priceRow("19", "Mobile Security",                "Implementing strict security measures to protect the mobile apps and user data.",                        "15,000"),
          priceRow("20", "Server Security",                "Securing the main system against unauthorized access and data breaches.",                                "10,000"),
          priceRow("21", "Testing & Launch",               "Final testing, setting up the server, and ensuring everything runs perfectly.",                          "10,000"),
          priceRow("",   "Total",                          "",                                                                                                      "3,00,000", true),
        ]
      }),

      gap(100),
      callout("Partner Rate", "All figures are in Indian Rupees (₹). This is a special partner rate; the market rate for a system with these features is typically ₹5 to ₹6 lakhs."),

      gap(200),
      pageBreak(),

      // ══════ 5. PAYMENT SCHEDULE ══════
      h1("5.  Payment Schedule"),
      gap(60),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [CW - 1600 - 1400, 1600, 1400],
        rows: [
          new TableRow({ children: [
            new TableCell({ width: { size: CW-3000, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 80 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: "Milestone", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
            new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing:{before:0,after:0}, children: [new TextRun({ text: "%", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
            new TableCell({ width: { size: 1400, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 80, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing:{before:0,after:0}, children: [new TextRun({ text: "Amount (₹)", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
          ]}),
          payRow("On project confirmation (advance)",                 "40%",  "1,20,000", 0),
          payRow("On completion of core trip & accounts modules",     "30%",  "90,000",   1),
          payRow("On final delivery & go live (all platforms)",       "30%",  "90,000",   0),
          payRow("Total",                                             "100%", "3,00,000", 0, true),
        ]
      }),

      gap(200),

      // ══════ 6. INCLUDED ══════
      h1("6.  What is Included"),
      gap(60),
      bullet("Full ownership of the software upon final payment"),
      bullet("Setup and installation on your server"),
      bullet("Training for admins and staff"),
      bullet("Easy to understand user guides"),
      bullet("60 days of free technical support after launch to fix any bugs"),
      bullet("Ready to install mobile apps for Android and iOS"),

      gap(200),

      // ══════ 7. NOT INCLUDED ══════
      h1("7.  What is Not Included (quoted separately)"),
      gap(60),
      bullet("Fees for publishing the apps on the Google Play Store or Apple App Store (client must own these accounts)"),
      bullet("Any new features or major changes requested beyond what is listed in this document"),

      gap(200),

      // ══════ 8. ASSUMPTIONS ══════
      h1("8.  Assumptions"),
      gap(60),
      bullet("This quotation covers the features exactly as they have been designed and built."),
      bullet("The client will provide the initial data (like customer lists and rates) and provide timely feedback during testing."),
      bullet("The client is responsible for paying for their own server hosting and any necessary app store accounts."),

      gap(200),

      // ══════ 9. WHY THIS PRICE ══════
      h1("9.  Why This Price?"),
      gap(60),
      body("The ₹3,00,000 price tag is offered as a long term partnership rate. A system of this massive scale, including web, desktop, and mobile applications, advanced security, and comprehensive business management features, would typically cost between ₹5 to ₹6 lakhs in the open market. This price reflects our commitment to building a lasting relationship with Canaan and supporting your business growth."),

      gap(200),

      // ══════ 10. ACCEPTANCE ══════
      h1("10.  Acceptance"),
      gap(60),
      body("Kindly confirm acceptance by signing below or replying to this quotation with written confirmation.", { after: 120 }),

      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [CW/2, CW/2],
        rows: [
          new TableRow({ children: [
            new TableCell({ width: { size: CW/2, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 160, right: 120 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: "For Canaan Global International", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
            new TableCell({ width: { size: CW/2, type: WidthType.DXA }, borders: thinBorders, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 120, right: 160 }, children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: "Developer", bold: true, size: 19, color: WHITE, font: "Calibri" })] })] }),
          ]}),
          sigRow("Name: ____________________", "Name: ____________________"),
          sigRow("Signature: _______________", "Signature: _______________"),
          sigRow("Date: ____________________", "Date: ____________________"),
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
      new Paragraph({ spacing: { before: 0, after: 0 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Ref: CAN-ERP-2026-002  ·  08 August 2026", size: 20, color: LABEL, italic: true, font: "Calibri" })] }),

    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(__dirname + "/Canaan_ERP_Quotation_CAN-ERP-2026-002.docx", buf);
  console.log("Done");
});
