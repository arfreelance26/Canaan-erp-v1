"use client";

import { useEffect, useMemo, useState } from "react";
import { CompensationTable, type CompensationPerson } from "@/components/compensation/CompensationTable";
import { AdvanceRecordDialog } from "@/components/compensation/AdvanceRecordDialog";
import { SalaryRecordDialog } from "@/components/compensation/SalaryRecordDialog";
import { Wallet } from "lucide-react";
import { TransactionHistoryDialog } from "@/components/compensation/TransactionHistoryDialog";
import { driversApi, tripsApi, financeApi, trucksApi } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import type { CompensationTransaction } from "@/types/compensation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";

export default function DriverCompensationPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [transactions, setTransactions] = useState<CompensationTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [advanceRecordTarget, setAdvanceRecordTarget] = useState<CompensationPerson | null>(null);
  const [salaryRecordTarget, setSalaryRecordTarget] = useState<CompensationPerson | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CompensationPerson | null>(null);
  const [search, setSearch] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  function loadData() {
    return Promise.all([driversApi.list(), tripsApi.list(), trucksApi.list(), financeApi.listDriverCompensation()]).then(([d, t, tr, tx]) => {
      setDrivers(d);
      setTrips(t);
      setTrucks(tr);
      setTransactions(tx);
    });
  }

  useEffect(() => { loadData().catch(() => {}).finally(() => setLoading(false)); }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("finance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));

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
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 shadow-sm">
          <Wallet className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Driver Compensation</h1>
          <p className="mt-0.5 text-sm text-gray-500">View advance and salary records for drivers</p>
          <p className="mt-1 text-sm font-semibold text-indigo-600">Total Drivers: {people.length}{search.trim() && ` (showing ${filteredPeople.length})`}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search drivers..." value={search} onChange={setSearch} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/driver-compensation"
            filename="driver_compensation.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
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
        idLabel="Driver ID"
      />

      <AdvanceRecordDialog
        open={advanceRecordTarget !== null}
        onClose={() => setAdvanceRecordTarget(null)}
        driver={advanceRecordTarget}
        trips={trips}
        trucks={trucks}
        onRecordPayment={handleRecordAdvancePayment}
      />

      <SalaryRecordDialog
        open={salaryRecordTarget !== null}
        onClose={() => setSalaryRecordTarget(null)}
        driver={salaryRecordTarget}
        trips={trips}
        trucks={trucks}
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
