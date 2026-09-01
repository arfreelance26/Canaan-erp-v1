"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter, Truck as TruckIcon, ChevronDown, Plus, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { trucksApi, maintenanceApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { AirFilterRecord } from "@/types/truck-maintenance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { formatDate } from "@/lib/format-date";
import { showSuccess, showError } from "@/lib/swal";
import { GlassCombobox } from "@/components/ui/GlassCombobox";

const ALLOWED_ROLES = ["Maintenance", "Admin"];
const SERVICE_INTERVAL_KM = 100_000;

const n = (v: string | number | undefined | null) => {
  const num = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(num) ? num : 0;
};

function DetailChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`truncate text-sm font-medium text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function AddLogDialog({
  trucks,
  onClose,
  onSaved,
}: {
  trucks: Truck[];
  onClose: () => void;
  onSaved: (record: AirFilterRecord) => void;
}) {
  const sortedTrucks = useMemo(
    () => [...trucks].sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber)),
    [trucks]
  );
  const [truckId, setTruckId] = useState(sortedTrucks[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [odometerDuringChange, setOdometerDuringChange] = useState("");
  const [currentOdometer, setCurrentOdometer] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = truckId && date && odometerDuringChange && currentOdometer && !saving;

  async function handleSave() {
    if (!canSave) return;
    if (Number(currentOdometer) < Number(odometerDuringChange)) {
      showError("Current odometer cannot be less than the odometer reading during change.");
      return;
    }
    setSaving(true);
    try {
      const record = await maintenanceApi.createAirFilterRecord({
        truckId, date, odometerDuringChange, currentOdometer, remarks,
      });
      showSuccess("Air filter log added.");
      onSaved(record);
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save this log.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 bg-blue-50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Filter className="h-4 w-4" />
            </div>
            <p className="text-sm font-bold text-gray-900">Add Air Filter Log</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Vehicle Reg No <span className="text-red-500">*</span></label>
            <GlassCombobox
              value={truckId}
              onChange={setTruckId}
              options={sortedTrucks.map((t) => ({ value: t.id, label: `${t.registrationNumber} — ${t.truckId}` }))}
              placeholder="Search vehicle reg no..."
              strictSelect
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Date <span className="text-red-500">*</span></label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Odometer During Change <span className="text-red-500">*</span></label>
              <input type="number" min={0} value={odometerDuringChange} onChange={(e) => setOdometerDuringChange(e.target.value)} placeholder="km" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Current Odometer <span className="text-red-500">*</span></label>
              <input type="number" min={0} value={currentOdometer} onChange={(e) => setCurrentOdometer(e.target.value)} placeholder="km" className={inputCls} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Remarks</label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes…"
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder-gray-400"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Log"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AirFilterRRPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.softwareDesignation)) {
      router.replace("/");
    }
  }, [user, router]);

  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [records, setRecords] = useState<AirFilterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAddLog, setShowAddLog] = useState(false);

  useEffect(() => {
    if (!isAllowed) return;
    Promise.all([trucksApi.list(), maintenanceApi.listAirFilterRecords()])
      .then(([trks, recs]) => { setTrucks(trks); setRecords(recs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey, isAllowed]);

  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("truck_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("air_filter_updated", () => setRefreshKey((k) => k + 1));

  const recordsByTruck = useMemo(() => {
    const map = new Map<string, AirFilterRecord[]>();
    for (const r of records) {
      const list = map.get(r.truckId) ?? [];
      list.push(r);
      map.set(r.truckId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return map;
  }, [records]);

  function toggle(truckId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(truckId)) next.delete(truckId);
      else next.add(truckId);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const visibleTrucks = useMemo(() => {
    const sorted = [...trucks].sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber));
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.registrationNumber.toLowerCase().includes(q) ||
        t.manufacturer.toLowerCase().includes(q) ||
        t.modelName.toLowerCase().includes(q)
    );
  }, [trucks, q]);

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Filter className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Air Filter R&R</h1>
            <p className="mt-0.5 text-sm text-gray-500">Air filter remove &amp; replace records for every truck in the fleet</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddLog(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Log
        </button>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search trucks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        />
      </div>

      {/* Truck cards */}
      {visibleTrucks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Filter className="h-8 w-8 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">
            {trucks.length === 0 ? "No trucks yet." : "No trucks match this search."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleTrucks.map((truck) => {
            const isOpen = expanded.has(truck.id);
            const truckRecords = recordsByTruck.get(truck.id) ?? [];

            return (
              <div
                key={truck.id}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${
                  isOpen ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200 hover:border-blue-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(truck.id)}
                  className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600">
                    <TruckIcon className="h-5 w-5" />
                  </span>

                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    <DetailChip label="Reg No" value={truck.registrationNumber} mono />
                    <DetailChip label="Manufacturer" value={truck.manufacturer} />
                    <DetailChip label="Model" value={truck.modelName} />
                    <DetailChip label="Truck Type" value={truck.truckType} />
                    <DetailChip label="Branch" value={truck.branchRegisteredTo} />
                    <DetailChip label="Odometer" value={truck.odometer ? `${truck.odometer} km` : ""} />
                  </div>

                  <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    truckRecords.length > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {truckRecords.length} record{truckRecords.length !== 1 ? "s" : ""}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/60">
                    {truckRecords.length === 0 ? (
                      <p className="px-5 py-6 text-center text-sm text-gray-400">No air filter R&amp;R records for this truck.</p>
                    ) : (
                      <div className="overflow-x-auto px-3 pb-3 pt-1">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead>
                            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                              <th className="px-3 py-2">S.No</th>
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2 text-right">Odometer During Change</th>
                              <th className="px-3 py-2 text-right">Current Odometer</th>
                              <th className="px-3 py-2 text-right">Running Odometer</th>
                              <th className="px-3 py-2 text-right">Service Due In (1 Lakh KM)</th>
                              <th className="px-3 py-2">Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {truckRecords.map((r, i) => {
                              const odometerDuringChange = n(r.odometerDuringChange);
                              const currentOdometer = n(r.currentOdometer);
                              const runningOdometer = Math.max(currentOdometer - odometerDuringChange, 0);
                              const dueIn = SERVICE_INTERVAL_KM - runningOdometer;
                              const overdue = dueIn < 0;
                              return (
                                <tr
                                  key={r.id}
                                  className={`rounded-lg transition-colors hover:bg-blue-50/50 ${i % 2 === 1 ? "bg-white" : "bg-white/60"}`}
                                >
                                  <td className="rounded-l-lg px-3 py-2.5 text-gray-500">{i + 1}</td>
                                  <td className="px-3 py-2.5 text-gray-700">{r.date ? formatDate(r.date) : "—"}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{odometerDuringChange.toLocaleString("en-IN")} km</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{currentOdometer.toLocaleString("en-IN")} km</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-800">{runningOdometer.toLocaleString("en-IN")} km</td>
                                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${overdue ? "text-red-600" : "text-emerald-600"}`}>
                                    {overdue ? `Overdue by ${Math.abs(dueIn).toLocaleString("en-IN")} km` : `${dueIn.toLocaleString("en-IN")} km`}
                                  </td>
                                  <td className="rounded-r-lg px-3 py-2.5 text-gray-600">{r.remarks || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddLog && (
        <AddLogDialog
          trucks={trucks}
          onClose={() => setShowAddLog(false)}
          onSaved={(record) => {
            setRecords((prev) => [record, ...prev]);
            setExpanded((prev) => new Set(prev).add(record.truckId));
          }}
        />
      )}
    </div>
  );
}
