/**
 * Profitability → View → Download PDF: a report to read, not a printed
 * spreadsheet. Built in the browser (jsPDF) from the same figures the page
 * shows (backend pl_compute.py):
 *
 *   1. Summary   period · mode · Trip and Truck totals side by side ·
 *                why the two tabs differ · worth knowing (data health)
 *   2. Trucks    one row per truck, the key columns, totals
 *   3. Trips     one row per trip, the key columns, totals; a trip that
 *                can't be judged shows why
 *
 * jsPDF's built-in fonts have no ₹, → or − — amounts are "Rs." and the text
 * is cleaned (clean()) so nothing prints as garbage.
 */
import type { PlComputed } from "@/lib/api";

type Report = {
  /** View's choice: Trip Profitability, Truck Profitability, or both (the full report). */
  part?: "both" | "trips" | "trucks";
  computed: PlComputed;
  startDate: string;
  endDate: string;
  mode: string;
  search: string;
  filename: string;
  /** Where the finished PDF goes — the browser's download by default (a test can keep it). */
  deliver?: (pdf: import("jspdf").jsPDF, name: string) => void;
};

type Cell = { text: string; align?: "left" | "right" | "center"; color?: [number, number, number]; bold?: boolean };
type Column<R> = { header: string; width: number; align?: "left" | "right" | "center"; cell: (r: R) => Cell | string };

const NAVY: [number, number, number] = [27, 43, 94];
const GREEN: [number, number, number] = [0, 120, 60];
const RED: [number, number, number] = [192, 0, 0];
const GREY: [number, number, number] = [110, 110, 110];
const INK: [number, number, number] = [30, 30, 30];
const COMPANY = "Canaan Global International";

