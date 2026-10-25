"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Truck as TruckIcon, FileText, ClipboardList, Calculator, Route, Gauge, IndianRupee, ChevronDown } from "lucide-react";
import { driversApi, tripsApi, trucksApi, customersApi } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { TripBreakdownDialog } from "@/components/insights/TripBreakdownDialog";
import { TripAuditActions, TripAuditBadge } from "@/components/audit/TripAuditActions";
import { truckImageUrl } from "@/components/fleet/VehicleImages";
import { COMPLIANCE_DOCS } from "@/lib/compliance-docs";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

/** Hire for a trip, after commission — the same figure Profitability uses. */
function hireForTrip(trip: Trip, sheet: TripSheetData | undefined): number {
  if (!sheet) return 0;
  return (parseFloat(sheet.hireAmount || "0") || 0) - (parseFloat(trip.transportCommissionAmount || "0") || 0);
}

function kmForTrip(sheet: TripSheetData | undefined): number {
  return parseFloat(sheet?.totalKm || "0") || 0;
}

const money = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kms = (v: number) => `${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} km`;

/** The truck's Vehicle Identity Image, or a truck icon. */
function TruckThumb({ truck }: { truck: Truck }) {
  const [broken, setBroken] = useState(false);
  const src = truck.truckPhotosFileName && !broken ? truckImageUrl(truck, "photo") : null;
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#1b2b5e] to-[#2d4590] text-white/80 shadow-sm">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <TruckIcon className="h-5 w-5" />
      )}
    </span>
  );
}

/**
 * Auditor Pages → Vehicle Record: Driver Record, by vehicle. One card per
 * truck (sold / deleted ones too, tagged, so their past trips can still be
 * audited) with its trips, km and hire for the date range; expand to see
 * every trip with a trip sheet, open its Booking Sheet / Trip Sheet / Trip
 * Breakdown, and Flag or Verify it — the same audit action as Driver Record.
 */
