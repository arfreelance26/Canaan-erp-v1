"use client";

import { useState } from "react";
import { RiArrowLeftLine as ArrowLeft, RiFileTextLine as FileText, RiFileCloseLine as FileX2, RiRestartLine as RotateCw } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { ComplianceDocForm } from "@/components/fleet/ComplianceDocForm";
import { complianceRecordsApi, fileUrl, type ComplianceDocInput } from "@/lib/api";
import { COMPLIANCE_DOCS, formatRupees, type ComplianceDocMeta } from "@/lib/compliance-docs";
import { getComplianceStatus, type ComplianceStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { showError, showSuccess } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const FileViewer = dynamic(() => import("@/components/ui/FileViewer").then((m) => m.FileViewer));

const STATUS_PILL: Record<ComplianceStatus, string> = {
  Valid:           "bg-success-surface text-success-text ring-success-border",
  "Expiring Soon": "bg-warning-surface text-warning-text ring-warning-border",
  Expired:         "bg-danger-surface text-danger-text ring-danger-border",
};

/** Compliance & Renewals → a truck's "Update Document": its 7 documents as
 *  cards, each with Renew. Mistakes are fixed in View Updation History. */
export function RenewDocumentsDialog({ truck, onClose, onSaved }: { truck: Truck | null; onClose: () => void; onSaved: () => void }) {
  const [renewing, setRenewing] = useState<ComplianceDocMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<{ url: string; title: string } | null>(null);

  function close() {
    setRenewing(null);
    onClose();
  }

  async function renew(input: ComplianceDocInput) {
    if (!truck || !renewing) return;
    setSaving(true);
    try {
      await complianceRecordsApi.renew(truck.id, renewing.key, input);
      onSaved();
      showSuccess(`${renewing.label} renewed. The previous one is kept in the history.`);
      close();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to renew the document.");
    } finally {
      setSaving(false);
    }
  }

  const title = truck ? `Update Document — ${truck.registrationNumber || truck.truckId}` : "Update Document";

  return (
    <Dialog open={!!truck} onClose={close} title={title} className="sm:max-w-3xl">
      {truck && (renewing ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setRenewing(null)}
            className="flex w-fit items-center gap-1 text-caption-1-semibold text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All documents
          </button>
          <div className="rounded-lg border border-separator-border bg-fill-1 px-4 py-3 text-xs text-text-secondary">
            <p className="font-semibold text-text-tertiary">Renewing {renewing.label}</p>
            <p className="mt-1">
              Current: valid until <span className="font-medium text-text-primary">{formatDate(truck[renewing.dateKey] as string)}</span>
              {" · "}cost <span className="font-medium text-text-primary">{costOf(truck, renewing)}</span>
              {renewing.numberKey && <> · No. <span className="font-medium text-text-primary">{(truck[renewing.numberKey] as string) || "—"}</span></>}
            </p>
            <p className="mt-1 flex items-center gap-1 text-text-tertiary">
              <RotateCw className="h-3 w-3" /> The current one stays in the history with its cost and file.
            </p>
          </div>
          <ComplianceDocForm key={renewing.key} doc={renewing} mode="renew" saving={saving} onSubmit={renew} onCancel={() => setRenewing(null)} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {COMPLIANCE_DOCS.map((d) => {
            const date = truck[d.dateKey] as string;
            const status = date ? getComplianceStatus(date, d.statusField) : null;
            const number = d.numberKey ? (truck[d.numberKey] as string) : "";
            const hasFile = !!truck[d.fileNameKey];
            return (
              <div key={d.key} className="flex flex-col gap-2.5 rounded-xl border border-separator-border bg-background-primary-default p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption-1-semibold text-text-secondary">{d.label}</span>
                  {status ? (
                    <span className={cn("rounded-full px-2 py-0.5 text-caption-2-semibold ring-1", STATUS_PILL[status])}>{status}</span>
                  ) : (
                    <span className="rounded-full bg-fill-2 px-2 py-0.5 text-caption-2-semibold text-text-secondary">Not on record</span>
                  )}
                </div>
                <div>
                  <p className="text-headline-semibold tabular-nums text-text-primary">{date ? formatDate(date) : "—"}</p>
                  <p className="text-xs text-text-secondary">
                    {costOf(truck, d)}{number && <> · No. {number}</>}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  {hasFile ? (
                    <button
                      type="button"
                      onClick={() => setViewing({ url: fileUrl("trucks", truck.id, d.key), title: `${truck.registrationNumber} — ${d.label}` })}
                      className="flex items-center gap-1 text-caption-1-semibold text-accent-text hover:text-accent-text-strong"
                    >
                      <FileText className="h-3.5 w-3.5" /> View file
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-text-tertiary"><FileX2 className="h-3.5 w-3.5" /> No file</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRenewing(d)}
                    className="flex items-center gap-1.5 rounded-lg bg-accent-solid px-3 py-1.5 text-caption-1-semibold text-on-solid transition hover:bg-accent-solid-hover"
                  >
                    <RotateCw className="h-3.5 w-3.5" /> {date ? "Renew" : "Add"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <FileViewer open={!!viewing} onClose={() => setViewing(null)} url={viewing?.url ?? ""} title={viewing?.title ?? ""} />
    </Dialog>
  );
}

function costOf(truck: Truck, d: ComplianceDocMeta) {
  const n = parseFloat(truck[d.expensesKey] as string);
  return Number.isNaN(n) || n <= 0 ? "No cost" : formatRupees(n);
}
