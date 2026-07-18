"use client";

import { useEffect, useState } from "react";
import { tripsApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { Trip, TripStatus } from "@/types/trip";
import { Navigation } from "lucide-react";

const ACTIVE_STATUSES: TripStatus[] = ["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"];

const STATUS_BADGE: Record<string, string> = {
  Assigned:    "bg-blue-100 text-blue-700",
  Started:     "bg-indigo-100 text-indigo-700",
  Loaded:      "bg-purple-100 text-purple-700",
  "On-Transit":"bg-yellow-100 text-yellow-700",
  Reached:     "bg-teal-100 text-teal-700",
  Unloaded:    "bg-cyan-100 text-cyan-700",
  Completed:   "bg-green-100 text-green-700",
};

export function ActiveBookingsWidget() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    tripsApi.list().then((all) => {
      // Show all non-invoiced trips (active + recent completed) so status is visible until invoiced
      setTrips(all.filter((t) => !t.isInvoiced));
    }).catch(() => {});
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey((k) => k + 1), 30000);
  useWebSocketEvent("trip_status_changed", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_created", () => setRefreshKey((k) => k + 1));

  const active = trips.filter((t) => ACTIVE_STATUSES.includes(t.status as TripStatus));
  const recent = trips.filter((t) => !ACTIVE_STATUSES.includes(t.status as TripStatus));

  if (trips.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-blue-600" />
          <p className="text-sm font-semibold text-blue-800">Active Bookings</p>
        </div>
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
          {active.length} active · {recent.length} pending invoice
        </span>
      </div>
      <div className="flex flex-col gap-1.5 max-h-64 overflow-auto">
        {trips.slice(0, 20).map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/80 border border-white px-3 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-gray-800 shrink-0">{t.tripId}</span>
              <span className="text-gray-400 shrink-0">·</span>
              <span className="text-gray-500 truncate">{t.origin} → {t.destination}</span>
            </div>
            <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[t.status] ?? "bg-gray-100 text-gray-600"}`}>
              {t.status}
            </span>
          </div>
        ))}
        {trips.length > 20 && (
          <p className="text-center text-xs text-gray-400 pt-1">+{trips.length - 20} more — visit the trip list for full view</p>
        )}
      </div>
    </div>
  );
}
