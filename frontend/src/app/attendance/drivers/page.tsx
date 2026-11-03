"use client";

import { RiLockLine as Lock, RiDownloadLine as Download, RiLoader4Line as Loader2, RiInformationLine as Info, RiCloseLine as X, RiEyeLine as Eye, RiProfileLine as IdCard, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { PagedTbody } from "@/components/ui/PagedTbody";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DriverAttendanceTable } from "@/components/attendance/DriverAttendanceTable";
import { driversApi, attendanceApi, type DriverAttendanceEditEventRow } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Driver } from "@/types/driver";
import type { DriverAttendanceRecord, DriverAttendanceRemark } from "@/types/attendance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { todayIst, formatDateTime } from "@/lib/format-date";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showError } from "@/lib/feedback";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
const EDIT_EVENT_ICON: Record<DriverAttendanceEditEventRow["event"], typeof Plus> = {
  "Attendance Marked": Plus,
  "Attendance Updated": Pencil,
  "Remark Added": Plus,
  "Remark Edited": Pencil,
  "Remark Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<DriverAttendanceEditEventRow["event"], string> = {
  "Attendance Marked": "bg-accent-surface-strong text-accent-text",
  "Attendance Updated": "bg-warning-surface-strong text-warning-text",
  "Remark Added": "bg-purple-surface-strong text-purple-text",
  "Remark Edited": "bg-warning-surface-strong text-warning-text",
  "Remark Deleted": "bg-danger-surface-strong text-danger-text",
};

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
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportRecords, setReportRecords] = useState<DriverAttendanceRecord[]>([]);
  const [reportRemarks, setReportRemarks] = useState<DriverAttendanceRemark[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [lateEntryLog, setLateEntryLog] = useState<{ id: string; date: string; remark: string; createdAt: string | null } | null>(null);
  const [lateEntryRemark, setLateEntryRemark] = useState("");
  const [submittingLateEntry, setSubmittingLateEntry] = useState(false);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<DriverAttendanceEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    attendanceApi.listDriverEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    Promise.all([driversApi.list(), attendanceApi.listDrivers(), attendanceApi.listDriverRemarks()])
      .then(([d, r, rm]) => {
        setDrivers(d);
        setRecords(r);
        setRemarks(rm);
      })
      .catch(() => {
        showError("Couldn't load the driver roster — showing last known data, not necessarily current.");
      }).finally(() => setLoading(false));
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  // Reload records, remarks, and late-entry log when date changes or WS event fires
  useEffect(() => {
    Promise.all([
      attendanceApi.listDrivers(date),
      attendanceApi.listDriverRemarks(undefined, date),
      attendanceApi.getLateEntryLog(date),
    ]).then(([r, rm, log]) => { setRecords(r); setRemarks(rm); setLateEntryLog(log); setLateEntryRemark(""); })
      .catch(() => {
        showError("Couldn't load attendance for this date — showing the previous date's data.");
      });
  }, [date, refreshKey]);

  useWebSocketEvent("attendance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));

  const handleMark = useCallback(
    async (driverId: string, currentRecord: DriverAttendanceRecord | undefined, status: string, containerSpecification?: string, workshopAdvance?: number) => {
      try {
        let updated: DriverAttendanceRecord;
        if (currentRecord) {
          updated = await attendanceApi.updateDriver(currentRecord.id, status, containerSpecification, workshopAdvance);
        } else {
          updated = await attendanceApi.markDriver(driverId, date, status, containerSpecification, workshopAdvance);
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
      try {
        const added = await attendanceApi.addDriverRemark(driverId, date, remark);
        setRemarks((prev) => [...prev, added]);
        return added;
      } catch (err: unknown) {
        // The child table only wraps this call in try/finally (no catch), so
        // without handling it here it surfaces as an unhandled promise
        // rejection — a failed add silently does nothing visible otherwise.
        showError(err instanceof Error ? err.message : "Failed to add remark.");
        return undefined;
      }
    },
    [date]
  );

  const handleUpdateRemark = useCallback(async (id: string, remark: string) => {
    try {
      const updated = await attendanceApi.updateDriverRemark(id, remark);
      setRemarks((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update remark.");
    }
  }, []);

  const handleDeleteRemark = useCallback(async (id: string) => {
    try {
      await attendanceApi.deleteDriverRemark(id);
      setRemarks((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete remark.");
    }
  }, []);

  async function handleViewReport() {
    setReportLoading(true);
    setShowReportModal(true);
    try {
      const [r, rm] = await Promise.all([
        attendanceApi.listDrivers(undefined, undefined, fromDate, toDate),
        attendanceApi.listDriverRemarks(undefined, undefined, fromDate, toDate),
      ]);
      setReportRecords(r);
      setReportRemarks(rm);
    } finally {
      setReportLoading(false);
    }
  }

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
        ? new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")
        : `${new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")} – ${new Date(toDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}`;

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
        const displayDate = new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
          day: "2-digit", month: "2-digit", year: "numeric", weekday: "short",
        }).replace(/\//g, "-");
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
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <IdCard className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Driver Attendance</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Track and mark attendance for all drivers
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}
          {/* Day being marked */}
          <div className="flex h-10 items-center gap-1 rounded-full border border-separator-border bg-background-primary-default px-3 shadow-sm transition-transform duration-300 hover:shadow-md [&_.border-gold-solid]:!border-0 [&_.border-gold-solid]:!bg-transparent [&_.border-gold-solid]:!px-1 [&_.border-gold-solid]:!py-1 [&_.border-gold-solid]:!shadow-none [&_.border-brand-gold_svg]:!text-text-secondary">
            <div className="w-[128px]">
              <DatePickerInput value={date} onChange={(v) => setDate(v)} clearable={false} />
            </div>
          </div>
        </div>
      </div>

      {/* Non-admin: locked date — show late entry reason form or unlocked confirmation */}
      {isLockedDate && !lateEntryLog && (
        <div className="rounded-lg border border-warning-border bg-warning-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-4 w-4 shrink-0 text-warning-text" />
            <span className="text-body-semibold text-warning-text-strong">Locked date</span>
            <span className="text-sm text-warning-text">— This date is outside the 2-day edit window. Provide a reason to unlock attendance entry for this day.</span>
          </div>
          <div className="flex items-center gap-2">
            <textarea
              value={lateEntryRemark}
              onChange={(e) => setLateEntryRemark(e.target.value)}
              placeholder="Reason for late attendance entry…"
              rows={2}
              className="flex-1 rounded-lg border border-warning-border-strong bg-background-primary-default px-3 py-2 text-sm focus:border-warning-solid focus:outline-none resize-none"
            />
            <button
              type="button"
              onClick={handleSubmitLateEntry}
              disabled={!lateEntryRemark.trim() || submittingLateEntry}
              className="flex items-center gap-2 rounded-lg bg-warning-solid px-4 py-2 text-body-medium text-on-solid hover:bg-warning-solid-hover disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap self-stretch"
            >
              {submittingLateEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Unlock &amp; Enter Attendance
            </button>
          </div>
        </div>
      )}

      {/* Admin: show info banner when late entry log exists for this date */}
      {isAdmin && lateEntryLog && (
        <div className="flex items-start gap-2.5 rounded-lg border border-accent-border bg-accent-surface px-4 py-3 text-sm text-accent-text-strong">
          <Info className="h-4 w-4 shrink-0 text-accent-text mt-0.5" />
          <span>
            <span className="font-semibold">Late entry submitted for this date — </span>
            Reason: &ldquo;{lateEntryLog.remark}&rdquo;
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-accent-border bg-accent-surface p-4">
          <p className="text-caption-1-medium text-accent-text">On Trip</p>
          <p className="mt-1 text-title-1-semibold text-accent-text">{summary["On Trip"]}</p>
        </div>
        <div className="rounded-xl border border-orange-border bg-orange-surface p-4">
          <p className="text-caption-1-medium text-orange-text">On Halt</p>
          <p className="mt-1 text-title-1-semibold text-orange-text">{summary["On Halt"]}</p>
        </div>
        <div className="rounded-xl border border-warning-border bg-warning-surface p-4">
          <p className="text-caption-1-medium text-warning-text">Leave</p>
          <p className="mt-1 text-title-1-semibold text-warning-text">{summary["Leave"]}</p>
        </div>
        <div className="rounded-xl border border-purple-border bg-purple-surface p-4">
          <p className="text-caption-1-medium text-purple-text">On Workshop</p>
          <p className="mt-1 text-title-1-semibold text-purple-text">{summary["On Workshop"]}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Not Marked</p>
          <p className="mt-1 text-title-1-semibold text-text-secondary">{summary["Not Marked"]}</p>
        </div>
      </div>

      {/* Toolbar — search on the left, report range + View on the right (same layout as the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch value={search} onChange={setSearch} placeholder="Search by driver name" />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill
            from={fromDate}
            to={toDate}
            onFromChange={(v) => { setFromDate(v); if (v > toDate) setToDate(v); }}
            onToChange={(v) => { setToDate(v); if (v < fromDate) setFromDate(v); }}
          />
          <button
            type="button"
            onClick={handleViewReport}
            disabled={reportLoading}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            View
          </button>
        </div>
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

      {showReportModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-scrim/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowReportModal(false); }}
        >
          <div className="w-full max-w-5xl rounded-xl bg-background-primary-default shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
              <div>
                <p className="font-semibold text-text-primary">Driver Attendance Report</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {fromDate === toDate
                    ? new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")
                    : `${new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")} – ${new Date(toDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}`}
                  {" · "}{drivers.length} driver{drivers.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="rounded-lg p-1.5 text-text-tertiary hover:bg-fill-3"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Report table */}
            <div className="flex-1 overflow-auto px-5 py-4">
              {reportLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-sm text-text-tertiary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading report…
                </div>
              ) : reportRecords.length === 0 && drivers.length === 0 ? (
                <EmptyState size="compact" illustration="no-data" title="No attendance data for the selected range" />
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-separator-border bg-fill-1">
                      {["#", "Driver ID", "Driver Name", "Date", "Status", "Remarks"].map((col) => (
                        <th key={col} className="px-3 py-2.5 text-caption-1-semibold text-text-secondary whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                    {(() => {
                      const dates: string[] = [];
                      const [fy, fm, fd] = fromDate.split("-").map(Number);
                      const [ty, tm, td] = toDate.split("-").map(Number);
                      const cur = new Date(fy, fm - 1, fd);
                      const end = new Date(ty, tm - 1, td);
                      while (cur <= end) {
                        dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
                        cur.setDate(cur.getDate() + 1);
                      }
                      // One row per day per person; only the current page of rows is drawn.
                      const cells = dates.flatMap((d) => drivers.map((driver) => ({ d, driver })));
                      return (
                        <PagedTbody className="divide-y divide-separator-border" items={cells}>
                          {({ d, driver }, i) => {
                          const rowIdx = i + 1;
                          const record = reportRecords.find((r) => r.driverId === driver.driverId && r.date === d);
                          const status = record?.status ?? "Not Marked";
                          const driverRemarks = reportRemarks.filter((r) => r.driverId === driver.driverId && r.date === d);
                          const remarkText = driverRemarks.map((r) => r.remark).join("; ") || "—";
                          const statusColor: Record<string, string> = {
                            "On Trip": "text-accent-text bg-accent-surface",
                            "On Halt": "text-orange-text bg-orange-surface",
                            "Leave": "text-warning-text bg-warning-surface",
                            "On Workshop": "text-purple-text bg-purple-surface",
                            "Not Marked": "text-text-secondary bg-fill-1",
                          };
                          return (
                            <tr key={`${d}-${driver.driverId}`} className="hover:bg-fill-2">
                              <td className="px-3 py-2 text-text-tertiary text-xs">{rowIdx}</td>
                              <td className="px-3 py-2 font-medium text-text-primary whitespace-nowrap">{driver.driverId}</td>
                              <td className="px-3 py-2 text-text-primary whitespace-nowrap">{driver.name}</td>
                              <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                                {new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-caption-1-medium ${statusColor[status] ?? "text-text-secondary bg-fill-1"}`}>
                                  {status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-text-secondary text-xs max-w-[200px] truncate">{remarkText}</td>
                            </tr>
                          );
                          }}
                        </PagedTbody>
                      );
                    })()}
                </table>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t px-5 py-3 flex items-center justify-end gap-2 shrink-0">
              <DownloadExcelButton
                path="/exports/driver-attendance"
                filename={`driver_attendance_${fromDate}_to_${toDate}.xlsx`}
                params={{ from_date: fromDate, to_date: toDate }}
                direct
                className="flex items-center gap-2 rounded-lg border border-success-border bg-success-surface px-4 py-2 text-body-medium text-success-text hover:bg-success-surface-strong disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              />
              <button
                type="button"
                onClick={async () => { await handleDownloadPDF(); setShowReportModal(false); }}
                disabled={downloading || drivers.length === 0}
                className="flex items-center gap-2 rounded-lg border border-danger-border bg-danger-surface px-4 py-2 text-body-medium text-danger-text hover:bg-danger-surface-strong disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                {downloading ? "Generating..." : "Download PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit History — every mark/remark event ever logged, across every
          driver, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by driver or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q || ev.driverName.toLowerCase().includes(q) || ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Driver</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Date</th>
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
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.driverName}</td>
                          <td className="px-3 py-2 text-text-secondary">{ev.date}</td>
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
