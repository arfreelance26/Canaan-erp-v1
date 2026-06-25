"use client";

import { useEffect, useMemo, useState } from "react";
import { CompensationTable, type CompensationPerson } from "@/components/compensation/CompensationTable";
import { PaymentDialog } from "@/components/compensation/PaymentDialog";
import { TransactionHistoryDialog } from "@/components/compensation/TransactionHistoryDialog";
import { driversApi, tripsApi, financeApi } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { Trip } from "@/types/trip";
import type { CompensationTransaction, CompensationTransactionType } from "@/types/compensation";

export default function DriverCompensationPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [transactions, setTransactions] = useState<CompensationTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentTarget, setPaymentTarget] = useState<CompensationPerson | null>(null);
  const [paymentType, setPaymentType] = useState<CompensationTransactionType>("Salary");
  const [historyTarget, setHistoryTarget] = useState<CompensationPerson | null>(null);

  useEffect(() => {
    Promise.all([driversApi.list(), tripsApi.list(), financeApi.listDriverCompensation()])
      .then(([d, t, tx]) => {
        setDrivers(d);
        setTrips(t);
        setTransactions(tx);
      })
      .finally(() => setLoading(false));
  }, []);

  const people: CompensationPerson[] = useMemo(
    () =>
      drivers.map((driver) => ({
        id: driver.id,
        photoUrl: driver.photoUrl,
        name: driver.name,
        status: "Active",
      })),
    [drivers]
  );

  function handlePayAdvance(person: CompensationPerson) {
    setPaymentTarget(person);
    setPaymentType("Advance");
  }

  function handlePaySalary(person: CompensationPerson) {
    setPaymentTarget(person);
    setPaymentType("Salary");
  }

  const tripNumbers = useMemo(() => trips.map((trip) => trip.tripId), [trips]);

  async function handleSavePayment(payment: { amount: number; date: string; note: string; tripNumber?: string }) {
    if (!paymentTarget) return;
    const created = await financeApi.addDriverCompensation(
      paymentTarget.id,
      paymentType,
      payment.amount,
      payment.date,
      payment.note,
      payment.tripNumber
    );
    setTransactions((prev) => [...prev, created]);
    setPaymentTarget(null);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Driver Compensation</h1>
        <p className="mt-1 text-sm text-gray-500">Pay advances and salaries to drivers</p>
      </div>

      <CompensationTable
        people={people}
        showAdvance
        onPayAdvance={handlePayAdvance}
        onPaySalary={handlePaySalary}
        onViewHistory={setHistoryTarget}
        photoLabel="Driver Photo"
        nameLabel="Driver Name"
      />

      <PaymentDialog
        open={paymentTarget !== null}
        onClose={() => setPaymentTarget(null)}
        onSave={handleSavePayment}
        type={paymentType}
        personName={paymentTarget?.name ?? ""}
        tripNumbers={tripNumbers}
      />

      <TransactionHistoryDialog
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
        personName={historyTarget?.name ?? ""}
        transactions={transactions.filter((transaction) => transaction.personId === historyTarget?.id)}
        showTypeFilters
      />
    </div>
  );
}
