"use client";

import { useEffect, useMemo, useState } from "react";
import { RecurringPaymentsTable } from "@/components/finance/RecurringPaymentsTable";
import { financeApi } from "@/lib/api";
import type { RecurringPayment } from "@/types/finance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search } from "lucide-react";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function RecurringPaymentsPage() {
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
        financeApi.listRecurring().then(setPayments).catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("finance_updated", () => setRefreshKey(k => k + 1));


  const summary = useMemo(() => {
    let active = 0;
    let paused = 0;
    let monthlyTotal = 0;
    for (const payment of payments) {
      if (payment.status === "Active") {
        active += 1;
        if (payment.frequency === "Monthly") monthlyTotal += payment.amount;
        if (payment.frequency === "Quarterly") monthlyTotal += payment.amount / 3;
        if (payment.frequency === "Yearly") monthlyTotal += payment.amount / 12;
      } else {
        paused += 1;
      }
    }
    return { active, paused, monthlyTotal };
  }, [payments]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={3} columns={5} />;

  const filteredPayments = payments.filter((p) => !searchQuery || p.title?.toLowerCase().includes(searchQuery.toLowerCase()) || p.category?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track recurring expenses such as rent, insurance, and subscriptions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search payments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/recurring-payments" filename="recurring_payments.xlsx" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Active</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{summary.active}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Paused</p>
          <p className="mt-1 text-2xl font-bold text-gray-500">{summary.paused}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Est. Monthly Spend</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(summary.monthlyTotal)}</p>
        </div>
      </div>

      <RecurringPaymentsTable payments={filteredPayments} />
    </div>
  );
}
