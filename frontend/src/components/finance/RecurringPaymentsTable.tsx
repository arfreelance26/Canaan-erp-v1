"use client";

import { cn } from "@/lib/utils";
import type { RecurringPayment } from "@/types/finance";
import { formatDate } from "@/lib/format-date";

type RecurringPaymentsTableProps = {
  payments: RecurringPayment[];
};

const columns = ["Payment", "Category", "Amount", "Frequency", "Next Due Date", "Status"];

const statusStyles: Record<string, string> = {
  Active: "bg-green-50 text-green-700",
  Paused: "bg-gray-100 text-gray-500",
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
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No recurring payments yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[800px] text-left text-sm whitespace-nowrap">
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
          {payments.map((payment) => (
            <tr key={payment.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{payment.title}</td>
              <td className="px-4 py-3 text-gray-600">{payment.category}</td>
              <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(payment.amount)}</td>
              <td className="px-4 py-3 text-gray-600">{payment.frequency}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(payment.nextDueDate)}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    statusStyles[payment.status] ?? "bg-gray-100 text-gray-600"
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
