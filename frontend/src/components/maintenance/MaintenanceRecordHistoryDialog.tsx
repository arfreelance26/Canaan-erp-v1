"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X, AlertTriangle, Paperclip } from "lucide-react";
import { MaintenanceProofsDialog } from "./MaintenanceProofsDialog";
import { Dialog } from "@/components/ui/Dialog";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";
import { maintenanceApi } from "@/lib/api";
import { showSuccess, showError } from "@/lib/swal";

type MaintenanceRecordHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
  records: MaintenanceRecord[];
  onDelete?: (recordId: string) => void;
};

const DATA_COLUMNS = [
  "Start Date", "End Date", "Maintenance Type", "Compliant", "Location", "Maintenance By",
  "Remarks", "Odometer (km)", "User Modified", "Source", "Cost", "Proof of Payment", "",
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Request Deletion</p>
              <p className="text-[11px] text-gray-500">Admin approval required</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Record summary */}
        <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Record to delete</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
            <span><span className="text-gray-400">Truck</span> {truckId}</span>
            <span><span className="text-gray-400">Date</span> {formatDate(record.date)}</span>
            <span><span className="text-gray-400">Type</span> {record.maintenanceType}</span>
            {record.compliant && <span><span className="text-gray-400">Compliant</span> {record.compliant}</span>}
            <span><span className="text-gray-400">Odometer</span> {Number(record.odometer).toLocaleString()} km</span>
            <span><span className="text-gray-400">Cost</span> ₹{Number(record.cost).toLocaleString()}</span>
            {record.enteredByName && <span><span className="text-gray-400">Entered by</span> {record.enteredByName}</span>}
            {record.source && <span><span className="text-gray-400">Source</span> {record.source}</span>}
          </div>
        </div>

        {/* Reason */}
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">
              Reason for deletion <span className="text-red-500">*</span>
            </label>
            <textarea
              ref={textareaRef}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this maintenance record needs to be deleted…"
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100 placeholder-gray-400"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!reason.trim() || submitting}
              className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
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

export function MaintenanceRecordHistoryDialog({ open, onClose, truck, records, onDelete }: MaintenanceRecordHistoryDialogProps) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  // Same date range + View (Excel/PDF) as every other page — the range filters
  // the table below and the export identically.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reasonRecord, setReasonRecord] = useState<MaintenanceRecord | null>(null);
  const [proofsRecord, setProofsRecord] = useState<MaintenanceRecord | null>(null);
  // Counts updated in place after a proof is deleted here (records come from the parent).
  const [proofCounts, setProofCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) { setFromDate(""); setToDate(""); }
  }, [open]);

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
    if (!window.confirm(`Delete this maintenance record (${record.maintenanceType} · ${formatDate(record.date)})? This cannot be undone.`)) return;
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            <span>{filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"}</span>
            {filteredRecords.length > 0 && (
              <span>
                Total:{" "}
                <span className="tabular-nums text-blue-600">
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

        {/* ── Table ── */}
        {filteredRecords.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No maintenance records found for this period.
          </p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[700px] whitespace-nowrap text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <tr>
                  {DATA_COLUMNS.map((col, i) => (
                    <th
                      key={i}
                      className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="bg-white transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">
                      {formatDate(record.date)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">
                      {record.maintenanceEndDate ? formatDate(record.maintenanceEndDate) : <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {record.maintenanceType}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {record.compliant || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {record.maintenanceLocation || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {record.maintenanceBy || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {record.description || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">
                      {Number(record.odometer).toLocaleString("en-IN")} km
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {record.enteredByName || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {record.source || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-blue-700">
                      ₹{Number(record.cost).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5">
                      {(proofCounts[record.id] ?? record.proofCount ?? 0) > 0 ? (
                        <button
                          type="button"
                          onClick={() => setProofsRecord(record)}
                          className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                        >
                          <Paperclip className="h-3 w-3" />
                          {proofCounts[record.id] ?? record.proofCount} file{(proofCounts[record.id] ?? record.proofCount) === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <span className="italic text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        title={isAdmin ? "Delete" : "Request deletion"}
                        disabled={deletingId === record.id}
                        onClick={() => isAdmin ? handleAdminDelete(record) : setReasonRecord(record)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
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
