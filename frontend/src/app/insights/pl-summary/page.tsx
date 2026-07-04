"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  Loader2, Search, Route, Wrench, Landmark, FileText,
} from "lucide-react";
import { plSummaryApi, type TruckPLEntry } from "@/lib/api";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function thisMonth() {
  const now = new Date();
  return {
    start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
    end:   toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}
function lastMonth() {
  const now = new Date();
  return {
    start: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    end:   toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
}
function lastNMonths(n: number) {
  const now = new Date();
  return {
    start: toISO(new Date(now.getFullYear(), now.getMonth() - (n - 1), 1)),
    end:   toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}
function thisYear() {
  const y = new Date().getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

const PRESETS = [
  { label: "This Month",    fn: thisMonth },
  { label: "Last Month",    fn: lastMonth },
  { label: "Last 3 Months", fn: () => lastNMonths(3) },
  { label: "Last 6 Months", fn: () => lastNMonths(6) },
  { label: "This Year",     fn: thisYear },
] as const;

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return `₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

const DOC_LABELS: Record<string, string> = {
  rc:                    "RC (Road Certificate)",
  fc:                    "FC (Fitness Certificate)",
  road_tax:              "Road Tax",
  insurance:             "Insurance",
  national_permit:       "National Permit",
  local_permit:          "Local Permit",
  pollution_certificate: "Pollution Certificate",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: {
  label: string; value: number; sub?: string;
  color: "blue" | "slate" | "emerald" | "red";
}) {
  const colors = {
    blue:    "bg-blue-50 border-blue-200 text-blue-700",
    slate:   "bg-slate-50 border-slate-200 text-slate-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red:     "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{fmt(value)}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

function DetailPanel({ entry }: { entry: TruckPLEntry }) {
  const isProfit = entry.netPl >= 0;
  const docBreakdown   = entry.documentBreakdown ?? { rc: 0, fc: 0, road_tax: 0, insurance: 0, national_permit: 0, local_permit: 0, pollution_certificate: 0 };
  const tripRows       = entry.tripRows ?? [];
  const maintRows      = entry.maintenanceRows ?? [];
  const emiDetails     = entry.emiDetails ?? [];
  const hasDocDetail   = Object.values(docBreakdown).some((v) => v > 0);

  const avgHirePerTrip  = entry.tripCount > 0 ? entry.totalHireAmount / entry.tripCount : 0;
  const avgExpPerTrip   = entry.tripCount > 0 ? entry.tripExpenses / entry.tripCount : 0;
  const profitableTrips = tripRows.filter((t) => t.hireAmount - t.totalExpense >= 0).length;
  const tripMargin      = entry.totalHireAmount > 0
    ? ((entry.totalHireAmount - entry.tripExpenses) / entry.totalHireAmount) * 100
    : 0;

  return (
    <div className="space-y-6 px-6 py-5">

      {/* ── P&L Calculation walkthrough ───────────────────────────────────── */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
          How This P&amp;L Is Calculated
        </p>
        <div className="flex flex-wrap gap-3">
          {/* Income side */}
          <div className="min-w-[220px] flex-1 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-blue-500">Income</p>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-blue-700">Hire Amount ({entry.tripCount} trips)</span>
              <span className="text-sm font-bold text-blue-800">{fmt(entry.totalHireAmount)}</span>
            </div>
            <div className="mt-2 border-t border-blue-200 pt-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-600">Total Revenue</span>
              <span className="text-sm font-bold text-blue-800">{fmt(entry.totalHireAmount)}</span>
            </div>
          </div>

          {/* Cost side */}
          <div className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Costs Deducted</p>
            <div className="space-y-1.5">
              {[
                { label: "Trip Expenses (driver pay, tolls, port, etc.)", value: entry.tripExpenses, icon: "🚛" },
                { label: "Maintenance (in period)",                        value: entry.maintenanceExpenses, icon: "🔧" },
                { label: "EMI Share (pro-rated for period)",               value: entry.emiShare, icon: "🏦" },
                { label: "Document Amortisation (pro-rated share)",        value: entry.documentShare, icon: "📄" },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-start justify-between gap-2 py-1 border-b border-slate-200 last:border-0">
                  <span className="text-xs text-slate-600 leading-tight">
                    <span className="mr-1">{icon}</span>{label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-700">− {fmt(value)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-slate-300 pt-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Total Cost</span>
              <span className="text-sm font-bold text-slate-800">− {fmt(entry.totalCost)}</span>
            </div>
          </div>

          {/* Result */}
          <div className={`min-w-[160px] flex-none rounded-xl border p-4 flex flex-col items-center justify-center text-center ${
            isProfit ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
          }`}>
            {isProfit
              ? <TrendingUp className="mb-2 h-8 w-8 text-emerald-500" />
              : <TrendingDown className="mb-2 h-8 w-8 text-red-400" />}
            <p className={`text-xs font-semibold uppercase tracking-wider ${isProfit ? "text-emerald-600" : "text-red-500"}`}>
              Net P&amp;L
            </p>
            <p className={`mt-1 text-2xl font-bold ${isProfit ? "text-emerald-700" : "text-red-600"}`}>
              {isProfit ? "+" : "−"}{fmt(entry.netPl)}
            </p>
            <p className={`mt-1 text-xs font-medium ${isProfit ? "text-emerald-600" : "text-red-500"}`}>
              {isProfit ? "Profit" : "Loss"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Key Stats ────────────────────────────────────────────────────────── */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
          Performance Metrics
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              icon: <Route className="h-4 w-4 text-blue-500" />,
              label: "Total KM Driven",
              value: entry.totalKm > 0 ? `${entry.totalKm.toLocaleString("en-IN")} km` : "—",
            },
            {
              icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
              label: "Revenue per KM",
              value: entry.revenuePerKm > 0 ? `₹${entry.revenuePerKm.toFixed(2)}/km` : "—",
            },
            {
              icon: <FileText className="h-4 w-4 text-indigo-500" />,
              label: "Avg Hire per Trip",
              value: fmt(avgHirePerTrip),
            },
            {
              icon: <FileText className="h-4 w-4 text-slate-500" />,
              label: "Avg Expense per Trip",
              value: fmt(avgExpPerTrip),
            },
            {
              icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
              label: "Profitable Trips",
              value: entry.tripCount > 0
                ? `${profitableTrips} / ${entry.tripCount}`
                : "—",
            },
            {
              icon: <TrendingUp className="h-4 w-4 text-blue-500" />,
              label: "Trip Gross Margin",
              value: `${tripMargin.toFixed(1)}%`,
              note: "Before overheads",
            },
            {
              icon: <Wrench className="h-4 w-4 text-orange-500" />,
              label: "Maintenance Records",
              value: `${entry.maintenanceCount} records`,
            },
            {
              icon: <Landmark className="h-4 w-4 text-purple-500" />,
              label: "Active EMI Loans",
              value: `${emiDetails.length} loan${emiDetails.length !== 1 ? "s" : ""}`,
            },
          ].map(({ icon, label, value, note }) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {icon}
                <span>{label}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-gray-800">{value}</p>
              {note && <p className="text-[10px] text-gray-400">{note}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Trips in period ───────────────────────────────────────────────────── */}
      {tripRows.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Trips in Period ({tripRows.length})
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[700px] text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Date", "Sheet No", "Booking Ref", "Route", "Hire Amount", "Trip Expenses", "Trip P&L"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tripRows.map((t, i) => {
                  const tPl = t.hireAmount - t.totalExpense;
                  const tProfit = tPl >= 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(t.tripSheetDate)}</td>
                      <td className="px-3 py-2 font-medium text-gray-700">{t.tripSheetNo || "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{t.bookingReferenceNo || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {t.fromLocation && t.toLocation ? (
                          <span>
                            <span className="text-gray-600">{t.fromLocation}</span>
                            <span className="mx-1.5 text-gray-300">→</span>
                            <span className="text-gray-600">{t.toLocation}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        {t.totalKm > 0 && (
                          <span className="ml-2 text-[10px] text-gray-400">{t.totalKm.toLocaleString("en-IN")} km</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold text-blue-700">{fmt(t.hireAmount)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmt(t.totalExpense)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                          tProfit ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                        }`}>
                          {tProfit ? "▲" : "▼"} {fmt(tPl)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs">
                  <td colSpan={4} className="px-3 py-2 text-gray-600">Total</td>
                  <td className="px-3 py-2 text-blue-700">{fmt(entry.totalHireAmount)}</td>
                  <td className="px-3 py-2 text-gray-700">{fmt(entry.tripExpenses)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                      entry.totalHireAmount - entry.tripExpenses >= 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600"
                    }`}>
                      {entry.totalHireAmount - entry.tripExpenses >= 0 ? "▲" : "▼"}{" "}
                      {fmt(entry.totalHireAmount - entry.tripExpenses)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-1.5 text-[10px] text-gray-400 italic">
            Trip P&amp;L here = Hire − Trip Expenses only. Overhead costs (Maintenance, EMI, Documents) are fleet-level and shown in the summary above.
          </p>
        </div>
      )}

      {/* ── Maintenance records ───────────────────────────────────────────────── */}
      {maintRows.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Maintenance in Period ({maintRows.length} records · {fmt(entry.maintenanceExpenses)} total)
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[500px] text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Date", "Type", "Description", "Cost"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {maintRows.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(m.date)}</td>
                    <td className="px-3 py-2 font-medium text-gray-700">{m.maintenanceType || "—"}</td>
                    <td className="px-3 py-2 text-gray-500">{m.description || "—"}</td>
                    <td className="px-3 py-2 font-semibold text-orange-700">{fmt(m.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Document amortisation ──────────────────────────────────────────────── */}
      {hasDocDetail && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Document Amortisation Share ({fmt(entry.documentShare)} total)
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(docBreakdown).map(([key, val]) =>
              val > 0 ? (
                <div key={key} className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 min-w-[170px]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                    {DOC_LABELS[key] ?? key}
                  </p>
                  <p className="mt-1 text-sm font-bold text-indigo-700">{fmt(val)}</p>
                  <p className="text-[10px] text-indigo-400">period share</p>
                </div>
              ) : null
            )}
          </div>
          <p className="mt-2 text-[10px] text-gray-400 italic">
            Proportional-days amortisation. Road Tax &amp; Permits → 1-year validity assumed · Insurance → 1-year ending at expiry · Pollution Certificate → 6-month validity.
          </p>
        </div>
      )}

      {/* ── EMI details ─────────────────────────────────────────────────────────── */}
      {emiDetails.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            EMI Loans — Share for Period ({fmt(entry.emiShare)} total)
          </p>
          <div className="flex flex-wrap gap-3">
            {emiDetails.map((e, i) => (
              <div key={i} className="rounded-lg border border-purple-100 bg-purple-50 px-4 py-3 min-w-[200px]">
                <p className="text-xs font-semibold text-purple-700">{e.emiName}</p>
                {e.bankName && <p className="text-[10px] text-purple-400">{e.bankName}</p>}
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] text-purple-400">Monthly EMI</p>
                    <p className="text-sm font-semibold text-purple-600">{fmt(e.monthlyEmi)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-purple-400">Period share</p>
                    <p className="text-sm font-bold text-purple-800">{fmt(e.shareForPeriod)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-gray-400 italic">
            EMI share is pro-rated by the number of days the loan was active within the selected period.
          </p>
        </div>
      )}
    </div>
  );
}

function TruckRow({ entry }: { entry: TruckPLEntry }) {
  const [open, setOpen] = useState(false);
  const isProfit = entry.netPl >= 0;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <p className="font-semibold text-gray-900">{entry.truckId}</p>
          <p className="text-xs text-gray-500">{entry.registrationNumber}</p>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            {entry.tripCount}
          </span>
        </td>
        <td className="px-4 py-3 font-semibold text-blue-700">{fmt(entry.totalHireAmount)}</td>
        <td className="px-4 py-3 text-gray-600">{fmt(entry.tripExpenses)}</td>
        <td className="px-4 py-3 text-gray-600">{fmt(entry.maintenanceExpenses)}</td>
        <td className="px-4 py-3 text-gray-600">{fmt(entry.emiShare)}</td>
        <td className="px-4 py-3 text-gray-600">{fmt(entry.documentShare)}</td>
        <td className="px-4 py-3 font-semibold text-slate-700">{fmt(entry.totalCost)}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            isProfit ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
          }`}>
            {isProfit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {fmt(entry.netPl)}
            <span className="font-normal opacity-75">{isProfit ? "Profit" : "Loss"}</span>
          </span>
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
              open
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? "Hide" : "Details"}
          </button>
        </td>
      </tr>

      {open && (
        <tr className="bg-gray-50/80">
          <td colSpan={10} className="border-b border-gray-200">
            <DetailPanel entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PLSummaryPage() {
  const initial = thisMonth();
  const [startDate, setStartDate]     = useState(initial.start);
  const [endDate, setEndDate]         = useState(initial.end);
  const [activePreset, setActivePreset] = useState<string>("This Month");
  const [search, setSearch]           = useState("");
  const [data, setData]               = useState<TruckPLEntry[] | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const { start, end } = preset.fn();
    setStartDate(start);
    setEndDate(end);
    setActivePreset(preset.label);
  }

  async function fetchData() {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      setData(await plSummaryApi.get(startDate, endDate));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (e) => e.truckId.toLowerCase().includes(q) || e.registrationNumber.toLowerCase().includes(q)
    );
  }, [data, search]);

  const totals = useMemo(() => ({
    hire:  filtered.reduce((s, e) => s + e.totalHireAmount, 0),
    cost:  filtered.reduce((s, e) => s + e.totalCost, 0),
    pl:    filtered.reduce((s, e) => s + e.netPl, 0),
    trips: filtered.reduce((s, e) => s + e.tripCount, 0),
  }), [filtered]);

  const periodLabel = startDate && endDate ? `${fmtDate(startDate)} → ${fmtDate(endDate)}` : "";

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">P&amp;L Summary</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Profit &amp; Loss per truck — hire income minus all operating costs for the selected period.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                activePreset === p.label
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <DatePickerInput
              value={startDate}
              onChange={(v) => { setStartDate(v); setActivePreset(""); }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <DatePickerInput
              value={endDate}
              onChange={(v) => { setEndDate(v); setActivePreset(""); }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
          <button
            type="button" onClick={fetchData}
            disabled={loading || !startDate || !endDate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Loading…" : "Generate Report"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {data !== null && (
        <>
          {/* Fleet summary cards */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Fleet Summary · {periodLabel} · {totals.trips} trips across {filtered.length} trucks
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SummaryCard label="Total Hire Income"    value={totals.hire} color="blue" />
              <SummaryCard label="Total Operating Cost" value={totals.cost} color="slate" />
              <SummaryCard
                label="Net P&L" value={totals.pl}
                sub={totals.pl >= 0 ? "Overall Profit" : "Overall Loss"}
                color={totals.pl >= 0 ? "emerald" : "red"}
              />
              <SummaryCard
                label="Avg P&L per Truck"
                value={filtered.length > 0 ? totals.pl / filtered.length : 0}
                color={totals.pl >= 0 ? "emerald" : "red"}
              />
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Filter by truck ID or reg…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>

          {/* Per-truck table */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
              No data found for the selected period.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[1100px] text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {["Truck", "Trips", "Hire Income", "Trip Expenses", "Maintenance", "EMI", "Doc Share", "Total Cost", "Net P&L", ""].map((col, i) => (
                      <th key={i} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <TruckRow key={entry.truckId} entry={entry} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-gray-700">
                      Fleet Total
                      <span className="ml-1.5 text-xs font-normal text-gray-400">({filtered.length} trucks)</span>
                    </td>
                    <td className="px-4 py-3 text-center text-blue-700">{totals.trips}</td>
                    <td className="px-4 py-3 text-blue-700">{fmt(totals.hire)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(filtered.reduce((s, e) => s + e.tripExpenses, 0))}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(filtered.reduce((s, e) => s + e.maintenanceExpenses, 0))}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(filtered.reduce((s, e) => s + e.emiShare, 0))}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(filtered.reduce((s, e) => s + e.documentShare, 0))}</td>
                    <td className="px-4 py-3 text-slate-700">{fmt(totals.cost)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        totals.pl >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                      }`}>
                        {totals.pl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {fmt(totals.pl)}
                        <span className="font-normal opacity-75">{totals.pl >= 0 ? "Profit" : "Loss"}</span>
                      </span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {data === null && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <TrendingUp className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Select a date range and click Generate Report</p>
          <p className="mt-1 text-xs text-gray-400">
            P&amp;L = Hire Income − (Trip Expenses + Maintenance + EMI Share + Document Amortisation)
          </p>
        </div>
      )}
    </div>
  );
}
