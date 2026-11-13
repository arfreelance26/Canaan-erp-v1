/**
 * Resource Hub (Our Fleet, Our Drivers, …) → View → Download PDF: one file
 * per truck / driver. Drawn from the same figures as the Excel (backend
 * resource_report.py, GET /exports/resource-report/preview):
 *
 *   1. Summary   key figures, the lists that need attention, everyone at a
 *                glance, worth knowing
 *   2. One page per item: its fact boxes side by side, then its tables
 */
import { AMBER, GREEN, GREY, NAVY, RED, createReportPdf, dmy, money, num, type Cell, type Column, type RGB } from "@/lib/report-pdf-kit";

type Tone = "bad" | "warn" | "good";
type Value = string | number | null | { v: string | number | null; tone?: Tone; link?: string };
type Kind = "text" | "date" | "money" | "km" | "num" | "link";
/** pdf: false = an Excel-only column (email, address, …) left out so the PDF stays readable. */
type Table = { title: string; columns: { label: string; kind: Kind; pdf?: boolean }[]; rows: Value[][]; total: Value[] | null };
type Box = { title: string; pairs: { label: string; value: string | number | null; kind: Kind; tone: Tone | null }[] };
export type ResourceReport = {
  kind: string;
  title: string;
  period: { label: string };
  generated_at: string;
  search: string;
  kpis: { label: string; value: string; tone?: Tone | null; note?: string }[];
  tables: Table[];
  notes: string[];
  items: { sheet: string; title: string; subtitle: string; boxes: Box[]; tables: Table[] }[];
};

const TONE: Record<Tone, RGB> = { bad: RED, warn: AMBER, good: GREEN };

function show(kind: Kind, raw: Value): Cell {
  const tone = raw && typeof raw === "object" ? raw.tone : undefined;
  const v = raw && typeof raw === "object" ? raw.v : raw;
  const color = tone ? TONE[tone] : undefined;
  if (v == null || v === "") return { text: "-", color: GREY };
  const text = kind === "money" ? money(Number(v)) : kind === "km" ? num(Number(v)) : kind === "date" ? dmy(String(v))
    : kind === "num" && typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
  return { text, color, bold: !!tone && tone !== "good", align: kind === "money" || kind === "km" ? "right" : kind === "num" ? "center" : undefined };
}

export async function downloadResourceReportPdf({ report, filename, deliver }: {
  report: ResourceReport;
  filename: string;
  deliver?: (pdf: import("jspdf").jsPDF, name: string) => void;
}): Promise<void> {
  const rep = report;
  const name = `${rep.title} Report`;
  const k = await createReportPdf({ reportName: name, period: rep.period.label });
  const { M, W, para, table, tiles, pairs, section, ensure, newPage, pageTitle } = k;

  const drawTable = (t0: Table, y: number, title: string, sub?: string) => {
    const keep = t0.columns.map((c, i) => (c.pdf === false ? -1 : i)).filter((i) => i >= 0);
    const t: Table = {
      ...t0, columns: keep.map((i) => t0.columns[i]), rows: t0.rows.map((r) => keep.map((i) => r[i])),
      total: t0.total ? keep.map((i) => t0.total![i]) : null,
    };
    // Wide enough for the heading and the longest value (text capped, so one
    // long reason or address can't squeeze everything else); dates always fit.
    const longest = (i: number) => t.rows.slice(0, 300).reduce((n, r) => {
      const v = r[i] && typeof r[i] === "object" ? (r[i] as { v: unknown }).v : r[i];
      return Math.max(n, v == null ? 1 : String(v).length);
    }, 1);
    const widths = t.columns.map((c, i) => {
      const head = c.label.length * 1.45 + 4;
      if (c.kind === "date") return Math.max(19, head);
      if (c.kind === "link" || c.kind === "text") return Math.max(14, head, Math.min(longest(i) * 1.55 + 5, 46));
      return Math.max(15, head, Math.min(longest(i) * 1.7 + 6, 26));
    });
    const cols: Column<Value[]>[] = t.columns.map((c, i) => ({
      header: c.label.replace(" (₹)", " (Rs.)").replace(", ₹)", ", Rs.)"), width: widths[i],
      align: c.kind === "money" || c.kind === "km" ? "right" : c.kind === "num" ? "center" : "left",
      cell: (r: Value[]) => show(c.kind, r[i]),
    }));
    const total = t.total ? t.total.map((v, i) => ({ ...show(t.columns[i].kind, v), bold: true })) : null;
    return table(t.rows, cols, total, y, title, sub);
  };

  // ── 1. Summary ──────────────────────────────────────────────────────────────
  let y = pageTitle(name, `${rep.period.label} | Downloaded ${rep.generated_at}${rep.search ? ` | Search: "${rep.search}"` : ""}`);
  y = tiles(y + 1, rep.kpis.slice(0, 4).map((kp) => ({
    label: kp.label, value: kp.value.replace("₹", "Rs. "), color: kp.tone ? TONE[kp.tone] : NAVY, note: kp.note || "",
  })));
  for (const t of rep.tables) {
    y = ensure(y, 22, name);
    y = section(y, t.title) - 2;
    if (t.rows.length) y = drawTable(t, y, name) + 6;
    else y = para("Nothing to show.", M, y + 3, W - M * 2, 8, GREY) + 3;
  }
  y = ensure(y, 18, name);
  y = section(y, "Worth knowing", AMBER);
  rep.notes.forEach((n, i) => { y = para(`${i + 1}. ${n}`, M + 2, y, W - M * 2 - 4, 7.5); });

  // ── 2. One page per item ────────────────────────────────────────────────────
  for (const it of rep.items) {
    y = newPage(it.title, it.subtitle) + 1;
    const n = it.boxes.length;
    if (n) {   // some pages (lists like Destinations) have no fact boxes
      const gap = 4;
      const bw = (W - M * 2 - gap * (n - 1)) / n;
      const ends = it.boxes.map((b, i) => pairs(M + i * (bw + gap), y, bw, b.title, b.pairs.map((p) => {
        const c = show(p.kind, p.tone ? { v: p.value, tone: p.tone } : p.value);
        return [p.label, c.text, c] as [string, string, Cell];
      })));
      y = Math.max(...ends) + 4;
    }
    for (const t of it.tables) {
      y = ensure(y, 20, it.title, it.subtitle);
      y = section(y, t.title) - 2;
      y = drawTable(t, y, it.title, it.subtitle) + 5;
    }
  }

  k.finish(`${filename.replace(/\.xlsx$/i, "")}.pdf`, deliver);
}
