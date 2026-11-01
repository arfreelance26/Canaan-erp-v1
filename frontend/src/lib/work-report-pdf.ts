import type { WorkReport, WorkReportPerson } from "@/lib/api";
import { formatDate } from "@/lib/format-date";

export function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function shift(p: WorkReportPerson): string {
  return p.shiftIn ? `${p.shiftIn} to ${p.shiftOut ?? "now"}` : "—";
}

export function headline(p: WorkReportPerson): [string, string][] {
  return [
    ["Status", p.status],
    ["Shift", shift(p)],
    ["Hours marked", p.markedMinutes === null ? "—" : duration(p.markedMinutes)],
    ["Actually active", duration(p.activeMinutes)],
    ["Work done", String(p.workCount)],
    ["Longest quiet gap", p.gaps.length ? duration(p.longestGapMinutes) : "—"],
  ];
}

/** One employee's page, one after another: the jsPDF side of the report. */
export async function savePdf(report: WorkReport, people: WorkReportPerson[]) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const width = pageW - margin * 2;
  let y = margin;

  const room = (needed: number) => {
    if (y + needed > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const heading = (text: string) => {
    room(14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(27, 43, 94);
    pdf.text(text, margin, y);
    y += 5;
  };

  const table = (headers: string[], rows: string[][], widths: number[]) => {
    const rowH = 6.5;
    const drawHead = () => {
      pdf.setFillColor(27, 43, 94);
      pdf.rect(margin, y, width, rowH, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      let x = margin + 2;
      headers.forEach((h, i) => { pdf.text(h, x, y + 4.4); x += widths[i] * width; });
      y += rowH;
    };
    room(rowH * 2);
    drawHead();
    rows.forEach((row, r) => {
      if (y + rowH > pageH - margin) {
        pdf.addPage();
        y = margin;
        drawHead();
      }
      if (r % 2 === 1) {
        pdf.setFillColor(245, 247, 250);
        pdf.rect(margin, y, width, rowH, "F");
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(30, 30, 30);
      let x = margin + 2;
      row.forEach((cell, i) => {
        const cellW = widths[i] * width - 3;
        pdf.text((pdf.splitTextToSize(cell, cellW) as string[])[0] ?? "", x, y + 4.4);
        x += widths[i] * width;
      });
      y += rowH;
    });
    y += 6;
  };

  people.forEach((p, index) => {
    if (index > 0) pdf.addPage();
    y = margin + 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(110, 110, 110);
    pdf.text(`Staff Work Report: ${formatDate(report.day)}`, margin, y);
    y += 7;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(27, 43, 94);
    pdf.text(`${p.name} (${p.role})`, margin, y);
    y += 7;

    const lines = pdf.setFont("helvetica", "normal").setFontSize(10).splitTextToSize(p.summary, width - 8) as string[];
    const boxH = lines.length * 5 + 6;
    pdf.setFillColor(238, 242, 255);
    pdf.roundedRect(margin, y, width, boxH, 2, 2, "F");
    pdf.setTextColor(40, 40, 60);
    pdf.text(lines, margin + 4, y + 6);
    y += boxH + 6;

    const facts = headline(p);
    table(facts.map(([label]) => label), [facts.map(([, value]) => value)], [0.13, 0.27, 0.15, 0.15, 0.12, 0.18]);
    if (p.workDone.length) {
      heading("Work done");
      table(["Type of work", "Count"], p.workDone.map((w) => [w.work, String(w.count)]), [0.8, 0.2]);
    }
    if (p.details.length) {
      heading("Work details");
      table(["Time", "Work done", "Record"], p.details.map((d) => [d.time, d.work, d.record ?? "—"]), [0.18, 0.5, 0.32]);
    }
    if (p.gaps.length) {
      heading("Quiet gaps");
      table(["From", "To", "Gap"], p.gaps.map((g) => [g.from, g.to, duration(g.minutes)]), [0.34, 0.33, 0.33]);
    }
  });
  pdf.save(`Staff_Work_Report_${report.day}.pdf`);
}
