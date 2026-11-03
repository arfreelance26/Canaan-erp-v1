"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import type { CompensationTransaction, CompensationTransactionType } from "@/types/compensation";
import { formatDate } from "@/lib/format-date";

type TransactionHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  personName: string;
  transactions: CompensationTransaction[];
  showTypeFilters?: boolean;
};

type FilterValue = "All" | CompensationTransactionType;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}


export function TransactionHistoryDialog({
  open,
  onClose,
  personName,
  transactions,
  showTypeFilters,
}: TransactionHistoryDialogProps) {
  const [filter, setFilter] = useState<FilterValue>("All");

  const filteredTransactions = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (filter === "All") return sorted;
    return sorted.filter((transaction) => transaction.type === filter);
  }, [transactions, filter]);

  return (
    <Dialog open={open} onClose={onClose} title={`Transaction History - ${personName}`}>
      <div className="flex flex-col gap-4">
        {showTypeFilters && (
          <div className="flex flex-wrap gap-2">
            {(["All", "Advance", "Salary"] as FilterValue[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-body-medium shadow-sm transition",
                  filter === value
                    ? "bg-accent-solid text-on-solid"
                    : "border border-separator-border bg-background-primary-default text-text-secondary hover:border-border-button-default hover:bg-fill-2"
                )}
              >
                {value}
              </button>
            ))}
          </div>
        )}

        {filteredTransactions.length === 0 ? (
          <div className="rounded-xl border border-separator-border bg-background-primary-default p-6 text-center text-sm text-text-secondary">
            No transactions yet.
          </div>
        ) : (
          <div className="overflow-auto max-h-72 rounded-xl border border-separator-border bg-background-primary-default">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-separator-border bg-fill-1">
                  <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                    Date
                  </th>
                  <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                    Type
                  </th>
                  <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                    Amount
                  </th>
                  {showTypeFilters && (
                    <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                      Trip Number
                    </th>
                  )}
                  <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-fill-2">
                    <td className="px-4 py-3 text-text-secondary">{formatDate(transaction.date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-caption-1-medium",
                          transaction.type === "Advance"
                            ? "bg-warning-surface text-warning-text"
                            : "bg-success-surface text-success-text"
                        )}
                      >
                        {transaction.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {formatCurrency(transaction.amount)}
                    </td>
                    {showTypeFilters && (
                      <td className="px-4 py-3 text-text-secondary">{transaction.tripNumber || "—"}</td>
                    )}
                    <td className="px-4 py-3 text-text-secondary">{transaction.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-interactive rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-primary transition duration-200 hover:bg-fill-2"
          >
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
