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
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { GenerateInvoiceDialog, type InvoiceType } from "@/components/trips/GenerateInvoiceDialog";
import { InvoicePreviewDialog } from "@/components/trips/InvoicePreviewDialog";

type PreviewState = {
  trip: Trip;
  closure: TripClosureData;
  sheet: TripSheetData | undefined;
  customer: Customer | undefined;
  invoiceType: InvoiceType;
  autoDownload?: boolean;
};

export default function TripFinalizationPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [invoicedIds, setInvoicedIds] = useState<Set<string>>(new Set());
  // Tracks invoice type used per trip (for preview / download after generation)
  const [invoiceTypes, setInvoiceTypes] = useState<Map<string, InvoiceType>>(new Map());

  const [dialogTrip, setDialogTrip] = useState<Trip | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  async function loadAll() {
    const [allTrips, d, tr, c] = await Promise.all([
      tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list(),
    ]);

    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);

    const sheettedTrips = allTrips.filter((t) => (t as any).hasSheet === true);
    setTrips(sheettedTrips);

    const invoiced = new Set<string>(
      allTrips.filter((t) => (t as any).isInvoiced === true).map((t) => t.id)
    );
    setInvoicedIds(invoiced);

    const [closureResults, sheetResults] = await Promise.all([
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

    const closureMap = new Map<string, TripClosureData>();
    for (const r of closureResults) if (r) closureMap.set(r.tripId, r.closure);
    setClosures(closureMap);

    const sheetMap = new Map<string, TripSheetData>();
    for (const r of sheetResults) if (r) sheetMap.set(r.tripId, r.sheet);
    setSheets(sheetMap);
  }

  useEffect(() => { loadAll().finally(() => setLoading(false)); }, []);
  useAutoRefresh(() => { loadAll(); }, 5000);

  const driverById   = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById    = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  async function handleDialogSubmit(data: TripClosureData, invoiceType: InvoiceType) {
    if (!dialogTrip) return;

    await tripsApi.close(dialogTrip.id, data);
    await tripsApi.invoice(dialogTrip.id);
    setInvoicedIds((prev) => new Set([...prev, dialogTrip.id]));

    const savedClosure = await tripsApi.getClosure(dialogTrip.id).catch(() => null);
    const finalClosure = savedClosure ?? data;
    setClosures((prev) => new Map(prev).set(dialogTrip.id, finalClosure));

    // Remember which invoice type was used for this trip
    setInvoiceTypes((prev) => new Map(prev).set(dialogTrip.id, invoiceType));

    const trip = dialogTrip;
    setDialogTrip(null);

    // Open invoice preview immediately after generation
    setPreview({
      trip,
      closure: finalClosure,
      sheet: sheets.get(trip.id),
      customer: customerById.get(trip.customerId),
      invoiceType,
    });
  }

  function openPreview(trip: Trip, autoDownload = false) {
    const closure  = closures.get(trip.id);
    if (!closure) return;
    setPreview({
      trip,
      closure,
      sheet:        sheets.get(trip.id),
      customer:     customerById.get(trip.customerId),
      invoiceType:  invoiceTypes.get(trip.id) ?? "Bill of Supply",
      autoDownload,
    });
  }

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trip Finalization</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate invoices for trips to complete the trip workflow
        </p>
      </div>

      {trips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No trips with a sheet yet. Add a trip sheet on the{" "}
          <a href="/trips/reconciliation" className="text-blue-600 underline">Trip Reconciliation</a> page first.
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
                const closure    = closures.get(trip.id);
                const sheet      = sheets.get(trip.id);
                const driver     = driverById.get(trip.driverId);
                const truck      = truckById.get(trip.vehicleId);
                const customer   = customerById.get(trip.customerId);
                const isInvoiced = invoicedIds.has(trip.id);

                const totalTransport = sheet ? n(sheet.hireAmount) : 0;
                const totalBilling   = sheet ? calcTripExpenses(sheet) : 0;

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
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Invoice Generated
                          </span>
                          <div className="flex gap-1.5">
                            {/* Preview button */}
                            <button
                              type="button"
                              onClick={() => openPreview(trip, false)}
                              disabled={!closure}
                              className="flex items-center gap-1 rounded-lg border border-indigo-300 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                            >
                              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Preview
                            </button>

                            {/* Download PDF button */}
                            <button
                              type="button"
                              onClick={() => openPreview(trip, true)}
                              disabled={!closure}
                              className="flex items-center gap-1 rounded-lg border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                            >
                              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download PDF
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDialogTrip(trip)}
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

      {/* ── Generate Invoice Dialog ── */}
      <GenerateInvoiceDialog
        open={dialogTrip !== null}
        trip={dialogTrip}
        closure={dialogTrip ? closures.get(dialogTrip.id) : undefined}
        driver={dialogTrip ? driverById.get(dialogTrip.driverId) : undefined}
        truck={dialogTrip ? truckById.get(dialogTrip.vehicleId) : undefined}
        customer={dialogTrip ? customerById.get(dialogTrip.customerId) : undefined}
        onClose={() => setDialogTrip(null)}
        onSubmit={handleDialogSubmit}
      />

      {/* ── Invoice Preview / Download ── */}
      <InvoicePreviewDialog
        open={preview !== null}
        invoiceType={preview?.invoiceType ?? "Bill of Supply"}
        trip={preview?.trip ?? null}
        closure={preview?.closure ?? null}
        sheet={preview?.sheet}
        customer={preview?.customer}
        autoDownload={preview?.autoDownload}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
