"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, trucksApi, customersApi, editApprovalsApi } from "@/lib/api";
import { useGlobalSearchQuery, containerRef } from "@/lib/trip-search";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import type { EditApprovalResourceType, EditApprovalRequest } from "@/types/edit-approval";
import { n } from "@/types/trip-sheet";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search, CheckCircle2, Download, Flag, Inbox, ClipboardList, AlertTriangle } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";

type DialogMode = "add" | "view" | "edit";

export default function TripReconciliationPage() {
  const { user } = useAuth();
  const isStaff = user?.softwareDesignation === "Trip Sheet Register";
  const isAdmin = user?.softwareDesignation === "Admin";
  const { pushSheetAlert } = useNotifications();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Local cache: tripId -> closure data and sheet data
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());

  // Trip Sheet dialog
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>("add");

  // Booking Sheet dialog
  const [bookingSheetTrip, setBookingSheetTrip] = useState<Trip | null>(null);
  const [bookingSheetReadOnly, setBookingSheetReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending Receive" | "Pending Sheet Entry" | "Sheet Entered" | "Flagged" | "Rejected">("All");
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [recheckOpen, setRecheckOpen] = useState<string | null>(null); // trip.id
  const [recheckRemark, setRecheckRemark] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Edit approval state (Staff only)
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingEditAction, setPendingEditAction] = useState<{
    resourceType: EditApprovalResourceType;
    trip: Trip;
    rejectionContext?: string;
  } | null>(null);
  const [myActiveApprovals, setMyActiveApprovals] = useState<EditApprovalRequest[]>([]);
  const [resubmitting, setResubmitting] = useState<Set<string>>(new Set());

  async function loadReconciliationData() {
    let t: Trip[], d: Driver[], tr: Truck[], c: Customer[];
    try {
      [t, d, tr, c] = await Promise.all([
        tripsApi.list("Completed"),
        driversApi.list(),
        trucksApi.list(),
        customersApi.list(),
      ]);
    } catch {
      return;
    }
    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);

    // All delivered trips — closure is guaranteed by the sheet-collection step (hasClosure gate)
    const deliveredTrips = t.filter((trip) => trip.tripSheetCollected === true);
    setTrips(deliveredTrips);

    const closureResults = await Promise.all(
      deliveredTrips.map((trip) =>
        tripsApi.getClosure(trip.id).then((closure) => ({ tripId: trip.id, closure })).catch(() => null)
      )
    );
    const closureMap = new Map<string, TripClosureData>();
    for (const result of closureResults) {
      if (result) closureMap.set(result.tripId, result.closure);
    }
    setClosures(closureMap);

    // Fetch sheets for all delivered trips, not just those with closures
    const sheetResults = await Promise.all(
      deliveredTrips.map((trip) =>
        trip.hasSheet
          ? tripsApi.getSheet(trip.id).then((sheet) => ({ tripId: trip.id, sheet })).catch(() => null)
          : Promise.resolve(null)
      )
    );
    const sheetMap = new Map<string, TripSheetData>();
    for (const result of sheetResults) {
      if (result && result.sheet) sheetMap.set(result.tripId, result.sheet);
    }
    setSheets(sheetMap);
  }

  useEffect(() => {
    loadReconciliationData().finally(() => setLoading(false));
    editApprovalsApi.getMyActive().then(setMyActiveApprovals).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("sheet_collected", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_unmarked", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_received", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_updated", () => {
    editApprovalsApi.getMyActive().then(setMyActiveApprovals).catch(() => {});
  });

  // Admin alert: someone in reconciliation reported a missing physical sheet
  useWebSocketEvent("sheet_not_received_alert", (payload) => {
    const isAdminOrManager =
      user?.softwareDesignation === "Admin" ||
      user?.softwareDesignation === "Commercial Manager" ||
      user?.softwareDesignation === "Assistant Commercial Manager" ||
      user?.softwareDesignation === "Accounts";
    if (!isAdminOrManager) return;
    const p = payload as { trip_id_str?: string; booking_reference_no?: string; reported_by?: string };
    showError(
      `⚠️ Trip Sheet Not Received\n\nTrip ${p.trip_id_str ?? ""} (${p.booking_reference_no ?? ""}) was marked as delivered by the Yard Supervisor but was NOT received in reconciliation.\n\nReported by: ${p.reported_by ?? "Unknown"}`
    );
    setRefreshKey(k => k + 1);
  });


  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  function hasTripSheetApproval(trip: Trip): boolean {
    return myActiveApprovals.some(
      (a) => a.resourceType === "TripSheet" && String(a.resourceId) === trip.id,
    );
  }

  function openDialog(trip: Trip, mode: DialogMode) {
    if (mode === "edit" && isStaff) {
      // Rejected trip with active approval from Kumar — allow editing directly
      if (trip.verificationStatus === "rejected" && hasTripSheetApproval(trip)) {
        setSelectedTrip(trip);
        setDialogMode("edit");
        return;
      }
      setPendingEditAction({ resourceType: "TripSheet", trip });
      setEditRequestOpen(true);
      return;
    }
    setSelectedTrip(trip);
    setDialogMode(mode);
  }

  function openBookingSheet(trip: Trip, readOnly: boolean) {
    // Staff can never edit directly — always raises a request; admin acts on it
    if (!readOnly && isStaff) {
      setPendingEditAction({ resourceType: "BookingSheet", trip });
      setEditRequestOpen(true);
      return;
    }
    setBookingSheetTrip(trip);
    setBookingSheetReadOnly(readOnly);
  }

  async function handleEditRequestSubmit(reason: string) {
    if (!pendingEditAction) return;
    const { resourceType, trip, rejectionContext } = pendingEditAction;
    const resourceName = trip.bookingReferenceNo || trip.tripId;
    const fullReason = rejectionContext
      ? `[Accounts Rejection Reason: ${rejectionContext}]\n\nDocs Request: ${reason}`
      : reason;
    await editApprovalsApi.create({
      resourceType,
      resourceId: parseInt(trip.id),
      resourceName,
      action: "Edit",
      reason: fullReason,
    });
    showSuccess("Edit request has been sent to Kumar (Commercial Manager) for approval.");
    setEditRequestOpen(false);
    setPendingEditAction(null);
  }

  async function handleResubmitVerification(trip: Trip) {
    if (resubmitting.has(trip.id)) return;
    setResubmitting((prev) => new Set([...prev, trip.id]));
    try {
      const updated = await tripsApi.resubmitVerification(trip.id);
      setTrips((prev) => prev.map((t) => t.id === trip.id ? updated : t));
      showSuccess(`Trip ${trip.tripId} re-submitted for Accounts verification.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to re-submit trip.");
    } finally {
      setResubmitting((prev) => { const s = new Set(prev); s.delete(trip.id); return s; });
    }
  }

  async function handleSubmitSheet(data: TripSheetData) {
    if (!selectedTrip) return;
    try {
      const saved = await tripsApi.upsertSheet(selectedTrip.id, data);
      setSheets((prev) => new Map([...prev, [selectedTrip.id, saved]]));
      setSelectedTrip(null);
      showSuccess("Trip sheet saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save trip sheet.");
    }
  }

  async function handleBookingSheetSubmit(data: TripClosureData) {
    if (!bookingSheetTrip) return;
    try {
      const updated = await tripsApi.close(bookingSheetTrip.id, data);
      setClosures((prev) => new Map([...prev, [bookingSheetTrip.id, updated]]));
      setBookingSheetTrip(null);
      showSuccess("Booking sheet saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save booking sheet.");
    }
  }

  async function handleMarkNotReceived(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      await tripsApi.unmarkSheet(trip.id);
      setTrips((prev) => prev.filter((t) => t.id !== trip.id));
      showSuccess(`Trip sheet for ${trip.tripId} marked as not received.`);
      pushSheetAlert({
        tripDbId: Number(trip.id),
        tripIdStr: trip.tripId,
        bookingRef: trip.bookingReferenceNo,
        reportedBy: user?.name ?? "Unknown",
      });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update trip sheet status.");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  }

  async function handleMarkReceived(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      const updated = await tripsApi.receiveSheet(trip.id);
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
      showSuccess(`Trip sheet for ${trip.tripId} marked as received.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to mark trip sheet as received.");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  }

  async function handleToggleRecheck(trip: Trip, flagged: boolean) {
    try {
      const remark = flagged ? recheckRemark.trim() : "";
      const updated = await tripsApi.setRecheckFlag(trip.id, flagged, remark);
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
      setRecheckOpen(null);
      setRecheckRemark("");
      showSuccess(flagged ? `Trip ${trip.tripId} flagged for re-checking.` : `Flag cleared for ${trip.tripId}.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update re-check flag.");
    }
  }

  const [downloading, setDownloading] = useState(false);

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const receivedTrips = trips.filter((t) => t.tripSheetReceived === true);

  async function handleDownloadPDF() {
    if (downloading || receivedTrips.length === 0) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 10;
      const marginY = 14;
      const rowH = 8;
      const headerH = 9;

      // Total: 277mm (297 - 10*2)
      const cols: [string, number][] = [
        ["Trip ID",       28],
        ["Booking Ref",   33],
        ["Customer",      34],
        ["Route",         40],
        ["Container No",  25],
        ["Driver",        29],
        ["Vehicle",       24],
        ["Hire Amt",      20],
        ["Total Exp",     20],
        ["Received On",   24],
      ];

      function drawPageHeader(pageNum: number, totalPages: number) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(27, 43, 94);
        pdf.text("Trip Reconciliation — Delivered & Received", marginX, marginY);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(
          `Generated on ${today}  ·  ${receivedTrips.length} trip${receivedTrips.length !== 1 ? "s" : ""}`,
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

      const rowData = receivedTrips.map((trip) => {
        const customer = customerById.get(trip.customerId);
        const sheet = sheets.get(trip.id);
        const receivedOn = trip.tripSheetReceivedAt
          ? (() => {
              const utc = trip.tripSheetReceivedAt.endsWith("Z") || trip.tripSheetReceivedAt.includes("+")
                ? trip.tripSheetReceivedAt : trip.tripSheetReceivedAt + "Z";
              return new Date(utc).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
            })()
          : "—";
        return [
          trip.tripId,
          trip.bookingReferenceNo ?? "—",
          customer?.name ?? trip.shipperConsignee ?? "—",
          `${trip.origin} > ${trip.destination}`,
          containerRef(trip) || "—",
          trip.driverName ?? "—",
          trip.truckRegistration ?? "—",
          sheet ? `Rs.${n(sheet.hireAmount).toLocaleString("en-IN")}` : "—",
          sheet ? `Rs.${n(sheet.totalExpense).toLocaleString("en-IN")}` : "—",
          receivedOn,
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

      pdf.save(`trip-reconciliation-${today.replace(/ /g, "-")}.pdf`);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={10} />;

  const counts = {
    All:                trips.length,
    "Pending Receive":  trips.filter((t) => !t.tripSheetReceived).length,
    "Pending Sheet Entry": trips.filter((t) => t.tripSheetReceived && !sheets.has(t.id)).length,
    "Sheet Entered":    trips.filter((t) => sheets.has(t.id)).length,
    "Flagged":          trips.filter((t) => t.flaggedForRecheck).length,
    "Rejected":         trips.filter((t) => t.verificationStatus === "rejected").length,
  };

  const filteredTrips = trips
    .filter((t) => {
      if (statusFilter === "Pending Receive" && t.tripSheetReceived) return false;
      if (statusFilter === "Pending Sheet Entry" && (!t.tripSheetReceived || sheets.has(t.id))) return false;
      if (statusFilter === "Sheet Entered" && !sheets.has(t.id)) return false;
      if (statusFilter === "Flagged" && !t.flaggedForRecheck) return false;
      if (statusFilter === "Rejected" && t.verificationStatus !== "rejected") return false;

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
    })
    .sort((a, b) => {
      const priority = (t: typeof a) => {
        if (!sheets.has(t.id)) return 0;
        if (!t.tripSheetReceived) return 1;
        return 2;
      };
      return priority(a) - priority(b);
    });

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedTrips = filteredTrips.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Reconciliation</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage booking sheets and trip sheets for closed trips
          </p>
        </div>
        <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by truck no., driver, trip ID…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
          />
        </div>
        {isAdmin && <DownloadExcelButton path="/exports/trips" filename="trips.xlsx" />}
        <button
          type="button"
          onClick={handleDownloadPDF}
          disabled={downloading || receivedTrips.length === 0}
          title={receivedTrips.length === 0 ? "No received trips to export" : "Download delivered & received trips as PDF"}
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Generating..." : "Download PDF"}
        </button>
        </div>
      </div>

      {/* Status filter count cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {(["All", "Pending Receive", "Pending Sheet Entry", "Sheet Entered", "Flagged", "Rejected"] as const).map((f) => {
          const colors: Record<string, string> = {
            "All":                  "border-gray-200 bg-white text-gray-700",
            "Pending Receive":      "border-amber-200 bg-amber-50 text-amber-700",
            "Pending Sheet Entry":  "border-blue-200 bg-blue-50 text-blue-700",
            "Sheet Entered":        "border-emerald-200 bg-emerald-50 text-emerald-700",
            "Flagged":              "border-orange-200 bg-orange-50 text-orange-700",
            "Rejected":             "border-rose-200 bg-rose-50 text-rose-700",
          };
          const activeRing: Record<string, string> = {
            "All":                  "ring-2 ring-gray-400",
            "Pending Receive":      "ring-2 ring-amber-400",
            "Pending Sheet Entry":  "ring-2 ring-blue-400",
            "Sheet Entered":        "ring-2 ring-emerald-400",
            "Flagged":              "ring-2 ring-orange-400",
            "Rejected":             "ring-2 ring-rose-400",
          };
          return (
            <button
              key={f}
              type="button"
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={`flex flex-col items-center rounded-xl border px-3 py-3 transition-all ${colors[f]} ${statusFilter === f ? activeRing[f] : "hover:opacity-80"}`}
            >
              <span className="text-xl font-bold">{counts[f]}</span>
              <span className="text-xs font-medium text-center">{f}</span>
            </button>
          );
        })}
      </div>

      {/* Workflow legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
        <span className="font-semibold text-gray-600">Workflow:</span>
        <span className="flex items-center gap-1"><Inbox className="h-3.5 w-3.5 text-amber-500" /> Sheet delivered by Yard → pending receive</span>
        <span className="text-gray-300">›</span>
        <span className="flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5 text-blue-500" /> Received → pending sheet entry</span>
        <span className="text-gray-300">›</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Sheet entered → moves to Verification</span>
        <span className="text-gray-300">›</span>
        <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> Flagged = needs re-check before entry</span>
      </div>

      {/* Active filter label */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>
          Showing <span className="font-semibold text-gray-800">{filteredTrips.length}</span> of{" "}
          <span className="font-semibold text-gray-800">{trips.length}</span> trips
          {statusFilter !== "All" && (
            <> — filtered by <span className="font-semibold text-gray-800">{statusFilter}</span></>
          )}
        </span>
        {statusFilter !== "All" && (
          <button
            type="button"
            onClick={() => { setStatusFilter("All"); setPage(1); }}
            className="ml-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
          >
            Clear
          </button>
        )}
      </div>

      {filteredTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No closed trips yet.
        </div>
      ) : (
        <>
        <div className="overflow-auto max-h-[65vh] rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1300px] text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Vehicle", "Driver", "Container No", "From → To", "Trip ID", "Booking Ref", "Customer",
                  "Hire Amount", "Total Expense", "Trip Sheet Status", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedTrips.map((trip) => {
                const sheet = sheets.get(trip.id);
                const customer = customerById.get(trip.customerId);

                return (
                  <tr key={trip.id} className={`hover:bg-gray-50 ${trip.verificationStatus === "rejected" ? "bg-rose-50/50" : trip.flaggedForRecheck ? "bg-orange-50/40" : ""}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {trip.truckRegistration ?? "—"}
                      {trip.flaggedForRecheck && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                          <Flag className="h-2.5 w-2.5" /> Re-check
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      <span>{trip.driverName ?? "—"}</span>
                      {trip.driverChangeRemark && (
                        <p className="mt-0.5 text-[11px] text-amber-600 leading-snug max-w-[140px] whitespace-normal">
                          Remark: {trip.driverChangeRemark}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600 font-mono text-xs">{containerRef(trip)}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {trip.origin} <span className="text-gray-400">→</span> {trip.destination}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-2 text-gray-600">{(customer?.name ?? trip.shipperConsignee) || "—"}</td>
                    <td className="px-4 py-2 font-medium text-blue-700">
                      {sheet ? fmt(n(sheet.hireAmount)) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2 font-medium text-emerald-700">
                      {sheet ? fmt(n(sheet.totalExpense)) : <span className="text-gray-400">—</span>}
                    </td>
                    {/* Trip Sheet Status */}
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 w-fit">
                          <CheckCircle2 className="h-3 w-3" />
                          Delivered
                        </span>
                        {trip.tripSheetCollectedAt && (
                          <p className="text-[11px] text-gray-500 leading-snug max-w-[160px] whitespace-normal">
                            Trip Sheet for this Trip has been handed over on{" "}
                            <span className="font-semibold text-gray-700">
                              {new Date(
                                trip.tripSheetCollectedAt.endsWith("Z") || trip.tripSheetCollectedAt.includes("+")
                                  ? trip.tripSheetCollectedAt
                                  : trip.tripSheetCollectedAt + "Z"
                              ).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                timeZone: "Asia/Kolkata",
                              })}
                            </span>
                          </p>
                        )}
                        {trip.tripSheetReceived ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            Received
                            {trip.tripSheetReceivedAt && (
                              <span className="font-normal text-blue-500">
                                {new Date(
                                  trip.tripSheetReceivedAt.endsWith("Z") || trip.tripSheetReceivedAt.includes("+")
                                    ? trip.tripSheetReceivedAt
                                    : trip.tripSheetReceivedAt + "Z"
                                ).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}
                              </span>
                            )}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={toggling.has(trip.id)}
                            onClick={() => handleMarkReceived(trip)}
                            className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 w-fit"
                          >
                            {toggling.has(trip.id) ? "..." : "Mark as Received"}
                          </button>
                        )}
                        {sheet ? (
                          <span
                            title="Trip sheet has already been entered — cannot unmark delivery"
                            className="inline-block rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-400 cursor-not-allowed w-fit"
                          >
                            Locked
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={toggling.has(trip.id)}
                            onClick={() => handleMarkNotReceived(trip)}
                            className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50 w-fit"
                          >
                            {toggling.has(trip.id) ? "..." : "Mark as Not Received"}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-2">
                        {/* Booking Sheet */}
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Booking Sheet</p>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openBookingSheet(trip, true)}
                              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => openBookingSheet(trip, false)}
                              className="rounded-lg border border-purple-300 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                            >
                              {isStaff ? "Request Edit" : "Edit"}
                            </button>
                          </div>
                        </div>

                        {/* Trip Sheet */}
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Trip Sheet</p>
                          {trip.verificationStatus === "rejected" && (
                            <div className="mb-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 flex flex-col gap-1.5">
                              <p className="text-[11px] font-bold text-rose-700">✗ Rejected by Accounts</p>
                              {trip.verificationRejectionReason && (
                                <p className="text-[10px] text-rose-600 max-w-[200px] whitespace-normal leading-snug">
                                  {trip.verificationRejectionReason}
                                </p>
                              )}
                              {hasTripSheetApproval(trip) ? (
                                <p className="text-[10px] font-semibold text-emerald-700">
                                  ✓ Kumar approved your edit request — you can now edit the trip sheet.
                                </p>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingEditAction({
                                      resourceType: "TripSheet",
                                      trip,
                                      rejectionContext: trip.verificationRejectionReason ?? undefined,
                                    });
                                    setEditRequestOpen(true);
                                  }}
                                  className="self-start rounded-lg border border-rose-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                                >
                                  Request Edit Approval from Kumar
                                </button>
                              )}
                              {sheets.has(trip.id) && (
                                <button
                                  type="button"
                                  disabled={resubmitting.has(trip.id)}
                                  onClick={() => handleResubmitVerification(trip)}
                                  className="self-start rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                >
                                  {resubmitting.has(trip.id) ? "Re-submitting..." : "Re-submit for Verification"}
                                </button>
                              )}
                            </div>
                          )}
                          {sheet ? (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => openDialog(trip, "view")}
                                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => openDialog(trip, "edit")}
                                className="rounded-lg border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                {isStaff ? "Request Edit" : "Edit"}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!trip.tripSheetReceived}
                              title={!trip.tripSheetReceived ? "Mark the trip sheet as received first" : undefined}
                              onClick={() => openDialog(trip, "add")}
                              className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ADD
                            </button>
                          )}
                        </div>

                        {/* Re-check Flag */}
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Re-check</p>
                          {trip.flaggedForRecheck ? (
                            <div className="flex flex-col gap-1">
                              {trip.flaggedRemark && (
                                <p className="text-[10px] text-orange-600 italic max-w-[160px] whitespace-normal leading-snug">
                                  {trip.flaggedRemark}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleRecheck(trip, false)}
                                className="rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 w-fit"
                              >
                                Clear Flag
                              </button>
                            </div>
                          ) : recheckOpen === trip.id ? (
                            <div className="flex flex-col gap-1">
                              <textarea
                                value={recheckRemark}
                                onChange={(e) => setRecheckRemark(e.target.value)}
                                placeholder="Reason for re-check (optional)"
                                rows={2}
                                className="w-40 rounded border border-orange-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                              />
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleRecheck(trip, true)}
                                  className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-600"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setRecheckOpen(null); setRecheckRemark(""); }}
                                  className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setRecheckOpen(trip.id); setRecheckRemark(""); }}
                              className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-100 w-fit"
                            >
                              <Flag className="h-3 w-3" /> Flag
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-sm text-gray-500">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredTrips.length)} of {filteredTrips.length} trips
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item as number)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        safePage === item
                          ? "bg-blue-600 text-white"
                          : "border border-gray-200 text-gray-600 hover:bg-gray-50"
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
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
        </>
      )}

      <TripSheetDialog
        open={selectedTrip !== null}
        trip={selectedTrip}
        closure={selectedTrip ? closures.get(selectedTrip.id) : undefined}
        existingSheet={selectedTrip ? sheets.get(selectedTrip.id) : undefined}
        readOnly={dialogMode === "view"}
        autoEditable={isAdmin}
        onRequestAutoEdit={
          isAdmin || !selectedTrip
            ? undefined
            : () => {
                setPendingEditAction({ resourceType: "TripData", trip: selectedTrip });
                setEditRequestOpen(true);
              }
        }
        drivers={drivers}
        trucks={trucks}
        onClose={() => setSelectedTrip(null)}
        onSubmit={handleSubmitSheet}
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
        onClose={() => setBookingSheetTrip(null)}
        onSubmit={handleBookingSheetSubmit}
      />

      {/* Edit approval request dialog — shown when Staff clicks Edit without active approval */}
      {pendingEditAction && (
        <EditRequestDialog
          open={editRequestOpen}
          resourceType={pendingEditAction.resourceType}
          resourceName={pendingEditAction.trip.bookingReferenceNo || pendingEditAction.trip.tripId}
          action="Edit"
          onSubmit={handleEditRequestSubmit}
          onClose={() => { setEditRequestOpen(false); setPendingEditAction(null); }}
          rejectionContext={pendingEditAction.rejectionContext}
        />
      )}
    </div>
  );
}
