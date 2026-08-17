"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, SlidersHorizontal } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";
import { todayIst } from "@/lib/format-date";
import { formatDate } from "@/lib/format-date";

type MaintenanceRecordHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
  records: MaintenanceRecord[];
};

const columns = ["Date", "Odometer", "Maintenance Type", "Description", "Cost"];

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

export function MaintenanceRecordHistoryDialog({ open, onClose, truck, records }: MaintenanceRecordHistoryDialogProps) {
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");

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

  function handlePrint() {
    if (!truck) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = filteredRecords
      .map((r) => `<tr>
        <td>${formatDate(r.date)}</td>
        <td>${Number(r.odometer).toLocaleString()} km</td>
        <td>${r.maintenanceType}</td>
        <td>${r.description}</td>
        <td>₹${Number(r.cost).toLocaleString()}</td>
      </tr>`)
      .join("");

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
            <thead><tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
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
    <Dialog
      open={open}
      onClose={onClose}
      title={`Maintenance Record — ${truck.registrationNumber}`}
      className="max-w-3xl"
    >
      {/* ── Filter toolbar ── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
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
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">From</span>
                <DatePickerInput value={customFrom} onChange={setCustomFrom} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">To</span>
                <DatePickerInput value={customTo} onChange={setCustomTo} className={inputClass} />
              </label>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
      </div>

      {/* ── Record count + total ── */}
      {filteredRecords.length > 0 && (
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Total:{" "}
            <span className="tabular-nums text-blue-600 dark:text-blue-400">
              ₹{totalCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </p>
        </div>
      )}

      {/* ── Table ── */}
      {filteredRecords.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
          No maintenance records found for this period.
        </p>
      ) : (
        <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[600px] whitespace-nowrap text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {filteredRecords.map((record) => (
                <tr
                  key={record.id}
                  className="bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                    {formatDate(record.date)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                    {Number(record.odometer).toLocaleString("en-IN")} km
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                    {record.maintenanceType}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                    {record.description || <span className="italic text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold text-blue-700 dark:text-blue-400">
                    ₹{Number(record.cost).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
