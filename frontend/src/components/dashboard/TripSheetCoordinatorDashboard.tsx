"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiFileList3Line as ClipboardList, RiCheckboxCircleLine as CheckCircle2, RiTimeLine as Clock, RiErrorWarningLine as AlertCircle, RiFileShieldLine as FileCheck, RiStackLine as Layers, RiNavigationLine as Navigation, RiCalendar2Line as CalendarDays, RiCheckboxMultipleLine as PackageCheck } from "@remixicon/react";
import { tripsApi } from "@/lib/api";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { FleetStatusPanel } from "./FleetStatusPanel";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { Trip } from "@/types/trip";

import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { plural } from "@/lib/plural";
const QUICK_LINKS = [
  { label: "Sheet Collection", href: "/trips/sheet-collection", icon: ClipboardList, color: "bg-accent-surface text-accent-text border-accent-border" },
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
      <Icon className="h-4 w-4 text-text-tertiary" />
      <h2 className="text-body-semibold text-text-primary">{title}</h2>
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
      <DashboardHero
        role="Yard Supervisor"
        description={
          loading
            ? "Loading trip sheets…"
            : `${plural(delivered.length, "sheet")} collected of ${closedTrips.length} closed trips · ${deliveredToday.length} today`
        }
        actions={
          !loading && pending.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-warning-border bg-warning-surface px-3 py-2">
              <AlertCircle className="h-4 w-4 text-warning-text" />
              <span className="text-caption-1-semibold text-warning-text">{pending.length} trip{pending.length > 1 ? "s" : ""} awaiting collection</span>
            </div>
          )
        }
      />

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Stat cards */}
      <FleetStatusPanel
        segments={[
          {
            key: "total-closed-trips", kind: "count",
            label: "Total closed trips", icon: Layers,
            value: loading ? "—" : String(closedTrips.length),
            caption: "Ready for collection",
          },
          {
            key: "pending-collection", kind: "count",
            label: "Pending collection", icon: Clock,
            value: loading ? "—" : String(pending.length),
            tone: pending.length > 0 ? "warn" : "neutral",
            caption: "Sheets not yet received",
          },
          {
            key: "delivered", kind: "count",
            label: "Delivered", icon: CheckCircle2,
            value: loading ? "—" : String(delivered.length),
            tone: "good",
            caption: "Sheets handed over",
          },
          {
            key: "delivered-today", kind: "count",
            label: "Delivered today", icon: CalendarDays,
            value: loading ? "—" : String(deliveredToday.length),
            caption: new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-"),
          },
        ]}
      />

      {/* Quick Access */}
      <div>
        <h2 data-tour="quick-access" className="mb-3 text-body-semibold text-text-tertiary">Quick Access</h2>
        <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-body-semibold transition hover:shadow-md ${color}`}
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
                <h2 data-tour="awaiting-collection" className="text-body-semibold text-text-primary">Awaiting Collection</h2>
                {!loading && pending.length > 0 && (
                  <span className="rounded-full bg-warning-surface px-2 py-0.5 text-caption-2-semibold tabular-nums text-warning-text">{pending.length}</span>
                )}
              </div>
              {pending.length > 0 && (
                <Link href="/trips/sheet-collection" className="text-caption-1-semibold text-accent-text transition-colors hover:text-accent-text-strong">
                  View all →
                </Link>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : urgentPending.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-success-text" />
                <p className="text-body-medium text-text-secondary">All sheets collected</p>
                <p className="text-xs text-text-tertiary">No pending trips</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-separator-border overflow-y-auto pr-1">
                {urgentPending.map((trip) => {
                  const waiting = trip.scheduledDate
                    ? Math.max(0, Math.floor((Date.parse(todayIST) - Date.parse(trip.scheduledDate.slice(0, 10))) / 86400000))
                    : null;
                  return (
                    <li key={trip.id} className="flex items-center gap-4 py-2.5">
                      <p className="w-24 shrink-0 text-body-semibold tabular-nums text-text-primary">{trip.tripId}</p>
                      <p className="min-w-0 flex-1 truncate text-xs uppercase text-text-secondary">
                        {trip.origin} <span className="px-1 text-text-tertiary">→</span> {trip.destination}
                      </p>
                      <div className="shrink-0 text-right">
                        <p className="text-caption-1-medium tabular-nums text-text-primary">{trip.scheduledDate ?? "—"}</p>
                        {waiting !== null && (
                          <p className={`text-caption-2-medium ${waiting > 30 ? " text-danger-text" : waiting > 7 ? "text-warning-text" : "text-text-tertiary"}`}>
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
              <h2 data-tour="recently-delivered" className="text-body-semibold text-text-primary">Recently Delivered</h2>
              {!loading && deliveredToday.length > 0 && (
                <span className="rounded-full bg-success-surface px-2 py-0.5 text-caption-2-semibold tabular-nums text-success-text">
                  {deliveredToday.length} today
                </span>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : recentDelivered.length === 0 ? (
              <EmptyState size="compact" illustration="no-data" title="No sheets delivered yet" />
            ) : (
              <ul className="max-h-72 divide-y divide-separator-border overflow-y-auto pr-1">
                {recentDelivered.map((trip) => (
                  <li key={trip.id} className="flex items-center gap-4 py-2.5">
                    <p className="w-24 shrink-0 text-body-semibold tabular-nums text-text-primary">{trip.tripId}</p>
                    <p className="min-w-0 flex-1 truncate text-xs uppercase text-text-secondary">
                      {trip.origin} <span className="px-1 text-text-tertiary">→</span> {trip.destination}
                    </p>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-text-secondary">
                      <span className="h-1.5 w-1.5 rounded-full bg-success-solid" />
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
