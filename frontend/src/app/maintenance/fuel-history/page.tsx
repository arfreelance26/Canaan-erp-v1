"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trucksApi, fuelLogsApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { showSuccess, showError } from "@/lib/swal";
import { FuelHistoryTable } from "@/components/maintenance/FuelHistoryTable";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { FuelLogFormDialog } from "@/components/fleet/FuelLogFormDialog";
import { FuelHistoryViewDialog } from "@/components/fleet/FuelHistoryViewDialog";
import { Search, Fuel, X } from "lucide-react";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useAuth } from "@/context/AuthContext";

function BaseLitreCostDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    fuelLogsApi.getBaseConfig().then((cfg) => {
      if (cfg.cost_per_litre != null) setRate(String(cfg.cost_per_litre));
    }).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fuelLogsApi.setBaseConfig(rate !== "" ? Number(rate) : null);
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Fuel className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-gray-900">Set Base Litre Cost</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <label className="shrink-0 text-sm font-semibold text-gray-700">
              Fuel Cost per Litre (Base)
            </label>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">₹</span>
              <input
                ref={inputRef}
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="e.g. 95.50"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-7 pr-4 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function FuelHistoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [historyViewOpen, setHistoryViewOpen] = useState(false);
  const [baseLitreCostOpen, setBaseLitreCostOpen] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  useEffect(() => {
    trucksApi.list()
      .then(setTrucks)
      .catch(() => {}).finally(() => setLoading(false));
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
      <div>
          <h1 className="text-2xl font-bold text-gray-900">Truck&apos;s Fuel History</h1>
          <p className="mt-1 text-sm text-gray-500">Track and manage fuel consumption for every truck in the fleet</p>
        </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        
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
              path="/exports/fuel-logs"
              filename="fuel_logs.xlsx"
              params={{
                ...(exportFrom ? { from_date: exportFrom } : {}),
                ...(exportTo ? { to_date: exportTo } : {}),
              }}
            />
            {isAdmin && (
              <button
                type="button"
                onClick={() => setBaseLitreCostOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <Fuel className="h-4 w-4" />
                Set Base Litre Cost
              </button>
            )}
          </div>
        </div>
      </div>

      <FuelHistoryTable
        trucks={filteredTrucks}
        onViewHistory={handleViewHistory}
        onEnterFuelLog={handleEnterFuelLog}
      />

      {baseLitreCostOpen && (
        <BaseLitreCostDialog onClose={() => setBaseLitreCostOpen(false)} />
      )}

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
