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
  X,
} from "lucide-react";
import { dashboardApi, tripsApi, trucksApi, editApprovalsApi } from "@/lib/api";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { StatCard } from "./StatCard";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
    <Card className={onTrip
      ? "border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50"
      : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50"
    }>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">{truck.registrationNumber}</p>
            <p className="text-xs text-gray-500">{truck.truckId}</p>
          </div>
          <Badge variant={onTrip ? "active" : "available"}>
            <Circle className="h-1.5 w-1.5 fill-current" />
            {onTrip ? "On Trip" : "Available"}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Truck className="h-3 w-3 shrink-0" />
          <span className="truncate">{truck.truckType}</span>
        </div>

        {onTrip && activeTrip && (
          <div className="rounded-lg border border-blue-200 bg-white/70 px-3 py-2 dark:bg-white/5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
              {activeTrip.tripId}
            </p>
            <div className="flex items-center gap-1 text-[11px] text-gray-700">
              <MapPin className="h-3 w-3 shrink-0 text-blue-400" />
              <span className="truncate font-medium">{activeTrip.origin}</span>
              <span className="text-gray-400">→</span>
              <span className="truncate font-medium">{activeTrip.destination}</span>
            </div>
            <Badge
              variant={STATUS_VARIANT[activeTrip.status ?? ""] ?? "neutral"}
              className="mt-1.5"
            >
              {activeTrip.status}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FleetManagerDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [trucks, setTrucks] = useState<TruckType[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [sheetDeliveredFilter, setSheetDeliveredFilter] = useState<"All" | "Awaiting Receipt" | "Received">("All");
  const [sheetDeliveredDate,   setSheetDeliveredDate]   = useState("");
  const [sheetReceivedFilter,  setSheetReceivedFilter]  = useState<"All" | "Pending Entry" | "Entered">("All");
  const [sheetReceivedDate,    setSheetReceivedDate]    = useState("");
  const [sheetEnteredDate,     setSheetEnteredDate]     = useState("");

  useEffect(() => {
    Promise.all([
      dashboardApi.overview(),
      tripsApi.list(),
      trucksApi.list(),
    ])
      .then(([ov, trips, trks]) => {
        setOverview(ov as unknown as OverviewData);
        setAllTrips(trips);
        setTrucks(trks);
        editApprovalsApi.list("Pending")
          .then((r) => setPendingApprovals(r.length))
          .catch(() => setPendingApprovals(0));
        const completed = (trips as Trip[]).filter((t) => t.hasSheet);
        Promise.all(
          completed.map((t) =>
            tripsApi.getSheet(t.id).then((s) => s ? ({ id: t.id, sheet: s }) : null).catch(() => null)
          )
        ).then((results) => {
          const m = new Map<string, TripSheetData>();
          for (const r of results) { if (r) m.set(r.id, r.sheet); }
          setSheets(m);
        });
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
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-gray-900">Commercial Manager</h1>
        <p className="text-sm text-gray-500">Real-time fleet status, active trips, and operational overview</p>
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
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                <FileCheck2 className="h-4 w-4" />
                Delivered by Yard Supervisor
              </p>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-bold text-emerald-700">
                {sheetsDelivered.length}
              </span>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {(["All", "Awaiting Receipt", "Received"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setSheetDeliveredFilter(f)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${sheetDeliveredFilter === f ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-emerald-100"}`}>
                  {f} ({f === "All" ? sheetsDelivered.length : f === "Awaiting Receipt" ? awaitingReceipt.length : sheetsReceived.length})
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center gap-2">
              <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap">Delivered on</label>
              <input type="date" value={sheetDeliveredDate} onChange={(e) => setSheetDeliveredDate(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              {sheetDeliveredDate && (
                <>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{deliveredVisible.length}</span>
                  <button type="button" onClick={() => setSheetDeliveredDate("")} className="text-[11px] text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
                </>
              )}
            </div>
            {deliveredVisible.length === 0 ? (
              <p className="text-xs text-gray-400">No trips in this filter.</p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1">
                {deliveredVisible.map((t) => (
                  <li key={t.id} className="rounded-lg bg-white/80 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-800">{t.tripId}</span>
                      <span className="text-gray-500">{t.bookingReferenceNo}</span>
                      {t.tripSheetReceived
                        ? <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">Received</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">Awaiting Receipt</span>
                      }
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      Delivered: <span className="text-gray-600">{fmtDate(t.tripSheetCollectedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Received by Trip Sheet Register */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
                <Inbox className="h-4 w-4" />
                Received by Trip Sheet Register
              </p>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-bold text-blue-700">
                {receivedOrEntered.length}
              </span>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {(["All", "Pending Entry", "Entered"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setSheetReceivedFilter(f)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${sheetReceivedFilter === f ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-blue-100"}`}>
                  {f} ({f === "All" ? receivedOrEntered.length : f === "Pending Entry" ? pendingEntry.length : entered.length})
                </button>
              ))}
            </div>
            <div className="mb-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label className="w-24 text-[11px] font-medium text-gray-500">Received on</label>
                <input type="date" value={sheetReceivedDate} onChange={(e) => setSheetReceivedDate(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                {sheetReceivedDate && (
                  <>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{receivedVisible.length}</span>
                    <button type="button" onClick={() => setSheetReceivedDate("")} className="text-[11px] text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="w-24 text-[11px] font-medium text-gray-500">Entered on</label>
                <input type="date" value={sheetEnteredDate} onChange={(e) => setSheetEnteredDate(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                {sheetEnteredDate && (
                  <>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{receivedVisible.length}</span>
                    <button type="button" onClick={() => setSheetEnteredDate("")} className="text-[11px] text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
                  </>
                )}
              </div>
            </div>
            {receivedVisible.length === 0 ? (
              <p className="text-xs text-gray-400">No trips in this filter.</p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1">
                {receivedVisible.map((t) => (
                  <li key={t.id} className="rounded-lg bg-white/80 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-800">{t.tripId}</span>
                      <span className="text-gray-500">{t.bookingReferenceNo}</span>
                      {t.tripSheetDate
                        ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">Entered</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">Pending Entry</span>
                      }
                    </div>
                    <div className="mt-0.5 flex gap-3 text-[11px] text-gray-400">
                      <span>Received: <span className="text-gray-600">{fmtDate(t.tripSheetReceivedAt)}</span></span>
                      {t.tripSheetDate && <span>Entered: <span className="text-gray-600">{fmtDate(t.tripSheetDate)}</span></span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
        {awaitingReceipt.length > 0 && (
          <p className="mt-2 text-xs font-medium text-amber-600">
            {awaitingReceipt.length} sheet{awaitingReceipt.length > 1 ? "s" : ""} delivered but not yet confirmed received.
          </p>
        )}
      </div>

      <Separator />

      {/* P&L — top 10 preview */}
      {sheets.size > 0 && (() => {
        const rows = allTrips
          .filter((t) => sheets.has(t.id))
          .map((t) => {
            const s = sheets.get(t.id)!;
            const hire    = n(s.hireAmount);
            const expense = n(s.totalExpense);
            const pnl     = hire - expense;
            const km      = n(s.totalKm);
            return { t, hire, expense, pnl, km };
          })
          .sort((a, b) => b.pnl - a.pnl)
          .slice(0, 10);

        const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);
        const fmtAmt = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

        return (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-600">P&L — Per Trip</h2>
              <div className="flex items-center gap-3">
                <Badge variant={totalPnl >= 0 ? "available" : "critical"}>
                  Net: {fmtAmt(totalPnl)}
                </Badge>
                <Link href="/trips/pnl-mileage" className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">
                  View all →
                </Link>
              </div>
            </div>
            <Card>
              <div className="overflow-auto max-h-96">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {["Trip ID", "Route", "Hire Amount", "Total Expense", "P&L", "KM"].map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map(({ t, hire, expense, pnl, km }, idx) => (
                      <tr key={t.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">{t.tripId}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{t.origin} → {t.destination}</td>
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-blue-700">{fmtAmt(hire)}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-600">{fmtAmt(expense)}</td>
                        <td className={`whitespace-nowrap px-4 py-2 font-bold ${pnl >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtAmt(pnl)}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-600">{km > 0 ? `${km} km` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      })()}

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
      <div>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-600">Fleet Status</h2>
          <Badge variant="active">{onTripTrucks.length} On Trip</Badge>
          <Badge variant="available">{availableTrucks.length} Available</Badge>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : trucks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-gray-400">
              No trucks registered yet.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {onTripTrucks.length > 0 && (
              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-blue-600">
                  <Navigation className="h-3.5 w-3.5" />
                  On Trip — {onTripTrucks.length} truck{onTripTrucks.length > 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {onTripTrucks.map((truck) => (
                    <TruckCard key={truck.truckId} truck={truck} activeTrip={activeTripByVehicle.get(truck.truckId)} />
                  ))}
                </div>
              </div>
            )}
            {availableTrucks.length > 0 && (
              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Available — {availableTrucks.length} truck{availableTrucks.length > 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {availableTrucks.map((truck) => (
                    <TruckCard key={truck.truckId} truck={truck} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
