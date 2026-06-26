"use client";

import { useEffect, useState } from "react";
import { trucksApi, fuelLogsApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { showSuccess, showError } from "@/lib/swal";
import { FuelHistoryTable } from "@/components/maintenance/FuelHistoryTable";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { FuelLogFormDialog } from "@/components/fleet/FuelLogFormDialog";
import { FuelHistoryViewDialog } from "@/components/fleet/FuelHistoryViewDialog";

export default function FuelHistoryPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [historyViewOpen, setHistoryViewOpen] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);

  useEffect(() => {
    trucksApi.list()
      .then(setTrucks)
      .finally(() => setLoading(false));
  }, []);

  useAutoRefresh(() => {
    trucksApi.list()
      .then(setTrucks);
  }, 5000);

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

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Truck&apos;s Fuel History</h1>
        <p className="mt-1 text-sm text-gray-500">Track and manage fuel consumption for every truck in the fleet</p>
      </div>

      <FuelHistoryTable
        trucks={trucks}
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
    </div>
  );
}
