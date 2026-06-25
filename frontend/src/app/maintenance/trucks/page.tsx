"use client";

import { useEffect, useState } from "react";
import { TruckMaintenanceTable } from "@/components/maintenance/TruckMaintenanceTable";
import { MaintenanceRecordFormDialog } from "@/components/maintenance/MaintenanceRecordFormDialog";
import { MaintenanceRecordHistoryDialog } from "@/components/maintenance/MaintenanceRecordHistoryDialog";

import { trucksApi, maintenanceApi } from "@/lib/api";

import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";

export default function TruckMaintenancePage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);


  useEffect(() => {
    Promise.all([trucksApi.list(), maintenanceApi.listRecords()])
      .then(([t, r]) => {
        setTrucks(t);
        setRecords(r);
      })
      .finally(() => setLoading(false));
  }, []);

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
    const created = await maintenanceApi.createRecord(record, truck.id);
    setRecords((prev) => [...prev, created]);
    if (Number(record.odometer) > Number(truck.odometer)) {
      const updatedTruck = await trucksApi.update(truck.id, { ...truck, odometer: record.odometer });
      setTrucks((prev) => prev.map((t) => (t.id === truck.id ? updatedTruck : t)));
    }
    setUpdateDialogOpen(false);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Truck Maintenance</h1>
        <p className="mt-1 text-sm text-gray-500">Track the reliability of every truck in the fleet</p>
      </div>

      <TruckMaintenanceTable
        trucks={trucks}
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
