"use client";

import { cn } from "@/lib/utils";
import type { RecurringPayment } from "@/types/finance";
import { formatDate } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
type RecurringPaymentsTableProps = {
  payments: RecurringPayment[];
};

const columns = ["Payment", "Category", "Amount", "Frequency", "Next Due Date", "Status"];

const statusStyles: Record<string, string> = {
  Active: "bg-success-surface text-success-text",
  Paused: "bg-fill-2 text-text-secondary",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}


export function RecurringPaymentsTable({ payments }: RecurringPaymentsTableProps) {
  if (payments.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No recurring payments yet" />
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[800px] text-left text-sm whitespace-nowrap">
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
        <tbody className="divide-y divide-separator-border">
          {payments.map((payment) => (
            <tr key={payment.id} className="hover:bg-fill-2">
              <td className="px-4 py-3 font-medium text-text-primary">{payment.title}</td>
              <td className="px-4 py-3 text-text-secondary">{payment.category}</td>
              <td className="px-4 py-3 font-medium text-text-primary">{formatCurrency(payment.amount)}</td>
              <td className="px-4 py-3 text-text-secondary">{payment.frequency}</td>
              <td className="px-4 py-3 text-text-secondary">{formatDate(payment.nextDueDate)}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-caption-1-medium",
                    statusStyles[payment.status] ?? "bg-fill-2 text-text-secondary"
                  )}
                >
                  {payment.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
