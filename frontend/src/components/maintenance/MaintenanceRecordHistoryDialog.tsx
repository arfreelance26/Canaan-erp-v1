"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiCloseLine as X, RiAlertLine as AlertTriangle, RiAttachment2 as Paperclip, RiTimeLine as Clock } from "@remixicon/react";
import { MaintenanceProofsDialog } from "./MaintenanceProofsDialog";
import { MaintenanceRecordFormDialog } from "./MaintenanceRecordFormDialog";
import { Dialog } from "@/components/ui/Dialog";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";
import { editApprovalsApi, maintenanceApi, maintenanceRecordChanges, maintenanceRequestsApi } from "@/lib/api";
import type { MaintenanceRequest } from "@/types/maintenance-request";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { showSuccess, showError, confirm } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
type MaintenanceRecordHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
  records: MaintenanceRecord[];
  onDelete?: (recordId: string) => void;
  /** Called with the saved record after an Admin's direct edit. */
  onUpdate?: (record: MaintenanceRecord) => void;
};

const DATA_COLUMNS = [
  "Start Date", "End Date", "Maintenance Type", "Compliant", "Location", "Maintenance By",
  "Invoice No.", "Invoice Date", "Remarks", "Odometer (km)", "User Modified", "Source", "Cost", "Proof of Payment", "",
];

// ---------------------------------------------------------------------------
// Deletion reason dialog (non-admin flow)
// ---------------------------------------------------------------------------

