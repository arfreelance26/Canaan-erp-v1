"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, SlidersHorizontal, Trash2, X, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";
import { todayIst, formatDate } from "@/lib/format-date";
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
  "Remarks", "Odometer (km)", "User Modified", "Source", "Cost", "",
];

const DATE_FILTER_OPTIONS = [
  { id: "all",      label: "All Time" },
  { id: "month",    label: "This Month" },
  { id: "3months",  label: "Past 3 Months" },
  { id: "6months",  label: "Past 6 Months" },
  { id: "year",     label: "Past Year" },
  { id: "custom",   label: "Custom Range" },
] as const;

type DateFilter = (typeof DATE_FILTER_OPTIONS)[number]["id"];

function getDateRange(filter: DateFilter, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (filter) {
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case "3months": {
      const from = new Date(now); from.setMonth(from.getMonth() - 3); return { from, to: now };
    }
    case "6months": {
      const from = new Date(now); from.setMonth(from.getMonth() - 6); return { from, to: now };
    }
    case "year": {
      const from = new Date(now); from.setFullYear(from.getFullYear() - 1); return { from, to: now };
    }
    case "custom":
      return {
        from: customFrom ? new Date(customFrom) : null,
        to:   customTo   ? new Date(customTo)   : null,
      };
    default:
      return { from: null, to: null };
  }
}

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

  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reasonRecord, setReasonRecord] = useState<MaintenanceRecord | null>(null);

  useEffect(() => {
    if (open) { setDateFilter("all"); setCustomFrom(""); setCustomTo(""); }
  }, [open]);

  const truckRecords = useMemo(() => {
    if (!truck) return [];
    return records
      .filter((r) => r.truckId === truck.id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [records, truck]);

  const filteredRecords = useMemo(() => {
    if (dateFilter === "all") return truckRecords;
    const { from, to } = getDateRange(dateFilter, customFrom, customTo);
    return truckRecords.filter((r) => {
      const d = new Date(r.date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }, [truckRecords, dateFilter, customFrom, customTo]);

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

  function handlePrint() {
    if (!truck) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = filteredRecords
      .map((r) => `<tr>
        <td>${formatDate(r.date)}</td>
        <td>${r.maintenanceEndDate ? formatDate(r.maintenanceEndDate) : "—"}</td>
        <td>${r.maintenanceType}</td>
        <td>${r.compliant || "—"}</td>
        <td>${r.maintenanceLocation || "—"}</td>
        <td>${r.maintenanceBy || "—"}</td>
        <td>${r.description || "—"}</td>
        <td>${Number(r.odometer).toLocaleString()} km</td>
        <td>${r.enteredByName || "—"}</td>
        <td>${r.source || "—"}</td>
        <td>₹${Number(r.cost).toLocaleString()}</td>
      </tr>`)
      .join("");

    const printCols = [
      "Start Date", "End Date", "Maintenance Type", "Compliant", "Location", "Maintenance By",
      "Remarks", "Odometer (km)", "User Modified", "Source", "Cost",
    ];
    printWindow.document.write(`
      <html>
        <head>
          <title>Maintenance Record - ${truck.registrationNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            p { font-size: 12px; color: #6b7280; margin-top: 0; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f3f4f6; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <h1>Maintenance Record &mdash; ${truck.registrationNumber}</h1>
          <p>Generated on ${todayIst()}</p>
          <table>
            <thead><tr>${printCols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={`Maintenance Record — ${truck.registrationNumber}`}
        className="max-w-5xl"
      >
        {/* ── Filter toolbar ── */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Filter
            </span>
          </div>

          <div className="flex flex-1 flex-wrap items-end gap-3">
            <GlassSelect
              value={dateFilter}
              onChange={(val) => setDateFilter(val as DateFilter)}
              options={DATE_FILTER_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            />

            {dateFilter === "custom" && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">From</span>
                  <DatePickerInput value={customFrom} onChange={setCustomFrom} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">To</span>
                  <DatePickerInput value={customTo} onChange={setCustomTo} className={inputClass} />
                </label>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>

        {/* ── Record count + total ── */}
        {filteredRecords.length > 0 && (
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Total:{" "}
              <span className="tabular-nums text-blue-600">
                ₹{totalCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
          </div>
        )}

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
