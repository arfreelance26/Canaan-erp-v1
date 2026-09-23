"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Truck,
  Navigation,
  CheckCircle2,
  Users,
  Activity,
  Send,
  IdCard,
  History,
  MapPin,
  Circle,
  FileCheck2,
  Inbox,
  ClipboardList,
} from "lucide-react";
import { dashboardApi, tripsApi, trucksApi, editApprovalsApi } from "@/lib/api";
import { mapLimit } from "@/lib/async-pool";
import { showError } from "@/lib/swal";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { SheetTrackingCard } from "./SheetTrackingCard";
import { StatCard } from "./StatCard";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/Segmented";
import { Separator } from "@/components/ui/separator";
import type { Trip } from "@/types/trip";
import type { Truck as TruckType } from "@/types/truck";
import type { TripSheetData } from "@/types/trip-sheet";
import { n } from "@/types/trip-sheet";

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
  { label: "Driver Attendance", href: "/attendance/drivers", icon: IdCard,       color: "bg-blue-50 text-blue-600 border-blue-200" },
  { label: "Assign Trips",      href: "/trips/assign",       icon: Send,          color: "bg-violet-50 text-violet-600 border-violet-200" },
  { label: "Current Trips",     href: "/trips/current",      icon: Navigation,    color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  { label: "Completed Trips",   href: "/trips/completed",    icon: CheckCircle2,  color: "bg-teal-50 text-teal-600 border-teal-200" },
  { label: "Trip History",      href: "/trips/history",      icon: History,       color: "bg-amber-50 text-amber-600 border-amber-200" },
];

function TruckCard({ truck, activeTrip }: { truck: TruckType; activeTrip?: Trip }) {
  const onTrip = !!activeTrip;

  return (
    <div
      className={`group flex flex-col gap-2.5 rounded-xl border bg-white px-3.5 py-3 transition-colors hover:border-gray-300 ${
        onTrip ? "border-blue-200" : "border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold tracking-wide text-gray-900">{truck.registrationNumber}</p>
        <span
          className={`flex shrink-0 items-center gap-1.5 text-[11px] font-medium ${
            onTrip ? "text-blue-600" : "text-emerald-600"
          }`}
        >
          <span className="relative flex h-1.5 w-1.5">
            {onTrip && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />}
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${onTrip ? "bg-blue-500" : "bg-emerald-500"}`} />
          </span>
          {onTrip ? "On Trip" : "Available"}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <span className="font-medium text-gray-400">{truck.truckId}</span>
        <span className="text-gray-300">·</span>
        <Truck className="h-3 w-3 shrink-0 text-gray-400" />
        <span className="truncate uppercase">{truck.truckType}</span>
      </div>

      {onTrip && activeTrip && (
        <div className="dk-inset flex items-center gap-1.5 rounded-lg bg-blue-50/70 px-2.5 py-1.5 text-[11px] text-gray-700">
          <MapPin className="h-3 w-3 shrink-0 text-blue-500" />
          <span className="truncate font-medium">{activeTrip.origin}</span>
          <span className="text-gray-400">→</span>
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
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
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

        if (trips.status === "fulfilled") {
          const completed = trips.value.filter((t) => t.hasSheet);
          // Cap concurrency at 8 — this dashboard's P&L table needs every sheet and
          // re-runs on a 15s timer, so an unbounded burst would repeatedly hammer
          // the DB pool. mapLimit keeps at most 8 requests in flight.
          mapLimit(completed, 8, (t) =>
            tripsApi.getSheet(t.id).then((s) => s ? ({ id: t.id, sheet: s }) : null).catch(() => null)
          ).then((results) => {
            const m = new Map<string, TripSheetData>();
            for (const r of results) { if (r) m.set(r.id, r.sheet); }
            setSheets(m);
          });
        }
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
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
              <Truck className="h-5 w-5" />
            </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Commercial Manager</h1>
          <p className="mt-0.5 text-sm text-gray-500">Real-time fleet status, active trips, and operational overview</p>
        </div>
      </div>

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        <StatCard icon={Truck}         label="Total Fleet"            value={loading ? "—" : trucks.length}        variant="blue"    onClick={() => router.push("/trips/assign")} />
        <StatCard icon={Activity}      label="Active Trips"           value={loading ? "—" : activeCount}          variant="indigo"  onClick={() => router.push("/trips/current")} />
        <StatCard icon={CheckCircle2}  label="Completed Trips"        value={loading ? "—" : completedCount}       variant="emerald" onClick={() => router.push("/trips/completed")} />
        <StatCard icon={Users}         label="Total Drivers"          value={loading ? "—" : (overview?.total_drivers ?? 0)} variant="purple" />
        <StatCard icon={ClipboardList} label="Pending Edit Approvals" value={loading ? "—" : pendingApprovals}     variant={pendingApprovals > 0 ? "amber" : "default"} onClick={() => router.push("/attendance/edit-approvals")} />
      </div>

      <Separator />

      {/* Trip Sheet Tracking */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Trip Sheet Tracking</h2>
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
          <p className="mt-2 text-xs font-medium text-amber-600">
            {awaitingReceipt.length} sheet{awaitingReceipt.length > 1 ? "s" : ""} delivered but not yet confirmed received.
          </p>
        )}
      </div>

      <Separator />


      {/* Quick Links */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-600">Quick Access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-center text-xs font-semibold transition-all hover:-translate-y-1 hover:shadow-md ${color}`}
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
              <h2 className="text-sm font-semibold text-gray-800">Fleet Status</h2>
              <p className="text-xs text-gray-500">{trucks.length} trucks registered</p>
            </div>
            <Segmented
              label="Filter trucks by status"
              value={fleetFilter}
              onChange={setFleetFilter}
              options={[
                { value: "all", label: "All", count: trucks.length },
                { value: "trip", label: "On Trip", count: onTripTrucks.length, dot: "bg-blue-500" },
                { value: "free", label: "Available", count: availableTrucks.length, dot: "bg-emerald-500" },
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
            <p className="py-8 text-center text-sm text-gray-400">
              {trucks.length === 0 ? "No trucks registered yet." : "No trucks in this view."}
            </p>
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
