"use client";

import { Search, Lock, Download, Loader2, Info } from "lucide-react";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DriverAttendanceTable } from "@/components/attendance/DriverAttendanceTable";
import { driversApi, attendanceApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Driver } from "@/types/driver";
import type { DriverAttendanceRecord, DriverAttendanceRemark } from "@/types/attendance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { todayIst } from "@/lib/format-date";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

function getAttendanceForDate(
  records: DriverAttendanceRecord[],
  driverId: string,
  date: string
): DriverAttendanceRecord | undefined {
  return records.find((r) => r.driverId === driverId && r.date === date);
}

export default function DriverAttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [date, setDate] = useState(todayIst());
  const [search, setSearch] = useState("");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [records, setRecords] = useState<DriverAttendanceRecord[]>([]);
  const [remarks, setRemarks] = useState<DriverAttendanceRemark[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [fromDate, setFromDate] = useState(todayIst());
  const [toDate, setToDate] = useState(todayIst());
  const [lateEntryLog, setLateEntryLog] = useState<{ id: string; date: string; remark: string; createdAt: string | null } | null>(null);
  const [lateEntryRemark, setLateEntryRemark] = useState("");
  const [submittingLateEntry, setSubmittingLateEntry] = useState(false);

  useEffect(() => {
    Promise.all([driversApi.list(), attendanceApi.listDrivers(), attendanceApi.listDriverRemarks()])
      .then(([d, r, rm]) => {
        setDrivers(d);
        setRecords(r);
        setRemarks(rm);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  // Reload records, remarks, and late-entry log when date changes or WS event fires
  useEffect(() => {
    Promise.all([
      attendanceApi.listDrivers(date),
      attendanceApi.listDriverRemarks(undefined, date),
      attendanceApi.getLateEntryLog(date),
    ]).then(([r, rm, log]) => { setRecords(r); setRemarks(rm); setLateEntryLog(log); setLateEntryRemark(""); });
  }, [date, refreshKey]);

  useWebSocketEvent("attendance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));

  const handleMark = useCallback(
    async (driverId: string, currentRecord: DriverAttendanceRecord | undefined, status: string) => {
      try {
        let updated: DriverAttendanceRecord;
        if (currentRecord) {
          updated = await attendanceApi.updateDriver(currentRecord.id, status);
        } else {
          updated = await attendanceApi.markDriver(driverId, date, status);
        }
        setRecords((prev) => {
          const without = prev.filter((r) => r.id !== updated.id);
          return [...without, updated];
        });
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : "Failed to mark attendance.");
      }
    },
    [date]
  );

  const handleSubmitLateEntry = useCallback(async () => {
    const trimmed = lateEntryRemark.trim();
    if (!trimmed) return;
    setSubmittingLateEntry(true);
    try {
      const log = await attendanceApi.postLateEntryLog(date, trimmed);
      setLateEntryLog(log);
      setLateEntryRemark("");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to submit late entry reason.");
    } finally {
      setSubmittingLateEntry(false);
    }
  }, [date, lateEntryRemark]);

  const handleAddRemark = useCallback(
    async (driverId: string, remark: string) => {
      const added = await attendanceApi.addDriverRemark(driverId, date, remark);
      setRemarks((prev) => [...prev, added]);
      return added;
    },
    [date]
  );

  const handleUpdateRemark = useCallback(async (id: string, remark: string) => {
    const updated = await attendanceApi.updateDriverRemark(id, remark);
    setRemarks((prev) => prev.map((r) => (r.id === id ? updated : r)));
  }, []);

  const handleDeleteRemark = useCallback(async (id: string) => {
    await attendanceApi.deleteDriverRemark(id);
    setRemarks((prev) => prev.filter((r) => r.id !== id));
  }, []);

  async function handleDownloadPDF() {
    if (downloading || drivers.length === 0) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      // Fetch all records and remarks for the selected date range
      const [rangeRecords, rangeRemarks] = await Promise.all([
        attendanceApi.listDrivers(undefined, undefined, fromDate, toDate),
        attendanceApi.listDriverRemarks(undefined, undefined, fromDate, toDate),
      ]);

      // Build sorted list of all dates in the range (inclusive)
      const dates: string[] = [];
      const [fy, fm, fd] = fromDate.split("-").map(Number);
      const [ty, tm, td] = toDate.split("-").map(Number);
      const cur = new Date(fy, fm - 1, fd);
      const end = new Date(ty, tm - 1, td);
      while (cur <= end) {
        dates.push(
          `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
        );
        cur.setDate(cur.getDate() + 1);
      }

      const isSingleDay = fromDate === toDate;
      const rangeLabel = isSingleDay
        ? new Date(fromDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : `${new Date(fromDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – ${new Date(toDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 14;
      const marginY = 14;
      const rowH = 8;
      const headerH = 9;
      const dayHeadH = 7; // height of the per-day date banner

      const STATUS_COLORS: Record<string, [number, number, number]> = {
        "On Trip":     [37, 99, 235],
        "On Halt":     [234, 88, 12],
        "Leave":       [161, 98, 7],
        "On Workshop": [124, 58, 237],
        "Not Marked":  [107, 114, 128],
      };

      const cols: [string, number][] = [
        ["#",           10],
        ["Driver ID",   30],
        ["Driver Name", 72],
        ["Status",      50],
        ["Remarks",     21],
      ];

      // Build flat list of all rows across all dates
      type PdfRow = { dateLabel: string; idx: number; driverId: string; name: string; status: string; remarkText: string };
      const allRows: PdfRow[] = [];
      for (const d of dates) {
        const displayDate = new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", weekday: "short",
        });
        drivers.forEach((driver, idx) => {
          const record = rangeRecords.find((r) => r.driverId === driver.driverId && r.date === d);
          const status = record?.status ?? "Not Marked";
          const driverRemarks = rangeRemarks.filter((r) => r.driverId === driver.driverId && r.date === d);
          const remarkText = driverRemarks.map((r) => r.remark).join("; ");
          allRows.push({ dateLabel: displayDate, idx: idx + 1, driverId: driver.driverId, name: driver.name ?? "—", status, remarkText });
        });
      }

      // Estimate total pages: each row is rowH, day banners add dayHeadH, page header is ~24mm
      const usableH = pageH - marginY - 10;
      const colHeaderH = headerH;

      // We'll render dynamically — track cursor Y
      let pageNum = 1;
      let curY = marginY;
      let isFirstPage = true;
      let currentDayLabel = "";
      let tableStartY = 0;
      let rowsOnPage: number[] = []; // heights so we can draw border at end

      function drawDocHeader() {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(27, 43, 94);
        pdf.text("Driver Attendance Report", marginX, curY);
        curY += 6;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Period: ${rangeLabel}  ·  ${drivers.length} driver${drivers.length !== 1 ? "s" : ""}`, marginX, curY);
        curY += 6;
      }

      function drawColHeader() {
        pdf.setFillColor(27, 43, 94);
        pdf.rect(marginX, curY, pageW - marginX * 2, colHeaderH, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        let x = marginX;
        for (const [label, w] of cols) {
          pdf.text(label.toUpperCase(), x + 2, curY + 6);
          x += w;
        }
        tableStartY = curY;
        rowsOnPage = [];
        curY += colHeaderH;
      }

      function closeBorder() {
        if (rowsOnPage.length > 0) {
          const totalRowH = rowsOnPage.reduce((a, b) => a + b, 0);
          pdf.setDrawColor(209, 213, 219);
          pdf.rect(marginX, tableStartY, pageW - marginX * 2, colHeaderH + totalRowH, "S");
        }
      }

      function newPage() {
        closeBorder();
        pdf.addPage();
        pageNum++;
        curY = marginY;
        // Continuation header
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Driver Attendance Report — ${rangeLabel} (continued)`, marginX, curY);
        pdf.text(`Page ${pageNum}`, pageW - marginX, curY, { align: "right" });
        curY += 6;
        drawColHeader();
      }

      // First page header
      drawDocHeader();
      drawColHeader();
      isFirstPage = false;

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];

        // Inject day banner when date changes
        if (!isSingleDay && row.dateLabel !== currentDayLabel) {
          // Need space for banner + at least one data row
          if (curY + dayHeadH + rowH > pageH - marginY) {
            newPage();
          }
          currentDayLabel = row.dateLabel;
          pdf.setFillColor(239, 246, 255);
          pdf.rect(marginX, curY, pageW - marginX * 2, dayHeadH, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.5);
          pdf.setTextColor(27, 43, 94);
          pdf.text(row.dateLabel, marginX + 3, curY + 5);
          rowsOnPage.push(dayHeadH);
          curY += dayHeadH;
        }

        // Page break check for data row
        if (curY + rowH > pageH - marginY) {
          newPage();
          // Re-inject day banner on new page if mid-day
          if (!isSingleDay) {
            pdf.setFillColor(239, 246, 255);
            pdf.rect(marginX, curY, pageW - marginX * 2, dayHeadH, "F");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(7.5);
            pdf.setTextColor(27, 43, 94);
            pdf.text(`${row.dateLabel} (cont.)`, marginX + 3, curY + 5);
            rowsOnPage.push(dayHeadH);
            curY += dayHeadH;
          }
        }

        // Alternating row background
        const rowIndexInTable = rowsOnPage.length;
        if (rowIndexInTable % 2 === 1) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(marginX, curY, pageW - marginX * 2, rowH, "F");
        }
        pdf.setDrawColor(229, 231, 235);
        pdf.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        // Cell content
        let x = marginX;
        const cells = [String(row.idx), row.driverId, row.name, row.status, row.remarkText || "—"];
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        for (let c = 0; c < cols.length; c++) {
          const [, w] = cols[c];
          if (c === 3) {
            const [cr, cg, cb] = STATUS_COLORS[row.status] ?? [107, 114, 128];
            pdf.setTextColor(cr, cg, cb);
          } else {
            pdf.setTextColor(30, 30, 30);
          }
          const clipped = pdf.splitTextToSize(cells[c], w - 4)[0] ?? "";
          pdf.text(clipped, x + 2, curY + 5.5);
          x += w;
        }

        rowsOnPage.push(rowH);
        curY += rowH;
      }

      // Close the final border
      closeBorder();

      // Add page numbers on every page
      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 6, { align: "right" });
      }

      const fileSuffix = isSingleDay ? fromDate : `${fromDate}_to_${toDate}`;
      pdf.save(`driver-attendance-${fileSuffix}.pdf`);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  // Admin has no date restrictions. Non-admin: locked if date is older than 2 days.
  const isLockedDate = useMemo(() => {
    if (isAdmin) return false;
    const today = todayIst();
    const [y, m, d] = today.split("-").map(Number);
    const cutoff = new Date(y, m - 1, d - 2);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    return date < cutoffStr;
  }, [date, isAdmin]);

  const summary = useMemo(() => {
    const counts = { "On Trip": 0, "On Halt": 0, "Leave": 0, "On Workshop": 0, "Not Marked": 0 };
    for (const driver of drivers) {
      const record = getAttendanceForDate(records, driver.driverId, date);
      const status = record?.status ?? "Not Marked";
      if (status in counts) {
        counts[status as keyof typeof counts] += 1;
      } else {
        counts["Not Marked"] += 1;
      }
    }
    return counts;
  }, [drivers, records, date]);

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return drivers;
    return drivers.filter((driver) => driver.name.toLowerCase().includes(query));
  }, [drivers, search]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={4} columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and mark attendance for all drivers
          </p>
        </div>
        <div className="flex items-center gap-2">
            
            <DatePickerInput
              value={date}
              onChange={(v) => setDate(v)}
              className="w-full sm:w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* View date picker */}
          

          <div className="h-6 w-px bg-gray-200" />

          {/* Download date range pickers */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Download</span>
            <label className="text-sm font-medium text-gray-600">From</label>
            <DatePickerInput
              value={fromDate}
              onChange={(v) => { setFromDate(v); if (v > toDate) setToDate(v); }}
              className="w-[140px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
            <label className="text-sm font-medium text-gray-600">To</label>
            <DatePickerInput
              value={toDate}
              onChange={(v) => { setToDate(v); if (v < fromDate) setFromDate(v); }}
              className="w-[140px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <DownloadExcelButton
            path="/exports/driver-attendance"
            filename={`driver_attendance_${fromDate}_to_${toDate}.xlsx`}
            params={{ from_date: fromDate, to_date: toDate }}
          />
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={downloading || drivers.length === 0}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Generating..." : "Download PDF"}
          </button>
        </div>
      </div>

      {/* Non-admin: locked date — show late entry reason form or unlocked confirmation */}
      {isLockedDate && !lateEntryLog && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="text-sm font-semibold text-amber-800">Locked date</span>
            <span className="text-sm text-amber-700">— This date is outside the 2-day edit window. Provide a reason to unlock attendance entry for this day.</span>
          </div>
          <div className="flex items-center gap-2">
            <textarea
              value={lateEntryRemark}
              onChange={(e) => setLateEntryRemark(e.target.value)}
              placeholder="Reason for late attendance entry…"
              rows={2}
              className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none resize-none"
            />
            <button
              type="button"
              onClick={handleSubmitLateEntry}
              disabled={!lateEntryRemark.trim() || submittingLateEntry}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap self-stretch"
            >
              {submittingLateEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Unlock &amp; Enter Attendance
            </button>
          </div>
        </div>
      )}

      {/* Admin: show info banner when late entry log exists for this date */}
      {isAdmin && lateEntryLog && (
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
          <span>
            <span className="font-semibold">Late entry submitted for this date — </span>
            Reason: &ldquo;{lateEntryLog.remark}&rdquo;
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium tracking-wider text-blue-500 uppercase">On Trip</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{summary["On Trip"]}</p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-xs font-medium tracking-wider text-orange-500 uppercase">On Halt</p>
          <p className="mt-1 text-2xl font-bold text-orange-700">{summary["On Halt"]}</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-xs font-medium tracking-wider text-yellow-500 uppercase">Leave</p>
          <p className="mt-1 text-2xl font-bold text-yellow-700">{summary["Leave"]}</p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs font-medium tracking-wider text-purple-500 uppercase">On Workshop</p>
          <p className="mt-1 text-2xl font-bold text-purple-700">{summary["On Workshop"]}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Not Marked</p>
          <p className="mt-1 text-2xl font-bold text-gray-500">{summary["Not Marked"]}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by driver name"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <DriverAttendanceTable
        drivers={filteredDrivers}
        records={records}
        remarks={remarks}
        date={date}
        readOnly={isLockedDate && !lateEntryLog}
        onMark={handleMark}
        onAddRemark={handleAddRemark}
        onUpdateRemark={handleUpdateRemark}
        onDeleteRemark={handleDeleteRemark}
      />
    </div>
  );
}
