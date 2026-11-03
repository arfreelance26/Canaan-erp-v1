"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiArrowRightLine as ArrowRight, RiNavigationLine as Navigation, RiSearchLine as Search, RiTruckLine as Truck, RiCloseLine as X } from "@remixicon/react";
import { notificationsApi, tripsApi, customersApi } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAuth } from "@/context/AuthContext";
import type { Trip } from "@/types/trip";
import type { Customer } from "@/types/customer";
import { ACTIVE_TRIP_STATUSES, getRouteStep, getStageLabel } from "@/lib/trip-stage";
import { RouteLine } from "@/components/trips/RouteLine";

import { EmptyState } from "@/components/ui/EmptyState";
// Pipeline order, used both for the summary pills and to color each row's badge.
const STAGE_ORDER = [
  "Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded",
  "Completed", "Pending Sheet Delivery", "Pending Sheet Entry", "Pending Verification", "Ready to Invoice",
] as const;

// Unselected tabs — pale tints, not alert-saturated ones: this is a filter
// row someone glances past, not a status badge meant to grab attention. The
// selected state (STAGE_ACTIVE_CLASSES below) still goes solid, so the
// active filter stays unambiguous.
const STAGE_CLASSES: Record<string, string> = {
  "Assigned":                "bg-teal-surface text-teal-text",
  "Started":                 "bg-purple-surface text-purple-text",
  "Loaded":                  "bg-purple-surface text-purple-text",
  "On-Transit":              "bg-purple-surface text-purple-text",
  "Reached":                 "bg-purple-surface text-purple-text",
  "Unloaded":                "bg-purple-surface text-purple-text",
  "Completed":               "bg-teal-surface text-teal-text",
  "Pending Sheet Delivery":  "bg-warning-surface text-warning-text",
  "Pending Sheet Entry":     "bg-orange-surface text-orange-text",
  "Pending Verification":    "bg-purple-surface text-purple-text",
  "Ready to Invoice":        "bg-success-surface text-success-text",
};

