"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TripTable } from "@/components/trips/TripTable";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import { TRIP_PROGRESS_STATUSES } from "@/lib/trip-data";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

const FILTERS: Array<Trip["status"] | "All"> = ["All", ...TRIP_PROGRESS_STATUSES];

export default function AvailableTripsPage() {
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Trip["status"] | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);

  useEffect(() => {
        Promise.all([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
          .then(([t, d, tr, c]) => {
            setAllTrips(t);
            setDrivers(d);
            setTrucks(tr);
            setCustomers(c);
          })
          .finally(() => setLoading(false));
      }, []);
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


  const trips = allTrips.filter((trip) =>
    (filter === "All" || trip.status === filter) &&
    tripMatchesSearch(trip, searchQuery, trucks)
  );

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Available Trips</h1>
          <p className="mt-1 text-sm text-gray-500">
            View all trips and filter by the progress status updated by the driver
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

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === status
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {status}
          </button>
        ))}
      </div>

      <TripTable
        trips={trips}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
      />
    </div>
  );
}
