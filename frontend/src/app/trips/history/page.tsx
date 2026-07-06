"use client";

import { useEffect, useState, useMemo } from "react";
import { History, FileText, ClipboardList, Receipt, Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import { useAuth } from "@/context/AuthContext";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import { n } from "@/types/trip-sheet";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { InvoicePreviewDialog } from "@/components/trips/InvoicePreviewDialog";
import type { InvoiceType } from "@/components/trips/GenerateInvoiceDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

type InvoicePreviewState = {
  trip: Trip;
  closure: TripClosureData;
  sheet?: TripSheetData;
  customer?: Customer;
  invoiceType: InvoiceType;
};

export default function TripHistoryPage() {
  const { user } = useAuth();
  const isFleetManager = user?.softwareDesignation === "Fleet Manager";
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());

  const [bookingTrip, setBookingTrip] = useState<Trip | null>(null);
  const [sheetTrip, setSheetTrip] = useState<Trip | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreviewState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);

  async function loadAll() {
    const [allTrips, d, tr, c] = await Promise.all([
      tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list(),
    ]);
    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);

    const closedTrips = allTrips.filter((t) => (t as any).hasClosure === true);
    setTrips(closedTrips);

    const [closureResults, sheetResults] = await Promise.all([
      Promise.all(
        closedTrips.map((t) =>
          tripsApi.getClosure(t.id).then((cl) => ({ id: t.id, cl })).catch(() => null)
        )
      ),
      Promise.all(
        closedTrips.map((t) =>
          tripsApi.getSheet(t.id).then((sh) => ({ id: t.id, sh })).catch(() => null)
        )
      ),
    ]);

    const closureMap = new Map<string, TripClosureData>();
    for (const r of closureResults) if (r) closureMap.set(r.id, r.cl);
    setClosures(closureMap);

    const sheetMap = new Map<string, TripSheetData>();
    for (const r of sheetResults) if (r?.sh) sheetMap.set(r.id, r.sh);
    setSheets(sheetMap);
  }

  useEffect(() => { loadAll().finally(() => setLoading(false)); }, []);
  useAutoRefresh(() => { loadAll(); }, 10000);

  useWebSocketEvent("trip_updated", loadAll);
  useWebSocketEvent("trip_closed", loadAll);

  const driverById   = useMemo(() => new Map(drivers.map((d) => [d.driverId, d])), [drivers]);
  const truckById    = useMemo(() => new Map(trucks.map((t) => [t.truckId, t])), [trucks]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  async function handleViewInvoice(trip: Trip) {
    const closure = closures.get(trip.id);
    if (!closure) return;
    const raw = await tripsApi.getInvoice(trip.id).catch(() => null);
    setInvoicePreview({
      trip,
      closure,
      sheet: sheets.get(trip.id),
      customer: customerById.get(trip.customerId),
      invoiceType: (raw?.invoice_type as InvoiceType) ?? "Bill of Supply",
    });
  }

  function fmtDate(d?: string) {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}-${m}-${y}`;
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={12} />;

  const filteredTrips = trips.filter((t) => tripMatchesSearch(t, searchQuery, trucks));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Trip History</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            All closed trips — view their booking sheet, trip sheet, and invoice.
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

      {filteredTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No closed trips found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1500px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Trip ID", "Booking Ref", "Customer", "Route", "Driver", "Vehicle", "Date", "Hire Amount", "Total Expenses", "Trip Summary", ...(!isFleetManager ? ["Invoice"] : []), "Documents"].map((col) => (
                  <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTrips.map((trip) => {
                const driver     = driverById.get(trip.driverId);
                const truck      = truckById.get(trip.vehicleId);
                const customer   = customerById.get(trip.customerId);
                const isInvoiced = (trip as any).isInvoiced === true;
                const hasSheet   = sheets.has(trip.id);
                const sheet      = sheets.get(trip.id);
                const hire       = sheet ? n(sheet.hireAmount)   : null;
                const expense    = sheet ? n(sheet.totalExpense)  : null;
                const pl         = hire !== null && expense !== null ? hire - expense : null;
                const isProfit   = pl !== null && pl >= 0;

                return (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{customer?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">
                      <span className="text-gray-800">{trip.origin}</span>
                      <span className="mx-1 text-gray-300">→</span>
                      <span className="text-gray-800">{trip.destination}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{driver?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{truck?.registrationNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(trip.scheduledDate)}</td>

                    {/* Hire Amount */}
                    <td className="px-4 py-3 font-medium text-blue-700">
                      {hire !== null ? `₹${hire.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Total Expenses */}
                    <td className="px-4 py-3 font-medium text-gray-700">
                      {expense !== null ? `₹${expense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : <span className="text-gray-300">—</span>}
                    </td>

                    {/* P&L */}
                    <td className="px-4 py-3">
                      {pl !== null ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          isProfit
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-600"
                        }`}>
                          {isProfit ? "▲" : "▼"}
                          ₹{Math.abs(pl).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          <span className="font-normal opacity-70">{isProfit ? "Profit" : "Loss"}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">No sheet</span>
                      )}
                    </td>

                    {!isFleetManager && (
                      <td className="px-4 py-3">
                        {trip.tripCategory === "SHIFTING" ? (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                            N/A (Shifting)
                          </span>
                        ) : isInvoiced ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Invoiced
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                            Not Invoiced
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {/* Booking Sheet — always available (hasClosure is required to appear here) */}
                        <button
                          type="button"
                          onClick={() => setBookingTrip(trip)}
                          className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Booking Sheet
                        </button>

                        {/* Trip Sheet — only if sheet exists */}
                        <button
                          type="button"
                          onClick={() => setSheetTrip(trip)}
                          disabled={!hasSheet}
                          className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={hasSheet ? undefined : "No trip sheet recorded for this trip"}
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          Trip Sheet
                        </button>

                        {/* Invoice — only if generated and role is not Fleet Manager */}
                        {isInvoiced && !isFleetManager && (
                          <button
                            type="button"
                            onClick={() => handleViewInvoice(trip)}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            View Invoice
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Booking Sheet — read-only */}
      <BookingSheetDialog
        open={bookingTrip !== null}
        trip={bookingTrip}
        closure={bookingTrip ? closures.get(bookingTrip.id) : undefined}
        driver={bookingTrip ? driverById.get(bookingTrip.driverId) : undefined}
        truck={bookingTrip ? truckById.get(bookingTrip.vehicleId) : undefined}
        customers={customers}
        readOnly
        onClose={() => setBookingTrip(null)}
        onSubmit={() => {}}
      />

      {/* Trip Sheet — read-only */}
      <TripSheetDialog
        open={sheetTrip !== null}
        trip={sheetTrip}
        closure={sheetTrip ? closures.get(sheetTrip.id) : undefined}
        existingSheet={sheetTrip ? sheets.get(sheetTrip.id) : undefined}
        readOnly
        drivers={drivers}
        trucks={trucks}
        onClose={() => setSheetTrip(null)}
        onSubmit={() => {}}
      />

      {/* Invoice Preview */}
      <InvoicePreviewDialog
        open={invoicePreview !== null}
        invoiceType={invoicePreview?.invoiceType ?? "Bill of Supply"}
        trip={invoicePreview?.trip ?? null}
        closure={invoicePreview?.closure ?? null}
        sheet={invoicePreview?.sheet}
        customer={invoicePreview?.customer}
        onClose={() => setInvoicePreview(null)}
      />
    </div>
  );
}
