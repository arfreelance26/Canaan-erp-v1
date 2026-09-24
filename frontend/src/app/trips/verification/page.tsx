"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { tripsApi, driversApi, trucksApi, customersApi, editApprovalsApi, deletionApprovalsApi } from "@/lib/api";
import { mapLimit } from "@/lib/async-pool";
import { tripMatchesSearch, useGlobalSearchQuery, containerRef } from "@/lib/trip-search";
import { useAuth } from "@/context/AuthContext";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import type { EditApprovalRequest } from "@/types/edit-approval";
import { VerifyTripDialog } from "@/components/trips/VerifyTripDialog";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { GenerateInvoiceDialog, type InvoiceType, type InvoiceFormData } from "@/components/trips/GenerateInvoiceDialog";
import { InvoicePreviewDialog } from "@/components/trips/InvoicePreviewDialog";
import { GenerateCombinedInvoiceDialog } from "@/components/trips/GenerateCombinedInvoiceDialog";
import { CombinedInvoicePreviewDialog } from "@/components/trips/CombinedInvoicePreviewDialog";
import { LRConsignmentDialog } from "@/components/trips/LRConsignmentDialog";
import { DABDialog } from "@/components/trips/DABDialog";
import { CABDialog } from "@/components/trips/CABDialog";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { n, calcTripExpenses } from "@/types/trip-sheet";
import { stageRowClass, type StageColor } from "@/lib/stage-colors";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { CheckCircle2, Clock, FileText, AlertTriangle, Download, Eye, X, Trash2, Layers } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { todayIst } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";
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

type StatusFilter = "All" | "Pending" | "Verified" | "Invoiced" | "Rejected" | "Waived Invoice";

