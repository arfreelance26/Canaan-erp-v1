"use client";

import { useEffect, useState, useMemo } from "react";
import { TruckMaintenanceTable } from "@/components/maintenance/TruckMaintenanceTable";
import { MaintenanceRecordFormDialog } from "@/components/maintenance/MaintenanceRecordFormDialog";
import { MaintenanceRecordHistoryDialog } from "@/components/maintenance/MaintenanceRecordHistoryDialog";
import { TruckStatusDialog } from "@/components/maintenance/TruckStatusDialog";
import { trucksApi, maintenanceApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { TruckMaintenanceStatus } from "@/types/maintenance-status";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";

export default function TruckMaintenancePage() {
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Truck Maintenance</h1>
        <p className="mt-1 text-sm text-gray-500">Track the reliability of every truck in the fleet</p>
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
    </div>
  );
}
