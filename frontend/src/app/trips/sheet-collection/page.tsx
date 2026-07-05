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

function fmtIST(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function SheetCollectionPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function loadData() {
    return Promise.all([
      tripsApi.list("Completed"),
      driversApi.list(),
      customersApi.list(),
    ]).then(([t, d, c]) => {
      setTrips(t);
      setDrivers(d);
      setCustomers(c);
      // Clear selection on refresh so stale ids don't linger
      setSelected(new Set());
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

  const filtered = trips.filter(
    (t) =>
      !searchQuery ||
      t.tripId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.bookingReferenceNo?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const collected = filtered.filter((t) => t.tripSheetCollected);
  const pending = filtered.filter((t) => !t.tripSheetCollected);

  // Select-all state: considers only pending (uncollected) rows for the primary bulk action
  const selectableIds = pending.filter((t) => !t.hasSheet).map((t) => t.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleToggleCollect(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      const updated = await tripsApi.collectSheet(trip.id);
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
      showSuccess(
        updated.tripSheetCollected
          ? `Trip sheet marked as delivered for ${trip.tripId}.`
          : `Trip sheet delivery unmarked for ${trip.tripId}.`
      );
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update delivery status.");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  }

  async function handleBulkCollect() {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    const targets = filtered.filter((t) => selected.has(t.id) && !t.tripSheetCollected);
    let successCount = 0;
    const errors: string[] = [];
    await Promise.all(
      targets.map(async (trip) => {
        try {
          const updated = await tripsApi.collectSheet(trip.id);
          setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
          successCount++;
        } catch (err: unknown) {
          errors.push(trip.tripId);
        }
      })
    );
    setSelected(new Set());
    setBulkBusy(false);
    if (errors.length === 0) {
      showSuccess(`${successCount} trip sheet${successCount > 1 ? "s" : ""} marked as delivered.`);
    } else {
      showError(`${successCount} succeeded, ${errors.length} failed: ${errors.join(", ")}`);
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={8} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Sheet Collection</h1>
          <p className="mt-1 text-sm text-gray-500">
            Mark trip sheets as delivered from drivers before reconciliation
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
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Sheets Delivered</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{collected.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Pending Delivery</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{pending.length}</p>
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-800">
            {selected.size} trip{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={handleBulkCollect}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {bulkBusy ? "Marking..." : `Mark ${selected.size} as Delivered`}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No completed trips found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[950px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                    title="Select all pending"
                  />
                </th>
                {["Status", "Trip ID", "Booking Ref", "Customer", "Route", "Driver", "Delivered On (IST)", "Action"].map(
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
                const isChecked = selected.has(trip.id);
                const sheetSubmitted = trip.hasSheet;

                return (
                  <tr
                    key={trip.id}
                    className={isChecked ? "bg-blue-50/60" : "hover:bg-gray-50"}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(trip.id)}
                        className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {isCollected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Delivered
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
                      {trip.tripSheetCollectedAt ? fmtIST(trip.tripSheetCollectedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {isCollected && sheetSubmitted ? (
                        <span
                          title="Trip sheet already submitted in reconciliation — cannot undo delivery"
                          className="inline-block rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-400 cursor-not-allowed"
                        >
                          Locked
                        </span>
                      ) : (
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
                          {isBusy ? "..." : isCollected ? "Undo" : "Mark as Delivered"}
                        </button>
                      )}
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