function StatusBadge({ status }: { status: "pending" | "verified" | "invoiced" | "rejected" | "waived" }) {
  const map = {
    pending:  "bg-yellow-100 text-yellow-700",
    verified: "bg-emerald-100 text-emerald-700",
    invoiced: "bg-blue-100 text-blue-700",
    rejected: "bg-rose-100 text-rose-700",
    waived:   "bg-purple-100 text-purple-700",
  };
  const labels = { pending: "Pending", verified: "Verified", invoiced: "Invoiced", rejected: "Rejected", waived: "Waived Invoice" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function TripVerificationPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

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
  const [waivedIds, setWaivedIds]       = useState<Set<string>>(new Set());

  // Dialog state
  const [verifyTrip, setVerifyTrip]           = useState<Trip | null>(null);
  const [verifyTripReadOnly, setVerifyTripReadOnly] = useState(false);
  const [sheetTrip, setSheetTrip]             = useState<Trip | null>(null);
  const [sheetMode, setSheetMode]             = useState<SheetDialogMode>("view");
  const [bookingSheetTrip, setBookingSheetTrip] = useState<Trip | null>(null);
  const [bookingSheetReadOnly, setBookingSheetReadOnly] = useState(false);
  const [invoiceDialog, setInvoiceDialog]     = useState<InvoiceDialogState | null>(null);
  const [preview, setPreview]                 = useState<PreviewState | null>(null);
  const [lrDialogTrip, setLrDialogTrip]       = useState<Trip | null>(null);
  const [dabDialogTrip, setDabDialogTrip]     = useState<Trip | null>(null);
  const [cabDialogTrip, setCabDialogTrip]     = useState<Trip | null>(null);

  // Combined invoicing — select several Verified, not-yet-invoiced trips for the
  // same customer and raise one invoice covering all of them.
  const [combineSelection, setCombineSelection] = useState<Set<string>>(new Set());
  const [combineDialog, setCombineDialog] = useState<{ mode: "create" | "edit"; trips: Trip[] } | null>(null);
  const [combinePreview, setCombinePreview] = useState<{ trips: Trip[]; autoDownload?: boolean } | null>(null);

  // Editing an already-Invoiced trip's invoice is Admin-only by default. Anyone else
  // (Accounts) must send an Edit Request to Admin first — approving it grants the same
  // 8-hour window used everywhere else in the app (see routers/edit_approvals.py).
  const [activeApprovals, setActiveApprovals] = useState<EditApprovalRequest[]>([]);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingEditInvoiceTrip, setPendingEditInvoiceTrip] = useState<Trip | null>(null);
  const [deleteRequestTrip, setDeleteRequestTrip] = useState<Trip | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<"All" | "Tax Invoice" | "Bill of Supply" | "Transport Memo">("All");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [dateFrom, setDateFrom] = useState(todayIst());
  const [dateTo, setDateTo] = useState(todayIst());
  const [downloading, setDownloading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [modalStatusFilter, setModalStatusFilter] = useState<"All" | "Pending" | "Rejected" | "Verified" | "Invoiced" | "Waived Invoice">("All");

  // Trip ids whose closure/sheet/invoice have already been fetched — so paging
  // back doesn't refetch. Reset when the trip list reloads.
  const fetchedDetailIds = useRef<Set<string>>(new Set());

  async function loadAll() {
    // Only the trip list + reference data + status flags load here (a few
    // requests). Closures, sheets and invoices are fetched lazily per visible
    // page — see the effect below — so this page no longer fires a request per
    // trip on load, which was exhausting the DB connection pool.
    //
    // allSettled, not all — a single failed source (e.g. right after relogin)
    // must not blank the whole table; each keeps its last-known-good state
    // and a toast names what didn't refresh.
    const [allTrips, d, tr, c] = await Promise.allSettled([
      tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list(),
    ]);
    const failed: string[] = [];
    if (d.status === "fulfilled") setDrivers(d.value); else failed.push("Drivers");
    if (tr.status === "fulfilled") setTrucks(tr.value); else failed.push("Trucks");
    if (c.status === "fulfilled") setCustomers(c.value); else failed.push("Customers");

    if (allTrips.status === "fulfilled") {
      // All trips with a sheet — covers verification + finalization in one list
      const sheettedTrips = allTrips.value.filter((t) => (t as any).hasSheet === true);
      setTrips(sheettedTrips);

      const verified  = new Set<string>(allTrips.value.filter((t) => (t as any).verificationStatus === "verified").map((t) => t.id));
      const rejected  = new Set<string>(allTrips.value.filter((t) => (t as any).verificationStatus === "rejected").map((t) => t.id));
      const invoiced  = new Set<string>(allTrips.value.filter((t) => (t as any).isInvoiced === true).map((t) => t.id));
      const waived    = new Set<string>(allTrips.value.filter((t) => (t as any).invoiceWaived === true).map((t) => t.id));
      setVerifiedIds(verified); setRejectedIds(rejected); setInvoicedIds(invoiced); setWaivedIds(waived);
      fetchedDetailIds.current = new Set();
    } else {
      failed.push("Trips");
    }

    if (failed.length > 0) {
      showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
    }
  }

  useEffect(() => { loadAll().catch(() => {}).finally(() => setLoading(false)); }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 10000);
  useWebSocketEvent("trip_updated",    () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed",     () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_collected", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_entered",   () => setRefreshKey(k => k + 1));

  useEffect(() => {
    if (isAdmin) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  }, [isAdmin]);
  useWebSocketEvent("edit_approval_updated", () => {
    if (isAdmin) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  });

  function hasActiveEditInvoiceApproval(tripId: string): boolean {
    return activeApprovals.some((a) =>
      a.resourceType === "Trip" &&
      String(a.resourceId) === tripId &&
      a.action === "Edit" &&
      a.expiresAt != null &&
      new Date(a.expiresAt.endsWith("Z") ? a.expiresAt : a.expiresAt + "Z") > new Date()
    );
  }

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
      const updated = await tripsApi.verify(verifyTrip.id);
      setVerifiedIds((prev) => new Set([...prev, verifyTrip.id]));
      setRejectedIds((prev) => { const s = new Set(prev); s.delete(verifyTrip.id); return s; });
      // SHIFTING trips and "To Be Paid" trips are auto-waived by the backend on
      // verify (neither is ever invoiced to a customer) — reflect that immediately
      // instead of waiting for the next refresh.
      if (updated.invoiceWaived) {
        setWaivedIds((prev) => new Set([...prev, verifyTrip.id]));
      }
      setVerifyTrip(null);
      showSuccess(
        updated.invoiceWaived
          ? "Trip verified — this trip isn't invoiced, so it was automatically marked Waived Invoice."
          : "Trip verified successfully."
      );
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

  async function handleWaiveInvoice(trip: Trip) {
    try {
      await tripsApi.waiveInvoice(trip.id);
      setWaivedIds((prev) => new Set([...prev, trip.id]));
      showSuccess("Invoice waived. Trip marked as complete without invoicing.");
    } catch (err: unknown) { showError(err instanceof Error ? err.message : "Failed to waive invoice."); }
  }

  async function handleDeleteSubmit(trip: Trip, reason: string) {
    try {
      if (isAdmin) {
        await tripsApi.remove(trip.id, reason);
        setTrips((prev) => prev.filter((t) => t.id !== trip.id));
        showSuccess(`Trip ${trip.tripId} deleted.`);
      } else {
        await deletionApprovalsApi.create({
          resourceType: "Trip",
          resourceId: parseInt(trip.id),
          resourceName: trip.bookingReferenceNo || trip.tripId,
          reason,
        });
        showSuccess("Delete request sent to Admin — you'll see it approved or rejected on the Deletion Approvals page.");
      }
      setDeleteRequestTrip(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete trip.");
    }
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

  // Fetches (and caches into closures/sheets/invoiceData) closure + sheet + latest
  // invoice for a set of trip ids that may belong to a combined-invoice group —
  // siblings can live on a different page than the one currently visible, so the
  // normal per-page lazy loader (below) can't be relied on to have them yet.
  async function fetchGroupDetails(ids: string[]) {
    const results = await mapLimit(ids, 8, async (id) => {
      const [cl, sh, inv] = await Promise.all([
        closures.has(id) ? Promise.resolve(closures.get(id) ?? null) : tripsApi.getClosure(id).catch(() => null),
        sheets.has(id) ? Promise.resolve(sheets.get(id) ?? null) : tripsApi.getSheet(id).catch(() => null),
        tripsApi.getInvoice(id).catch(() => null),
      ]);
      return { id, cl, sh, inv };
    });
    setClosures((prev) => { const next = new Map(prev); for (const r of results) if (r.cl) next.set(r.id, r.cl); return next; });
    setSheets((prev) => { const next = new Map(prev); for (const r of results) if (r.sh) next.set(r.id, r.sh); return next; });
    setInvoiceData((prev) => { const next = new Map(prev); for (const r of results) if (r.inv) next.set(r.id, r.inv); return next; });
  }

  async function handleEditInvoice(trip: Trip) {
    if (!isAdmin && !hasActiveEditInvoiceApproval(trip.id)) {
      setPendingEditInvoiceTrip(trip);
      setEditRequestOpen(true);
      return;
    }
    const raw = await tripsApi.getInvoice(trip.id).catch(() => null);
    if (!raw) return;
    const invNo = String((raw as Record<string, unknown>).invoice_no ?? "");
    const groupIds = invNo ? await tripsApi.getInvoiceGroup(invNo).catch(() => []) : [];
    if (groupIds.length > 1) {
      const idStrs = groupIds.map(String);
      await fetchGroupDetails(idStrs);
      setCombineDialog({ mode: "edit", trips: trips.filter((t) => idStrs.includes(t.id)) });
      return;
    }
    setInvoiceDialog({ trip, savedInvoice: rawToSavedInvoice(raw as Record<string, unknown>) });
  }

  async function handleCombinedInvoiceSubmit(payload: Record<string, unknown>) {
    if (!combineDialog) return;
    try {
      if (combineDialog.mode === "create") {
        const updatedTrips = await tripsApi.invoiceCombined(payload);
        const ids = updatedTrips.map((t) => t.id);
        setInvoicedIds((prev) => new Set([...prev, ...ids]));
        setInvoiceTypes((prev) => { const next = new Map(prev); for (const id of ids) next.set(id, payload.invoice_type as InvoiceType); return next; });
        setCombineSelection(new Set());
        await fetchGroupDetails(ids);
        setCombineDialog(null);
        setCombinePreview({ trips: updatedTrips, autoDownload: false });
        showSuccess(`Combined invoice generated for ${ids.length} trips.`);
      } else {
        const { trips: tripLines, ...shared } = payload as { trips: Record<string, unknown>[] } & Record<string, unknown>;
        for (const line of tripLines) {
          const { trip_id, ...lineFields } = line as { trip_id: number } & Record<string, unknown>;
          await tripsApi.invoice(String(trip_id), { ...shared, ...lineFields });
        }
        const ids = combineDialog.trips.map((t) => t.id);
        await fetchGroupDetails(ids);
        setCombineDialog(null);
        showSuccess("Combined invoice updated.");
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save combined invoice.");
    }
  }

  // A trip can join the current combined-invoice selection only if it's Verified,
  // not yet invoiced, and — once a selection exists — shares the first selected
  // trip's customer and "billed to Self/CGI" state (mixing either would produce an
  // invoice with an ambiguous bill-to / invoice-type).
  function canJoinCombineSelection(trip: Trip): boolean {
    if (!verifiedIds.has(trip.id) || invoicedIds.has(trip.id) || waivedIds.has(trip.id)) return false;
    if (combineSelection.size === 0) return true;
    const first = trips.find((t) => combineSelection.has(t.id));
    if (!first) return true;
    return trip.customerId === first.customerId && (trip.billTo === "SELF/CGI") === (first.billTo === "SELF/CGI");
  }

  function toggleCombineSelection(trip: Trip) {
    setCombineSelection((prev) => {
      const next = new Set(prev);
      if (next.has(trip.id)) next.delete(trip.id);
      else if (canJoinCombineSelection(trip)) next.add(trip.id);
      return next;
    });
  }

  async function openCombineGenerateDialog() {
    const selected = trips.filter((t) => combineSelection.has(t.id));
    if (selected.length < 2) return;
    await fetchGroupDetails(selected.map((t) => t.id));
    setCombineDialog({ mode: "create", trips: selected });
  }

  async function handleEditInvoiceRequestSubmit(reason: string) {
    if (!pendingEditInvoiceTrip) return;
    try {
      await editApprovalsApi.create({
        resourceType: "Trip",
        resourceId: parseInt(pendingEditInvoiceTrip.id, 10),
        resourceName: pendingEditInvoiceTrip.bookingReferenceNo || pendingEditInvoiceTrip.tripId,
        action: "Edit",
        reason,
      });
      showSuccess("Edit request sent to Admin.");
      setEditRequestOpen(false);
      setPendingEditInvoiceTrip(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to send edit request.");
    }
  }

  async function openPreview(trip: Trip, autoDownload = false) {
    const closure = closures.get(trip.id);
    if (!closure) return;
    const raw = await tripsApi.getInvoice(trip.id).catch(() => null);
    const invNo = raw ? String((raw as Record<string, unknown>).invoice_no ?? "") : "";
    const groupIds = invNo ? await tripsApi.getInvoiceGroup(invNo).catch(() => []) : [];
    if (groupIds.length > 1) {
      const idStrs = groupIds.map(String);
      await fetchGroupDetails(idStrs);
      setCombinePreview({ trips: trips.filter((t) => idStrs.includes(t.id)), autoDownload });
      return;
    }
    let savedInvoice: Partial<InvoiceFormData> | undefined;
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

  const fromMs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
  const toMs   = dateTo   ? new Date(dateTo).setHours(23, 59, 59, 999) : null;


  async function handleDownloadPDF(pdfTrips: Trip[]) {
    if (downloading) return;

    if (pdfTrips.length === 0) {
      showError("No invoiced trips found for the selected date range.");
      return;
    }

    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 10;
      const marginY = 14;
      const rowH = 8;
      const headerH = 9;

      const fmtDate = (iso: string) =>
        new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
      const dateRangeLabel = dateFrom && dateTo && dateFrom === dateTo
        ? fmtDate(dateFrom)
        : `${dateFrom ? fmtDate(dateFrom) : "start"} to ${dateTo ? fmtDate(dateTo) : "today"}`;

      const cols: [string, number][] = [
        ["Invoice No",    36],
        ["Invoice Type",  30],
        ["Invoice Date",  24],
        ["Trip ID",       24],
        ["Booking Ref",   32],
        ["Trip Date",     24],
        ["Bill To",       36],
        ["Route",         40],
        ["Container No",  28],
        ["Vehicle",       27],
      ];

      function drawPageHeader(pageNum: number, totalPages: number) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(27, 43, 94);
        pdf.text("Invoiced Trips Report", marginX, marginY);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(
          `Generated on ${today}  ·  ${pdfTrips.length} invoice${pdfTrips.length !== 1 ? "s" : ""}  ·  ${dateRangeLabel}`,
          marginX, marginY + 5,
        );
        pdf.text(`Page ${pageNum} of ${totalPages}`, pageW - marginX, marginY + 5, { align: "right" });

        const tableTop = marginY + 10;
        pdf.setFillColor(27, 43, 94);
        pdf.rect(marginX, tableTop, pageW - marginX * 2, headerH, "F");

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        let x = marginX;
        for (const [label, w] of cols) {
          pdf.text(label.toUpperCase(), x + 2, tableTop + 6);
          x += w;
        }
        return tableTop + headerH;
      }

      const rowData = pdfTrips.map((trip) => {
        const inv = invoiceData.get(trip.id);
        const invDate = inv?.invoice_date
          ? fmtDate(inv.invoice_date as string)
          : "—";
        return [
          inv?.invoice_no ?? "—",
          inv?.invoice_type ?? "—",
          invDate,
          trip.tripId,
          trip.bookingReferenceNo ?? "—",
          trip.scheduledDate ? fmtDate(trip.scheduledDate + "T00:00:00") : "—",
          inv?.bill_to ?? trip.shipperConsignee ?? "—",
          `${trip.origin} > ${trip.destination}`,
          trip.containerNumber ?? trip.containerNumber1 ?? "—",
          trip.truckRegistration ?? "—",
        ];
      });

      const usableH = pageH - marginY - 20;
      const rowsPerPage = Math.floor((usableH - headerH) / rowH);
      const totalPages = Math.ceil(rowData.length / rowsPerPage);

      let rowIndex = 0;
      for (let page = 1; page <= totalPages; page++) {
        if (page > 1) pdf.addPage();
        const y = drawPageHeader(page, totalPages);

        const pageRows = rowData.slice(rowIndex, rowIndex + rowsPerPage);
        rowIndex += rowsPerPage;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);

        for (let r = 0; r < pageRows.length; r++) {
          const rowY = y + r * rowH;
          if (r % 2 === 1) {
            pdf.setFillColor(249, 250, 251);
            pdf.rect(marginX, rowY, pageW - marginX * 2, rowH, "F");
          }
          pdf.setDrawColor(229, 231, 235);
          pdf.line(marginX, rowY + rowH, pageW - marginX, rowY + rowH);

          pdf.setTextColor(30, 30, 30);
          let x = marginX;
          for (let c = 0; c < cols.length; c++) {
            const [, w] = cols[c];
            const clipped = pdf.splitTextToSize(String(pageRows[r][c] ?? "—"), w - 4)[0] ?? "";
            pdf.text(clipped, x + 2, rowY + 5.5);
            x += w;
          }
        }

        pdf.setDrawColor(209, 213, 219);
        pdf.rect(marginX, y, pageW - marginX * 2, pageRows.length * rowH, "S");
      }

      pdf.save(`invoiced-trips-${today.replace(/ /g, "-")}.pdf`);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }


  const allFiltered = useMemo(
    () => trips.filter((t) => tripMatchesSearch(t, searchQuery, trucks, drivers, customers)),
    [trips, searchQuery, trucks, drivers, customers],
  );

  const filteredTrips = useMemo(() => allFiltered
    .filter((t) => {
      if (statusFilter === "Pending")        return !verifiedIds.has(t.id) && !rejectedIds.has(t.id) && !invoicedIds.has(t.id) && !waivedIds.has(t.id);
      if (statusFilter === "Rejected")       return rejectedIds.has(t.id);
      if (statusFilter === "Verified")       return verifiedIds.has(t.id) && !invoicedIds.has(t.id) && !waivedIds.has(t.id);
      if (statusFilter === "Waived Invoice") return waivedIds.has(t.id) && !invoicedIds.has(t.id);
      if (statusFilter === "Invoiced") {
        if (!invoicedIds.has(t.id)) return false;
        if (invoiceTypeFilter !== "All") {
          const invType = (invoiceData.get(t.id)?.invoice_type ?? "") as string;
          return invType === invoiceTypeFilter;
        }
        return true;
      }
      return true;
    })
    .sort((a, b) => {
      const order = (t: Trip) => invoicedIds.has(t.id) ? 4 : waivedIds.has(t.id) ? 3 : verifiedIds.has(t.id) ? 1 : rejectedIds.has(t.id) ? 2 : 0;
      return order(a) - order(b);
    }), [allFiltered, statusFilter, invoiceTypeFilter, invoiceData, verifiedIds, rejectedIds, invoicedIds, waivedIds]);

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginatedTrips = useMemo(
    () => filteredTrips.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredTrips, safePage],
  );

  // Lazy-load closure + sheet (+ invoice, if invoiced) for ONLY the current
  // page's trips. Cached via fetchedDetailIds so paging back doesn't refetch.
  useEffect(() => {
    const toFetch = paginatedTrips.filter((t) => !fetchedDetailIds.current.has(t.id));
    if (toFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await mapLimit(toFetch, 8, async (t) => {
        const [cl, sh, inv] = await Promise.all([
          tripsApi.getClosure(t.id).catch(() => null),
          tripsApi.getSheet(t.id).catch(() => null),
          invoicedIds.has(t.id) ? tripsApi.getInvoice(t.id).catch(() => null) : Promise.resolve(null),
        ]);
        return { id: t.id, cl, sh, inv };
      });
      if (cancelled) return;
      setClosures((prev) => { const next = new Map(prev); for (const r of results) if (r.cl) next.set(r.id, r.cl); return next; });
      setSheets((prev) => { const next = new Map(prev); for (const r of results) if (r.sh) next.set(r.id, r.sh); return next; });
      setInvoiceData((prev) => { const next = new Map(prev); for (const r of results) if (r.inv) next.set(r.id, r.inv); return next; });
      for (const r of results) fetchedDetailIds.current.add(r.id);
    })();
    return () => { cancelled = true; };
  }, [paginatedTrips, invoicedIds]);

  // The report modal / PDF filters and displays invoice data across ALL invoiced
  // trips (not just the visible page), so when it opens we batch-fetch any invoice
  // data not already cached — concurrency-limited so it never bursts the pool.
  useEffect(() => {
    if (!showReportModal) return;
    const missing = trips.filter((t) => invoicedIds.has(t.id) && !invoiceData.has(t.id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await mapLimit(missing, 8, (t) =>
        tripsApi.getInvoice(t.id).then((inv) => ({ id: t.id, inv })).catch(() => null),
      );
      if (cancelled) return;
      setInvoiceData((prev) => { const next = new Map(prev); for (const r of results) if (r?.inv) next.set(r.id, r.inv); return next; });
    })();
    return () => { cancelled = true; };
  }, [showReportModal, trips, invoicedIds]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={10} />;

  // Counts for filter cards
  const pendingCount       = allFiltered.filter((t) => !verifiedIds.has(t.id) && !rejectedIds.has(t.id) && !invoicedIds.has(t.id) && !waivedIds.has(t.id)).length;
  const rejectedCount      = allFiltered.filter((t) => rejectedIds.has(t.id)).length;
  const verifiedCount      = allFiltered.filter((t) => verifiedIds.has(t.id) && !invoicedIds.has(t.id) && !waivedIds.has(t.id)).length;
  const invoicedCount      = allFiltered.filter((t) => invoicedIds.has(t.id)).length;
  const waivedInvoiceCount = allFiltered.filter((t) => waivedIds.has(t.id) && !invoicedIds.has(t.id)).length;

  const FILTER_CARDS: { key: StatusFilter; label: string; count: number; color: string }[] = [
    { key: "All",            label: "All Trips",      count: allFiltered.length,   color: "border-gray-200 bg-white text-gray-900" },
    { key: "Pending",        label: "Pending",        count: pendingCount,          color: "border-yellow-200 bg-yellow-50 text-yellow-700" },
    { key: "Rejected",       label: "Rejected",       count: rejectedCount,         color: "border-rose-200 bg-rose-50 text-rose-700" },
    { key: "Verified",       label: "Verified",       count: verifiedCount,         color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { key: "Invoiced",       label: "Invoiced",       count: invoicedCount,         color: "border-blue-200 bg-blue-50 text-blue-700" },
    { key: "Waived Invoice", label: "Waived Invoice", count: waivedInvoiceCount,    color: "border-purple-200 bg-purple-50 text-purple-700" },
  ];

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-600 shadow-sm">
          <FileText className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Verification & Invoicing</h1>
          <p className="mt-0.5 text-sm text-gray-500">Verify trip data and generate invoices in one place</p>
        </div>
      </div>
      {/* Toolbar: search on the left, invoice-date range + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by truck no., driver, trip ID…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div title="Invoice Date — scopes the View report to trips invoiced in this range">
            <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </div>
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            title="View and download invoiced trips for selected date range"
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
          >
            <Eye className="h-4 w-4" />
            View
          </button>
        </div>
      </div>

      {/* Filter cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {FILTER_CARDS.map(({ key, label, count, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setStatusFilter(key); setPage(1); if (key !== "Invoiced") setInvoiceTypeFilter("All"); }}
            className={`rounded-xl border px-4 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${color} ${statusFilter === key ? "ring-2 ring-blue-500 shadow-md" : "hover:shadow-sm"}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
            <p className="mt-1 text-2xl font-bold">{count}</p>
          </button>
        ))}
      </div>

      {/* Workflow steps legend + invoice type sub-filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-gray-600">Workflow:</span>
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-yellow-500" /> Pending → verify trip data</span>
          <span className="text-gray-300">›</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Verified → generate invoice</span>
          <span className="text-gray-300">›</span>
          <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-blue-500" /> Invoiced</span>
        </div>
        {/* Invoice type sub-filter — only visible when Invoiced tab is selected */}
        {statusFilter === "Invoiced" && <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Invoice Type:</span>
          {(["All", "Tax Invoice", "Bill of Supply", "Transport Memo"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { setInvoiceTypeFilter(opt); setPage(1); }}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                invoiceTypeFilter === opt
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>}
      </div>

      {/* Combined-invoice selection bar */}
      {combineSelection.size > 0 && (() => {
        const selected = trips.filter((t) => combineSelection.has(t.id));
        const selectedCustomer = selected[0] ? customerById.get(selected[0].customerId) : undefined;
        const total = selected.reduce((sum, t) => sum + (sheets.get(t.id) ? n(sheets.get(t.id)!.hireAmount) : 0), 0);
        const canGenerate = selected.length >= 2;
        return (
          <div className="dk-inset flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-indigo-50/40 to-white px-5 py-3.5 shadow-sm">
            <div className="flex items-center gap-3.5">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-100 to-white text-indigo-600 shadow-sm">
                <Layers className="h-5 w-5" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white shadow-sm">
                  {selected.length}
                </span>
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {selected.length} trip{selected.length !== 1 ? "s" : ""} selected
                  <span className="mx-1.5 text-gray-300">·</span>
                  <span className="text-indigo-700">{selectedCustomer?.name ?? "no customer"}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Approx total <span className="font-semibold text-gray-700">{fmt(total)}</span>
                  {!canGenerate && <span className="ml-2 text-amber-600">· select at least 1 more trip to combine</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCombineSelection(new Set())}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={openCombineGenerateDialog}
                disabled={!canGenerate}
                title={!canGenerate ? "Select at least 2 trips to combine" : undefined}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-sm"
              >
                <FileText className="h-3.5 w-3.5" />
                Generate Combined Invoice
              </button>
            </div>
          </div>
        );
      })()}

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
                  {[
                    ...(statusFilter === "Verified" ? ["Combine"] : []),
                    "Status", "Actions", "Date", "Vehicle", "Driver", "Container No", "From → To", "Trip ID", "Booking Ref",
                    "Hire Amt", "Expense", "Invoice No", "Delete",
                  ].map((col) => (
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
                  const isWaived    = waivedIds.has(trip.id) && !isInvoiced;
                  const inv         = invoiceData.get(trip.id);

                  const hireAmt    = sheet ? n(sheet.hireAmount) : 0;
                  const expenseAmt = sheet ? calcTripExpenses(sheet) : 0;
                  const invNo      = inv?.invoice_no ?? "—";
                  const invType    = (inv?.invoice_type ?? invoiceTypes.get(trip.id) ?? "") as string;
                  const invTypeBadge = invType === "Bill of Supply" ? "bg-emerald-100 text-emerald-700"
                    : invType === "Transport Memo" ? "bg-orange-100 text-orange-700"
                    : invType === "Tax Invoice" ? "bg-blue-100 text-blue-700" : "";

                  const tripStatus = isInvoiced ? "invoiced" : isWaived ? "waived" : isVerified ? "verified" : isRejected ? "rejected" : "pending";
                  // Row tint matches the filter cards: Invoiced→blue, Waived→purple, Verified→emerald, Rejected→rose, Pending→yellow.
                  const stageColor: StageColor = isInvoiced ? "blue" : isWaived ? "purple" : isVerified ? "emerald" : isRejected ? "rose" : "yellow";

                  return (
                    <tr
                      key={trip.id}
                      className={stageRowClass(stageColor)}
                    >
                      {statusFilter === "Verified" && (
                        <td className="px-4 py-3">
                          {isVerified && !isInvoiced && !isWaived && (
                            <input
                              type="checkbox"
                              checked={combineSelection.has(trip.id)}
                              disabled={!combineSelection.has(trip.id) && !canJoinCombineSelection(trip)}
                              onChange={() => toggleCombineSelection(trip)}
                              title={!combineSelection.has(trip.id) && !canJoinCombineSelection(trip)
                                ? "Combined invoices must share the same customer and bill-to"
                                : "Select for combined invoice"}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-30"
                            />
                          )}
                        </td>
                      )}
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
                            <button type="button" onClick={() => setLrDialogTrip(trip)}
                              className="flex items-center gap-1 rounded-lg border border-blue-900/30 px-2.5 py-1 text-xs font-semibold text-blue-900 hover:bg-blue-50">
                              Generate LR
                            </button>
                            {parseFloat(trip.customerFuelAdvanceAmount || "0") > 0 && (
                              <button type="button" onClick={() => setDabDialogTrip(trip)}
                                className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                                Generate DAB
                              </button>
                            )}
                            {parseFloat(trip.customerCashAdvance || "0") > 0 &&
                              (trip.paymentType === "Cash" || trip.paymentType === "Credit") && (
                              <button type="button" onClick={() => setCabDialogTrip(trip)}
                                className="flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800 hover:bg-green-100">
                                Generate CAB
                              </button>
                            )}
                          </div>
                        ) : isWaived ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-purple-700">Invoice Waived</span>
                            <button
                              type="button"
                              onClick={() => setInvoiceDialog({ trip, savedInvoice: null })}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                            >
                              GENERATE INVOICE
                            </button>
                            <button type="button" onClick={() => { setVerifyTripReadOnly(true); setVerifyTrip(trip); }}
                              className="w-fit rounded-lg border border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                              View Details
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
                            <button type="button" onClick={() => setLrDialogTrip(trip)}
                              className="rounded-lg border border-blue-900/30 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-50">
                              GENERATE LR
                            </button>
                            <button type="button" onClick={() => handleWaiveInvoice(trip)}
                              className="rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50">
                              WAIVE INVOICE
                            </button>
                            <button type="button" onClick={() => { setVerifyTripReadOnly(true); setVerifyTrip(trip); }}
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
                            <button type="button" onClick={() => { setVerifyTripReadOnly(false); setVerifyTrip(trip); }}
                              className="w-fit rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                              Review
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setVerifyTripReadOnly(false); setVerifyTrip(trip); }}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            VERIFY TRIP DATA
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {trip.bookingCreatedDate
                          ? new Date(trip.bookingCreatedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")
                          : "—"}
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
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setDeleteRequestTrip(trip)}
                            title="Delete this trip and all its data"
                            className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteRequestTrip(trip)}
                            title="Request Admin to delete this trip"
                            className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Request Delete
                          </button>
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
        customer={verifyTrip ? customerById.get(verifyTrip.customerId) : undefined}
        readOnly={verifyTripReadOnly}
        onClose={() => { setVerifyTrip(null); setVerifyTripReadOnly(false); }}
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

      {combineDialog && (
        <GenerateCombinedInvoiceDialog
          open={combineDialog !== null}
          trips={combineDialog.trips}
          sheets={sheets}
          customer={customerById.get(combineDialog.trips[0]?.customerId ?? "")}
          mode={combineDialog.mode}
          savedInvoices={combineDialog.mode === "edit" ? invoiceData : undefined}
          onClose={() => setCombineDialog(null)}
          onSubmit={handleCombinedInvoiceSubmit}
        />
      )}

      <CombinedInvoicePreviewDialog
        open={combinePreview !== null}
        trips={combinePreview?.trips ?? []}
        closures={closures}
        sheets={sheets}
        customer={combinePreview?.trips[0] ? customerById.get(combinePreview.trips[0].customerId) : undefined}
        rawInvoices={invoiceData}
        autoDownload={combinePreview?.autoDownload}
        onClose={() => setCombinePreview(null)}
      />

      <LRConsignmentDialog
        open={lrDialogTrip !== null}
        trip={lrDialogTrip}
        truck={lrDialogTrip ? truckById.get(lrDialogTrip.vehicleId) : undefined}
        invoiceNo={lrDialogTrip ? (invoiceData.get(lrDialogTrip.id)?.invoice_no ?? "") : ""}
        onClose={() => setLrDialogTrip(null)}
      />

      <DABDialog
        open={dabDialogTrip !== null}
        trip={dabDialogTrip}
        truck={dabDialogTrip ? truckById.get(dabDialogTrip.vehicleId) : undefined}
        customer={dabDialogTrip ? customerById.get(dabDialogTrip.customerId) : undefined}
        invoiceNo={dabDialogTrip ? (invoiceData.get(dabDialogTrip.id)?.invoice_no ?? "") : ""}
        onClose={() => setDabDialogTrip(null)}
      />

      <CABDialog
        open={cabDialogTrip !== null}
        trip={cabDialogTrip}
        truck={cabDialogTrip ? truckById.get(cabDialogTrip.vehicleId) : undefined}
        customer={cabDialogTrip ? customerById.get(cabDialogTrip.customerId) : undefined}
        invoiceNo={cabDialogTrip ? (invoiceData.get(cabDialogTrip.id)?.invoice_no ?? "") : ""}
        onClose={() => setCabDialogTrip(null)}
      />

      <EditRequestDialog
        open={editRequestOpen}
        resourceType="Trip"
        resourceName={pendingEditInvoiceTrip ? (pendingEditInvoiceTrip.bookingReferenceNo || pendingEditInvoiceTrip.tripId) : ""}
        action="Edit"
        onSubmit={handleEditInvoiceRequestSubmit}
        onClose={() => { setEditRequestOpen(false); setPendingEditInvoiceTrip(null); }}
      />

      {deleteRequestTrip && (
        <EditRequestDialog
          open={deleteRequestTrip !== null}
          resourceType="Trip"
          resourceName={deleteRequestTrip.bookingReferenceNo || deleteRequestTrip.tripId}
          action="Delete"
          directAction={isAdmin}
          onSubmit={(reason) => handleDeleteSubmit(deleteRequestTrip, reason)}
          onClose={() => setDeleteRequestTrip(null)}
        />
      )}

      {showReportModal && (() => {
        const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
        const rangeLabel = dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
        const pdfTrips = trips.filter((t) => {
          // Status filter
          if (modalStatusFilter === "Pending" && (verifiedIds.has(t.id) || rejectedIds.has(t.id) || invoicedIds.has(t.id) || waivedIds.has(t.id))) return false;
          if (modalStatusFilter === "Rejected" && !rejectedIds.has(t.id)) return false;
          if (modalStatusFilter === "Verified" && (!verifiedIds.has(t.id) || invoicedIds.has(t.id) || waivedIds.has(t.id))) return false;
          if (modalStatusFilter === "Invoiced" && !invoicedIds.has(t.id)) return false;
          if (modalStatusFilter === "Waived Invoice" && !(waivedIds.has(t.id) && !invoicedIds.has(t.id))) return false;
          // Date filter reference depends on status:
          //  - Invoiced trips → filter by invoice_date (when the invoice was raised)
          //  - Otherwise (Pending etc.) → filter by scheduledDate (the trip date), since there is no invoice date yet
          if (fromMs || toMs) {
            let ms: number | null = null;
            const inv = invoiceData.get(t.id);
            if (invoicedIds.has(t.id) && inv?.invoice_date) {
              ms = new Date(inv.invoice_date as string).getTime();
            } else if (t.scheduledDate) {
              ms = new Date(t.scheduledDate + "T00:00:00").getTime();
            }
            if (ms !== null) {
              if (fromMs && ms < fromMs) return false;
              if (toMs && ms > toMs) return false;
            }
          }
          return true;
        });
        const tripStatus = (t: Trip) =>
          invoicedIds.has(t.id) ? "Invoiced"
          : waivedIds.has(t.id) ? "Waived Invoice"
          : verifiedIds.has(t.id) ? "Verified"
          : rejectedIds.has(t.id) ? "Rejected"
          : "Pending";
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowReportModal(false); }}>
            <div className="w-full max-w-5xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div>
                  <p className="font-semibold text-gray-900">Verification & Invoicing Report</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rangeLabel} · {pdfTrips.length} trip{pdfTrips.length !== 1 ? "s" : ""}</p>
                </div>
                <button type="button" onClick={() => setShowReportModal(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
              {/* Modal status filter */}
              <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3 shrink-0 bg-gray-50">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Status:</span>
                  <select
                    value={modalStatusFilter}
                    onChange={(e) => setModalStatusFilter(e.target.value as typeof modalStatusFilter)}
                    className="rounded-lg border border-gray-200 bg-white py-1.5 px-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  >
                    <option value="All">All Trips</option>
                    <option value="Pending">Pending</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Verified">Verified</option>
                    <option value="Invoiced">Invoiced</option>
                    <option value="Waived Invoice">Waived Invoice</option>
                  </select>
                </div>
                {modalStatusFilter !== "All" && (
                  <button type="button" onClick={() => setModalStatusFilter("All")} className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100">Clear</button>
                )}
              </div>
              <div className="flex-1 overflow-auto px-5 py-4">
                {pdfTrips.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-12">No trips found for the selected filters.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {["#", "Status", "Trip ID", "Booking Ref", "Trip Date", "Vehicle", "Route", "Container No", "Invoice No", "Invoice Type", "Invoice Date"].map((col) => (
                          <th key={col} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pdfTrips.map((t, i) => {
                        const inv = invoiceData.get(t.id);
                        const customer = customers.find((c) => c.id === t.customerId);
                        const invoiceDateFmt = inv?.invoice_date ? new Date(inv.invoice_date as string).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—";
                        const status = tripStatus(t);
                        const statusColor: Record<string, string> = {
                          "Invoiced": "bg-blue-100 text-blue-700",
                          "Verified": "bg-emerald-100 text-emerald-700",
                          "Rejected": "bg-rose-100 text-rose-700",
                          "Waived Invoice": "bg-purple-100 text-purple-700",
                          "Pending": "bg-yellow-100 text-yellow-700",
                        };
                        return (
                          <tr key={t.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor[status]}`}>{status}</span>
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{t.tripId ?? t.id}</td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{t.bookingReferenceNo ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.scheduledDate ? new Date(t.scheduledDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—"}</td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{t.truckRegistration ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-[140px] truncate">{[t.origin, t.destination].filter(Boolean).join(" → ") || "—"}</td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{t.containerNumber ?? "—"}</td>
                            <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{inv?.invoice_no ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{inv?.invoice_type ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{invoiceDateFmt}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="border-t px-5 py-3 flex items-center justify-end gap-2 shrink-0">
                <DownloadExcelButton
                  path="/exports/trips"
                  filename="invoiced_trips.xlsx"
                  direct
                  params={{ is_invoiced: "true" }}
                  className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button type="button" onClick={async () => { await handleDownloadPDF(pdfTrips); setShowReportModal(false); }} disabled={downloading || pdfTrips.length === 0} className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Download className="h-4 w-4" />
                  {downloading ? "Generating..." : "Download PDF"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
