"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { dashboardApi, tripsApi, trucksApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { Trip } from "@/types/trip";
import type { Truck as TruckType } from "@/types/truck";

interface OverviewData {
  total_trucks: number;
  active_trips: number;
  total_trips: number;
  total_drivers: number;
  trip_status_counts: Record<string, number>;
}

const ACTIVE_STATUSES = new Set(["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);

const STATUS_COLORS: Record<string, string> = {
  "Assigned":   "bg-sky-100 text-sky-700",
  "Started":    "bg-blue-100 text-blue-700",
  "Loaded":     "bg-indigo-100 text-indigo-700",
  "On-Transit": "bg-violet-100 text-violet-700",
  "Reached":    "bg-amber-100 text-amber-700",
  "Unloaded":   "bg-teal-100 text-teal-700",
};

const QUICK_LINKS = [
  { label: "Driver Attendance", href: "/attendance/drivers", icon: IdCard,       color: "bg-blue-50 text-blue-600 border-blue-200" },
  { label: "Assign Trips",      href: "/trips/assign",       icon: Send,          color: "bg-violet-50 text-violet-600 border-violet-200" },
  { label: "Current Trips",     href: "/trips/current",      icon: Navigation,    color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  { label: "Completed Trips",   href: "/trips/completed",    icon: CheckCircle2,  color: "bg-teal-50 text-teal-600 border-teal-200" },
  { label: "Trip History",      href: "/trips/history",      icon: History,       color: "bg-amber-50 text-amber-600 border-amber-200" },
];

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function TruckCard({ truck, activeTrip }: { truck: TruckType; activeTrip?: Trip }) {
  const onTrip = !!activeTrip;

  return (
    <div className={`relative flex flex-col gap-3 rounded-xl border p-4 transition-shadow hover:shadow-md ${
      onTrip
        ? "border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50"
        : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50"
    }`}>
      {/* Status dot */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900">{truck.truckId}</p>
          <p className="text-xs text-gray-500">{truck.registrationNumber}</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          onTrip ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
        }`}>
          <Circle className={`h-1.5 w-1.5 fill-current`} />
          {onTrip ? "On Trip" : "Available"}
        </span>
      </div>

      {/* Truck meta */}
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <Truck className="h-3 w-3 shrink-0" />
        <span className="truncate">{truck.truckType}</span>
      </div>

      {/* Trip info if on trip */}
      {onTrip && activeTrip && (
        <div className="rounded-lg border border-blue-200 bg-white/70 px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
            {activeTrip.tripId}
          </p>
          <div className="flex items-center gap-1 text-[11px] text-gray-700">
            <MapPin className="h-3 w-3 shrink-0 text-blue-400" />
            <span className="truncate font-medium">{activeTrip.origin}</span>
            <span className="text-gray-400">→</span>
            <span className="truncate font-medium">{activeTrip.destination}</span>
          </div>
          <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            STATUS_COLORS[activeTrip.status ?? ""] ?? "bg-gray-100 text-gray-600"
          }`}>
            {activeTrip.status}
          </span>
        </div>
      )}
    </div>
  );
}

export function FleetManagerDashboard() {
  const [overview, setOverview]     = useState<OverviewData | null>(null);
  const [allTrips, setAllTrips]     = useState<Trip[]>([]);
  const [trucks, setTrucks]         = useState<TruckType[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useWebSocketEvent("trip_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));

  // Map vehicleId → active trip
  const activeTripByVehicle = new Map<string, Trip>();
  for (const trip of allTrips) {
    if (ACTIVE_STATUSES.has(trip.status ?? "") && trip.vehicleId) {
      activeTripByVehicle.set(trip.vehicleId, trip);
    }
  }

  const onTripTrucks    = trucks.filter((t) => activeTripByVehicle.has(t.truckId));
  const availableTrucks = trucks.filter((t) => !activeTripByVehicle.has(t.truckId));

  const completedCount = overview?.trip_status_counts?.["Completed"] ?? 0;
  const activeCount    = overview?.active_trips ?? 0;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fleet Manager Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Real-time fleet status, active trips, and operational overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Truck}        label="Total Fleet"      value={loading ? "—" : trucks.length}   color="bg-blue-100 text-blue-600" />
        <StatCard icon={Activity}     label="Active Trips"     value={loading ? "—" : activeCount}      color="bg-indigo-100 text-indigo-600" />
        <StatCard icon={CheckCircle2} label="Completed Trips"  value={loading ? "—" : completedCount}   color="bg-teal-100 text-teal-600" />
        <StatCard icon={Users}        label="Total Drivers"    value={loading ? "—" : (overview?.total_drivers ?? 0)} color="bg-violet-100 text-violet-600" />
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Quick Access</h2>
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

      {/* Fleet Status */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Fleet Status</h2>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            {onTripTrucks.length} On Trip
          </span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
            {availableTrucks.length} Available
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : trucks.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            No trucks registered yet.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* On Trip */}
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

            {/* Available */}
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
