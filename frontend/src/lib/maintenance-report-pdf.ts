/**
 * Truck Maintenance → View → Download PDF: the truck-wise maintenance report.
 * Drawn from the same figures as the Excel (backend maintenance_report.py,
 * GET /exports/maintenance-report/preview → `report`), so the two agree:
 *
 *   1. Summary     key figures, top 5 trucks, by type, top vendors, what's
 *                  not counted, worth knowing
 *   2. All Trucks  one row per truck, overdue reminders in red, totals
 *   3. One section per truck (new page each): totals, service status,
 *      every repair with a total, by type, reminders, waiting jobs
 *   4. By Vendor
 */
import { AMBER, GREY, NAVY, RED, createReportPdf, dmy, money, num, type Cell, type Column } from "@/lib/report-pdf-kit";

// The report figures as the backend sends them (snake_case, dates as ISO).
type Reminder = { maintenance_type: string; set_on: string | null; remind_at: number; km_left: number; state: string; done_again_on: string | null };
type RepairRow = {
  date: string | null; end_date: string | null; maintenance_type: string; repair_type: string; location: string; by: string;
  by_type: string; invoice_number: string; invoice_date: string | null; odometer: number; cost: number; record_total: number;
  entered_by: string; source: string; proofs: number; remarks: string;
};
type Waiting = { status: string; date: string | null; maintenance_type: string; repair_type: string; cost: number; submitted_by: string };
type ReportTruck = {
  id: number; truck_id: string; registration: string; truck_type: string; tyre_layout: string; make: string; status: string;
  odometer: number; records: number; repairs: number; cost: number;
  normal_monthly: number | null; last_service: { date: string; odometer: number; type: string } | null; days_since: number | null;
  next_reminder: Reminder | null; reminders: Reminder[]; top_repair: string;
  by_type: { type: string; jobs: number; cost: number }[]; rows: RepairRow[]; waiting: Waiting[];
};
export type MaintenanceReport = {
  period: { start: string | null; end: string | null; label: string };
  generated_at: string;
  /** "Days since" the last service counts to this day (period end or today). */
  as_of: string;
  search: string;
  single_truck: boolean;
  totals: {
    trucks: number; serviced: number; idle: number; records: number; repairs: number; cost: number;
    avg_per_serviced: number; overdue: number; due_soon: number;
    scheduled: number; scheduled_cost: number; pending: number; pending_cost: number; period_open: boolean;
  };
  top_trucks: ReportTruck[];
  by_type: { type: string; records: number; repairs: number; cost: number; share: number }[];
  vendors: { name: string; kind: string; jobs: number; trucks: number; cost: number; last_date: string | null }[];
  trucks: ReportTruck[];
};

const R = (v: number | null | undefined) => (v == null ? "-" : `Rs. ${money(v)}`);
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "-");

function reminderCell(rem: Reminder | null): Cell {
  if (!rem) return { text: "-", color: GREY };
  if (rem.state === "Overdue") return { text: `Overdue ${num(Math.abs(rem.km_left))} km | ${rem.maintenance_type}`, color: RED, bold: true };
  return { text: `${num(rem.km_left)} km left | ${rem.maintenance_type}`, color: rem.state === "Due soon" ? AMBER : undefined, bold: rem.state === "Due soon" };
}

