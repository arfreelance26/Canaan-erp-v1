"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { n, calcTripExpenses } from "@/types/trip-sheet";

export default function TripFinalizationPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [invoicedIds, setInvoicedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
      .then(([allTrips, d, tr, c]) => {
        setDrivers(d);
        setTrucks(tr);
        setCustomers(c);

        // Only trips that are verified
        const verifiedTrips = allTrips.filter(
          (t) => (t as any).verificationStatus === "verified"
        );
        setTrips(verifiedTrips);

        // Pre-populate invoiced IDs
        const invoiced = new Set<string>(
          allTrips.filter((t) => (t as any).isInvoiced === true).map((t) => t.id)
        );
        setInvoicedIds(invoiced);

        // Fetch closures and sheets for verified trips
        return Promise.all([
          Promise.all(
            verifiedTrips.map((trip) =>
              tripsApi.getClosure(trip.id).then((closure) => ({ tripId: trip.id, closure })).catch(() => null)
            )
          ),
          Promise.all(
            verifiedTrips.map((trip) =>
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
          if (result) sheetMap.set(result.tripId, result.sheet);
        }
        setSheets(sheetMap);
      })
      .finally(() => setLoading(false));
  }, []);

  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  async function handleGenerateInvoice(tripId: string) {
    await tripsApi.invoice(tripId);
    setInvoicedIds((prev) => new Set([...prev, tripId]));
  }

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trip Finalization</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate invoices for verified trips to complete the trip workflow
        </p>
      </div>

      {trips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No verified trips yet. Verify trip data on the{" "}
          <a href="/trips/verification" className="text-blue-600 underline">Trip Verification</a> page first.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Trip ID", "Booking Ref", "Customer", "Route", "Driver", "Vehicle",
                  "Bill To", "Hire Amount", "Total Expense", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {trips.map((trip) => {
                const closure = closures.get(trip.id);
                const sheet = sheets.get(trip.id);
                const driver = driverById.get(trip.driverId);
                const truck = truckById.get(trip.vehicleId);
                const customer = customerById.get(trip.customerId);
                const isInvoiced = invoicedIds.has(trip.id);

                const totalTransport = sheet ? n(sheet.hireAmount) : 0;
                const totalBilling = sheet ? calcTripExpenses(sheet) : 0;

                return (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{customer?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {trip.origin} <span className="text-gray-400">→</span> {trip.destination}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{driver?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{truck?.registrationNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{closure?.billTo ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-blue-700">{fmt(totalTransport)}</td>
                    <td className="px-4 py-3 font-medium text-emerald-700">{fmt(totalBilling)}</td>
                    <td className="px-4 py-3">
                      {isInvoiced ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Invoice Generated
                          </span>
                          <p className="text-xs text-gray-500">
                            by <span className="font-medium text-gray-700">Fleet Manager</span>
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleGenerateInvoice(trip.id)}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          GENERATE INVOICE
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
