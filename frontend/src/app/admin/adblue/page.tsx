"use client";

import { useEffect, useState } from "react";
import { Droplets, Plus, Pencil, Trash2, Check, Loader2, Truck as TruckIcon, Gauge, MapPin, History, NotebookPen } from "lucide-react";
import { adblueApi, adblueLogsApi, trucksApi, type AdBlueManufacturer } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { showError, showSuccess } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { AdBlueLogFormDialog } from "@/components/fleet/AdBlueLogFormDialog";
import { AdBlueHistoryViewDialog } from "@/components/fleet/AdBlueHistoryViewDialog";
import type { AdBlueLog } from "@/types/adblue-log";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function AdblueManagementPage() {
  const [manufacturers, setManufacturers] = useState<AdBlueManufacturer[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Enter Log dialog
  const [logTarget, setLogTarget] = useState<{ truck: Truck; pricePerLitre: string } | null>(null);

  // View History dialog
  const [historyTruck, setHistoryTruck] = useState<Truck | null>(null);

  async function handleSaveAdBlueLog(log: Omit<AdBlueLog, "id" | "createdAt" | "enteredByName" | "version">) {
    try {
      await adblueLogsApi.createLog(log);
      showSuccess("AdBlue log saved.");
      setLogTarget(null);
    } catch {
      showError("Could not save the AdBlue log. Please try again.");
    }
  }

  useEffect(() => {
    Promise.all([
      adblueApi.listManufacturers(),
      trucksApi.list(),
    ])
      .then(([mfrs, trks]) => { setManufacturers(mfrs); setTrucks(trks); })
      .catch(() => {})
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  function openDialog() {
    setEditingId(null);
    setName(""); setPrice(""); setDialogOpen(true);
  }

  function openEditDialog(m: AdBlueManufacturer) {
    setEditingId(m.id);
    setName(m.name);
    setPrice(parseFloat(m.defaultPricePerLitre) > 0 ? m.defaultPricePerLitre : "");
    setDialogOpen(true);
  }

  async function handleSaveManufacturer() {
    if (!name.trim()) { showError("Manufacturer name is required."); return; }
    setSaving(true);
    try {
      if (editingId) {
        await adblueApi.updateManufacturer(editingId, name.trim(), price);
      } else {
        await adblueApi.createManufacturer(name.trim(), price);
      }
      const updated = await adblueApi.listManufacturers();
      setManufacturers(updated);
      setDialogOpen(false);
      showSuccess(editingId ? "Manufacturer updated." : "Manufacturer added.");
    } catch (e: any) {
      showError(e.message || "Failed to save manufacturer.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await adblueApi.deleteManufacturer(id);
      const updated = await adblueApi.listManufacturers();
      setManufacturers(updated);
    } catch (e: any) {
      showError(e.message || "Failed to delete manufacturer.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-md">
          <Droplets className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Truck&apos;s Adblue History</h1>
          <p className="mt-0.5 text-sm text-gray-500">Track AdBlue usage and stock across the fleet</p>
        </div>
      </div>

      {/* Toolbar: search on the left, date range + View on the right */}
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

      {/* Two-column layout */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* LEFT — Manufacturer fleet sections */}
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          ) : manufacturers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 py-16 text-center">
              <Droplets className="h-10 w-10 text-gray-200" />
              <p className="text-sm font-medium text-gray-400">No manufacturers registered yet.</p>
              <p className="text-xs text-gray-300">Add a manufacturer using the card on the right.</p>
            </div>
          ) : (
            manufacturers.map((m) => {
              const q = searchQuery.trim().toLowerCase();
              const mTrucks = trucks.filter(
                (t) =>
                  t.manufacturer.trim().toLowerCase() === m.name.trim().toLowerCase() &&
                  (!q ||
                    t.registrationNumber?.toLowerCase().includes(q) ||
                    t.truckId?.toLowerCase().includes(q))
              );
              // While searching, hide manufacturers that have no matching truck.
              if (q && mTrucks.length === 0) return null;
              return (
                <section key={m.id}>
                  {/* Section header */}
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
                    {parseFloat(m.defaultPricePerLitre) > 0 && (
                      <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
                        ₹{parseFloat(m.defaultPricePerLitre).toFixed(2)} / L
                      </span>
                    )}
                  </div>

                  {mTrucks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
                      <p className="text-xs text-gray-400">No trucks assigned to this manufacturer yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {mTrucks.map((truck) => (
                        <TruckCard
                          key={truck.id}
                          truck={truck}
                          onViewHistory={() => setHistoryTruck(truck)}
                          onEnterLog={() => setLogTarget({ truck, pricePerLitre: m.defaultPricePerLitre })}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        {/* RIGHT — Registered Manufacturers card */}
        <div className="w-full lg:w-[340px] shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {/* Card header — title/badge and the Add button sit on their own rows
              so they never crowd together at this panel's fixed narrow width. */}
          <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-gray-800">Registered Manufacturers</h2>
              {!loading && (
                <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                  {manufacturers.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={openDialog}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-blue-700"
            >
              <Plus className="h-3 w-3" />
              Add Manufacturer
            </button>
          </div>

          {/* Manufacturer list */}
          <div className="divide-y divide-gray-50">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              </div>
            ) : manufacturers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Droplets className="h-7 w-7 text-gray-200" />
                <p className="text-xs text-gray-400">No manufacturers registered yet.</p>
              </div>
            ) : (
              manufacturers.map((m) => (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{m.name}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {parseFloat(m.defaultPricePerLitre) > 0
                        ? `₹${parseFloat(m.defaultPricePerLitre).toFixed(2)} / litre`
                        : "No default price set"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditDialog(m)}
                      className="rounded-lg p-1.5 text-gray-300 transition hover:bg-blue-50 hover:text-blue-500"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                    >
                      {deletingId === m.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Manufacturer dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? "Edit Manufacturer" : "Add Manufacturer"}
        className="max-w-sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Manufacturer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yara, BASF, AdBlue India"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Default AdBlue Price (Per Litre)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-7 pr-12 text-sm text-gray-800 placeholder-gray-300 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400">/ L</span>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveManufacturer}
              disabled={saving || !name.trim()}
              className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving…" : editingId ? "Save Changes" : "Save Manufacturer"}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Enter AdBlue Log dialog */}
      {logTarget && (
        <AdBlueLogFormDialog
          open={!!logTarget}
          onClose={() => setLogTarget(null)}
          onSave={handleSaveAdBlueLog}
          truck={logTarget.truck}
          pricePerLitre={logTarget.pricePerLitre}
        />
      )}

      {/* View AdBlue History dialog */}
      <AdBlueHistoryViewDialog
        open={!!historyTruck}
        onClose={() => setHistoryTruck(null)}
        truck={historyTruck}
      />
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
        <button
          type="button"
          onClick={onViewHistory}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-[11px] font-bold text-gray-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        >
          <History className="h-3.5 w-3.5" />
          View History
        </button>
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
