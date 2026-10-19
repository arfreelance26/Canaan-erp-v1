"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { Droplets, Plus, Pencil, Trash2, Loader2, Truck as TruckIcon, Gauge, MapPin, History, NotebookPen } from "lucide-react";
import { adblueApi, adblueLogsApi, trucksApi, type AdBlueManufacturer, type AdBlueLogEditEventRow } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { showError, showSuccess } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { AdBlueLogFormDialog } from "@/components/fleet/AdBlueLogFormDialog";
import { AdBlueHistoryViewDialog } from "@/components/fleet/AdBlueHistoryViewDialog";
import type { AdBlueLog } from "@/types/adblue-log";
import { PillSearch } from "@/components/ui/PillSearch";
import { onRevalidated } from "@/lib/api-cache";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

const EDIT_EVENT_ICON: Record<AdBlueLogEditEventRow["event"], typeof Plus> = {
  "Log Created": Plus,
  "Log Edited": Pencil,
  "Log Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<AdBlueLogEditEventRow["event"], string> = {
  "Log Created": "bg-blue-100 text-blue-700",
  "Log Edited": "bg-amber-100 text-amber-700",
  "Log Deleted": "bg-red-100 text-red-700",
};

/**
 * Truck's Adblue History — a record of every AdBlue fill per truck. It feeds
 * no calculator or cost figure. Trucks are grouped by manufacturer (managed
 * on Our Fleet → Manufacturers); sold and deleted trucks aren't shown.
 */
