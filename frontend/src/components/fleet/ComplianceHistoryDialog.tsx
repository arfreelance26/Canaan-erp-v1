"use client";

import { useEffect, useMemo, useState } from "react";
import { RiFileTextLine as FileText, RiFileCloseLine as FileX2, RiLoader4Line as Loader2, RiEditLine as PencilLine, RiRestartLine as RotateCw, RiStarLine as Sparkles, RiUserLine as User } from "@remixicon/react";
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
        <p className="py-10 text-center text-sm text-danger-text">Couldn&apos;t load the history. Please try again.</p>
      ) : records === null ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-tertiary">
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
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption-1-semibold transition-colors",
                    active
                      ? "border-accent-solid bg-accent-solid text-on-solid"
                      : n
                        ? "border-separator-border bg-background-primary-default text-text-primary hover:bg-fill-2"
                        : "border-dashed border-separator-border bg-background-primary-default text-text-tertiary hover:bg-fill-2",
                  )}
                >
                  {d.short}
                  <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-on-solid/20" : "bg-fill-2 text-text-secondary")}>{n}</span>
                </button>
              );
            })}
          </div>

          {/* Timeline */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-separator-border py-10 text-sm text-text-tertiary">
              <FileX2 className="h-7 w-7 opacity-50" />
              No {meta.label} on record for this truck.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="mb-1 text-xs text-text-secondary">
                {rows.length} {meta.label} document{rows.length === 1 ? "" : "s"} · total{" "}
                <span className="font-semibold text-text-primary">{formatRupees(sum(rows))}</span>
              </p>
              <ol className="relative flex max-h-[52vh] flex-col gap-3 overflow-y-auto pl-5">
                <span className="absolute bottom-3 left-[7px] top-3 w-px bg-fill-3" aria-hidden />
                {rows.map((r) => (
                  <li key={r.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-5 top-4 h-3.5 w-3.5 rounded-full border-2 border-background-primary-default ring-2",
                        r.isCurrent ? "bg-success-solid ring-success-border" : "bg-fill-4 ring-separator-border",
                      )}
                      aria-hidden
                    />
                    <div className={cn(
                      "rounded-xl border bg-background-primary-default p-3.5 shadow-sm",
                      r.isCurrent ? "border-success-border bg-success-surface/40" : "border-separator-border bg-background-primary-default",
                    )}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {r.isCurrent && (
                              <span className="rounded-full bg-success-solid px-2 py-0.5 text-caption-2-semibold text-on-solid">Current</span>
                            )}
                            <span className={cn(
                              "flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold",
                              r.kind === "Renewal" ? "bg-accent-surface text-accent-text" : "bg-fill-2 text-text-secondary",
                            )}>
                              {r.kind === "Renewal" ? <RotateCw className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
                              {r.kind}
                            </span>
                            {r.docNumber && <span className="text-caption-2-medium text-text-secondary">No. {r.docNumber}</span>}
                          </div>
                          <p className="mt-1.5 text-body-semibold tabular-nums text-text-primary">
                            {r.validFrom ? `${formatDate(r.validFrom)} → ` : "Valid until "}
                            {formatDate(r.validUntil)}
                          </p>
                        </div>
                        <p className="text-title-3-semibold tabular-nums text-text-primary">{formatRupees(r.expense)}</p>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] text-text-secondary">
                          <User className="h-3 w-3" />
                          {r.createdByName || "—"} · {formatDateTime(r.createdAt)}
                        </p>
                        {r.hasFile ? (
                          <button
                            type="button"
                            onClick={() => setViewing(r)}
                            className="flex items-center gap-1.5 rounded-lg border border-accent-border bg-accent-surface px-2.5 py-1 text-caption-1-semibold text-accent-text transition hover:bg-accent-surface-strong"
                          >
                            <FileText className="h-3.5 w-3.5" /> View document
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
                            <FileX2 className="h-3 w-3" /> No file
                          </span>
                        )}
                      </div>

                      {r.correctionNote && (
                        <div className="mt-2.5 rounded-lg bg-warning-surface px-2.5 py-2 text-[11px] text-warning-text-strong ring-1 ring-warning-border">
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
    <div className={cn("flex flex-col rounded-xl border border-separator-border bg-fill-1 px-3.5 py-2.5", className)}>
      <span className="text-caption-2-semibold text-text-tertiary">{label}</span>
      <span className={cn("mt-0.5 tabular-nums", strong ? "text-title-3-semibold text-accent-text-strong" :"text-headline-semibold text-text-primary")}>{value}</span>
    </div>
  );
}