export default function VehicleRecordPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [removedTrucks, setRemovedTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  // Ids already requested — auto-refresh replaces `trips` every few seconds,
  // and a slow batch must be left to finish rather than restarted (same as
  // Driver Record).
  const requestedSheetIds = useRef<Set<string>>(new Set());
  const requestedClosureIds = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bookingTrip, setBookingTrip] = useState<Trip | null>(null);
  const [sheetTrip, setSheetTrip] = useState<Trip | null>(null);
  const [breakdownTrip, setBreakdownTrip] = useState<Trip | null>(null);

  // Flag / Verify hand the updated trip back — patch it in for instant feedback.
  const patchTrip = (updated: Trip) => setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // allSettled — one source failing mustn't blank the page.
  useEffect(() => {
    Promise.allSettled([trucksApi.list(), trucksApi.listRemoved(), driversApi.list(), tripsApi.list(), customersApi.list()])
      .then(([tr, rm, d, t, c]) => {
        if (tr.status === "fulfilled") setTrucks(tr.value);
        if (rm.status === "fulfilled") setRemovedTrucks(rm.value);
        if (d.status === "fulfilled") setDrivers(d.value);
        if (t.status === "fulfilled") setTrips(t.value);
        if (c.status === "fulfilled") setCustomers(c.value);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("truck_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));

  // Every truck: active first, then sold / deleted.
  const allTrucks = useMemo(() => {
    const active = new Set(trucks.map((t) => t.id));
    return [...trucks, ...removedTrucks.filter((t) => !active.has(t.id))];
  }, [trucks, removedTrucks]);
  const truckById = useMemo(() => new Map(allTrucks.map((t) => [t.truckId, t])), [allTrucks]);
  const driverById = useMemo(() => new Map(drivers.map((d) => [d.driverId, d])), [drivers]);

  const q = searchQuery.trim().toLowerCase();
  const filteredTrucks = allTrucks.filter((t) =>
    !q ||
    t.registrationNumber?.toLowerCase().includes(q) ||
    t.truckId?.toLowerCase().includes(q)
  );

  // Trips with a trip sheet in the date range (same rule as Driver Record).
  const tripsInRange = useMemo(() => trips.filter((t) => {
    if (!t.scheduledDate || !t.hasSheet) return false;
    if (dateFrom && t.scheduledDate < dateFrom) return false;
    if (dateTo && t.scheduledDate > dateTo) return false;
    return true;
  }), [trips, dateFrom, dateTo]);

  // Lazy-load trip sheets / booking-sheet closures for in-range trips only.
  useEffect(() => {
    const toFetch = tripsInRange.filter((t) => !sheets.has(t.id) && !requestedSheetIds.current.has(t.id));
    if (toFetch.length === 0) return;
    const ids = toFetch.map((t) => t.id);
    for (const id of ids) requestedSheetIds.current.add(id);
    tripsApi.getSheetsBulk(ids)
      .then((shs) => { if (shs.size) setSheets((prev) => new Map([...prev, ...shs])); })
      .catch(() => { for (const id of ids) requestedSheetIds.current.delete(id); });
  }, [tripsInRange, sheets]);
  useEffect(() => {
    const toFetch = tripsInRange.filter((t) => t.hasClosure && !closures.has(t.id) && !requestedClosureIds.current.has(t.id));
    if (toFetch.length === 0) return;
    const ids = toFetch.map((t) => t.id);
    for (const id of ids) requestedClosureIds.current.add(id);
    tripsApi.getClosuresBulk(ids)
      .then((cls) => { if (cls.size) setClosures((prev) => new Map([...prev, ...cls])); })
      .catch(() => { for (const id of ids) requestedClosureIds.current.delete(id); });
  }, [tripsInRange, closures]);

  const tripsByTruck = useMemo(() => {
    const map = new Map<string, Trip[]>();
    for (const t of tripsInRange) {
      const list = map.get(t.vehicleId);
      if (list) list.push(t); else map.set(t.vehicleId, [t]);
    }
    for (const list of map.values()) list.sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));
    return map;
  }, [tripsInRange]);

  const totalsByTruck = useMemo(() => {
    const map = new Map<string, { km: number; hire: number }>();
    for (const t of tripsInRange) {
      const sheet = sheets.get(t.id);
      if (!sheet) continue;
      const cur = map.get(t.vehicleId) ?? { km: 0, hire: 0 };
      cur.km += kmForTrip(sheet);
      cur.hire += hireForTrip(t, sheet);
      map.set(t.vehicleId, cur);
    }
    return map;
  }, [tripsInRange, sheets]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
          <TruckIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Vehicle Based Record</h1>
          <p className="mt-0.5 text-sm text-gray-500">Read-only record of every vehicle</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by registration or truck ID…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex items-center gap-2">
          {!dateFrom && !dateTo && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
              Showing lifetime record
            </span>
          )}
          <div title="Scopes Total Trips, KM and Hire to this date range — leave blank for the lifetime record">
            <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </div>
        </div>
      </div>

      {filteredTrucks.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {allTrucks.length === 0 ? "No vehicles yet." : "No vehicles match this search."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTrucks.map((truck) => {
            const truckTrips = tripsByTruck.get(truck.truckId) ?? [];
            const totals = totalsByTruck.get(truck.truckId) ?? { km: 0, hire: 0 };
            const isExpanded = expandedIds.has(truck.id);
            const removed = truck.disposalType ?? null;
            const model = [truck.manufacturer, truck.modelName].filter((v) => v && v.toLowerCase() !== "nan").join(" ");
            const docs = COMPLIANCE_DOCS.filter((d) => !!truck[d.fileNameKey]);
            return (
              <div
                key={truck.id}
                className={cn(
                  "rounded-2xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:border-blue-100 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]",
                  removed && "bg-gray-50/90",
                )}
              >
                <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6">
                  {/* Photo + Registration / Truck ID */}
                  <div className="flex min-w-0 shrink-0 items-center gap-3 lg:w-64">
                    <TruckThumb truck={truck} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-bold text-gray-900">
                        {truck.registrationNumber || "—"}
                        {removed && (
                          <span className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                            removed === "Sold" ? "bg-sky-100 text-sky-700" : "bg-gray-200 text-gray-600",
                          )}>
                            {removed}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-gray-500">{truck.truckId}{model && ` · ${model}`}</p>
                    </div>
                  </div>

                  <div className="hidden h-12 w-px shrink-0 bg-gray-100 lg:block" />
                  <div className="min-w-0 shrink-0 text-xs lg:w-24">
                    <p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-gray-400">
                      <Route className="h-3 w-3" /> Total Trips
                    </p>
                    <p className="mt-0.5 font-medium text-gray-700">{truckTrips.length}</p>
                  </div>
                  <div className="hidden h-12 w-px shrink-0 bg-gray-100 lg:block" />
                  <div className="min-w-0 shrink-0 text-xs lg:w-28">
                    <p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-gray-400">
                      <Gauge className="h-3 w-3" /> Total KM
                    </p>
                    <p className="mt-0.5 font-medium tabular-nums text-gray-700">{kms(totals.km)}</p>
                  </div>
                  <div className="hidden h-12 w-px shrink-0 bg-gray-100 lg:block" />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-gray-400">
                      <IndianRupee className="h-3 w-3" /> Hire
                    </p>
                    <p className="mt-0.5 font-medium tabular-nums text-gray-700">{money(totals.hire)}</p>
                  </div>

                  {/* Uploaded documents */}
                  <div className="flex max-w-xs shrink-0 flex-wrap gap-1.5">
                    {docs.map((d) => (
                      <span key={d.key} className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600" title={String(truck[d.fileNameKey])}>
                        <FileText className="h-3 w-3" /> {d.short}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpanded(truck.id)}
                    aria-label={isExpanded ? "Collapse trip details" : "Expand trip details"}
                    aria-expanded={isExpanded}
                    className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-full border border-gray-200 text-gray-500 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 lg:self-auto"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-180")} />
                  </button>
                </div>

                {/* Every trip in the range, with its km and hire summing to the figures above. */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                    {truckTrips.length === 0 ? (
                      <p className="py-3 text-center text-xs text-gray-400">No trips in this date range.</p>
                    ) : (
                      <div className="overflow-auto rounded-lg border border-gray-100">
                        <table className="w-full min-w-[760px] text-left text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Trip ID</th>
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Date</th>
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Driver</th>
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Route</th>
                              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-gray-400">KM</th>
                              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-gray-400">Hire</th>
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Documents</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {truckTrips.map((trip) => {
                              const sheet = sheets.get(trip.id);
                              const driver = driverById.get(trip.driverId);
                              return (
                                <tr key={trip.id}>
                                  <td className="px-3 py-2 font-medium text-gray-800">
                                    {trip.tripId}
                                    <TripAuditBadge trip={trip} />
                                  </td>
                                  <td className="px-3 py-2 text-gray-600">{formatDate(trip.scheduledDate)}</td>
                                  <td className="px-3 py-2 text-gray-600">
                                    {driver?.name || trip.driverName || "—"}
                                    {trip.driverId && <span className="block text-[10px] text-gray-400">{trip.driverId}</span>}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600">
                                    {trip.origin || "—"} <span className="text-gray-300">→</span> {trip.destination || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                    {sheet ? kms(kmForTrip(sheet)) : <span className="text-gray-400">…</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-700">
                                    {sheet ? money(hireForTrip(trip, sheet)) : <span className="text-gray-400">…</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex flex-wrap gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setBookingTrip(trip)}
                                          disabled={!trip.hasClosure}
                                          className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                                          title={trip.hasClosure ? undefined : "No booking sheet recorded for this trip"}
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          View Booking Sheet
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setSheetTrip(trip)}
                                          className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                                        >
                                          <ClipboardList className="h-3.5 w-3.5" />
                                          View Trip Sheet
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setBreakdownTrip(trip)}
                                          className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                                        >
                                          <Calculator className="h-3.5 w-3.5" />
                                          Trip Breakdown
                                        </button>
                                      </div>
                                      {/* Auditor decision buttons — shared with Driver Record. */}
                                      <TripAuditActions trip={trip} onUpdated={patchTrip} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-100 bg-gray-50">
                              <td colSpan={4} className="px-3 py-2 text-right font-semibold text-gray-600">Total</td>
                              <td className="px-3 py-2 text-right font-bold tabular-nums text-gray-900">{kms(totals.km)}</td>
                              <td className="px-3 py-2 text-right font-bold tabular-nums text-gray-900">{money(totals.hire)}</td>
                              <td />
                            </tr>
                          </tfoot>
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

      <BookingSheetDialog
        open={bookingTrip !== null}
        trip={bookingTrip}
        closure={bookingTrip ? closures.get(bookingTrip.id) : undefined}
        driver={bookingTrip ? driverById.get(bookingTrip.driverId) : undefined}
        truck={bookingTrip ? truckById.get(bookingTrip.vehicleId) : undefined}
        customers={customers}
        readOnly
        onClose={() => setBookingTrip(null)}
        onSubmit={() => {}}
      />
      <TripSheetDialog
        open={sheetTrip !== null}
        trip={sheetTrip}
        closure={sheetTrip ? closures.get(sheetTrip.id) : undefined}
        existingSheet={sheetTrip ? sheets.get(sheetTrip.id) : undefined}
        readOnly
        drivers={drivers}
        trucks={allTrucks}
        onClose={() => setSheetTrip(null)}
        onSubmit={() => {}}
      />
      {/* Same window as Profitability's — hire, each trip expense, km, Cost/KM. */}
      <TripBreakdownDialog
        open={breakdownTrip !== null}
        onClose={() => setBreakdownTrip(null)}
        tripId={breakdownTrip ? Number(breakdownTrip.id) : null}
        mode="Advanced"
      />
    </div>
  );
}
