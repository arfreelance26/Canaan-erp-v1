"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery, containerRef } from "@/lib/trip-search";
import { VerifyTripDialog } from "@/components/trips/VerifyTripDialog";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { GenerateInvoiceDialog, type InvoiceType, type InvoiceFormData } from "@/components/trips/GenerateInvoiceDialog";
import { InvoicePreviewDialog } from "@/components/trips/InvoicePreviewDialog";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { n, calcTripExpenses } from "@/types/trip-sheet";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search, CheckCircle2, Clock, FileText, AlertTriangle } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

type SheetDialogMode = "view" | "edit";

type PreviewState = {
  trip: Trip;
  closure: TripClosureData;
  sheet: TripSheetData | undefined;
  customer: Customer | undefined;
  invoiceType: InvoiceType;
  savedInvoice?: Partial<InvoiceFormData>;
  autoDownload?: boolean;
};

type InvoiceDialogState = { trip: Trip; savedInvoice: Partial<InvoiceFormData> | null };

type StatusFilter = "All" | "Pending" | "Verified" | "Invoiced" | "Rejected";

function StatusBadge({ status }: { status: "pending" | "verified" | "invoiced" | "rejected" }) {
  const map = {
    pending:  "bg-yellow-100 text-yellow-700",
    verified: "bg-emerald-100 text-emerald-700",
    invoiced: "bg-blue-100 text-blue-700",
    rejected: "bg-rose-100 text-rose-700",
  };
  const labels = { pending: "Pending", verified: "Verified", invoiced: "Invoiced", rejected: "Rejected" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function TripVerificationPage() {
  const [trips, setTrips]         = useState<Trip[]>([]);
  const [drivers, setDrivers]     = useState<Driver[]>([]);
  const [trucks, setTrucks]       = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [closures, setClosures]     = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets]         = useState<Map<string, TripSheetData>>(new Map());
  const [verifiedIds, setVerifiedIds]   = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds]   = useState<Set<string>>(new Set());
  const [invoicedIds, setInvoicedIds]   = useState<Set<string>>(new Set());
  const [invoiceData, setInvoiceData] = useState<Map<string, any>>(new Map());
  const [invoiceTypes, setInvoiceTypes] = useState<Map<string, InvoiceType>>(new Map());

  // Dialog state
  const [verifyTrip, setVerifyTrip]           = useState<Trip | null>(null);
  const [sheetTrip, setSheetTrip]             = useState<Trip | null>(null);
  const [sheetMode, setSheetMode]             = useState<SheetDialogMode>("view");
  const [bookingSheetTrip, setBookingSheetTrip] = useState<Trip | null>(null);
  const [bookingSheetReadOnly, setBookingSheetReadOnly] = useState(false);
  const [invoiceDialog, setInvoiceDialog]     = useState<InvoiceDialogState | null>(null);
  const [preview, setPreview]                 = useState<PreviewState | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  async function loadAll() {
    const [allTrips, d, tr, c] = await Promise.all([
      tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list(),
    ]);
    setDrivers(d); setTrucks(tr); setCustomers(c);

    // All trips with a sheet — covers verification + finalization in one list
    const sheettedTrips = allTrips.filter((t) => (t as any).hasSheet === true);
    setTrips(sheettedTrips);

    const verified  = new Set<string>(allTrips.filter((t) => (t as any).verificationStatus === "verified").map((t) => t.id));
    const rejected  = new Set<string>(allTrips.filter((t) => (t as any).verificationStatus === "rejected").map((t) => t.id));
    const invoiced  = new Set<string>(allTrips.filter((t) => (t as any).isInvoiced === true).map((t) => t.id));
    setVerifiedIds(verified); setRejectedIds(rejected); setInvoicedIds(invoiced);

    const invoicedTrips = allTrips.filter((t) => (t as any).isInvoiced === true);

    const [closureResults, sheetResults, invoiceResults] = await Promise.all([
      Promise.all(sheettedTrips.map((t) => tripsApi.getClosure(t.id).then((c) => ({ tripId: t.id, closure: c })).catch(() => null))),
      Promise.all(sheettedTrips.map((t) => tripsApi.getSheet(t.id).then((s) => ({ tripId: t.id, sheet: s })).catch(() => null))),
      Promise.all(invoicedTrips.map((t) => tripsApi.getInvoice(t.id).then((inv) => ({ tripId: t.id, inv })).catch(() => null))),
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

  useEffect(() => { loadAll().finally(() => setLoading(false)); }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 10000);
  useWebSocketEvent("trip_updated",    () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed",     () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_collected", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_entered",   () => setRefreshKey(k => k + 1));

  const driverById   = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById    = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  // ── Verification handlers ──────────────────────────────────────────────────
  function openBookingSheet(trip: Trip, readOnly: boolean) {
    setVerifyTrip(null); setBookingSheetTrip(trip); setBookingSheetReadOnly(readOnly);
  }

  async function handleBookingSheetSubmit(data: TripClosureData) {
    if (!bookingSheetTrip) return;
    try {
      const updated = await tripsApi.close(bookingSheetTrip.id, data);
      setClosures((prev) => new Map([...prev, [bookingSheetTrip.id, updated]]));
      setVerifyTrip(bookingSheetTrip); setBookingSheetTrip(null);
      showSuccess("Booking sheet saved.");
    } catch (err: unknown) { showError(err instanceof Error ? err.message : "Failed to save booking sheet."); }
  }

  function openSheetDialog(trip: Trip, mode: SheetDialogMode) {
    setVerifyTrip(null); setSheetTrip(trip); setSheetMode(mode);
  }

  async function handleSaveSheet(data: TripSheetData) {
    if (!sheetTrip) return;
    try {
      const saved = await tripsApi.upsertSheet(sheetTrip.id, data);
      setSheets((prev) => new Map([...prev, [sheetTrip.id, saved]]));
      setVerifyTrip(sheetTrip); setSheetTrip(null);
      showSuccess("Trip sheet saved.");
    } catch (err: unknown) { showError(err instanceof Error ? err.message : "Failed to save trip sheet."); }
  }

  async function handleConfirmVerification() {
    if (!verifyTrip) return;
    try {
      await tripsApi.verify(verifyTrip.id);
      setVerifiedIds((prev) => new Set([...prev, verifyTrip.id]));
      setRejectedIds((prev) => { const s = new Set(prev); s.delete(verifyTrip.id); return s; });
      setVerifyTrip(null);
      showSuccess("Trip verified successfully.");
    } catch (err: unknown) { showError(err instanceof Error ? err.message : "Failed to verify trip."); }
  }

  async function handleRejectVerification(reason: string) {
    if (!verifyTrip) return;
    try {
      await tripsApi.rejectVerification(verifyTrip.id, reason);
      setRejectedIds((prev) => new Set([...prev, verifyTrip.id]));
      setVerifiedIds((prev) => { const s = new Set(prev); s.delete(verifyTrip.id); return s; });
      setVerifyTrip(null);
      showSuccess("Trip sheet sent back to Docs team with rejection reason.");
    } catch (err: unknown) { showError(err instanceof Error ? err.message : "Failed to reject trip."); }
  }

  // ── Invoice handlers ───────────────────────────────────────────────────────
  async function handleInvoiceSubmit(data: InvoiceFormData, invoiceType: InvoiceType) {
    if (!invoiceDialog) return;
    const { trip } = invoiceDialog;
    try {
      await tripsApi.invoice(trip.id, {
        invoice_no: data.invoiceNo, invoice_date: data.invoiceDate || null,
        invoice_type: data.invoiceType, bill_to: data.billTo, gst_number: data.gstNumber,
        mode_of_shipment: data.modeOfShipment, container_type: data.containerType,
        cfs: data.cfs, shipping_line: data.shippingLine, vessel_name: data.vesselName,
        origin: data.from, destination: data.to, container_no: data.containerNo,
        consignee: data.consignee, services: data.services, bank_name: data.bankName,
        branch_name: data.branchName, account_number: data.accountNumber,
        ifsc_code: data.ifscCode, contact_person: data.contactPerson,
        email: data.email, contact: data.contact, narration: data.narration,
        gst_applicable: data.gstApplicable, igst_applicable: data.igstApplicable,
      });
      setInvoicedIds((prev) => new Set([...prev, trip.id]));
      const [savedClosure, savedInv] = await Promise.all([
        tripsApi.getClosure(trip.id).catch(() => null),
        tripsApi.getInvoice(trip.id).catch(() => null),
      ]);
      if (savedClosure) setClosures((prev) => new Map(prev).set(trip.id, savedClosure));
      if (savedInv) setInvoiceData((prev) => new Map(prev).set(trip.id, savedInv));
      setInvoiceTypes((prev) => new Map(prev).set(trip.id, invoiceType));
      setInvoiceDialog(null);
      if (savedClosure) {
        setPreview({ trip, closure: savedClosure, sheet: sheets.get(trip.id), customer: customerById.get(trip.customerId), invoiceType, savedInvoice: data });
      }
      showSuccess("Invoice generated successfully.");
    } catch (err: unknown) { showError(err instanceof Error ? err.message : "Failed to generate invoice."); }
  }

  function rawToSavedInvoice(raw: Record<string, unknown>): Partial<InvoiceFormData> {
    const s = (v: unknown) => (v != null ? String(v) : "");
    const yn = (v: unknown): "Yes" | "No" => (String(v) === "Yes" ? "Yes" : "No");
    return {
      invoiceNo: s(raw.invoice_no), invoiceDate: s(raw.invoice_date),
      invoiceType: (raw.invoice_type as InvoiceType | undefined) ?? "Bill of Supply",
      billTo: s(raw.bill_to), gstNumber: s(raw.gst_number),
      modeOfShipment: s(raw.mode_of_shipment), containerType: s(raw.container_type),
      cfs: s(raw.cfs), shippingLine: s(raw.shipping_line), vesselName: s(raw.vessel_name),
      from: s(raw.origin), to: s(raw.destination), containerNo: s(raw.container_no),
      consignee: s(raw.consignee),
      services: Array.isArray(raw.services) && (raw.services as unknown[]).length > 0
        ? raw.services as InvoiceFormData["services"]
        : [{ descriptionOfService: "", sacCode: "", sacId: "", gstRate: "", quantity: "", rate: "" }],
      bankName: s(raw.bank_name), branchName: s(raw.branch_name),
      accountNumber: s(raw.account_number), ifscCode: s(raw.ifsc_code),
      contactPerson: s(raw.contact_person), email: s(raw.email),
      contact: s(raw.contact), narration: s(raw.narration),
      gstApplicable: yn(raw.gst_applicable), igstApplicable: yn(raw.igst_applicable),
    };
  }

  async function handleEditInvoice(trip: Trip) {
    const raw = await tripsApi.getInvoice(trip.id).catch(() => null);
    if (!raw) return;
    setInvoiceDialog({ trip, savedInvoice: rawToSavedInvoice(raw as Record<string, unknown>) });
  }

  async function openPreview(trip: Trip, autoDownload = false) {
    const closure = closures.get(trip.id);
    if (!closure) return;
    let savedInvoice: Partial<InvoiceFormData> | undefined;
    const raw = await tripsApi.getInvoice(trip.id).catch(() => null);
    if (raw) { savedInvoice = rawToSavedInvoice(raw as Record<string, unknown>); }
    setPreview({
      trip, closure, sheet: sheets.get(trip.id),
      customer: customerById.get(trip.customerId),
      invoiceType: savedInvoice?.invoiceType ?? invoiceTypes.get(trip.id) ?? "Bill of Supply",
      savedInvoice, autoDownload,
    });
  }

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={10} />;

  const allFiltered = trips.filter((t) => tripMatchesSearch(t, searchQuery, trucks, drivers));

  // Counts for filter cards
  const pendingCount  = allFiltered.filter((t) => !verifiedIds.has(t.id) && !rejectedIds.has(t.id) && !invoicedIds.has(t.id)).length;
  const rejectedCount = allFiltered.filter((t) => rejectedIds.has(t.id)).length;
  const verifiedCount = allFiltered.filter((t) => verifiedIds.has(t.id) && !invoicedIds.has(t.id)).length;
  const invoicedCount = allFiltered.filter((t) => invoicedIds.has(t.id)).length;

  const filteredTrips = allFiltered
    .filter((t) => {
      if (statusFilter === "Pending")  return !verifiedIds.has(t.id) && !rejectedIds.has(t.id) && !invoicedIds.has(t.id);
      if (statusFilter === "Rejected") return rejectedIds.has(t.id);
      if (statusFilter === "Verified") return verifiedIds.has(t.id) && !invoicedIds.has(t.id);
      if (statusFilter === "Invoiced") return invoicedIds.has(t.id);
      return true;
    })
    .sort((a, b) => {
      const order = (t: Trip) => invoicedIds.has(t.id) ? 4 : verifiedIds.has(t.id) ? 1 : rejectedIds.has(t.id) ? 2 : 0;
      return order(a) - order(b);
    });

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginatedTrips = filteredTrips.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const FILTER_CARDS: { key: StatusFilter; label: string; count: number; color: string }[] = [
    { key: "All",      label: "All Trips",  count: allFiltered.length,  color: "border-gray-200 bg-white text-gray-900" },
    { key: "Pending",  label: "Pending",    count: pendingCount,         color: "border-yellow-200 bg-yellow-50 text-yellow-700" },
    { key: "Rejected", label: "Rejected",   count: rejectedCount,        color: "border-rose-200 bg-rose-50 text-rose-700" },
    { key: "Verified", label: "Verified",   count: verifiedCount,        color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { key: "Invoiced", label: "Invoiced",   count: invoicedCount,        color: "border-blue-200 bg-blue-50 text-blue-700" },
  ];

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verification & Invoicing</h1>
          <p className="mt-1 text-sm text-gray-500">Verify trip data and generate invoices in one place</p>
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

      {/* Filter cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FILTER_CARDS.map(({ key, label, count, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setStatusFilter(key); setPage(1); }}
            className={`rounded-xl border px-4 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${color} ${statusFilter === key ? "ring-2 ring-blue-500 shadow-md" : "hover:shadow-sm"}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
            <p className="mt-1 text-2xl font-bold">{count}</p>
          </button>
        ))}
      </div>

      {/* Workflow steps legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
        <span className="font-semibold text-gray-600">Workflow:</span>
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-yellow-500" /> Pending → verify trip data</span>
        <span className="text-gray-300">›</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Verified → generate invoice</span>
        <span className="text-gray-300">›</span>
        <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-blue-500" /> Invoiced</span>
      </div>

      {filteredTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {allFiltered.length === 0
            ? <>No trips ready. Add a trip sheet on the{" "}<a href="/trips/reconciliation" className="text-blue-600 underline">Reconciliation</a> page first.</>
            : "No trips match this filter."}
        </div>
      ) : (
        <>
          <div className="overflow-auto max-h-[75vh] rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Status", "Actions", "Vehicle", "Driver", "Container No", "From → To", "Trip ID", "Booking Ref",
                    "Hire Amt", "Expense", "Invoice No"].map((col) => (
                    <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedTrips.map((trip) => {
                  const closure    = closures.get(trip.id);
                  const sheet      = sheets.get(trip.id);
                  const driver     = driverById.get(trip.driverId);
                  const truck      = truckById.get(trip.vehicleId);
                  const isVerified  = verifiedIds.has(trip.id);
                  const isRejected  = rejectedIds.has(trip.id);
                  const isInvoiced  = invoicedIds.has(trip.id);
                  const inv         = invoiceData.get(trip.id);

                  const hireAmt    = sheet ? n(sheet.hireAmount) : 0;
                  const expenseAmt = sheet ? calcTripExpenses(sheet) : 0;
                  const invNo      = inv?.invoice_no ?? "—";
                  const invType    = (inv?.invoice_type ?? invoiceTypes.get(trip.id) ?? "") as string;
                  const invTypeBadge = invType === "Bill of Supply" ? "bg-emerald-100 text-emerald-700"
                    : invType === "Transport Memo" ? "bg-orange-100 text-orange-700"
                    : invType === "Tax Invoice" ? "bg-blue-100 text-blue-700" : "";

                  const tripStatus = isInvoiced ? "invoiced" : isVerified ? "verified" : isRejected ? "rejected" : "pending";

                  return (
                    <tr
                      key={trip.id}
                      className={`hover:bg-gray-50 ${isRejected ? "bg-rose-50/40" : isInvoiced ? "bg-blue-50/20" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <StatusBadge status={tripStatus} />
                      </td>
                      <td className="px-4 py-3">
                        {isInvoiced ? (
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => handleEditInvoice(trip)}
                              className="flex items-center gap-1 rounded-lg border border-orange-300 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-50">
                              Edit Invoice
                            </button>
                            <button type="button" onClick={() => openPreview(trip, false)} disabled={!closure}
                              className="flex items-center gap-1 rounded-lg border border-indigo-300 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
                              Preview
                            </button>
                            <button type="button" onClick={() => openPreview(trip, true)} disabled={!closure}
                              className="flex items-center gap-1 rounded-lg border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                              Download PDF
                            </button>
                          </div>
                        ) : isVerified ? (
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => setInvoiceDialog({ trip, savedInvoice: null })}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                            >
                              GENERATE INVOICE
                            </button>
                            <button type="button" onClick={() => setVerifyTrip(trip)}
                              className="w-fit rounded-lg border border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                              View Details
                            </button>
                          </div>
                        ) : isRejected ? (
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-1 text-xs text-rose-600 font-semibold">
                              <AlertTriangle className="h-3 w-3" /> Rejected by Accounts
                            </span>
                            {trip.verificationRejectionReason && (
                              <p className="text-[11px] text-gray-500 max-w-[160px] whitespace-normal leading-snug">
                                {trip.verificationRejectionReason}
                              </p>
                            )}
                            <button type="button" onClick={() => setVerifyTrip(trip)}
                              className="w-fit rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                              Review
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
                      <td className="px-4 py-3 font-medium text-gray-800">{trip.truckRegistration ?? truck?.registrationNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <span>{trip.driverName ?? driver?.name ?? "—"}</span>
                        {trip.driverChangeRemark && (
                          <p className="mt-0.5 text-[11px] text-amber-600 leading-snug max-w-[120px] whitespace-normal">
                            {trip.driverChangeRemark}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{containerRef(trip)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {trip.origin} <span className="text-gray-400">→</span> {trip.destination}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{trip.tripId}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{trip.bookingReferenceNo}</td>
                      <td className="px-4 py-3 font-medium text-blue-700">{fmt(hireAmt)}</td>
                      <td className="px-4 py-3 font-medium text-gray-600">{fmt(expenseAmt)}</td>
                      <td className="px-4 py-3">
                        {isInvoiced ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-gray-900">{invNo}</span>
                            {invType && (
                              <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${invTypeBadge}`}>
                                {invType}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm text-gray-500">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredTrips.length)} of {filteredTrips.length} trips
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                  .reduce<(number | "...")[]>((acc, n, i, arr) => { if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("..."); acc.push(n); return acc; }, [])
                  .map((item, i) => item === "..." ? (
                    <span key={`e${i}`} className="px-2 text-xs text-gray-400">…</span>
                  ) : (
                    <button key={item} type="button" onClick={() => setPage(item as number)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${safePage === item ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {item}
                    </button>
                  ))}
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Dialogs ── */}
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
        onConfirm={handleConfirmVerification}
        onReject={handleRejectVerification}
      />

      <BookingSheetDialog
        open={bookingSheetTrip !== null}
        trip={bookingSheetTrip}
        closure={bookingSheetTrip ? closures.get(bookingSheetTrip.id) : undefined}
        driver={bookingSheetTrip ? driverById.get(bookingSheetTrip.driverId) : undefined}
        truck={bookingSheetTrip ? truckById.get(bookingSheetTrip.vehicleId) : undefined}
        drivers={drivers} trucks={trucks} customers={customers}
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
        drivers={drivers} trucks={trucks}
        onClose={() => { setVerifyTrip(sheetTrip); setSheetTrip(null); }}
        onSubmit={handleSaveSheet}
      />

      <GenerateInvoiceDialog
        key={invoiceDialog ? `${invoiceDialog.trip.id}-${invoiceDialog.savedInvoice ? "edit" : "new"}` : "closed"}
        open={invoiceDialog !== null}
        trip={invoiceDialog?.trip ?? null}
        closure={invoiceDialog ? closures.get(invoiceDialog.trip.id) : undefined}
        sheet={invoiceDialog ? sheets.get(invoiceDialog.trip.id) : undefined}
        driver={invoiceDialog ? driverById.get(invoiceDialog.trip.driverId) : undefined}
        truck={invoiceDialog ? truckById.get(invoiceDialog.trip.vehicleId) : undefined}
        customer={invoiceDialog ? customerById.get(invoiceDialog.trip.customerId) : undefined}
        savedInvoice={invoiceDialog?.savedInvoice ?? undefined}
        onClose={() => setInvoiceDialog(null)}
        onSubmit={handleInvoiceSubmit}
      />

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
