/**
 * Leave / Edit / Deletion / Maintenance Approvals → View → Download PDF.
 * One renderer for all four, drawn from the same figures as the Excel
 * (backend approvals_report.py, GET /exports/approvals-report/preview):
 *
 *   1. Summary    key figures, by group (applicant group / record type /
 *                 status), the top lists, worth knowing
 *   2. One section per group (new page each): every request, and for leave
 *      the days per person
 *
 * The PDF shows the columns that matter most for each kind (PDF_COLUMNS) so
 * the tables stay readable on A4; the Excel has every column.
 */
import { AMBER, GREEN, GREY, NAVY, RED, createReportPdf, dmy, money, type Cell, type Column, type RGB } from "@/lib/report-pdf-kit";

type Row = Record<string, string | number | null>;
type ColumnDef = { key: string; label: string; type: "text" | "date" | "num" | "money" | "status"; width: number };
type Group = {
  key: string; label: string; sheet: string; rows: Row[]; count: number; statuses: Record<string, number>; cost: number | null;
  extra: { head: string[]; rows: (string | number)[][] } | null;
};
export type ApprovalsReport = {
  kind: "leave" | "edit" | "deletion" | "maintenance" | "pending" | "flagged" | "verified";
  title: string;
  period: { start: string | null; end: string | null; label: string };
  generated_at: string;
  filters: string[];
  group_label: string;
  /** The money column totalled per group (e.g. "Hire (₹)"), if any. */
  money_label: string | null;
  /** What a row is called: "Requests" or "Trips". */
  noun: string;
  columns: ColumnDef[];
  kpis: { label: string; value: string | number; tone: string; money: number | null }[];
  statuses: Record<string, number>;
  total: number;
  tops: { title: string; head: string[]; rows: (string | number)[][]; money?: number[] }[];
  notes: string[];
  groups: Group[];
};

const PDF_COLUMNS: Record<ApprovalsReport["kind"], string[]> = {
  leave: ["applicant", "code", "from", "to", "days", "reason", "status", "decided_by", "decided"],
  edit: ["requested", "who", "record", "action", "reason", "status", "decided_by", "used"],
  deletion: ["requested", "who", "record", "reason", "status", "decided_by", "decided", "note"],
  maintenance: ["requested", "truck", "type", "repairs", "cost", "vendor", "who", "reverify", "status", "waiting", "reason"],
  pending: ["trip", "date", "truck", "route", "category", "km", "hire", "expense", "summary", "waited", "status"],
  flagged: ["trip", "date", "driver", "truck", "hire", "reason", "flagged_by", "returned_on", "days_open", "status"],
  verified: ["trip", "date", "truck", "route", "hire", "summary", "verified_by", "verified_on", "to_verify", "status"],
};

const STATUS_COLOR: Record<string, RGB> = {
  Pending: AMBER, Approved: GREEN, "Approved — active": GREEN, Rejected: RED, Withdrawn: GREY, "Approved — time up": GREY,
  "Up to 7 days": GREEN, "8–30 days": AMBER, "Over 30 days": RED,
  "Under review": AMBER, "Returned — awaiting Auditor": NAVY, "Disputed first": AMBER, Clean: GREEN,
};

function cellFor(col: ColumnDef, v: string | number | null | undefined): Cell {
  if (v == null || v === "") return { text: "-", color: GREY };
  if (col.type === "date") return { text: dmy(String(v)) };
  if (col.type === "money") return { text: money(Number(v)), align: "right" };
  if (col.type === "num") return Number(v) ? { text: String(v), align: "center" } : { text: "-", color: GREY, align: "center" };
  if (col.type === "status") return { text: String(v), color: STATUS_COLOR[String(v)], bold: true };
  return { text: String(v) };
}

