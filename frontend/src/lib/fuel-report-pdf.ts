/**
 * Truck's Fuel History → View → Download PDF: the truck-wise fuel report.
 * Drawn from the same figures as the Excel (backend fuel_report.py,
 * GET /exports/fuel-report/preview → `report`):
 *
 *   1. Summary     key figures, top trucks by diesel cost, best and lowest
 *                  mileage, top stations, worth knowing
 *   2. All Trucks  one row per truck, fills to check in amber, totals
 *   3. One section per truck (new page each): this period, mileage,
 *      last fill, every fill with its check, by month
 *   4. By Station
 */
import { AMBER, GREY, NAVY, RED, GREEN, createReportPdf, dmy, money, num, type Cell, type Column } from "@/lib/report-pdf-kit";

type FillRow = {
  date: string | null; odometer: number; distance: number | null; litres: number; price: number; total: number;
  mileage: number | null; status: string; ok: boolean; station: string; entered_by: string; source: string;
};
type ReportTruck = {
  id: number; truck_id: string; registration: string; truck_type: string; tyre_layout: string; make: string;
  fuel_capacity: number | null; status: string; odometer: number;
  fills: number; litres: number; cost: number; avg_price: number | null;
  mileage: number | null; mileage_km: number; mileage_litres: number; normal_mileage: number | null; checks: number;
  last_fill: { date: string; odometer: number; litres: number } | null; days_since: number | null;
  rows: FillRow[]; by_month: { month: string; fills: number; litres: number; cost: number }[];
};
export type FuelReport = {
  period: { start: string | null; end: string | null; label: string };
  generated_at: string;
  as_of: string;
  search: string;
  single_truck: boolean;
  base_price: number | null;
  limits: { min: number; max: number };
  totals: {
    trucks: number; with_fills: number; without: number; fills: number; litres: number; cost: number;
    avg_price: number | null; mileage: number | null; checks: number; period_open: boolean;
  };
  top_trucks: ReportTruck[];
  best: ReportTruck[];
  lowest: ReportTruck[];
  stations: { name: string; fills: number; litres: number; cost: number; avg_price: number | null; trucks: number; last_date: string | null }[];
  trucks: ReportTruck[];
};

const R = (v: number | null | undefined) => (v == null ? "-" : `Rs. ${money(v)}`);
const L = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const kml = (v: number | null | undefined) => (v == null ? "-" : v.toFixed(2));
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "-");

function vsNormal(x: ReportTruck): Cell {
  if (x.mileage == null || !x.normal_mileage) return { text: "-", color: GREY };
  const diff = ((x.mileage - x.normal_mileage) / x.normal_mileage) * 100;
  if (Math.abs(diff) < 5) return { text: "about normal" };
  return diff > 0 ? { text: `${diff.toFixed(0)}% better`, color: GREEN, bold: true } : { text: `${Math.abs(diff).toFixed(0)}% lower`, color: RED, bold: true };
}

