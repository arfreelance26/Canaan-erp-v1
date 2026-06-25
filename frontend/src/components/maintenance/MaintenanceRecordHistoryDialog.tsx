"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { inputClass } from "@/components/ui/Field";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";

type MaintenanceRecordHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
  records: MaintenanceRecord[];
};

const columns = ["Date", "Odometer", "Maintenance Type", "Description", "Cost"];

const DATE_FILTER_OPTIONS = [
  { id: "all", label: "All Time" },
  { id: "month", label: "This Month" },
  { id: "3months", label: "Past 3 Months" },
  { id: "6months", label: "Past 6 Months" },
  { id: "year", label: "Past Year" },
  { id: "custom", label: "Custom Range" },
] as const;

type DateFilter = (typeof DATE_FILTER_OPTIONS)[number]["id"];

function getDateRange(filter: DateFilter, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();

  switch (filter) {
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case "3months": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      return { from, to: now };
    }
    case "6months": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 6);
      return { from, to: now };
    }
    case "year": {
      const from = new Date(now);
      from.setFullYear(from.getFullYear() - 1);
      return { from, to: now };
    }
    case "custom":
      return {
        from: customFrom ? new Date(customFrom) : null,
        to: customTo ? new Date(customTo) : null,
      };
    default:
      return { from: null, to: null };
  }
}

export function MaintenanceRecordHistoryDialog({ open, onClose, truck, records }: MaintenanceRecordHistoryDialogProps) {
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (open) {
      setDateFilter("all");
      setCustomFrom("");
      setCustomTo("");
    }
  }, [open]);

  const truckRecords = useMemo(() => {
    if (!truck) return [];
    return records
      .filter((record) => record.truckId === truck.id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [records, truck]);

  const filteredRecords = useMemo(() => {
    if (dateFilter === "all") return truckRecords;
    const { from, to } = getDateRange(dateFilter, customFrom, customTo);
    return truckRecords.filter((record) => {
      const recordDate = new Date(record.date);
      if (from && recordDate < from) return false;
      if (to && recordDate > to) return false;
      return true;
    });
  }, [truckRecords, dateFilter, customFrom, customTo]);

  if (!truck) return null;

  function handlePrint() {
    if (!truck) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = filteredRecords
      .map(
        (record) => `<tr>
          <td>${record.date}</td>
          <td>${Number(record.odometer).toLocaleString()} km</td>
          <td>${record.maintenanceType}</td>
          <td>${record.description}</td>
          <td>₹${Number(record.cost).toLocaleString()}</td>
        </tr>`
      )
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
          <p>Generated on ${new Date().toLocaleDateString()}</p>
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">Filter by date</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className={inputClass}
            >
              {DATE_FILTER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {dateFilter === "custom" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">From</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">To</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={inputClass}
                />
              </label>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {filteredRecords.length === 0 ? (
        <p className="text-sm text-gray-500">No maintenance records found for this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 text-gray-600">{record.date}</td>
                  <td className="px-4 py-3 text-gray-600">{Number(record.odometer).toLocaleString()} km</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{record.maintenanceType}</td>
                  <td className="px-4 py-3 text-gray-600">{record.description}</td>
                  <td className="px-4 py-3 text-gray-600">₹{Number(record.cost).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
