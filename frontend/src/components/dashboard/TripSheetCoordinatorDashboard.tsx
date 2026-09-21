"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  Layers,
  Navigation,
  CalendarDays,
} from "lucide-react";
import { tripsApi } from "@/lib/api";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { StatCard } from "./StatCard";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { Trip } from "@/types/trip";

const QUICK_LINKS = [
  { label: "Sheet Collection", href: "/trips/sheet-collection", icon: ClipboardList, color: "bg-blue-50 text-blue-600 border-blue-200" },
];

function fmtIST(raw: string) {
  const s = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  return new Date(s).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).replace(/\//g, "-");
}

function SectionTitle({ icon: Icon, title, badge, badgeVariant }: {
  icon: React.ElementType;
  title: string;
  badge?: string | number;
  badgeVariant?: "active" | "available" | "warning" | "neutral";
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-gray-400" />
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {badge !== undefined && Number(badge) > 0 && (
        <Badge variant={badgeVariant ?? "neutral"}>{badge}</Badge>
      )}
    </div>
  );
}

export function TripSheetCoordinatorDashboard() {
  const [trips, setTrips]   = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    tripsApi.list()
      .then(setTrips)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_collected", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_unmarked", () => setRefreshKey(k => k + 1));

  // Mirror sheet-collection page: only closed trips (hasClosure=true)
  const closedTrips = useMemo(() =>
    trips.filter((t) => (t as any).hasClosure === true),
    [trips]
  );

  const delivered  = useMemo(() => closedTrips.filter((t) => t.tripSheetCollected === true),  [closedTrips]);
  const pending    = useMemo(() => closedTrips.filter((t) => t.tripSheetCollected === false), [closedTrips]);

  // Delivered today (IST)
  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // "YYYY-MM-DD"
  const deliveredToday = useMemo(() =>
    delivered.filter((t) => {
      if (!t.tripSheetCollectedAt) return false;
      const s = t.tripSheetCollectedAt.endsWith("Z") || t.tripSheetCollectedAt.includes("+")
        ? t.tripSheetCollectedAt : t.tripSheetCollectedAt + "Z";
      return new Date(s).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === todayIST;
    }),
    [delivered, todayIST]
  );

  // Recently delivered (last 6, sorted newest first)
  const recentDelivered = useMemo(() =>
    [...delivered]
      .sort((a, b) => (b.tripSheetCollectedAt ?? "").localeCompare(a.tripSheetCollectedAt ?? ""))
      .slice(0, 6),
    [delivered]
  );

  // Longest-waiting pending trips (sorted by scheduledDate ascending)
  const urgentPending = useMemo(() =>
    [...pending]
      .sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""))
      .slice(0, 6),
    [pending]
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Yard Supervisor</h1>
          <p className="mt-1 text-sm text-gray-500">Sheet collection status across all closed trips</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!loading && pending.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-amber-700">{pending.length} trip{pending.length > 1 ? "s" : ""} awaiting collection</span>
            </div>
          )}
        </div>
      </div>

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Layers}       label="Total Closed Trips" value={loading ? "—" : closedTrips.length}    variant="blue"    caption="Ready for collection" />
        <StatCard icon={Clock}        label="Pending Collection" value={loading ? "—" : pending.length}        variant={pending.length > 0 ? "amber" : "default"} caption="Sheets not yet received" />
        <StatCard icon={CheckCircle2} label="Delivered"          value={loading ? "—" : delivered.length}      variant="emerald" caption="Sheets handed over" />
        <StatCard icon={CalendarDays} label="Delivered Today"    value={loading ? "—" : deliveredToday.length} variant="purple"  caption={new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")} />
      </div>

      {/* Quick Access */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Quick Access</h2>
        <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-sm font-semibold transition-all hover:-translate-y-1 hover:shadow-md ${color}`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      <Separator />

      {/* Pending + Recently Delivered */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Pending collection — oldest first (most urgent) */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-gray-800">Awaiting Collection</h2>
                {!loading && pending.length > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-700">{pending.length}</span>
                )}
              </div>
              {pending.length > 0 && (
                <Link href="/trips/sheet-collection" className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800">
                  View all →
                </Link>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : urgentPending.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium text-gray-600">All sheets collected</p>
                <p className="text-xs text-gray-400">No pending trips</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1">
                {urgentPending.map((trip) => {
                  const waiting = trip.scheduledDate
                    ? Math.max(0, Math.floor((Date.parse(todayIST) - Date.parse(trip.scheduledDate.slice(0, 10))) / 86400000))
                    : null;
                  return (
                    <li key={trip.id} className="flex items-center gap-4 py-2.5">
                      <p className="w-24 shrink-0 text-sm font-semibold tabular-nums text-gray-900">{trip.tripId}</p>
                      <p className="min-w-0 flex-1 truncate text-xs uppercase text-gray-500">
                        {trip.origin} <span className="px-1 text-gray-300">→</span> {trip.destination}
                      </p>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium tabular-nums text-gray-700">{trip.scheduledDate ?? "—"}</p>
                        {waiting !== null && (
                          <p className={`text-[11px] ${waiting > 30 ? "font-medium text-red-600" : waiting > 7 ? "text-amber-600" : "text-gray-400"}`}>
                            {waiting === 0 ? "today" : `${waiting}d waiting`}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recently delivered */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-gray-800">Recently Delivered</h2>
              {!loading && deliveredToday.length > 0 && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700">
                  {deliveredToday.length} today
                </span>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : recentDelivered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <ClipboardList className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-400">No sheets delivered yet</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1">
                {recentDelivered.map((trip) => (
                  <li key={trip.id} className="flex items-center gap-4 py-2.5">
                    <p className="w-24 shrink-0 text-sm font-semibold tabular-nums text-gray-900">{trip.tripId}</p>
                    <p className="min-w-0 flex-1 truncate text-xs uppercase text-gray-500">
                      {trip.origin} <span className="px-1 text-gray-300">→</span> {trip.destination}
                    </p>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-gray-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {trip.tripSheetCollectedAt ? fmtIST(trip.tripSheetCollectedAt) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
