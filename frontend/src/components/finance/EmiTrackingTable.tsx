"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { EmiRecord } from "@/types/finance";

type EmiTrackingTableProps = {
  records: EmiRecord[];
  onEdit: (record: EmiRecord) => void;
  onDelete: (id: string) => void;
};

const columns = [
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
  "Actions",
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

function formatDate(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EmiTrackingTable({ records, onEdit, onDelete }: EmiTrackingTableProps) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No EMI entries yet. Click &ldquo;Add EMI Entry&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1200px] text-left text-sm">
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
          {records.map((record) => (
            <tr key={record.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{record.emiName}</td>
              <td className="px-4 py-3 text-gray-600">{record.truckRegistration}</td>
              <td className="px-4 py-3 text-gray-600">{record.loanNumber}</td>
              <td className="px-4 py-3 text-gray-600">{record.bankName}</td>
              <td className="px-4 py-3 text-gray-600">{formatCurrency(record.loanAmount)}</td>
              <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(record.emiAmount)}</td>
              <td className="px-4 py-3 text-gray-600">{record.tenureMonths} months</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(record.emiStartDate)}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(record.emiEndDate)}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(record.emiPaymentDate)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(record)}
                    aria-label="Edit"
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(record.id)}
                    aria-label="Delete"
                    className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
