"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { useGlobalSearchQuery, containerRef } from "@/lib/trip-search";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search, CheckCircle2, Circle, Download } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";

function fmtIST(iso: string) {
  // MySQL returns datetime without timezone marker — append Z to force UTC parsing
  const utc = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
  const formatted = new Date(utc).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatted} (GMT+05:30)`;
}

export default function SheetCollectionPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Delivered">("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  function loadData() {
    return Promise.all([
      tripsApi.list("Completed"),
      driversApi.list(),
      trucksApi.list(),
      customersApi.list(),
    ]).then(([t, d, trks, c]) => {
      const closed = t.filter((trip) => (trip as any).hasClosure === true);
      setTrips(closed);
      setDrivers(d);
      setTrucks(trks);
      setCustomers(c);
      setSelected(new Set());
    });
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  useAutoRefresh(() => {
    loadData();
  }, 10000);

  useWebSocketEvent("sheet_collected", loadData);
  useWebSocketEvent("sheet_unmarked", loadData);
  useWebSocketEvent("trip_closed", loadData);
  useWebSocketEvent("sheet_entered", loadData);

  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const filtered = trips.filter((t) => {

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const truck = truckById.get(t.vehicleId);
    const driver = driverById.get(t.driverId);
    return (
      t.tripId?.toLowerCase().includes(q) ||
      t.bookingReferenceNo?.toLowerCase().includes(q) ||
      t.vehicleId?.toLowerCase().includes(q) ||
      (truck?.registrationNumber ?? "").toLowerCase().includes(q) ||
      (driver?.name ?? "").toLowerCase().includes(q) ||
      (t.containerNumber ?? "").toLowerCase().includes(q) ||
      (t.containerNumber1 ?? "").toLowerCase().includes(q) ||
      (t.containerNumber2 ?? "").toLowerCase().includes(q) ||
      (t.cargoReference ?? "").toLowerCase().includes(q)
    );
  });

  const collected = filtered.filter((t) => t.tripSheetCollected);
  const pending = filtered.filter((t) => !t.tripSheetCollected);

  const tableTrips = filtered.filter((t) => {
    if (statusFilter === "Pending" && t.tripSheetCollected) return false;
    if (statusFilter === "Delivered" && !t.tripSheetCollected) return false;
    return true;
  });

  const selectableIds = tableTrips.filter((t) => !t.tripSheetCollected && !t.hasSheet).map((t) => t.id);
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleToggleCollect(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      const updated = await tripsApi.collectSheet(trip.id);
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
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
      showSuccess(`Alert sent — Admin and Fleet Manager notified for trip ${trip.tripId}.`);
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

  async function handleBulkCollect() {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    const targets = filtered.filter((t) => selected.has(t.id) && !t.tripSheetCollected);
    let successCount = 0;
    const errors: string[] = [];
    await Promise.all(
      targets.map(async (trip) => {
        try {
          const updated = await tripsApi.collectSheet(trip.id);
          setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
          successCount++;
        } catch (err: unknown) {
          errors.push(trip.tripId);
        }
      })
    );
    setSelected(new Set());
    setBulkBusy(false);
    if (errors.length === 0) {
      showSuccess(`${successCount} trip sheet${successCount > 1 ? "s" : ""} marked as delivered.`);
    } else {
      showError(`${successCount} succeeded, ${errors.length} failed: ${errors.join(", ")}`);
    }
  }

  async function handleDownloadPDF() {
    if (downloading || collected.length === 0) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
          `Generated on ${today}  ·  ${collected.length} sheet${collected.length !== 1 ? "s" : ""} delivered`,
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
      const rowData = collected.map((trip) => {
        const truck = truckById.get(trip.vehicleId);
        const driver = driverById.get(trip.driverId);
        const customer = customerById.get(trip.customerId);
        const deliveredOn = trip.tripSheetCollectedAt
          ? (() => {
              const utc = trip.tripSheetCollectedAt.endsWith("Z") || trip.tripSheetCollectedAt.includes("+")
                ? trip.tripSheetCollectedAt : trip.tripSheetCollectedAt + "Z";
              return new Date(utc).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
            })()
          : "—";
        return [
          trip.tripId,
          trip.bookingReferenceNo,
          formatDate(trip.scheduledDate) || "—",
          truck?.registrationNumber ?? trip.vehicleId ?? "—",
          customer?.name ?? trip.shipperConsignee ?? "—",
          `${trip.origin} > ${trip.destination}`,
          containerRef(trip),
          driver?.name ?? "—",
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
        let y = drawPageHeader(page, totalPages);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Sheet Collection</h1>
          <p className="mt-1 text-sm text-gray-500">
            Mark trip sheets as delivered from drivers before reconciliation
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by truck no., driver, trip ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-gray-200 bg-white/50 py-2 pl-3 pr-8 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
          >
            <option value="All">All Sheets</option>
            <option value="Pending">Pending</option>
            <option value="Delivered">Delivered</option>
          </select>
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={downloading || collected.length === 0}
            title={collected.length === 0 ? "No delivered sheets to export" : "Download delivered sheets as PDF"}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Generating..." : "Download PDF"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Closed</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Sheets Delivered</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{collected.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Pending Delivery</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{pending.length}</p>
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-800">
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
              disabled={bulkBusy}
              onClick={handleBulkCollect}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {bulkBusy ? "Marking..." : `Mark ${selected.size} as Delivered`}
            </button>
          </div>
        </div>
      )}

      {tableTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No completed trips found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1150px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                    title="Select all pending"
                  />
                </th>
                {["Status", "Trip ID", "Trip Date", "Booking Ref", "Vehicle", "Customer", "Route", "Container No", "Driver", "Sheet Status", "Delivered On", "Action"].map(
                  (col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tableTrips.map((trip) => {
                const driver = driverById.get(trip.driverId);
                const truck = truckById.get(trip.vehicleId);
                const customer = customerById.get(trip.customerId);
                const isCollected = trip.tripSheetCollected;
                const isBusy = toggling.has(trip.id);
                const isChecked = selected.has(trip.id);
                const sheetSubmitted = trip.hasSheet;

                return (
                  <tr
                    key={trip.id}
                    className={isChecked ? "bg-blue-50/60" : "hover:bg-gray-50"}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(trip.id)}
                        className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {isCollected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Delivered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          <Circle className="h-3 w-3" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(trip.scheduledDate) || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{truck?.registrationNumber ?? trip.vehicleId ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{(customer?.name ?? trip.shipperConsignee) || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {trip.origin} <span className="text-gray-400">→</span> {trip.destination}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{containerRef(trip)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span>{driver?.name ?? "—"}</span>
                      {trip.driverChangeRemark && (
                        <p className="mt-0.5 text-[11px] text-amber-600 leading-snug max-w-[160px] whitespace-normal">
                          Remark: {trip.driverChangeRemark}
                        </p>
                      )}
                    </td>

                    {/* Trip Sheet Status */}
                    <td className="px-4 py-3">
                      {isCollected || sheetSubmitted ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 cursor-not-allowed">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Sheet Delivered
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleFlagSheetMissing(trip)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Circle className="h-3.5 w-3.5" />
                          Trip Sheet Not Yet Received
                        </button>
                      )}
                    </td>

                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {trip.tripSheetCollectedAt ? (() => {
                        const utc = trip.tripSheetCollectedAt.endsWith("Z") || trip.tripSheetCollectedAt.includes("+") ? trip.tripSheetCollectedAt : trip.tripSheetCollectedAt + "Z";
                        return new Date(utc).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
                      })() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {isCollected && sheetSubmitted ? (
                        <span
                          title="Trip sheet already submitted in reconciliation — cannot undo delivery"
                          className="inline-block rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-400 cursor-not-allowed"
                        >
                          Locked
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleCollect(trip)}
                          className={
                            isCollected
                              ? "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                              : "rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          }
                        >
                          {isBusy ? "..." : isCollected ? "Undo" : "Mark as Delivered"}
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
