"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Navigation, Search, Truck, X } from "lucide-react";
import { notificationsApi, tripsApi } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAuth } from "@/context/AuthContext";
import type { Trip } from "@/types/trip";

const ACTIVE_STATUSES = new Set(["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);

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

// Once a trip physically finishes ("Completed"), it still has a whole paper
// trail to clear before it's actually done — booking sheet closed, trip sheet
// delivered, received, entered, then verified — before it's invoiced or
// waived. The card tracks it through every one of those stages and only
// drops it once invoiced/waived.
//
// hasClosure is checked BEFORE hasSheet/tripSheetReceived: a trip with no
// booking-sheet closure at all was previously falling straight into "Pending
// Sheet Delivery" alongside trips that DO have a closure and are genuinely
// just waiting on the trip sheet — inflating that bucket by exactly the
// count of closure-less trips. Those two are different stages.
//
// hasSheet is then checked ahead of the collected/received checkboxes: a
// trip sheet entered directly (e.g. by Admin/Accounts, bypassing the Yard
// Supervisor "collected" -> Trip Sheet Register "received" workflow) can
// have real sheet data with tripSheetReceived still false.
function getStageLabel(trip: Trip): string {
  if (trip.status === "Assigned") return "Assigned";
  if (trip.status === "Completed") {
    if (!trip.hasClosure) return "Completed"; // physically done, booking sheet not closed yet
    if (trip.hasSheet) {
      return trip.verificationStatus !== "verified" ? "Pending Verification" : "Ready to Invoice";
    }
    return trip.tripSheetReceived ? "Pending Sheet Entry" : "Pending Sheet Delivery";
  }
  // Started / Loaded / On-Transit / Reached / Unloaded — in-transit movement.
  return trip.status ?? "—";
}

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
  const gridCols = canSeeHire
    ? "grid-cols-[1.2fr_1fr_1fr_1.5fr_1.2fr_100px_100px_170px]"
    : "grid-cols-[1.2fr_1fr_1fr_1.5fr_1.2fr_100px_170px]";
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  // Track IDs of trips newly assigned so we can highlight them
  const [newTripIds, setNewTripIds] = useState<Set<string>>(new Set());
  const fadeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    tripsApi.list()
      .then((all) => setTrips(all.filter((t) => {
        if (t.isInvoiced || t.invoiceWaived) return false; // done — drop off the card
        return ACTIVE_STATUSES.has(t.status ?? "") || t.status === "Completed";
      })))
      .catch(() => {});
  }, [refreshKey]);

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
      (t.destination     ?? "").toLowerCase().includes(q)
    );
  }, [trips, tripSearch, stageFilter]);

  const newCount = newTripIds.size;

  return (
    <div className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/60 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Navigation className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-blue-900">Current Trips</h2>
          {/* Live indicator */}
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <span className="animate-pulse rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
              {newCount} new
            </span>
          )}
          <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-700">
            {trips.length} {trips.length === 1 ? "trip" : "trips"}
          </span>
          {/* Trip ID search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-blue-400" />
            <input
              type="text"
              value={tripSearch}
              onChange={(e) => setTripSearch(e.target.value)}
              placeholder="Trip ID, Truck, Driver, From/To…"
              className="h-6 w-48 rounded-full border border-blue-200 bg-blue-50 pl-6 pr-5 text-[11px] text-blue-800 placeholder:text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {tripSearch && (
              <button
                onClick={() => setTripSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stage summary pills — click to filter, click again to clear */}
      {trips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-blue-100 bg-white px-5 py-2.5">
          {STAGE_ORDER.filter((label) => (stageCounts.get(label) ?? 0) > 0).map((label) => {
            const count = stageCounts.get(label) ?? 0;
            const active = stageFilter === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStageFilter((prev) => (prev === label ? null : label))}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-all ${STAGE_CLASSES[label] ?? "bg-gray-100 text-gray-600"} ${
                  active ? "ring-2 ring-offset-1 ring-current" : "hover:opacity-80"
                }`}
              >
                {label}
                <span className="rounded-full bg-white/70 px-1.5 py-0 text-[10px] font-extrabold">{count}</span>
              </button>
            );
          })}
          {stageFilter && (
            <button
              type="button"
              onClick={() => setStageFilter(null)}
              className="ml-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Column headers */}
      {trips.length > 0 && (
        <div className={`grid ${gridCols} gap-x-3 border-b border-gray-100 bg-gray-50/70 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400`}>
          <span>Trip ID</span>
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
                  isNew
                    ? "border-l-4 border-l-blue-500 bg-blue-50"
                    : "border-l-4 border-l-transparent hover:bg-gray-50"
                }`}
              >
                {/* Trip ID */}
                <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-indigo-600">
                  {isNew && (
                    <span className="shrink-0 rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      New
                    </span>
                  )}
                  <span className="truncate">{trip.tripId || "—"}</span>
                </span>

                {/* Origin */}
                <span className="truncate font-medium text-gray-800">{trip.origin || "—"}</span>

                {/* Destination */}
                <div className="flex min-w-0 items-center gap-1">
                  <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />
                  <span className="truncate text-gray-600">{trip.destination || "—"}</span>
                </div>

                {/* Driver name */}
                <span className="truncate text-sm font-medium text-gray-700">{trip.driverName ?? "—"}</span>

                {/* Truck registration */}
                <span className="shrink-0 font-mono text-[11px] text-gray-600">
                  {trip.truckRegistration ?? "—"}
                </span>

                {/* Hire amount — Admin/Accounts only */}
                {canSeeHire && (
                  <span className="shrink-0 text-right text-[11px] font-semibold text-blue-700">
                    {fmtHire(trip.transportHireAmount)}
                  </span>
                )}

                {/* Booking created date */}
                <span className="shrink-0 text-right text-[11px] text-gray-400">
                  {fmtDate(trip.bookingCreatedDate || trip.assignedDate)}
                </span>

                {/* Status badge */}
                <span className="flex justify-end">
                  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STAGE_CLASSES[stageLabel] ?? "bg-gray-100 text-gray-600"}`}>
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
