"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Navigation, Search, Truck, X } from "lucide-react";
import { notificationsApi, tripsApi, customersApi } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAuth } from "@/context/AuthContext";
import type { Trip } from "@/types/trip";
import type { Customer } from "@/types/customer";
import { ACTIVE_TRIP_STATUSES, getStageLabel } from "@/lib/trip-stage";

// Pipeline order, used both for the summary pills and to color each row's badge.
const STAGE_ORDER = [
  "Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded",
  "Completed", "Pending Sheet Delivery", "Pending Sheet Entry", "Pending Verification", "Ready to Invoice",
] as const;

const STAGE_CLASSES: Record<string, string> = {
  "Assigned":                "bg-sky-100 text-sky-700",
  "Started":                 "bg-violet-100 text-violet-700",
  "Loaded":                  "bg-violet-100 text-violet-700",
  "On-Transit":              "bg-violet-100 text-violet-700",
  "Reached":                 "bg-violet-100 text-violet-700",
  "Unloaded":                "bg-violet-100 text-violet-700",
  "Completed":               "bg-teal-100 text-teal-700",
  "Pending Sheet Delivery":  "bg-amber-100 text-amber-700",
  "Pending Sheet Entry":     "bg-orange-100 text-orange-700",
  "Pending Verification":    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  "Ready to Invoice":        "bg-emerald-100 text-emerald-700",
};

// Selected state: the soft tint above turns into a solid fill.
const STAGE_ACTIVE_CLASSES: Record<string, string> = {
  "Assigned":                "bg-sky-600 text-white",
  "Started":                 "bg-violet-600 text-white",
  "Loaded":                  "bg-violet-600 text-white",
  "On-Transit":              "bg-violet-600 text-white",
  "Reached":                 "bg-violet-600 text-white",
  "Unloaded":                "bg-violet-600 text-white",
  "Completed":               "bg-teal-600 text-white",
  "Pending Sheet Delivery":  "bg-amber-500 text-white",
  "Pending Sheet Entry":     "bg-orange-500 text-white",
  "Pending Verification":    "bg-fuchsia-600 text-white",
  "Ready to Invoice":        "bg-emerald-600 text-white",
};

function fmtHire(v?: string | null): string {
  const n = v ? Number(v) : 0;
  if (!Number.isFinite(n) || n === 0) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    // Handle plain YYYY-MM-DD without timezone shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      return new Date(y, m - 1, day).toLocaleDateString("en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric",
      }).replace(/\//g, "-");
    }
    const utc = d.endsWith("Z") || d.includes("+") ? d : d + "Z";
    return new Date(utc).toLocaleDateString("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "2-digit", year: "numeric",
    }).replace(/\//g, "-");
  } catch {
    return d;
  }
}

