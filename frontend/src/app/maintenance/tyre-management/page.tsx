"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { TyreManagementTable } from "@/components/maintenance/TyreManagementTable";
import { ManageTyresDialog } from "@/components/maintenance/ManageTyresDialog";
import { ManageRemarksDialog } from "@/components/maintenance/ManageRemarksDialog";
import { ViewTyreDataDialog } from "@/components/maintenance/ViewTyreDataDialog";
import { TruckHistoryDialog } from "@/components/maintenance/TruckHistoryDialog";
import { trucksApi, tyreApi, tyreRangeConfigApi, type TyreFitmentEventRow } from "@/lib/api";
import { RiRecordCircleLine as CircleDot, RiHistoryLine as History, RiDownload2Line as ArrowDownToLine, RiUpload2Line as ArrowUpFromLine, RiMessage2Line as MessageSquareText } from "@remixicon/react";
import { useTyreInventory } from "@/context/TyreInventoryContext";

import type { Truck } from "@/types/truck";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDate, inDateRange } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
const EDIT_EVENT_ICON: Record<TyreFitmentEventRow["event"], typeof ArrowDownToLine> = {
  "Tyre Fitted": ArrowDownToLine,
  "Tyre Removed": ArrowUpFromLine,
};

const EDIT_EVENT_COLOR: Record<TyreFitmentEventRow["event"], string> = {
  "Tyre Fitted": "bg-success-surface-strong text-success-text",
  "Tyre Removed": "bg-warning-surface-strong text-warning-text",
};

export default function TyreManagementPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [viewTyreDataOpen, setViewTyreDataOpen] = useState(false);
  const [viewTruckHistoryTruck, setViewTruckHistoryTruck] = useState<Truck | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TyreFitmentEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every tyre fit/remove
  // ever logged (including each half of a position swap) — searching by
  // registration/truck ID/tyre number doubles as that truck's own history.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tyreApi.listFitmentEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  const { tyres, fitmentRecords, setTyres, setFitmentRecords } = useTyreInventory();
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

  // With a date range: trucks currently fitted with a tyre bought in that range.
  const datedTyreIds = new Set(tyres.filter((t) => inDateRange(t.purchaseDate, exportFrom, exportTo)).map((t) => t.id));
  const datedTruckIds = exportFrom || exportTo
    ? new Set(fitmentRecords.filter((f) => !f.removedDate && datedTyreIds.has(f.tyreId)).map((f) => f.truckId))
    : null;
  const filteredTrucks = trucks.filter((t) => (!datedTruckIds || datedTruckIds.has(t.id)) && (!searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase())));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
            <CircleDot className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Tyre Management</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Track layouts across the fleet</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setRemarksOpen(true)}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
        >
          <MessageSquareText className="h-4 w-4" />
          Manage Remarks
        </button>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
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
      <ManageRemarksDialog open={remarksOpen} onClose={() => setRemarksOpen(false)} />
      <ViewTyreDataDialog open={viewTyreDataOpen} onClose={() => { setViewTyreDataOpen(false); setSelectedTruck(null); }} truck={selectedTruck} rangeConfigMap={rangeConfigMap} />
      <TruckHistoryDialog open={viewTruckHistoryTruck !== null} onClose={() => setViewTruckHistoryTruck(null)} truck={viewTruckHistoryTruck} />

      {/* Edit History — every tyre fit/remove ever logged, across every truck
          (not just the ones currently on this page), in one searchable log
          instead of having to open each truck's own history individually.
          A position swap shows as one Removed + one Fitted row per tyre. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by registration, truck ID, tyre no., or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.truckIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.registrationNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.tyreNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "logistics" : "not-found"} title={editHistoryEvents.length === 0 ? "No tyre fit/remove actions have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Truck</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Tyre / Position</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator-border">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-text-primary">{ev.registrationNumber}</p>
                            <p className="text-[11px] text-text-tertiary">{ev.truckIdStr}</p>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{ev.tyreNumber} · {ev.position}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{ev.actorName}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDate(ev.eventDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
