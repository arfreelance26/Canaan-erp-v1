"use client";

import { useEffect, useMemo, useState } from "react";
import { RiFileExcel2Line as FileSpreadsheet, RiFileTextLine as FileText, RiLoader4Line as Loader2 } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { activityApi, downloadExcel, type WorkReport } from "@/lib/api";
import { problemFromMessage, reportProblem } from "@/lib/connection-problem";
import { formatDate, todayIst } from "@/lib/format-date";
import { dayLabel, duration, headline, savePdf } from "@/lib/work-report-pdf";
import { showError } from "@/lib/feedback";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
const ALL = "all";
const MAX_RANGE_DAYS = 31; // backend work_report.MAX_RANGE_DAYS

type Mode = "day" | "range";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** This week / last week (Mon–Sun), this month so far / last month, in IST. */
function quickRanges(): { label: string; from: string; to: string }[] {
  const today = new Date(`${todayIst()}T00:00:00`);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const lastSunday = new Date(monday);
  lastSunday.setDate(monday.getDate() - 1);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstOfLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfLast = new Date(today.getFullYear(), today.getMonth(), 0);
  return [
    { label: "This week", from: iso(monday), to: iso(today) },
    { label: "Last week", from: iso(lastMonday), to: iso(lastSunday) },
    { label: "This month", from: iso(firstOfMonth), to: iso(today) },
    { label: "Last month", from: iso(firstOfLast), to: iso(endOfLast) },
  ];
}

function spanDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1;
}

function MiniTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-caption-2-semibold text-text-tertiary">{title}</p>
      <div className="max-h-72 overflow-auto rounded-lg border border-separator-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0">
            <tr className="border-b border-separator-border bg-fill-1">
              {headers.map((h) => <th key={h} className="px-3 py-2 text-caption-2-semibold text-text-tertiary">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-separator-border">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => <td key={c} className="px-3 py-2 text-text-primary">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Staff Work Report for the Activity Log's date, or for a date range. */
export function WorkReportDialog({ day, onClose }: { day: string; onClose: () => void }) {
  const quick = useMemo(quickRanges, []);
  const [mode, setMode] = useState<Mode>("day");
  const [from, setFrom] = useState(quick[2].from);   // this month so far
  const [to, setTo] = useState(quick[2].to);
  const [report, setReport] = useState<WorkReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [employee, setEmployee] = useState(ALL);
  const [excelBusy, setExcelBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const rangeProblem = mode === "range" && (!from || !to ? "Pick a From and a To date."
    : to < from ? "The To date must be on or after the From date."
      : spanDays(from, to) > MAX_RANGE_DAYS ? `Pick a range of up to ${MAX_RANGE_DAYS} days.` : null);

  useEffect(() => {
    if (rangeProblem) {
      setReport(null);
      setMessage(rangeProblem);
      setLoading(false);
      return;
    }
    let stale = false;
    setLoading(true);
    setMessage(null);
    (mode === "day" ? activityApi.workReport(day) : activityApi.workReportRange(from, to))
      .then((r) => { if (!stale) { setReport(r); setEmployee(ALL); } })
      .catch((err: unknown) => {
        if (stale) return;
        setReport(null);
        const text = err instanceof Error ? err.message : "Could not prepare the report.";
        const problem = problemFromMessage(text);
        if (problem) reportProblem(problem);
        setMessage(problem ? "The report couldn't be loaded." : text);
      })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [mode, day, from, to, rangeProblem]);

  const people = useMemo(
    () => (report?.staff ?? []).filter((p) => employee === ALL || p.key === employee),
    [report, employee],
  );
  const days = report?.range?.days;
  const period = report?.range ? `${formatDate(report.range.from)} to ${formatDate(report.range.to)}` : formatDate(day);

  async function handleExcel() {
    if (!report) return;
    setExcelBusy(true);
    try {
      const who: Record<string, string> = employee === ALL ? {} : { employee };
      const path = report.range
        ? `/activity/work-report/range/export?${new URLSearchParams({ from_date: report.range.from, to_date: report.range.to, ...who })}`
        : `/activity/work-report/export?${new URLSearchParams({ day: report.day, ...who })}`;
      const name = report.range ? `${report.range.from}_to_${report.range.to}` : report.day;
      await downloadExcel(path, `Staff_Work_Report_${name}.xlsx`);
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "Failed to download the report.";
      const problem = problemFromMessage(text);
      if (problem) reportProblem({ ...problem, onRetry: handleExcel });
      else showError(text);
    } finally {
      setExcelBusy(false);
    }
  }

  async function handlePdf() {
    if (!report) return;
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
    <Dialog open onClose={onClose} title={`Staff Work Report: ${period}`} className="sm:max-w-4xl">
      <div className="flex flex-col gap-4">
        {/* Single day (the Activity Log's date) or a date range */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full bg-fill-2 p-0.5 text-caption-1-semibold">
            {([["day", `Single day · ${formatDate(day)}`], ["range", "Date range"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded-full px-3.5 py-1.5 transition-colors", mode === m ? "bg-background-primary-default text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary")}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "range" && (
            <>
              <DateRangePill from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
              <div className="flex flex-wrap gap-1.5">
                {quick.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => { setFrom(q.from); setTo(q.to); }}
                    className={cn("rounded-full border px-3 py-1 text-caption-1-medium transition-colors",
                      from === q.from && to === q.to ? "border-accent-border-strong bg-accent-surface text-accent-text" : "border-separator-border text-text-secondary hover:bg-fill-2")}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-text-tertiary" /></div>
        ) : !report ? (
          <EmptyState size="compact" illustration="no-data" title={message ?? "No work recorded"} />
        ) : (
          <>
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
                  className="flex items-center gap-2 rounded-full border border-success-border bg-success-surface px-4 py-2 text-body-medium text-success-text hover:bg-success-surface-strong disabled:opacity-50"
                >
                  {excelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Download Excel
                </button>
                <button
                  type="button"
                  onClick={handlePdf}
                  disabled={pdfBusy}
                  className="flex items-center gap-2 rounded-full border border-danger-border bg-danger-surface px-4 py-2 text-body-medium text-danger-text hover:bg-danger-surface-strong disabled:opacity-50"
                >
                  {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Download PDF
                </button>
              </div>
            </div>

            {report.live && (
              <p className="rounded-lg border border-accent-border bg-accent-surface px-3.5 py-2 text-xs text-accent-text-strong">
                {report.range ? "This period includes today, which" : "Today"} isn&apos;t over yet, so this report keeps updating as work happens.
              </p>
            )}
            {report.limited && (
              <p className="rounded-lg border border-warning-border bg-warning-surface px-3.5 py-2 text-xs text-warning-text-strong">
                {report.range ? "Some days here are" : "This day is"} older than the report, so they can&apos;t name each record or merge repeat saves.
              </p>
            )}
            {report.range && (
              <p className="text-xs text-text-secondary">The PDF keeps to the totals and the day-by-day table; every work item is in the Excel.</p>
            )}
            <p className="text-xs text-text-secondary">
              Only work done in the software appears here. A quiet gap is something to ask about, not proof that no work was done.
            </p>

            <div className="flex flex-col gap-5">
              {people.map((p) => (
                <section key={p.key} className="flex flex-col gap-3 rounded-xl border border-separator-border bg-background-primary-default p-4">
                  <div>
                    <h3 className="text-headline-semibold text-text-primary">{p.name}</h3>
                    <p className="text-xs text-text-secondary">{p.role}</p>
                  </div>
                  <p className="rounded-lg bg-purple-surface px-3.5 py-2.5 text-sm text-purple-text-strong">{p.summary}</p>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {headline(p, days).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-caption-2-semibold text-text-tertiary">{label}</dt>
                        <dd className="mt-0.5 text-body-semibold text-text-primary">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {p.days && (
                    <MiniTable
                      title="Day by day"
                      headers={["Date", "Status", "Shift", "Marked", "Active", "Work", "Longest gap"]}
                      rows={p.days.map((d) => [
                        dayLabel(d.date), d.status, d.shiftIn ? `${d.shiftIn} to ${d.shiftOut ?? "now"}` : "—",
                        d.markedMinutes === null ? "—" : duration(d.markedMinutes), duration(d.activeMinutes),
                        String(d.workCount), d.longestGapMinutes ? duration(d.longestGapMinutes) : "—",
                      ])}
                    />
                  )}
                  <MiniTable title="Work done" headers={["Type of work", "Count"]} rows={p.workDone.map((w) => [w.work, String(w.count)])} />
                  <MiniTable
                    title="Work details"
                    headers={days ? ["Date", "Time", "Work done", "Record"] : ["Time", "Work done", "Record"]}
                    rows={p.details.map((d) => [...(days ? [dayLabel(d.date ?? "")] : []), d.time, d.work, d.record ?? "—"])}
                  />
                  <MiniTable
                    title="Quiet gaps"
                    headers={days ? ["Date", "From", "To", "Gap"] : ["From", "To", "Gap"]}
                    rows={p.gaps.map((g) => [...(days ? [dayLabel(g.date ?? "")] : []), g.from, g.to, duration(g.minutes)])}
                  />
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