/** Characters the built-in fonts can't draw, swapped for ones they can. */
function clean(s: string): string {
  return s.replace(/₹\s?/g, "Rs. ").replace(/→/g, "->").replace(/−/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}
const money = (v: number | null | undefined) =>
  v == null ? "-" : `${v < 0 ? "-" : ""}${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const km = (v: number) => (v > 0 ? v.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "-");
const d = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "-");
const signed = (v: number | null | undefined): Cell =>
  v == null ? { text: "-", align: "right" } : { text: money(v), align: "right", color: v < 0 ? RED : GREEN, bold: true };

export async function downloadPlReportPdf({ computed, startDate, endDate, mode, search, filename, deliver, part = "both" }: Report): Promise<void> {
  const showTrips = part !== "trucks";
  const showTrucks = part !== "trips";
  const reportTitle = part === "trips" ? "Trip Profitability Report" : part === "trucks" ? "Truck Profitability Report" : "Profitability Report";
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 10;
  const period = `${d(startDate)} to ${d(endDate)}`;

  const text = (s: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: [number, number, number]; align?: "left" | "right" | "center"; maxWidth?: number } = {}) => {
    pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    pdf.setFontSize(opts.size ?? 8);
    pdf.setTextColor(...(opts.color ?? INK));
    pdf.text(clean(s), x, y, { align: opts.align ?? "left", maxWidth: opts.maxWidth });
  };
  /** Wrapped paragraph; returns the y after it. */
  const para = (s: string, x: number, y: number, width: number, size = 8, color: [number, number, number] = INK) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(clean(s), width) as string[];
    pdf.text(lines, x, y);
    return y + lines.length * size * 0.42 + 1.2;
  };
  const fit = (s: string, width: number) => {
    const t = clean(s);
    if (pdf.getTextWidth(t) <= width) return t;
    let cut = t;
    while (cut.length > 1 && pdf.getTextWidth(`${cut}…`) > width) cut = cut.slice(0, -1);
    return `${cut}…`;
  };
  const pageTitle = (title: string, sub?: string) => {
    text(COMPANY.toUpperCase(), M, 9, { size: 7, bold: true, color: GREY });
    text(`Profitability Report · ${period} · ${mode} mode`, W - M, 9, { size: 7, color: GREY, align: "right" });
    text(title, M, 17, { size: 14, bold: true, color: NAVY });
    if (sub) text(sub, M, 22, { size: 8, color: GREY });
    return sub ? 27 : 22;
  };

  /** A table that flows across pages, header repeated, totals row in bold. */
  function table<R>(rows: R[], cols: Column<R>[], total: Cell[] | null, startY: number, title: string, sub: string) {
    const scale = (W - M * 2) / cols.reduce((s, c) => s + c.width, 0);
    const widths = cols.map((c) => c.width * scale);
    const rowH = 5.6;
    let y = startY;
    const head = () => {
      pdf.setFillColor(...NAVY);
      pdf.rect(M, y, W - M * 2, rowH + 0.6, "F");
      let x = M;
      cols.forEach((c, i) => {
        const a = c.align ?? "left";
        const tx = a === "right" ? x + widths[i] - 1.5 : a === "center" ? x + widths[i] / 2 : x + 1.5;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(6.8);
        pdf.setTextColor(255, 255, 255);
        pdf.text(fit(c.header, widths[i] - 3), tx, y + 4, { align: a });
        x += widths[i];
      });
      y += rowH + 0.6;
    };
    const draw = (cells: Cell[], fill?: [number, number, number], boldAll = false) => {
      if (fill) {
        pdf.setFillColor(...fill);
        pdf.rect(M, y, W - M * 2, rowH, "F");
      }
      let x = M;
      cells.forEach((c, i) => {
        const a = c.align ?? cols[i].align ?? "left";
        const tx = a === "right" ? x + widths[i] - 1.5 : a === "center" ? x + widths[i] / 2 : x + 1.5;
        pdf.setFont("helvetica", c.bold || boldAll ? "bold" : "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(...(c.color ?? INK));
        pdf.text(fit(c.text, widths[i] - 3), tx, y + 3.9, { align: a });
        x += widths[i];
      });
      y += rowH;
    };
    head();
    rows.forEach((r, i) => {
      if (y + rowH > H - 14) {
        pdf.addPage();
        y = pageTitle(`${title} (continued)`, sub) + 1;
        head();
      }
      draw(cols.map((c) => { const v = c.cell(r); return typeof v === "string" ? { text: v } : v; }), i % 2 ? [245, 247, 250] : undefined);
    });
    if (total) {
      if (y + rowH > H - 14) { pdf.addPage(); y = pageTitle(`${title} (continued)`, sub) + 1; head(); }
      pdf.setDrawColor(...NAVY);
      pdf.line(M, y, W - M, y);
      draw(total, [228, 233, 245], true);
    }
    return y;
  }

  const { tripTotals: tt, truckTotals: kt, dataHealth: dh } = computed;
  const trips = computed.trips;
  const trucks = computed.trucks;
  const counted = trips.filter((t) => !t.excludedFromTotals);
  const emiFull = trucks.reduce((s, e) => s + (e.emiDetails ?? []).reduce((a, l) => a + l.fullForPeriod, 0), 0);

  // ── 1. Summary ───────────────────────────────────────────────────────────────
  let y = pageTitle(reportTitle, `${period} · Cost mode: ${mode} · Downloaded ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}${search ? ` · Search: "${search}" (only matching trips and trucks)` : ""}`);
  const boxW = (W - M * 2 - 8) / 2;
  const box = (x: number, title: string, question: string, lines: [string, string, Cell?][]) => {
    let by = y + 2;
    pdf.setFillColor(...NAVY);
    pdf.rect(x, by, boxW, 7, "F");
    text(title, x + 3, by + 4.8, { size: 9, bold: true, color: [255, 255, 255] });
    by += 11;
    by = para(question, x + 3, by, boxW - 6, 7.5, GREY) + 1;
    for (const [label, value, cell] of lines) {
      text(label, x + 3, by, { size: 8 });
      const c = cell ?? { text: value };
      text(c.text, x + boxW - 3, by, { size: 8, bold: c.bold ?? true, color: c.color, align: "right" });
      pdf.setDrawColor(230, 230, 230);
      pdf.line(x + 3, by + 1.6, x + boxW - 3, by + 1.6);
      by += 5.6;
    }
    return by;
  };
  const otherBox = (x: number, title: string, label: string, v: number | null) =>
    box(x, title, "In its own report — choose it, or \"Both\", under View.", [[label, "", signed(v)]]);
  const yTrips = !showTrips ? otherBox(M, "TRIP PROFITABILITY", "Profit after all costs (Rs.)", tt.final) : box(M, "TRIP PROFITABILITY", "Was each trip a good deal? Each trip at steady costs per km, whether the truck was busy or quiet that month.", [
    ["Trips counted", `${tt.counted}${tt.flagged ? ` (+${tt.flagged} under audit review)` : ""}`],
    ["Hire (Rs.)", money(tt.hire)],
    ["Trip expenses (Rs.)", money(tt.tripExpenses)],
    ["Diesel (Rs.)", money(tt.diesel)],
    ["Truck expenses: EMI, maintenance, tyres, AdBlue, documents (Rs.)", money(tt.truckExpenses)],
    ["Profit after all costs (Rs.)", "", signed(tt.final)],
    ["Profitable trips", `${tt.profitable} of ${tt.finalTrips}`],
    ["Trips that can't be judged", String(tt.unjudged)],
  ]);
  const yTrucks = !showTrucks ? otherBox(M + boxW + 8, "TRUCK PROFITABILITY", "Profit after all costs (Rs.)", kt.net) : box(M + boxW + 8, "TRUCK PROFITABILITY", "What did each truck really make? The real bills: full EMI instalments (idle days too), actual repair bills and documents.", [
    ["Trucks", `${kt.trucks}${kt.idle ? ` (${kt.idle} with no trips)` : ""}`],
    ["Hire (Rs.)", money(kt.hire)],
    ["Trip expenses + diesel (Rs.)", money(kt.tripExpenses + kt.diesel)],
    ["Running costs: AdBlue, tyres, maintenance bills (Rs.)", money(kt.running)],
    ["EMI counted (Rs.)", `${money(trucks.reduce((s, e) => s + e.emiShare, 0))}${emiFull - trucks.reduce((s, e) => s + e.emiShare, 0) >= 1 ? ` of ${money(emiFull)} in full instalments` : ""}`],
    ["Documents (Rs.)", money(trucks.reduce((s, e) => s + e.documentShare, 0))],
    ["Profit after all costs (Rs.)", "", signed(kt.net)],
    ["Trucks that made a loss", `${kt.nonProfitable} of ${kt.trucks}`],
  ]);
  y = Math.max(yTrips, yTrucks) + 4;

  // Why the two tabs differ.
  const w = kt.whyDiffer;
  if (part === "both" && w && Math.abs(kt.net - w.tripsFinal) >= 1) {
    text("WHY THE TWO TABS DIFFER", M, y, { size: 9, bold: true, color: NAVY });
    y += 5;
    const lines: [string, number][] = [
      ["Trip Profitability: profit after all costs", w.tripsFinal],
      [`EMI not covered by trips (idle days, quiet months${w.idleTrucks ? `; ${w.idleTrucks} truck(s) had no trips` : ""})`, w.emi],
      ["Repairs above (or below) normal", w.maintenance],
      ["Documents", w.documents],
      [w.noKmTrips ? `Trips with no km on their sheet (${w.noKmTrips}): counted on Trucks only` : "Other", w.other],
      ["= Truck Profitability: profit after all costs", kt.net],
    ];
    for (const [label, v] of lines) {
      if (Math.abs(v) < 0.5 && !label.startsWith("=") && !label.startsWith("Trip Profitability")) continue;
      const strong = label.startsWith("=") || label.startsWith("Trip Profitability");
      text(label, M + 3, y, { size: 8, bold: strong });
      text(money(v), M + 160, y, { size: 8, bold: true, color: v < 0 ? RED : GREEN, align: "right" });
      y += 4.8;
    }
    y += 2;
  }

  // Worth knowing.
  const today = new Date().toISOString().slice(0, 10);
  const worth: string[] = [];
  if (endDate > today && startDate <= today) {
    const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1;
    worth.push(`The period isn't over: ${days(startDate, today)} of ${days(startDate, endDate)} days so far. On Truck Profitability, EMI and other costs count only up to today (${d(today)}).`);
  }
  if (dh.noKmTrips) worth.push(`${dh.noKmTrips} trip(s) have no km on their trip sheet, so Trip Profitability can't judge them (Truck Profitability still counts their hire).`);
  if (dh.noDieselTrips) worth.push(`${dh.noDieselTrips} trip(s) on ${dh.noDieselTrucks} truck(s) can't be judged: no diesel cost per km (needs 2+ fuel fills).`);
  if (dh.documentsWithoutCost) worth.push(`${dh.documentsWithoutCost} document(s) have an expiry date but no cost entered, so they count as Rs. 0.`);
  if (worth.length) {
    if (y > H - 30) { pdf.addPage(); y = pageTitle(reportTitle) + 2; }
    text("WORTH KNOWING", M, y, { size: 9, bold: true, color: [197, 90, 17] });
    y += 5;
    worth.forEach((s, i) => { y = para(`${i + 1}. ${s}`, M + 3, y, W - M * 2 - 6, 8); });
  }

  // ── 2. Trucks ────────────────────────────────────────────────────────────────
  if (showTrucks) {
  pdf.addPage();
  const truckSub = "The real bills for the period. EMI marked * is less than the full instalments — see the notes below the table.";
  y = pageTitle("Truck Profitability", truckSub) + 1;
  const partEmi = (e: (typeof trucks)[number]) => (e.emiDetails ?? []).reduce((s, l) => s + l.fullForPeriod, 0) - e.emiShare >= 1;
  const truckCols: Column<(typeof trucks)[number]>[] = [
    { header: "Truck", width: 30, cell: (e) => `${e.truckId} · ${e.registrationNumber || ""}${e.disposal ? ` (${e.disposal})` : ""}` },
    { header: "Trips", width: 10, align: "center", cell: (e) => (e.tripCount ? String(e.tripCount) : "Idle") },
    { header: "KM", width: 13, align: "right", cell: (e) => km(e.totalKm) },
    { header: "Hire", width: 20, align: "right", cell: (e) => money(e.totalHireAmount) },
    { header: "Trip Exp.", width: 18, align: "right", cell: (e) => money(e.tripExpenses) },
    { header: "Diesel", width: 18, align: "right", cell: (e) => money(e.money.diesel) },
    { header: "AdBlue+Tyres", width: 17, align: "right", cell: (e) => money((e.money.adblue ?? 0) + (e.money.tyres ?? 0)) },
    { header: "Maintenance", width: 18, align: "right", cell: (e) => money(e.maintenanceExpenses) },
    { header: "EMI", width: 18, align: "right", cell: (e) => `${money(e.emiShare)}${partEmi(e) ? "*" : ""}` },
    { header: "Documents", width: 15, align: "right", cell: (e) => money(e.documentShare) },
    { header: "Net Profit", width: 20, align: "right", cell: (e) => signed(e.money.net) },
  ];
  const sum = (f: (e: (typeof trucks)[number]) => number) => trucks.reduce((s, e) => s + f(e), 0);
  y = table(trucks, truckCols, [
    { text: `TOTAL (${trucks.length} trucks)`, bold: true }, { text: String(kt.trips), align: "center" }, { text: km(kt.km), align: "right" },
    { text: money(kt.hire), align: "right" }, { text: money(kt.tripExpenses), align: "right" }, { text: money(kt.diesel), align: "right" },
    { text: money(sum((e) => (e.money.adblue ?? 0) + (e.money.tyres ?? 0))), align: "right" },
    { text: money(sum((e) => e.maintenanceExpenses)), align: "right" }, { text: money(sum((e) => e.emiShare)), align: "right" },
    { text: money(sum((e) => e.documentShare)), align: "right" }, signed(kt.net),
  ], y, "Truck Profitability", truckSub);
  // Where the rest of the EMI is, for each * above.
  const notes = trucks.flatMap((e) => (e.emiDetails ?? []).flatMap((l) => l.uncounted.map((g) =>
    `${e.registrationNumber || e.truckId}: Rs. ${money(g.amount)} of ${l.emiName.replace(/\s/g, "").toUpperCase() === (e.registrationNumber || "").replace(/\s/g, "").toUpperCase() ? "its" : `${l.emiName}'s`} EMI for ${d(g.from)} to ${d(g.to)} isn't counted — ${{
      future: "not over yet, it counts as those days pass", outside: "outside the dates picked", loan_start: "before the loan started",
      loan_end: "after the loan ended", sold: "after the truck left the fleet",
    }[g.reason]}.`)));
  if (notes.length) {
    y += 4;
    if (y > H - 20) { pdf.addPage(); y = pageTitle("Truck Profitability (continued)", truckSub) + 2; }
    text("* EMI not counted in this period", M, y, { size: 8, bold: true, color: NAVY });
    y += 4.5;
    for (const n of notes) {
      if (y > H - 14) { pdf.addPage(); y = pageTitle("Truck Profitability (continued)", truckSub) + 2; }
      y = para(n, M + 2, y, W - M * 2 - 4, 7, GREY);
    }
  }

  }

  // ── 3. Trips ─────────────────────────────────────────────────────────────────
  if (showTrips) {
  pdf.addPage();
  const tripSub = "Each trip at steady costs per km. Truck expenses = EMI, maintenance, tyres, AdBlue and documents for the trip's km.";
  y = pageTitle("Trip Profitability", tripSub) + 1;
  const reason = (t: (typeof trips)[number]) =>
    t.excludedFromTotals ? "Under review" : t.totalKm <= 0 ? "No km" : t.money.dieselRate == null ? "No diesel rate" : "Can't judge";
  const tripCols: Column<(typeof trips)[number]>[] = [
    { header: "Trip", width: 24, cell: (t) => `${t.tripCode || "-"} · ${d(t.tripDate)}` },
    { header: "Truck", width: 26, cell: (t) => `${t.truckId} · ${t.registrationNumber || ""}` },
    { header: "Route", width: 44, cell: (t) => (t.fromLocation && t.toLocation ? `${t.fromLocation} -> ${t.toLocation}` : "-") },
    { header: "KM", width: 11, align: "right", cell: (t) => km(t.totalKm) },
    { header: "Hire", width: 17, align: "right", cell: (t) => ({ text: money(t.hireAmount), align: "right", color: t.excludedFromTotals ? GREY : undefined }) },
    { header: "Expenses", width: 16, align: "right", cell: (t) => ({ text: money(t.totalExpense), align: "right", color: t.excludedFromTotals ? GREY : undefined }) },
    { header: "Diesel", width: 16, align: "right", cell: (t) => (t.excludedFromTotals ? "-" : money(t.money.diesel)) },
    { header: "Truck Exp.", width: 16, align: "right", cell: (t) => (t.excludedFromTotals ? "-" : money(t.money.truckExpenses)) },
    { header: "Final Profit", width: 19, align: "right", cell: (t) =>
      !t.excludedFromTotals && t.money.finalProfit != null ? signed(t.money.finalProfit) : { text: reason(t), align: "right", color: GREY } },
  ];
  y = table(trips, tripCols, [
    { text: `TOTAL · ${tt.counted} counted`, bold: true }, { text: "" }, { text: "" },
    { text: km(counted.reduce((s, t) => s + t.totalKm, 0)), align: "right" },
    { text: money(tt.hire), align: "right" }, { text: money(tt.tripExpenses), align: "right" }, { text: money(tt.diesel), align: "right" },
    { text: money(tt.truckExpenses), align: "right" }, signed(tt.final),
  ], y, "Trip Profitability", tripSub);
  if (tt.flagged) {
    y += 4;
    para(`${tt.flagged} trip(s) under audit review are listed in grey but left out of every total until the review is done.`, M + 2, y, W - M * 2, 7, GREY);
  }

  }

  // Page numbers on every page.
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    text(`Page ${i} of ${n}`, W - M, H - 6, { size: 7, color: GREY, align: "right" });
    text(`${COMPANY} · ${reportTitle} · ${period}`, M, H - 6, { size: 7, color: GREY });
  }
  const name = `${filename.replace(/\.xlsx$/i, "")}.pdf`;
  if (deliver) deliver(pdf, name);
  else pdf.save(name);
}