export async function downloadApprovalsReportPdf({ report, filename, deliver }: {
  report: ApprovalsReport;
  filename: string;
  deliver?: (pdf: import("jspdf").jsPDF, name: string) => void;
}): Promise<void> {
  const rep = report;
  const name = `${rep.title} Report`;
  const k = await createReportPdf({ reportName: name, period: rep.period.label });
  const { M, W, text, para, table, tiles, section, ensure, newPage, pageTitle } = k;
  const half = (W - M * 2 - 6) / 2;
  const moneyHead = rep.money_label ? rep.money_label.replace(" (₹)", " (Rs.)") : null;

  // ── 1. Summary ──────────────────────────────────────────────────────────────
  let y = pageTitle(name, `${rep.period.label} | Downloaded ${rep.generated_at}${rep.filters.length ? ` | ${rep.filters.join(" | ")}` : ""}`);
  y = tiles(y + 1, rep.kpis.slice(0, 4).map((kp) => ({
    label: kp.label,
    value: String(kp.value),
    color: kp.tone === "amber" && Number(kp.value) ? AMBER : NAVY,
    note: kp.money != null ? `Rs. ${money(kp.money)}` : "",
  })));

  const statuses = Object.keys(rep.statuses);
  y = section(y, `By ${rep.group_label.toLowerCase()}`) - 2;
  if (rep.groups.length) {
    y = table(rep.groups, [
      { header: rep.group_label, width: 40, cell: (g) => ({ text: g.label, bold: true }) },
      { header: rep.noun, width: 14, align: "center", cell: (g) => String(g.count) },
      ...statuses.map((st) => ({
        header: st, width: 16, align: "center" as const,
        cell: (g: Group): Cell => (g.statuses[st] ? { text: String(g.statuses[st]), color: STATUS_COLOR[st], bold: st === "Pending" } : { text: "-", color: GREY }),
      })),
      ...(moneyHead ? [{ header: moneyHead, width: 20, align: "right" as const, cell: (g: Group) => money(g.cost) }] : []),
    ], [
      { text: "TOTAL" }, { text: String(rep.total), align: "center" },
      ...statuses.map((st) => ({ text: String(rep.statuses[st]), align: "center" as const })),
      ...(moneyHead ? [{ text: money(rep.groups.reduce((s, g) => s + (g.cost ?? 0), 0)), align: "right" as const }] : []),
    ], y, name) + 6;
  } else {
    y = para(`No ${rep.noun.toLowerCase()} in this report.`, M, y + 2, W - M * 2, 9, GREY) + 4;
  }

  const tops = rep.tops.filter((t) => t.rows.length).slice(0, 2);
  if (tops.length) {
    y = ensure(y, 36, name);
    const yTop = y;
    const ys = tops.map((top, i) => {
      const x = M + i * (half + 6);
      text(top.title.toUpperCase(), x, yTop, { size: 9, bold: true, color: NAVY });
      const cols: Column<(string | number)[]>[] = top.head
        .map((h, j) => ({ h, j }))
        .filter(({ h }) => h)
        .map(({ h, j }) => ({
          header: h, width: j === 0 ? 40 : 14, align: j === 0 ? "left" as const : "right" as const,
          cell: (r: (string | number)[]) => (top.money?.includes(j) ? money(Number(r[j])) : String(r[j] ?? "")),
        }));
      return table(top.rows, cols, null, yTop + 2.5, name, undefined, { x, width: half });
    });
    y = Math.max(...ys) + 6;
  }

  y = ensure(y, 20, name);
  y = section(y, "Worth knowing", AMBER);
  rep.notes.forEach((n, i) => { y = para(`${i + 1}. ${n}`, M + 2, y, W - M * 2 - 4, 7.5); });

  // ── 2. One section per group ────────────────────────────────────────────────
  const wanted = PDF_COLUMNS[rep.kind];
  const cols = wanted.map((key) => rep.columns.find((c) => c.key === key)).filter(Boolean) as ColumnDef[];
  for (const g of rep.groups) {
    const title = `${g.label} - ${rep.title.toLowerCase()}`;
    const sub = `${rep.period.label} | ${g.count} ${rep.noun.toLowerCase()}: ${Object.entries(g.statuses).map(([s, n]) => `${s} ${n}`).join(", ")}${g.cost != null && moneyHead ? ` | ${moneyHead.replace(" (Rs.)", "").toLowerCase()} Rs. ${money(g.cost)}` : ""}`;
    y = newPage(title, sub) + 1;
    y = table(g.rows, cols.map((c) => ({
      header: c.label.replace(" (₹)", " (Rs.)"), width: c.width, align: c.type === "money" ? "right" as const : c.type === "num" ? "center" as const : "left" as const,
      cell: (r: Row) => cellFor(c, r[c.key]),
    })), cols.some((c) => c.type === "money")
      ? cols.map((c, i) => (i === 0 ? { text: "TOTAL" } : c.type === "money"
        ? { text: money(g.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)), align: "right" as const } : { text: "" }))
      : null, y, title, sub) + 6;

    if (g.extra && g.extra.rows.length) {
      y = ensure(y, 20, title, sub);
      y = section(y, "Per person");
      y = table(g.extra.rows, g.extra.head.map((h, j) => ({
        header: h, width: j === 0 ? 50 : 18, align: j === 0 ? "left" as const : "center" as const,
        cell: (r: (string | number)[]) => String(r[j] ?? ""),
      })), null, y, title, sub, { x: M, width: half }) + 4;
    }
  }

  k.finish(`${filename.replace(/\.xlsx$/i, "")}.pdf`, deliver);
}
