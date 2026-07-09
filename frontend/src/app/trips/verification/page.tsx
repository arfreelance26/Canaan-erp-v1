"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery, containerRef } from "@/lib/trip-search";
import { VerifyTripDialog } from "@/components/trips/VerifyTripDialog";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { n, calcTripExpenses } from "@/types/trip-sheet";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

type SheetDialogMode = "view" | "edit";

export default function TripVerificationPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  const [verifyTrip, setVerifyTrip] = useState<Trip | null>(null);
  const [sheetTrip, setSheetTrip] = useState<Trip | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetDialogMode>("view");
  const [bookingSheetTrip, setBookingSheetTrip] = useState<Trip | null>(null);
  const [bookingSheetReadOnly, setBookingSheetReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);

  useEffect(() => {
        Promise.all([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
          .then(([allTrips, d, tr, c]) => {
            setDrivers(d);
            setTrucks(tr);
            setCustomers(c);

            // Trips that have a sheet
            const sheettedTrips = allTrips.filter((t) => (t as any).hasSheet === true);
            setTrips(sheettedTrips);

            // Pre-populate verified/flagged from server state
            const verified = new Set<string>(
              allTrips
                .filter((t) => (t as any).verificationStatus === "verified")
                .map((t) => t.id)
            );
            const flagged = new Set<string>(
              allTrips
                .filter((t) => (t as any).verificationStatus === "flagged")
                .map((t) => t.id)
            );
            setVerifiedIds(verified);
            setFlaggedIds(flagged);

            // Fetch closures and sheets for all sheeted trips
            return Promise.all([
              Promise.all(
                sheettedTrips.map((trip) =>
                  tripsApi.getClosure(trip.id).then((closure) => ({ tripId: trip.id, closure })).catch(() => null)
                )
              ),
              Promise.all(
                sheettedTrips.map((trip) =>
                  tripsApi.getSheet(trip.id).then((sheet) => ({ tripId: trip.id, sheet })).catch(() => null)
                )
              ),
            ]);
          })
          .then(([closureResults, sheetResults]) => {
            const closureMap = new Map<string, TripClosureData>();
            for (const result of closureResults) {
              if (result) closureMap.set(result.tripId, result.closure);
            }
            setClosures(closureMap);

            const sheetMap = new Map<string, TripSheetData>();
            for (const result of sheetResults) {
              if (result && result.sheet) sheetMap.set(result.tripId, result.sheet);
            }
            setSheets(sheetMap);
          })
          .finally(() => setLoading(false));
      }, []);
      useAutoRefresh(() => {
    Promise.all([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
    .then(([allTrips, d, tr, c]) => {
    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);

    // Trips that have a sheet
    const sheettedTrips = allTrips.filter((t) => (t as any).hasSheet === true);
    setTrips(sheettedTrips);

    // Pre-populate verified/flagged from server state
    const verified = new Set<string>(
      allTrips
        .filter((t) => (t as any).verificationStatus === "verified")
        .map((t) => t.id)
    );
    const flagged = new Set<string>(
      allTrips
        .filter((t) => (t as any).verificationStatus === "flagged")
        .map((t) => t.id)
    );
    setVerifiedIds(verified);
    setFlaggedIds(flagged);

    // Fetch closures and sheets for all sheeted trips
    return Promise.all([
      Promise.all(
        sheettedTrips.map((trip) =>
          tripsApi.getClosure(trip.id).then((closure) => ({ tripId: trip.id, closure })).catch(() => null)
        )
      ),
      Promise.all(
        sheettedTrips.map((trip) =>
          tripsApi.getSheet(trip.id).then((sheet) => ({ tripId: trip.id, sheet })).catch(() => null)
        )
      ),
    ]);
    })
    .then(([closureResults, sheetResults]) => {
    const closureMap = new Map<string, TripClosureData>();
    for (const result of closureResults) {
      if (result) closureMap.set(result.tripId, result.closure);
    }
    setClosures(closureMap);

    const sheetMap = new Map<string, TripSheetData>();
    for (const result of sheetResults) {
      if (result && result.sheet) sheetMap.set(result.tripId, result.sheet);
    }
    setSheets(sheetMap);
    })
    .finally(() => setLoading(false));
      }, 5000);


  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  function openBookingSheet(trip: Trip, readOnly: boolean) {
    setVerifyTrip(null);
    setBookingSheetTrip(trip);
    setBookingSheetReadOnly(readOnly);
  }

  async function handleBookingSheetSubmit(data: TripClosureData) {
    if (!bookingSheetTrip) return;
    try {
      const updated = await tripsApi.close(bookingSheetTrip.id, data);
      setClosures((prev) => new Map([...prev, [bookingSheetTrip.id, updated]]));
      setVerifyTrip(bookingSheetTrip);
      setBookingSheetTrip(null);
      showSuccess("Booking sheet saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save booking sheet.");
    }
  }

  function openSheetDialog(trip: Trip, mode: SheetDialogMode) {
    setVerifyTrip(null);
    setSheetTrip(trip);
    setSheetMode(mode);
  }

  async function handleSaveSheet(data: TripSheetData) {
    if (!sheetTrip) return;
    try {
      const saved = await tripsApi.upsertSheet(sheetTrip.id, data);
      setSheets((prev) => new Map([...prev, [sheetTrip.id, saved]]));
      // Return to the verify dialog so the user can confirm or flag the updated sheet
      setVerifyTrip(sheetTrip);
      setSheetTrip(null);
      showSuccess("Trip sheet saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save trip sheet.");
    }
  }

  async function handleConfirmVerification() {
    if (!verifyTrip) return;
    try {
      await tripsApi.verify(verifyTrip.id);
      setVerifiedIds((prev) => new Set([...prev, verifyTrip.id]));
      setFlaggedIds((prev) => { const s = new Set(prev); s.delete(verifyTrip.id); return s; });
      setVerifyTrip(null);
      showSuccess("Trip data verified successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to verify trip data.");
    }
  }

  async function handleFlag() {
    if (!verifyTrip) return;
    try {
      await tripsApi.flag(verifyTrip.id);
      setFlaggedIds((prev) => new Set([...prev, verifyTrip.id]));
      setVerifiedIds((prev) => { const s = new Set(prev); s.delete(verifyTrip.id); return s; });
      setVerifyTrip(null);
      showSuccess("Trip flagged for review.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to flag trip.");
    }
  }

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={10} />;

  const filteredTrips = trips.filter((t) => tripMatchesSearch(t, searchQuery, trucks, drivers));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Verification</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and verify all trip data before proceeding to finalization
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by truck no., driver, trip ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/trips" filename="trips.xlsx" />
        </div>
      </div>

      {filteredTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No trips ready for verification. Add a trip sheet on the{" "}
          <a href="/trips/reconciliation" className="text-blue-600 underline">Trip Reconciliation</a> page first.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1000px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Trip ID", "Booking Ref", "Customer", "Route", "Container No", "Driver", "Vehicle",
                  "Hire Amount", "Total Expense", "Status", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTrips.map((trip) => {
                const closure = closures.get(trip.id);
                const sheet = sheets.get(trip.id);
                const driver = driverById.get(trip.driverId);
                const truck = truckById.get(trip.vehicleId);
                const customer = customerById.get(trip.customerId);
                const isVerified = verifiedIds.has(trip.id);
                const isFlagged = flaggedIds.has(trip.id);

                const totalTransport = sheet ? n(sheet.hireAmount) : 0;
                const totalBilling = sheet ? calcTripExpenses(sheet) : 0;

                return (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{(customer?.name ?? trip.shipperConsignee) || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {trip.origin} <span className="text-gray-400">→</span> {trip.destination}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{containerRef(trip)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span>{driver?.name ?? "—"}</span>
                      {trip.driverChangeRemark && (
                        <p className="mt-0.5 text-[11px] text-amber-600 leading-snug max-w-[160px] whitespace-normal">
                          Remark: {trip.driverChangeRemark}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{truck?.registrationNumber ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-blue-700">{fmt(totalTransport)}</td>
                    <td className="px-4 py-3 font-medium text-emerald-700">{fmt(totalBilling)}</td>
                    <td className="px-4 py-3">
                      {isVerified ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          Verified
                        </span>
                      ) : isFlagged ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">
                          Flagged
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isVerified ? (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs text-gray-500">
                            Trip Sheet Verified by{" "}
                            <span className="font-medium text-gray-700">Fleet Manager</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setVerifyTrip(trip)}
                            className="w-fit rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            View Details
                          </button>
                        </div>
                      ) : isFlagged ? (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs text-red-500">Flagged for rechecking</p>
                          <button
                            type="button"
                            onClick={() => setVerifyTrip(trip)}
                            className="w-fit rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Review Again
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setVerifyTrip(trip)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          VERIFY TRIP DATA
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

      <VerifyTripDialog
        open={verifyTrip !== null}
        trip={verifyTrip}
        closure={verifyTrip ? closures.get(verifyTrip.id) : undefined}
        sheet={verifyTrip ? sheets.get(verifyTrip.id) : undefined}
        onClose={() => setVerifyTrip(null)}
        onViewSheet={() => verifyTrip && openSheetDialog(verifyTrip, "view")}
        onEditSheet={() => verifyTrip && openSheetDialog(verifyTrip, "edit")}
        onViewBookingSheet={() => verifyTrip && openBookingSheet(verifyTrip, true)}
        onEditBookingSheet={() => verifyTrip && openBookingSheet(verifyTrip, false)}
        onFlag={handleFlag}
        onConfirm={handleConfirmVerification}
      />

      <BookingSheetDialog
        open={bookingSheetTrip !== null}
        trip={bookingSheetTrip}
        closure={bookingSheetTrip ? closures.get(bookingSheetTrip.id) : undefined}
        driver={bookingSheetTrip ? driverById.get(bookingSheetTrip.driverId) : undefined}
        truck={bookingSheetTrip ? truckById.get(bookingSheetTrip.vehicleId) : undefined}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        readOnly={bookingSheetReadOnly}
        onClose={() => { setVerifyTrip(bookingSheetTrip); setBookingSheetTrip(null); }}
        onSubmit={handleBookingSheetSubmit}
      />

      <TripSheetDialog
        open={sheetTrip !== null}
        trip={sheetTrip}
        closure={sheetTrip ? closures.get(sheetTrip.id) : undefined}
        existingSheet={sheetTrip ? sheets.get(sheetTrip.id) : undefined}
        readOnly={sheetMode === "view"}
        drivers={drivers}
        trucks={trucks}
        onClose={() => {
          setVerifyTrip(sheetTrip);
          setSheetTrip(null);
        }}
        onSubmit={handleSaveSheet}
      />
    </div>
  );
}
