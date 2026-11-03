"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RiTruckLine as Truck, RiNavigationLine as Navigation, RiCheckboxCircleLine as CheckCircle2, RiGroupLine as Users, RiPulseLine as Activity, RiSendPlaneLine as Send, RiProfileLine as IdCard, RiHistoryLine as History, RiMapPin2Line as MapPin, RiCheckboxBlankCircleLine as Circle, RiFileShield2Line as FileCheck2, RiInboxLine as Inbox, RiFileList3Line as ClipboardList } from "@remixicon/react";
import { dashboardApi, tripsApi, trucksApi, editApprovalsApi } from "@/lib/api";
import { showError } from "@/lib/feedback";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { SheetTrackingCard } from "./SheetTrackingCard";
import { FleetStatusPanel } from "./FleetStatusPanel";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/Segmented";
import { Separator } from "@/components/ui/separator";
import type { Trip } from "@/types/trip";
import type { Truck as TruckType } from "@/types/truck";

import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { plural } from "@/lib/plural";
interface OverviewData {
  total_trucks: number;
  active_trips: number;
  total_trips: number;
  total_drivers: number;
  trip_status_counts: Record<string, number>;
  completed_pending_closure: number;
}

const ACTIVE_STATUSES = new Set(["Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);

const STATUS_VARIANT: Record<string, "active" | "available" | "warning" | "neutral" | "indigo" | "purple"> = {
  "Assigned":   "neutral",
  "Started":    "active",
  "Loaded":     "indigo",
  "On-Transit": "purple",
  "Reached":    "warning",
  "Unloaded":   "available",
};

const QUICK_LINKS = [
  { label: "Driver Attendance", href: "/attendance/drivers", icon: IdCard,       color: "bg-accent-surface text-accent-text border-accent-border" },
  { label: "Assign Trips",      href: "/trips/assign",       icon: Send,          color: "bg-purple-surface text-purple-text border-purple-border" },
  { label: "Current Trips",     href: "/trips/current",      icon: Navigation,    color: "bg-success-surface text-success-text border-success-border" },
  { label: "Completed Trips",   href: "/trips/completed",    icon: CheckCircle2,  color: "bg-teal-surface text-teal-text border-teal-border" },
  { label: "Trip History",      href: "/trips/history",      icon: History,       color: "bg-warning-surface text-warning-text border-warning-border" },
];

function TruckCard({ truck, activeTrip }: { truck: TruckType; activeTrip?: Trip }) {
  const onTrip = !!activeTrip;

  return (
    <div
      className={`group flex flex-col gap-2.5 rounded-xl border bg-background-primary-default px-3.5 py-3 transition-colors hover:border-border-button-default ${
        onTrip ? "border-accent-border" : "border-separator-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-body-semibold text-text-primary">{truck.registrationNumber}</p>
        <span
          className={`flex shrink-0 items-center gap-1.5 text-caption-2-medium ${
            onTrip ? "text-accent-text" : "text-success-text"
          }`}
        >
          <span className="relative flex h-1.5 w-1.5">
            {onTrip && <span className="absolute inline-flex h-full w-full rounded-full bg-accent-solid opacity-60" />}
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${onTrip ? "bg-accent-solid" : "bg-success-solid"}`} />
          </span>
          {onTrip ? "On Trip" : "Available"}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
        <span className="font-medium text-text-tertiary">{truck.truckId}</span>
        <span className="text-text-tertiary">·</span>
        <Truck className="h-3 w-3 shrink-0 text-text-tertiary" />
        <span className="truncate uppercase">{truck.truckType}</span>
      </div>

      {onTrip && activeTrip && (
        <div className="flex items-center gap-1.5 rounded-lg bg-accent-surface/70 px-2.5 py-1.5 text-[11px] text-text-primary">
          <MapPin className="h-3 w-3 shrink-0 text-accent-text" />
          <span className="truncate font-medium">{activeTrip.origin}</span>
          <span className="text-text-tertiary">→</span>
          <span className="truncate font-medium">{activeTrip.destination}</span>
        </div>
      )}
    </div>
  );
}

export function FleetManagerDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [trucks, setTrucks] = useState<TruckType[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fleetFilter, setFleetFilter] = useState<"all" | "trip" | "free">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [sheetDeliveredFilter, setSheetDeliveredFilter] = useState<"All" | "Awaiting Receipt" | "Received">("All");
  const [sheetDeliveredDate,   setSheetDeliveredDate]   = useState("");
  const [sheetReceivedFilter,  setSheetReceivedFilter]  = useState<"All" | "Pending Entry" | "Entered">("All");
  const [sheetReceivedDate,    setSheetReceivedDate]    = useState("");
  const [sheetEnteredDate,     setSheetEnteredDate]     = useState("");

  useEffect(() => {
    // allSettled, not all — a failed call (e.g. right after relogin) must not
    // blank the whole dashboard; each section keeps its last-known-good state
    // and a toast names what didn't refresh.
    Promise.allSettled([
      dashboardApi.overview(),
      tripsApi.list(),
      trucksApi.list(),
    ])
      .then(([ov, trips, trks]) => {
        const failed: string[] = [];
        if (ov.status === "fulfilled") setOverview(ov.value as unknown as OverviewData); else failed.push("Overview");
        if (trips.status === "fulfilled") setAllTrips(trips.value); else failed.push("Trips");
        if (trks.status === "fulfilled") setTrucks(trks.value); else failed.push("Trucks");
        if (failed.length > 0) {
          showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
        }

        editApprovalsApi.list("Pending")
          .then((r) => setPendingApprovals(r.length))
          .catch(() => setPendingApprovals(0));
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useWebSocketEvent("trip_created",           () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated",           () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated",          () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_collected",        () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_received",         () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_entered",          () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_unmarked",         () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_created",  () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_updated",  () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_deleted",  () => setRefreshKey(k => k + 1));
  useAutoRefresh(() => setRefreshKey(k => k + 1), 15000);

  const activeTripByVehicle = new Map<string, Trip>();
  for (const trip of allTrips) {
    if (ACTIVE_STATUSES.has(trip.status ?? "") && trip.vehicleId && !trip.hasClosure && !trip.isInvoiced) {
      activeTripByVehicle.set(trip.vehicleId, trip);
    }
  }

  const onTripTrucks   = trucks.filter((t) =>  activeTripByVehicle.has(t.truckId));
  const availableTrucks = trucks.filter((t) => !activeTripByVehicle.has(t.truckId));
  const shownTrucks = fleetFilter === "trip" ? onTripTrucks : fleetFilter === "free" ? availableTrucks : [...onTripTrucks, ...availableTrucks];

  const completedCount = overview?.completed_pending_closure ?? 0;
  const activeCount    = overview?.active_trips ?? 0;

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    let dt: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      dt = new Date(y, m - 1, day);
    } else {
      const s = d.endsWith("Z") || d.includes("+") ? d : d + "Z";
      dt = new Date(s);
    }
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/\//g, "-");
  };

  const completedTrips    = allTrips.filter((t) => t.status === "Completed");
  const sheetsDelivered   = completedTrips.filter((t) => t.tripSheetCollected);
  const sheetsReceived    = sheetsDelivered.filter((t) => t.tripSheetReceived);
  const awaitingReceipt   = sheetsDelivered.filter((t) => !t.tripSheetReceived);
  const receivedOrEntered = completedTrips.filter((t) => t.tripSheetReceived || !!t.tripSheetDate);
  const pendingEntry      = receivedOrEntered.filter((t) => !t.tripSheetDate);
  const entered           = receivedOrEntered.filter((t) => !!t.tripSheetDate);

  let deliveredVisible = sheetDeliveredFilter === "Awaiting Receipt"
    ? awaitingReceipt
    : sheetDeliveredFilter === "Received"
    ? sheetsReceived
    : sheetsDelivered;
  if (sheetDeliveredDate) {
    deliveredVisible = deliveredVisible.filter((t) =>
      t.tripSheetCollectedAt?.slice(0, 10) === sheetDeliveredDate
    );
  }

  let receivedVisible = sheetReceivedFilter === "Pending Entry"
    ? pendingEntry
    : sheetReceivedFilter === "Entered"
    ? entered
    : receivedOrEntered;
  if (sheetReceivedDate) {
    receivedVisible = receivedVisible.filter((t) =>
      t.tripSheetReceivedAt?.slice(0, 10) === sheetReceivedDate
    );
  }
  if (sheetEnteredDate) {
    receivedVisible = receivedVisible.filter((t) =>
      t.tripSheetDate === sheetEnteredDate
    );
  }

  return (
    <div className="animate-stagger flex flex-col gap-6">

      {/* Header */}
      <DashboardHero
        role="Commercial"
        description={
          loading
            ? "Loading today's fleet…"
            : [
                plural(activeCount, "active trip"),
                `${onTripTrucks.length} of ${trucks.length} trucks on the road`,
                pendingApprovals > 0 ? plural(pendingApprovals, "approval") + " pending" : null,
              ].filter(Boolean).join(" · ")
        }
      />

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Stats */}
      <FleetStatusPanel
        segments={[
          {
            key: "total-fleet", kind: "count",
            label: "Total fleet", icon: Truck,
            value: loading ? "—" : String(trucks.length),
            onClick: () => router.push("/trips/assign"),
          },
          {
            key: "active-trips", kind: "count",
            label: "Active trips", icon: Activity,
            value: loading ? "—" : String(activeCount),
            onClick: () => router.push("/trips/current"),
          },
          {
            key: "completed-trips", kind: "count",
            label: "Completed trips", icon: CheckCircle2,
            value: loading ? "—" : String(completedCount),
            tone: "good",
            onClick: () => router.push("/trips/completed"),
          },
          {
            key: "total-drivers", kind: "count",
            label: "Total drivers", icon: Users,
            value: loading ? "—" : String(overview?.total_drivers ?? 0),
          },
          {
            key: "pending-edit-approvals", kind: "count",
            label: "Pending edit approvals", icon: ClipboardList,
            value: loading ? "—" : String(pendingApprovals),
            tone: pendingApprovals > 0 ? "warn" : "neutral",
            onClick: () => router.push("/attendance/edit-approvals"),
          },
        ]}
      />

      <Separator />

      {/* Trip Sheet Tracking */}
      <div>
        <h2 className="mb-3 text-body-semibold text-text-tertiary">Trip Sheet Tracking</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Delivered by Yard Supervisor */}
          <SheetTrackingCard
            title="Delivered by Yard Supervisor"
            icon={FileCheck2}
            tone="emerald"
            total={sheetsDelivered.length}
            tabs={[
              { key: "All", label: "All", count: sheetsDelivered.length },
              { key: "Awaiting Receipt", label: "Awaiting Receipt", count: awaitingReceipt.length },
              { key: "Received", label: "Received", count: sheetsReceived.length },
            ]}
            activeTab={sheetDeliveredFilter}
            onTabChange={(k) => setSheetDeliveredFilter(k as typeof sheetDeliveredFilter)}
            dates={[{ label: "Delivered on", value: sheetDeliveredDate, onChange: setSheetDeliveredDate }]}
            visibleCount={deliveredVisible.length}
            items={deliveredVisible.map((t) => ({
              id: t.id,
              tripId: t.tripId,
              reference: t.bookingReferenceNo,
              badge: t.tripSheetReceived
                ? { label: "Received", tone: "blue" as const }
                : { label: "Awaiting Receipt", tone: "amber" as const },
              meta: [{ label: "Delivered", value: fmtDate(t.tripSheetCollectedAt) }],
            }))}
          />

          {/* Received by Trip Sheet Register */}
          <SheetTrackingCard
            title="Received by Trip Sheet Register"
            icon={Inbox}
            tone="blue"
            total={receivedOrEntered.length}
            tabs={[
              { key: "All", label: "All", count: receivedOrEntered.length },
              { key: "Pending Entry", label: "Pending Entry", count: pendingEntry.length },
              { key: "Entered", label: "Entered", count: entered.length },
            ]}
            activeTab={sheetReceivedFilter}
            onTabChange={(k) => setSheetReceivedFilter(k as typeof sheetReceivedFilter)}
            dates={[
              { label: "Received on", value: sheetReceivedDate, onChange: setSheetReceivedDate },
              { label: "Entered on", value: sheetEnteredDate, onChange: setSheetEnteredDate },
            ]}
            visibleCount={receivedVisible.length}
            items={receivedVisible.map((t) => ({
              id: t.id,
              tripId: t.tripId,
              reference: t.bookingReferenceNo,
              badge: t.tripSheetDate
                ? { label: "Entered", tone: "emerald" as const }
                : { label: "Pending Entry", tone: "amber" as const },
              meta: [
                { label: "Received", value: fmtDate(t.tripSheetReceivedAt) },
                ...(t.tripSheetDate ? [{ label: "Entered", value: fmtDate(t.tripSheetDate) }] : []),
              ],
            }))}
          />
        </div>
        {awaitingReceipt.length > 0 && (
          <p className="mt-2 text-caption-1-medium text-warning-text">
            {awaitingReceipt.length} sheet{awaitingReceipt.length > 1 ? "s" : ""} delivered but not yet confirmed received.
          </p>
        )}
      </div>

      <Separator />


      {/* Quick Links */}
      <div>
        <h2 className="mb-3 text-body-semibold text-text-secondary">Quick Access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-center text-caption-1-semibold transition hover:shadow-md ${color}`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      <Separator />

      {/* Fleet Status */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-body-semibold text-text-primary">Fleet Status</h2>
              <p className="text-xs text-text-secondary">{trucks.length} trucks registered</p>
            </div>
            <Segmented
              label="Filter trucks by status"
              value={fleetFilter}
              onChange={setFleetFilter}
              options={[
                { value: "all", label: "All", count: trucks.length },
                { value: "trip", label: "On Trip", count: onTripTrucks.length, dot: "bg-accent-solid" },
                { value: "free", label: "Available", count: availableTrucks.length, dot: "bg-success-solid" },
              ]}
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : shownTrucks.length === 0 ? (
            <EmptyState size="compact" illustration="logistics" title={trucks.length === 0 ? "No trucks registered yet" : "No trucks in this view"} />
          ) : (
            <div className="grid max-h-[28rem] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shownTrucks.map((truck) => (
                <TruckCard key={truck.truckId} truck={truck} activeTrip={activeTripByVehicle.get(truck.truckId)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