export function CurrentTripsCard() {
  const { user } = useAuth();
  const canSeeHire = user?.softwareDesignation === "Admin" || user?.softwareDesignation === "Accounts";
  // Customer Account column — Admin, Commercial Manager (+ Assistant, who
  // has equal access throughout this app), and Accounts only.
  const canSeeCustomer =
    user?.softwareDesignation === "Admin" ||
    user?.softwareDesignation === "Commercial Manager" ||
    user?.softwareDesignation === "Assistant Commercial Manager" ||
    user?.softwareDesignation === "Accounts";
  // Tailwind's JIT scans source text for literal class strings, so each
  // combination must appear verbatim here — a runtime-built arbitrary-value
  // class (e.g. via array.join) would never get its CSS generated.
  const gridCols = canSeeCustomer
    ? (canSeeHire
        ? "grid-cols-[1.2fr_1.3fr_1fr_1fr_1.5fr_1.2fr_100px_100px_170px]"
        : "grid-cols-[1.2fr_1.3fr_1fr_1fr_1.5fr_1.2fr_100px_170px]")
    : (canSeeHire
        ? "grid-cols-[1.2fr_1fr_1fr_1.5fr_1.2fr_100px_100px_170px]"
        : "grid-cols-[1.2fr_1fr_1fr_1.5fr_1.2fr_100px_170px]");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  // Track IDs of trips newly assigned so we can highlight them
  const [newTripIds, setNewTripIds] = useState<Set<string>>(new Set());
  const fadeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    tripsApi.list()
      .then((all) => setTrips(all.filter((t) => {
        if (t.isInvoiced || t.invoiceWaived) return false; // done — drop off the card
        return ACTIVE_TRIP_STATUSES.has(t.status ?? "") || t.status === "Completed";
      })))
      .catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    if (!canSeeCustomer) return;
    customersApi.list().then(setCustomers).catch(() => {});
  }, [canSeeCustomer]);

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const markNew = useCallback((id: string) => {
    if (!id) return;
    setNewTripIds((prev) => new Set(prev).add(id));
    // Clear the NEW badge after 15 seconds
    const timer = setTimeout(() => {
      setNewTripIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      fadeTimers.current.delete(id);
    }, 15000);
    fadeTimers.current.set(id, timer);
  }, []);

  // On mount: replay persisted unread trip_assigned notifications so users who
  // were offline still see NEW badges for recently assigned trips.
  // Also marks them as read so the notifications table stays clean
  // (TripEventToastHub previously handled this; it has been removed).
  useEffect(() => {
    const TRIP_TYPES = new Set(["trip_assigned", "trip_closed"]);
    notificationsApi.list(true).then((rows) => {
      rows
        .filter((r) => TRIP_TYPES.has(r.eventType) && r.tripIdStr)
        .forEach((r) => {
          markNew(r.tripIdStr);
          notificationsApi.markRead(r.id).catch(() => {});
        });
    }).catch(() => {});
  }, [markNew]);

  useAutoRefresh(() => setRefreshKey((k) => k + 1), 30000);
  useWebSocketEvent("trip_status_changed", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_closed",         () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_updated",        () => setRefreshKey((k) => k + 1));

  useWebSocketEvent("trip_assigned", (p) => {
    setRefreshKey((k) => k + 1);
    // p.trip_id is the display trip ID string (e.g. "CGI/25-26/T/0001")
    markNew(String(p.trip_id ?? ""));
  });

  // Cleanup timers on unmount
  useEffect(() => () => { fadeTimers.current.forEach(clearTimeout); }, []);

  const [tripSearch, setTripSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of trips) {
      const label = getStageLabel(t);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return counts;
  }, [trips]);

  const filteredTrips = useMemo(() => {
    let list = trips;
    if (stageFilter) list = list.filter((t) => getStageLabel(t) === stageFilter);
    const q = tripSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) =>
      (t.tripId          ?? "").toLowerCase().includes(q) ||
      (t.truckRegistration ?? "").toLowerCase().includes(q) ||
      (t.driverName      ?? "").toLowerCase().includes(q) ||
      (t.origin          ?? "").toLowerCase().includes(q) ||
      (t.destination     ?? "").toLowerCase().includes(q) ||
      (canSeeCustomer && (customerById.get(t.customerId)?.name ?? "").toLowerCase().includes(q))
    );
  }, [trips, tripSearch, stageFilter, customerById, canSeeCustomer]);

  const newCount = newTripIds.size;

  return (
    <div className="dk-inset overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Navigation className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-sm font-bold text-gray-900">Current Trips</h2>
          {/* Live indicator */}
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <span className="animate-pulse rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
              {newCount} new
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-semibold text-gray-600">
            <span className="font-bold text-gray-900">{trips.length}</span> {trips.length === 1 ? "trip" : "trips"}
          </span>
          {/* Trip ID search — collapsed icon that expands on hover / focus */}
          <label
            className={`group flex h-7 cursor-text items-center overflow-hidden rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition-all duration-300 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 hover:border-gray-300 ${
              tripSearch ? "w-56" : "w-7 hover:w-56 focus-within:w-56"
            }`}
          >
            <Search className="ml-[7px] h-3.5 w-3.5 shrink-0" />
            <input
              type="text"
              value={tripSearch}
              onChange={(e) => setTripSearch(e.target.value)}
              placeholder="Trip ID, Truck, Driver, From/To…"
              className="ml-2 min-w-0 flex-1 bg-transparent pr-2 text-[11px] text-gray-700 outline-none placeholder:text-gray-400"
            />
            {tripSearch && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setTripSearch(""); }}
                className="mr-2 shrink-0 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </label>
        </div>
      </div>

      {/* Stage summary pills — click to filter, click again to clear */}
      {trips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 bg-white px-5 py-2.5">
          {STAGE_ORDER.filter((label) => (stageCounts.get(label) ?? 0) > 0).map((label) => {
            const count = stageCounts.get(label) ?? 0;
            const active = stageFilter === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStageFilter((prev) => (prev === label ? null : label))}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2.5 pr-0.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-200 ${
                  active
                    ? `${STAGE_ACTIVE_CLASSES[label] ?? "bg-gray-700 text-white"} shadow-sm`
                    : `${STAGE_CLASSES[label] ?? "bg-gray-100 text-gray-600"} hover:brightness-95`
                }`}
              >
                {label}
                <span
                  className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold tabular-nums ${
                    active ? "bg-white/25 text-white" : "bg-white/80"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {stageFilter && (
            <button
              type="button"
              onClick={() => setStageFilter(null)}
              className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Column headers */}
      {trips.length > 0 && (
        <div className={`grid ${gridCols} gap-x-3 border-b border-gray-100 bg-gray-50/70 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400`}>
          <span>Trip ID</span>
          {canSeeCustomer && <span>Customer Account</span>}
          <span>From</span>
          <span>To</span>
          <span>Driver</span>
          <span>Truck</span>
          {canSeeHire && <span className="text-right">Hire Amount</span>}
          <span className="text-right">Booked On</span>
          <span className="text-right">Status</span>
        </div>
      )}

      {/* Trip rows */}
      {filteredTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <Truck className="h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">
            {tripSearch ? "No trips match your search." : stageFilter ? `No trips in "${stageFilter}".` : "No current trips"}
          </p>
          {!tripSearch && !stageFilter && <p className="text-xs text-gray-300">Every trip is invoiced or waived</p>}
        </div>
      ) : (
        <div className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
          {filteredTrips.map((trip) => {
            const isNew = newTripIds.has(trip.tripId) || newTripIds.has(String(trip.id));
            const stageLabel = getStageLabel(trip);
            return (
              <div
                key={trip.id}
                className={`grid ${gridCols} items-center gap-x-3 px-5 py-2.5 text-xs transition-colors ${
                  isNew ? "bg-blue-50/70" : "hover:bg-gray-50/80"
                }`}
              >
                {/* Trip ID */}
                <span className="flex min-w-0 items-center gap-1.5">
                  {isNew && (
                    <span className="shrink-0 rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      New
                    </span>
                  )}
                  <span className="truncate rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-600">
                    {trip.tripId || "—"}
                  </span>
                </span>

                {/* Customer Account */}
                {canSeeCustomer && (
                  <span className="truncate font-medium text-gray-800" title={customerById.get(trip.customerId)?.name ?? ""}>
                    {customerById.get(trip.customerId)?.name ?? "—"}
                  </span>
                )}

                {/* Origin */}
                <span className="truncate font-medium text-gray-800">{trip.origin || "—"}</span>

                {/* Destination */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />
                  <span className="truncate text-gray-600">{trip.destination || "—"}</span>
                </div>

                {/* Driver name */}
                <span className="truncate font-medium text-gray-800" title={trip.driverName ?? ""}>{trip.driverName ?? "—"}</span>

                {/* Truck registration */}
                <span className="w-fit shrink-0 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-medium text-gray-600">
                  {trip.truckRegistration ?? "—"}
                </span>

                {/* Hire amount — Admin/Accounts only */}
                {canSeeHire && (
                  <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-gray-900">
                    {fmtHire(trip.transportHireAmount)}
                  </span>
                )}

                {/* Booking created date */}
                <span className="shrink-0 text-right text-[11px] tabular-nums text-gray-500">
                  {fmtDate(trip.bookingCreatedDate || trip.assignedDate)}
                </span>

                {/* Status badge */}
                <span className="flex justify-end">
                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STAGE_CLASSES[stageLabel] ?? "bg-gray-100 text-gray-600"}`}>
                    <span className="h-1 w-1 rounded-full bg-current" />
                    {stageLabel}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
