"use client";

import { RiEyeLine as Eye, RiLightbulbLine as Lightbulb, RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import type { EmiRecord } from "@/types/finance";
import { formatDate } from "@/lib/format-date";
import { paidInstallments } from "@/lib/emi-schedule";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
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
      <EmptyState size="compact" illustration="no-data" title={readOnly ? "No completed EMI entries" : "No EMI entries yet"} description={readOnly ? undefined : "Click “Add EMI Entry” to get started"} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1500px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-caption-1-semibold text-text-secondary"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <PagedTbody className="divide-y divide-separator-border" items={records}>
          {(record) => {
            const tenure = Number(record.tenureMonths) || 0;
            const emiAmt = Number(record.emiAmount) || 0;
            const paidMonths = paidInstallments(record, tenure);
            const amountPaid = paidMonths * emiAmt;
            const remainingAmount = (tenure - paidMonths) * emiAmt;
            return (
            <tr key={record.id} className={readOnly ? "bg-fill-1 text-text-tertiary" : "hover:bg-fill-2"}>
              <td className="px-4 py-3 font-medium text-text-primary">{record.emiName}</td>
              <td className="px-4 py-3 text-text-secondary">{record.truckRegistration}</td>
              <td className="px-4 py-3 text-text-secondary">{record.bankName}</td>
              <td className="px-4 py-3 font-medium text-text-primary">{formatCurrency(record.emiAmount)}</td>
              <td className="px-4 py-3 text-success-text">{formatCurrency(amountPaid)}</td>
              <td className="px-4 py-3 font-medium text-warning-text">{formatCurrency(remainingAmount)}</td>
              <td className="px-4 py-3 text-text-secondary">{record.tenureMonths} months</td>
              <td className="px-4 py-3 text-text-secondary">{formatDate(record.emiStartDate)}</td>
              <td className="px-4 py-3 text-text-secondary">{formatDate(record.emiEndDate)}</td>
              <td className="px-4 py-3 text-text-secondary">{formatDate(record.autoDebitDate)}</td>
              {showActions && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onView?.(record)}
                      className="flex items-center gap-1.5 rounded-lg border border-accent-border bg-accent-surface px-2.5 py-1.5 text-caption-1-semibold text-accent-text hover:bg-accent-surface-strong"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View EMI Record
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewInsights?.(record)}
                      className="flex items-center gap-1.5 rounded-lg border border-warning-border bg-warning-surface px-2.5 py-1.5 text-caption-1-semibold text-warning-text hover:bg-warning-surface-strong"
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
                          className="rounded-lg border border-separator-border p-1.5 text-text-secondary hover:bg-fill-2 hover:text-text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete?.(record.id)}
                          aria-label="Delete"
                          className="rounded-lg border border-danger-border p-1.5 text-danger-text hover:bg-danger-surface-strong"
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
          }}
        </PagedTbody>
      </table>
    </div>
    </div>
  );
}
