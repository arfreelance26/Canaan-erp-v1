"use client";

import { useEffect, useMemo, useState } from "react";
import { CompensationTable, type CompensationPerson } from "@/components/compensation/CompensationTable";
import { PaymentDialog } from "@/components/compensation/PaymentDialog";
import { TransactionHistoryDialog } from "@/components/compensation/TransactionHistoryDialog";
import { staffApi, financeApi } from "@/lib/api";
import type { Staff } from "@/types/staff";
import type { CompensationTransaction } from "@/types/compensation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search } from "lucide-react";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";

export default function StaffCompensationPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [transactions, setTransactions] = useState<CompensationTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentTarget, setPaymentTarget] = useState<CompensationPerson | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CompensationPerson | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
        Promise.all([staffApi.list(), financeApi.listStaffCompensation()])
          .then(([s, tx]) => {
            setStaffList(s);
            setTransactions(tx);
          })
          .finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("finance_updated", () => setRefreshKey(k => k + 1));


  const people: CompensationPerson[] = useMemo(
    () =>
      staffList.map((staff) => ({
        id: staff.id,
        photoUrl: staff.photoUrl,
        name: staff.name,
        status: "Active",
      })),
    [staffList]
  );

  function handlePaySalary(person: CompensationPerson) {
    setPaymentTarget(person);
  }

  async function handleSavePayment(payment: { amount: number; date: string; note: string }) {
    if (!paymentTarget) return;
    try {
      const created = await financeApi.addStaffCompensation(
        paymentTarget.id,
        "Salary",
        payment.amount,
        payment.date,
        payment.note
      );
      setTransactions((prev) => [...prev, created]);
      setPaymentTarget(null);
      showSuccess("Salary payment recorded successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to record salary payment.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  const filteredPeople = people.filter((p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Compensation</h1>
          <p className="mt-1 text-sm text-gray-500">Pay salaries to staff members</p>
        </div>
        <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
          />
        </div>
        <DownloadExcelButton path="/exports/staff-compensation" filename="staff_compensation.xlsx" />
        </div>
      </div>

      <CompensationTable
        people={filteredPeople}
        showAdvance={false}
        onPayAdvance={() => {}}
        onPaySalary={handlePaySalary}
        onViewHistory={setHistoryTarget}
        photoLabel="Staff Photo"
        nameLabel="Staff Name"
      />

      <PaymentDialog
        open={paymentTarget !== null}
        onClose={() => setPaymentTarget(null)}
        onSave={handleSavePayment}
        type="Salary"
        personName={paymentTarget?.name ?? ""}
      />

      <TransactionHistoryDialog
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
        personName={historyTarget?.name ?? ""}
        transactions={transactions.filter((transaction) => transaction.personId === historyTarget?.id)}
      />
    </div>
  );
}
