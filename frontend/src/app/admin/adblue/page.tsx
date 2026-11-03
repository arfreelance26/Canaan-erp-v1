"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { RiDropLine as Droplets, RiAddLine as Plus, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiLoader4Line as Loader2, RiTruckLine as TruckIcon, RiDashboard3Line as Gauge, RiMapPin2Line as MapPin, RiHistoryLine as History, RiStickyNoteLine as NotebookPen, RiBuilding3Line as Factory } from "@remixicon/react";
import { adblueApi, adblueLogsApi, trucksApi, type AdBlueManufacturer, type AdBlueLogEditEventRow } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { showError, showSuccess } from "@/lib/feedback";
import { Dialog } from "@/components/ui/Dialog";
import { TruckManufacturersDialog, manufacturerRate } from "@/components/fleet/TruckManufacturersDialog";
import type { AdBlueLog } from "@/types/adblue-log";
import { PillSearch } from "@/components/ui/PillSearch";
import { onRevalidated } from "@/lib/api-cache";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { cn } from "@/lib/utils";
import { formatDateTime, inDateRange } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const AdBlueLogFormDialog = dynamic(() => import("@/components/fleet/AdBlueLogFormDialog").then((m) => m.AdBlueLogFormDialog));
const AdBlueHistoryViewDialog = dynamic(() => import("@/components/fleet/AdBlueHistoryViewDialog").then((m) => m.AdBlueHistoryViewDialog));
const EDIT_EVENT_ICON: Record<AdBlueLogEditEventRow["event"], typeof Plus> = {
  "Log Created": Plus,
  "Log Edited": Pencil,
  "Log Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<AdBlueLogEditEventRow["event"], string> = {
  "Log Created": "bg-accent-surface-strong text-accent-text",
  "Log Edited": "bg-warning-surface-strong text-warning-text",
  "Log Deleted": "bg-danger-surface-strong text-danger-text",
};

