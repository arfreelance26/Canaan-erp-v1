"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FilePlus2, FileText, FileX2, Loader2, PencilLine, RotateCw, Trash2, Undo2, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { FileViewer } from "@/components/ui/FileViewer";
import { ComplianceDocForm } from "@/components/fleet/ComplianceDocForm";
import {
  complianceRecordsApi,
  type ComplianceDocInput,
  type ComplianceDocType,
  type ComplianceLogEntry,
  type ComplianceRecord,
} from "@/lib/api";
import { COMPLIANCE_DOCS, formatRupees } from "@/lib/compliance-docs";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { confirmAction, showError, showSuccess } from "@/lib/swal";
import { Field, inputClassLower } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";

type View = "list" | "correct" | "undo";

/** Compliance & Renewals → a truck's "View Updation History": everything that
 *  happened to each document, and the tools to fix a mistake on the CURRENT
 *  one — Correct, Remove file, and (Admin only) Undo the latest renewal. */
export function UpdationHistoryDialog({ truck, onClose, onSaved }: { truck: Truck | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [records, setRecords] = useState<ComplianceRecord[] | null>(null);
  const [log, setLog] = useState<ComplianceLogEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<ComplianceDocType>("insurance");
  const [view, setView] = useState<View>("list");
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [viewing, setViewing] = useState<ComplianceRecord | null>(null);

  const load = useCallback((truckId: string, pickTab: boolean) => {
    setFailed(false);
    Promise.all([complianceRecordsApi.listForTruck(truckId), complianceRecordsApi.getLog(truckId)])
      .then(([recs, entries]) => {
        setRecords(recs);
        setLog(entries);
        if (pickTab) {
          const first = COMPLIANCE_DOCS.find((d) => recs.some((r) => r.docType === d.key));
          if (first) setTab(first.key);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!truck) return;
    setRecords(null);
    setView("list");
    load(truck.id, true);
  }, [truck, load]);

  const meta = COMPLIANCE_DOCS.find((d) => d.key === tab)!;
  const docRecords = useMemo(() => (records ?? []).filter((r) => r.docType === tab), [records, tab]);
  const current = docRecords.find((r) => r.isCurrent) ?? null;
  const previous = docRecords.find((r) => !r.isCurrent) ?? null;
  const canUndo = isAdmin && current?.kind === "Renewal" && !!previous;
  const docLog = log.filter((l) => l.docType === tab);
  // The earliest "document set" entry is when it was added; later ones are renewals / updates.
  const firstSetId = [...docLog].reverse().find((l) => !l.action)?.id;

  function close() {
    setView("list");
    setReason("");
    onClose();
  }

  async function run(action: () => Promise<void>, success: string) {
    if (!truck) return;
    setSaving(true);
    try {
      await action();
      onSaved();
      load(truck.id, false);
      setView("list");
      setReason("");
      showSuccess(success);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  function correct(input: ComplianceDocInput) {
    if (!truck) return;
    return run(() => complianceRecordsApi.correct(truck.id, tab, input), `${meta.label} corrected.`);
  }

  async function removeFile() {
    if (!truck || !current) return;
    const ok = await confirmAction(
      "Remove this file?",
      `${current.fileName ?? "The file"} will be removed from the current ${meta.label}. Its dates and cost stay. You can attach the right file later with Correct.`,
      "Remove File",
    );
    if (!ok.isConfirmed) return;
    await run(
      () => complianceRecordsApi.correct(truck.id, tab, {
        validUntil: current.validUntil ?? "",
        validFrom: current.validFrom ?? "",
        expense: current.expense != null ? String(current.expense) : "",
        docNumber: current.docNumber ?? "",
        removeFile: true,
      }),
      "File removed.",
    );
  }

  async function undo() {
    if (!truck || !current || !previous) return;
    const ok = await confirmAction(
      "Undo this renewal?",
      `The ${meta.label} valid until ${formatDate(current.validUntil)} (${formatRupees(current.expense)}) will be deleted with its file. ` +
        `The one valid until ${formatDate(previous.validUntil)} becomes current again. This can't be reversed.`,
      "Undo Renewal",
    );
    if (!ok.isConfirmed) return;
    await run(() => complianceRecordsApi.undoRenewal(truck.id, tab, reason.trim()), "Renewal undone.");
  }

  return (
    <Dialog
      open={!!truck}
      onClose={close}
      title={truck ? `Updation History — ${truck.registrationNumber || truck.truckId}` : "Updation History"}
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
          {/* Document tabs */}
          {view === "list" && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {COMPLIANCE_DOCS.map((d) => {
                const n = log.filter((l) => l.docType === d.key).length;
                const active = d.key === tab;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setTab(d.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      active ? "border-[#16213e] bg-[#16213e] text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    {d.short}
                    <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-white/20" : "bg-gray-100 text-gray-500")}>{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          {view !== "list" && (
            <button
              type="button"
              onClick={() => { setView("list"); setReason(""); }}
              className="flex w-fit items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to {meta.label} history
            </button>
          )}

          {/* Current document + fix tools */}
          {current ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Current {meta.label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                    {current.validFrom ? `${formatDate(current.validFrom)} → ` : "Valid until "}{formatDate(current.validUntil)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatRupees(current.expense)}
                    {current.docNumber && <> · No. {current.docNumber}</>}
                    {" · "}{current.kind} by {current.createdByName || "—"}
                  </p>
                </div>
                {current.hasFile ? (
                  <button
                    type="button"
                    onClick={() => setViewing(current)}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                  >
                    <FileText className="h-3.5 w-3.5" /> View file
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-gray-400"><FileX2 className="h-3 w-3" /> No file</span>
                )}
              </div>

              {view === "list" && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-emerald-100 pt-3">
                  <ToolButton onClick={() => setView("correct")} icon={PencilLine} label="Correct a mistake" />
                  {current.hasFile && <ToolButton onClick={removeFile} icon={Trash2} label="Remove file" danger disabled={saving} />}
                  {canUndo && <ToolButton onClick={() => setView("undo")} icon={Undo2} label="Undo this renewal" danger />}
                </div>
              )}
            </div>
          ) : (
            view === "list" && (
              <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                No {meta.label} on record for this truck yet — add one with <b>Update Document</b>.
              </p>
            )
          )}

          {view === "correct" && current && (
            <ComplianceDocForm
              key={`${tab}-${current.id}`}
              doc={meta}
              mode="correct"
              initial={{ validFrom: current.validFrom, validUntil: current.validUntil, expense: current.expense, docNumber: current.docNumber }}
              currentFileName={current.hasFile ? current.fileName ?? "current file" : null}
              saving={saving}
              onSubmit={correct}
              onCancel={() => setView("list")}
            />
          )}

          {view === "undo" && current && previous && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs">
                  <p className="font-semibold uppercase tracking-wide text-red-600">Will be deleted</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Valid until {formatDate(current.validUntil)}</p>
                  <p className="text-gray-600">{formatRupees(current.expense)}{current.fileName ? ` · ${current.fileName}` : " · no file"}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs">
                  <p className="font-semibold uppercase tracking-wide text-emerald-700">Becomes current again</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Valid until {formatDate(previous.validUntil)}</p>
                  <p className="text-gray-600">{formatRupees(previous.expense)}{previous.fileName ? ` · ${previous.fileName}` : " · no file"}</p>
                </div>
              </div>
              <Field label="Why is this renewal being undone?" required>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Renewed the wrong truck"
                  className={inputClassLower}
                />
              </Field>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setView("list"); setReason(""); }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={undo}
                  disabled={saving || !reason.trim()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Undo Renewal"}
                </button>
              </div>
            </div>
          )}

          {/* Activity */}
          {view === "list" && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Activity</p>
              {docLog.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">Nothing has been logged for this document yet.</p>
              ) : (
                <ol className="relative flex max-h-[40vh] flex-col gap-2.5 overflow-y-auto pl-5">
                  <span className="absolute bottom-2 left-[7px] top-2 w-px bg-gray-200" aria-hidden />
                  {docLog.map((l) => {
                    const look = l.action === "Corrected"
                      ? { label: "Corrected", Icon: PencilLine, dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700" }
                      : l.action === "Renewal undone"
                        ? { label: "Renewal undone", Icon: Undo2, dot: "bg-red-500", chip: "bg-red-50 text-red-700" }
                        : l.id === firstSetId
                          ? { label: "Added", Icon: FilePlus2, dot: "bg-gray-400", chip: "bg-gray-100 text-gray-600" }
                          : { label: "Renewed / updated", Icon: RotateCw, dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" };
                    return (
                      <li key={l.id} className="relative">
                        <span className={cn("absolute -left-5 top-2.5 h-3 w-3 rounded-full border-2 border-white", look.dot)} aria-hidden />
                        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", look.chip)}>
                              <look.Icon className="h-3 w-3" /> {look.label}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-400">
                              <User className="h-3 w-3" /> {l.actorName || "—"} · {formatDateTime(l.createdAt)}
                            </span>
                          </div>
                          {l.note && <p className="mt-1.5 whitespace-pre-line text-xs text-gray-600">{l.note}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      )}

      <FileViewer
        open={!!viewing}
        onClose={() => setViewing(null)}
        url={viewing ? complianceRecordsApi.fileUrl(viewing.id) : ""}
        title={viewing ? `${truck?.registrationNumber ?? ""} — ${viewing.docLabel}` : ""}
        filename={viewing?.fileName ?? undefined}
      />
    </Dialog>
  );
}

function ToolButton({ onClick, icon: Icon, label, danger, disabled }: {
  onClick: () => void; icon: typeof PencilLine; label: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
        danger ? "border-red-200 bg-white text-red-600 hover:bg-red-50" : "border-blue-200 bg-white text-blue-700 hover:bg-blue-50",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