export async function downloadFuelReportPdf({ report, filename, deliver }: {
  report: FuelReport;
  filename: string;
  deliver?: (pdf: import("jspdf").jsPDF, name: string) => void;
}): Promise<void> {
  const rep = report;
  const t = rep.totals;
  const name = "Fuel Report";
  const k = await createReportPdf({ reportName: name, period: rep.period.label });
  const { M, W, text, para, table, tiles, pairs, section, ensure, newPage, pageTitle } = k;
  const half = (W - M * 2 - 6) / 2;
  const single = rep.single_truck && rep.trucks[0];

  // ── 1. Summary ──────────────────────────────────────────────────────────────
  let y = pageTitle(
    single ? `${name} - ${single.registration}` : name,
    `${rep.period.label} | Downloaded ${rep.generated_at}${rep.search ? ` | Search: "${rep.search}" (only matching trucks)` : ""}`,
  );
  y = tiles(y + 1, [
    { label: "Diesel cost", value: R(t.cost), note: `${t.fills} fills | ${L(t.litres)} litres` },
    { label: "Average price paid per litre", value: R(t.avg_price), note: rep.base_price ? `base price Rs. ${money(rep.base_price)}` : "" },
    { label: "Fleet mileage", value: t.mileage == null ? "-" : `${kml(t.mileage)} km/L`, note: `${t.with_fills} of ${t.trucks} trucks took fuel` },
    { label: "Fills to check", value: String(t.checks), color: t.checks ? AMBER : NAVY, note: t.checks ? "see each truck's page" : "nothing to check" },
  ]);

  const twoTables = <A, B>(leftTitle: string, left: A[], lc: Column<A>[], rightTitle: string, right: B[], rc: Column<B>[]) => {
    if (!left.length && !right.length) return;
    y = ensure(y, 40, name);
    const yTop = y;
    text(leftTitle, M, yTop, { size: 9, bold: true, color: NAVY });
    text(rightTitle, M + half + 6, yTop, { size: 9, bold: true, color: NAVY });
    const yL = left.length ? table(left, lc, null, yTop + 2.5, name, undefined, { x: M, width: half }) : yTop + 6;
    const yR = right.length ? table(right, rc, null, yTop + 2.5, name, undefined, { x: M + half + 6, width: half }) : yTop + 6;
    y = Math.max(yL, yR) + 6;
  };
  const mileageCols: Column<ReportTruck>[] = [
    { header: "Truck", width: 30, cell: (x) => x.registration },
    { header: "km/L", width: 12, align: "right", cell: (x) => ({ text: kml(x.mileage), bold: true }) },
    { header: "Normal", width: 12, align: "right", cell: (x) => kml(x.normal_mileage) },
    { header: "Compared", width: 20, align: "right", cell: vsNormal },
  ];
  twoTables("TOP 5 TRUCKS BY DIESEL COST", rep.top_trucks, [
    { header: "Truck", width: 30, cell: (x) => x.registration },
    { header: "Fills", width: 10, align: "center", cell: (x) => String(x.fills) },
    { header: "Litres", width: 16, align: "right", cell: (x) => L(x.litres) },
    { header: "Cost (Rs.)", width: 20, align: "right", cell: (x) => ({ text: money(x.cost), bold: true }) },
    { header: "Share", width: 11, align: "right", cell: (x) => pct(x.cost, t.cost) },
  ], "BEST MILEAGE", rep.best, mileageCols);
  twoTables("LOWEST MILEAGE", rep.lowest, mileageCols, "TOP 5 FUEL STATIONS", rep.stations.slice(0, 5), [
    { header: "Station", width: 34, cell: (s) => s.name },
    { header: "Fills", width: 10, align: "center", cell: (s) => String(s.fills) },
    { header: "Cost (Rs.)", width: 20, align: "right", cell: (s) => money(s.cost) },
    { header: "Avg / L", width: 13, align: "right", cell: (s) => L(s.avg_price) },
  ]);
  if (!t.fills) y = para("No fuel fills in this period.", M, y, W - M * 2, 9, GREY) + 3;

  y = ensure(y, 26, name);
  y = section(y, "Worth knowing", AMBER);
  const notes = [
    ...(t.period_open ? ["The period isn't over yet: more fills may still be entered."] : []),
    `Mileage = km between two fills / litres at the second fill. Gaps no truck could drive (below ${rep.limits.min} or above ${rep.limits.max} km/L) mean a wrong odometer or a missed fill: they're marked "Check" and left out, as are fills far from the truck's usual ("Unusual").`,
    "Normal mileage is the truck's mileage over all its fills up to the end of the period.",
    `Average price paid = diesel cost / litres.${rep.base_price ? ` A price far from the base price (Rs. ${money(rep.base_price)}/L) is marked "price looks wrong".` : ""}`,
  ];
  notes.forEach((n, i) => { y = para(`${i + 1}. ${n}`, M + 2, y, W - M * 2 - 4, 7.5); });

  // ── 2. All Trucks ───────────────────────────────────────────────────────────
  const allSub = "Every truck in the report. \"Check\" counts fills to look at (wrong odometer, missed fill or odd price).";
  if (!single) {
    y = newPage("All Trucks", allSub) + 1;
    table(rep.trucks, [
      { header: "Truck", width: 30, cell: (x) => `${x.registration} | ${x.truck_id}` },
      { header: "Status", width: 15, cell: (x) => ({ text: x.status, color: x.status === "Active" ? undefined : GREY }) },
      { header: "Fills", width: 9, align: "center", cell: (x) => (x.fills ? String(x.fills) : { text: "None", color: GREY }) },
      { header: "Litres", width: 15, align: "right", cell: (x) => L(x.litres) },
      { header: "Diesel (Rs.)", width: 19, align: "right", cell: (x) => money(x.cost) },
      { header: "Avg / L", width: 12, align: "right", cell: (x) => L(x.avg_price) },
      { header: "km/L", width: 10, align: "right", cell: (x) => ({ text: kml(x.mileage), bold: x.mileage != null }) },
      { header: "Normal", width: 10, align: "right", cell: (x) => kml(x.normal_mileage) },
      { header: "Compared", width: 16, align: "right", cell: vsNormal },
      { header: "Last fill", width: 15, align: "center", cell: (x) => (x.last_fill ? dmy(x.last_fill.date) : { text: "Never", color: GREY }) },
      { header: "Check", width: 10, align: "center", cell: (x) => (x.checks ? { text: String(x.checks), color: AMBER, bold: true } : "-") },
    ], [
      { text: `TOTAL (${t.trucks} trucks)` }, { text: "" }, { text: String(t.fills), align: "center" },
      { text: L(t.litres), align: "right" }, { text: money(t.cost), align: "right" }, { text: L(t.avg_price), align: "right" },
      { text: kml(t.mileage), align: "right" }, { text: "" }, { text: "" }, { text: "" },
      { text: t.checks ? String(t.checks) : "", align: "center", color: AMBER },
    ], y, "All Trucks", allSub);
  }

  // ── 3. One section per truck ────────────────────────────────────────────────
  for (const x of rep.trucks) {
    if (!x.fills && !single) continue;
    const title = `${x.registration} | ${x.truck_id}`;
    const sub = `${x.make || "-"} | ${x.truck_type || "-"} | ${x.tyre_layout || "-"} tyres${x.fuel_capacity ? ` | ${num(x.fuel_capacity)} L tank` : ""} | ${x.status} | odometer ${num(x.odometer)} km`;
    y = newPage(title, sub) + 1;
    const third = (W - M * 2 - 8) / 3;
    const y1 = pairs(M, y, third, "THIS PERIOD", [
      ["Fills | litres", `${x.fills} | ${L(x.litres)}`],
      ["Diesel cost", R(x.cost)],
      ["Average price paid per litre", R(x.avg_price)],
      ["Fills to check", String(x.checks), x.checks ? { text: String(x.checks), color: AMBER } : undefined],
    ]);
    const y2 = pairs(M + third + 4, y, third, "MILEAGE", [
      ["This period", x.mileage == null ? "Not enough good fills" : `${kml(x.mileage)} km/L`],
      ["Normal (all fills to period end)", x.normal_mileage ? `${kml(x.normal_mileage)} km/L` : "-"],
      ["Compared with normal", "", vsNormal(x)],
      ["Worked out from", x.mileage == null ? "-" : `${num(x.mileage_km)} km | ${L(x.mileage_litres)} L`],
    ]);
    const lf = x.last_fill;
    const y3 = pairs(M + (third + 4) * 2, y, third, "LAST FILL", [
      ["Date", lf ? dmy(lf.date) : "Never"],
      ["At odometer", lf ? `${num(lf.odometer)} km` : "-"],
      ["Litres", lf ? L(lf.litres) : "-"],
      [`Days since (to ${dmy(rep.as_of)})`, x.days_since == null ? "-" : String(x.days_since)],
    ]);
    y = Math.max(y1, y2, y3) + 3;

    y = ensure(y, 16, title, sub);
    y = section(y, "Fills in this period");
    if (x.rows.length) {
      y = table(x.rows, [
        { header: "Date", width: 14, align: "center", cell: (r) => dmy(r.date) },
        { header: "Odometer", width: 14, align: "right", cell: (r) => num(r.odometer) },
        { header: "Km since last", width: 14, align: "right", cell: (r) => (r.distance == null ? "-" : num(r.distance)) },
        { header: "Litres", width: 12, align: "right", cell: (r) => L(r.litres) },
        { header: "Price / L", width: 12, align: "right", cell: (r) => L(r.price) },
        { header: "Total (Rs.)", width: 16, align: "right", cell: (r) => money(r.total) },
        { header: "km/L", width: 10, align: "right", cell: (r) => ({ text: kml(r.mileage), color: r.ok ? undefined : AMBER }) },
        { header: "Check", width: 46, cell: (r) => (r.status === "OK" ? { text: "OK", color: GREEN } : { text: r.status, color: r.ok ? GREY : AMBER, bold: !r.ok }) },
        { header: "Fuel station", width: 26, cell: (r) => r.station || "-" },
      ], [
        { text: "TOTAL" }, { text: `${x.fills} fills` }, { text: "" }, { text: L(x.litres), align: "right" }, { text: L(x.avg_price), align: "right" },
        { text: money(x.cost), align: "right" }, { text: kml(x.mileage), align: "right" }, { text: "" }, { text: "" },
      ], y, title, sub) + 5;
    } else {
      y = para("No fills in this period.", M, y + 1, W - M * 2, 8, GREY) + 3;
    }

    if (x.by_month.length > 1) {
      y = ensure(y, 18, title, sub);
      y = section(y, "By month");
      y = table(x.by_month, [
        { header: "Month", width: 30, cell: (m) => m.month },
        { header: "Fills", width: 12, align: "center", cell: (m) => String(m.fills) },
        { header: "Litres", width: 18, align: "right", cell: (m) => L(m.litres) },
        { header: "Diesel cost (Rs.)", width: 22, align: "right", cell: (m) => money(m.cost) },
        { header: "Avg price / L", width: 18, align: "right", cell: (m) => L(m.litres ? m.cost / m.litres : null) },
      ], null, y, title, sub) + 5;
    }
  }

  // ── 4. By Station ───────────────────────────────────────────────────────────
  if (rep.stations.length) {
    const sSub = "Every fuel station used in this period.";
    y = newPage("By Station", sSub) + 1;
    table(rep.stations, [
      { header: "Fuel station", width: 60, cell: (s) => s.name },
      { header: "Fills", width: 12, align: "center", cell: (s) => String(s.fills) },
      { header: "Trucks", width: 12, align: "center", cell: (s) => String(s.trucks) },
      { header: "Litres", width: 18, align: "right", cell: (s) => L(s.litres) },
      { header: "Diesel (Rs.)", width: 22, align: "right", cell: (s) => money(s.cost) },
      { header: "Avg / L", width: 14, align: "right", cell: (s) => L(s.avg_price) },
      { header: "Share", width: 12, align: "right", cell: (s) => pct(s.cost, t.cost) },
      { header: "Latest fill", width: 16, align: "center", cell: (s) => dmy(s.last_date) },
    ], [
      { text: "TOTAL" }, { text: String(t.fills), align: "center" }, { text: "" }, { text: L(t.litres), align: "right" },
      { text: money(t.cost), align: "right" }, { text: L(t.avg_price), align: "right" }, { text: "" }, { text: "" },
    ], y, "By Station", sSub);
  }

  k.finish(`${filename.replace(/\.xlsx$/i, "")}.pdf`, deliver);
}
