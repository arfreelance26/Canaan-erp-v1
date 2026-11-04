"use client";

import { useEffect, useRef, useState } from "react";
import { tripsApi, customersApi, deletionApprovalsApi, type TripEditEventRow } from "@/lib/api";
import { useGlobalSearchQuery, containerRef } from "@/lib/trip-search";
import { mapLimit } from "@/lib/async-pool";
import type { Trip } from "@/types/trip";
import type { Customer } from "@/types/customer";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { RiEyeLine as Eye, RiCheckboxCircleLine as CheckCircle2, RiCheckboxBlankCircleLine as Circle, RiDownloadLine as Download, RiThumbUpLine as ThumbsUp, RiThumbDownLine as ThumbsDown, RiAlertLine as AlertTriangle, RiArrowRightCircleLine as ArrowRightCircle, RiInboxLine as Inbox, RiFileList3Line as ClipboardList, RiCloseLine as X, RiDeleteBinLine as Trash2, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil, RiCloseCircleLine as XCircle, RiArrowGoBackLine as RotateCcw } from "@remixicon/react";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { stageRowClass, type StageColor } from "@/lib/stage-colors";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/feedback";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PillSearch } from "@/components/ui/PillSearch";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
import { GlassSelect } from "@/components/ui/GlassSelect";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const EditRequestDialog = dynamic(() => import("@/components/attendance/EditRequestDialog").then((m) => m.EditRequestDialog));
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

