"use client";

import { useEffect, useState, useMemo } from "react";
import { TruckMaintenanceTable } from "@/components/maintenance/TruckMaintenanceTable";
import { MaintenanceRecordFormDialog } from "@/components/maintenance/MaintenanceRecordFormDialog";
import { MaintenanceRecordHistoryDialog } from "@/components/maintenance/MaintenanceRecordHistoryDialog";
import { TruckStatusDialog } from "@/components/maintenance/TruckStatusDialog";
import { SetBaseMaintenanceCostDialog } from "@/components/maintenance/SetBaseMaintenanceCostDialog";
import { trucksApi, maintenanceApi, maintenanceTypesApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { TruckMaintenanceStatus } from "@/types/maintenance-status";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAuth } from "@/context/AuthContext";
import { Search, IndianRupee } from "lucide-react";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";

export default function TruckMaintenancePage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [allStatus, setAllStatus] = useState<TruckMaintenanceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [baseCostDialogOpen, setBaseCostDialogOpen] = useState(false);
  const [baseRate, setBaseRate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  useEffect(() => {
    Promise.all([trucksApi.list(), maintenanceApi.listRecords(), maintenanceApi.getStatus()])
      .then(([t, r, s]) => {
        setTrucks(t);
        setRecords(r);
        setAllStatus(s);
      })
      .catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    maintenanceTypesApi.getBaseConfig()
      .then((cfg) => setBaseRate(cfg.cost_per_km != null ? parseFloat(cfg.cost_per_km).toFixed(2) : null))
      .catch(() => {});
  }, []);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Truck Maintenance</h1>
          <p className="mt-1 text-sm text-gray-500">Track the reliability of every truck in the fleet</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search trucks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              title="Report from date"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              title="Report to date"
            />
            <DownloadExcelButton
              path="/exports/maintenance-records"
              filename="maintenance_records.xlsx"
              params={{
                ...(exportFrom ? { from_date: exportFrom } : {}),
                ...(exportTo ? { to_date: exportTo } : {}),
              }}
            />
            {isAdmin && (
              <button
                type="button"
                onClick={() => setBaseCostDialogOpen(true)}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <IndianRupee className="h-4 w-4" />
                Set Base Maintenance Cost
                {baseRate !== null && (
                  <span className="rounded bg-white/25 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
                    ₹{baseRate}/km
                  </span>
                )}
              </button>
            )}
          </div>
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
      />

      <SetBaseMaintenanceCostDialog
        open={baseCostDialogOpen}
        onClose={() => setBaseCostDialogOpen(false)}
        onSaved={(rate) => setBaseRate(rate)}
      />
    </div>
  );
}
