"use client";

import { useEffect, useState } from "react";
import { Droplets, Plus, Trash2, Check, Loader2, Truck as TruckIcon, Gauge, MapPin } from "lucide-react";
import { adblueApi, trucksApi, type AdBlueManufacturer } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { showError, showSuccess } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";

export default function AdblueManagementPage() {
  const [manufacturers, setManufacturers] = useState<AdBlueManufacturer[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    setName(""); setPrice(""); setDialogOpen(true);
  }

  async function handleAdd() {
    if (!name.trim()) { showError("Manufacturer name is required."); return; }
    setSaving(true);
    try {
      await adblueApi.createManufacturer(name.trim(), price);
      const updated = await adblueApi.listManufacturers();
      setManufacturers(updated);
      setDialogOpen(false);
      showSuccess("Manufacturer added.");
    } catch (e: any) {
      showError(e.message || "Failed to add manufacturer.");
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
          <h1 className="text-2xl font-bold text-gray-900">AdBlue Management</h1>
          <p className="mt-0.5 text-sm text-gray-500">Track AdBlue usage and stock across the fleet</p>
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
              const mTrucks = trucks.filter(
                (t) => t.manufacturer.trim().toLowerCase() === m.name.trim().toLowerCase()
              );
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
                          manufacturerDefaultPrice={m.defaultPricePerLitre}
                          onConsumptionSaved={(id, val) =>
                            setTrucks((prev) =>
                              prev.map((t) => t.id === id ? { ...t, adblueConsumption: val } : t)
                            )
                          }
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
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-5 py-3.5">
            <h2 className="text-sm font-bold text-gray-800">Registered Manufacturers</h2>
            <div className="flex items-center gap-2.5">
              {!loading && (
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                  {manufacturers.length}
                </span>
              )}
              <button
                type="button"
                onClick={openDialog}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700"
              >
                <Plus className="h-3 w-3" />
                Add Manufacturer
              </button>
            </div>
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
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    disabled={deletingId === m.id}
                    className="shrink-0 rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  >
                    {deletingId === m.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Manufacturer dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Add Manufacturer"
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
              onClick={handleAdd}
              disabled={saving || !name.trim()}
              className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving…" : "Save Manufacturer"}
            </button>
          </div>
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
  manufacturerDefaultPrice,
  onConsumptionSaved,
}: {
  truck: Truck;
  manufacturerDefaultPrice: string;
  onConsumptionSaved: (id: string, val: string) => void;
}) {
  const savedLPerKm = truck.adblueConsumption ?? "";
  const [lPerKm, setLPerKm] = useState(savedLPerKm);
  const [lPer1000Km, setLPer1000Km] = useState(() => {
    const n = parseFloat(savedLPerKm);
    return isNaN(n) || savedLPerKm === "" ? "" : (n * 1000).toFixed(3);
  });
  const [saving, setSaving] = useState(false);
  const layout = truck.tyreLayout ? getTyreLayout(truck.tyreLayout) : null;
  const totalTyres = layout ? totalTyresFromLayout(layout.id) : null;

  function handleLPerKmChange(val: string) {
    setLPerKm(val);
    const n = parseFloat(val);
    setLPer1000Km(val === "" || isNaN(n) ? "" : (n * 1000).toFixed(3));
  }

  function handleLPer1000KmChange(val: string) {
    setLPer1000Km(val);
    const n = parseFloat(val);
    setLPerKm(val === "" || isNaN(n) ? "" : (n / 1000).toFixed(5));
  }

  const isDirty = lPerKm !== savedLPerKm;

  const lPerKmNum = parseFloat(lPerKm);
  const defaultPriceNum = parseFloat(manufacturerDefaultPrice);
  const costPerKm =
    lPerKm !== "" && !isNaN(lPerKmNum) && !isNaN(defaultPriceNum) && defaultPriceNum > 0
      ? lPerKmNum * defaultPriceNum
      : null;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await trucksApi.update(truck.id, { ...truck, adblueConsumption: lPerKm });
      onConsumptionSaved(truck.id, updated.adblueConsumption ?? "");
    } catch {
      setLPerKm(savedLPerKm);
      const n = parseFloat(savedLPerKm);
      setLPer1000Km(savedLPerKm === "" || isNaN(n) ? "" : (n * 1000).toFixed(3));
    } finally {
      setSaving(false);
    }
  }

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

      {/* AdBlue Consumption */}
      <div className="mt-1 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-blue-400">
          AdBlue Consumption
        </p>
        <div className="flex flex-col gap-1.5">
          {/* L/km */}
          <div className="relative">
            <input
              type="number"
              min="0"
              step="any"
              value={lPerKm}
              onChange={(e) => handleLPerKmChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="0.00000"
              className="w-full rounded-md border border-blue-100 bg-white py-1.5 pl-2.5 pr-14 text-sm font-medium text-gray-800 placeholder-gray-300 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400">
              L / km
            </span>
          </div>
          {/* L/1000km */}
          <div className="relative">
            <input
              type="number"
              min="0"
              step="any"
              value={lPer1000Km}
              onChange={(e) => handleLPer1000KmChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="0.000"
              className="w-full rounded-md border border-blue-100 bg-white py-1.5 pl-2.5 pr-20 text-sm font-medium text-gray-800 placeholder-gray-300 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400">
              L / 1000 km
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {saving ? "Saving…" : "Save"}
        </button>

        {costPerKm !== null && (
          <div className="mt-2 rounded-md border border-green-100 bg-green-50/60 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-green-600">
                AdBlue Cost Per KM
              </p>
              <p className="text-sm font-bold text-green-700">
                ₹{costPerKm.toFixed(4)} / km
              </p>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-green-500/80">
              = Consumption ({lPerKmNum.toFixed(5)} L/km) × Manufacturer price (₹{defaultPriceNum.toFixed(2)}/L)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
