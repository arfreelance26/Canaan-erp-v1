"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, MessageSquare, ChevronDown, ChevronUp, Search, Download, Eye, FileSpreadsheet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { attendanceApi } from "@/lib/api";
import { showError } from "@/lib/swal";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { cn } from "@/lib/utils";
import type { AttendanceSummaryRow, DriverAttendanceRemark } from "@/types/attendance";
import { formatDate } from "@/lib/format-date";

type Category = "driver" | "staff";
type ViewMode = "summary" | "datewise";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastOfMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); // day 0 of next month = last day of this month
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

// Inclusive list of "YYYY-MM-DD" dates between from and to.
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to) return out;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  if (start > end) return out;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

// Register cell display: single-letter code + color per attendance status.
const STATUS_DISPLAY: Record<string, { abbr: string; cls: string; title: string }> = {
  "Present":     { abbr: "P", cls: "bg-green-100 text-green-700",   title: "Present" },
  "Absent":      { abbr: "A", cls: "bg-red-100 text-red-600",       title: "Absent" },
  "On Leave":    { abbr: "L", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-600 dark:text-yellow-50", title: "On Leave" },
  "Leave":       { abbr: "L", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-600 dark:text-yellow-50", title: "Leave" },
  "On Trip":     { abbr: "T", cls: "bg-blue-100 text-blue-700 dark:bg-sky-600 dark:text-sky-50",           title: "On Trip" },
  "On Halt":     { abbr: "H", cls: "bg-orange-100 text-orange-700 dark:bg-orange-600 dark:text-orange-50", title: "On Halt" },
  "On Workshop": { abbr: "W", cls: "bg-purple-100 text-purple-700 dark:bg-purple-600 dark:text-purple-50", title: "On Workshop" },
  "Holiday":     { abbr: "H", cls: "bg-blue-100 text-blue-700 dark:bg-blue-600 dark:text-blue-50",         title: "Holiday" },
  "Not Marked":  { abbr: ".", cls: "bg-gray-50 text-gray-300",      title: "Not Marked" },
};

function RemarksList({ remarks }: { remarks: DriverAttendanceRemark[] }) {
  const [expanded, setExpanded] = useState(false);
  if (remarks.length === 0) return <span className="text-xs text-gray-400">—</span>;

  const preview = remarks.slice(0, 2);
  const rest = remarks.slice(2);

  return (
    <div className="flex flex-col gap-1 max-w-[280px]">
      {preview.map((r) => (
        <div key={r.id} className="flex items-start gap-1.5">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
          <span className="text-xs text-gray-700 whitespace-normal break-words">
            <span className="font-medium text-gray-500">{formatDate(r.date)}:</span> {r.remark}
          </span>
        </div>
      ))}

      {rest.length > 0 && expanded && rest.map((r) => (
        <div key={r.id} className="flex items-start gap-1.5">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
          <span className="text-xs text-gray-700 whitespace-normal break-words">
            <span className="font-medium text-gray-500">{formatDate(r.date)}:</span> {r.remark}
          </span>
        </div>
      ))}

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline w-fit"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> +{rest.length} more</>
          )}
        </button>
      )}
    </div>
  );
}

