"use client";

import { useEffect, useState } from "react";
import { TyreManagementTable } from "@/components/maintenance/TyreManagementTable";
import { ManageTyresDialog } from "@/components/maintenance/ManageTyresDialog";
import { ViewTyreDataDialog } from "@/components/maintenance/ViewTyreDataDialog";
import { TruckHistoryDialog } from "@/components/maintenance/TruckHistoryDialog";
import { trucksApi, tyreApi, tyreRangeConfigApi } from "@/lib/api";
import { CircleDot } from "lucide-react";
import { useTyreInventory } from "@/context/TyreInventoryContext";

import type { Truck } from "@/types/truck";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";

export default function TyreManagementPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [viewTyreDataOpen, setViewTyreDataOpen] = useState(false);
  const [viewTruckHistoryTruck, setViewTruckHistoryTruck] = useState<Truck | null>(null);
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

  function handleViewTruckHistory(truck: Truck) {
    setViewTruckHistoryTruck(truck);
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

  const filteredTrucks = trucks.filter((t) => !searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 shadow-sm">
          <CircleDot className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tyre Management</h1>
          <p className="mt-0.5 text-sm text-gray-500">Track layouts across the fleet</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
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

      <TyreManagementTable
        trucks={filteredTrucks}
        onManageTyres={handleManageTyres}
        onViewTyreData={handleViewTyreData}
        onViewTruckHistory={handleViewTruckHistory}
      />

      <ManageTyresDialog open={manageDialogOpen} onClose={() => setManageDialogOpen(false)} truck={selectedTruck} />
      <ViewTyreDataDialog open={viewTyreDataOpen} onClose={() => { setViewTyreDataOpen(false); setSelectedTruck(null); }} truck={selectedTruck} rangeConfigMap={rangeConfigMap} />
      <TruckHistoryDialog open={viewTruckHistoryTruck !== null} onClose={() => setViewTruckHistoryTruck(null)} truck={viewTruckHistoryTruck} />
    </div>
  );
}
