/**
 * Shared drawing kit for the app's designed PDF reports (jsPDF), in the style
 * of the Profitability report (lib/pl-report-pdf.ts): a company header line,
 * page titles, tables that flow across pages with their header repeated, key
 * figure tiles, label/value lists and "Page x of y" footers.
 *
 * jsPDF's built-in fonts have no ₹, → or − — clean() swaps them for text they
 * can draw, so nothing prints as garbage.
 */
import type { jsPDF } from "jspdf";

export type RGB = [number, number, number];
export type Cell = { text: string; align?: "left" | "right" | "center"; color?: RGB; bold?: boolean; fill?: RGB };
export type Column<R> = { header: string; width: number; align?: "left" | "right" | "center"; cell: (r: R) => Cell | string };

export const NAVY: RGB = [27, 43, 94];
export const GREEN: RGB = [0, 120, 60];
export const RED: RGB = [192, 0, 0];
export const AMBER: RGB = [197, 90, 17];
export const GREY: RGB = [110, 110, 110];
export const INK: RGB = [30, 30, 30];
export const COMPANY = "Canaan Global International";

export function clean(s: string): string {
  return s.replace(/\(₹\)/g, "(Rs.)").replace(/₹\)/g, "Rs.)").replace(/₹\s?/g, "Rs. ").replace(/→/g, "->").replace(/←/g, "<-").replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, "|").replace(/…/g, "...");
}
export const money = (v: number | null | undefined) =>
  v == null ? "-" : `${v < 0 ? "-" : ""}${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 }));
export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "-");

export type Kit = Awaited<ReturnType<typeof createReportPdf>>;

/** `reportName` and `period` go in every page's header and footer. */
export async function createReportPdf({ reportName, period, orientation = "landscape" }: {
  reportName: string; period: string; orientation?: "landscape" | "portrait";
}) {
  const { default: JsPDF } = await import("jspdf");
  const pdf: jsPDF = new JsPDF({ orientation, unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 10;
  const BOTTOM = H - 14;

  const text = (s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; maxWidth?: number } = {}) => {
    pdf.setFont("helvetica", o.bold ? "bold" : "normal");
    pdf.setFontSize(o.size ?? 8);
    pdf.setTextColor(...(o.color ?? INK));
    pdf.text(clean(s), x, y, { align: o.align ?? "left", maxWidth: o.maxWidth });
  };
  /** Wrapped paragraph; returns the y after it. */
  const para = (s: string, x: number, y: number, width: number, size = 8, color: RGB = INK) => {
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
    while (cut.length > 1 && pdf.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1);
    return `${cut}...`;
  };
  /** Header line + big title (+ grey sub-line); returns the y to start under it. */
  const pageTitle = (title: string, sub?: string) => {
    text(COMPANY.toUpperCase(), M, 9, { size: 7, bold: true, color: GREY });
    text(`${reportName} | ${period}`, W - M, 9, { size: 7, color: GREY, align: "right" });
    text(title, M, 17, { size: 14, bold: true, color: NAVY });
    if (!sub) return 22;
    return para(sub, M, 22, W - M * 2, 8, GREY) + 1;
  };
  const newPage = (title: string, sub?: string) => {
    pdf.addPage();
    return pageTitle(title, sub);
  };
  /** Room for `need` mm below y? Otherwise a new page carrying the title on. */
  const ensure = (y: number, need: number, title: string, sub?: string) =>
    y + need > BOTTOM ? newPage(`${title} (continued)`, sub) + 1 : y;

  const section = (y: number, label: string, color: RGB = NAVY) => {
    text(label.toUpperCase(), M, y, { size: 9, bold: true, color });
    return y + 4.5;
  };

  /** A row of key-figure tiles. */
  const tiles = (y: number, items: { label: string; value: string; color?: RGB; note?: string }[]) => {
    const gap = 4;
    const w = (W - M * 2 - gap * (items.length - 1)) / items.length;
    items.forEach((t, i) => {
      const x = M + i * (w + gap);
      pdf.setFillColor(242, 245, 250);
      pdf.setDrawColor(220, 226, 236);
      pdf.roundedRect(x, y, w, t.note ? 19 : 16, 2, 2, "FD");
      text(t.label, x + 3, y + 5, { size: 7, color: GREY });
      text(t.value, x + 3, y + 12, { size: 13, bold: true, color: t.color ?? NAVY });
      if (t.note) text(fit(t.note, w - 6), x + 3, y + 16.5, { size: 6.5, color: GREY });
    });
    return y + (items.some((t) => t.note) ? 19 : 16) + 5;
  };

  /** Label / value lines in a box `w` wide at x. */
  const pairs = (x: number, y: number, w: number, title: string, rows: [string, string, Cell?][]) => {
    pdf.setFillColor(...NAVY);
    pdf.rect(x, y, w, 6, "F");
    text(title, x + 2.5, y + 4.2, { size: 8, bold: true, color: [255, 255, 255] });
    let by = y + 10;
    for (const [label, value, cell] of rows) {
      text(fit(label, w * 0.55), x + 2.5, by, { size: 7.5 });
      const c = cell ?? { text: value };
      text(fit(c.text, w * 0.42), x + w - 2.5, by, { size: 7.5, bold: c.bold ?? true, color: c.color, align: "right" });
      pdf.setDrawColor(230, 230, 230);
      pdf.line(x + 2.5, by + 1.5, x + w - 2.5, by + 1.5);
      by += 5.2;
    }
    return by;
  };

  /** A table that flows across pages, header repeated, optional bold totals row.
   *  `at` places it in part of the page (two tables side by side). */
  function table<R>(rows: R[], cols: Column<R>[], total: Cell[] | null, startY: number, title: string, sub?: string,
    at: { x: number; width: number } = { x: M, width: W - M * 2 }) {
    const X0 = at.x;
    const TW = at.width;
    const scale = TW / cols.reduce((s, c) => s + c.width, 0);
    const widths = cols.map((c) => c.width * scale);
    const rowH = 5.6;
    let y = startY;
    const head = () => {
      pdf.setFillColor(...NAVY);
      pdf.rect(X0, y, TW, rowH + 0.6, "F");
      let x = X0;
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
    const draw = (cells: Cell[], fill?: RGB, boldAll = false) => {
      if (fill) {
        pdf.setFillColor(...fill);
        pdf.rect(X0, y, TW, rowH, "F");
      }
      let x = X0;
      cells.forEach((c, i) => {
        if (c.fill) {
          pdf.setFillColor(...c.fill);
          pdf.rect(x, y, widths[i], rowH, "F");
        }
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
    if (y + rowH * 2 > BOTTOM) y = newPage(`${title} (continued)`, sub) + 1;
    head();
    rows.forEach((r, i) => {
      if (y + rowH > BOTTOM) {
        y = newPage(`${title} (continued)`, sub) + 1;
        head();
      }
      draw(cols.map((c) => { const v = c.cell(r); return typeof v === "string" ? { text: v } : v; }), i % 2 ? [245, 247, 250] : undefined);
    });
    if (total) {
      if (y + rowH > BOTTOM) { y = newPage(`${title} (continued)`, sub) + 1; head(); }
      pdf.setDrawColor(...NAVY);
      pdf.line(X0, y, X0 + TW, y);
      draw(total, [228, 233, 245], true);
    }
    return y;
  }

  /** Page numbers + footer on every page, then save (or hand to `deliver`). */
  const finish = (name: string, deliver?: (pdf: jsPDF, name: string) => void) => {
    const n = pdf.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      text(`Page ${i} of ${n}`, W - M, H - 6, { size: 7, color: GREY, align: "right" });
      text(`${COMPANY} | ${reportName} | ${period}`, M, H - 6, { size: 7, color: GREY });
    }
    if (deliver) deliver(pdf, name);
    else pdf.save(name);
  };

  return { pdf, W, H, M, BOTTOM, text, para, fit, pageTitle, newPage, ensure, section, tiles, pairs, table, finish };
}
