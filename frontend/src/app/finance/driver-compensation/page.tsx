"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { CompensationTable, type CompensationPerson } from "@/components/compensation/CompensationTable";
import { AdvanceRecordDialog } from "@/components/compensation/AdvanceRecordDialog";
import { SalaryRecordDialog } from "@/components/compensation/SalaryRecordDialog";
import { CompensationGuideDialog, type GuideTab } from "@/components/compensation/CompensationGuideDialog";
import { HaltPayRecordDialog } from "@/components/compensation/HaltPayRecordDialog";
import { BattaRecordDialog } from "@/components/compensation/BattaRecordDialog";
import { Wallet, History, Plus, Trash2, Info } from "lucide-react";
import { driversApi, tripsApi, financeApi, trucksApi, type CompensationEditEventRow } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

const EDIT_EVENT_ICON: Record<CompensationEditEventRow["event"], typeof Plus> = {
  "Transaction Added": Plus,
  "Transaction Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<CompensationEditEventRow["event"], string> = {
  "Transaction Added": "bg-blue-100 text-blue-700",
  "Transaction Deleted": "bg-red-100 text-red-700",
};

export default function DriverCompensationPage() {
  // "How is this Calculated?" guide — page button, or the record dialogs' "Full guide".
  const [guideTab, setGuideTab] = useState<GuideTab | null>(null);
  // Halt Pay Record — view-only list of every halt on the driver's closed trips.
  const [haltTarget, setHaltTarget] = useState<CompensationPerson | null>(null);
  // Cleaner / Workshop Batta Records — view-only, one row per attendance day that earns it.
  const [cleanerTarget, setCleanerTarget] = useState<CompensationPerson | null>(null);
  const [workshopTarget, setWorkshopTarget] = useState<CompensationPerson | null>(null);
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [advanceRecordTarget, setAdvanceRecordTarget] = useState<CompensationPerson | null>(null);
  const [salaryRecordTarget, setSalaryRecordTarget] = useState<CompensationPerson | null>(null);
  const [search, setSearch] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<CompensationEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every driver advance/
  // salary transaction ever added or deleted — searching by driver name
  // doubles as that driver's own history. A deleted transaction's row still
  // shows since it's logged as a snapshot, not a live join.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    financeApi.listCompensationEditEvents("driver")
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  function loadData() {
    return Promise.all([driversApi.list(), tripsApi.list(), trucksApi.list()]).then(([d, t, tr]) => {
      setDrivers(d);
      setTrips(t);
      setTrucks(tr);
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

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, search]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
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
        <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setGuideTab("overview")}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
        >
          <Info className="h-4 w-4" />
          How is this Calculated?
        </button>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
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
        onHaltPay={setHaltTarget}
        onCleanerBatta={setCleanerTarget}
        onWorkshopBatta={setWorkshopTarget}
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
        onShowGuide={() => setGuideTab("advance")}
      />

      <SalaryRecordDialog
        open={salaryRecordTarget !== null}
        onClose={() => setSalaryRecordTarget(null)}
        driver={salaryRecordTarget}
        trips={trips}
        trucks={trucks}
        onShowGuide={() => setGuideTab("salary")}
      />

      <HaltPayRecordDialog
        open={haltTarget !== null}
        onClose={() => setHaltTarget(null)}
        driver={haltTarget}
        trips={trips}
        trucks={trucks}
        onShowGuide={() => setGuideTab("halt")}
      />

      <BattaRecordDialog
        kind="cleaner"
        open={cleanerTarget !== null}
        onClose={() => setCleanerTarget(null)}
        driver={cleanerTarget}
        onShowGuide={() => setGuideTab("cleaner")}
      />

      <BattaRecordDialog
        kind="workshop"
        open={workshopTarget !== null}
        onClose={() => setWorkshopTarget(null)}
        driver={workshopTarget}
        onShowGuide={() => setGuideTab("workshop")}
      />

      <CompensationGuideDialog
        open={guideTab !== null}
        onClose={() => setGuideTab(null)}
        initialTab={guideTab ?? "overview"}
      />

      {/* Edit History — every Add/Delete ever logged, across every driver's
          advance/salary transactions (not just the ones currently on this
          page), in one searchable log instead of having to open each
          driver's own transaction history individually. A deleted
          transaction's row still shows since it's logged as a snapshot,
          not a live join. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by driver name or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              (ev.personName ?? "").toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No compensation edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Driver</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Transaction</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-gray-800">{ev.personName ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{ev.txType} · ₹{Number(ev.amount).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{ev.actorName}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
