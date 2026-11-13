/**
 * Trip History → View → Download PDF: the category-wise trip report.
 * Drawn from the same figures as the Excel (backend trip_report.py,
 * GET /exports/trip-report/preview → `report`):
 *
 *   1. Summary        key figures, by category, top customers and routes,
 *                     worth knowing
 *   2. One section per trip category (new page each): its figures, every
 *      trip with a total, its cancelled trips
 *   3. By Customer
 *
 * The Invoice column is left out for Commercial Manager roles (show_invoice),
 * as on the page.
 */
import { AMBER, GREY, GREEN, NAVY, RED, createReportPdf, dmy, money, num, type Cell, type Column } from "@/lib/report-pdf-kit";

type TripRow = {
  trip_id: string; booking_ref: string; date: string | null; category: string; stage: string; cancelled: boolean;
  under_review: boolean; customer: string; origin: string; destination: string; route: string; container: string;
  driver: string; truck: string; has_sheet: boolean; km: number | null; hire: number | null; expense: number | null;
  summary: number | null; invoice: string; invoiced: boolean; waived: boolean;
};
type Totals = {
  trips: number; counted: number; cancelled: number; with_sheet: number; without_sheet: number; km: number;
  hire: number; expense: number; summary: number; avg_hire: number | null; invoiced: number; invoiced_hire: number;
  to_invoice: number; to_invoice_hire: number; waived: number; no_km: number; under_review: number;
  stages: Record<string, number>;
};
type Top = { name: string; trips: number; hire: number; summary: number };
type Category = { code: string; label: string; sheet: string; totals: Totals; rows: TripRow[]; top_customers: Top[]; top_routes: Top[] };
export type TripReport = {
  period: { start: string | null; end: string | null; label: string };
  generated_at: string;
  filters: string[];
  card: string;
  categories: string[];
  search: string;
  show_invoice: boolean;
  /** False for everyone but Admin: the backend leaves out every Trip Summary (hire − expenses). */
  show_profit?: boolean;
  period_open: boolean;
  totals: Totals;
  by_category: Category[];
  top_customers: Top[];
  top_routes: Top[];
  customers: { name: string; trips: number; by_cat: Record<string, number>; hire: number; expense: number; summary: number; invoiced_hire: number; to_invoice_hire: number }[];
};

const R = (v: number | null | undefined) => (v == null ? "-" : `Rs. ${money(v)}`);
const signed = (v: number | null | undefined): Cell =>
  v == null ? { text: "-", align: "right", color: GREY } : { text: money(v), align: "right", color: v < 0 ? RED : GREEN, bold: true };
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "-");