export default function AttendanceReportPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState<Category>("driver");
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(lastOfMonth());
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [remarks, setRemarks] = useState<DriverAttendanceRemark[]>([]);
  // Per-day status lookup for the date-wise register: personCode -> date -> status
  const [statusMap, setStatusMap] = useState<Record<string, Record<string, string>>>({});
  // Government/company holidays in range (staff only): date -> holiday name
  const [holidayMap, setHolidayMap] = useState<Record<string, string>>({});
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    attendanceApi.getLatestDate(category).then(setLatestDate).catch(() => {});
  }, [category]);

  const isCommercialManager = user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin" && !isCommercialManager) {
      router.replace("/");
    }
    // Commercial Manager can only view drivers — force category if somehow set to staff
    if (isCommercialManager && category === "staff") {
      setCategory("driver");
    }
  }, [ready, user, router, isCommercialManager, category]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    const summaryPromise = attendanceApi.getSummary(category, fromDate, toDate).then(setRows);
    const remarksPromise = category === "driver"
      ? attendanceApi.listDriverRemarks(undefined, undefined, fromDate, toDate).then(setRemarks)
      : Promise.resolve();

    // Date-wise register: fetch every daily record in the range and build a
    // personCode -> date -> status lookup.
    const registerPromise = viewMode === "datewise"
      ? (category === "driver"
          ? attendanceApi.listDrivers(undefined, undefined, fromDate, toDate).then((recs) => {
              const map: Record<string, Record<string, string>> = {};
              recs.forEach((r) => { (map[r.driverId] ??= {})[r.date] = r.status; });
              setStatusMap(map);
            })
          : attendanceApi.listStaff(undefined, undefined, fromDate, toDate).then((recs) => {
              const map: Record<string, Record<string, string>> = {};
              recs.forEach((r) => { (map[r.staffId] ??= {})[r.date] = r.status; });
              setStatusMap(map);
            }))
      : Promise.resolve();

    // Holidays are staff-attendance only (Sundays are derived from the date).
    const holidaysPromise = (viewMode === "datewise" && category === "staff")
      ? attendanceApi.listHolidays(fromDate, toDate).then((hs) => {
          const map: Record<string, string> = {};
          hs.forEach((h) => { map[h.date] = h.name; });
          setHolidayMap(map);
        })
      : Promise.resolve(setHolidayMap({}));

    Promise.all([summaryPromise, remarksPromise, registerPromise, holidaysPromise])
      .catch((err: unknown) => showError(err instanceof Error ? err.message : "Failed to load attendance report."))
      .finally(() => setLoading(false));
  }, [category, fromDate, toDate, viewMode]);

  if (!ready || (user?.softwareDesignation !== "Admin" && !isCommercialManager)) return null;

  const isDriver = category === "driver";

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const dates = useMemo(() => dateRange(fromDate, toDate), [fromDate, toDate]);

  const remarksByDriver = remarks.reduce<Record<string, DriverAttendanceRemark[]>>((acc, r) => {
    (acc[r.driverId] ??= []).push(r);
    return acc;
  }, {});

  const driverTotals = rows.reduce(
    (acc, r) => ({
      onTrip: acc.onTrip + r.onTrip,
      onHalt: acc.onHalt + r.onHalt,
      leave: acc.leave + r.leave,
      onWorkshop: acc.onWorkshop + r.onWorkshop,
      notMarked: acc.notMarked + r.notMarked,
    }),
    { onTrip: 0, onHalt: 0, leave: 0, onWorkshop: 0, notMarked: 0 }
  );

  const staffTotals = rows.reduce(
    (acc, r) => ({
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      onLeave: acc.onLeave + r.onLeave,
      notMarked: acc.notMarked + r.notMarked,
    }),
    { present: 0, absent: 0, onLeave: 0, notMarked: 0 }
  );

  const driverColumns = ["Driver ID", "Name", "On Trip", "On Halt", "Leave", "On Workshop", "Not Marked", "Active Rate", "Remarks"];
  const staffColumns  = ["Staff ID",  "Name", "Present", "Absent",  "On Leave", "Not Marked", "% Present"];

  async function handleDownloadPDF() {
    if (downloading || filteredRows.length === 0) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const rangeLabel = fromDate === toDate
        ? formatDate(fromDate)
        : `${formatDate(fromDate)} - ${formatDate(toDate)}`;
      const who = isDriver ? "Driver" : "Staff";

      // status → RGB for jsPDF fills/text
      const RGB: Record<string, [number, number, number]> = {
        "Present": [22, 163, 74], "Absent": [220, 38, 38],
        "On Leave": [161, 98, 7], "Leave": [161, 98, 7],
        "On Trip": [37, 99, 235], "On Halt": [234, 88, 12],
        "On Workshop": [124, 58, 237], "Holiday": [37, 99, 235], "Not Marked": [156, 163, 175],
      };
      const NAVY: [number, number, number] = [27, 43, 94];

      if (viewMode === "datewise") {
        // ── Register grid (landscape) ──────────────────────────────────────
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const marginX = 8, marginY = 12;
        const nameW = 48;
        const cellW = (pageW - marginX * 2 - nameW) / dates.length;
        const rowH = 6, headH = 9;

        function docHeader() {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(13);
          pdf.setTextColor(...NAVY);
          pdf.text(`${who} Attendance Register`, marginX, marginY);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Period: ${rangeLabel}  |  ${filteredRows.length} ${who.toLowerCase()}${filteredRows.length !== 1 ? "s" : ""}`, marginX, marginY + 5);
        }

        function colHeader(y: number) {
          pdf.setFillColor(...NAVY);
          pdf.rect(marginX, y, pageW - marginX * 2, headH, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.setTextColor(255, 255, 255);
          pdf.text(who.toUpperCase(), marginX + 2, y + 6);
          for (let i = 0; i < dates.length; i++) {
            const dd = Number(dates[i].split("-")[2]);
            pdf.text(String(dd), marginX + nameW + i * cellW + cellW / 2, y + 6, { align: "center" });
          }
        }

        let curY = marginY + 9;
        docHeader();
        colHeader(curY);
        curY += headH;

        for (let ri = 0; ri < filteredRows.length; ri++) {
          if (curY + rowH > pageH - marginY) {
            pdf.addPage();
            curY = marginY;
            colHeader(curY);
            curY += headH;
          }
          const r = filteredRows[ri];
          if (ri % 2 === 1) {
            pdf.setFillColor(245, 247, 250);
            pdf.rect(marginX, curY, pageW - marginX * 2, rowH, "F");
          }
          // name + code
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.setTextColor(31, 41, 55);
          pdf.text(String(r.name).slice(0, 26), marginX + 2, curY + 4);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(150, 150, 150);
          pdf.text(String(r.code), marginX + 2, curY + rowH - 0.6);
          // status letters
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          for (let i = 0; i < dates.length; i++) {
            const recorded = statusMap[isDriver ? r.code : r.id]?.[dates[i]];
            const [pyy, pmm, pdd] = dates[i].split("-").map(Number);
            const pIsHoliday = !isDriver && (new Date(pyy, pmm - 1, pdd).getDay() === 0 || Boolean(holidayMap[dates[i]]));
            const st = recorded ?? (pIsHoliday ? "Holiday" : "Not Marked");
            const disp = STATUS_DISPLAY[st] ?? STATUS_DISPLAY["Not Marked"];
            pdf.setTextColor(...(RGB[st] ?? RGB["Not Marked"]));
            pdf.text(disp.abbr, marginX + nameW + i * cellW + cellW / 2, curY + 4, { align: "center" });
          }
          curY += rowH;
        }

        // legend
        if (curY + 10 > pageH - marginY) { pdf.addPage(); curY = marginY; }
        curY += 4;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(80, 80, 80);
        pdf.text("Legend:", marginX, curY);
        let lx = marginX + 16;
        const legendItems = isDriver
          ? ["On Trip", "On Halt", "Leave", "On Workshop", "Not Marked"]
          : ["Present", "Absent", "On Leave", "Holiday", "Not Marked"];
        for (const s of legendItems) {
          const disp = STATUS_DISPLAY[s] ?? STATUS_DISPLAY["Not Marked"];
          pdf.setTextColor(...(RGB[s] ?? RGB["Not Marked"]));
          pdf.text(disp.abbr, lx, curY);
          pdf.setTextColor(90, 90, 90);
          pdf.text(` = ${s}`, lx + 2, curY);
          lx += 42;
        }

        pdf.save(`${who}_Attendance_Register_${fromDate}_to_${toDate}.pdf`);
      } else {
        // ── Summary table (portrait) ───────────────────────────────────────
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const marginX = 12, marginY = 14;
        const rowH = 8, headH = 9;

        const cols: [string, number][] = isDriver
          ? [["#", 10], ["Driver ID", 26], ["Name", 52], ["Trip", 16], ["Halt", 16], ["Leave", 16], ["W.shop", 18], ["N/M", 14], ["Active %", 18]]
          : [["#", 10], ["Staff ID", 26], ["Name", 64], ["Present", 22], ["Absent", 22], ["On Leave", 24], ["N/M", 16], ["% Pres", 22]];

        function docHeader() {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(13);
          pdf.setTextColor(...NAVY);
          pdf.text(`${who} Attendance Report`, marginX, marginY);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Period: ${rangeLabel}  |  ${filteredRows.length} ${who.toLowerCase()}${filteredRows.length !== 1 ? "s" : ""}`, marginX, marginY + 5);
        }

        function colHeader(y: number) {
          pdf.setFillColor(...NAVY);
          pdf.rect(marginX, y, cols.reduce((s, [, w]) => s + w, 0), headH, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.setTextColor(255, 255, 255);
          let x = marginX;
          for (const [label, w] of cols) { pdf.text(label.toUpperCase(), x + 2, y + 6); x += w; }
        }

        let curY = marginY + 9;
        docHeader();
        colHeader(curY);
        curY += headH;

        filteredRows.forEach((r, idx) => {
          if (curY + rowH > pageH - marginY) {
            pdf.addPage(); curY = marginY; colHeader(curY); curY += headH;
          }
          if (idx % 2 === 1) {
            pdf.setFillColor(245, 247, 250);
            pdf.rect(marginX, curY, cols.reduce((s, [, w]) => s + w, 0), rowH, "F");
          }
          const active = r.onTrip + r.onHalt + r.onWorkshop;
          const driverPct = r.totalDays > 0 ? Math.round((active / r.totalDays) * 100) : 0;
          const staffPct = r.totalDays > 0 ? Math.round((r.present / r.totalDays) * 100) : 0;
          const cells = isDriver
            ? [String(idx + 1), r.code, String(r.name).slice(0, 30), String(r.onTrip), String(r.onHalt), String(r.leave), String(r.onWorkshop), String(r.notMarked), `${driverPct}%`]
            : [String(idx + 1), r.code, String(r.name).slice(0, 36), String(r.present), String(r.absent), String(r.onLeave), String(r.notMarked), `${staffPct}%`];
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7.5);
          pdf.setTextColor(40, 40, 40);
          let x = marginX;
          cells.forEach((c, ci) => { pdf.text(c, x + 2, curY + 5.5); x += cols[ci][1]; });
          curY += rowH;
        });

        pdf.save(`${who}_Attendance_Report_${fromDate}_to_${toDate}.pdf`);
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadExcel() {
    if (filteredRows.length === 0) return;
    try {
      const { utils, writeFile } = await import("xlsx");
      const who = isDriver ? "Driver" : "Staff";
      let data: Record<string, string | number>[];
      // Explicit column order. Needed for the datewise register because its date
      // columns are integer-like keys ("1".."31") and JS always orders those
      // numerically *before* string keys like "Name" — so key insertion order
      // alone can't put Name first; json_to_sheet must be told the header order.
      let header: string[] | undefined;

      if (viewMode === "datewise") {
        // Register grid: one row per person, one column per date (abbreviation).
        data = filteredRows.map((r) => {
          const row: Record<string, string | number> = {
            Name: r.name,
            [isDriver ? "Driver ID" : "Staff ID"]: r.code,
          };
          dates.forEach((d) => {
            const recorded = statusMap[isDriver ? r.code : r.id]?.[d];
            const [yy, mm, dd] = d.split("-").map(Number);
            const isHoliday = !isDriver && (new Date(yy, mm - 1, dd).getDay() === 0 || Boolean(holidayMap[d]));
            const st = recorded ?? (isHoliday ? "Holiday" : "Not Marked");
            row[String(dd)] = (STATUS_DISPLAY[st] ?? STATUS_DISPLAY["Not Marked"]).abbr;
          });
          return row;
        });
        const dateKeys = [...new Set(dates.map((d) => String(Number(d.split("-")[2]))))];
        header = ["Name", isDriver ? "Driver ID" : "Staff ID", ...dateKeys];
      } else if (isDriver) {
        data = filteredRows.map((r, idx) => {
          const active = r.onTrip + r.onHalt + r.onWorkshop;
          const pct = r.totalDays > 0 ? Math.round((active / r.totalDays) * 100) : 0;
          return {
            Name: r.name,
            "#": idx + 1,
            "Driver ID": r.code,
            "On Trip": r.onTrip,
            "On Halt": r.onHalt,
            Leave: r.leave,
            "On Workshop": r.onWorkshop,
            "Not Marked": r.notMarked,
            "Active %": `${pct}%`,
          };
        });
      } else {
        data = filteredRows.map((r, idx) => {
          const pct = r.totalDays > 0 ? Math.round((r.present / r.totalDays) * 100) : 0;
          return {
            Name: r.name,
            "#": idx + 1,
            "Staff ID": r.code,
            Present: r.present,
            Absent: r.absent,
            "On Leave": r.onLeave,
            "Not Marked": r.notMarked,
            "% Present": `${pct}%`,
          };
        });
      }

      const ws = utils.json_to_sheet(data, header ? { header } : undefined);
      const wb = utils.book_new();
      const sheetName = viewMode === "datewise" ? "Register" : "Summary";
      utils.book_append_sheet(wb, ws, sheetName);
      const kind = viewMode === "datewise" ? "Register" : "Report";
      writeFile(wb, `${who}_Attendance_${kind}_${fromDate}_to_${toDate}.xlsx`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to generate Excel.");
    }
  }

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Attendance Report</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {isDriver
              ? "On Trip, On Halt, Leave, and On Workshop counts for drivers over any date range"
              : "Present, Absent, and On Leave day counts for staff over any date range"}
          </p>
        </div>
        {latestDate && (
          <div className="flex flex-col items-end sm:text-right">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Latest {isDriver ? "Driver" : "Staff"} Attendance Marked
            </span>
            <span className="mt-0.5 inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700 border border-blue-100">
              {formatDate(latestDate)}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["driver", "staff"] as Category[])
            .filter((c) => !(isCommercialManager && c === "staff"))
            .map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCategory(c); setSearch(""); }}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  category === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {c === "driver" ? "Drivers" : "Staff"}
              </button>
            ))}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isDriver ? "Search by name or driver ID…" : "Search by name or staff ID…"}
              className="h-9 w-64 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* View toggle: aggregated Summary vs day-by-day Register */}
          <div className="ml-1 inline-flex rounded-full border border-gray-200 bg-gray-100 p-0.5">
            {([["summary", "Summary"], ["datewise", "Date-wise"]] as [ViewMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  viewMode === mode ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
            <DatePickerInput
              value={fromDate}
              onChange={setFromDate}
              className="w-full sm:w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
            <DatePickerInput
              value={toDate}
              onChange={setToDate}
              className="w-full sm:w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            disabled={filteredRows.length === 0}
            title={filteredRows.length === 0 ? "No data to view" : "View and download report"}
            className="flex h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Eye className="h-4 w-4" />
            View
          </button>
        </div>
      </div>

      {loading ? (
        <PageSkeleton hasButton={false} hasSearch={false} statCards={4} columns={7} />
      ) : viewMode === "datewise" ? (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs">
            <span className="font-semibold uppercase tracking-wider text-gray-500">Legend</span>
            {(isDriver
              ? ["On Trip", "On Halt", "Leave", "On Workshop", "Not Marked"]
              : ["Present", "Absent", "On Leave", "Holiday", "Not Marked"]
            ).map((s) => {
              const d = STATUS_DISPLAY[s] ?? STATUS_DISPLAY["Not Marked"];
              return (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold", d.cls)}>{d.abbr}</span>
                  <span className="text-gray-600">{s}</span>
                </span>
              );
            })}
          </div>

          <div className="overflow-auto max-h-[75vh] rounded-xl border border-gray-200 bg-white">
            <table className="border-collapse text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-50">
                  <th className="sticky left-0 z-30 min-w-[180px] border-b border-r border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {isDriver ? "Driver" : "Staff"}
                  </th>
                  {dates.map((d) => {
                    const [yy, mm, dd] = d.split("-").map(Number);
                    const dt = new Date(yy, mm - 1, dd);
                    const isSunday = dt.getDay() === 0;
                    const holidayName = !isDriver ? holidayMap[d] : undefined;
                    const isHoliday = Boolean(holidayName) && !isSunday;
                    return (
                      <th
                        key={d}
                        title={isSunday ? `${formatDate(d)} — Sunday` : holidayName ? `${formatDate(d)} — ${holidayName}` : undefined}
                        className={cn(
                          "min-w-[34px] border-b border-gray-200 px-1 py-2 text-center text-[10px] font-semibold",
                          isSunday ? "bg-red-50" : isHoliday ? "bg-blue-50" : ""
                        )}
                      >
                        <div className={isSunday ? "text-red-500" : isHoliday ? "text-blue-600" : "text-gray-700"}>{dd}</div>
                        <div className={isSunday ? "text-red-400" : isHoliday ? "text-blue-400" : "text-gray-400"}>{dt.toLocaleDateString("en-IN", { weekday: "narrow" })}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={dates.length + 1} className="px-4 py-10 text-center text-sm text-gray-400">
                      {search ? "No results match your search." : `No ${isDriver ? "drivers" : "staff"} found.`}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-4 py-2">
                        <div className="whitespace-nowrap font-medium text-gray-900">{r.name}</div>
                        <div className="text-xs text-gray-400">{r.code}</div>
                      </td>
                      {dates.map((d) => {
                        // Drivers key the status map by driver code; staff records
                        // key by the numeric staff id (which the summary exposes as r.id).
                        const recorded = statusMap[isDriver ? r.code : r.id]?.[d];
                        // Staff: Sunday / government holiday shows as "Holiday" unless a
                        // real attendance record was marked that day (record wins).
                        const [yy, mm, dd] = d.split("-").map(Number);
                        const isSunday = new Date(yy, mm - 1, dd).getDay() === 0;
                        const holidayName = !isDriver ? holidayMap[d] : undefined;
                        const isHoliday = !isDriver && (isSunday || Boolean(holidayName));
                        const st = recorded ?? (isHoliday ? "Holiday" : "Not Marked");
                        const disp = STATUS_DISPLAY[st] ?? STATUS_DISPLAY["Not Marked"];
                        const cellTitle = st === "Holiday"
                          ? `${formatDate(d)} — ${isSunday ? "Sunday" : holidayName}`
                          : `${formatDate(d)} — ${disp.title}`;
                        return (
                          <td key={d} className="px-1 py-2 text-center" title={cellTitle}>
                            <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold", disp.cls)}>
                              {disp.abbr}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {isDriver ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-medium tracking-wider text-blue-500 uppercase">On Trip</p>
                <p className="mt-1 text-2xl font-bold text-blue-700">{driverTotals.onTrip}</p>
              </div>
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-xs font-medium tracking-wider text-orange-500 uppercase">On Halt</p>
                <p className="mt-1 text-2xl font-bold text-orange-700">{driverTotals.onHalt}</p>
              </div>
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <p className="text-xs font-medium tracking-wider text-yellow-500 uppercase">Leave</p>
                <p className="mt-1 text-2xl font-bold text-yellow-700">{driverTotals.leave}</p>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                <p className="text-xs font-medium tracking-wider text-purple-500 uppercase">On Workshop</p>
                <p className="mt-1 text-2xl font-bold text-purple-700">{driverTotals.onWorkshop}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Not Marked</p>
                <p className="mt-1 text-2xl font-bold text-gray-500">{driverTotals.notMarked}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Present</p>
                <p className="mt-1 text-2xl font-bold text-green-600">{staffTotals.present}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Absent</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{staffTotals.absent}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total On Leave</p>
                <p className="mt-1 text-2xl font-bold text-yellow-600">{staffTotals.onLeave}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Not Marked</p>
                <p className="mt-1 text-2xl font-bold text-gray-500">{staffTotals.notMarked}</p>
              </div>
            </div>
          )}

          <div className="overflow-auto max-h-[75vh] rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50">
                  {(isDriver ? driverColumns : staffColumns).map((col) => (
                    <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={isDriver ? 9 : 7} className="px-4 py-10 text-center text-sm text-gray-400">
                      {search ? "No results match your search." : `No ${isDriver ? "drivers" : "staff"} found.`}
                    </td>
                  </tr>
                ) : isDriver ? (
                  filteredRows.map((r) => {
                    const active = r.onTrip + r.onHalt + r.onWorkshop;
                    const pct = r.totalDays > 0 ? Math.round((active / r.totalDays) * 100) : 0;
                    const driverRemarks = remarksByDriver[r.code] ?? [];
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.code}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 font-semibold text-blue-700">{r.onTrip}</td>
                        <td className="px-4 py-3 font-semibold text-orange-600">{r.onHalt}</td>
                        <td className="px-4 py-3 font-semibold text-yellow-700">{r.leave}</td>
                        <td className="px-4 py-3 font-semibold text-purple-700">{r.onWorkshop}</td>
                        <td className="px-4 py-3 text-gray-500">{r.notMarked}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            pct >= 90 ? "bg-green-100 text-green-700" : pct >= 70 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"
                          )}>
                            {pct}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <RemarksList remarks={driverRemarks} />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  filteredRows.map((r) => {
                    const pct = r.totalDays > 0 ? Math.round((r.present / r.totalDays) * 100) : 0;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.code}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 font-semibold text-green-700">{r.present}</td>
                        <td className="px-4 py-3 font-semibold text-red-600">{r.absent}</td>
                        <td className="px-4 py-3 font-semibold text-yellow-700">{r.onLeave}</td>
                        <td className="px-4 py-3 text-gray-500">{r.notMarked}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            pct >= 90 ? "bg-green-100 text-green-700" : pct >= 70 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"
                          )}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowReportModal(false); }}>
          <div className="w-full max-w-5xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
              <div>
                <p className="font-semibold text-gray-900">{isDriver ? "Driver" : "Staff"} Attendance {viewMode === "datewise" ? "Register" : "Report"}</p>
                <p className="text-xs text-gray-500">
                  Period: {fromDate === toDate ? formatDate(fromDate) : `${formatDate(fromDate)} – ${formatDate(toDate)}`} · {filteredRows.length} {isDriver ? "driver" : "staff"}{filteredRows.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button type="button" onClick={() => setShowReportModal(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>

            <div className="overflow-auto p-4">
              {viewMode === "datewise" ? (
                <table className="border-collapse text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50">
                      <th className="sticky left-0 z-20 min-w-[150px] border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold uppercase tracking-wider text-gray-500">{isDriver ? "Driver" : "Staff"}</th>
                      {dates.map((d) => (
                        <th key={d} className="min-w-[28px] border-b border-gray-200 px-1 py-2 text-center font-semibold text-gray-600">{Number(d.split("-")[2])}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-3 py-1.5">
                          <div className="whitespace-nowrap font-medium text-gray-900">{r.name}</div>
                          <div className="text-[10px] text-gray-400">{r.code}</div>
                        </td>
                        {dates.map((d) => {
                          const recorded = statusMap[isDriver ? r.code : r.id]?.[d];
                          const [yy, mm, dd] = d.split("-").map(Number);
                          const isHoliday = !isDriver && (new Date(yy, mm - 1, dd).getDay() === 0 || Boolean(holidayMap[d]));
                          const st = recorded ?? (isHoliday ? "Holiday" : "Not Marked");
                          const disp = STATUS_DISPLAY[st] ?? STATUS_DISPLAY["Not Marked"];
                          return (
                            <td key={d} className="px-1 py-1.5 text-center">
                              <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold", disp.cls)}>{disp.abbr}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {(isDriver
                        ? ["#", "Driver ID", "Name", "On Trip", "On Halt", "Leave", "On Workshop", "Not Marked", "Active %"]
                        : ["#", "Staff ID", "Name", "Present", "Absent", "On Leave", "Not Marked", "% Present"]
                      ).map((col) => (
                        <th key={col} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((r, idx) => {
                      const active = r.onTrip + r.onHalt + r.onWorkshop;
                      const dPct = r.totalDays > 0 ? Math.round((active / r.totalDays) * 100) : 0;
                      const sPct = r.totalDays > 0 ? Math.round((r.present / r.totalDays) * 100) : 0;
                      return (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{r.code}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.name}</td>
                          {isDriver ? (
                            <>
                              <td className="px-3 py-2 font-semibold text-blue-700">{r.onTrip}</td>
                              <td className="px-3 py-2 font-semibold text-orange-600">{r.onHalt}</td>
                              <td className="px-3 py-2 font-semibold text-yellow-700">{r.leave}</td>
                              <td className="px-3 py-2 font-semibold text-purple-700">{r.onWorkshop}</td>
                              <td className="px-3 py-2 text-gray-500">{r.notMarked}</td>
                              <td className="px-3 py-2 text-gray-700">{dPct}%</td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 font-semibold text-green-700">{r.present}</td>
                              <td className="px-3 py-2 font-semibold text-red-600">{r.absent}</td>
                              <td className="px-3 py-2 font-semibold text-yellow-700">{r.onLeave}</td>
                              <td className="px-3 py-2 text-gray-500">{r.notMarked}</td>
                              <td className="px-3 py-2 text-gray-700">{sPct}%</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border-t px-5 py-3 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={filteredRows.length === 0}
                className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Download Excel
              </button>
              <button
                type="button"
                onClick={async () => { await handleDownloadPDF(); }}
                disabled={downloading || filteredRows.length === 0}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                {downloading ? "Generating…" : "Download PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
