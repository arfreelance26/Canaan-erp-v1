"use client";

import { useEffect, useState } from "react";
import { TyreManagementTable } from "@/components/maintenance/TyreManagementTable";
import { ManageTyresDialog } from "@/components/maintenance/ManageTyresDialog";
import { trucksApi, tyreApi } from "@/lib/api";
import { useTyreInventory } from "@/context/TyreInventoryContext";

import type { Truck } from "@/types/truck";

export default function TyreManagementPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  const { setTyres, setFitmentRecords } = useTyreInventory();

  useEffect(() => {
    Promise.all([
      trucksApi.list(),
      tyreApi.listInventory(),
      tyreApi.listFitments()
    ])
      .then(([t, inv, fit]) => {
        setTrucks(t);
        setTyres(inv);
        setFitmentRecords(fit);
      })
      .finally(() => setLoading(false));
  }, [setTyres, setFitmentRecords]);

  function handleManageTyres(truck: Truck) {
    setSelectedTruck(truck);
    setManageDialogOpen(true);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tyre Management</h1>
        <p className="mt-1 text-sm text-gray-500">Track layouts across the fleet</p>
      </div>

      <TyreManagementTable trucks={trucks} onManageTyres={handleManageTyres} />

      <ManageTyresDialog open={manageDialogOpen} onClose={() => setManageDialogOpen(false)} truck={selectedTruck} />
    </div>
  );
}
