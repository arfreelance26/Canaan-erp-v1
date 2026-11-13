/**
 * Driver Attendance / Staff Attendance / Attendance Report → View → Download
 * PDF: the person-wise attendance report. Drawn from the same figures as the
 * Excel (backend attendance_report.py, GET /exports/attendance-report/preview):
 *
 *   1. Summary    key figures, every status in total, everyone's counts,
 *                 most away / most unmarked, worth knowing
 *   2. Register   people down, dates across, one coloured code a day
 *   3. One page per person: their counts, then every day (two columns)
 */
import { AMBER, GREY, INK, NAVY, createReportPdf, dmy, type Cell, type Column, type RGB } from "@/lib/report-pdf-kit";

type DayRow = { date: string; day: string; status: string; off: boolean; holiday: string; check_in: string; check_out: string; hours: number | null; note: string };
type Person = {
  key: string; code: string; name: string; role: string; sheet: string; left: boolean;
  counts: Record<string, number>; on_duty: number; days: number; rate: number | null;
  hours: number | null; avg_hours: number | null; auto_closed: number; rows: DayRow[];
};
export type AttendanceReport = {
  category: "driver" | "staff";
  label: string;
  period: { start: string; end: string; label: string };
  generated_at: string;
  search: string;
  days: { date: string; day: string; off: boolean; holiday: string }[];
  calendar_days: number; counted_days: number; due_days: number; off_days: number;
  holidays: { date: string; name: string }[];
  statuses: { status: string; code: string; fill: string; on_duty: boolean }[];
  totals: { people: number; counts: Record<string, number>; on_duty: number; days: number; rate: number | null; auto_closed: number };
  most_away: Person[];
  most_unmarked: Person[];
  people: Person[];
  period_open: boolean;
};

const hex = (h: string): RGB => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const OFF: RGB = [242, 242, 242];

