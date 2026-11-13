"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { RiHistoryLine as History, RiFileTextLine as FileText, RiFileList3Line as ClipboardList, RiReceiptLine as Receipt, RiDeleteBinLine as Trash2, RiStackLine as Layers, RiAddLine as Plus, RiPencilLine as Pencil, RiCheckboxCircleLine as CheckCircle2, RiCloseCircleLine as XCircle, RiArrowGoBackLine as RotateCcw } from "@remixicon/react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { stageRowClass, stageBadgeClass, type StageColor } from "@/lib/stage-colors";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { TripReport } from "@/lib/trip-report-pdf";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PillSearch } from "@/components/ui/PillSearch";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { TripCategoryTag } from "@/components/trips/TripCategoryTag";
import { TripCategoryFilter } from "@/components/trips/TripCategoryFilter";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import { tripsApi, driversApi, trucksApi, customersApi, deletionApprovalsApi, type TripEditEventRow } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery, containerRef } from "@/lib/trip-search";
import { useAuth } from "@/context/AuthContext";
import type { Trip, TripCategory } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import { n } from "@/types/trip-sheet";
import type { InvoiceType } from "@/components/trips/GenerateInvoiceDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { showSuccess, showError } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const EditRequestDialog = dynamic(() => import("@/components/attendance/EditRequestDialog").then((m) => m.EditRequestDialog));
const BookingSheetDialog = dynamic(() => import("@/components/trips/BookingSheetDialog").then((m) => m.BookingSheetDialog));
const TripSheetDialog = dynamic(() => import("@/components/trips/TripSheetDialog").then((m) => m.TripSheetDialog));
const InvoicePreviewDialog = dynamic(() => import("@/components/trips/InvoicePreviewDialog").then((m) => m.InvoicePreviewDialog));
const CombinedInvoicePreviewDialog = dynamic(() => import("@/components/trips/CombinedInvoicePreviewDialog").then((m) => m.CombinedInvoicePreviewDialog));
type InvoicePreviewState = {
  trip: Trip;
  closure: TripClosureData;
  sheet?: TripSheetData;
  customer?: Customer;
  invoiceType: InvoiceType;
};

