"use client";

import { useEffect, useMemo, useState } from "react";
import { CompensationTable, type CompensationPerson } from "@/components/compensation/CompensationTable";
import { PaymentDialog } from "@/components/compensation/PaymentDialog";
import { TransactionHistoryDialog } from "@/components/compensation/TransactionHistoryDialog";
import { staffApi, financeApi } from "@/lib/api";
import type { Staff } from "@/types/staff";
import type { CompensationTransaction } from "@/types/compensation";

export default function StaffCompensationPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [transactions, setTransactions] = useState<CompensationTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentTarget, setPaymentTarget] = useState<CompensationPerson | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CompensationPerson | null>(null);

  useEffect(() => {
    Promise.all([staffApi.list(), financeApi.listStaffCompensation()])
      .then(([s, tx]) => {
        setStaffList(s);
        setTransactions(tx);
      })
      .finally(() => setLoading(false));
  }, []);

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
    const created = await financeApi.addStaffCompensation(
      paymentTarget.id,
      "Salary",
      payment.amount,
      payment.date,
      payment.note
    );
    setTransactions((prev) => [...prev, created]);
    setPaymentTarget(null);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Staff Compensation</h1>
        <p className="mt-1 text-sm text-gray-500">Pay salaries to staff members</p>
      </div>

      <CompensationTable
        people={people}
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
