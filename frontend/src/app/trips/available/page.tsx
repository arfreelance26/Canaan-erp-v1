"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TripTable } from "@/components/trips/TripTable";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { Navigation } from "lucide-react";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import { TRIP_PROGRESS_STATUSES, TRIP_STATUS_OPTIONS } from "@/lib/trip-data";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { showError } from "@/lib/swal";

import { PillSearch } from "@/components/ui/PillSearch";
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

  // allSettled, not all — a single failed source (e.g. right after relogin, or on
  // any 5s poll) must not blank the whole table; each keeps its last-known-good
  // state and a toast names what didn't refresh.
  function loadData() {
    return Promise.allSettled([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
      .then(([t, d, tr, c]) => {
        const failed: string[] = [];
        if (t.status === "fulfilled") setAllTrips(t.value); else failed.push("Trips");
        if (d.status === "fulfilled") setDrivers(d.value); else failed.push("Drivers");
        if (tr.status === "fulfilled") setTrucks(tr.value); else failed.push("Trucks");
        if (c.status === "fulfilled") setCustomers(c.value); else failed.push("Customers");
        if (failed.length > 0) {
          showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
        }
      });
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useAutoRefresh(() => {
    loadData().finally(() => setLoading(false));
  }, 5000);


  const trips = allTrips.filter((trip) =>
    (filter === "All" || trip.status === filter) &&
    tripMatchesSearch(trip, searchQuery, trucks)
  );

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-600 shadow-sm">
          <Navigation className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Available Trips</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            View all trips and filter by the progress status updated by the driver
          </p>
        </div>
      </div>

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trips..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Follows the status chip currently selected; "All" = every status the page can show */}
          <DownloadExcelButton
            path="/exports/trips"
            filename={filter === "All" ? "available_trips.xlsx" : `${filter.toLowerCase()}_trips.xlsx`}
            params={{ status: filter === "All" ? TRIP_STATUS_OPTIONS.join(",") : filter }}
          />
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
