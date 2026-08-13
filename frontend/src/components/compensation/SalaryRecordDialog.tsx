"use client";

import { useEffect, useState, useMemo } from "react";
import { Info, X, Download } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { tripsApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { TripSheetData } from "@/types/trip-sheet";
import type { Truck } from "@/types/truck";
import type { Branch } from "@/types/branch";
import type { CompensationPerson } from "./CompensationTable";

type Props = {
  open: boolean;
  onClose: () => void;
  driver: CompensationPerson | null;
  trips: Trip[];
  trucks: Truck[];
  branches: Branch[];
  onRecordPayment: (total: number) => Promise<void>;
};

type FilterMode = "all" | "thisMonth" | "custom";

const fmtCur = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// PDF-safe number (jsPDF Helvetica cannot render the ₹ glyph)
const fmtNum = (v: number) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

type Row = {
  tripId: string;
  driverName: string;
  truckReg: string;
  truckBranch: string;
  containerSpec: string;
  containerNo: string;
  bookingDate: string;
  tripCategory: string;
  cargoClassification: string;
  origin: string;
  destination: string;
  liftOnOff: number;
  totalExpenses: number;
  totalAdvance: number;
  outstandingAdvance: number;
  hireAmount: number;
  compensationPct: number;
  regularPay: number;
  netPayable: number;
  completedDate: string;
  hasSheet: boolean;
};

export function SalaryRecordDialog({ open, onClose, driver, trips, trucks, branches, onRecordPayment }: Props) {
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showFormulas, setShowFormulas] = useState(false);

  const driverTrips = useMemo(
    () =>
      trips.filter(
        (t) => driver && t.driverId === (driver.driverId ?? driver.id) && (t as any).hasSheet
      ),
    [trips, driver]
  );

  useEffect(() => {
    if (!open || !driver || driverTrips.length === 0) return;
    setLoading(true);
    setSheets(new Map());
    Promise.all(
      driverTrips.map((t) =>
        tripsApi
          .getSheet(t.id)
          .then((sheet) => (sheet ? { id: t.id, sheet } : null))
          .catch(() => null)
      )
    )
      .then((results) => {
        const map = new Map<string, TripSheetData>();
        for (const r of results) if (r) map.set(r.id, r.sheet);
        setSheets(map);
      })
      .finally(() => setLoading(false));
  }, [open, driver?.id]);

  useEffect(() => {
    if (open) {
      setFilterMode("all");
      setCustomFrom("");
      setCustomTo("");
    }
  }, [open]);

  const allRows = useMemo<Row[]>(
    () =>
      driverTrips.map((t) => {
        const sheet = sheets.get(t.id);
        const truck = trucks.find((tr) => tr.truckId === t.vehicleId);

        const liftOnOff = parseFloat(sheet?.liftOnOffExpense ?? "0") || 0;
        const totalExpenses = parseFloat(sheet?.driverExpensesTotal ?? "0") || 0;
        const totalAdvance = parseFloat(sheet?.driverAdvanceAmount ?? "0") || 0;
        const outstandingAdvance = totalAdvance - totalExpenses;
        const hireAmount = parseFloat(sheet?.hireAmount ?? t.transportHireAmount ?? "0") || 0;
        // Compensation % comes from the branch the truck is registered to; fall back to 10%
        const branch = branches.find(
          (b) => b.name.trim().toLowerCase() === (truck?.branchRegisteredTo ?? "").trim().toLowerCase()
        );
        const compensationPct = branch ? (parseFloat(branch.driverHaltDayPercentage) || 10) : 10;
        const regularPay = Math.round(hireAmount * compensationPct / 100);
        const netPayable = regularPay - outstandingAdvance;

        const containerNo =
          t.containerSpecification === "2 X 20 FEET CONTAINERS"
            ? [t.containerNumber1, t.containerNumber2].filter(Boolean).join(" / ")
            : t.containerNumber;

        return {
          tripId: t.tripId,
          driverName: driver?.name ?? "—",
          truckReg: t.truckRegistration ?? "—",
          truckBranch: truck?.branchRegisteredTo || "—",
          containerSpec: t.containerSpecification || "—",
          containerNo: containerNo || "—",
          bookingDate: t.bookingCreatedDate ?? "",
          tripCategory: t.tripCategory || "—",
          cargoClassification: t.cargoClassification || "—",
          origin: t.origin || "—",
          destination: t.destination || "—",
          liftOnOff,
          totalExpenses,
          totalAdvance,
          outstandingAdvance,
          hireAmount,
          compensationPct,
          regularPay,
          netPayable,
          completedDate: sheet?.tripCompletedDate ?? "",
          hasSheet: !!sheet,
        };
      }),
    [driverTrips, sheets, trucks, driver]
  );

  const rows = useMemo<Row[]>(() => {
    if (filterMode === "all") return allRows;

    const { from, to } =
      filterMode === "thisMonth" ? thisMonthRange() : { from: customFrom, to: customTo };

    if (!from && !to) return allRows;

    return allRows.filter((r) => {
      if (!r.completedDate) return false;
      if (from && r.completedDate < from) return false;
      if (to && r.completedDate > to) return false;
      return true;
    });
  }, [allRows, filterMode, customFrom, customTo]);

  const totalNetPayable = rows.reduce((sum, r) => sum + r.netPayable, 0);

  function filterLabel(): string {
    if (filterMode === "all") return "All Trips";
    if (filterMode === "thisMonth") {
      const { from, to } = thisMonthRange();
      return `This Month (${fmtDate(from)} – ${fmtDate(to)})`;
    }
    if (customFrom || customTo) return `${fmtDate(customFrom) || "Start"} – ${fmtDate(customTo) || "End"}`;
    return "Custom Range";
  }

  async function downloadPdf() {
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginX = 12;
    let y = 16;

    // Header block
    pdf.setFillColor(238, 242, 255);
    pdf.rect(0, 0, pageW, 28, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(40, 40, 120);
    pdf.text(`Salary Record — ${driver?.name ?? ""}`, marginX, 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Date Range: ${filterLabel()}     Trips: ${rows.length}     (All amounts in Rs)`, marginX, 20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 100, 30);
    pdf.text(`Total Net Payable (Rs): ${fmtNum(totalNetPayable)}`, pageW - marginX, 20, { align: "right" });
    y = 34;

    // All columns from the on-screen table (amounts flagged for Rs)
    type Col = { label: string; w: number; align: "left" | "right"; amt?: boolean };
    const cols: Col[] = [
      { label: "Trip ID",        w: 22, align: "left"  },
      { label: "Truck Reg",      w: 20, align: "left"  },
      { label: "Branch",         w: 16, align: "left"  },
      { label: "Container Spec", w: 22, align: "left"  },
      { label: "Container No",   w: 22, align: "left"  },
      { label: "Booking Date",   w: 18, align: "left"  },
      { label: "Trip Category",  w: 20, align: "left"  },
      { label: "Cargo Type",     w: 18, align: "left"  },
      { label: "Origin",         w: 18, align: "left"  },
      { label: "Destination",    w: 18, align: "left"  },
      { label: "Lift On/Off",    w: 18, align: "right", amt: true },
      { label: "Total Expenses", w: 18, align: "right", amt: true },
      { label: "Total Advance",  w: 18, align: "right", amt: true },
      { label: "Outstanding",    w: 18, align: "right", amt: true },
      { label: "Hire Amount",    w: 18, align: "right", amt: true },
      { label: "Regular Pay",    w: 16, align: "right", amt: true },
      { label: "Net Payable",    w: 18, align: "right", amt: true },
    ];
    const totalColW = cols.reduce((s, c) => s + c.w, 0);
    const scale = (pageW - marginX * 2) / totalColW;
    const scaledCols = cols.map((c) => ({
      ...c,
      w: c.w * scale,
      // append (Rs) to amount headers, then wrap into lines that fit the column
      lines: pdf.splitTextToSize(c.amt ? `${c.label} (Rs)` : c.label, c.w * scale - 2) as string[],
    }));

    const hdrLines = Math.max(...scaledCols.map((c) => c.lines.length));
    const hdrH = hdrLines * 3 + 3;
    const rowH = 6;

    const drawHeader = () => {
      pdf.setFillColor(220, 225, 255);
      pdf.rect(marginX, y, pageW - marginX * 2, hdrH, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6);
      pdf.setTextColor(50, 50, 110);
      let x = marginX;
      scaledCols.forEach((col) => {
        const tx = col.align === "right" ? x + col.w - 1.5 : x + 1.5;
        col.lines.forEach((ln, li) => {
          pdf.text(ln, tx, y + 3.5 + li * 3, { align: col.align });
        });
        x += col.w;
      });
      y += hdrH;
      pdf.setTextColor(30, 30, 30);
    };

    drawHeader();

    rows.forEach((row, idx) => {
      if (y + rowH > pageH - 16) {
        pdf.addPage();
        y = 14;
        drawHeader();
      }
      if (idx % 2 === 0) {
        pdf.setFillColor(248, 249, 255);
        pdf.rect(marginX, y, pageW - marginX * 2, rowH, "F");
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      const cells: string[] = [
        row.tripId,
        row.truckReg,
        row.truckBranch,
        row.containerSpec,
        row.containerNo,
        fmtDate(row.bookingDate),
        row.tripCategory,
        row.cargoClassification,
        row.origin,
        row.destination,
        row.hasSheet ? fmtNum(row.liftOnOff)        : "—",
        row.hasSheet ? fmtNum(row.totalExpenses)    : "—",
        row.hasSheet ? fmtNum(row.totalAdvance)     : "—",
        row.hasSheet ? fmtNum(row.outstandingAdvance) : "—",
        row.hasSheet ? fmtNum(row.hireAmount)       : "—",
        row.hasSheet ? fmtNum(row.regularPay)       : "—",
        row.hasSheet ? fmtNum(row.netPayable)       : "—",
      ];
      let x = marginX;
      cells.forEach((cell, ci) => {
        const col = scaledCols[ci];
        const text = pdf.splitTextToSize(String(cell), col.w - 2)[0] ?? "";
        const tx = col.align === "right" ? x + col.w - 1.5 : x + 1.5;
        pdf.text(text, tx, y + 4, { align: col.align });
        x += col.w;
      });
      y += rowH;
    });

    // Footer total bar
    y += 4;
    pdf.setFillColor(220, 245, 220);
    pdf.rect(marginX, y, pageW - marginX * 2, 9, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(20, 100, 20);
    pdf.text("Total Net Payable (Rs)", marginX + 2, y + 6);
    pdf.text(fmtNum(totalNetPayable), pageW - marginX - 2, y + 6, { align: "right" });

    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(160);
    pdf.text(`Generated on ${today} | Canaan Global`, marginX, pageH - 5);
    pdf.save(`Salary_Record_${(driver?.name ?? "Driver").replace(/\s+/g, "_")}_${filterMode}.pdf`);
  }

  const filterBubble = (label: string, mode: FilterMode) => (
    <button
      type="button"
      onClick={() => setFilterMode(mode)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        filterMode === mode
          ? "bg-indigo-600 text-white shadow-sm"
          : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );

  const thClass = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap text-left";
  const thRClass = `${thClass} text-right`;

  function OutstandingCell({ v }: { v: number }) {
    if (!v && v !== 0) return <span className="text-gray-400">—</span>;
    if (v > 0)
      return <span className="font-semibold text-amber-600">{fmtCur(v)}</span>;
    if (v < 0)
      return <span className="font-semibold text-red-600">{fmtCur(v)}</span>;
    return <span className="text-gray-400">₹0.00</span>;
  }

  function NetPayableCell({ v }: { v: number }) {
    if (v > 0)
      return <span className="font-bold text-emerald-700">{fmtCur(v)}</span>;
    if (v < 0)
      return <span className="font-bold text-red-600">{fmtCur(v)}</span>;
    return <span className="font-semibold text-gray-500">₹0.00</span>;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Salary Record — ${driver?.name ?? ""}`}
      className="w-[95vw] max-w-[95vw] h-[90vh]"
    >
      {/* Filter row */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {filterBubble("All", "all")}
          {filterBubble("This Month", "thisMonth")}
          {filterBubble("Custom Range", "custom")}
          {filterMode === "custom" && (
            <div className="flex items-center gap-2 text-sm">
              <DatePickerInput
                value={customFrom}
                onChange={(v) => setCustomFrom(v)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none"
              />
              <span className="text-gray-400">→</span>
              <DatePickerInput
                value={customTo}
                onChange={(v) => setCustomTo(v)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={downloadPdf}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => setShowFormulas((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all ${
              showFormulas
                ? "border-indigo-300 bg-indigo-600 text-white shadow-indigo-200"
                : "border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
            }`}
          >
            {showFormulas ? <X className="h-3 w-3" /> : <Info className="h-3 w-3" />}
            {showFormulas ? "Close" : "How is this calculated?"}
          </button>
        </div>
      </div>

      {/* Formula reference panel */}
      {showFormulas && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          {/* Panel header */}
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/30 px-5 py-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
              <Info className="h-4 w-4 text-indigo-600" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">Column Calculation Reference</p>
              <p className="text-[11px] text-slate-400">How every value in the table is sourced or computed</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[560px]">

              {/* ── Section 1: Auto-fetched ── */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-sky-50/60 px-5 py-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-sky-500">Auto-fetched from trip data</p>
              </div>
              {(
                [
                  ["Trip ID",         "Unique booking reference number for the trip"],
                  ["Driver",          "Driver assigned to this trip"],
                  ["Truck Reg",       "Registration number of the assigned truck"],
                  ["Branch",          "Branch this truck belongs to — pulled from Truck Master (e.g. Chennai / Tuticorin)"],
                  ["Container Spec",  "Container size / type: 20 FT · 40 FT · 2×20 FT · Open Load"],
                  ["Container No",    "Container number(s) — for 2×20 FT both numbers are shown separated by /"],
                  ["Booking Date",    "Date the booking was created"],
                  ["Trip Category",   "LOCAL · LOCAL CFS · OUTSTATION · SHIFTING · RETURN TRIP"],
                  ["Cargo Type",      "IMPORT · EXPORT · EMPTY · CFS LADEN · COASTAL · OPEN LOAD"],
                  ["Origin",          "Pick-up / loading location"],
                  ["Destination",     "Drop-off / unloading location"],
                ] as [string, string][]
              ).map(([col, note]) => (
                <div key={col} className="grid grid-cols-[160px_1fr] items-start gap-4 border-b border-slate-50 px-5 py-2.5 hover:bg-slate-50/70">
                  <span className="text-xs font-semibold text-slate-700">{col}</span>
                  <span className="text-xs leading-relaxed text-slate-500">{note}</span>
                </div>
              ))}

              {/* ── Section 2: From trip sheet ── */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-violet-50/60 px-5 py-2">
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-violet-500">Fetched from trip sheet</p>
              </div>
              {(
                [
                  ["Lift On/Off",    "Trip sheet → Lift On / Off Expense",              "Amount paid for container lift-on or lift-off at port / depot"],
                  ["Total Expenses", "Trip sheet → Driver Expenses (out-of-pocket)",     "Driver batta + all expenses the driver paid from his own pocket — port pass, mamol, tolls, parking, etc."],
                  ["Total Advance",  "Trip sheet → Driver Advance Amount",               "Initial advance + any additional advance paid before or during the trip"],
                  ["Hire Amount",    "Trip sheet → Hire Amount",                         "Agreed freight / transport hire for this trip"],
                ] as [string, string, string][]
              ).map(([col, src, note]) => (
                <div key={col} className="grid grid-cols-[160px_1fr] items-start gap-4 border-b border-slate-50 px-5 py-2.5 hover:bg-slate-50/70">
                  <span className="text-xs font-semibold text-slate-700">{col}</span>
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex w-fit items-center rounded-md bg-violet-100 px-2 py-0.5 font-mono text-[11px] font-medium text-violet-700">{src}</span>
                    <span className="text-xs leading-relaxed text-slate-500">{note}</span>
                  </div>
                </div>
              ))}

              {/* ── Section 3: Calculated ── */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-emerald-50/60 px-5 py-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600">Calculated fields</p>
              </div>

              {/* Outstanding Advance */}
              <div className="grid grid-cols-[160px_1fr] items-start gap-4 border-b border-slate-50 px-5 py-3 hover:bg-slate-50/70">
                <span className="text-xs font-semibold text-slate-700">Outstanding Advance</span>
                <div className="flex flex-col gap-2">
                  <span className="inline-flex w-fit items-center rounded-md bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-700">
                    Total Advance − Total Expenses
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-600">&gt; 0</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">Advance balance still in driver&apos;s hand — driver has company money left over</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-red-100 px-1.5 py-px text-[10px] font-bold text-red-500">&lt; 0</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">Driver spent own money — company owes the driver reimbursement</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-1.5 py-px text-[10px] font-bold text-gray-400">= 0</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">Fully settled — no balance either way</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Regular Pay */}
              <div className="grid grid-cols-[160px_1fr] items-start gap-4 border-b border-slate-50 px-5 py-3 hover:bg-slate-50/70">
                <span className="text-xs font-semibold text-slate-700">Regular Pay</span>
                <div className="flex flex-col gap-1.5">
                  <span className="inline-flex w-fit items-center rounded-md bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700">
                    Driver Compensation % × Hire Amount
                  </span>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    The compensation percentage is set per branch in <span className="font-semibold text-slate-700">Admin → Branch Management → Driver Compensation %</span>.
                    The truck&apos;s registered branch determines which % is used.
                  </p>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-blue-100 px-1.5 py-px text-[10px] font-bold text-blue-600">e.g.</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Truck branch = Tuticorin (12%) · Hire ₹10,000 → Regular Pay ₹1,200
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-1.5 py-px text-[10px] font-bold text-gray-500">default</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Falls back to 10% if the truck&apos;s branch has no compensation % configured
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Net Payable */}
              <div className="grid grid-cols-[160px_1fr] items-start gap-4 px-5 py-3 hover:bg-slate-50/70">
                <span className="text-xs font-semibold text-slate-700">Net Payable</span>
                <div className="flex flex-col gap-2">
                  <span className="inline-flex w-fit items-center rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700">
                    Regular Pay − Outstanding Advance
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-600">Outstanding &gt; 0</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">Deducts the leftover advance — company pays less since driver already holds cash</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-red-100 px-1.5 py-px text-[10px] font-bold text-red-500">Outstanding &lt; 0</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">Adds reimbursement — subtracting a negative increases the payout (company owes extra)</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-1.5 py-px text-[10px] font-bold text-gray-400">Outstanding = 0</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">No adjustment — Net Payable equals Regular Pay exactly</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">Loading trip data…</div>
      ) : allRows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          No completed trips with sheets found for this driver.
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          No trips match the selected date filter.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-auto max-h-[calc(90vh-340px)] rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={thClass}>Trip ID</th>
                  <th className={thClass}>Driver</th>
                  <th className={thClass}>Truck Reg</th>
                  <th className={thClass}>Branch</th>
                  <th className={thClass}>Container Spec</th>
                  <th className={thClass}>Container No</th>
                  <th className={thClass}>Booking Date</th>
                  <th className={thClass}>Trip Category</th>
                  <th className={thClass}>Cargo Type</th>
                  <th className={thClass}>Origin</th>
                  <th className={thClass}>Destination</th>
                  <th className={thRClass}>Lift On/Off</th>
                  <th className={thRClass}>Total Expenses</th>
                  <th className={thRClass}>Total Advance</th>
                  <th className={thRClass}>Outstanding</th>
                  <th className={thRClass}>Hire Amount</th>
                  <th className={thRClass}>Regular Pay</th>
                  <th className={thRClass}>Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr key={`${row.tripId}-${i}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-indigo-700">{row.tripId}</td>
                    <td className="px-3 py-2.5 text-gray-700">{row.driverName}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-700">{row.truckReg}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.truckBranch}</td>
                    <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">{row.containerSpec}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-700">{row.containerNo}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtDate(row.bookingDate)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.tripCategory}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.cargoClassification}</td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[130px] truncate">{row.origin}</td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[130px] truncate">{row.destination}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {row.hasSheet ? fmtCur(row.liftOnOff) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 font-medium">
                      {row.hasSheet ? fmtCur(row.totalExpenses) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 font-medium">
                      {row.hasSheet ? fmtCur(row.totalAdvance) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {row.hasSheet ? <OutstandingCell v={row.outstandingAdvance} /> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {row.hasSheet ? fmtCur(row.hireAmount) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-700 font-semibold">
                      {row.hasSheet ? (
                        <span title={`${row.compensationPct}% of hire amount`}>{fmtCur(row.regularPay)}</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {row.hasSheet ? <NetPayableCell v={row.netPayable} /> : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
              Outstanding &gt; 0: advance balance still in driver&apos;s hand
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
              Outstanding &lt; 0: driver spent own money — company owes reimbursement
            </span>
          </div>

          {/* Net payable summary */}
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-sm font-semibold text-gray-700">
              Total Net Payable
              {filterMode !== "all" && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({rows.length} trip{rows.length !== 1 ? "s" : ""})
                </span>
              )}
            </span>
            <span className="text-lg font-bold text-emerald-700">{fmtCur(totalNetPayable)}</span>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              type="button"
              disabled={saving || totalNetPayable <= 0}
              onClick={async () => {
                setSaving(true);
                await onRecordPayment(totalNetPayable);
                setSaving(false);
              }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Record Salary Payment"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
