"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, customersApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Customer } from "@/types/customer";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search, CheckCircle2, Circle } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";

export default function SheetCollectionPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  function loadData() {
    return Promise.all([
      tripsApi.list("Completed"),
      driversApi.list(),
      customersApi.list(),
    ]).then(([t, d, c]) => {
      setTrips(t);
      setDrivers(d);
      setCustomers(c);
    });
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  useAutoRefresh(() => {
    loadData();
  }, 10000);

  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  async function handleToggleCollect(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      const updated = await tripsApi.collectSheet(trip.id);
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
      showSuccess(
        updated.tripSheetCollected
          ? `Trip sheet marked as collected for ${trip.tripId}.`
          : `Trip sheet collection unmarked for ${trip.tripId}.`
      );
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update collection status.");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={7} />;

  const filtered = trips.filter(
    (t) =>
      !searchQuery ||
      t.tripId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.bookingReferenceNo?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const collected = filtered.filter((t) => t.tripSheetCollected);
  const pending = filtered.filter((t) => !t.tripSheetCollected);

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Sheet Collection</h1>
          <p className="mt-1 text-sm text-gray-500">
            Mark trip sheets as collected from drivers before reconciliation
          </p>
        </div>
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
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Completed</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Sheets Collected</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{collected.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Pending Collection</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{pending.length}</p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No completed trips found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Status", "Trip ID", "Booking Ref", "Customer", "Route", "Driver", "Collected On", "Action"].map(
                  (col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((trip) => {
                const driver = driverById.get(trip.driverId);
                const customer = customerById.get(trip.customerId);
                const isCollected = trip.tripSheetCollected;
                const isBusy = toggling.has(trip.id);

                return (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {isCollected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Collected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          <Circle className="h-3 w-3" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{customer?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {trip.origin} <span className="text-gray-400">→</span> {trip.destination}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{driver?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {trip.tripSheetCollectedAt
                        ? new Date(trip.tripSheetCollectedAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleCollect(trip)}
                        className={
                          isCollected
                            ? "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                            : "rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        }
                      >
                        {isBusy ? "..." : isCollected ? "Undo" : "Mark Collected"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
