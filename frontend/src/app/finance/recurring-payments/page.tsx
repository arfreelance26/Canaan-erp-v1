"use client";

import { useEffect, useMemo, useState } from "react";
import { RecurringPaymentsTable } from "@/components/finance/RecurringPaymentsTable";
import { financeApi } from "@/lib/api";
import type { RecurringPayment } from "@/types/finance";

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

  useEffect(() => {
    financeApi.listRecurring().then(setPayments).finally(() => setLoading(false));
  }, []);

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

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Recurring Payments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track recurring expenses such as rent, insurance, and subscriptions
        </p>
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

      <RecurringPaymentsTable payments={payments} />
    </div>
  );
}