export async function downloadMaintenanceReportPdf({ report, filename, deliver }: {
  report: MaintenanceReport;
  filename: string;
  deliver?: (pdf: import("jspdf").jsPDF, name: string) => void;
}): Promise<void> {
  const rep = report;
  const t = rep.totals;
  const name = "Truck Maintenance Report";
  const k = await createReportPdf({ reportName: name, period: rep.period.label });
  const { M, W, text, para, table, tiles, pairs, section, ensure, newPage, pageTitle } = k;

  // ── 1. Summary ──────────────────────────────────────────────────────────────
  const single = rep.single_truck && rep.trucks[0];
  let y = pageTitle(
    single ? `${name} - ${single.registration}` : name,
    `${rep.period.label} | Downloaded ${rep.generated_at}${rep.search ? ` | Search: "${rep.search}" (only matching trucks)` : ""}`,
  );
  y = tiles(y + 1, [
    { label: "Total maintenance cost", value: R(t.cost), note: `${t.records} records | ${t.repairs} repairs` },
    { label: "Trucks with maintenance", value: `${t.serviced} of ${t.trucks}`, note: t.idle ? `${t.idle} with none in this period` : "every truck had some" },
    { label: "Waiting for approval (not counted)", value: String(t.pending), color: t.pending ? AMBER : NAVY, note: t.pending ? `worth ${R(t.pending_cost)}` : "nothing waiting" },
    { label: "Reminders overdue", value: String(t.overdue), color: t.overdue ? RED : NAVY, note: t.due_soon ? `${t.due_soon} more due within 500 km` : "none due within 500 km" },
  ]);

  // Top 5 trucks and top vendors side by side, then cost by type.
  const half = (W - M * 2 - 6) / 2;
  const top = rep.top_trucks;
  if (top.length || rep.vendors.length) {
    const yTop = y;
    text("TOP 5 COSTLIEST TRUCKS", M, yTop, { size: 9, bold: true, color: NAVY });
    text("TOP 5 VENDORS", M + half + 6, yTop, { size: 9, bold: true, color: NAVY });
    const yL = table(top, [
      { header: "Truck", width: 34, cell: (x) => x.registration },
      { header: "Records", width: 12, align: "center", cell: (x) => String(x.records) },
      { header: "Cost (Rs.)", width: 22, align: "right", cell: (x) => ({ text: money(x.cost), bold: true }) },
      { header: "Share", width: 12, align: "right", cell: (x) => pct(x.cost, t.cost) },
    ], null, yTop + 2.5, name, undefined, { x: M, width: half });
    const yR = table(rep.vendors.slice(0, 5), [
      { header: "Vendor / person", width: 44, cell: (x) => x.name },
      { header: "Repairs", width: 12, align: "center", cell: (x) => String(x.jobs) },
      { header: "Trucks", width: 12, align: "center", cell: (x) => String(x.trucks) },
      { header: "Cost (Rs.)", width: 22, align: "right", cell: (x) => money(x.cost) },
    ], null, yTop + 2.5, name, undefined, { x: M + half + 6, width: half });
    y = Math.max(yL, yR) + 6;
  }
  if (rep.by_type.length) {
    const shown = rep.by_type.slice(0, 7);
    const rest = rep.by_type.slice(7);
    const rows = rest.length
      ? [...shown, { type: `Other (${rest.length} types)`, records: rest.reduce((s, x) => s + x.records, 0), repairs: rest.reduce((s, x) => s + x.repairs, 0), cost: rest.reduce((s, x) => s + x.cost, 0), share: rest.reduce((s, x) => s + x.share, 0) }]
      : shown;
    y = ensure(y, 20, name);
    y = section(y, "Cost by maintenance type") - 2;
    y = table(rows, [
      { header: "Maintenance type", width: 60, cell: (x) => x.type },
      { header: "Records", width: 14, align: "center", cell: (x) => String(x.records) },
      { header: "Repairs", width: 14, align: "center", cell: (x) => String(x.repairs) },
      { header: "Cost (Rs.)", width: 22, align: "right", cell: (x) => money(x.cost) },
      { header: "Share", width: 14, align: "right", cell: (x) => `${x.share.toFixed(1)}%` },
    ], null, y, name) + 6;
  }
  if (!t.records) {
    y = para("No approved maintenance in this period.", M, y, W - M * 2, 9, GREY) + 3;
  }

  // Not counted + worth knowing.
  y = ensure(y, 30, name);
  const yA = pairs(M, y, half, "NOT COUNTED IN THE TOTALS", [
    ["Scheduled jobs waiting for their cost", String(t.scheduled)],
    ["  their costs entered so far", R(t.scheduled_cost)],
    ["Records waiting for approval", String(t.pending), t.pending ? { text: String(t.pending), color: AMBER } : undefined],
    ["  their cost", R(t.pending_cost)],
  ]);
  let yB = y;
  text("WORTH KNOWING", M + half + 6, yB + 4, { size: 8, bold: true, color: AMBER });
  yB += 8;
  const notes = [
    ...(t.period_open ? ["The period isn't over yet: bills for the rest of it may still come in."] : []),
    "Only approved bills count, dated by the day the work started.",
    "A reminder stays open until the same maintenance type is done again.",
    "Sold trucks appear only if they had maintenance in the period.",
  ];
  notes.forEach((n, i) => { yB = para(`${i + 1}. ${n}`, M + half + 6, yB, half, 7.5); });
  y = Math.max(yA, yB) + 4;

  // ── 2. All Trucks ───────────────────────────────────────────────────────────
  const allSub = "Every truck in the report. Overdue reminders in red; trucks with no maintenance in the period show \"None\".";
  if (!single) {
    y = newPage("All Trucks", allSub) + 1;
    const cols: Column<ReportTruck>[] = [
      { header: "Truck", width: 30, cell: (x) => `${x.registration} | ${x.truck_id}` },
      { header: "Status", width: 16, cell: (x) => ({ text: x.status, color: x.status === "Active" ? undefined : GREY }) },
      { header: "Records", width: 11, align: "center", cell: (x) => (x.records ? String(x.records) : { text: "None", color: GREY }) },
      { header: "Cost (Rs.)", width: 19, align: "right", cell: (x) => money(x.cost) },
      { header: "Normal / month", width: 17, align: "right", cell: (x) => money(x.normal_monthly) },
      { header: "Last service", width: 16, align: "center", cell: (x) => (x.last_service ? dmy(x.last_service.date) : { text: "Never", color: GREY }) },
      { header: "Next reminder", width: 40, cell: (x) => reminderCell(x.next_reminder) },
      { header: "Waiting", width: 11, align: "center", cell: (x) => (x.waiting.length ? { text: String(x.waiting.length), color: AMBER, bold: true } : "-") },
    ];
    table(rep.trucks, cols, [
      { text: `TOTAL (${t.trucks} trucks)` }, { text: "" }, { text: String(t.records), align: "center" },
      { text: money(t.cost), align: "right" },
      { text: "" }, { text: "" }, { text: t.overdue ? `${t.overdue} overdue` : "", color: RED }, { text: String(t.scheduled + t.pending), align: "center" },
    ], y, "All Trucks", allSub);
  }

  // ── 3. One section per truck ────────────────────────────────────────────────
  for (const x of rep.trucks) {
    if (!x.records && !single) continue;
    const title = `${x.registration} | ${x.truck_id}`;
    const sub = `${x.make || "-"} | ${x.truck_type || "-"} | ${x.tyre_layout || "-"} tyres | ${x.status} | odometer ${num(x.odometer)} km`;
    y = newPage(title, sub) + 1;
    const third = (W - M * 2 - 8) / 3;
    const y1 = pairs(M, y, third, "THIS PERIOD", [
      ["Records | repairs", `${x.records} | ${x.repairs}`],
      ["Total cost", R(x.cost)],
      ["Share of the fleet's cost", pct(x.cost, t.cost)],
      ["Days with work recorded", String(new Set(x.rows.map((r) => r.date)).size)],
    ]);
    const y2 = pairs(M + third + 4, y, third, "COMPARED WITH NORMAL", [
      ["Normal maintenance a month", R(x.normal_monthly)],
      ["(12-month average)", ""],
      ["Most frequent repair", x.top_repair || "-"],
      ["Waiting (not counted)", x.waiting.length ? String(x.waiting.length) : "None", x.waiting.length ? { text: String(x.waiting.length), color: AMBER } : undefined],
    ]);
    const ls = x.last_service;
    const y3 = pairs(M + (third + 4) * 2, y, third, "SERVICE STATUS", [
      ["Last service", ls ? `${dmy(ls.date)}${ls.odometer ? ` at ${num(ls.odometer)} km` : ""}` : "Never"],
      ["  type", ls ? ls.type || "-" : "-"],
      [`Days since (to ${dmy(rep.as_of)})`, x.days_since == null ? "-" : String(x.days_since)],
      ["Next reminder", "", reminderCell(x.next_reminder)],
    ]);
    y = Math.max(y1, y2, y3) + 3;

    y = ensure(y, 16, title, sub);
    y = section(y, "Repairs in this period");
    if (x.rows.length) {
      y = table(x.rows, [
        { header: "Date", width: 15, align: "center", cell: (r) => dmy(r.date) },
        { header: "Maintenance type", width: 32, cell: (r) => r.maintenance_type },
        { header: "Repair", width: 32, cell: (r) => r.repair_type },
        { header: "Done by", width: 30, cell: (r) => r.by || "-" },
        { header: "Location", width: 20, cell: (r) => r.location || "-" },
        { header: "Invoice", width: 18, cell: (r) => (r.invoice_number ? `${r.invoice_number}${r.invoice_date ? ` | ${dmy(r.invoice_date)}` : ""}` : "-") },
        { header: "Odometer", width: 14, align: "right", cell: (r) => (r.odometer ? num(r.odometer) : "-") },
        { header: "Cost (Rs.)", width: 18, align: "right", cell: (r) => money(r.cost) },
        { header: "Source", width: 14, cell: (r) => (r.source === "Maintenance form" ? "Form" : r.source || "-") },
      ], [
        { text: "TOTAL" }, { text: `${x.repairs} repair${x.repairs === 1 ? "" : "s"}` }, { text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "" },
        { text: money(x.cost), align: "right" }, { text: "" },
      ], y, title, sub) + 5;
    } else {
      y = para("No maintenance in this period.", M, y + 1, W - M * 2, 8, GREY) + 3;
    }

    if (x.by_type.length > 1) {
      y = ensure(y, 18, title, sub);
      y = section(y, "By maintenance type");
      y = table(x.by_type, [
        { header: "Maintenance type", width: 60, cell: (b) => b.type },
        { header: "Records", width: 14, align: "center", cell: (b) => String(b.jobs) },
        { header: "Cost (Rs.)", width: 22, align: "right", cell: (b) => money(b.cost) },
        { header: "Share", width: 14, align: "right", cell: (b) => pct(b.cost, x.cost) },
      ], null, y, title, sub) + 5;
    }

    const open = x.reminders.filter((r) => r.state !== "Done again");
    if (open.length) {
      y = ensure(y, 18, title, sub);
      y = section(y, "Open reminders");
      y = table(open, [
        { header: "Maintenance type", width: 50, cell: (r) => r.maintenance_type },
        { header: "Set on", width: 16, align: "center", cell: (r) => dmy(r.set_on) },
        { header: "Remind at (km)", width: 18, align: "right", cell: (r) => num(r.remind_at) },
        { header: "Km left", width: 16, align: "right", cell: (r) => ({ text: num(r.km_left), color: r.km_left <= 0 ? RED : undefined, bold: r.km_left <= 0 }) },
        { header: "State", width: 16, cell: (r) => ({ text: r.state, color: r.state === "Overdue" ? RED : r.state === "Due soon" ? AMBER : undefined, bold: r.state !== "Upcoming" }) },
      ], null, y, title, sub) + 5;
    }

    if (x.waiting.length) {
      y = ensure(y, 18, title, sub);
      y = section(y, "Waiting - not counted above", AMBER);
      y = table(x.waiting, [
        { header: "Status", width: 30, cell: (w) => ({ text: w.status, color: AMBER }) },
        { header: "Date", width: 16, align: "center", cell: (w) => dmy(w.date) },
        { header: "Maintenance type", width: 40, cell: (w) => w.maintenance_type },
        { header: "Repair", width: 40, cell: (w) => w.repair_type || "-" },
        { header: "Cost so far (Rs.)", width: 20, align: "right", cell: (w) => money(w.cost) },
        { header: "Submitted by", width: 26, cell: (w) => w.submitted_by },
      ], null, y, title, sub) + 5;
    }
  }

  // ── 4. By Vendor ────────────────────────────────────────────────────────────
  if (rep.vendors.length) {
    const vSub = "Every vendor or person who did the work in this period.";
    y = newPage("By Vendor", vSub) + 1;
    table(rep.vendors, [
      { header: "Vendor / person", width: 70, cell: (v) => v.name },
      { header: "Kind", width: 18, cell: (v) => v.kind || "-" },
      { header: "Repairs", width: 14, align: "center", cell: (v) => String(v.jobs) },
      { header: "Trucks", width: 14, align: "center", cell: (v) => String(v.trucks) },
      { header: "Cost (Rs.)", width: 24, align: "right", cell: (v) => money(v.cost) },
      { header: "Share", width: 14, align: "right", cell: (v) => pct(v.cost, t.cost) },
      { header: "Latest job", width: 18, align: "center", cell: (v) => dmy(v.last_date) },
    ], [
      { text: "TOTAL" }, { text: "" }, { text: String(rep.vendors.reduce((s, v) => s + v.jobs, 0)), align: "center" }, { text: "" },
      { text: money(t.cost), align: "right" }, { text: "" }, { text: "" },
    ], y, "By Vendor", vSub);
  }

  k.finish(`${filename.replace(/\.xlsx$/i, "")}.pdf`, deliver);
}
