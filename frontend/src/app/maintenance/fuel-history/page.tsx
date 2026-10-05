"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { trucksApi, fuelLogsApi, type FuelLogEditEventRow } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { showSuccess, showError } from "@/lib/swal";
import { FuelHistoryTable } from "@/components/maintenance/FuelHistoryTable";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { FuelLogFormDialog } from "@/components/fleet/FuelLogFormDialog";
import { FuelHistoryViewDialog } from "@/components/fleet/FuelHistoryViewDialog";
import { Fuel, History, Plus, Pencil, Trash2 } from "lucide-react";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

const EDIT_EVENT_ICON: Record<FuelLogEditEventRow["event"], typeof Plus> = {
  "Log Created": Plus,
  "Log Edited": Pencil,
  "Log Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<FuelLogEditEventRow["event"], string> = {
  "Log Created": "bg-blue-100 text-blue-700",
  "Log Edited": "bg-amber-100 text-amber-700",
  "Log Deleted": "bg-red-100 text-red-700",
};

export default function FuelHistoryPage() {
  const { user: authUser } = useAuth();
  // Edit History is open to Admin and Maintenance (the team that enters fuel logs).
  const canViewEditHistory = authUser?.softwareDesignation === "Admin" || authUser?.softwareDesignation === "Maintenance";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Read-only here — the base litre cost is only editable from the Dashboard.
  const [baseCostPerLitre, setBaseCostPerLitre] = useState<number | null>(null);

  // Dialog states
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [historyViewOpen, setHistoryViewOpen] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<FuelLogEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every fuel log edit ever
  // logged — searching by registration/truck ID doubles as that truck's
  // own history. A deleted log's row still shows (it's a snapshot, not a
  // live join).
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    fuelLogsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    trucksApi.list()
      .then(setTrucks)
      .catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    fuelLogsApi.getBaseConfig()
      .then((cfg) => {
        // Backend serializes the Decimal as a numeric string, not a number —
        // coerce explicitly rather than trusting the declared response type.
        const n = cfg.cost_per_litre != null ? Number(cfg.cost_per_litre) : null;
        setBaseCostPerLitre(n != null && !isNaN(n) ? n : null);
      })
      .catch(() => {});
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("fuel_updated", () => setRefreshKey(k => k + 1));

  function handleViewHistory(truck: Truck) {
    setSelectedTruck(truck);
    setHistoryViewOpen(true);
  }

  function handleEnterFuelLog(truck: Truck) {
    setSelectedTruck(truck);
    setLogFormOpen(true);
  }

  function handleSaveFuelLog(log: any) {
    fuelLogsApi.createFuelLog(log).then(() => {
      setLogFormOpen(false);
      setSelectedTruck(null);
      showSuccess("Fuel log saved successfully.");
    }).catch((err) => showError(err.message));
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  const filteredTrucks = trucks.filter((t) => !searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white text-amber-600 shadow-sm">
          <Fuel className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Truck&apos;s Fuel History</h1>
            <p className="mt-0.5 text-sm text-gray-500">Track and manage fuel consumption for every truck in the fleet</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canViewEditHistory && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}
          {/* Read-only — the base litre cost is only editable from the Dashboard. */}
          {baseCostPerLitre != null && (
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5">
              <Fuel className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Base Litre Cost</p>
                <p className="text-sm font-bold text-blue-700">₹{baseCostPerLitre.toFixed(2)}/L</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/fuel-logs"
            filename="fuel_logs.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <FuelHistoryTable
        trucks={filteredTrucks}
        onViewHistory={handleViewHistory}
        onEnterFuelLog={handleEnterFuelLog}
      />

      {selectedTruck && (
        <>
          <FuelLogFormDialog
            open={logFormOpen}
            onClose={() => { setLogFormOpen(false); setSelectedTruck(null); }}
            truck={selectedTruck}
            onSave={handleSaveFuelLog}
          />
          <FuelHistoryViewDialog
            open={historyViewOpen}
            onClose={() => { setHistoryViewOpen(false); setSelectedTruck(null); }}
            truck={selectedTruck}
          />
        </>
      )}

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          fuel log (not just the ones currently on this page), in one
          searchable log instead of having to open each truck individually.
          A deleted log's row still shows since it's logged as a snapshot,
          not a live join. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by registration, truck ID, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.truckIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.registrationNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No fuel log edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Truck</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Log</th>
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
                          <td className="px-3 py-2">
                            <p className="font-semibold text-gray-800">{ev.registrationNumber}</p>
                            <p className="text-[11px] text-gray-400">{ev.truckIdStr}</p>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{ev.logDate ?? "—"}{ev.litres ? ` · ${ev.litres}L` : ""}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-gray-400"> ({ev.actorRole})</span>}
                          </td>
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
