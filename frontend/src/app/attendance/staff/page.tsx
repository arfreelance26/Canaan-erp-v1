"use client";

import { Search, Download } from "lucide-react";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffAttendanceTable } from "@/components/attendance/StaffAttendanceTable";
import { staffApi, attendanceApi } from "@/lib/api";
import type { Staff } from "@/types/staff";
import type { StaffAttendanceRecord } from "@/types/attendance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { todayIst } from "@/lib/format-date";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

function getStaffAttendanceForDate(
  records: StaffAttendanceRecord[],
  staffId: string,
  date: string
): StaffAttendanceRecord | undefined {
  return records.find((r) => r.staffId === staffId && r.date === date);
}

export default function StaffAttendancePage() {
  const [date, setDate] = useState(todayIst());
  const [search, setSearch] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [fromDate, setFromDate] = useState(todayIst());
  const [toDate, setToDate] = useState(todayIst());

  useEffect(() => {
    Promise.all([staffApi.list(), attendanceApi.listStaff()])
      .then(([s, r]) => {
        setStaff(s);
        setRecords(r);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  // Reload records when date changes or WS event fires
  useEffect(() => {
    attendanceApi.listStaff(date).then(setRecords);
  }, [date, refreshKey]);

  useWebSocketEvent("attendance_updated", () => setRefreshKey(k => k + 1));

  const handleMark = useCallback(
    async (staffId: string, currentRecord: StaffAttendanceRecord | undefined, status: string) => {
      try {
        let updated: StaffAttendanceRecord;
        if (currentRecord) {
          updated = await attendanceApi.updateStaff(currentRecord.id, status);
        } else {
          updated = await attendanceApi.markStaff(parseInt(staffId), date, status, undefined, "Web");
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

  async function handleDownloadPDF() {
    if (downloading || staff.length === 0) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const rangeRecords = await attendanceApi.listStaff(undefined, undefined, fromDate, toDate);

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
      const dayHeadH = 7;

      const STATUS_COLORS: Record<string, [number, number, number]> = {
        "Present":    [22, 163, 74],
        "Absent":     [220, 38, 38],
        "On Leave":   [161, 98, 7],
        "Not Marked": [107, 114, 128],
      };

      const cols: [string, number][] = [
        ["#",           10],
        ["Staff ID",    28],
        ["Staff Name",  60],
        ["Designation", 50],
        ["Status",      35],
      ];

      type PdfRow = { dateLabel: string; idx: number; staffId: string; name: string; designation: string; status: string };
      const allRows: PdfRow[] = [];
      for (const d of dates) {
        const displayDate = new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", weekday: "short",
        });
        staff.forEach((member, idx) => {
          const record = rangeRecords.find((r) => r.staffId === member.id && r.date === d);
          const status = record?.status ?? "Not Marked";
          allRows.push({ dateLabel: displayDate, idx: idx + 1, staffId: member.staffId, name: member.name ?? "—", designation: member.designation ?? "—", status });
        });
      }

      let curY = marginY;
      let tableStartY = 0;
      let rowsOnPage: number[] = [];
      let currentDayLabel = "";
      let pageNum = 1;

      function drawColHeader() {
        pdf.setFillColor(27, 43, 94);
        pdf.rect(marginX, curY, pageW - marginX * 2, headerH, "F");
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
        curY += headerH;
      }

      function closeBorder() {
        if (rowsOnPage.length > 0) {
          const totalH = rowsOnPage.reduce((a, b) => a + b, 0);
          pdf.setDrawColor(209, 213, 219);
          pdf.rect(marginX, tableStartY, pageW - marginX * 2, headerH + totalH, "S");
        }
      }

      function newPage() {
        closeBorder();
        pdf.addPage();
        pageNum++;
        curY = marginY;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Staff Attendance Report — ${rangeLabel} (continued)`, marginX, curY);
        pdf.text(`Page ${pageNum}`, pageW - marginX, curY, { align: "right" });
        curY += 6;
        drawColHeader();
      }

      // First page header
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(27, 43, 94);
      pdf.text("Staff Attendance Report", marginX, curY);
      curY += 6;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Period: ${rangeLabel}  ·  ${staff.length} staff member${staff.length !== 1 ? "s" : ""}`, marginX, curY);
      curY += 6;
      drawColHeader();

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];

        // Day banner on date change
        if (!isSingleDay && row.dateLabel !== currentDayLabel) {
          if (curY + dayHeadH + rowH > pageH - marginY) newPage();
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

        // Page break check
        if (curY + rowH > pageH - marginY) {
          newPage();
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

        // Alternating row
        if (rowsOnPage.length % 2 === 1) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(marginX, curY, pageW - marginX * 2, rowH, "F");
        }
        pdf.setDrawColor(229, 231, 235);
        pdf.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        let x = marginX;
        const cells = [String(row.idx), row.staffId, row.name, row.designation, row.status];
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        for (let c = 0; c < cols.length; c++) {
          const [, w] = cols[c];
          if (c === 4) {
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

      closeBorder();

      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 6, { align: "right" });
      }

      const fileSuffix = isSingleDay ? fromDate : `${fromDate}_to_${toDate}`;
      pdf.save(`staff-attendance-${fileSuffix}.pdf`);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  const summary = useMemo(() => {
    const counts = { Present: 0, Absent: 0, "On Leave": 0, "Not Marked": 0 };
    for (const member of staff) {
      const record = getStaffAttendanceForDate(records, member.id, date);
      const status = record?.status ?? "Not Marked";
      counts[status as keyof typeof counts] += 1;
    }
    return counts;
  }, [staff, records, date]);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return staff;
    return staff.filter((member) => member.name.toLowerCase().includes(query));
  }, [staff, search]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={4} columns={7} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and mark attendance for all staff members
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
            path="/exports/staff-attendance"
            filename={`staff_attendance_${fromDate}_to_${toDate}.xlsx`}
            params={{ from_date: fromDate, to_date: toDate }}
          />
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={downloading || staff.length === 0}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Generating..." : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Present</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{summary.Present}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Absent</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summary.Absent}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">On Leave</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">{summary["On Leave"]}</p>
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
          placeholder="Search by staff name"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <StaffAttendanceTable
        staff={filteredStaff}
        records={records}
        date={date}
        onMark={handleMark}
      />
    </div>
  );
}
