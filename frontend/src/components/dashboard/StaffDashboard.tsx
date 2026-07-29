"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, ClipboardList, CheckCircle2 } from "lucide-react";
import { tripsApi } from "@/lib/api";
import { TripSummaryWidget } from "./TripSummaryWidget";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { Trip } from "@/types/trip";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const utc = d.endsWith("Z") || d.includes("+") ? d : d + "Z";
  return new Date(utc).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900">{trip.tripId}</p>
        <p className="truncate text-[11px] text-gray-500">
          {trip.origin} → {trip.destination}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] text-gray-400">{trip.bookingReferenceNo}</p>
      </div>
    </li>
  );
}

export function StaffDashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    tripsApi.list()
      .then(setTrips)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 15000);
  useWebSocketEvent("sheet_collected",  () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_received",   () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_entered",    () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_unmarked",   () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated",     () => setRefreshKey(k => k + 1));

  // Delivered by Yard but NOT yet received by Trip Sheet Register
  const pendingReceive = trips.filter(
    (t) => t.tripSheetCollected === true && !t.tripSheetReceived
  );

  // Received but NOT yet entered (no trip sheet submitted)
  const pendingEntry = trips.filter(
    (t) => t.tripSheetReceived === true && !t.hasSheet
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Sheet Register</h1>
          <p className="mt-1 text-sm text-gray-500">Sheets awaiting receipt and entry</p>
        </div>
        <TripSummaryWidget />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl border px-5 py-4 ${pendingReceive.length > 0 ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Pending Receive</p>
          <p className="mt-1 text-3xl font-bold text-amber-700">{loading ? "—" : pendingReceive.length}</p>
          <p className="mt-0.5 text-[11px] text-amber-500">Delivered by Yard, not yet received</p>
        </div>
        <div className={`rounded-xl border px-5 py-4 ${pendingEntry.length > 0 ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Pending Entry</p>
          <p className="mt-1 text-3xl font-bold text-blue-700">{loading ? "—" : pendingEntry.length}</p>
          <p className="mt-0.5 text-[11px] text-blue-500">Received, trip sheet not entered</p>
        </div>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Pending Receive */}
        <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-700">Pending Receive</h2>
            </div>
            {!loading && pendingReceive.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                {pendingReceive.length}
              </span>
            )}
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-gray-100" />)}
            </div>
          ) : pendingReceive.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-emerald-700">All sheets received</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {pendingReceive.map((trip) => <TripRow key={trip.id} trip={trip} />)}
            </ul>
          )}
          <div className="mt-4 border-t border-gray-100 pt-3">
            <Link href="/trips/reconciliation" className="text-xs font-medium text-amber-600 hover:underline">
              Go to Reconciliation →
            </Link>
          </div>
        </div>

        {/* Pending Entry */}
        <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-700">Pending Entry</h2>
            </div>
            {!loading && pendingEntry.length > 0 && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                {pendingEntry.length}
              </span>
            )}
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-gray-100" />)}
            </div>
          ) : pendingEntry.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-emerald-700">All sheets entered</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {pendingEntry.map((trip) => <TripRow key={trip.id} trip={trip} />)}
            </ul>
          )}
          <div className="mt-4 border-t border-gray-100 pt-3">
            <Link href="/trips/reconciliation" className="text-xs font-medium text-blue-600 hover:underline">
              Go to Reconciliation →
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
