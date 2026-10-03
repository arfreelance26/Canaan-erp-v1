"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { AssignDriverTable } from "@/components/trips/AssignDriverTable";
import { AssignDriverDialog } from "@/components/trips/AssignDriverDialog";
import { driversApi, trucksApi, assignmentsApi, type DriverAssignmentEditEventRow } from "@/lib/api";
import { IdCard, History, Plus, X } from "lucide-react";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { DriverAssignment } from "@/types/driver-assignment";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";

const EDIT_EVENT_ICON: Record<DriverAssignmentEditEventRow["event"], typeof Plus> = {
  "Driver Assigned": Plus,
  "Assignment Removed": X,
};

const EDIT_EVENT_COLOR: Record<DriverAssignmentEditEventRow["event"], string> = {
  "Driver Assigned": "bg-blue-100 text-blue-700",
  "Assignment Removed": "bg-red-100 text-red-700",
};

export default function AssignDriversPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<DriverAssignmentEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    assignmentsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
        // allSettled, not all — a single failed source (e.g. right after relogin)
        // must not blank the whole table; each keeps its last-known-good state
        // and a toast names what didn't refresh.
        Promise.allSettled([driversApi.list(), trucksApi.list(), assignmentsApi.list()])
          .then(([d, t, a]) => {
            const failed: string[] = [];
            if (d.status === "fulfilled") setDrivers(d.value); else failed.push("Drivers");
            if (t.status === "fulfilled") setTrucks(t.value); else failed.push("Trucks");
            if (a.status === "fulfilled") setAssignments(a.value); else failed.push("Assignments");
            if (failed.length > 0) {
              showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
            }
          })
          .finally(() => setLoading(false));
      }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));

  const vehicleByDriverId = Object.fromEntries(
    assignments.map((assignment) => [assignment.driverId, assignment.vehicleId])
  );

  function handleAssign(driver: Driver) {
    setSelectedDriver(driver);
    setDialogOpen(true);
  }

  async function handleSave(vehicleId: string) {
    if (!selectedDriver) return;
    try {
      if (!vehicleId) {
        await assignmentsApi.remove(selectedDriver.driverId);
        setAssignments((prev) => prev.filter((a) => a.driverId !== selectedDriver.driverId));
        showSuccess("Vehicle unassigned successfully.");
      } else {
        await assignmentsApi.upsert(selectedDriver.driverId, vehicleId);
        setAssignments((prev) => {
          const withoutDriver = prev.filter((a) => a.driverId !== selectedDriver.driverId);
          return [
            ...withoutDriver,
            { id: crypto.randomUUID(), driverId: selectedDriver.driverId, vehicleId },
          ];
        });
        showSuccess("Vehicle assigned successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to assign vehicle.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

  const filteredDrivers = drivers.filter((d) => !searchQuery || d.name?.toLowerCase().includes(searchQuery.toLowerCase()) || d.driverId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <IdCard className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Assign Drivers</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Assign a vehicle to each driver so they can be selected when creating trips
            </p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search drivers..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DownloadExcelButton path="/exports/driver-assignments" filename="driver_assignments.xlsx" />
        </div>
      </div>

      <AssignDriverTable
        drivers={filteredDrivers}
        trucks={trucks}
        vehicleByDriverId={vehicleByDriverId}
        onAssign={handleAssign}
      />

      <AssignDriverDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        driver={selectedDriver}
        trucks={trucks}
        currentVehicleId={selectedDriver ? vehicleByDriverId[selectedDriver.driverId] ?? "" : ""}
        takenVehicleIds={Object.values(vehicleByDriverId)}
      />

      {/* Edit History — every Assign/Remove event ever logged, across every
          driver, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by driver or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q || ev.driverName.toLowerCase().includes(q) || ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No assignments have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Driver</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Vehicle</th>
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
                          <td className="px-3 py-2 font-semibold text-gray-800">{ev.driverName}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{ev.vehicleId ?? <span className="text-gray-400">—</span>}</td>
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
