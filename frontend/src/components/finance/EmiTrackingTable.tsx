"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { EmiRecord } from "@/types/finance";
import { formatDate, todayIst } from "@/lib/format-date";

type EmiTrackingTableProps = {
  records: EmiRecord[];
  onEdit?: (record: EmiRecord) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
};

const BASE_COLUMNS = [
  "EMI Name",
  "Truck Registration",
  "Loan Number",
  "Bank Name",
  "Loan Amount",
  "EMI Amount",
  "Tenure",
  "EMI Start Date",
  "EMI End Date",
  "Date of EMI Payment",
];

function formatCurrency(amount: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

type FilterType = "ALL" | "UPCOMING" | "OVERDUE";

export function EmiTrackingTable({ records, onEdit, onDelete, readOnly = false }: EmiTrackingTableProps) {
  const [filter, setFilter] = useState<FilterType>("ALL");
  const columns = readOnly ? BASE_COLUMNS : [...BASE_COLUMNS, "Actions"];
  
  const today = todayIst();

  const filteredRecords = records.filter((record) => {
    if (filter === "ALL") return true;
    if (!record.emiPaymentDate) return true; // Fallback for missing dates
    if (filter === "OVERDUE") return record.emiPaymentDate <= today;
    if (filter === "UPCOMING") return record.emiPaymentDate > today;
    return true;
  });

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        {readOnly ? "No completed EMI entries." : "No EMI entries yet. Click “Add EMI Entry” to get started."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            filter === "ALL"
              ? "bg-black text-white"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter("UPCOMING")}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            filter === "UPCOMING"
              ? "bg-emerald-600 text-white"
              : "bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50"
          }`}
        >
          Upcoming
        </button>
        <button
          type="button"
          onClick={() => setFilter("OVERDUE")}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            filter === "OVERDUE"
              ? "bg-red-600 text-white"
              : "bg-white text-red-600 border border-red-200 hover:bg-red-50"
          }`}
        >
          Overdue
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
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
            <tr key={record.id} className={readOnly ? "bg-gray-50/50 text-gray-400" : "hover:bg-gray-50"}>
              <td className="px-4 py-3 font-medium text-gray-700">{record.emiName}</td>
              <td className="px-4 py-3 text-gray-500">{record.truckRegistration}</td>
              <td className="px-4 py-3 text-gray-500">{record.loanNumber}</td>
              <td className="px-4 py-3 text-gray-500">{record.bankName}</td>
              <td className="px-4 py-3 text-gray-500">{formatCurrency(record.loanAmount)}</td>
              <td className="px-4 py-3 font-medium text-gray-700">{formatCurrency(record.emiAmount)}</td>
              <td className="px-4 py-3 text-gray-500">{record.tenureMonths} months</td>
              <td className="px-4 py-3 text-gray-500">{formatDate(record.emiStartDate)}</td>
              <td className="px-4 py-3 text-gray-500">{formatDate(record.emiEndDate)}</td>
              <td className="px-4 py-3 text-gray-500">{formatDate(record.emiPaymentDate)}</td>
              {!readOnly && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit?.(record)}
                      aria-label="Edit"
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete?.(record.id)}
                      aria-label="Delete"
                      className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