export async function downloadAttendanceReportPdf({ report, filename, deliver }: {
  report: AttendanceReport;
  filename: string;
  deliver?: (pdf: import("jspdf").jsPDF, name: string) => void;
}): Promise<void> {
  const rep = report;
  const t = rep.totals;
  const name = `${rep.label} Attendance Report`;
  const k = await createReportPdf({ reportName: name, period: rep.period.label });
  const { pdf, M, W, BOTTOM, text, para, table, tiles, pairs, section, ensure, newPage, pageTitle, fit } = k;
  const driver = rep.category === "driver";
  const dutyWord = driver ? "On duty" : "Present";
  const statusFill = Object.fromEntries(rep.statuses.map((s) => [s.status, hex(s.fill)])) as Record<string, RGB>;
  const fillFor = (status: string, off: boolean): RGB | undefined =>
    statusFill[status] ?? (status === "On Leave" ? statusFill["Leave"] : undefined) ?? (off ? OFF : undefined);
  const codeFor = (status: string) =>
    rep.statuses.find((s) => s.status === status)?.code ?? (status === "On Leave" ? "L" : status === "Sunday" ? "S" : status === "Holiday" ? "Ho" : "");

  // ── 1. Summary ──────────────────────────────────────────────────────────────
  let y = pageTitle(name, `${rep.period.label} | Downloaded ${rep.generated_at}${rep.search ? ` | Search: "${rep.search}"` : ""}`);
  const nm = t.counts["Not Marked"] ?? 0;
  y = tiles(y + 1, [
    { label: driver ? "Drivers" : "Staff", value: String(t.people), note: `${rep.calendar_days} days in the period` },
    { label: driver ? "Days counted" : "Working days", value: String(rep.counted_days), note: driver ? "every calendar day" : `${rep.off_days} Sundays/holidays off` },
    { label: `% ${dutyWord.toLowerCase()}`, value: t.rate == null ? "-" : `${t.rate}%`, note: `${t.on_duty} of ${t.days} days` },
    { label: "Days not marked", value: String(nm), color: nm ? AMBER : NAVY, note: nm ? "no attendance entered" : "everything marked" },
  ]);

  const statCols: Column<Person>[] = [
    { header: "Name", width: 46, cell: (p) => ({ text: p.name + (p.left ? " (left)" : ""), color: p.left ? GREY : undefined }) },
    { header: "Code", width: 18, cell: (p) => p.code },
    ...rep.statuses.map((s) => ({
      header: s.status, width: 14, align: "center" as const,
      cell: (p: Person): Cell => {
        const n = p.counts[s.status] ?? 0;
        return n ? { text: String(n), color: s.status === "Not Marked" ? AMBER : undefined, bold: s.status === "Not Marked" } : { text: "-", color: GREY };
      },
    })),
    { header: `% ${dutyWord.toLowerCase()}`, width: 14, align: "right", cell: (p) => ({ text: p.rate == null ? "-" : `${p.rate}%`, bold: true }) },
  ];
  y = section(y, "Everyone") - 2;
  y = table(rep.people, statCols, [
    { text: "TOTAL" }, { text: "" },
    ...rep.statuses.map((s) => ({ text: String(t.counts[s.status] ?? 0), align: "center" as const })),
    { text: t.rate == null ? "-" : `${t.rate}%`, align: "right" },
  ], y, name) + 6;

  y = ensure(y, 26, name);
  y = section(y, "Worth knowing", AMBER);
  const notes = [
    driver
      ? "Drivers are counted every calendar day. On duty = On Trip, On Halt or On Workshop."
      : "Staff are counted on working days only: Sundays and holidays are left out. A day worked on a Sunday or holiday still counts as present.",
    "Not Marked = the days counted (up to today) minus the days with attendance entered - the same as the Attendance Report page.",
    ...(rep.period_open ? ["The period isn't over yet: days after today aren't counted."] : []),
    ...(!driver && rep.holidays.length ? [`Holidays: ${rep.holidays.map((h) => `${dmy(h.date).slice(0, 5)} ${h.name}`).join(", ")}.`] : []),
    ...(rep.most_unmarked.length ? [`Most days not marked: ${rep.most_unmarked.map((p) => `${p.name} (${p.counts["Not Marked"]})`).join(", ")}.`] : []),
  ];
  notes.forEach((n, i) => { y = para(`${i + 1}. ${n}`, M + 2, y, W - M * 2 - 4, 7.5); });

  // ── 2. Register ─────────────────────────────────────────────────────────────
  const legend = rep.statuses.map((s) => `${s.code} = ${s.status}`).join("  |  ") + (driver ? "" : "  |  S = Sunday  |  Ho = Holiday");
  const regTitle = "Attendance Register";
  y = newPage(regTitle, legend) + 1;
  const nameW = 42;
  const tailW = 13;
  const dayW = (W - M * 2 - nameW - tailW * 2) / rep.days.length;
  const rowH = 5.2;
  const regHead = () => {
    pdf.setFillColor(...NAVY);
    pdf.rect(M, y, W - M * 2, rowH * 1.6, "F");
    text("Name", M + 1.5, y + 5, { size: 6.8, bold: true, color: [255, 255, 255] });
    rep.days.forEach((d, i) => {
      const x = M + nameW + i * dayW;
      if (d.off) { pdf.setFillColor(127, 127, 127); pdf.rect(x, y, dayW, rowH * 1.6, "F"); }
      text(String(Number(d.date.slice(8, 10))), x + dayW / 2, y + 3.4, { size: 6, bold: true, color: [255, 255, 255], align: "center" });
      text(d.day.slice(0, 2), x + dayW / 2, y + 6.8, { size: 5, color: [255, 255, 255], align: "center" });
    });
    text(dutyWord, M + nameW + rep.days.length * dayW + tailW / 2, y + 5, { size: 5.8, bold: true, color: [255, 255, 255], align: "center" });
    text("Not mkd", M + nameW + rep.days.length * dayW + tailW * 1.5, y + 5, { size: 5.8, bold: true, color: [255, 255, 255], align: "center" });
    y += rowH * 1.6;
  };
  regHead();
  rep.people.forEach((p, idx) => {
    if (y + rowH > BOTTOM) { y = newPage(`${regTitle} (continued)`, legend) + 1; regHead(); }
    if (idx % 2) { pdf.setFillColor(248, 249, 252); pdf.rect(M, y, W - M * 2, rowH, "F"); }
    text(fit(p.name, nameW - 3), M + 1.5, y + 3.7, { size: 6.6 });
    p.rows.forEach((r, i) => {
      const x = M + nameW + i * dayW;
      const f = fillFor(r.status, r.off);
      if (f) { pdf.setFillColor(...f); pdf.rect(x + 0.2, y + 0.3, dayW - 0.4, rowH - 0.6, "F"); }
      const c = codeFor(r.status);
      if (c) text(c, x + dayW / 2, y + 3.6, { size: 5.6, bold: r.status === "Not Marked", color: r.status === "Not Marked" ? AMBER : INK, align: "center" });
    });
    const xt = M + nameW + rep.days.length * dayW;
    text(String(p.on_duty), xt + tailW / 2, y + 3.7, { size: 6.6, bold: true, align: "center" });
    const nmk = p.counts["Not Marked"] ?? 0;
    text(nmk ? String(nmk) : "-", xt + tailW * 1.5, y + 3.7, { size: 6.6, bold: !!nmk, color: nmk ? AMBER : GREY, align: "center" });
    y += rowH;
  });

  // ── 3. One page per person ──────────────────────────────────────────────────
  for (const p of rep.people) {
    const title = `${p.name}${p.left ? " (left)" : ""}`;
    const sub = `${p.code}${p.role ? ` | ${p.role}` : ""} | ${rep.period.label}`;
    y = newPage(title, sub) + 1;
    const third = (W - M * 2 - 8) / 3;
    const countRows: [string, string, Cell?][] = rep.statuses.map((s) => [
      `${s.status} (${s.code})`, String(p.counts[s.status] ?? 0),
      s.status === "Not Marked" && p.counts[s.status] ? { text: String(p.counts[s.status]), color: AMBER } : undefined,
    ]);
    const half = Math.ceil(countRows.length / 2);
    const y1 = pairs(M, y, third, "DAYS", [["Days counted", String(p.days)], ...countRows.slice(0, half)]);
    const y2 = pairs(M + third + 4, y, third, "MORE", countRows.slice(half));
    const y3 = pairs(M + (third + 4) * 2, y, third, driver ? "RESULT" : "RESULT AND HOURS", [
      [`% ${dutyWord.toLowerCase()}`, p.rate == null ? "-" : `${p.rate}%`],
      ...(driver ? [] : [
        ["Hours (real check-outs only)", p.hours == null ? "-" : `${p.hours.toFixed(2)} h`] as [string, string],
        ["Average a day", p.avg_hours == null ? "-" : `${p.avg_hours.toFixed(2)} h`] as [string, string],
        ["Closed automatically", String(p.auto_closed)] as [string, string],
      ]),
    ]);
    y = Math.max(y1, y2, y3) + 3;
    y = ensure(y, 20, title, sub);
    y = section(y, "Every day");
    const dayCols: Column<DayRow>[] = [
      { header: "Date", width: 16, align: "center", cell: (r) => dmy(r.date) },
      { header: "Day", width: 9, cell: (r) => r.day },
      { header: "Status", width: 22, cell: (r) => ({ text: r.off && r.holiday && r.status !== "Holiday" ? `${r.status} (holiday)` : r.status, fill: fillFor(r.status, r.off), bold: r.status === "Not Marked", color: r.status === "Not Marked" ? AMBER : undefined }) },
      { header: "In", width: 13, cell: (r) => r.check_in || "-" },
      ...(driver ? [] : [{ header: "Out", width: 13, cell: (r: DayRow) => r.check_out || "-" }]),
      { header: "Notes", width: driver ? 40 : 27, cell: (r) => (r.off && r.holiday ? r.holiday : r.note) || "" },
    ];
    // Two columns side by side so a month fits on one page; longer periods
    // carry on, page by page, two columns each.
    const colW = (W - M * 2 - 6) / 2;
    let i = 0;
    while (i < p.rows.length) {
      const perCol = Math.max(1, Math.floor((BOTTOM - y - 7) / 5.6));
      const chunk = p.rows.slice(i, i + perCol * 2);
      const mid = Math.ceil(chunk.length / 2);
      const yL = table(chunk.slice(0, mid), dayCols, null, y, title, sub, { x: M, width: colW });
      const yR = chunk.length > mid ? table(chunk.slice(mid), dayCols, null, y, title, sub, { x: M + colW + 6, width: colW }) : y;
      y = Math.max(yL, yR);
      i += chunk.length;
      if (i < p.rows.length) y = newPage(`${title} (continued)`, sub) + 1;
    }
  }

  k.finish(`${filename.replace(/\.xlsx$/i, "")}.pdf`, deliver);
}
