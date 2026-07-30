"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Navigation, Truck } from "lucide-react";
import { notificationsApi, tripsApi } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { Trip } from "@/types/trip";

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    // Handle plain YYYY-MM-DD without timezone shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      return new Date(y, m - 1, day).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      });
    }
    const utc = d.endsWith("Z") || d.includes("+") ? d : d + "Z";
    return new Date(utc).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return d;
  }
}

export function CurrentTripsCard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  // Track IDs of trips newly assigned so we can highlight them
  const [newTripIds, setNewTripIds] = useState<Set<string>>(new Set());
  const fadeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    tripsApi.list()
      .then((all) => setTrips(all.filter((t) =>
        ["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"].includes(t.status ?? "")
        && !t.hasClosure
        && !t.isInvoiced
      )))
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
        </div>
      </div>

      {/* Column headers */}
      {trips.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_130px_90px_80px] gap-x-3 border-b border-gray-100 bg-gray-50/70 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          <span>From</span>
          <span>To</span>
          <span>Truck</span>
          <span className="text-right">Booked On</span>
          <span className="text-right">Status</span>
        </div>
      )}

      {/* Trip rows */}
      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <Truck className="h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">No current trips</p>
          <p className="text-xs text-gray-300">All trips are completed or invoiced</p>
        </div>
      ) : (
        <div className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
          {trips.map((trip) => {
            const isNew = newTripIds.has(trip.tripId) || newTripIds.has(String(trip.id));
            const isAssigned = trip.status === "Assigned";
            return (
              <div
                key={trip.id}
                className={`grid grid-cols-[1fr_1fr_130px_90px_80px] items-center gap-x-3 px-5 py-2.5 text-xs transition-colors ${
                  isNew
                    ? "border-l-4 border-l-blue-500 bg-blue-50"
                    : "border-l-4 border-l-transparent hover:bg-gray-50"
                }`}
              >
                {/* Origin */}
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-800">
                  {isNew && (
                    <span className="shrink-0 rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      New
                    </span>
                  )}
                  <span className="truncate">{trip.origin || "—"}</span>
                </span>

                {/* Destination */}
                <div className="flex min-w-0 items-center gap-1">
                  <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />
                  <span className="truncate text-gray-600">{trip.destination || "—"}</span>
                </div>

                {/* Truck registration */}
                <span className="shrink-0 font-mono text-[11px] text-gray-600">
                  {trip.truckRegistration ?? "—"}
                </span>

                {/* Booking created date */}
                <span className="shrink-0 text-right text-[11px] text-gray-400">
                  {fmtDate(trip.bookingCreatedDate || trip.assignedDate)}
                </span>

                {/* Status badge */}
                <span className="flex justify-end">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                    isAssigned
                      ? "bg-sky-100 text-sky-700"
                      : "bg-violet-100 text-violet-700"
                  }`}>
                    {isAssigned ? "Assigned" : trip.status}
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
