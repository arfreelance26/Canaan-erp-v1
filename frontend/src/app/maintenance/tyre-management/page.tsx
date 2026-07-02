"use client";

import { useEffect, useState } from "react";
import { TyreManagementTable } from "@/components/maintenance/TyreManagementTable";
import { ManageTyresDialog } from "@/components/maintenance/ManageTyresDialog";
import { trucksApi, tyreApi } from "@/lib/api";
import { useTyreInventory } from "@/context/TyreInventoryContext";

import type { Truck } from "@/types/truck";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function TyreManagementPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
      useAutoRefresh(() => {
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
      }, 5000);


  function handleManageTyres(truck: Truck) {
    setSelectedTruck(truck);
    setManageDialogOpen(true);
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

  const filteredTrucks = trucks.filter((t) => !searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tyre Management</h1>
          <p className="mt-1 text-sm text-gray-500">Track layouts across the fleet</p>
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

      <TyreManagementTable trucks={filteredTrucks} onManageTyres={handleManageTyres} />

      <ManageTyresDialog open={manageDialogOpen} onClose={() => setManageDialogOpen(false)} truck={selectedTruck} />
    </div>
  );
}
