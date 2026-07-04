"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { n } from "@/types/trip-sheet";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { GenerateInvoiceDialog, type InvoiceType, type InvoiceFormData } from "@/components/trips/GenerateInvoiceDialog";
import { InvoicePreviewDialog } from "@/components/trips/InvoicePreviewDialog";

type PreviewState = {
  trip: Trip;
  closure: TripClosureData;
  sheet: TripSheetData | undefined;
  customer: Customer | undefined;
  invoiceType: InvoiceType;
  savedInvoice?: any;
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
  const [invoiceData, setInvoiceData] = useState<Map<string, any>>(new Map());
  // Tracks invoice type used per trip (for preview / download after generation)
  const [invoiceTypes, setInvoiceTypes] = useState<Map<string, InvoiceType>>(new Map());

  type DialogState = { trip: Trip; savedInvoice: Partial<InvoiceFormData> | null };
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  async function loadAll() {
    const [allTrips, d, tr, c] = await Promise.all([
      tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list(),
    ]);

    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);

    const sheettedTrips = allTrips.filter((t) => (t as any).hasSheet === true && t.tripCategory !== "SHIFTING");
    setTrips(sheettedTrips);

    const invoicedTrips = allTrips.filter((t) => (t as any).isInvoiced === true);
    const invoiced = new Set<string>(invoicedTrips.map((t) => t.id));
    setInvoicedIds(invoiced);

    const [closureResults, sheetResults, invoiceResults] = await Promise.all([
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
      Promise.all(
        invoicedTrips.map((trip) =>
          tripsApi.getInvoice(trip.id).then((inv) => ({ tripId: trip.id, inv })).catch(() => null)
        )
      ),
    ]);

    const closureMap = new Map<string, TripClosureData>();
    for (const r of closureResults) if (r) closureMap.set(r.tripId, r.closure);
    setClosures(closureMap);

    const sheetMap = new Map<string, TripSheetData>();
    for (const r of sheetResults) if (r && r.sheet) sheetMap.set(r.tripId, r.sheet);
    setSheets(sheetMap);

    const invMap = new Map<string, any>();
    for (const r of invoiceResults) if (r) invMap.set(r.tripId, r.inv);
    setInvoiceData(invMap);
  }

  useEffect(() => { loadAll().finally(() => setLoading(false)); }, []);
  useAutoRefresh(() => { loadAll(); }, 5000);

  const driverById   = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById    = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  async function handleDialogSubmit(data: InvoiceFormData, invoiceType: InvoiceType) {
    if (!dialogState) return;
    const { trip } = dialogState;

    try {
    await tripsApi.invoice(trip.id, {
      invoice_no: data.invoiceNo,
      invoice_date: data.invoiceDate || null,
      invoice_type: data.invoiceType,
      bill_to: data.billTo,
      gst_number: data.gstNumber,
      mode_of_shipment: data.modeOfShipment,
      container_type: data.containerType,
      cfs: data.cfs,
      shipping_line: data.shippingLine,
      vessel_name: data.vesselName,
      origin: data.from,
      destination: data.to,
      container_no: data.containerNo,
      consignee: data.consignee,
      services: data.services,
      bank_name: data.bankName,
      branch_name: data.branchName,
      account_number: data.accountNumber,
      ifsc_code: data.ifscCode,
      contact_person: data.contactPerson,
      email: data.email,
      contact: data.contact,
      narration: data.narration,
      gst_applicable: data.gstApplicable,
      igst_applicable: data.igstApplicable,
    });
    setInvoicedIds((prev) => new Set([...prev, trip.id]));

    const [savedClosure, savedInv] = await Promise.all([
      tripsApi.getClosure(trip.id).catch(() => null),
      tripsApi.getInvoice(trip.id).catch(() => null),
    ]);
    if (savedClosure) setClosures((prev) => new Map(prev).set(trip.id, savedClosure));
    if (savedInv) setInvoiceData((prev) => new Map(prev).set(trip.id, savedInv));

    setInvoiceTypes((prev) => new Map(prev).set(trip.id, invoiceType));
    setDialogState(null);

    if (savedClosure) {
      setPreview({
        trip,
        closure: savedClosure,
        sheet: sheets.get(trip.id),
        customer: customerById.get(trip.customerId),
        invoiceType,
        savedInvoice: data,
      });
    }
    showSuccess("Invoice generated successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to generate invoice.");
    }
  }

  async function handleEditInvoice(trip: Trip) {
    const raw = await tripsApi.getInvoice(trip.id).catch(() => null);
    if (!raw) return;
    const savedInvoice: Partial<InvoiceFormData> = {
      invoiceNo:      (raw.invoice_no as string)        ?? "",
      invoiceDate:    (raw.invoice_date as string)       ?? "",
      invoiceType:    (raw.invoice_type as InvoiceType)  ?? "Bill of Supply",
      billTo:         (raw.bill_to as string)            ?? "",
      gstNumber:      (raw.gst_number as string)         ?? "",
      modeOfShipment: (raw.mode_of_shipment as string)   ?? "",
      containerType:  (raw.container_type as string)     ?? "",
      cfs:            (raw.cfs as string)                ?? "",
      shippingLine:   (raw.shipping_line as string)      ?? "",
      vesselName:     (raw.vessel_name as string)        ?? "",
      from:           (raw.origin as string)             ?? "",
      to:             (raw.destination as string)        ?? "",
      containerNo:    (raw.container_no as string)       ?? "",
      consignee:      (raw.consignee as string)          ?? "",
      services: Array.isArray(raw.services) && raw.services.length > 0
        ? raw.services as InvoiceFormData["services"]
        : [{ descriptionOfService: "", sacCode: "", gstRate: "", quantity: "", rate: "" }],
      bankName:       (raw.bank_name as string)          ?? "",
      branchName:     (raw.branch_name as string)        ?? "",
      accountNumber:  (raw.account_number as string)     ?? "",
      ifscCode:       (raw.ifsc_code as string)          ?? "",
      contactPerson:  (raw.contact_person as string)     ?? "",
      email:          (raw.email as string)              ?? "",
      contact:        (raw.contact as string)            ?? "",
      narration:      (raw.narration as string)          ?? "",
      gstApplicable:  (raw.gst_applicable as "Yes" | "No")  ?? "No",
      igstApplicable: (raw.igst_applicable as "Yes" | "No") ?? "No",
    };
    setDialogState({ trip, savedInvoice });  // single atomic update — no race
  }

  async function openPreview(trip: Trip, autoDownload = false) {
    const closure  = closures.get(trip.id);
    if (!closure) return;
    
    let savedInvoice: Partial<InvoiceFormData> | undefined;
    const raw = await tripsApi.getInvoice(trip.id).catch(() => null);
    if (raw) {
      savedInvoice = {
        invoiceNo:      (raw.invoice_no as string)        ?? "",
        invoiceDate:    (raw.invoice_date as string)       ?? "",
        invoiceType:    (raw.invoice_type as InvoiceType)  ?? "Bill of Supply",
        billTo:         (raw.bill_to as string)            ?? "",
        gstNumber:      (raw.gst_number as string)         ?? "",
        modeOfShipment: (raw.mode_of_shipment as string)   ?? "",
        containerType:  (raw.container_type as string)     ?? "",
        cfs:            (raw.cfs as string)                ?? "",
        shippingLine:   (raw.shipping_line as string)      ?? "",
        vesselName:     (raw.vessel_name as string)        ?? "",
        from:           (raw.origin as string)             ?? "",
        to:             (raw.destination as string)        ?? "",
        containerNo:    (raw.container_no as string)       ?? "",
        consignee:      (raw.consignee as string)          ?? "",
        services: Array.isArray(raw.services) && raw.services.length > 0
          ? raw.services as InvoiceFormData["services"]
          : [{ descriptionOfService: "", sacCode: "", gstRate: "", quantity: "", rate: "" }],
        bankName:       (raw.bank_name as string)          ?? "",
        branchName:     (raw.branch_name as string)        ?? "",
        accountNumber:  (raw.account_number as string)     ?? "",
        ifscCode:       (raw.ifsc_code as string)          ?? "",
        contactPerson:  (raw.contact_person as string)     ?? "",
        email:          (raw.email as string)              ?? "",
        contact:        (raw.contact as string)            ?? "",
        narration:      (raw.narration as string)          ?? "",
        gstApplicable:  (raw.gst_applicable as any)        ?? "No",
        igstApplicable: (raw.igst_applicable as any)       ?? "No",
      };
    }

    setPreview({
      trip,
      closure,
      sheet:        sheets.get(trip.id),
      customer:     customerById.get(trip.customerId),
      invoiceType:  savedInvoice?.invoiceType ?? invoiceTypes.get(trip.id) ?? "Bill of Supply",
      savedInvoice,
      autoDownload,
    });
  }

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={10} />;

  const filteredTrips = trips.filter((t) => !searchQuery || t.tripId?.toLowerCase().includes(searchQuery.toLowerCase()) || t.bookingReferenceNo?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Finalization</h1>
          <p className="mt-1 text-sm text-gray-500">
            Generate invoices for trips to complete the trip workflow
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
          No trips with a sheet yet. Add a trip sheet on the{" "}
          <a href="/trips/reconciliation" className="text-blue-600 underline">Trip Reconciliation</a> page first.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Trip ID", "Booking Ref", "Customer", "Route", "Driver", "Vehicle",
                  "Bill To", "Invoice No / Date", "Invoice Type", "Invoice Amount", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTrips.map((trip) => {
                const closure    = closures.get(trip.id);
                const sheet      = sheets.get(trip.id);
                const driver     = driverById.get(trip.driverId);
                const truck      = truckById.get(trip.vehicleId);
                const customer   = customerById.get(trip.customerId);
                const isInvoiced = invoicedIds.has(trip.id);
                const inv        = invoiceData.get(trip.id);

                // Invoice amount: sum of GST-inclusive service line totals
                const invoiceTotal = inv?.services?.length
                  ? (inv.services as any[]).reduce((sum: number, s: any) => {
                      const base = (parseFloat(s.quantity) || 0) * (parseFloat(s.rate) || 0);
                      const gst  = parseFloat((base * ((parseFloat(s.gstRate) || 0) / 100)).toFixed(2));
                      return sum + base + gst;
                    }, 0)
                  : sheet ? n(sheet.hireAmount) : 0;

                const invNo   = inv?.invoice_no ?? "—";
                const invDate = inv?.invoice_date
                  ? inv.invoice_date.slice(0, 10).split("-").reverse().join("-")
                  : "—";
                const invType = (inv?.invoice_type ?? invoiceTypes.get(trip.id) ?? "—") as string;

                const invTypeBadgeClass =
                  invType === "Bill of Supply"
                    ? "bg-emerald-100 text-emerald-700"
                    : invType === "Transport Memo"
                    ? "bg-orange-100 text-orange-700"
                    : invType === "Tax Invoice"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500";

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
                    <td className="px-4 py-3">
                      {isInvoiced ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-gray-900 text-xs">{invNo}</span>
                          <span className="text-xs text-gray-400">{invDate}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {invType !== "—" ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${invTypeBadgeClass}`}>
                          {invType}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-700">{fmt(invoiceTotal)}</td>
                    <td className="px-4 py-3">
                      {isInvoiced ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Invoice Generated
                          </span>
                          <div className="flex gap-1.5">
                            {/* Edit Invoice button */}
                            <button
                              type="button"
                              onClick={() => handleEditInvoice(trip)}
                              className="flex items-center gap-1 rounded-lg border border-orange-300 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                            >
                              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                              </svg>
                              Edit Invoice
                            </button>

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
                          onClick={() => setDialogState({ trip, savedInvoice: null })}
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

      <GenerateInvoiceDialog
        key={dialogState ? `${dialogState.trip.id}-${dialogState.savedInvoice ? "edit" : "new"}` : "closed"}
        open={dialogState !== null}
        trip={dialogState?.trip ?? null}
        closure={dialogState ? closures.get(dialogState.trip.id) : undefined}
        sheet={dialogState ? sheets.get(dialogState.trip.id) : undefined}
        driver={dialogState ? driverById.get(dialogState.trip.driverId) : undefined}
        truck={dialogState ? truckById.get(dialogState.trip.vehicleId) : undefined}
        customer={dialogState ? customerById.get(dialogState.trip.customerId) : undefined}
        savedInvoice={dialogState?.savedInvoice ?? undefined}
        onClose={() => setDialogState(null)}
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
        savedInvoice={preview?.savedInvoice}
        autoDownload={preview?.autoDownload}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
