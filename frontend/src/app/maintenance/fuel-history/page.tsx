"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { trucksApi, fuelLogsApi, type FuelLogEditEventRow } from "@/lib/api";
import type { FuelLog } from "@/types/fuel-log";
import type { Truck } from "@/types/truck";
import { showSuccess, showError } from "@/lib/feedback";
import { FuelHistoryTable } from "@/components/maintenance/FuelHistoryTable";
import { TruckViewToggle, useTruckView } from "@/components/fleet/TruckTiles";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { RiGasStationLine as Fuel, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { FuelReport } from "@/lib/fuel-report-pdf";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime, inDateRange } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const FuelLogFormDialog = dynamic(() => import("@/components/fleet/FuelLogFormDialog").then((m) => m.FuelLogFormDialog));
const FuelHistoryViewDialog = dynamic(() => import("@/components/fleet/FuelHistoryViewDialog").then((m) => m.FuelHistoryViewDialog));
const EDIT_EVENT_ICON: Record<FuelLogEditEventRow["event"], typeof Plus> = {
  "Log Created": Plus,
  "Log Edited": Pencil,
  "Log Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<FuelLogEditEventRow["event"], string> = {
  "Log Created": "bg-accent-surface-strong text-accent-text",
  "Log Edited": "bg-warning-surface-strong text-warning-text",
  "Log Deleted": "bg-danger-surface-strong text-danger-text",
};

export default function FuelHistoryPage() {
  const { user: authUser } = useAuth();
  // Edit History is open to Admin and Maintenance (the team that enters fuel logs).
  const canViewEditHistory = authUser?.softwareDesignation === "Admin" || authUser?.softwareDesignation === "Maintenance";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useTruckView("fuel-history");
  // Read-only here — the base litre cost is only editable from the Dashboard.
  const [baseCostPerLitre, setBaseCostPerLitre] = useState<number | null>(null);

  // Dialog states
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [historyViewOpen, setHistoryViewOpen] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [fuelLogs, setFuelLogs] = useState<FuelLog[] | null>(null);
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<FuelLogEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every fuel log edit ever
  // logged — searching by registration/truck ID doubles as that truck's
  // own history. A deleted log's row still shows (it's a snapshot, not a
  // live join).
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    fuelLogsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

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

  // Every fuel log: each truck's last fill and mileage, and which trucks fuelled
  // in the date range. Loaded on open, after a save, and once a minute — not on
  // the page's 5-second refresh (it's well over a thousand rows).
  const hasRange = Boolean(exportFrom || exportTo);
  const [logsKey, setLogsKey] = useState(0);
  useEffect(() => {
    fuelLogsApi.listFuelLogs().then(setFuelLogs).catch(() => {});
  }, [logsKey]);
  useEffect(() => {
    const t = window.setInterval(() => setLogsKey((k) => k + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

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
      setLogsKey((k) => k + 1);
      showSuccess("Fuel log saved successfully.");
    }).catch((err) => showError(err.message));
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  const datedTruckIds = hasRange && fuelLogs
    ? new Set(fuelLogs.filter((l) => inDateRange(l.date, exportFrom, exportTo)).map((l) => l.truckId))
    : null;
  const filteredTrucks = trucks.filter((t) => (!datedTruckIds || datedTruckIds.has(t.id)) && (!searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase())));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning-border bg-warning-surface text-warning-text shadow-sm">
          <Fuel className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Truck&apos;s Fuel History</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Track and manage fuel consumption for every truck in the fleet</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canViewEditHistory && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}
          {/* Read-only — the base litre cost is only editable from the Dashboard. */}
          {baseCostPerLitre != null && (
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-accent-border bg-accent-surface px-4 py-2.5">
              <Fuel className="h-4 w-4 text-accent-text" />
              <div>
                <p className="text-caption-2-semibold text-accent-text">Base Litre Cost</p>
                <p className="text-body-semibold text-accent-text">₹{baseCostPerLitre.toFixed(2)}/L</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <TruckViewToggle view={view} onChange={setView} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          {/* The truck-wise fuel report: Summary, All Trucks, a sheet per truck, By Station (+ its PDF). */}
          <ReportViewButton
            path="/exports/fuel-report"
            filename="Fuel_Report.xlsx"
            title={`Fuel Report — ${exportFrom || exportTo ? `${exportFrom ? exportFrom.split("-").reverse().join("-") : "start"} to ${exportTo ? exportTo.split("-").reverse().join("-") : "today"}` : "all time"}${searchQuery.trim() ? ` — "${searchQuery.trim()}"` : ""}`}
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
              ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
            }}
            pdf={(report, file) => import("@/lib/fuel-report-pdf").then((m) => m.downloadFuelReportPdf({ report: report as FuelReport, filename: file }))}
          />
        </div>
      </div>

      <FuelHistoryTable
        trucks={filteredTrucks}
        view={view}
        fuelLogs={fuelLogs}
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

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          fuel log (not just the ones currently on this page), in one
          searchable log instead of having to open each truck individually.
          A deleted log's row still shows since it's logged as a snapshot,
          not a live join. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by registration, truck ID, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.truckIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.registrationNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "logistics" : "not-found"} title={editHistoryEvents.length === 0 ? "No fuel log edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Truck</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Log</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-text-primary">{ev.registrationNumber}</p>
                            <p className="text-[11px] text-text-tertiary">{ev.truckIdStr}</p>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{ev.logDate ?? "—"}{ev.litres ? ` · ${ev.litres}L` : ""}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    }}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
