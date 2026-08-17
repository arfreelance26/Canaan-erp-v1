"use client";

import { useEffect, useState } from "react";
import { TyreManagementTable } from "@/components/maintenance/TyreManagementTable";
import { ManageTyresDialog } from "@/components/maintenance/ManageTyresDialog";
import { ViewTyreDataDialog } from "@/components/maintenance/ViewTyreDataDialog";
import { trucksApi, tyreApi, tyreRangeConfigApi } from "@/lib/api";
import { useTyreInventory } from "@/context/TyreInventoryContext";

import type { Truck } from "@/types/truck";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function TyreManagementPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [viewTyreDataOpen, setViewTyreDataOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const { setTyres, setFitmentRecords } = useTyreInventory();
  const [refreshKey, setRefreshKey] = useState(0);
  const [rangeConfigMap, setRangeConfigMap] = useState<Record<string, number | null>>({});

  useEffect(() => {
    tyreRangeConfigApi.list().then((rows) => {
      const map: Record<string, number | null> = {};
      for (const r of rows) map[r.tyre_type.toUpperCase()] = r.range_km ?? null;
      setRangeConfigMap(map);
    }).catch(() => {});
  }, []);

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
          .catch(() => {}).finally(() => setLoading(false));
      }, [setTyres, setFitmentRecords, refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("tyre_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));

  function handleManageTyres(truck: Truck) {
    setSelectedTruck(truck);
    setManageDialogOpen(true);
  }

  function handleViewTyreData(truck: Truck) {
    setSelectedTruck(truck);
    setViewTyreDataOpen(true);
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
              title="Report from date (purchase date)"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              title="Report to date (purchase date)"
            />
            <DownloadExcelButton
              path="/exports/tyre-inventory"
              filename="tyre_inventory.xlsx"
              params={{
                ...(exportFrom ? { from_date: exportFrom } : {}),
                ...(exportTo ? { to_date: exportTo } : {}),
              }}
            />
          </div>
        </div>
      </div>

      <TyreManagementTable trucks={filteredTrucks} onManageTyres={handleManageTyres} onViewTyreData={handleViewTyreData} />

      <ManageTyresDialog open={manageDialogOpen} onClose={() => setManageDialogOpen(false)} truck={selectedTruck} />
      <ViewTyreDataDialog open={viewTyreDataOpen} onClose={() => { setViewTyreDataOpen(false); setSelectedTruck(null); }} truck={selectedTruck} rangeConfigMap={rangeConfigMap} />
    </div>
  );
}
