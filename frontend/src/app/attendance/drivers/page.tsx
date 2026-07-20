"use client";

import { Search, Lock, Download } from "lucide-react";
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

  // Reload records and remarks when date changes or WS event fires
  useEffect(() => {
    Promise.all([attendanceApi.listDrivers(date), attendanceApi.listDriverRemarks(undefined, date)])
      .then(([r, rm]) => { setRecords(r); setRemarks(rm); });
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

      const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 14;
      const marginY = 14;
      const rowH = 8;
      const headerH = 9;

      const STATUS_COLORS: Record<string, [number, number, number]> = {
        "On Trip":      [37, 99, 235],
        "On Halt":      [234, 88, 12],
        "Leave":        [161, 98, 7],
        "On Workshop":  [124, 58, 237],
        "Not Marked":   [107, 114, 128],
      };

      const cols: [string, number][] = [
        ["#",           10],
        ["Driver ID",   30],
        ["Driver Name", 75],
        ["Status",      50],
        ["Remarks",     18],
      ];

      function drawPageHeader(pageNum: number, totalPages: number) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(27, 43, 94);
        pdf.text("Driver Attendance", marginX, marginY);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(
          `Date: ${displayDate}  ·  ${drivers.length} driver${drivers.length !== 1 ? "s" : ""}`,
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

      const rowData = drivers.map((driver, idx) => {
        const record = getAttendanceForDate(records, driver.driverId, date);
        const status = record?.status ?? "Not Marked";
        const driverRemarks = remarks.filter((r) => r.driverId === driver.driverId && r.date === date);
        const remarkText = driverRemarks.map((r) => r.remark).join("; ");
        return { idx: idx + 1, driverId: driver.driverId, name: driver.name ?? "—", status, remarkText };
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
        pdf.setFontSize(8);

        for (let r = 0; r < pageRows.length; r++) {
          const row = pageRows[r];
          const rowY = y + r * rowH;

          if (r % 2 === 1) {
            pdf.setFillColor(249, 250, 251);
            pdf.rect(marginX, rowY, pageW - marginX * 2, rowH, "F");
          }
          pdf.setDrawColor(229, 231, 235);
          pdf.line(marginX, rowY + rowH, pageW - marginX, rowY + rowH);

          pdf.setTextColor(30, 30, 30);
          let x = marginX;
          const cells = [String(row.idx), row.driverId, row.name, row.status, row.remarkText || "—"];
          for (let c = 0; c < cols.length; c++) {
            const [, w] = cols[c];
            // Color the status cell
            if (c === 3) {
              const [cr, cg, cb] = STATUS_COLORS[row.status] ?? [107, 114, 128];
              pdf.setTextColor(cr, cg, cb);
            } else {
              pdf.setTextColor(30, 30, 30);
            }
            const clipped = pdf.splitTextToSize(cells[c], w - 4)[0] ?? "";
            pdf.text(clipped, x + 2, rowY + 5.5);
            x += w;
          }
        }

        pdf.setDrawColor(209, 213, 219);
        pdf.rect(marginX, y, pageW - marginX * 2, pageRows.length * rowH, "S");
      }

      pdf.save(`driver-attendance-${date}.pdf`);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  const isReadOnly = useMemo(() => {
    if (!isAdmin) return false;
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
      <div className="relative z-50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and mark attendance for all drivers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DownloadExcelButton path="/exports/driver-attendance" filename="driver_attendance.xlsx" />
          <div className="flex items-center gap-2">
            <label htmlFor="attendance-date" className="text-sm font-medium text-gray-600">
              Date
            </label>
            <DatePickerInput
              value={date}
              onChange={(v) => setDate(v)}
              className="w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
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

      {isReadOnly && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold">View only — </span>
            Attendance can be marked or edited only for today and the past 2 days. You can view records for this date but cannot make any changes.
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
        readOnly={isReadOnly}
        onMark={handleMark}
        onAddRemark={handleAddRemark}
        onUpdateRemark={handleUpdateRemark}
        onDeleteRemark={handleDeleteRemark}
      />
    </div>
  );
}
