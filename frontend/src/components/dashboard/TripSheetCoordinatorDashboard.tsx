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
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { Trip } from "@/types/trip";

const QUICK_LINKS = [
  { label: "Sheet Collection", href: "/trips/sheet-collection", icon: ClipboardList, color: "bg-blue-50 text-blue-600 border-blue-200" },
];

function fmtIST(raw: string) {
  const s = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  return new Date(s).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function StatCard({ icon: Icon, label, value, sub, color, alert }: {
  icon: React.ElementType; label: string; value: string | number; color: string; sub?: string; alert?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-xl border bg-white px-5 py-4 shadow-sm ${alert ? "border-amber-200 bg-amber-50/40" : "border-gray-200"}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`mt-0.5 text-2xl font-bold ${alert ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, badge, badgeColor }: {
  icon: React.ElementType; title: string; badge?: string | number; badgeColor?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-gray-400" />
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {badge !== undefined && Number(badge) > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor ?? "bg-gray-100 text-gray-600"}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

const Skeleton = () => <div className="h-5 w-full animate-pulse rounded bg-gray-100" />;

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Yard Staff</h1>
          <p className="mt-1 text-sm text-gray-500">Sheet collection status across all closed trips</p>
        </div>
        {!loading && pending.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700">{pending.length} trip{pending.length > 1 ? "s" : ""} awaiting collection</span>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Layers}      label="Total Closed Trips"  value={loading ? "—" : closedTrips.length}     color="bg-blue-100 text-blue-600"    sub="Ready for collection" />
        <StatCard icon={Clock}       label="Pending Collection"  value={loading ? "—" : pending.length}         color="bg-amber-100 text-amber-600"  alert={pending.length > 0} sub="Sheets not yet received" />
        <StatCard icon={CheckCircle2} label="Delivered"          value={loading ? "—" : delivered.length}       color="bg-emerald-100 text-emerald-600" sub="Sheets handed over" />
        <StatCard icon={CalendarDays} label="Delivered Today"    value={loading ? "—" : deliveredToday.length}  color="bg-violet-100 text-violet-600" sub={new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })} />
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

      {/* Pending + Recently Delivered */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Pending collection — oldest first (most urgent) */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={Clock} title="Awaiting Collection" badge={pending.length} badgeColor="bg-amber-100 text-amber-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} />)}</div>
          ) : urgentPending.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">All sheets collected</p>
              <p className="text-xs text-gray-400">No pending trips</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {urgentPending.map((trip) => (
                <li key={trip.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                    <Navigation className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-900">{trip.tripId}</p>
                    <p className="truncate text-[11px] text-gray-500">{trip.origin} → {trip.destination}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-400">
                    {trip.scheduledDate ?? "—"}
                  </span>
                </li>
              ))}
              {pending.length > 6 && (
                <li className="pt-2 text-center">
                  <Link href="/trips/sheet-collection" className="text-xs font-medium text-blue-600 hover:underline">
                    View all {pending.length} pending →
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Recently delivered */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={FileCheck} title="Recently Delivered" badge={deliveredToday.length > 0 ? `${deliveredToday.length} today` : undefined} badgeColor="bg-emerald-100 text-emerald-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} />)}</div>
          ) : recentDelivered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <ClipboardList className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">No sheets delivered yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentDelivered.map((trip) => (
                <li key={trip.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-900">{trip.tripId}</p>
                    <p className="truncate text-[11px] text-gray-500">{trip.origin} → {trip.destination}</p>
                  </div>
                  <span className="shrink-0 text-right text-[10px] text-gray-400">
                    {trip.tripSheetCollectedAt ? fmtIST(trip.tripSheetCollectedAt) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