export async function downloadTripReportPdf({ report, filename, deliver }: {
  report: TripReport;
  filename: string;
  deliver?: (pdf: import("jspdf").jsPDF, name: string) => void;
}): Promise<void> {
  const rep = report;
  const t = rep.totals;
  const inv = rep.show_invoice;
  const sp = rep.show_profit !== false;   // Trip Summary is a profit figure: Admin only
  const name = "Trip History Report";
  const k = await createReportPdf({ reportName: name, period: rep.period.label });
  const { M, W, text, para, table, tiles, pairs, section, ensure, newPage, pageTitle } = k;
  const half = (W - M * 2 - 6) / 2;

  // ── 1. Summary ──────────────────────────────────────────────────────────────
  let y = pageTitle(name, `${rep.period.label} | Downloaded ${rep.generated_at}${rep.filters.length ? ` | ${rep.filters.join(" | ")}` : ""}`);
  y = tiles(y + 1, [
    { label: "Trips", value: num(t.trips), note: `${t.with_sheet} with a trip sheet${t.cancelled ? ` | ${t.cancelled} cancelled` : ""}` },
    { label: "Hire", value: R(t.hire), note: `${num(t.km)} km on trip sheets` },
    sp
      ? { label: "Trip Summary (hire - expenses)", value: R(t.summary), color: t.summary < 0 ? RED : GREEN, note: `expenses ${R(t.expense)}` }
      : { label: "Trip expenses", value: R(t.expense), note: "from the trip sheets" },
    inv
      ? { label: "Still to invoice", value: String(t.to_invoice), color: t.to_invoice ? AMBER : NAVY, note: `hire ${R(t.to_invoice_hire)}` }
      : { label: "Average hire per trip", value: R(t.avg_hire), note: "trips with a trip sheet" },
  ]);

  y = section(y, "By trip category") - 2;
  y = table(rep.by_category, [
    { header: "Category", width: 30, cell: (c) => ({ text: c.label, bold: true }) },
    { header: "Trips", width: 12, align: "center", cell: (c) => (c.totals.trips ? String(c.totals.trips) : { text: "None", color: GREY }) },
    { header: "Km", width: 16, align: "right", cell: (c) => num(c.totals.km) },
    { header: "Hire (Rs.)", width: 22, align: "right", cell: (c) => money(c.totals.hire) },
    { header: "Expenses (Rs.)", width: 22, align: "right", cell: (c) => money(c.totals.expense) },
    ...(sp ? [{ header: "Trip Summary (Rs.)", width: 24, align: "right" as const, cell: (c: Category) => signed(c.totals.summary) }] : []),
    { header: "Share of hire", width: 14, align: "right", cell: (c) => pct(c.totals.hire, t.hire) },
    ...(inv ? [{ header: "To invoice", width: 14, align: "center" as const, cell: (c: Category) => (c.code === "SHIFTING" ? { text: "n/a", color: GREY } : c.totals.to_invoice ? { text: String(c.totals.to_invoice), color: AMBER, bold: true } : "-") }] : []),
    { header: "0 km", width: 10, align: "center", cell: (c) => (c.totals.no_km ? { text: String(c.totals.no_km), color: AMBER, bold: true } : "-") },
  ], [
    { text: "TOTAL" }, { text: String(t.trips), align: "center" }, { text: num(t.km), align: "right" },
    { text: money(t.hire), align: "right" }, { text: money(t.expense), align: "right" }, ...(sp ? [signed(t.summary)] : []), { text: "" },
    ...(inv ? [{ text: t.to_invoice ? String(t.to_invoice) : "", align: "center" as const }] : []),
    { text: t.no_km ? String(t.no_km) : "", align: "center" },
  ], y, name) + 6;

  if (rep.top_customers.length || rep.top_routes.length) {
    y = ensure(y, 40, name);
    const yTop = y;
    text("TOP 5 CUSTOMERS", M, yTop, { size: 9, bold: true, color: NAVY });
    text("TOP 5 ROUTES", M + half + 6, yTop, { size: 9, bold: true, color: NAVY });
    const topCols = (label: string): Column<Top>[] => [
      { header: label, width: 52, cell: (a) => a.name },
      { header: "Trips", width: 10, align: "center", cell: (a) => String(a.trips) },
      { header: "Hire (Rs.)", width: 20, align: "right", cell: (a) => money(a.hire) },
      ...(sp ? [{ header: "Summary", width: 20, align: "right" as const, cell: (a: Top) => signed(a.summary) }] : []),
    ];
    const yL = table(rep.top_customers, topCols("Customer"), null, yTop + 2.5, name, undefined, { x: M, width: half });
    const yR = table(rep.top_routes, topCols("Route"), null, yTop + 2.5, name, undefined, { x: M + half + 6, width: half });
    y = Math.max(yL, yR) + 6;
  }

  y = ensure(y, 24, name);
  y = section(y, "Worth knowing", AMBER);
  const notes = [
    ...(rep.period_open ? ["The period isn't over yet: more trips may still be added."] : []),
    `Hire and expenses come from each trip's trip sheet${sp ? "; Trip Summary = hire - trip expenses" : ""}. Dates follow the trip's scheduled date.`,
    "Cancelled trips are listed on their category's pages but never added into the money.",
    ...(t.without_sheet ? [`${t.without_sheet} trip(s) have no trip sheet yet, so no hire or expenses are counted for them.`] : []),
    ...(t.no_km ? [`${t.no_km} trip sheet(s) have 0 km - marked "0 km" in amber.`] : []),
    ...(t.under_review ? [`${t.under_review} trip(s) are under audit review - their figures may change.`] : []),
    ...(inv ? ["Still to invoice leaves out Shifting trips (no invoice needed) and waived ones."] : []),
  ];
  notes.forEach((n, i) => { y = para(`${i + 1}. ${n}`, M + 2, y, W - M * 2 - 4, 7.5); });

  // ── 2. One section per category ─────────────────────────────────────────────
  for (const c of rep.by_category) {
    const ct = c.totals;
    if (!ct.trips) continue;
    const title = `${c.label} trips`;
    const sub = `${rep.period.label}${rep.filters.length ? ` | ${rep.filters.join(" | ")}` : ""} | by stage: ${Object.entries(ct.stages).map(([s, n]) => `${s} ${n}`).join(", ")}`;
    y = newPage(title, sub) + 1;
    const third = (W - M * 2 - 8) / 3;
    const y1 = pairs(M, y, third, "TRIPS", [
      ["Trips", String(ct.trips)],
      ["Cancelled (not counted)", String(ct.cancelled)],
      ["No trip sheet yet", String(ct.without_sheet), ct.without_sheet ? { text: String(ct.without_sheet), color: AMBER } : undefined],
      ["Km on trip sheets", num(ct.km)],
    ]);
    const y2 = pairs(M + third + 4, y, third, "MONEY", [
      ["Hire", R(ct.hire)],
      ["Trip expenses", R(ct.expense)],
      ...(sp ? [["Trip Summary", "", { ...signed(ct.summary), text: R(ct.summary) }] as [string, string, ReturnType<typeof signed>]] : []),
      ["Average hire per trip", R(ct.avg_hire)],
    ]);
    const y3 = pairs(M + (third + 4) * 2, y, third, inv ? "INVOICES" : "CHECKS", inv ? [
      ["Invoiced", String(ct.invoiced)],
      ["Still to invoice", c.code === "SHIFTING" ? "Not needed" : String(ct.to_invoice), ct.to_invoice && c.code !== "SHIFTING" ? { text: String(ct.to_invoice), color: AMBER } : undefined],
      ["  their hire", c.code === "SHIFTING" ? "-" : R(ct.to_invoice_hire)],
      ["Trip sheets with 0 km", String(ct.no_km), ct.no_km ? { text: String(ct.no_km), color: AMBER } : undefined],
    ] : [
      ["Trip sheets with 0 km", String(ct.no_km), ct.no_km ? { text: String(ct.no_km), color: AMBER } : undefined],
      ["Under audit review", String(ct.under_review)],
    ]);
    y = Math.max(y1, y2, y3) + 3;

    const live = c.rows.filter((r) => !r.cancelled);
    const gone = c.rows.filter((r) => r.cancelled);
    y = ensure(y, 16, title, sub);
    y = section(y, "Trips");
    if (live.length) {
      const cols: Column<TripRow>[] = [
        { header: "Trip", width: 17, cell: (r) => ({ text: r.trip_id, bold: true }) },
        { header: "Date", width: 14, align: "center", cell: (r) => dmy(r.date) },
        { header: "Stage", width: 17, cell: (r) => (r.under_review ? { text: `${r.stage} | review`, color: AMBER, bold: true } : r.stage) },
        { header: "Customer", width: 34, cell: (r) => r.customer },
        { header: "Route", width: 38, cell: (r) => r.route },
        { header: "Truck", width: 18, cell: (r) => r.truck || "-" },
        { header: "Driver", width: 22, cell: (r) => r.driver || "-" },
        { header: "Km", width: 11, align: "right", cell: (r) => (r.has_sheet && !r.km ? { text: "0 km", color: AMBER, bold: true } : r.km == null ? "-" : num(r.km)) },
        { header: "Hire", width: 17, align: "right", cell: (r) => (r.has_sheet ? money(r.hire) : { text: "No sheet", color: GREY }) },
        { header: "Expenses", width: 16, align: "right", cell: (r) => (r.has_sheet ? money(r.expense) : "-") },
        ...(sp ? [{ header: "Summary", width: 17, align: "right" as const, cell: (r: TripRow) => signed(r.summary) }] : []),
        ...(inv ? [{ header: "Invoice", width: 22, cell: (r: TripRow) => (r.category === "SHIFTING" ? { text: "Not needed", color: GREY } : r.invoiced ? { text: "Invoiced", color: GREEN } : r.waived ? { text: "Waived", color: GREY } : { text: "Not invoiced", color: AMBER }) }] : []),
      ];
      y = table(live, cols, [
        { text: "TOTAL" }, { text: `${live.length} trips` }, { text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "" },
        { text: num(ct.km), align: "right" }, { text: money(ct.hire), align: "right" }, { text: money(ct.expense), align: "right" }, ...(sp ? [signed(ct.summary)] : []),
        ...(inv ? [{ text: "" }] : []),
      ], y, title, sub) + 5;
    } else {
      y = para("No trips counted in this category.", M, y + 1, W - M * 2, 8, GREY) + 3;
    }

    if (gone.length) {
      y = ensure(y, 18, title, sub);
      y = section(y, "Cancelled - not counted", GREY);
      y = table(gone, [
        { header: "Trip", width: 20, cell: (r) => r.trip_id },
        { header: "Date", width: 16, align: "center", cell: (r) => dmy(r.date) },
        { header: "Customer", width: 50, cell: (r) => r.customer },
        { header: "Route", width: 60, cell: (r) => r.route },
        { header: "Truck", width: 22, cell: (r) => r.truck || "-" },
        { header: "Driver", width: 30, cell: (r) => r.driver || "-" },
      ], null, y, title, sub) + 5;
    }
  }

  // ── 3. By Customer ──────────────────────────────────────────────────────────
  if (rep.customers.length) {
    const cats = rep.by_category.filter((c) => c.totals.counted);
    const cSub = "Every customer in the report. Cancelled trips left out.";
    y = newPage("By Customer", cSub) + 1;
    table(rep.customers, [
      { header: "Customer", width: 56, cell: (c) => c.name },
      { header: "Trips", width: 11, align: "center", cell: (c) => String(c.trips) },
      ...cats.map((cat) => ({ header: cat.label, width: 13, align: "center" as const, cell: (c: TripReport["customers"][number]) => (c.by_cat[cat.code] ? String(c.by_cat[cat.code]) : "-") })),
      { header: "Hire (Rs.)", width: 20, align: "right", cell: (c) => money(c.hire) },
      { header: "Expenses", width: 18, align: "right", cell: (c) => money(c.expense) },
      ...(sp ? [{ header: "Summary", width: 18, align: "right" as const, cell: (c: TripReport["customers"][number]) => signed(c.summary) }] : []),
      ...(inv ? [{ header: "To invoice", width: 18, align: "right" as const, cell: (c: TripReport["customers"][number]) => (c.to_invoice_hire ? { text: money(c.to_invoice_hire), color: AMBER } : "-") }] : []),
    ], [
      { text: "TOTAL" }, { text: String(t.counted), align: "center" }, ...cats.map(() => ({ text: "" })),
      { text: money(t.hire), align: "right" }, { text: money(t.expense), align: "right" }, ...(sp ? [signed(t.summary)] : []),
      ...(inv ? [{ text: money(t.to_invoice_hire), align: "right" as const }] : []),
    ], y, "By Customer", cSub);
  }

  k.finish(`${filename.replace(/\.xlsx$/i, "")}.pdf`, deliver);
}
