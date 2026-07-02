"use client";

import { useEffect, useState } from "react";
import { TruckMaintenanceTable } from "@/components/maintenance/TruckMaintenanceTable";
import { MaintenanceRecordFormDialog } from "@/components/maintenance/MaintenanceRecordFormDialog";
import { MaintenanceRecordHistoryDialog } from "@/components/maintenance/MaintenanceRecordHistoryDialog";

import { trucksApi, maintenanceApi } from "@/lib/api";

import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";

export default function TruckMaintenancePage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");


  useEffect(() => {
        Promise.all([trucksApi.list(), maintenanceApi.listRecords()])
          .then(([t, r]) => {
            setTrucks(t);
            setRecords(r);
          })
          .finally(() => setLoading(false));
      }, []);
      useAutoRefresh(() => {
    Promise.all([trucksApi.list(), maintenanceApi.listRecords()])
    .then(([t, r]) => {
    setTrucks(t);
    setRecords(r);
    })
    .finally(() => setLoading(false));
      }, 5000);


  function handleUpdateRecord(truck: Truck) {
    setSelectedTruck(truck);
    setUpdateDialogOpen(true);
  }

  function handleViewRecord(truck: Truck) {
    setSelectedTruck(truck);
    setHistoryDialogOpen(true);
  }

  async function handleSaveRecord(record: MaintenanceRecord) {
    const truck = trucks.find((t) => t.id === record.truckId);
    if (!truck) return;
    try {
      const created = await maintenanceApi.createRecord(record, truck.id);
      setRecords((prev) => [...prev, created]);
      if (Number(record.odometer) > Number(truck.odometer)) {
        const updatedTruck = await trucksApi.update(truck.id, { ...truck, odometer: record.odometer });
        setTrucks((prev) => prev.map((t) => (t.id === truck.id ? updatedTruck : t)));
      }
      setUpdateDialogOpen(false);
      showSuccess("Maintenance record saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save maintenance record.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  const filteredTrucks = trucks.filter((t) => !searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Truck Maintenance</h1>
          <p className="mt-1 text-sm text-gray-500">Track the reliability of every truck in the fleet</p>
        </div>
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
      </div>

      <TruckMaintenanceTable
        trucks={filteredTrucks}
        records={records}
        onUpdateRecord={handleUpdateRecord}
        onViewRecord={handleViewRecord}
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
      />

    </div>
  );
}