function DeletionReasonDialog({
  record,
  truckId,
  onClose,
  onSubmit,
}: {
  record: MaintenanceRecord;
  truckId: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err: any) {
      showError(err?.message ?? "Failed to submit deletion request. Please try again.");
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-scrim/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background-primary-default shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-separator-border bg-warning-surface px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-solid text-on-solid">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-body-semibold text-text-primary">Request Deletion</p>
              <p className="text-[11px] text-text-secondary">Admin approval required</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-separator-border p-1.5 text-text-tertiary hover:bg-fill-3 hover:text-text-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Record summary */}
        <div className="bg-fill-1 border-b border-separator-border px-5 py-3">
          <p className="text-caption-2-semibold text-text-tertiary mb-1.5">Record to delete</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-primary">
            <span><span className="text-text-tertiary">Truck</span> {truckId}</span>
            <span><span className="text-text-tertiary">Date</span> {formatDate(record.date)}</span>
            <span><span className="text-text-tertiary">Type</span> {record.maintenanceType}</span>
            {record.compliant && <span><span className="text-text-tertiary">Compliant</span> {record.compliant}</span>}
            <span><span className="text-text-tertiary">Odometer</span> {Number(record.odometer).toLocaleString()} km</span>
            <span><span className="text-text-tertiary">Cost</span> ₹{Number(record.cost).toLocaleString()}</span>
            {record.enteredByName && <span><span className="text-text-tertiary">Entered by</span> {record.enteredByName}</span>}
            {record.source && <span><span className="text-text-tertiary">Source</span> {record.source}</span>}
          </div>
        </div>

        {/* Reason */}
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-body-semibold text-text-primary">
              Reason for deletion <span className="text-danger-text">*</span>
            </label>
            <textarea
              ref={textareaRef}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this maintenance record needs to be deleted…"
              className="w-full resize-none rounded-xl border border-separator-border bg-fill-1 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-warning-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-warning-border placeholder-text-placeholder"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-separator-border px-4 py-2 text-body-semibold text-text-secondary hover:bg-fill-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!reason.trim() || submitting}
              className="rounded-lg bg-warning-solid px-5 py-2 text-body-semibold text-on-solid hover:bg-warning-solid-hover disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function MaintenanceRecordHistoryDialog({ open, onClose, truck, records, onDelete, onUpdate }: MaintenanceRecordHistoryDialogProps) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  // Same date range + View (Excel/PDF) as every other page — the range filters
  // the table below and the export identically.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reasonRecord, setReasonRecord] = useState<MaintenanceRecord | null>(null);
  const [proofsRecord, setProofsRecord] = useState<MaintenanceRecord | null>(null);
  // Edit: Admins save directly; everyone else raises an Edit Request.
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // Counts updated in place after a proof is deleted here (records come from the parent).
  const [proofCounts, setProofCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) { setFromDate(""); setToDate(""); }
  }, [open]);

  // Submitted but not yet approved — shown above the records so nobody thinks
  // an entry was lost and enters it twice. Not counted in the total.
  const [pending, setPending] = useState<MaintenanceRequest[]>([]);
  const [pendingProofs, setPendingProofs] = useState<MaintenanceRequest | null>(null);
  const truckDbId = truck?.id;
  const loadPending = useCallback(() => {
    if (!open || !truckDbId) return;
    maintenanceRequestsApi.list({ status: "Pending", truckId: truckDbId }).then(setPending).catch(() => {});
  }, [open, truckDbId]);
  useEffect(() => {
    setPending([]);
    loadPending();
  }, [loadPending]);
  useWebSocketEvent("maintenance_request_updated", loadPending);

  const truckRecords = useMemo(() => {
    if (!truck) return [];
    return records
      .filter((r) => r.truckId === truck.id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [records, truck]);

  // Dates are YYYY-MM-DD, so plain string comparison is a correct date comparison.
  const filteredRecords = useMemo(
    () => truckRecords.filter((r) => (!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate)),
    [truckRecords, fromDate, toDate],
  );

  const totalCost = useMemo(
    () => filteredRecords.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0),
    [filteredRecords]
  );

  if (!truck) return null;

  async function handleAdminDelete(record: MaintenanceRecord) {
    if (!(await confirm({ title: `Delete this maintenance record?`, description: `${record.maintenanceType} · ${formatDate(record.date)}. This can't be undone`, confirmLabel: "Delete", tone: "danger" }))) return;
    setDeletingId(record.id);
    try {
      await maintenanceApi.deleteRecord(record.id);
      showSuccess("Maintenance record deleted.");
      onDelete?.(record.id);
    } catch (err: any) {
      showError(err.message ?? "Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSaveEdit(updated: MaintenanceRecord, _proofs: File[], reason?: string) {
    if (!truck || !editingRecord || savingEdit) return;
    setSavingEdit(true);
    try {
      if (isAdmin) {
        const saved = await maintenanceApi.updateRecord(editingRecord.id, updated);
        onUpdate?.({ ...saved, proofCount: proofCounts[editingRecord.id] ?? editingRecord.proofCount });
        showSuccess("Maintenance record updated.");
      } else {
        await editApprovalsApi.create({
          resourceType: "MaintenanceRecord",
          resourceId: parseInt(editingRecord.id),
          resourceName: `Maintenance — ${truck.registrationNumber} · ${editingRecord.maintenanceType} · ${formatDate(editingRecord.date)}`,
          action: "Edit",
          reason: reason ?? "",
          proposedChanges: maintenanceRecordChanges(updated),
        });
        showSuccess("Edit request submitted. The change is applied once an Admin approves it.");
      }
      setEditingRecord(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save the changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRequestDeletion(record: MaintenanceRecord, reason: string) {
    if (!truck) return;
    const resourceName = `Maintenance — ${truck.truckId} · ${record.maintenanceType} · ${formatDate(record.date)}`;
    await maintenanceApi.requestDeletion({
      resource_id: parseInt(record.id),
      resource_name: resourceName,
      log_details: {
        truck_id: truck.truckId,
        date: record.date,
        maintenance_end_date: record.maintenanceEndDate,
        maintenance_type: record.maintenanceType,
        compliant: record.compliant,
        maintenance_location: record.maintenanceLocation,
        maintenance_by: record.maintenanceBy,
        invoice_number: record.invoiceNumber || null,
        invoice_date: record.invoiceDate || null,
        description: record.description,
        odometer: record.odometer,
        cost: record.cost,
        entered_by_name: record.enteredByName,
        source: record.source,
      },
      reason,
    });
    showSuccess("Deletion request submitted. Awaiting admin approval.");
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={`Maintenance Record — ${truck.registrationNumber}`}
        className="max-w-5xl"
      >
        {/* ── Toolbar: count + total on the left, date range + View on the right ── */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption-2-semibold text-text-tertiary">
            <span>{filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"}</span>
            {filteredRecords.length > 0 && (
              <span>
                Total:{" "}
                <span className="tabular-nums text-accent-text">
                  ₹{totalCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePill from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
            <DownloadExcelButton
              path="/exports/maintenance-records"
              filename={`maintenance_records_${truck.registrationNumber}.xlsx`}
              title={`Maintenance Records — ${truck.registrationNumber}`}
              params={{
                truck_id: truck.id,
                ...(fromDate ? { from_date: fromDate } : {}),
                ...(toDate ? { to_date: toDate } : {}),
              }}
            />
          </div>
        </div>

        {pending.length > 0 && (
          <div className="mb-3 rounded-xl border border-warning-border bg-warning-surface/60 px-4 py-3">
            <p className="mb-2 flex items-center gap-1.5 text-caption-2-semibold text-warning-text">
              <Clock className="h-3 w-3" /> Pending approval ({pending.length}) · not counted yet
            </p>
            <ul className="flex flex-col gap-1.5">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-background-primary-default px-3 py-2 text-xs ring-1 ring-warning-border">
                  <span className="tabular-nums text-text-secondary">{formatDate(r.date)}</span>
                  <span className="font-medium text-text-primary">{r.maintenanceType}{r.repairType ? ` · ${r.repairType}` : ""}</span>
                  <span className="tabular-nums font-semibold text-text-primary">
                    ₹{r.cost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-text-secondary">
                    by {r.submittedByName}{r.source === "Trip Sheet" ? ` · Trip Sheet${r.tripIdStr ? ` ${r.tripIdStr}` : ""}` : ""}
                  </span>
                  {r.proofCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPendingProofs(r)}
                      className="flex items-center gap-1 rounded-full border border-accent-border bg-accent-surface px-2 py-0.5 font-semibold text-accent-text transition-colors hover:bg-accent-surface-strong"
                    >
                      <Paperclip className="h-3 w-3" /> {r.proofCount}
                    </button>
                  )}
                  <span className="ml-auto rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-2-semibold text-warning-text">Awaiting Admin / Accounts</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Table ── */}
        {filteredRecords.length === 0 ? (
          <EmptyState size="compact" illustration="no-data" title="No maintenance records found for this period" />
        ) : (
          <div className="max-h-72 overflow-auto rounded-xl border border-separator-border">
            <table className="w-full min-w-[700px] whitespace-nowrap text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-separator-border bg-fill-1">
                <tr>
                  {DATA_COLUMNS.map((col, i) => (
                    <th
                      key={i}
                      className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={filteredRecords}>
                {(record) => (
                  <tr
                    key={record.id}
                    className="bg-background-primary-default transition-colors hover:bg-fill-2"
                  >
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                      {formatDate(record.date)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                      {record.maintenanceEndDate ? formatDate(record.maintenanceEndDate) : <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-text-primary">
                      {record.maintenanceType}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {record.compliant || <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {record.maintenanceLocation || <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {record.maintenanceBy || <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {record.invoiceNumber || <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                      {record.invoiceDate ? formatDate(record.invoiceDate) : <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {record.description || <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                      {Number(record.odometer).toLocaleString("en-IN")} km
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {record.enteredByName || <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {record.source || <span className="italic text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-accent-text">
                      ₹{Number(record.cost).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5">
                      {(proofCounts[record.id] ?? record.proofCount ?? 0) > 0 ? (
                        <button
                          type="button"
                          onClick={() => setProofsRecord(record)}
                          className="flex items-center gap-1 rounded-full border border-accent-border bg-accent-surface px-2.5 py-0.5 text-caption-1-semibold text-accent-text transition-colors hover:bg-accent-surface-strong"
                        >
                          <Paperclip className="h-3 w-3" />
                          {proofCounts[record.id] ?? record.proofCount} file{(proofCounts[record.id] ?? record.proofCount) === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <span className="italic text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        title={isAdmin ? "Edit" : "Request edit"}
                        onClick={() => setEditingRecord(record)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-accent-surface-strong hover:text-accent-text transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title={isAdmin ? "Delete" : "Request deletion"}
                        disabled={deletingId === record.id}
                        onClick={() => isAdmin ? handleAdminDelete(record) : setReasonRecord(record)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-danger-surface-strong hover:text-danger-text transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      </div>
                    </td>
                  </tr>
                )}
              </PagedTbody>
            </table>
          </div>
        )}
      </Dialog>

      <MaintenanceProofsDialog
        open={proofsRecord !== null}
        recordId={proofsRecord?.id ?? null}
        subtitle={proofsRecord ? `${proofsRecord.maintenanceType} · ${formatDate(proofsRecord.date)}` : undefined}
        canDelete={isAdmin}
        onClose={() => setProofsRecord(null)}
        onCountChange={(n) => proofsRecord && setProofCounts((prev) => ({ ...prev, [proofsRecord.id]: n }))}
      />

      <MaintenanceProofsDialog
        open={pendingProofs !== null}
        recordId={pendingProofs?.id ?? null}
        source="request"
        subtitle={pendingProofs ? `${pendingProofs.maintenanceType} · ${formatDate(pendingProofs.date)} · pending approval` : undefined}
        canDelete={false}
        onClose={() => setPendingProofs(null)}
      />

      <MaintenanceRecordFormDialog
        open={editingRecord !== null}
        onClose={() => setEditingRecord(null)}
        onSave={handleSaveEdit}
        truck={truck}
        saving={savingEdit}
        editRecord={editingRecord}
        requireReason={!isAdmin}
      />

      {reasonRecord && (
        <DeletionReasonDialog
          record={reasonRecord}
          truckId={truck.truckId}
          onClose={() => setReasonRecord(null)}
          onSubmit={(reason) => handleRequestDeletion(reasonRecord, reason)}
        />
      )}
    </>
  );
}