/**
 * Truck's Adblue History — a record of every AdBlue fill per truck. Like Fuel
 * History, the fills give each truck's AdBlue km per litre, which (× its
 * manufacturer's AdBlue price) is the AdBlue part of Cost/KM in the Running
 * Cost Calculator and Profitability. Trucks are grouped by manufacturer,
 * managed here under Manufacturers; sold and deleted trucks aren't shown.
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
  const [adblueLogs, setAdblueLogs] = useState<AdBlueLog[] | null>(null);
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<AdBlueLogEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");
  const [manufacturersOpen, setManufacturersOpen] = useState(false);

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

  /** True when saved — the form keeps what was typed if the server refuses it. */
  async function handleSaveAdBlueLog(log: Omit<AdBlueLog, "id" | "createdAt" | "enteredByName" | "version">): Promise<boolean> {
    try {
      await adblueLogsApi.createLog(log);
      showSuccess("AdBlue log saved.");
      setLogTarget(null);
      return true;
    } catch (e: unknown) {
      showError(e instanceof Error && e.message ? e.message : "Could not save the AdBlue log. Please try again.");
      return false;
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

  // The logs are only needed to work out which trucks were filled in the date range.
  const hasRange = Boolean(exportFrom || exportTo);
  useEffect(() => {
    if (!hasRange) return;
    adblueLogsApi.listLogs().then(setAdblueLogs).catch(() => {});
  }, [hasRange, reloadKey]);

  // The API cache answers instantly and refreshes in the background; show the fresher copy when it lands.
  useEffect(() => onRevalidated(() => setReloadKey((k) => k + 1)), []);

  const q = searchQuery.trim().toLowerCase();
  const datedTruckIds = hasRange && adblueLogs
    ? new Set(adblueLogs.filter((l) => inDateRange(l.date, exportFrom, exportTo)).map((l) => l.truckId))
    : null;
  const matches = (t: Truck) =>
    (!datedTruckIds || datedTruckIds.has(t.id)) &&
    (!q || t.registrationNumber?.toLowerCase().includes(q) || t.truckId?.toLowerCase().includes(q));
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <Droplets className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Truck&apos;s Adblue History</h1>
            <p className="mt-0.5 text-sm text-text-secondary">A record of every AdBlue fill across the fleet</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <button
            type="button"
            onClick={() => setManufacturersOpen(true)}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <Factory className="h-4 w-4" />
            Manufacturers
          </button>
        </div>
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
            <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
          </div>
        ) : trucks.length === 0 ? (
          <EmptyState size="compact" illustration="logistics" title="No trucks in the fleet yet" className="rounded-xl border border-separator-border" />
        ) : !trucks.some(matches) ? (
          <EmptyState size="compact" illustration="not-found" title="No trucks match these filters" />
        ) : (
          <>
            {manufacturers.map((m) => {
              const mTrucks = trucks.filter(
                (t) => (t.manufacturer ?? "").trim().toLowerCase() === m.name.trim().toLowerCase() && matches(t),
              );
              // Only manufacturers with trucks (matching the search) get a section.
              if (mTrucks.length === 0) return null;
              const rate = manufacturerRate(m);
              return (
                <section key={m.id}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-solid/10">
                      <TruckIcon className="h-4 w-4 text-accent-text" />
                    </div>
                    <div className="flex flex-1 items-baseline gap-2">
                      <h2 className="text-headline-semibold text-text-primary">{m.name}</h2>
                      <span className="rounded-full bg-accent-surface-strong px-2 py-0.5 text-caption-2-semibold text-accent-text">
                        {mTrucks.length} {mTrucks.length === 1 ? "truck" : "trucks"}
                      </span>
                      <span
                        title="AdBlue cost per litre — set in Manufacturers"
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold",
                          rate != null ? "bg-success-surface text-success-text ring-1 ring-success-border" : "bg-fill-2 text-text-tertiary",
                        )}
                      >
                        <Droplets className="h-3 w-3" />
                        {rate != null ? `₹${rate.toFixed(2)} / L` : "Rate not set"}
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-surface-strong">
                    <TruckIcon className="h-4 w-4 text-warning-text" />
                  </div>
                  <div className="flex flex-1 items-baseline gap-2">
                    <h2 className="text-headline-semibold text-text-primary">Other Trucks</h2>
                    <span className="rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-2-semibold text-warning-text">
                      {otherTrucks.length} {otherTrucks.length === 1 ? "truck" : "trucks"}
                    </span>
                  </div>
                </div>
                <p className="mb-3 text-xs text-text-secondary">
                  These trucks&apos; manufacturer isn&apos;t in the Manufacturers list, so they have no AdBlue rate.
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
          manufacturer={manufacturers.find(
            (m) => m.name.trim().toLowerCase() === (logTarget.manufacturer ?? "").trim().toLowerCase(),
          ) ?? null}
        />
      )}

      <TruckManufacturersDialog
        open={manufacturersOpen}
        onClose={() => setManufacturersOpen(false)}
        trucks={trucks}
        onChanged={() => setReloadKey((k) => k + 1)}
      />

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
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.label.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
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
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.label}</td>
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
    <div className="flex flex-col gap-3 rounded-xl border border-separator-border bg-background-primary-default p-4 shadow-sm transition hover:border-accent-border hover:shadow-md">
      {/* Top row: reg number + truck ID */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-body-semibold text-text-primary">{truck.registrationNumber || "—"}</p>
          <p className="mt-0.5 text-caption-2-medium text-text-tertiary">{truck.truckId}</p>
        </div>
        {truck.truckType && (
          <span className="shrink-0 rounded-full bg-accent-surface px-2 py-0.5 text-caption-2-semibold uppercase text-accent-text">
            {truck.truckType}
          </span>
        )}
      </div>

      {/* Model name */}
      {truck.modelName && (
        <p className="text-[12px] font-semibold text-text-primary">{truck.modelName}</p>
      )}

      {/* Details row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {truck.odometer && (
          <div className="flex items-center gap-1 text-[11px] text-text-secondary">
            <Gauge className="h-3 w-3 text-text-tertiary" />
            {parseInt(truck.odometer).toLocaleString()} km
          </div>
        )}
        {truck.branchRegisteredTo && (
          <div className="flex items-center gap-1 text-[11px] text-text-secondary">
            <MapPin className="h-3 w-3 text-text-tertiary" />
            {truck.branchRegisteredTo}
          </div>
        )}
        {truck.yearOfManufacture && (
          <div className="text-[11px] text-text-secondary">
            {truck.yearOfManufacture}
          </div>
        )}
      </div>

      {/* Tyre layout */}
      {layout && (
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-fill-2 px-2 py-0.5 text-caption-2-semibold text-text-secondary">
            {layout.id}
          </span>
          <span className="text-[11px] text-text-secondary">{totalTyres} tyres total</span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-1 flex gap-2 border-t border-separator-border pt-3">
        {canViewAdblueHistory && (
<button
          type="button"
          onClick={onViewHistory}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-separator-border py-1.5 text-caption-2-semibold text-text-secondary transition hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text"
        >
          <History className="h-3.5 w-3.5" />
          View History
        </button>
)}
        <button
          type="button"
          onClick={onEnterLog}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-solid py-1.5 text-caption-2-semibold text-on-solid transition hover:bg-accent-solid-hover"
        >
          <NotebookPen className="h-3.5 w-3.5" />
          Enter Log
        </button>
      </div>
    </div>
  );
}
