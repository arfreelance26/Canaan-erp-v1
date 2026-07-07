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
import { confirmDelete, showSuccess, showError } from "@/lib/swal";

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
  const isAdmin = user?.softwareDesignation === "Admin";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function loadAll() {
    const [allTrips, d, tr, c] = await Promise.all([
      tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list(),
    ]);
    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);

    // History = every closed trip, plus cancelled trips (which may have no closure)
    const closedTrips = allTrips.filter(
      (t) => (t as any).hasClosure === true || t.status === "Cancelled"
    );
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
  useWebSocketEvent("trip_deleted", loadAll);

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

  const deletableIds = new Set(trips.filter((t) => (t as any).isInvoiced === true || t.status === "Cancelled").map((t) => t.id));

  function toggleRow(id: string) {
    if (!deletableIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0 || deleting) return;
    const res = await confirmDelete(`${selected.size} trip${selected.size > 1 ? "s" : ""} (including their booking sheets, trip sheets and invoices)`);
    if (!res.isConfirmed) return;
    setDeleting(true);
    const ids = [...selected];
    const failed: string[] = [];
    await Promise.all(
      ids.map((id) =>
        tripsApi.remove(id).catch(() => {
          failed.push(trips.find((t) => t.id === id)?.tripId ?? id);
        })
      )
    );
    setTrips((prev) => prev.filter((t) => !selected.has(t.id) || failed.length > 0 && failed.includes(t.tripId)));
    setSelected(new Set());
    setDeleting(false);
    if (failed.length === 0) {
      showSuccess(`${ids.length} trip${ids.length > 1 ? "s" : ""} deleted.`);
    } else {
      showError(`${ids.length - failed.length} deleted, ${failed.length} failed: ${failed.join(", ")}`);
      loadAll();
    }
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

      {isAdmin && selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-medium text-red-800">
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
              disabled={deleting}
              onClick={handleBulkDelete}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : `Delete ${selected.size} Trip${selected.size > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {filteredTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No closed trips found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1500px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {isAdmin && (
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        filteredTrips.some((t) => deletableIds.has(t.id)) &&
                        filteredTrips.filter((t) => deletableIds.has(t.id)).every((t) => selected.has(t.id))
                      }
                      onChange={() => {
                        const selectable = filteredTrips.filter((t) => deletableIds.has(t.id));
                        setSelected(
                          selectable.length > 0 && selectable.every((t) => selected.has(t.id))
                            ? new Set()
                            : new Set(selectable.map((t) => t.id))
                        );
                      }}
                      className="h-4 w-4 rounded border-gray-300 accent-red-600"
                      title="Select all deletable trips"
                    />
                  </th>
                )}
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
                  <tr key={trip.id} className={selected.has(trip.id) ? "bg-red-50/60" : "hover:bg-gray-50"}>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(trip.id)}
                          onChange={() => toggleRow(trip.id)}
                          disabled={!deletableIds.has(trip.id)}
                          title={deletableIds.has(trip.id) ? undefined : "Only invoiced or cancelled trips can be deleted"}
                          className="h-4 w-4 rounded border-gray-300 accent-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      <div className="flex items-center gap-2">
                        {trip.tripId}
                        {trip.status === "Cancelled" && (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                            Cancelled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{(customer?.name ?? trip.shipperConsignee) || "—"}</td>
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
                      ) : trip.status === "Cancelled" ? (
                        <span className="text-xs font-medium text-red-500">Trip cancelled</span>
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
                      {!closures.has(trip.id) && trip.status === "Cancelled" ? (
                        <span className="text-xs text-gray-400">No documents (cancelled)</span>
                      ) : (
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
                      )}
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