function fmtIST(iso: string) {
  // MySQL returns datetime without timezone marker — append Z to force UTC parsing
  const utc = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
  const formatted = new Date(utc).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(/\//g, "-");
  return `${formatted} (GMT+05:30)`;
}

export default function SheetCollectionPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [trips, setTrips] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Delivered" | "Overdue">("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  // Date range (Delivered On) — scopes the PDF export only. Defaults to today.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TripEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tripsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }
  const [modalStatusFilter, setModalStatusFilter] = useState<"All" | "Pending" | "Delivered" | "Overdue">("All");
  // Advance verification panel state
  const [advanceOpen, setAdvanceOpen] = useState<string | null>(null); // trip.id
  const [advanceRemark, setAdvanceRemark] = useState("");
  const [advanceCorrected, setAdvanceCorrected] = useState("");
  const [deleteRequestTrip, setDeleteRequestTrip] = useState<Trip | null>(null);

  // Guards against out-of-order responses. A load that started before a save
  // (Verify / Mark Delivered / …) carries pre-save data; applying it would make
  // the row snap back to its old state. loadSeq drops loads superseded by a
  // newer one; writeGen drops loads that a save landed in the middle of.
  const loadSeq = useRef(0);
  const writeGen = useRef(0);
  function noteWrite() {
    writeGen.current++;
  }

  function loadData() {
    const seq = ++loadSeq.current;
    const gen = writeGen.current;
    return tripsApi.list("Completed", { hasClosure: true }).then(
      (list) => {
        if (seq !== loadSeq.current) return;
        if (gen !== writeGen.current) {
          setRefreshKey((k) => k + 1); // stale — fetch again after the save
          return;
        }
        setTrips(list.filter((trip) => trip.hasClosure === true));
        // Keep selections that are still pending; refreshes no longer wipe them.
        setSelected((prev) => {
          const pendingIds = new Set(list.filter((t) => !t.tripSheetCollected).map((t) => t.id));
          const next = new Set([...prev].filter((id) => pendingIds.has(id)));
          return next.size === prev.size ? prev : next;
        });
      },
      () => {
        if (seq !== loadSeq.current) return;
        showError("Couldn't refresh Trips — showing last known data.");
      },
    );
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [refreshKey]);

  // Customers are only used for names in the report/PDF, so they're loaded
  // once rather than on every refresh tick.
  useEffect(() => {
    customersApi.list().then(setCustomers).catch(() => {});
  }, []);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 10000);

  useWebSocketEvent("sheet_collected", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_unmarked", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_entered", () => setRefreshKey(k => k + 1));

  const customerById = new Map(customers.map((c) => [c.id, c]));

  const filtered = trips.filter((t) => {

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.tripId?.toLowerCase().includes(q) ||
      t.bookingReferenceNo?.toLowerCase().includes(q) ||
      t.vehicleId?.toLowerCase().includes(q) ||
      (t.truckRegistration ?? "").toLowerCase().includes(q) ||
      (t.driverName ?? "").toLowerCase().includes(q) ||
      (t.containerNumber ?? "").toLowerCase().includes(q) ||
      (t.containerNumber1 ?? "").toLowerCase().includes(q) ||
      (t.containerNumber2 ?? "").toLowerCase().includes(q) ||
      (t.cargoReference ?? "").toLowerCase().includes(q)
    );
  });

  // Stat counts always reflect all trips — unaffected by search or status filter
  const collected = trips.filter((t) => t.tripSheetCollected);
  const pending = trips.filter((t) => !t.tripSheetCollected);

  const [overdueIds, setOverdueIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    setOverdueIds(new Set(
      trips
        .filter((t) => {
          if (!t.tripSheetReceived || t.hasSheet) return false;
          if (!t.tripSheetReceivedAt) return false;
          const utc = t.tripSheetReceivedAt.endsWith("Z") || t.tripSheetReceivedAt.includes("+")
            ? t.tripSheetReceivedAt
            : t.tripSheetReceivedAt + "Z";
          return now - new Date(utc).getTime() > oneDayMs;
        })
        .map((t) => t.id)
    ));
  }, [trips]);

  const fromMs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
  const toMs   = dateTo   ? new Date(dateTo).setHours(23, 59, 59, 999) : null;

  // Note: the date range (from/to) intentionally does NOT filter the table —
  // it only scopes the "Download PDF" export below.
  const tableTrips = filtered.filter((t) => {
    if (statusFilter === "Pending" && t.tripSheetCollected) return false;
    if (statusFilter === "Delivered" && !t.tripSheetCollected) return false;
    if (statusFilter === "Overdue" && !overdueIds.has(t.id)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(tableTrips.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedTrips = tableTrips.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // A trip is deliverable only once its driver advance has been verified
  // (Correct/Mismatch). Trips with no advance (₹0) have nothing to verify.
  const advanceOk = (t: Trip) =>
    Number(t.driverAdvance || 0) <= 0 || t.advanceVerified === true || t.advanceVerified === false;
  const selectableIds = tableTrips.filter((t) => !t.tripSheetCollected && !t.hasSheet && advanceOk(t)).map((t) => t.id);
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
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleToggleCollect(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      const updated = await tripsApi.collectSheet(trip.id, !trip.tripSheetCollected);
      noteWrite();
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

  async function handleFlagSheetMissing(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      const updated = await tripsApi.flagSheetMissing(trip.id);
      noteWrite();
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
      showSuccess(`Alert sent — Admin and Commercial Manager notified for trip ${trip.tripId}.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to send alert.");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  }

  async function handleDeleteSubmit(trip: Trip, reason: string) {
    try {
      if (isAdmin) {
        await tripsApi.remove(trip.id, reason);
        noteWrite();
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

  async function handleBulkCollect() {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    const targets = filtered.filter((t) => selected.has(t.id) && !t.tripSheetCollected && advanceOk(t));
    let successCount = 0;
    const errors: string[] = [];
    // Capped at 4 concurrent writes so a large selection doesn't burst the DB pool.
    await mapLimit(targets, 4, async (trip) => {
      try {
        const updated = await tripsApi.collectSheet(trip.id, true);
        noteWrite();
        setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
        successCount++;
      } catch {
        errors.push(trip.tripId);
      }
    });
    setSelected(new Set());
    setBulkBusy(false);
    if (errors.length === 0) {
      showSuccess(`${successCount} trip sheet${successCount > 1 ? "s" : ""} marked as delivered.`);
    } else {
      showError(`${successCount} succeeded, ${errors.length} failed: ${errors.join(", ")}`);
    }
  }

  async function handleVerifyAdvance(trip: Trip, verified: boolean) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      const remark = advanceRemark.trim();
      const corrected = advanceCorrected ? parseFloat(advanceCorrected) : null;
      const updated = await tripsApi.verifyAdvance(trip.id, verified, remark, corrected);
      noteWrite();
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
      setAdvanceOpen(null);
      setAdvanceRemark("");
      setAdvanceCorrected("");
      showSuccess(verified ? `Advance verified as correct for ${trip.tripId}.` : `Advance mismatch recorded for ${trip.tripId}.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save advance verification.");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  }

  async function handleDownloadPDF(pdfTrips: Trip[]) {
    if (downloading || pdfTrips.length === 0) return;

    if (pdfTrips.length === 0) {
      showError("No delivered trips match the selected date range.");
      return;
    }

    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();   // 297mm landscape
      const pageH = pdf.internal.pageSize.getHeight();  // 210mm landscape
      const marginX = 10;
      const marginY = 14;
      const rowH = 8;
      const headerH = 9;

      // Column definitions: [label, width]
      const cols: [string, number][] = [
        ["Trip ID",      26],
        ["Booking Ref",  40],
        ["Trip Date",    22],
        ["Vehicle",      26],
        ["Customer",     34],
        ["Route",        40],
        ["Container No", 30],
        ["Driver",       32],
        ["Delivered On", 27],
      ];

      function drawPageHeader(pageNum: number, totalPages: number) {
        // Title
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(27, 43, 94);
        pdf.text("Trip Sheet Collection Report", marginX, marginY);

        // Subtitle
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(
          `Generated on ${today}  ·  ${pdfTrips.length} sheet${pdfTrips.length !== 1 ? "s" : ""} delivered${dateFrom || dateTo ? ` · ${dateFrom || "start"} to ${dateTo || "today"}` : ""}`,
          marginX, marginY + 5,
        );

        // Page number
        pdf.text(`Page ${pageNum} of ${totalPages}`, pageW - marginX, marginY + 5, { align: "right" });

        // Table header background
        const tableTop = marginY + 10;
        pdf.setFillColor(27, 43, 94);
        pdf.rect(marginX, tableTop, pageW - marginX * 2, headerH, "F");

        // Header labels
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        let x = marginX;
        for (const [label, w] of cols) {
          pdf.text(label.toUpperCase(), x + 2, tableTop + 6);
          x += w;
        }

        return tableTop + headerH; // y position after header
      }

      // Pre-build row data
      const rowData = pdfTrips.map((trip) => {
        const customer = customerById.get(trip.customerId);
        const deliveredOn = trip.tripSheetCollectedAt
          ? (() => {
              const utc = trip.tripSheetCollectedAt.endsWith("Z") || trip.tripSheetCollectedAt.includes("+")
                ? trip.tripSheetCollectedAt : trip.tripSheetCollectedAt + "Z";
              return new Date(utc).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
            })()
          : "—";
        return [
          trip.tripId,
          trip.bookingReferenceNo,
          formatDate(trip.scheduledDate) || "—",
          trip.truckRegistration ?? trip.vehicleId ?? "—",
          customer?.name ?? trip.shipperConsignee ?? "—",
          `${trip.origin} > ${trip.destination}`,
          containerRef(trip),
          trip.driverName ?? "—",
          deliveredOn,
        ];
      });

      // Calculate total pages needed
      const usableH = pageH - marginY - 20; // space below header block
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
          // Alternating row background
          if (r % 2 === 1) {
            pdf.setFillColor(249, 250, 251);
            pdf.rect(marginX, rowY, pageW - marginX * 2, rowH, "F");
          }
          // Row bottom border
          pdf.setDrawColor(229, 231, 235);
          pdf.line(marginX, rowY + rowH, pageW - marginX, rowY + rowH);

          // Cell text
          pdf.setTextColor(30, 30, 30);
          let x = marginX;
          for (let c = 0; c < cols.length; c++) {
            const [, w] = cols[c];
            const text = String(pageRows[r][c] ?? "—");
            // Clip text to column width
            const clipped = pdf.splitTextToSize(text, w - 4)[0] ?? text;
            pdf.text(clipped, x + 2, rowY + 5.5);
            x += w;
          }
        }

        // Outer border around table
        const tableBodyH = pageRows.length * rowH;
        pdf.setDrawColor(209, 213, 219);
        pdf.rect(marginX, y, pageW - marginX * 2, tableBodyH, "S");
      }

      pdf.save(`trip-sheet-collection-${today.replace(/ /g, "-")}.pdf`);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={8} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning-border bg-warning-surface text-warning-text shadow-sm">
            <Inbox className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Trip Sheet Collection</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Mark trip sheets as delivered from drivers before reconciliation
            </p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>
      {/* Toolbar: search + status on the left, delivered-on range + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by truck no., driver, trip ID…" value={searchQuery} onChange={setSearchQuery} />
        <div className="relative shrink-0 transition-transform duration-300">
          <GlassSelect
            variant="pill"
            aria-label="Sheet status"
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}
            options={[
              { value: "All", label: "All Sheets" },
              { value: "Pending", label: "Pending" },
              { value: "Delivered", label: "Delivered" },
              { value: "Overdue", label: "Entry Overdue" },
            ]}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Scopes the View / PDF report to sheets delivered inside this range (it does not filter the table) */}
          <div title="Delivered On — scopes the report to sheets delivered in this range">
            <DateRangePill
              from={dateFrom}
              to={dateTo}
              onFromChange={(v) => { setDateFrom(v); setPage(1); }}
              onToChange={(v) => { setDateTo(v); setPage(1); }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            disabled={collected.length === 0}
            title={collected.length === 0 ? "No delivered sheets to export" : "View and download delivered sheets"}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            View
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div data-tour="sheet-stats" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => { setStatusFilter("All"); setPage(1); }}
          className={`rounded-xl border px-5 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-accent-border-strong ${statusFilter === "All" ? "border-accent-border-strong bg-accent-surface ring-2 ring-accent-border-strong" : "border-separator-border bg-background-primary-default hover:border-accent-border-strong hover:bg-accent-surface-strong/40"}`}
        >
          <p className="text-caption-1-semibold text-text-tertiary">Total Closed</p>
          <p className="mt-1 text-title-1-semibold text-text-primary">{trips.length}</p>
        </button>
        <button
          type="button"
          onClick={() => { setStatusFilter("Delivered"); setPage(1); }}
          className={`rounded-xl border px-5 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-success-border-strong ${statusFilter === "Delivered" ? "border-success-border-strong bg-success-surface-strong ring-2 ring-success-border-strong" : "border-success-border bg-success-surface hover:border-success-border-strong hover:bg-success-surface-strong/70"}`}
        >
          <p className="text-caption-1-semibold text-success-text">Sheets Delivered</p>
          <p className="mt-1 text-title-1-semibold text-success-text">{collected.length}</p>
        </button>
        <button
          type="button"
          onClick={() => { setStatusFilter("Pending"); setPage(1); }}
          className={`rounded-xl border px-5 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-warning-border-strong ${statusFilter === "Pending" ? "border-warning-border-strong bg-warning-surface-strong ring-2 ring-warning-border-strong" : "border-warning-border bg-warning-surface hover:border-warning-border-strong hover:bg-warning-surface-strong/70"}`}
        >
          <p className="text-caption-1-semibold text-warning-text">Pending Delivery</p>
          <p className="mt-1 text-title-1-semibold text-warning-text">{pending.length}</p>
        </button>
        <button
          type="button"
          onClick={() => { setStatusFilter("Overdue"); setPage(1); }}
          className={`rounded-xl border px-5 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-danger-border-strong ${statusFilter === "Overdue" ? "border-danger-border-strong bg-danger-surface-strong ring-2 ring-danger-border-strong" : overdueIds.size > 0 ? "border-danger-border bg-danger-surface hover:border-danger-border-strong hover:bg-danger-surface-strong/70" : "border-separator-border bg-background-primary-default opacity-60 cursor-default"}`}
          disabled={overdueIds.size === 0}
        >
          <div className="flex items-center gap-1.5">
            {overdueIds.size > 0 && <AlertTriangle className="h-3.5 w-3.5 text-danger-text" />}
            <p className="text-caption-1-semibold text-danger-text">Entry Overdue</p>
          </div>
          <p className="mt-1 text-title-1-semibold text-danger-text">{overdueIds.size}</p>
          <p className="mt-0.5 text-[11px] text-danger-text">Received &gt; 1 day, not entered</p>
        </button>
      </div>

      {/* Workflow legend */}
      <div data-tour="sheet-workflow" className="flex flex-wrap items-center gap-3 rounded-xl border border-separator-border bg-fill-1 px-4 py-2.5 text-xs text-text-secondary">
        <span className="font-semibold text-text-secondary">Workflow:</span>
        <span className="flex items-center gap-1"><Circle className="h-3.5 w-3.5 text-warning-text" /> Trip closed → pending sheet delivery</span>
        <span className="text-text-tertiary">›</span>
        <span className="flex items-center gap-1"><ArrowRightCircle className="h-3.5 w-3.5 text-success-text" /> Yard marks sheet delivered to Docs</span>
        <span className="text-text-tertiary">›</span>
        <span className="flex items-center gap-1"><Inbox className="h-3.5 w-3.5 text-accent-text" /> Docs receive sheet</span>
        <span className="text-text-tertiary">›</span>
        <span className="flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5 text-purple-text" /> Sheet entered in Reconciliation</span>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center justify-between rounded-xl border border-accent-border bg-accent-surface px-4 py-3">
          <span className="text-body-medium text-accent-text-strong">
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
              disabled={bulkBusy}
              onClick={handleBulkCollect}
              className="rounded-lg bg-success-solid px-3 py-1.5 text-caption-1-semibold text-on-solid hover:bg-success-solid-hover disabled:opacity-50"
            >
              {bulkBusy ? "Marking..." : `Mark ${selected.size} as Delivered`}
            </button>
          </div>
        </div>
      )}

      {tableTrips.length === 0 ? (
        <EmptyState size="compact" illustration="logistics" title="No completed trips found" />
      ) : (
        <>
          <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default">
            <table className="w-full min-w-[1100px] text-left text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-border-button-default accent-success-solid"
                      title="Select all pending"
                    />
                  </th>
                  {["Action", "Vehicle", "Trip Date", "Advance Paid", "Driver", "Container No", "From → To", "Shipper / Consignee", "Status", "Trip ID", "Booking Ref", "Delivered On", "Sheet Status", "Delete"].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-caption-1-semibold text-text-secondary"
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {paginatedTrips.map((trip) => {
                  const isCollected = trip.tripSheetCollected;
                  const isBusy = toggling.has(trip.id);
                  const isChecked = selected.has(trip.id);
                  const sheetSubmitted = trip.hasSheet;
                  const isOverdue = overdueIds.has(trip.id);
                  // Stage tint matches the filter cards: Overdue→rose, Delivered→emerald, Pending→amber.
                  const stageColor: StageColor = isOverdue ? "rose" : isCollected ? "emerald" : "amber";

                  return (
                    <tr
                      key={trip.id}
                      className={isChecked ? "border-l-4 border-l-accent-border-strong bg-accent-surface/60" : stageRowClass(stageColor)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!isCollected && !advanceOk(trip)}
                          title={!isCollected && !advanceOk(trip) ? "Verify the driver advance before marking as delivered" : undefined}
                          onChange={() => toggleRow(trip.id)}
                          className="h-4 w-4 rounded border-border-button-default accent-success-solid disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </td>
                      {/* Action — col 1 */}
                      <td className="px-4 py-3">
                        {isCollected && sheetSubmitted ? (
                          <span
                            title="Trip sheet already submitted in reconciliation — cannot undo delivery"
                            className="inline-block rounded-lg border border-separator-border bg-fill-1 px-3 py-1.5 text-caption-1-semibold text-text-tertiary cursor-not-allowed"
                          >
                            Locked
                          </span>
                        ) : (() => {
                          // Mark Delivered is enabled only once the driver advance has been
                          // verified (Correct or Mismatch). Trips with no advance (₹0) have
                          // nothing to verify, so they are allowed through. Undo (when already
                          // collected) is never blocked.
                          const advanceReviewed = trip.advanceVerified === true || trip.advanceVerified === false;
                          const needsAdvanceVerify = !isCollected && Number(trip.driverAdvance || 0) > 0 && !advanceReviewed;
                          return (
                            <button
                              type="button"
                              disabled={isBusy || needsAdvanceVerify}
                              title={needsAdvanceVerify ? "Verify the driver advance before marking as delivered" : undefined}
                              onClick={() => handleToggleCollect(trip)}
                              className={
                                isCollected
                                  ? "rounded-lg border border-border-button-default px-3 py-1.5 text-caption-1-semibold text-text-secondary hover:bg-fill-3 disabled:opacity-50"
                                  : "rounded-lg bg-success-solid px-3 py-1.5 text-caption-1-semibold text-on-solid hover:bg-success-solid-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              }
                            >
                              {isBusy ? "..." : isCollected ? "Undo" : "Mark Delivered"}
                            </button>
                          );
                        })()}
                      </td>

                      {/* Vehicle — col 2 */}
                      <td className="px-4 py-3 font-medium text-text-primary">{trip.truckRegistration ?? trip.vehicleId ?? "—"}</td>

                      {/* Trip Date — col 3 */}
                      <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(trip.scheduledDate) || "—"}</td>

                      {/* Advance Paid — col 4 */}
                      <td className="px-4 py-3">
                        {(() => {
                          const advance = Number(trip.driverAdvance || 0);
                          const adv = advance;
                          const advStr = advance > 0 ? `₹${advance.toLocaleString("en-IN")}` : "—";
                          // Editor takes precedence — when the user clicks Change/Edit we open
                          // the verify UI even if the advance was already verified/mismatched.
                          const isEditing = advanceOpen === trip.id || advanceOpen === `${trip.id}_wrong`;
                          if (!isEditing && trip.advanceVerified === true) {
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-caption-1-semibold text-text-primary">{advStr}</span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-success-surface-strong px-2 py-0.5 text-caption-2-semibold text-success-text w-fit">
                                  <ThumbsUp className="h-3 w-3" /> Correct
                                </span>
                                {!isCollected && (
                                  <button type="button" onClick={() => { setAdvanceOpen(trip.id); setAdvanceRemark(""); setAdvanceCorrected(""); }} className="text-[10px] text-text-tertiary hover:text-text-secondary underline">Change</button>
                                )}
                              </div>
                            );
                          }
                          if (!isEditing && trip.advanceVerified === false) {
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-caption-1-semibold text-text-primary">{advStr}</span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-danger-surface-strong px-2 py-0.5 text-caption-2-semibold text-danger-text w-fit">
                                  <ThumbsDown className="h-3 w-3" /> Mismatch
                                </span>
                                {trip.advanceCorrectedAmount && (
                                  <p className="text-[10px] text-danger-text">Correct: ₹{Number(trip.advanceCorrectedAmount).toLocaleString("en-IN")}</p>
                                )}
                                {trip.advanceVerificationRemark && (
                                  <p className="text-[10px] text-text-secondary max-w-[130px] whitespace-normal leading-snug">{trip.advanceVerificationRemark}</p>
                                )}
                                {!isCollected && (
                                  <button type="button" onClick={() => { setAdvanceOpen(trip.id); setAdvanceRemark(trip.advanceVerificationRemark ?? ""); setAdvanceCorrected(trip.advanceCorrectedAmount ?? ""); }} className="text-[10px] text-text-tertiary hover:text-text-secondary underline">Edit</button>
                                )}
                              </div>
                            );
                          }
                          if (isCollected) {
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-caption-1-semibold text-text-primary">{advStr}</span>
                                <span className="text-[10px] text-text-tertiary">Locked after delivery</span>
                              </div>
                            );
                          }
                          if (advanceOpen === trip.id) {
                            return (
                              <div className="flex flex-col gap-1.5 min-w-[160px]">
                                <span className="text-caption-1-semibold text-text-primary">{advStr}</span>
                                <p className="text-[10px] text-text-secondary">Verify advance paid to driver</p>
                                <div className="flex gap-1">
                                  <button type="button" onClick={() => handleVerifyAdvance(trip, true)} className="inline-flex items-center gap-1 rounded-lg bg-success-solid px-2.5 py-1 text-caption-1-semibold text-on-solid hover:bg-success-solid-hover">
                                    <ThumbsUp className="h-3 w-3" /> Correct
                                  </button>
                                  <button type="button" onClick={() => setAdvanceOpen(`${trip.id}_wrong`)} className="inline-flex items-center gap-1 rounded-lg border border-danger-border-strong bg-danger-surface px-2.5 py-1 text-caption-1-semibold text-danger-text hover:bg-danger-surface-strong">
                                    <ThumbsDown className="h-3 w-3" /> Wrong
                                  </button>
                                </div>
                                <button type="button" onClick={() => setAdvanceOpen(null)} className="text-[10px] text-text-tertiary hover:text-text-secondary">Cancel</button>
                              </div>
                            );
                          }
                          if (advanceOpen === `${trip.id}_wrong`) {
                            return (
                              <div className="flex flex-col gap-1 min-w-[160px]">
                                <span className="text-caption-1-semibold text-text-primary">{advStr}</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Correct amount (₹)"
                                  value={advanceCorrected}
                                  onChange={(e) => setAdvanceCorrected(e.target.value)}
                                  className="rounded border border-border-button-default px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-danger-border-strong"
                                />
                                <textarea
                                  rows={2}
                                  placeholder="Remarks (required)"
                                  value={advanceRemark}
                                  onChange={(e) => setAdvanceRemark(e.target.value)}
                                  className="rounded border border-border-button-default px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-danger-border-strong"
                                />
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    disabled={!advanceRemark.trim()}
                                    onClick={() => handleVerifyAdvance(trip, false)}
                                    className="rounded-lg bg-danger-solid px-2.5 py-1 text-caption-1-semibold text-on-solid hover:bg-danger-solid-hover disabled:opacity-40"
                                  >
                                    Save
                                  </button>
                                  <button type="button" onClick={() => { setAdvanceOpen(null); setAdvanceRemark(""); setAdvanceCorrected(""); }} className="rounded-lg border border-border-button-default px-2.5 py-1 text-caption-1-semibold text-text-secondary hover:bg-fill-3">Cancel</button>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-caption-1-semibold text-text-primary">{advStr}</span>
                              <button
                                type="button"
                                disabled={isCollected}
                                onClick={() => { setAdvanceOpen(trip.id); setAdvanceRemark(""); setAdvanceCorrected(""); }}
                                className="inline-flex items-center gap-1 rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-1 text-caption-1-semibold text-text-secondary hover:bg-fill-3 disabled:opacity-40 disabled:cursor-not-allowed w-fit"
                              >
                                Verify
                              </button>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Driver — col 4 */}
                      <td className="px-4 py-3 text-text-primary">
                        <span>{trip.driverName ?? "—"}</span>
                        {trip.driverChangeRemark && (
                          <p className="mt-0.5 text-[11px] text-warning-text leading-snug max-w-[140px] whitespace-normal">
                            Remark: {trip.driverChangeRemark}
                          </p>
                        )}
                      </td>

                      {/* Container No — col 6 */}
                      <td className="px-4 py-3 text-text-secondary font-mono text-xs">
                        {trip.containerSpecification === "2 X 20 FEET CONTAINERS" ? (
                          <span className="flex flex-col gap-0.5">
                            <span>{trip.containerNumber1 || "—"}</span>
                            <span>{trip.containerNumber2 || "—"}</span>
                          </span>
                        ) : (
                          containerRef(trip)
                        )}
                      </td>

                      {/* From → To — col 6 */}
                      <td className="px-4 py-3 text-text-secondary">
                        {trip.origin} <span className="text-text-tertiary">→</span> {trip.destination}
                      </td>

                      {/* Shipper / Consignee — col 7 */}
                      <td className="px-4 py-3 text-text-primary text-xs max-w-[160px] whitespace-normal leading-snug">
                        {trip.shipperConsignee || "—"}
                      </td>

                      {/* Status — col 8 */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {isCollected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-surface-strong px-2.5 py-0.5 text-caption-1-semibold text-success-text">
                              <CheckCircle2 className="h-3 w-3" />
                              Delivered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2.5 py-0.5 text-caption-1-semibold text-warning-text">
                              <Circle className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-danger-surface-strong px-2.5 py-0.5 text-caption-1-semibold text-danger-text">
                              <AlertTriangle className="h-3 w-3" />
                              Entry Overdue
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Trip ID — col 9 */}
                      <td className="px-4 py-3 font-medium text-text-primary">{trip.tripId}</td>

                      {/* Booking Ref — col 10 */}
                      <td className="px-4 py-3 text-text-secondary text-xs">{trip.bookingReferenceNo}</td>

                      {/* Delivered On — col 12 */}
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {trip.tripSheetCollectedAt ? (() => {
                          const utc = trip.tripSheetCollectedAt.endsWith("Z") || trip.tripSheetCollectedAt.includes("+") ? trip.tripSheetCollectedAt : trip.tripSheetCollectedAt + "Z";
                          return new Date(utc).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
                        })() : "—"}
                      </td>

                      {/* Sheet Status — col 13 */}
                      <td className="px-4 py-3">
                        {isCollected || sheetSubmitted ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-surface-strong px-3 py-1.5 text-caption-1-semibold text-success-text cursor-not-allowed">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Sheet Delivered
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleFlagSheetMissing(trip)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-warning-border-strong bg-warning-surface px-3 py-1.5 text-caption-1-semibold text-warning-text hover:bg-warning-surface-strong hover:border-warning-border-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Circle className="h-3.5 w-3.5" />
                            Not Received
                          </button>
                        )}
                      </td>

                      {/* Delete — col 14 */}
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setDeleteRequestTrip(trip)}
                            title="Delete this trip and all its data"
                            className="flex items-center gap-1 rounded-lg border border-danger-border bg-danger-surface px-2.5 py-1 text-caption-1-semibold text-danger-text hover:bg-danger-surface-strong transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteRequestTrip(trip)}
                            title="Request Admin to delete this trip"
                            className="flex items-center gap-1 rounded-lg border border-warning-border bg-warning-surface px-2.5 py-1 text-caption-1-semibold text-warning-text hover:bg-warning-surface-strong transition-colors"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-separator-border bg-background-primary-default px-4 py-3">
              <p className="text-sm text-text-secondary">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, tableTrips.length)} of {tableTrips.length} trips
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                  .reduce<(number | "...")[]>((acc, n, i, arr) => {
                    if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("...");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, i) =>
                    item === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-2 text-xs text-text-tertiary">…</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item as number)}
                        className={`rounded-lg px-3 py-1.5 text-caption-1-medium transition-colors ${
                          safePage === item
                            ? "bg-accent-solid text-on-solid"
                            : "border border-separator-border text-text-secondary hover:bg-fill-2"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

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
        // The range starts empty (every date); either end can be picked alone.
        const rangeLabel = !dateFrom && !dateTo ? "All dates"
          : !dateTo ? `From ${fmtDate(dateFrom)}`
          : !dateFrom ? `Up to ${fmtDate(dateTo)}`
          : dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
        const pdfTrips = trips.filter((t) => {
          if (modalStatusFilter === "Pending" && t.tripSheetCollected) return false;
          if (modalStatusFilter === "Delivered" && !t.tripSheetCollected) return false;
          if (modalStatusFilter === "Overdue" && !overdueIds.has(t.id)) return false;
          // Date filter reference depends on status:
          //  - Delivered sheets  → filter by tripSheetCollectedAt (when the sheet was collected)
          //  - Pending sheets    → filter by scheduledDate (the trip date), since there is no collection date yet
          if (fromMs || toMs) {
            let ms: number | null = null;
            if (t.tripSheetCollected && t.tripSheetCollectedAt) {
              const raw = t.tripSheetCollectedAt.endsWith("Z") || t.tripSheetCollectedAt.includes("+") ? t.tripSheetCollectedAt : t.tripSheetCollectedAt + "Z";
              ms = new Date(raw).getTime();
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
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-scrim/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowReportModal(false); }}>
            <div className="w-full max-w-5xl rounded-xl bg-background-primary-default shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div>
                  <p className="font-semibold text-text-primary">Trip Sheet Collection Report</p>
                  <p className="text-xs text-text-secondary mt-0.5">{rangeLabel} · {pdfTrips.length} sheet{pdfTrips.length !== 1 ? "s" : ""}</p>
                </div>
                <button type="button" onClick={() => setShowReportModal(false)} className="rounded-lg p-1.5 text-text-tertiary hover:bg-fill-3"><X className="h-4 w-4" /></button>
              </div>
              {/* Modal status filter */}
              <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3 shrink-0 bg-fill-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-caption-1-medium text-text-secondary whitespace-nowrap">Status:</span>
                  <GlassSelect
                    size="sm"
                    aria-label="Status"
                    value={modalStatusFilter}
                    onChange={(v) => setModalStatusFilter(v as typeof modalStatusFilter)}
                    options={[
                      { value: "All", label: "All" },
                      { value: "Pending", label: "Pending" },
                      { value: "Delivered", label: "Delivered" },
                      { value: "Overdue", label: "Entry Overdue" },
                    ]}
                    className="w-44"
                  />
                </div>
                {modalStatusFilter !== "All" && (
                  <button type="button" onClick={() => setModalStatusFilter("All")} className="rounded-full border border-border-button-default bg-background-primary-default px-2.5 py-1 text-xs text-text-secondary hover:bg-fill-3">Clear</button>
                )}
              </div>
              <div className="flex-1 overflow-auto px-5 py-4">
                {pdfTrips.length === 0 ? (
                  <EmptyState size="compact" illustration="not-found" title="No delivered sheets match the selected date range" />
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-separator-border bg-fill-1">
                        {["#", "Trip ID", "Booking Ref", "Trip Date", "Vehicle", "Customer", "Route", "Container No", "Driver", "Delivered On"].map((col) => (
                          <th key={col} className="px-3 py-2.5 text-caption-1-semibold text-text-secondary whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-separator-border">
                      {pdfTrips.map((t, i) => {
                        const customer = customerById.get(t.customerId);
                        const deliveredOn = t.tripSheetCollectedAt ? (() => { const raw = t.tripSheetCollectedAt!.endsWith("Z") || t.tripSheetCollectedAt!.includes("+") ? t.tripSheetCollectedAt! : t.tripSheetCollectedAt! + "Z"; return new Date(raw).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-"); })() : "—";
                        return (
                          <tr key={t.id} className="hover:bg-fill-2">
                            <td className="px-3 py-2 text-text-tertiary text-xs">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-text-primary whitespace-nowrap">{t.tripId ?? t.id}</td>
                            <td className="px-3 py-2 text-text-primary whitespace-nowrap">{t.bookingReferenceNo ?? "—"}</td>
                            <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{t.scheduledDate ? new Date(t.scheduledDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—"}</td>
                            <td className="px-3 py-2 text-text-primary whitespace-nowrap">{t.truckRegistration ?? "—"}</td>
                            <td className="px-3 py-2 text-text-primary whitespace-nowrap max-w-[140px] truncate">{customer?.name ?? t.shipperConsignee ?? "—"}</td>
                            <td className="px-3 py-2 text-text-secondary whitespace-nowrap max-w-[140px] truncate">{[t.origin, t.destination].filter(Boolean).join(" → ") || "—"}</td>
                            <td className="px-3 py-2 text-text-primary whitespace-nowrap">{t.containerNumber ?? "—"}</td>
                            <td className="px-3 py-2 text-text-primary whitespace-nowrap">{t.driverName ?? "—"}</td>
                            <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{deliveredOn}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="border-t px-5 py-3 flex items-center justify-end shrink-0">
                <button type="button" onClick={async () => { await handleDownloadPDF(pdfTrips); setShowReportModal(false); }} disabled={downloading || pdfTrips.length === 0} className="flex items-center gap-2 rounded-lg bg-accent-solid px-4 py-2 text-body-semibold text-on-solid hover:bg-accent-solid-hover disabled:opacity-50 disabled:cursor-not-allowed">
                  <Download className="h-4 w-4" />
                  {downloading ? "Generating..." : "Download PDF"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit History — every Create/Edit/Sheet/Close/Verify/Delete/Restore
          ever logged, across every trip, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by trip ID, driver, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.tripIdStr.toLowerCase().includes(q) ||
              (ev.driverName ?? "").toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
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
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            {ev.tripIdStr}
                            {ev.driverName && <span className="text-caption-2-regular text-text-tertiary"> ({ev.driverName})</span>}
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