export default function AdblueManagementPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [manufacturers, setManufacturers] = useState<AdBlueManufacturer[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<AdBlueLogEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    adblueLogsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  // Enter Log dialog
  const [logTarget, setLogTarget] = useState<Truck | null>(null);

  // View History dialog
  const [historyTruck, setHistoryTruck] = useState<Truck | null>(null);

  async function handleSaveAdBlueLog(log: Omit<AdBlueLog, "id" | "createdAt" | "enteredByName" | "version">) {
    try {
      await adblueLogsApi.createLog(log);
      showSuccess("AdBlue log saved.");
      setLogTarget(null);
    } catch (e: unknown) {
      showError(e instanceof Error && e.message ? e.message : "Could not save the AdBlue log. Please try again.");
    }
  }

  useEffect(() => {
    Promise.all([
      adblueApi.listManufacturers(),
      trucksApi.list(),
    ])
      .then(([mfrs, trks]) => { setManufacturers(mfrs); setTrucks(trks); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reloadKey]);

  // The API cache answers instantly and refreshes in the background; show the fresher copy when it lands.
  useEffect(() => onRevalidated(() => setReloadKey((k) => k + 1)), []);

  const q = searchQuery.trim().toLowerCase();
  const matches = (t: Truck) =>
    !q || t.registrationNumber?.toLowerCase().includes(q) || t.truckId?.toLowerCase().includes(q);
  const knownManufacturers = new Set(manufacturers.map((m) => m.name.trim().toLowerCase()));
  const otherTrucks = trucks.filter((t) => !knownManufacturers.has((t.manufacturer ?? "").trim().toLowerCase()) && matches(t));

  const renderGrid = (list: Truck[]) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((truck) => (
        <TruckCard
          key={truck.id}
          truck={truck}
          onViewHistory={() => setHistoryTruck(truck)}
          onEnterLog={() => setLogTarget(truck)}
        />
      ))}
    </div>
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <Droplets className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Truck&apos;s Adblue History</h1>
            <p className="mt-0.5 text-sm text-gray-500">A record of every AdBlue fill across the fleet</p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      {/* Toolbar: search on the left, date range + download on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/adblue-logs"
            filename="adblue_logs.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      {/* Trucks, grouped by manufacturer */}
      <div className="flex min-w-0 flex-col gap-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
          </div>
        ) : trucks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 py-16 text-center">
            <Droplets className="h-10 w-10 text-gray-200" />
            <p className="text-sm font-medium text-gray-400">No trucks in the fleet yet.</p>
          </div>
        ) : !trucks.some(matches) ? (
          <p className="py-10 text-center text-sm text-gray-400">No trucks match this search.</p>
        ) : (
          <>
            {manufacturers.map((m) => {
              const mTrucks = trucks.filter(
                (t) => (t.manufacturer ?? "").trim().toLowerCase() === m.name.trim().toLowerCase() && matches(t),
              );
              // Only manufacturers with trucks (matching the search) get a section.
              if (mTrucks.length === 0) return null;
              return (
                <section key={m.id}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/10">
                      <TruckIcon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex flex-1 items-baseline gap-2">
                      <h2 className="text-base font-bold text-gray-900">{m.name}</h2>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        {mTrucks.length} {mTrucks.length === 1 ? "truck" : "trucks"}
                      </span>
                    </div>
                  </div>
                  {renderGrid(mTrucks)}
                </section>
              );
            })}

            {otherTrucks.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                    <TruckIcon className="h-4 w-4 text-amber-700" />
                  </div>
                  <div className="flex flex-1 items-baseline gap-2">
                    <h2 className="text-base font-bold text-gray-900">Other Trucks</h2>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      {otherTrucks.length} {otherTrucks.length === 1 ? "truck" : "trucks"}
                    </span>
                  </div>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                  These trucks&apos; manufacturer isn&apos;t in the list on Our Fleet → Manufacturers.
                </p>
                {renderGrid(otherTrucks)}
              </section>
            )}
          </>
        )}
      </div>

      {/* Enter AdBlue Log dialog */}
      {logTarget && (
        <AdBlueLogFormDialog
          open={!!logTarget}
          onClose={() => setLogTarget(null)}
          onSave={handleSaveAdBlueLog}
          truck={logTarget}
        />
      )}

      {/* View AdBlue History dialog */}
      <AdBlueHistoryViewDialog
        open={!!historyTruck}
        onClose={() => setHistoryTruck(null)}
        truck={historyTruck}
      />

      {/* Edit History — every Create/Edit/Delete of an AdBlue log, in one
          searchable list. A deleted log's row still shows since it's logged
          as a snapshot, not a live join. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by truck or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.label.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Log</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-gray-800">{ev.label}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-gray-400"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateTime(ev.createdAt)}</td>
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

function totalTyresFromLayout(id: string): number {
  return id.split("+").reduce((sum, part) => sum + (parseInt(part) || 0), 0);
}

function TruckCard({
  truck,
  onViewHistory,
  onEnterLog,
}: {
  truck: Truck;
  onViewHistory: () => void;
  onEnterLog: () => void;
}) {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  // AdBlue history is open to the Maintenance team as well as Admin.
  const canViewAdblueHistory = isAdmin || authUser?.softwareDesignation === "Maintenance";
  const layout = truck.tyreLayout ? getTyreLayout(truck.tyreLayout) : null;
  const totalTyres = layout ? totalTyresFromLayout(layout.id) : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-blue-100 hover:shadow-md">
      {/* Top row: reg number + truck ID */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">{truck.registrationNumber || "—"}</p>
          <p className="mt-0.5 text-[11px] font-medium text-gray-400">{truck.truckId}</p>
        </div>
        {truck.truckType && (
          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-600">
            {truck.truckType}
          </span>
        )}
      </div>

      {/* Model name */}
      {truck.modelName && (
        <p className="text-[12px] font-semibold text-gray-700">{truck.modelName}</p>
      )}

      {/* Details row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {truck.odometer && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Gauge className="h-3 w-3 text-gray-400" />
            {parseInt(truck.odometer).toLocaleString()} km
          </div>
        )}
        {truck.branchRegisteredTo && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <MapPin className="h-3 w-3 text-gray-400" />
            {truck.branchRegisteredTo}
          </div>
        )}
        {truck.yearOfManufacture && (
          <div className="text-[11px] text-gray-500">
            {truck.yearOfManufacture}
          </div>
        )}
      </div>

      {/* Tyre layout */}
      {layout && (
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
            {layout.id}
          </span>
          <span className="text-[11px] text-gray-500">{totalTyres} tyres total</span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-1 flex gap-2 border-t border-gray-100 pt-3">
        {canViewAdblueHistory && (
<button
          type="button"
          onClick={onViewHistory}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-[11px] font-bold text-gray-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        >
          <History className="h-3.5 w-3.5" />
          View History
        </button>
)}
        <button
          type="button"
          onClick={onEnterLog}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700"
        >
          <NotebookPen className="h-3.5 w-3.5" />
          Enter Log
        </button>
      </div>
    </div>
  );
}