const CURRENT_STATUSES = new Set(["Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);


const EDIT_EVENT_ICON: Record<TripEditEventRow["event"], typeof Plus> = {
  "Booking Created": Plus,
  "Booking Edited": Pencil,
  "Trip Sheet Saved": ClipboardList,
  "Trip Updated": Pencil,
  "Trip Closed": CheckCircle2,
  "Verification Confirmed": CheckCircle2,
  "Verification Rejected": XCircle,
  "Trip Deleted": Trash2,
  "Trip Restored": RotateCcw,
};

const EDIT_EVENT_COLOR: Record<TripEditEventRow["event"], string> = {
  "Booking Created": "bg-accent-surface-strong text-accent-text",
  "Booking Edited": "bg-warning-surface-strong text-warning-text",
  "Trip Sheet Saved": "bg-purple-surface-strong text-purple-text",
  "Trip Updated": "bg-warning-surface-strong text-warning-text",
  "Trip Closed": "bg-success-surface-strong text-success-text",
  "Verification Confirmed": "bg-success-surface-strong text-success-text",
  "Verification Rejected": "bg-danger-surface-strong text-danger-text",
  "Trip Deleted": "bg-danger-surface-strong text-danger-text",
  "Trip Restored": "bg-success-surface-strong text-success-text",
};

export default function TripHistoryPage() {
  const { user } = useAuth();
  const isFleetManager = user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";
  const isAdmin = user?.softwareDesignation === "Admin";
  const isAuditor = user?.softwareDesignation === "Auditor";
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());

  const [bookingTrip, setBookingTrip] = useState<Trip | null>(null);
  const [sheetTrip, setSheetTrip] = useState<Trip | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreviewState | null>(null);
  const [combinePreview, setCombinePreview] = useState<{ trips: Trip[] } | null>(null);
  const [combineRawInvoices, setCombineRawInvoices] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  type StatusFilter = "All" | "Assigned" | "Current" | "Completed" | "Invoiced" | "Waived Invoice" | "Cancelled";
  // Auditor only ever sees three of these cards, so default straight to one of
  // them instead of "All" — a card-less filter state would be confusing.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(isAuditor ? "Invoiced" : "All");
  // Trip Category ("" = all): narrows the list, the stage cards' numbers and the View export.
  const [categoryFilter, setCategoryFilter] = useState<TripCategory | "">("");
  const [deleteRequestTrip, setDeleteRequestTrip] = useState<Trip | null>(null);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TripEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every trip edit ever
  // logged (not just the trips currently on this page) — searching by Trip
  // ID here doubles as that specific trip's own edit history.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tripsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  // Trip ids whose closure/sheet have already been fetched — so paging back to a
  // page we've seen doesn't refetch. Reset whenever the trip list reloads so the
  // visible page picks up fresh closure/sheet data on the next tick.
  const fetchedDetailIds = useRef<Set<string>>(new Set());

  async function loadAll() {
    // Only the trip list + reference data is loaded here (one request each).
    // Closures and trip sheets are fetched lazily, per visible page — see the
    // effect below — so a 1000-trip history no longer fires 2000 requests at once.
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
      // Every role sees all trips, open ones included, so the Assigned and Current cards work for everyone.
      setTrips(allTrips.value);
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

  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_deleted", () => setRefreshKey(k => k + 1));

  const driverById   = useMemo(() => new Map(drivers.map((d) => [d.driverId, d])), [drivers]);
  const truckById    = useMemo(() => new Map(trucks.map((t) => [t.truckId, t])), [trucks]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  // Filtering + pagination are memoised so the current page's trip slice has a
  // stable identity to drive the lazy closure/sheet fetch below. The date range
  // beside View only scopes that export (exports.py) — the table lists every trip.
  const filteredTrips = useMemo(() => trips
    .filter((t) => !categoryFilter || t.tripCategory === categoryFilter)
    .filter((t) => {
      if (statusFilter === "Assigned")  return t.status === "Assigned";
      if (statusFilter === "Current")   return CURRENT_STATUSES.has(t.status);
      if (statusFilter === "Completed") return (t as any).hasClosure === true && t.status !== "Cancelled";
      if (statusFilter === "Invoiced")  return (t as any).isInvoiced === true;
      if (statusFilter === "Waived Invoice") return (t as any).invoiceWaived === true && (t as any).isInvoiced !== true;
      if (statusFilter === "Cancelled") return t.status === "Cancelled";
      return true;
    })
    .filter((t) => tripMatchesSearch(t, searchQuery, trucks, drivers))
    .sort((a, b) => {
      const aInv = (a as any).isInvoiced === true ? 1 : 0;
      const bInv = (b as any).isInvoiced === true ? 1 : 0;
      return aInv - bInv;
    }), [trips, categoryFilter, statusFilter, searchQuery, trucks, drivers]);

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedTrips = useMemo(
    () => filteredTrips.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredTrips, safePage],
  );

  // Lazy-load closure + trip-sheet data for ONLY the trips on the current page.
  // Cached via fetchedDetailIds so paging back doesn't refetch. This replaces the
  // old "fetch every trip's closure+sheet upfront" burst that exhausted the DB pool.
  useEffect(() => {
    const toFetch = paginatedTrips.filter((t) => !fetchedDetailIds.current.has(t.id));
    if (toFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      // One bulk request each for the whole page, instead of 2 per trip.
      const ids = toFetch.map((t) => t.id);
      const [cls, shs] = await Promise.all([
        tripsApi.getClosuresBulk(ids).catch(() => null),
        tripsApi.getSheetsBulk(ids).catch(() => null),
      ]);
      if (cancelled) return;
      if (cls) setClosures((prev) => new Map([...prev, ...cls]));
      if (shs) setSheets((prev) => new Map([...prev, ...shs]));
      // Only mark as fetched if both succeeded, so a transient failure retries on the next refresh.
      if (cls && shs) for (const id of ids) fetchedDetailIds.current.add(id);
    })();
    return () => { cancelled = true; };
  }, [paginatedTrips]);

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

  async function handleViewCombinedInvoice(trip: Trip) {
    const raw = await tripsApi.getInvoice(trip.id).catch(() => null);
    const invNo = raw ? String((raw as Record<string, unknown>).invoice_no ?? "") : "";
    if (!invNo) return;
    const groupIds = await tripsApi.getInvoiceGroup(invNo).catch(() => []);
    if (groupIds.length < 2) return;
    const idStrs = groupIds.map(String);
    const missingCl = idStrs.filter((id) => !closures.has(id));
    const missingSh = idStrs.filter((id) => !sheets.has(id));
    const [cls, shs, invs] = await Promise.all([
      missingCl.length ? tripsApi.getClosuresBulk(missingCl).catch(() => null) : Promise.resolve(null),
      missingSh.length ? tripsApi.getSheetsBulk(missingSh).catch(() => null) : Promise.resolve(null),
      tripsApi.getInvoicesBulk(idStrs).catch(() => new Map<string, Record<string, unknown>>()),
    ]);
    if (cls) setClosures((prev) => new Map([...prev, ...cls]));
    if (shs) setSheets((prev) => new Map([...prev, ...shs]));
    setCombineRawInvoices(invs);
    setCombinePreview({ trips: trips.filter((t) => idStrs.includes(t.id)) });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDeleteSubmit(trip: Trip, reason: string) {
    try {
      if (isAdmin) {
        await tripsApi.remove(trip.id, reason);
        setTrips((prev) => prev.filter((t) => t.id !== trip.id));
        setSelected((prev) => { const next = new Set(prev); next.delete(trip.id); return next; });
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

  async function handleBulkDeleteSubmit(reason: string) {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    const ids = [...selected];
    const failed: string[] = [];
    await Promise.all(
      ids.map((id) =>
        tripsApi.remove(id, reason).catch(() => {
          failed.push(trips.find((t) => t.id === id)?.tripId ?? id);
        })
      )
    );
    setTrips((prev) => prev.filter((t) => !selected.has(t.id) || (failed.length > 0 && failed.includes(t.tripId))));
    setSelected(new Set());
    setDeleting(false);
    setBulkDeleteOpen(false);
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

  // The stage cards count within the chosen Trip Category.
  const inCategory = categoryFilter ? trips.filter((t) => t.tripCategory === categoryFilter) : trips;
  const counts = {
    All:       inCategory.length,
    Assigned:  inCategory.filter((t) => t.status === "Assigned").length,
    Current:   inCategory.filter((t) => CURRENT_STATUSES.has(t.status)).length,
    Completed: inCategory.filter((t) => (t as any).hasClosure === true && t.status !== "Cancelled").length,
    Invoiced:  inCategory.filter((t) => (t as any).isInvoiced === true).length,
    "Waived Invoice": inCategory.filter((t) => (t as any).invoiceWaived === true && (t as any).isInvoiced !== true).length,
    Cancelled: inCategory.filter((t) => t.status === "Cancelled").length,
  };

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3.5">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <History className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Trip History</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              All trips — view booking sheet, trip sheet, and invoice.
            </p>
          </div>
        </div>
        {(isAdmin || isFleetManager) && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex items-center gap-1.5 rounded-lg border border-border-button-default bg-background-primary-default px-3.5 py-2 text-body-semibold text-text-primary shadow-sm hover:bg-fill-2 transition-colors"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      {/* Toolbar: search on the left, date range (for the View export only) + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch
          placeholder="Search by truck no., driver, trip ID…"
          value={searchQuery}
          onChange={(v) => { setSearchQuery(v); setPage(1); }}
        />
        <TripCategoryFilter
          tour="history-category"
          trips={trips}
          value={categoryFilter}
          onChange={(v) => { setCategoryFilter(v); setPage(1); }}
        />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill
            from={exportFrom}
            to={exportTo}
            onFromChange={setExportFrom}
            onToChange={setExportTo}
          />
          {/* View follows the summary card currently selected (All / Assigned / Current / …), the dates and the search */}
          {/* The category-wise report: Summary, a sheet per trip category, By Customer (+ its PDF).
              Follows the stage card, category, dates and search. */}
          <ReportViewButton
            path="/exports/trip-report"
            filename="Trip_History.xlsx"
            title={`Trip History Report — ${exportFrom || exportTo ? `${exportFrom ? exportFrom.split("-").reverse().join("-") : "start"} to ${exportTo ? exportTo.split("-").reverse().join("-") : "today"}` : "all time"}${statusFilter !== "All" ? ` — ${statusFilter}` : ""}${categoryFilter ? ` — ${categoryFilter}` : ""}${searchQuery.trim() ? ` — "${searchQuery.trim()}"` : ""}`}
            params={{
              card: statusFilter,
              ...(categoryFilter ? { trip_category: categoryFilter } : {}),
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
              ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
            }}
            pdf={(report, file) => import("@/lib/trip-report-pdf").then((m) => m.downloadTripReportPdf({ report: report as TripReport, filename: file }))}
          />
        </div>
      </div>

      {/* Summary count cards — Auditor only gets the three audit-relevant ones */}
      <div data-tour="history-stats" className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${isAuditor ? "" : "md:grid-cols-7"}`}>
        {(isAuditor
          ? (["Invoiced", "Waived Invoice", "Completed"] as const)
          : (["All", "Assigned", "Current", "Completed", "Invoiced", "Waived Invoice", "Cancelled"] as const)
        ).map((f) => {
          const colors: Record<string, string> = {
            All:       "border-separator-border bg-background-primary-default text-text-primary",
            Assigned:  "border-accent-border bg-accent-surface text-accent-text",
            Current:   "border-warning-border bg-warning-surface text-warning-text",
            Completed: "border-success-border bg-success-surface text-success-text",
            Invoiced:  "border-purple-border bg-purple-surface text-purple-text",
            "Waived Invoice": "border-purple-border bg-purple-surface text-purple-text",
            Cancelled: "border-danger-border bg-danger-surface text-danger-text",
          };
          const activeRing: Record<string, string> = {
            All:       "ring-2 ring-border-button-default",
            Assigned:  "ring-2 ring-accent-border-strong",
            Current:   "ring-2 ring-warning-border-strong",
            Completed: "ring-2 ring-success-border-strong",
            Invoiced:  "ring-2 ring-purple-border-strong",
            "Waived Invoice": "ring-2 ring-purple-border-strong",
            Cancelled: "ring-2 ring-danger-border-strong",
          };
          return (
            <button
              key={f}
              type="button"
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={`flex flex-col items-center rounded-xl border px-3 py-3 transition ${colors[f]} ${statusFilter === f ? activeRing[f] : "hover:opacity-80"}`}
            >
              <span className="text-title-2-semibold">{counts[f]}</span>
              <span className="text-caption-1-medium">{f}</span>
            </button>
          );
        })}
      </div>

      {/* Active filter label */}
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <span>
          Showing <span className="font-semibold text-text-primary">{filteredTrips.length}</span> of{" "}
          <span className="font-semibold text-text-primary">{trips.length}</span> trips
          {statusFilter !== "All" && (
            <> — filtered by <span className="font-semibold text-text-primary">{statusFilter}</span></>
          )}
        </span>
        {!isAuditor && statusFilter !== "All" && (
          <button
            type="button"
            onClick={() => setStatusFilter("All")}
            className="ml-1 rounded-full border border-border-button-default bg-background-primary-default px-2 py-0.5 text-xs text-text-secondary hover:bg-fill-3"
          >
            Clear
          </button>
        )}
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-danger-border bg-danger-surface px-4 py-2">
          <span className="text-body-medium text-danger-text-strong">
            {selected.size} trip{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-secondary hover:bg-fill-2"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setBulkDeleteOpen(true)}
              className="rounded-lg bg-danger-solid px-3 py-1.5 text-caption-1-semibold text-on-solid hover:bg-danger-solid-hover disabled:opacity-50"
            >
              {deleting ? "Deleting…" : `Delete ${selected.size} Trip${selected.size > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {filteredTrips.length === 0 ? (
        <EmptyState size="compact" illustration="logistics" title="No closed trips found" />
      ) : (
        <>
        <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default">
          <table className="w-full min-w-[1500px] text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-separator-border bg-fill-1">
                {isAdmin && (
                  <th className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={filteredTrips.length > 0 && filteredTrips.every((t) => selected.has(t.id))}
                      onChange={() => {
                        setSelected(
                          filteredTrips.every((t) => selected.has(t.id))
                            ? new Set()
                            : new Set(filteredTrips.map((t) => t.id))
                        );
                      }}
                      className="h-4 w-4 rounded border-border-button-default accent-danger-solid"
                      title="Select all trips"
                    />
                  </th>
                )}
                {["Status", "Trip ID", "Booking Ref", "Customer", "Route", "Container No", "Driver", "Vehicle", "Date", "Hire Amount", "Total Expenses", ...(isAdmin ? ["Trip Summary"] : []), ...(!isFleetManager ? ["Invoice"] : []), "Documents"].map((col) => (
                  <th key={col} className="px-4 py-2 text-caption-1-semibold text-text-secondary">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {paginatedTrips.map((trip) => {
                const customer   = customerById.get(trip.customerId);
                const isInvoiced = (trip as any).isInvoiced === true;
                const isWaived   = (trip as any).invoiceWaived === true && !isInvoiced;
                const hasSheet   = sheets.has(trip.id);
                const sheet      = sheets.get(trip.id);
                const hire       = sheet ? n(sheet.hireAmount)   : null;
                const expense    = sheet ? n(sheet.totalExpense)  : null;
                const pl         = hire !== null && expense !== null ? hire - expense : null;
                const isProfit   = pl !== null && pl >= 0;
                // Stage tint/label match the summary filter cards.
                const stage: { color: StageColor; label: string } =
                  trip.status === "Cancelled"               ? { color: "red",     label: "Cancelled" }
                  : isInvoiced                              ? { color: "purple",  label: "Invoiced" }
                  : isWaived                                ? { color: "indigo",  label: "Waived Invoice" }
                  : (trip as any).hasClosure === true       ? { color: "emerald", label: "Completed" }
                  : CURRENT_STATUSES.has(trip.status)       ? { color: "amber",   label: "Current" }
                  : trip.status === "Assigned"              ? { color: "blue",    label: "Assigned" }
                  :                                           { color: "gray",    label: trip.status };

                return (
                  <tr key={trip.id} className={selected.has(trip.id) ? "border-l-4 border-l-danger-border-strong bg-danger-surface/60" : stageRowClass(stage.color)}>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(trip.id)}
                          onChange={() => toggleRow(trip.id)}
                          className="h-4 w-4 rounded border-border-button-default accent-danger-solid"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <span className={stageBadgeClass(stage.color)}>{stage.label}</span>
                    </td>
                    <td className="px-4 py-2 font-semibold text-text-primary">
                      <div className="flex items-center gap-2">
                        {trip.tripId}
                        {trip.status === "Cancelled" ? (
                          <span className="inline-flex items-center rounded-full bg-danger-surface-strong px-2 py-0.5 text-caption-2-semibold text-danger-text">
                            Cancelled
                          </span>
                        ) : !(trip as any).hasClosure && isAdmin ? (
                          <span className="inline-flex items-center rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-2-semibold text-warning-text">
                            {trip.status}
                          </span>
                        ) : null}
                      </div>
                      {isAdmin && (() => {
                        const closure = closures.get(trip.id);
                        const sheetData = sheets.get(trip.id);
                        const items = [
                          trip.internalRemarks       && { label: "Assignment",  text: trip.internalRemarks,       color: "text-text-secondary" },
                          trip.bookingInstructions   && { label: "Instructions", text: trip.bookingInstructions,  color: "text-text-secondary" },
                          closure?.closureRemarks    && { label: "Closure",      text: closure.closureRemarks,    color: "text-accent-text" },
                          sheetData?.remarks         && { label: "Sheet",        text: sheetData.remarks,         color: "text-purple-text" },
                        ].filter(Boolean) as { label: string; text: string; color: string }[];
                        if (items.length === 0) return null;
                        return (
                          <div className="mt-1 flex flex-col gap-0.5">
                            {items.map((item) => (
                              <p key={item.label} className={`text-[11px] leading-snug max-w-[200px] whitespace-normal ${item.color}`}>
                                <span className="font-semibold">{item.label}:</span> {item.text}
                              </p>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-2 text-text-secondary">{(customer?.name ?? trip.shipperConsignee) || "—"}</td>
                    <td className="px-4 py-2 text-text-secondary">
                      <span className="text-text-primary">{trip.origin}</span>
                      <span className="mx-1 text-text-tertiary">→</span>
                      <span className="text-text-primary">{trip.destination}</span>
                      {trip.tripCategory && <TripCategoryTag category={trip.tripCategory} className="mt-1 block" />}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{containerRef(trip)}</td>
                    <td className="px-4 py-2 text-text-secondary">
                      <span>{trip.driverName ?? "—"}</span>
                      {trip.driverChangeRemark && (
                        <p className="mt-0.5 text-[11px] text-warning-text leading-snug max-w-[160px] whitespace-normal">
                          Remark: {trip.driverChangeRemark}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{trip.truckRegistration ?? "—"}</td>
                    <td className="px-4 py-2 text-text-secondary">{fmtDate(trip.scheduledDate)}</td>

                    {/* Hire Amount */}
                    <td className="px-4 py-2 font-medium text-accent-text">
                      {hire !== null ? `₹${hire.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : <span className="text-text-tertiary">—</span>}
                    </td>

                    {/* Total Expenses */}
                    <td className="px-4 py-2 font-medium text-text-primary">
                      {expense !== null ? `₹${expense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : <span className="text-text-tertiary">—</span>}
                    </td>

                    {/* P&L: profit is Admin only */}
                    {isAdmin && (
                    <td className="px-4 py-2">
                      {pl !== null ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption-1-semibold ${
                          isProfit
                            ? "bg-success-surface-strong text-success-text"
                            : "bg-danger-surface-strong text-danger-text"
                        }`}>
                          {isProfit ? "▲" : "▼"}
                          ₹{Math.abs(pl).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          <span className="font-normal opacity-70">{isProfit ? "Profit" : "Loss"}</span>
                        </span>
                      ) : trip.status === "Cancelled" ? (
                        <span className="text-caption-1-medium text-danger-text">Trip cancelled</span>
                      ) : (
                        <span className="text-xs text-text-tertiary">No sheet</span>
                      )}
                    </td>
                    )}

                    {!isFleetManager && (
                      <td className="px-4 py-2">
                        {trip.tripCategory === "SHIFTING" ? (
                          <span className="inline-flex items-center rounded-full bg-fill-2 px-2.5 py-1 text-caption-1-medium text-text-secondary">
                            N/A (Shifting)
                          </span>
                        ) : isInvoiced ? (
                          <span className="inline-flex items-center rounded-full bg-success-surface-strong px-2.5 py-1 text-caption-1-medium text-success-text">
                            Invoiced
                          </span>
                        ) : isWaived ? (
                          <span
                            className="inline-flex items-center rounded-full bg-purple-surface-strong px-2.5 py-1 text-caption-1-medium text-purple-text"
                            title={trip.paymentType === "To Be Paid" ? "Automatically waived — payment type is To Be Paid" : undefined}
                          >
                            {trip.paymentType === "To Be Paid" ? "To Be Paid" : "Waived"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-fill-2 px-2.5 py-1 text-caption-1-medium text-text-secondary">
                            Not Invoiced
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeleteRequestTrip(trip)}
                          className="mb-1.5 flex items-center gap-1 rounded-lg border border-danger-border bg-danger-surface px-2.5 py-1 text-caption-1-semibold text-danger-text hover:bg-danger-surface-strong transition-colors"
                          title="Delete this trip and all its data"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      )}
                      {!isAdmin && !isAuditor && (
                        <button
                          type="button"
                          onClick={() => setDeleteRequestTrip(trip)}
                          className="mb-1.5 flex items-center gap-1 rounded-lg border border-warning-border bg-warning-surface px-2.5 py-1 text-caption-1-semibold text-warning-text hover:bg-warning-surface-strong transition-colors"
                          title="Request Admin to delete this trip"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Request Delete
                        </button>
                      )}
                      {!closures.has(trip.id) && trip.status === "Cancelled" ? (
                        <span className="text-xs text-text-tertiary">No documents (cancelled)</span>
                      ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {/* Booking Sheet — always available (hasClosure is required to appear here) */}
                        <button
                          type="button"
                          onClick={() => setBookingTrip(trip)}
                          className="flex items-center gap-1.5 rounded-lg border border-accent-border-strong bg-accent-surface px-2.5 py-1.5 text-caption-1-semibold text-accent-text hover:bg-accent-surface-strong transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Booking Sheet
                        </button>

                        {/* Trip Sheet — only if sheet exists. In the Completed filter, only
                            Auditor gets this button; every other filter is unaffected. */}
                        {(isAuditor || statusFilter !== "Completed") && (
                          <button
                            type="button"
                            onClick={() => setSheetTrip(trip)}
                            disabled={!hasSheet}
                            className="flex items-center gap-1.5 rounded-lg border border-purple-border-strong bg-purple-surface px-2.5 py-1.5 text-caption-1-semibold text-purple-text hover:bg-purple-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={hasSheet ? undefined : "No trip sheet recorded for this trip"}
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            Trip Sheet
                          </button>
                        )}

                        {/* Invoice — only if generated and role is not Fleet Manager */}
                        {isInvoiced && !isFleetManager && (
                          <button
                            type="button"
                            onClick={() => handleViewInvoice(trip)}
                            className="flex items-center gap-1.5 rounded-lg border border-success-border-strong bg-success-surface px-2.5 py-1.5 text-caption-1-semibold text-success-text hover:bg-success-surface-strong transition-colors"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            View Invoice
                          </button>
                        )}

                        {/* Combined Invoice — only when this trip's invoice was generated together with others */}
                        {isInvoiced && !isFleetManager && trip.isCombinedInvoice && (
                          <button
                            type="button"
                            onClick={() => handleViewCombinedInvoice(trip)}
                            className="flex items-center gap-1.5 rounded-lg border border-purple-border-strong bg-purple-surface px-2.5 py-1.5 text-caption-1-semibold text-purple-text hover:bg-purple-surface-strong transition-colors"
                          >
                            <Layers className="h-3.5 w-3.5" />
                            View Combined Invoice
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-xl border border-separator-border bg-background-primary-default px-4 py-3">
            <p className="text-sm text-text-secondary">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredTrips.length)} of {filteredTrips.length} trips
            </p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed">
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                .reduce<(number | "...")[]>((acc, n, i, arr) => { if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("..."); acc.push(n); return acc; }, [])
                .map((item, i) => item === "..." ? (
                  <span key={`e${i}`} className="px-2 text-xs text-text-tertiary">…</span>
                ) : (
                  <button key={item} type="button" onClick={() => setPage(item as number)}
                    className={`rounded-lg px-3 py-1.5 text-caption-1-medium transition-colors ${safePage === item ? "bg-accent-solid text-on-solid" : "border border-separator-border text-text-secondary hover:bg-fill-2"}`}>
                    {item}
                  </button>
                ))}
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed">
                Next
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Booking Sheet — read-only for non-admin, editable for admin */}
      <BookingSheetDialog
        open={bookingTrip !== null}
        trip={bookingTrip}
        closure={bookingTrip ? closures.get(bookingTrip.id) : undefined}
        driver={bookingTrip ? driverById.get(bookingTrip.driverId) : undefined}
        truck={bookingTrip ? truckById.get(bookingTrip.vehicleId) : undefined}
        customers={customers}
        readOnly={!isAdmin}
        onClose={() => setBookingTrip(null)}
        onSubmit={async (data) => {
          if (!bookingTrip) return;
          try {
            const updated = await tripsApi.close(bookingTrip.id, data);
            setClosures((prev) => new Map(prev).set(bookingTrip.id, updated));
            setBookingTrip(null);
            showSuccess("Booking sheet updated.");
          } catch (err: unknown) {
            showError(err instanceof Error ? err.message : "Failed to update booking sheet.");
          }
        }}
      />

      {/* Trip Sheet — read-only for non-admin, editable for admin */}
      <TripSheetDialog
        open={sheetTrip !== null}
        trip={sheetTrip}
        closure={sheetTrip ? closures.get(sheetTrip.id) : undefined}
        existingSheet={sheetTrip ? sheets.get(sheetTrip.id) : undefined}
        readOnly={!isAdmin}
        drivers={drivers}
        trucks={trucks}
        onClose={() => setSheetTrip(null)}
        onSubmit={async (data) => {
          if (!sheetTrip) return;
          try {
            const updated = await tripsApi.upsertSheet(sheetTrip.id, data);
            setSheets((prev) => new Map(prev).set(sheetTrip.id, updated));
            setSheetTrip(null);
            showSuccess("Trip sheet updated.");
          } catch (err: unknown) {
            showError(err instanceof Error ? err.message : "Failed to update trip sheet.");
          }
        }}
      />

      {/* Delete request dialog — direct delete-with-reason for Admin, approval request for everyone else */}
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

      {bulkDeleteOpen && (
        <EditRequestDialog
          open={bulkDeleteOpen}
          resourceType="Trip"
          resourceName={`${selected.size} selected trip${selected.size > 1 ? "s" : ""}`}
          action="Delete"
          directAction
          onSubmit={handleBulkDeleteSubmit}
          onClose={() => setBulkDeleteOpen(false)}
        />
      )}

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

      <CombinedInvoicePreviewDialog
        open={combinePreview !== null}
        trips={combinePreview?.trips ?? []}
        closures={closures}
        sheets={sheets}
        customer={combinePreview?.trips[0] ? customerById.get(combinePreview.trips[0].customerId) : undefined}
        rawInvoices={combineRawInvoices}
        onClose={() => setCombinePreview(null)}
      />

      {/* Edit History — every Booking/Trip Sheet/Closure/Verification save ever
          logged, across every trip (not just the ones currently on this page),
          in one searchable log instead of having to open each trip individually.
          Searching by a specific Trip ID doubles as that trip's own history. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by trip ID, driver, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.tripIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.driverName?.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "logistics" : "not-found"} title={editHistoryEvents.length === 0 ? "No trip edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Trip</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-text-primary">{ev.tripIdStr}</p>
                            {ev.driverName && <p className="text-[11px] text-text-tertiary">{ev.driverName}</p>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    }}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
