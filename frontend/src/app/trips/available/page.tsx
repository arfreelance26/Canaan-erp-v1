"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TripTable } from "@/components/trips/TripTable";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { RiNavigationLine as Navigation } from "@remixicon/react";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import { TRIP_PROGRESS_STATUSES, TRIP_STATUS_OPTIONS } from "@/lib/trip-data";
import { ROUTE_STEPS, getRouteStep } from "@/lib/trip-stage";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { showError } from "@/lib/feedback";

import { PillSearch } from "@/components/ui/PillSearch";
// The office's four steps (Booked → Current → Completed → Closed), not the
// driver's fine-grained progress statuses, which all count as "Current".
type Filter = "All" | (typeof ROUTE_STEPS)[number];
const FILTERS: Filter[] = ["All", ...ROUTE_STEPS];

/** Trip statuses the Excel export asks for under each filter. Completed and
 *  Closed share "Completed": closure isn't a status the export can filter on. */
const EXPORT_STATUSES: Record<Filter, Trip["status"][]> = {
  All: TRIP_STATUS_OPTIONS,
  Booked: ["Assigned"],
  Current: TRIP_PROGRESS_STATUSES.filter((s) => s !== "Assigned" && s !== "Completed"),
  Completed: ["Completed"],
  Closed: ["Completed"],
};

export default function AvailableTripsPage() {
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
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
    (filter === "All" || ROUTE_STEPS[getRouteStep(trip) ?? -1] === filter) &&
    tripMatchesSearch(trip, searchQuery, trucks)
  );

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-success-border bg-success-surface text-success-text shadow-sm">
          <Navigation className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Available Trips</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            View all trips by stage: booked, current, completed and closed
          </p>
        </div>
      </div>

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trips..." value={searchQuery} onChange={setSearchQuery} />
        <div data-tour="export" className="ml-auto flex flex-wrap items-center gap-3">
          {/* Follows the status chip currently selected; "All" = every status the page can show */}
          <DownloadExcelButton
            path="/exports/trips"
            filename={filter === "All" ? "available_trips.xlsx" : `${filter.toLowerCase()}_trips.xlsx`}
            params={{ status: EXPORT_STATUSES[filter].join(",") }}
          />
        </div>
      </div>

      <div data-tour="trip-stages" className="flex flex-wrap gap-2">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-body-medium transition-colors",
              filter === status
                ? "bg-accent-solid text-on-solid"
                : "bg-fill-2 text-text-secondary hover:bg-fill-3"
            )}
          >
            {status}
          </button>
        ))}
      </div>

      <div data-tour="trip-table">
        <TripTable
          trips={trips}
          drivers={drivers}
          trucks={trucks}
          customers={customers}
        />
      </div>
    </div>
  );
}