// Selected state: the soft tint above turns into a solid fill.
const STAGE_ACTIVE_CLASSES: Record<string, string> = {
  "Assigned":                "bg-teal-solid text-on-solid",
  "Started":                 "bg-purple-solid text-on-solid",
  "Loaded":                  "bg-purple-solid text-on-solid",
  "On-Transit":              "bg-purple-solid text-on-solid",
  "Reached":                 "bg-purple-solid text-on-solid",
  "Unloaded":                "bg-purple-solid text-on-solid",
  "Completed":               "bg-teal-solid text-on-solid",
  "Pending Sheet Delivery":  "bg-warning-solid text-on-solid",
  "Pending Sheet Entry":     "bg-orange-solid text-on-solid",
  "Pending Verification":    "bg-purple-solid text-on-solid",
  "Ready to Invoice":        "bg-success-solid text-on-solid",
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
    <div data-tour="current-trips" className="overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-separator-border bg-accent-surface/70 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
            <Navigation className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-body-semibold text-text-primary">Current Trips</h2>
          {/* Live indicator */}
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success-solid opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success-solid" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <span className="animate-pulse rounded-full bg-accent-solid px-2.5 py-0.5 text-caption-2-semibold text-on-solid">
              {newCount} new
            </span>
          )}
          <span className="rounded-full bg-fill-2 px-3 py-0.5 text-caption-1-semibold text-text-secondary">
            <span className="font-semibold text-text-primary">{trips.length}</span> {trips.length === 1 ? "trip" : "trips"}
          </span>
          {/* Trip ID search — collapsed icon that expands on hover / focus */}
          <label
            className={`group flex h-7 cursor-text items-center overflow-hidden rounded-full border border-separator-border bg-background-primary-default text-text-tertiary shadow-sm transition duration-300 focus-within:border-accent-border-strong focus-within:ring-2 focus-within:ring-accent-border hover:border-border-button-default ${
              tripSearch ? "w-56" : "w-7 hover:w-56 focus-within:w-56"
            }`}
          >
            <Search className="ml-[7px] h-3.5 w-3.5 shrink-0" />
            <input
              type="text"
              value={tripSearch}
              onChange={(e) => setTripSearch(e.target.value)}
              placeholder="Trip ID, Truck, Driver, From/To…"
              className="ml-2 min-w-0 flex-1 bg-transparent pr-2 text-[11px] text-text-primary outline-none placeholder:text-text-placeholder"
            />
            {tripSearch && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setTripSearch(""); }}
                className="mr-2 shrink-0 text-text-tertiary hover:text-text-secondary"
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
        <div className="flex flex-wrap items-center gap-1.5 border-b border-separator-border bg-background-primary-default px-5 py-2.5">
          {STAGE_ORDER.filter((label) => (stageCounts.get(label) ?? 0) > 0).map((label) => {
            const count = stageCounts.get(label) ?? 0;
            const active = stageFilter === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStageFilter((prev) => (prev === label ? null : label))}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2.5 pr-0.5 text-caption-2-semibold transition duration-200 ${
                  active
                    ? `${STAGE_ACTIVE_CLASSES[label] ?? "bg-accent-solid text-on-solid"} shadow-sm`
                    : `${STAGE_CLASSES[label] ?? "bg-fill-2 text-text-secondary"} hover:brightness-95`
                }`}
              >
                {label}
                <span
                  className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-caption-2-semibold tabular-nums ${
                    active ? "bg-on-solid/25 text-on-solid" : "bg-background-primary-default"
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
              className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold text-text-tertiary transition-colors hover:bg-fill-3 hover:text-text-secondary"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Column headers */}
      {trips.length > 0 && (
        <div className={`grid ${gridCols} gap-x-3 border-b border-separator-border bg-fill-1 px-5 py-2 text-caption-2-semibold text-text-tertiary`}>
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
        <EmptyState
          size="compact"
          illustration={tripSearch || stageFilter ? "not-found" : "all-done"}
          title={tripSearch ? "No trips match your search" : stageFilter ? `No trips in "${stageFilter}"` : "No current trips"}
          description={!tripSearch && !stageFilter ? "Every trip is invoiced or waived" : undefined}
        />
      ) : (
        <div className="max-h-72 divide-y divide-separator-border overflow-y-auto">
          {filteredTrips.map((trip) => {
            const isNew = newTripIds.has(trip.tripId) || newTripIds.has(String(trip.id));
            const stageLabel = getStageLabel(trip);
            return (
              <div
                key={trip.id}
                className={`grid ${gridCols} items-center gap-x-3 px-5 py-2.5 text-xs transition-colors ${
                  isNew ? "bg-accent-surface/70" : "hover:bg-fill-2"
                }`}
              >
                {/* Trip ID */}
                <span className="flex min-w-0 items-center gap-1.5">
                  {isNew && (
                    <span className="shrink-0 rounded-full bg-accent-solid px-1.5 py-0.5 text-[9px] font-semibold text-on-solid">
                      New
                    </span>
                  )}
                  <span className="truncate rounded-md bg-purple-surface px-2 py-0.5 font-mono text-caption-2-semibold text-purple-text">
                    {trip.tripId || "—"}
                  </span>
                </span>

                {/* Customer Account */}
                {canSeeCustomer && (
                  <span className="truncate font-medium text-text-primary" title={customerById.get(trip.customerId)?.name ?? ""}>
                    {customerById.get(trip.customerId)?.name ?? "—"}
                  </span>
                )}

                {/* Origin */}
                <span className="truncate font-medium text-text-primary">{trip.origin || "—"}</span>

                {/* Destination */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <ArrowRight className="h-3 w-3 shrink-0 text-text-tertiary" />
                  <span className="truncate text-text-secondary">{trip.destination || "—"}</span>
                </div>

                {/* Driver name */}
                <span className="truncate font-medium text-text-primary" title={trip.driverName ?? ""}>{trip.driverName ?? "—"}</span>

                {/* Truck registration */}
                <span className="w-fit shrink-0 rounded-md bg-fill-2 px-2 py-0.5 font-mono text-caption-2-medium text-text-secondary">
                  {trip.truckRegistration ?? "—"}
                </span>

                {/* Hire amount — Admin/Accounts only */}
                {canSeeHire && (
                  <span className="shrink-0 text-right text-caption-1-semibold tabular-nums text-text-primary">
                    {fmtHire(trip.transportHireAmount)}
                  </span>
                )}

                {/* Booking created date */}
                <span className="shrink-0 text-right text-[11px] tabular-nums text-text-secondary">
                  {fmtDate(trip.bookingCreatedDate || trip.assignedDate)}
                </span>

                {/* Status badge */}
                <span className="flex flex-col items-end gap-1">
                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold ${STAGE_CLASSES[stageLabel] ?? "bg-fill-2 text-text-secondary"}`}>
                    <span className="h-1 w-1 rounded-full bg-current" />
                    {stageLabel}
                  </span>
                  <RouteLine step={getRouteStep(trip) ?? 0} className="w-20" />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
