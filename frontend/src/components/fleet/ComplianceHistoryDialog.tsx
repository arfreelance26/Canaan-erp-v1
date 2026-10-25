"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, FileX2, Loader2, PencilLine, RotateCw, Sparkles, User } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { FileViewer } from "@/components/ui/FileViewer";
import { complianceRecordsApi, type ComplianceDocType, type ComplianceRecord } from "@/lib/api";
import { COMPLIANCE_DOCS, formatRupees } from "@/lib/compliance-docs";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";

/** Our Fleet → a truck's Compliance History: every RC / FC / Road Tax /
 *  Insurance / permit / PUC document it has held, with its cost and file. */
export function ComplianceHistoryDialog({ truck, onClose }: { truck: Truck | null; onClose: () => void }) {
  const [records, setRecords] = useState<ComplianceRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<ComplianceDocType>("insurance");
  const [viewing, setViewing] = useState<ComplianceRecord | null>(null);

  useEffect(() => {
    if (!truck) return;
    setRecords(null);
    setFailed(false);
    complianceRecordsApi.listForTruck(truck.id)
      .then((rows) => {
        setRecords(rows);
        // Open on the first document that has history.
        const first = COMPLIANCE_DOCS.find((d) => rows.some((r) => r.docType === d.key));
        if (first) setTab(first.key);
      })
      .catch(() => setFailed(true));
  }, [truck]);

  const byDoc = useMemo(() => {
    const m = new Map<ComplianceDocType, ComplianceRecord[]>();
    for (const r of records ?? []) m.set(r.docType, [...(m.get(r.docType) ?? []), r]);
    return m;
  }, [records]);
  const sum = (rows: ComplianceRecord[]) => rows.reduce((s, r) => s + (r.expense ?? 0), 0);
  const grandTotal = sum(records ?? []);
  const rows = byDoc.get(tab) ?? [];
  const meta = COMPLIANCE_DOCS.find((d) => d.key === tab)!;

  return (
    <Dialog
      open={!!truck}
      onClose={onClose}
      title={truck ? `Compliance History — ${truck.registrationNumber || truck.truckId}` : "Compliance History"}
      className="sm:max-w-3xl"
    >
      {failed ? (
        <p className="py-10 text-center text-sm text-red-500">Couldn&apos;t load the history. Please try again.</p>
      ) : records === null ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Totals */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Spent on all documents" value={formatRupees(grandTotal)} strong />
            <Stat label="Documents on record" value={String(records.length)} />
            <Stat label="Renewals" value={String(records.filter((r) => r.kind === "Renewal").length)} className="hidden sm:flex" />
          </div>

          {/* Document tabs */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {COMPLIANCE_DOCS.map((d) => {
              const n = byDoc.get(d.key)?.length ?? 0;
              const active = d.key === tab;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setTab(d.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-[#16213e] bg-[#16213e] text-white"
                      : n
                        ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        : "border-dashed border-gray-200 bg-white text-gray-400 hover:bg-gray-50",
                  )}
                >
                  {d.short}
                  <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-white/20" : "bg-gray-100 text-gray-500")}>{n}</span>
                </button>
              );
            })}
          </div>

          {/* Timeline */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 py-10 text-sm text-gray-400">
              <FileX2 className="h-7 w-7 opacity-50" />
              No {meta.label} on record for this truck.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="mb-1 text-xs text-gray-500">
                {rows.length} {meta.label} document{rows.length === 1 ? "" : "s"} · total{" "}
                <span className="font-semibold text-gray-800">{formatRupees(sum(rows))}</span>
              </p>
              <ol className="relative flex max-h-[52vh] flex-col gap-3 overflow-y-auto pl-5">
                <span className="absolute bottom-3 left-[7px] top-3 w-px bg-gray-200" aria-hidden />
                {rows.map((r) => (
                  <li key={r.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-5 top-4 h-3.5 w-3.5 rounded-full border-2 border-white ring-2",
                        r.isCurrent ? "bg-emerald-500 ring-emerald-200" : "bg-gray-300 ring-gray-100",
                      )}
                      aria-hidden
                    />
                    <div className={cn(
                      "rounded-xl border p-3.5 shadow-sm",
                      r.isCurrent ? "border-emerald-200 bg-emerald-50/40" : "border-gray-100 bg-white",
                    )}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {r.isCurrent && (
                              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Current</span>
                            )}
                            <span className={cn(
                              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              r.kind === "Renewal" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600",
                            )}>
                              {r.kind === "Renewal" ? <RotateCw className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
                              {r.kind}
                            </span>
                            {r.docNumber && <span className="text-[11px] font-medium text-gray-500">No. {r.docNumber}</span>}
                          </div>
                          <p className="mt-1.5 text-sm font-semibold tabular-nums text-gray-900">
                            {r.validFrom ? `${formatDate(r.validFrom)} → ` : "Valid until "}
                            {formatDate(r.validUntil)}
                          </p>
                        </div>
                        <p className="text-lg font-bold tabular-nums text-gray-900">{formatRupees(r.expense)}</p>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] text-gray-500">
                          <User className="h-3 w-3" />
                          {r.createdByName || "—"} · {formatDateTime(r.createdAt)}
                        </p>
                        {r.hasFile ? (
                          <button
                            type="button"
                            onClick={() => setViewing(r)}
                            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                          >
                            <FileText className="h-3.5 w-3.5" /> View document
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-gray-400">
                            <FileX2 className="h-3 w-3" /> No file
                          </span>
                        )}
                      </div>

                      {r.correctionNote && (
                        <div className="mt-2.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 ring-1 ring-amber-100">
                          <p className="flex items-center gap-1 font-semibold">
                            <PencilLine className="h-3 w-3" /> Corrected by {r.correctedByName} · {formatDateTime(r.correctedAt)}
                          </p>
                          <p className="mt-0.5 whitespace-pre-line">{r.correctionNote}</p>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <FileViewer
        open={!!viewing}
        onClose={() => setViewing(null)}
        url={viewing ? complianceRecordsApi.fileUrl(viewing.id) : ""}
        title={viewing ? `${truck?.registrationNumber ?? ""} — ${viewing.docLabel} (valid until ${formatDate(viewing.validUntil)})` : ""}
        filename={viewing?.fileName ?? undefined}
      />
    </Dialog>
  );
}

function Stat({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-2.5", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className={cn("mt-0.5 tabular-nums", strong ? "text-lg font-bold text-[#16213e]" : "text-base font-semibold text-gray-800")}>{value}</span>
    </div>
  );
}
