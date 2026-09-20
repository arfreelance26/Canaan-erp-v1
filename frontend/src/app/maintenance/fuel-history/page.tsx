"use client";

import { useEffect, useState } from "react";
import { trucksApi, fuelLogsApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { showSuccess, showError } from "@/lib/swal";
import { FuelHistoryTable } from "@/components/maintenance/FuelHistoryTable";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { FuelLogFormDialog } from "@/components/fleet/FuelLogFormDialog";
import { FuelHistoryViewDialog } from "@/components/fleet/FuelHistoryViewDialog";
import { Search, Fuel } from "lucide-react";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function FuelHistoryPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Read-only here — the base litre cost is only editable from the Dashboard.
  const [baseCostPerLitre, setBaseCostPerLitre] = useState<number | null>(null);

  // Dialog states
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [historyViewOpen, setHistoryViewOpen] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  useEffect(() => {
    trucksApi.list()
      .then(setTrucks)
      .catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    fuelLogsApi.getBaseConfig()
      .then((cfg) => {
        // Backend serializes the Decimal as a numeric string, not a number —
        // coerce explicitly rather than trusting the declared response type.
        const n = cfg.cost_per_litre != null ? Number(cfg.cost_per_litre) : null;
        setBaseCostPerLitre(n != null && !isNaN(n) ? n : null);
      })
      .catch(() => {});
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("fuel_updated", () => setRefreshKey(k => k + 1));

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

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  const filteredTrucks = trucks.filter((t) => !searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Truck&apos;s Fuel History</h1>
          <p className="mt-1 text-sm text-gray-500">Track and manage fuel consumption for every truck in the fleet</p>
        </div>
        {/* Read-only — the base litre cost is only editable from the Dashboard. */}
        {baseCostPerLitre != null && (
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5">
            <Fuel className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Base Litre Cost</p>
              <p className="text-sm font-bold text-blue-700">₹{baseCostPerLitre.toFixed(2)}/L</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <input
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            className="uppercase rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            title="Report from date"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            className="uppercase rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            title="Report to date"
          />
          <DownloadExcelButton
            path="/exports/fuel-logs"
            filename="fuel_logs.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <FuelHistoryTable
        trucks={filteredTrucks}
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
