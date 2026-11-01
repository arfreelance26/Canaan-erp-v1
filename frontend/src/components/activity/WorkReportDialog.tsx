"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { downloadExcel, type WorkReport } from "@/lib/api";
import { problemFromMessage, reportProblem } from "@/lib/connection-problem";
import { formatDate } from "@/lib/format-date";
import { duration, headline, savePdf } from "@/lib/work-report-pdf";
import { showError } from "@/lib/swal";

const ALL = "all";

function MiniTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="overflow-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {headers.map((h) => <th key={h} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => <td key={c} className="px-3 py-2 text-gray-700">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WorkReportDialog({ report, onClose }: { report: WorkReport; onClose: () => void }) {
  const [employee, setEmployee] = useState(ALL);
  const [excelBusy, setExcelBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const people = useMemo(
    () => report.staff.filter((p) => employee === ALL || p.key === employee),
    [report, employee],
  );

  async function handleExcel() {
    setExcelBusy(true);
    try {
      const params = new URLSearchParams({ day: report.day, ...(employee === ALL ? {} : { employee }) });
      await downloadExcel(`/activity/work-report/export?${params}`, `Staff_Work_Report_${report.day}.xlsx`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to download the report.";
      const problem = problemFromMessage(message);
      if (problem) reportProblem({ ...problem, onRetry: handleExcel });
      else showError(message);
    } finally {
      setExcelBusy(false);
    }
  }

  async function handlePdf() {
    setPdfBusy(true);
    try {
      await savePdf(report, people);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Staff Work Report: ${formatDate(report.day)}`} className="sm:max-w-4xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full sm:w-72">
            <GlassSelect
              value={employee}
              onChange={setEmployee}
              options={[
                { value: ALL, label: `Everyone (${report.staff.length})` },
                ...report.staff.map((p) => ({ value: p.key, label: `${p.name} (${p.role})` })),
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExcel}
              disabled={excelBusy}
              className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {excelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Download Excel
            </button>
            <button
              type="button"
              onClick={handlePdf}
              disabled={pdfBusy}
              className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download PDF
            </button>
          </div>
        </div>

        {report.live && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs text-blue-800">
            Today isn&apos;t over yet, so this report keeps updating as work happens.
          </p>
        )}
        {report.limited && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-800">
            This day is older than the report, so it can&apos;t name each record or merge repeat saves.
          </p>
        )}

        <p className="text-xs text-gray-500">
          Only work done in the software appears here. A quiet gap is something to ask about, not proof that no work was done.
        </p>

        <div className="flex flex-col gap-5">
          {people.map((p) => (
            <section key={p.key} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">{p.name}</h3>
                <p className="text-xs text-gray-500">{p.role}</p>
              </div>
              <p className="rounded-lg bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-950">{p.summary}</p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {headline(p).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-gray-800">{value}</dd>
                  </div>
                ))}
              </dl>
              <MiniTable title="Work done" headers={["Type of work", "Count"]} rows={p.workDone.map((w) => [w.work, String(w.count)])} />
              <MiniTable title="Work details" headers={["Time", "Work done", "Record"]} rows={p.details.map((d) => [d.time, d.work, d.record ?? "—"])} />
              <MiniTable title="Quiet gaps" headers={["From", "To", "Gap"]} rows={p.gaps.map((g) => [g.from, g.to, duration(g.minutes)])} />
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
