"use client";

import { useEffect, useMemo, useState } from "react";
import { CompensationTable, type CompensationPerson } from "@/components/compensation/CompensationTable";
import { AdvanceRecordDialog } from "@/components/compensation/AdvanceRecordDialog";
import { SalaryRecordDialog } from "@/components/compensation/SalaryRecordDialog";
import { TransactionHistoryDialog } from "@/components/compensation/TransactionHistoryDialog";
import { driversApi, tripsApi, financeApi } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { Trip } from "@/types/trip";
import type { CompensationTransaction } from "@/types/compensation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function DriverCompensationPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [transactions, setTransactions] = useState<CompensationTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [advanceRecordTarget, setAdvanceRecordTarget] = useState<CompensationPerson | null>(null);
  const [salaryRecordTarget, setSalaryRecordTarget] = useState<CompensationPerson | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CompensationPerson | null>(null);
  const [search, setSearch] = useState("");

  function loadData() {
    return Promise.all([driversApi.list(), tripsApi.list(), financeApi.listDriverCompensation()]).then(([d, t, tx]) => {
      setDrivers(d);
      setTrips(t);
      setTransactions(tx);
    });
  }

  useEffect(() => { loadData().finally(() => setLoading(false)); }, []);
  useAutoRefresh(() => { loadData(); }, 5000);

  useWebSocketEvent("finance_updated", loadData);
  useWebSocketEvent("trip_updated", loadData);
  useWebSocketEvent("driver_updated", loadData);

  const people: CompensationPerson[] = useMemo(
    () =>
      drivers.map((driver) => ({
        id: driver.id,
        driverId: driver.driverId,
        photoUrl: driver.photoUrl,
        name: driver.name,
        status: "Active",
      })),
    [drivers]
  );

  function handlePayAdvance(person: CompensationPerson) {
    setAdvanceRecordTarget(person);
  }

  function handlePaySalary(person: CompensationPerson) {
    setSalaryRecordTarget(person);
  }

  async function handleRecordAdvancePayment(total: number) {
    if (!advanceRecordTarget) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const created = await financeApi.addDriverCompensation(advanceRecordTarget.id, "Advance", total, today, "");
      setTransactions((prev) => [...prev, created]);
      setAdvanceRecordTarget(null);
      showSuccess("Advance payment recorded successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to record advance payment.");
    }
  }

  async function handleRecordSalaryPayment(total: number) {
    if (!salaryRecordTarget) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const created = await financeApi.addDriverCompensation(salaryRecordTarget.id, "Salary", total, today, "");
      setTransactions((prev) => [...prev, created]);
      setSalaryRecordTarget(null);
      showSuccess("Salary payment recorded successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to record salary payment.");
    }
  }

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, search]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver Compensation</h1>
          <p className="mt-1 text-sm text-gray-500">View advance and salary records for drivers</p>
        </div>
        <DownloadExcelButton path="/exports/driver-compensation" filename="driver_compensation.xlsx" />
      </div>

      <div className="flex justify-end">
        <div className="relative w-56">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search drivers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/80 bg-white/90 py-1.5 pl-8 pr-7 text-xs text-gray-700 shadow-[0_2px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl placeholder:text-gray-400 transition-all duration-200 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 transition-colors hover:text-gray-600"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <CompensationTable
        people={filteredPeople}
        showAdvance
        onPayAdvance={handlePayAdvance}
        onPaySalary={handlePaySalary}
        onViewHistory={setHistoryTarget}
        photoLabel="Driver Photo"
        nameLabel="Driver Name"
      />

      <AdvanceRecordDialog
        open={advanceRecordTarget !== null}
        onClose={() => setAdvanceRecordTarget(null)}
        driver={advanceRecordTarget}
        trips={trips}
        onRecordPayment={handleRecordAdvancePayment}
      />

      <SalaryRecordDialog
        open={salaryRecordTarget !== null}
        onClose={() => setSalaryRecordTarget(null)}
        driver={salaryRecordTarget}
        trips={trips}
        onRecordPayment={handleRecordSalaryPayment}
      />

      <TransactionHistoryDialog
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
        personName={historyTarget?.name ?? ""}
        transactions={transactions.filter((tx) => tx.personId === historyTarget?.id)}
        showTypeFilters
      />
    </div>
  );
}
