"use client";

import { Eye, Lightbulb, Pencil, Trash2 } from "lucide-react";
import type { EmiRecord } from "@/types/finance";
import { formatDate } from "@/lib/format-date";
import { paidInstallments } from "@/lib/emi-schedule";

type EmiTrackingTableProps = {
  records: EmiRecord[];
  onView?: (record: EmiRecord) => void;
  onViewInsights?: (record: EmiRecord) => void;
  onEdit?: (record: EmiRecord) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
};

const BASE_COLUMNS = [
  "EMI Name",
  "Truck Registration",
  "Bank Name",
  "EMI Amount",
  "Amount Paid",
  "Remaining EMI Payable",
  "Tenure",
  "EMI Start Date",
  "EMI End Date",
  "Auto-Debit Date",
];

function formatCurrency(amount: string | number): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return String(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function EmiTrackingTable({ records, onView, onViewInsights, onEdit, onDelete, readOnly = false }: EmiTrackingTableProps) {
  const showActions = !readOnly || !!onView;
  const columns = showActions ? [...BASE_COLUMNS, "Actions"] : BASE_COLUMNS;

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        {readOnly ? "No completed EMI entries." : "No EMI entries yet. Click “Add EMI Entry” to get started."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1500px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
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
          {records.map((record) => {
            const tenure = Number(record.tenureMonths) || 0;
            const emiAmt = Number(record.emiAmount) || 0;
            const paidMonths = paidInstallments(record, tenure);
            const amountPaid = paidMonths * emiAmt;
            const remainingAmount = (tenure - paidMonths) * emiAmt;
            return (
            <tr key={record.id} className={readOnly ? "bg-gray-50/50 text-gray-400" : "hover:bg-gray-50"}>
              <td className="px-4 py-3 font-medium text-gray-700">{record.emiName}</td>
              <td className="px-4 py-3 text-gray-500">{record.truckRegistration}</td>
              <td className="px-4 py-3 text-gray-500">{record.bankName}</td>
              <td className="px-4 py-3 font-medium text-gray-700">{formatCurrency(record.emiAmount)}</td>
              <td className="px-4 py-3 text-emerald-700">{formatCurrency(amountPaid)}</td>
              <td className="px-4 py-3 font-medium text-amber-700">{formatCurrency(remainingAmount)}</td>
              <td className="px-4 py-3 text-gray-500">{record.tenureMonths} months</td>
              <td className="px-4 py-3 text-gray-500">{formatDate(record.emiStartDate)}</td>
              <td className="px-4 py-3 text-gray-500">{formatDate(record.emiEndDate)}</td>
              <td className="px-4 py-3 text-gray-500">{formatDate(record.autoDebitDate)}</td>
              {showActions && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onView?.(record)}
                      className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View EMI Record
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewInsights?.(record)}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                      View Insights
                    </button>
                    {!readOnly && (
                      <>
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
                      </>
                    )}
                  </div>
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
