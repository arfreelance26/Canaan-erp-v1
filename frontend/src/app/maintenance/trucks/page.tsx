"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState, useMemo } from "react";
import { TruckMaintenanceTable } from "@/components/maintenance/TruckMaintenanceTable";
import { MaintenanceRecordFormDialog } from "@/components/maintenance/MaintenanceRecordFormDialog";
import { MaintenanceRecordHistoryDialog } from "@/components/maintenance/MaintenanceRecordHistoryDialog";
import { TruckStatusDialog } from "@/components/maintenance/TruckStatusDialog";
import { trucksApi, maintenanceApi, type MaintenanceRecordEditEventRow } from "@/lib/api";
import { Wrench, History, Plus, Pencil, Trash2 } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { TruckMaintenanceStatus } from "@/types/maintenance-status";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import { showSuccess, showError } from "@/lib/swal";

const EDIT_EVENT_ICON: Record<MaintenanceRecordEditEventRow["event"], typeof Plus> = {
  "Record Created": Plus,
  "Record Edited": Pencil,
  "Record Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<MaintenanceRecordEditEventRow["event"], string> = {
  "Record Created": "bg-blue-100 text-blue-700",
  "Record Edited": "bg-amber-100 text-amber-700",
  "Record Deleted": "bg-red-100 text-red-700",
};

export default function TruckMaintenancePage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [allStatus, setAllStatus] = useState<TruckMaintenanceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<MaintenanceRecordEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every maintenance record
  // edit ever logged — searching by registration/truck ID doubles as that
  // truck's own history. A deleted record's row still shows (it's a
  // snapshot, not a live join), which is the whole point of this log.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    maintenanceApi.listRecordEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    Promise.all([trucksApi.list(), maintenanceApi.listRecords(), maintenanceApi.getStatus()])
      .then(([t, r, s]) => {
        setTrucks(t);
        setRecords(r);
        setAllStatus(s);
      })
      .catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);
  useWebSocketEvent("maintenance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));

  const statusByTruckDbId = useMemo(
    () => new Map(allStatus.map((s) => [s.truckDbId, s])),
    [allStatus]
  );

  function handleUpdateRecord(truck: Truck) {
    setSelectedTruck(truck);
    setUpdateDialogOpen(true);
  }

  function handleViewRecord(truck: Truck) {
    setSelectedTruck(truck);
    setHistoryDialogOpen(true);
  }

  function handleViewStatus(truck: Truck) {
    setSelectedTruck(truck);
    setStatusDialogOpen(true);
  }

  async function handleSaveRecord(record: MaintenanceRecord) {
    const truck = trucks.find((t) => t.id === record.truckId);
    if (!truck) return;
    try {
      const created = await maintenanceApi.createRecord(record, truck.id);
      setRecords((prev) => [...prev, created]);
      setUpdateDialogOpen(false);
      // Refresh status after a new record is saved
      maintenanceApi.getStatus().then(setAllStatus).catch(() => {});
      showSuccess("Maintenance record saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save maintenance record.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

  const filteredTrucks = trucks.filter(
    (t) =>
      !searchQuery ||
      t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.truckId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white text-orange-600 shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Truck Maintenance</h1>
            <p className="mt-0.5 text-sm text-gray-500">Track the reliability of every truck in the fleet</p>
          </div>
        </div>
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
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/maintenance-records"
            filename="maintenance_records.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <TruckMaintenanceTable
        trucks={filteredTrucks}
        records={records}
        statusByTruckDbId={statusByTruckDbId}
        onUpdateRecord={handleUpdateRecord}
        onViewRecord={handleViewRecord}
        onViewStatus={handleViewStatus}
      />

      <MaintenanceRecordFormDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
        onSave={handleSaveRecord}
        truck={selectedTruck}
      />

      <MaintenanceRecordHistoryDialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        truck={selectedTruck}
        records={records}
        onDelete={(id) => setRecords((prev) => prev.filter((r) => r.id !== id))}
      />

      <TruckStatusDialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
        status={selectedTruck ? statusByTruckDbId.get(selectedTruck.id) ?? null : null}
        truckDbId={selectedTruck?.id}
        records={selectedTruck ? records.filter((r) => r.truckId === selectedTruck.id) : []}
        tyreLayout={selectedTruck?.tyreLayout}
        truck={selectedTruck}
      />

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          maintenance record (not just the ones currently on this page), in
          one searchable log instead of having to open each truck
          individually. Searching by registration/truck ID doubles as that
          truck's own history. A deleted record's row still shows since
          it's logged as a snapshot, not a live join. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by registration, truck ID, type, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.truckIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.registrationNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.maintenanceType.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No maintenance record edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Truck</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Record</th>
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
                          <td className="px-3 py-2 text-gray-600">{ev.maintenanceType}</td>
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
