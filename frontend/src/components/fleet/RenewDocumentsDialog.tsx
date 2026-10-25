"use client";

import { useState } from "react";
import { ArrowLeft, FileText, FileX2, RotateCw } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { FileViewer } from "@/components/ui/FileViewer";
import { ComplianceDocForm } from "@/components/fleet/ComplianceDocForm";
import { complianceRecordsApi, fileUrl, type ComplianceDocInput } from "@/lib/api";
import { COMPLIANCE_DOCS, formatRupees, type ComplianceDocMeta } from "@/lib/compliance-docs";
import { getComplianceStatus, type ComplianceStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { showError, showSuccess } from "@/lib/swal";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";

const STATUS_PILL: Record<ComplianceStatus, string> = {
  Valid:           "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Expiring Soon": "bg-amber-50 text-amber-700 ring-amber-200",
  Expired:         "bg-red-50 text-red-600 ring-red-200",
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
            className="flex w-fit items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All documents
          </button>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
            <p className="font-semibold uppercase tracking-wide text-gray-400">Renewing {renewing.label}</p>
            <p className="mt-1">
              Current: valid until <span className="font-medium text-gray-700">{formatDate(truck[renewing.dateKey] as string)}</span>
              {" · "}cost <span className="font-medium text-gray-700">{costOf(truck, renewing)}</span>
              {renewing.numberKey && <> · No. <span className="font-medium text-gray-700">{(truck[renewing.numberKey] as string) || "—"}</span></>}
            </p>
            <p className="mt-1 flex items-center gap-1 text-gray-400">
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
              <div key={d.key} className="flex flex-col gap-2.5 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{d.label}</span>
                  {status ? (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", STATUS_PILL[status])}>{status}</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Not on record</span>
                  )}
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums text-gray-900">{date ? formatDate(date) : "—"}</p>
                  <p className="text-xs text-gray-500">
                    {costOf(truck, d)}{number && <> · No. {number}</>}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  {hasFile ? (
                    <button
                      type="button"
                      onClick={() => setViewing({ url: fileUrl("trucks", truck.id, d.key), title: `${truck.registrationNumber} — ${d.label}` })}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <FileText className="h-3.5 w-3.5" /> View file
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-gray-400"><FileX2 className="h-3.5 w-3.5" /> No file</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRenewing(d)}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
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
