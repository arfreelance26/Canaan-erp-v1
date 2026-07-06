"use client";

import { useEffect, useState } from "react";
import { TripTable } from "@/components/trips/TripTable";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

const CURRENT_STATUSES: Trip["status"][] = ["Started", "Loaded", "On-Transit", "Reached", "Unloaded"];

export default function CurrentTripsPage() {
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
        Promise.all([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
          .then(([t, d, tr, c]) => {
            setAllTrips(t);
            setDrivers(d);
            setTrucks(tr);
            setCustomers(c);
          })
          .finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => {
    Promise.all([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
    .then(([t, d, tr, c]) => {
    setAllTrips(t);
    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);
    })
    .finally(() => setLoading(false));
      }, 5000);

  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey(k => k + 1));

  const trips = allTrips.filter((trip) => CURRENT_STATUSES.includes(trip.status));
  const filteredTrips = trips.filter((t) => tripMatchesSearch(t, searchQuery, trucks));

  async function handleMarkCompleted(id: string) {
    try {
      const updated = await tripsApi.updateStatus(id, "Completed");
      setAllTrips((prev) => prev.map((trip) => (trip.id === id ? updated : trip)));
      showSuccess("Trip marked as completed.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update trip status.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Current Trips</h1>
          <p className="mt-1 text-sm text-gray-500">
            Active and upcoming trips being handled by drivers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search trips..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/trips" filename="trips.xlsx" />
        </div>
      </div>

      <TripTable
        trips={filteredTrips}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        onMarkCompleted={handleMarkCompleted}
        emptyStateMessage='No trips assigned yet. Go to Assign Trips to create one.'
      />
    </div>
  );
}
