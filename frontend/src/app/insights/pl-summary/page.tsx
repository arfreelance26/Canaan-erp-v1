"use client";

import { Fragment, useState, useMemo, useEffect } from "react";
import {
  TrendingUp, TrendingDown,
  Loader2, BarChart3, ArrowRight,
  DollarSign, Wrench, Landmark, AlertCircle, CalendarDays, FileDown, X, ShieldCheck, ChevronDown,
  Calculator, Compass, Route, FileText, Fuel, MousePointerClick, SlidersHorizontal,
} from "lucide-react";
import { plSummaryApi, type TruckPLEntry, type TruckPLTripRow } from "@/lib/api";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import logoSrc from "@/app/companylogo.png";

// ── Date helpers ───────────────────────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function thisMonth()    { const n = new Date(); return { start: toISO(new Date(n.getFullYear(), n.getMonth(), 1)), end: toISO(new Date(n.getFullYear(), n.getMonth() + 1, 0)) }; }
function lastMonth()    { const n = new Date(); return { start: toISO(new Date(n.getFullYear(), n.getMonth() - 1, 1)), end: toISO(new Date(n.getFullYear(), n.getMonth(), 0)) }; }
function lastNMonths(n: number) { const d = new Date(); return { start: toISO(new Date(d.getFullYear(), d.getMonth() - (n - 1), 1)), end: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }; }
function thisYear()     { const y = new Date().getFullYear(); return { start: `${y}-01-01`, end: `${y}-12-31` }; }

const PRESETS = [
  { label: "This Month",    fn: thisMonth },
  { label: "Last Month",    fn: lastMonth },
  { label: "Last 3 Months", fn: () => lastNMonths(3) },
  { label: "Last 6 Months", fn: () => lastNMonths(6) },
  { label: "This Year",     fn: thisYear },
] as const;

// ── Formatting ─────────────────────────────────────────────────────────────────
// Indian abbreviated currency: ≥1 crore → Cr, ≥1 lakh → L, otherwise full ₹ amount.
function fmt(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(abs / 1e7).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
  if (abs >= 1e5) return `₹${(abs / 1e5).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
  return `₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────
type EnrichedTrip = TruckPLTripRow & {
  truckId: string;
  registrationNumber: string;
  tripPl: number;
};

type EnrichedTruck = TruckPLEntry & {
  tripPl: number;
  netTruckPl: number;
};

type Tab = "trips" | "trucks";
type TripSortKey = "date" | "hire" | "expense" | "pl";

// ── Shared components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode;
  color: "blue" | "emerald" | "red" | "amber" | "purple" | "slate";
}) {
  const ring = { blue: "border-blue-200 bg-blue-50", emerald: "border-emerald-200 bg-emerald-50", red: "border-red-200 bg-red-50", amber: "border-amber-200 bg-amber-50", purple: "border-purple-200 bg-purple-50", slate: "border-slate-200 bg-slate-50" };
  const txt  = { blue: "text-blue-700", emerald: "text-emerald-700", red: "text-red-700", amber: "text-amber-700", purple: "text-purple-700", slate: "text-slate-700" };
  return (
    <div className={`rounded-xl border p-5 ${ring[color]}`}>
      <div className={`flex items-center gap-2 mb-2 ${txt[color]}`}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <p className={`text-xl font-bold ${txt[color]}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${txt[color]} opacity-60`}>{sub}</p>}
    </div>
  );
}

function PlBadge({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const p = value >= 0;
  const base = p ? "bg-emerald-100 text-emerald-700 dark:text-emerald-900" : "bg-red-100 text-red-600 dark:text-red-900";
  const cls  = size === "lg"
    ? `inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold ${base}`
    : `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${base}`;
  return (
    <span className={cls}>
      {p ? <TrendingUp className="h-3.5 w-3.5 shrink-0" /> : <TrendingDown className="h-3.5 w-3.5 shrink-0" />}
      {p ? "+" : "−"}{fmt(value)}
    </span>
  );
}

function SortTh({ label, col, current, dir, onSort }: {
  label: string; col: TripSortKey; current: TripSortKey; dir: "asc" | "desc";
  onSort: (c: TripSortKey) => void;
}) {
  const active = current === col;
  return (
    <th
      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer select-none hover:text-blue-600 whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}{active ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

// ── Guide modal shell ────────────────────────────────────────────────────────────
type GuideTab = "Overview" | "Manual" | "Basic" | "Advanced";
const GUIDE_TABS: GuideTab[] = ["Overview", "Manual", "Basic", "Advanced"];
const MODE_DOT: Record<GuideTab, string> = { Overview: "bg-blue-500", Manual: "bg-amber-400", Basic: "bg-teal-500", Advanced: "bg-violet-500" };

function ModalShell({ title, subtitle, icon, onClose, tabBar, children }: {
  title: string; subtitle?: string; icon: React.ReactNode; onClose: () => void;
  tabBar?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600 shrink-0">{icon}</div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>
        {tabBar && <div className="px-6 pt-4 shrink-0">{tabBar}</div>}
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ModeTabBar({ active, onChange }: { active: GuideTab; onChange: (t: GuideTab) => void }) {
  return (
    <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
      {GUIDE_TABS.map((t) => (
        <button
          key={t} type="button" onClick={() => onChange(t)}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
            active === t ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${MODE_DOT[t]}`} />
          {t}
        </button>
      ))}
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-[11px] leading-relaxed text-slate-100 overflow-x-auto">
      {children}
    </div>
  );
}

function GuideSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-400">
        {icon}{title}
      </p>
      <div className="space-y-2 text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

// ── "How is it Calculated" modal ─────────────────────────────────────────────────
function HowCalculatedModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<GuideTab>("Overview");
  return (
    <ModalShell
      title="How is it Calculated"
      subtitle="Formulas behind every figure on this page"
      icon={<Calculator className="h-5 w-5" />}
      onClose={onClose}
      tabBar={<ModeTabBar active={tab} onChange={setTab} />}
    >
      {tab === "Overview" && (
        <>
          <GuideSection title="Data source" icon={<FileText className="h-3.5 w-3.5" />}>
            <p>
              Every figure comes from the backend <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">/pl-summary</code> endpoint
              for your selected date range. It pulls trip hire &amp; expenses, maintenance records, EMI loans, and document/compliance
              validity windows (RC, FC, Road Tax, Insurance, National/Local Permit, Pollution Certificate) — all pro-rated to the exact days
              that fall inside your period.
            </p>
          </GuideSection>

          <GuideSection title="Trip Profitability tab" icon={<Route className="h-3.5 w-3.5" />}>
            <p>Per trip:</p>
            <Formula>Gross Profit&nbsp;&nbsp;=&nbsp;&nbsp;Hire Amount − Trip Expenses</Formula>
            <Formula>Truck Expenses&nbsp;&nbsp;=&nbsp;&nbsp;Total KM × Cost/KM&nbsp;&nbsp;(from the selected mode)</Formula>
            <Formula>Final Profit&nbsp;&nbsp;=&nbsp;&nbsp;Gross Profit − Truck Expenses</Formula>
          </GuideSection>

          <GuideSection title="Truck Profitability tab" icon={<Wrench className="h-3.5 w-3.5" />}>
            <p>Aggregated per truck across every trip in the period:</p>
            <Formula>Total Gross Profit&nbsp;&nbsp;=&nbsp;&nbsp;Total Hire Amount − Total Trip Expenses</Formula>
            <Formula>Final Profit&nbsp;&nbsp;=&nbsp;&nbsp;Total Gross Profit − (Total KM × Cost/KM)</Formula>
            <Formula>
              Net P&amp;L&nbsp;&nbsp;=&nbsp;&nbsp;Total Gross Profit − EMI Share − Maintenance − Document/Compliance Share
            </Formula>
            <p className="text-xs text-gray-500">
              <b>Net P&amp;L</b> is calculated entirely from real backend records (loans, maintenance bills, document renewals) and does
              <b> not</b> depend on the Cost/KM mode. <b>Final Profit</b> is the only figure that changes per mode, since it depends on the
              Running Cost Calculator&rsquo;s Cost/KM value. Click any truck row to expand the full breakdown.
            </p>
            <ul className="ml-4 list-disc space-y-1 text-xs text-gray-600">
              <li><b>EMI Share</b> — monthly EMI × (days of the period the loan was active ÷ 30), summed across every active loan.</li>
              <li><b>Maintenance</b> — sum of all maintenance record costs dated inside the period.</li>
              <li><b>Document/Compliance Share</b> — each document&rsquo;s renewal cost spread evenly across its validity window, then the days that overlap your period are billed.</li>
            </ul>
          </GuideSection>

          <GuideSection title="Cost/KM modes" icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
            <p>
              Switch to the <b>Manual</b>, <b>Basic</b>, or <b>Advanced</b> tab above for how each one sources its Cost/KM figure —
              the number that drives every &ldquo;Truck Expenses&rdquo; and &ldquo;Final Profit&rdquo; column on this page.
            </p>
          </GuideSection>
        </>
      )}

      {tab === "Manual" && (
        <>
          <GuideSection title="How Manual mode works" icon={<Fuel className="h-3.5 w-3.5" />}>
            <p>
              Every cost input — diesel price/litre, mileage, tyre cost, EMI, AdBlue, maintenance and compliance cost per km — is
              typed in by hand on the <b>Running Cost Calculator</b> page. One set of values is applied uniformly to whichever trucks
              you assign it to; nothing is auto-fetched.
            </p>
          </GuideSection>
          <GuideSection title="What that means here">
            <p>
              Truck Expenses = Total KM × the Cost/KM you manually entered for that truck under Manual mode. If you haven&rsquo;t set a
              value for a truck yet, its Truck Expenses / Final Profit columns show <span className="text-gray-400">—</span>.
            </p>
            <p className="text-xs text-gray-500">Best for: quick, rough what-if estimates without needing live fleet data.</p>
          </GuideSection>
        </>
      )}

      {tab === "Basic" && (
        <>
          <GuideSection title="How Basic mode works" icon={<Fuel className="h-3.5 w-3.5" />}>
            <p>
              Blends auto-fetched defaults with a few editable fields: diesel price is pulled from Maintenance → Fuel History
              (&ldquo;Set Base Litre Cost&rdquo;), tyre cost comes from Admin → Tyre Cost Configuration, and AdBlue defaults come from the
              manufacturer&rsquo;s default price/consumption. EMI fields (amount, per-day, per-km) stay manually editable, falling back to a
              fetched value only if left blank.
            </p>
          </GuideSection>
          <GuideSection title="What that means here">
            <p>
              Truck Expenses = Total KM × the Cost/KM computed under Basic mode for that truck. It updates automatically when the
              underlying fuel price or tyre configuration changes, but still needs a value to be present for each truck.
            </p>
            <p className="text-xs text-gray-500">Best for: day-to-day estimates that track real fuel/tyre pricing without full per-truck automation.</p>
          </GuideSection>
        </>
      )}

      {tab === "Advanced" && (
        <>
          <GuideSection title="How Advanced mode works" icon={<Fuel className="h-3.5 w-3.5" />}>
            <p>Fully automatic and read-only — nothing is typed in. Every input is strictly fetched per truck:</p>
            <ul className="ml-4 list-disc space-y-1 text-xs text-gray-600">
              <li>Mileage — lifetime average (km/L) from Maintenance → Fuel History</li>
              <li>Tyre cost/km — Tyre Management → View Tyre Data</li>
              <li>Maintenance cost/km — Truck Maintenance → Full Status</li>
              <li>Compliance cost/km — Compliance &amp; Renewals → View Cost Breakdown</li>
              <li>EMI — fetched directly, no manual override</li>
              <li>AdBlue cost/km — AdBlue Management page</li>
            </ul>
          </GuideSection>
          <GuideSection title="What that means here">
            <p>
              Truck Expenses = Total KM × the Cost/KM computed under Advanced mode — the most accurate figure available, since it&rsquo;s
              built entirely from each truck&rsquo;s own live records rather than a shared estimate. A truck with incomplete records (e.g. no
              Fuel History entries) may still show <span className="text-gray-400">—</span> for that field.
            </p>
            <p className="text-xs text-gray-500">Best for: final, audit-grade profitability figures once a truck&rsquo;s data is fully maintained.</p>
          </GuideSection>
        </>
      )}
    </ModalShell>
  );
}

// ── "Quick Start Guide" modal ─────────────────────────────────────────────────────
function QuickStartModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<GuideTab>("Overview");
  return (
    <ModalShell
      title="Quick Start Guide"
      subtitle="Get comfortable with this page in under a minute"
      icon={<Compass className="h-5 w-5" />}
      onClose={onClose}
      tabBar={<ModeTabBar active={tab} onChange={setTab} />}
    >
      {tab === "Overview" && (
        <div className="space-y-4">
          {[
            { n: 1, title: "Pick a period", body: "Use a quick preset (This Month, Last 3 Months, …) or set a custom From/To date. Data loads automatically." },
            { n: 2, title: "Choose a tab", body: "Trip Profitability lists every individual trip; Truck Profitability aggregates everything per truck for the period." },
            { n: 3, title: "Pick a Cost/KM mode", body: "Manual, Basic or Advanced — controls only the \"Truck Expenses\" and \"Final Profit\" columns. Set actual values first on the Running Cost Calculator page (see the mode tabs above for how each one works)." },
            { n: 4, title: "Expand a truck row", body: "In Truck Profitability, click any row to open the full Net P&L walkthrough — EMI loans, maintenance records, document/compliance share, and the trip list behind the numbers." },
            { n: 5, title: "Read the summary cards", body: "Total Trips/Trucks, Profitable count, Hire Revenue, Net P&L and Final Profit — a snapshot before you dig into the table." },
            { n: 6, title: "Generate a report", body: "Click \"Generate Report\" top-right to preview the current tab/period/mode, then export it as a PDF." },
          ].map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{s.n}</div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Manual" && (
        <div className="space-y-4">
          <GuideSection title="Getting started with Manual mode" icon={<MousePointerClick className="h-3.5 w-3.5" />}>
            <p>1. Go to <b>Running Cost Calculator</b> → switch to the Manual tab.</p>
            <p>2. Type in diesel price/litre, mileage, tyre cost, EMI and AdBlue figures for a truck.</p>
            <p>3. Come back here, select the <b>Manual</b> mode pill next to the tab bar — Truck Expenses / Final Profit fill in immediately.</p>
          </GuideSection>
          <p className="text-xs text-gray-500">Nothing here is fetched automatically, so revisit the Calculator whenever diesel prices or other costs change.</p>
        </div>
      )}

      {tab === "Basic" && (
        <div className="space-y-4">
          <GuideSection title="Getting started with Basic mode" icon={<MousePointerClick className="h-3.5 w-3.5" />}>
            <p>1. Make sure Maintenance → Fuel History has a base litre cost set, and Admin → Tyre Cost Configuration is filled in.</p>
            <p>2. Go to <b>Running Cost Calculator</b> → Basic tab — fuel/tyre pull in automatically; fill in the EMI fields if they&rsquo;re blank.</p>
            <p>3. Come back here and select the <b>Basic</b> mode pill — figures update to match.</p>
          </GuideSection>
          <p className="text-xs text-gray-500">A lighter-touch option than Manual — most inputs stay current on their own.</p>
        </div>
      )}

      {tab === "Advanced" && (
        <div className="space-y-4">
          <GuideSection title="Getting started with Advanced mode" icon={<MousePointerClick className="h-3.5 w-3.5" />}>
            <p>1. Make sure each truck has real records in Fuel History, Tyre Management, Truck Maintenance and Compliance &amp; Renewals.</p>
            <p>2. Go to <b>Running Cost Calculator</b> → Advanced tab to confirm every field is populated (it&rsquo;s read-only — nothing to type).</p>
            <p>3. Come back here and select the <b>Advanced</b> mode pill for the most accurate Truck Expenses / Final Profit figures.</p>
          </GuideSection>
          <p className="text-xs text-gray-500">If a truck is missing source data, its Truck Expenses / Final Profit will show as &ldquo;—&rdquo; until that data exists.</p>
        </div>
      )}
    </ModalShell>
  );
}

// ── Label helpers ──────────────────────────────────────────────────────────────

const LABEL_MAP: Record<string, string> = {
  "20 FT CONTAINER":        "20 FT",
  "40 FT CONTAINER":        "40 FT",
  "2 X 20 FEET CONTAINERS": "2×20 FT",
  "OPEN LOAD CARGO":        "Open Load",
  "IMPORT":                 "Import",
  "EXPORT":                 "Export",
  "EMPTY":                  "Empty",
  "CFS LADEN":              "CFS Laden",
  "OPEN LOAD":              "Open Load",
  "COASTAL":                "Coastal",
  "RETURN TRIP":            "Return Trip",
  "LOCAL":                  "Local",
  "LOCAL CFS":              "Local CFS",
  "OUTSTATION":             "Outstation",
  "SHIFTING":               "Shifting",
};
function shortLabel(v: string) { return LABEL_MAP[v] ?? v; }

// ── Trip Profitability tab ─────────────────────────────────────────────────────
function TripProfitabilityTab({ trips, mode }: { trips: EnrichedTrip[]; mode: "Manual" | "Basic" | "Advanced" }) {
  const [sortKey, setSortKey] = useState<TripSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Cost-per-km map written by Running Cost Calculator, keyed by truckId (fleet ID) per mode
  const [costPerKmMap, setCostPerKmMap] = useState<Record<string, Record<string, number | null>>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("canaan_rcc_cost_per_km");
      if (raw) setCostPerKmMap(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [mode]);

  function toggleSort(col: TripSortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("desc"); }
  }

  // ── Sorted trips ──────────────────────────────────────────────────────────
  const sorted = useMemo(() => [...trips].sort((a, b) => {
    let d = 0;
    if (sortKey === "date")    d = a.tripSheetDate.localeCompare(b.tripSheetDate);
    if (sortKey === "hire")    d = a.hireAmount - b.hireAmount;
    if (sortKey === "expense") d = a.totalExpense - b.totalExpense;
    if (sortKey === "pl")      d = a.tripPl - b.tripPl;
    return sortDir === "asc" ? d : -d;
  }), [trips, sortKey, sortDir]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const profitable = trips.filter((t) => t.tripPl >= 0).length;
  const totalHire  = trips.reduce((s, t) => s + t.hireAmount, 0);
  const totalExp   = trips.reduce((s, t) => s + t.totalExpense, 0);
  const netPl      = trips.reduce((s, t) => s + t.tripPl, 0);
  const { total: finalProfit, hasCpk: hasCpkTrips } = trips.reduce((acc, t) => {
    const cpk = costPerKmMap[mode]?.[t.truckId];
    const truckExp = (cpk != null && t.totalKm > 0) ? t.totalKm * cpk : null;
    if (truckExp != null) return { total: acc.total + (t.hireAmount - t.totalExpense - truckExp), hasCpk: true };
    return acc;
  }, { total: 0, hasCpk: false });

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total Trips"      value={String(trips.length)} icon={<BarChart3 className="h-4 w-4" />} color="blue" />
        <StatCard label="Profitable Trips" value={`${profitable} / ${trips.length}`}
          sub={trips.length ? `${((profitable / trips.length) * 100).toFixed(0)}% success rate` : ""}
          icon={<TrendingUp className="h-4 w-4" />} color="emerald" />
        <StatCard label="Total Hire Revenue" value={fmt(totalHire)} sub={`Expenses: ${fmt(totalExp)}`}
          icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Net Trip P&L" value={fmt(netPl)} sub={netPl >= 0 ? "Overall Profit" : "Overall Loss"}
          icon={netPl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={netPl >= 0 ? "emerald" : "red"} />
        <StatCard label="Final Profit" value={hasCpkTrips ? fmt(finalProfit) : "—"}
          sub={hasCpkTrips ? (finalProfit >= 0 ? "After Truck Expenses" : "After Truck Expenses (Loss)") : `No cost-per-km set (${mode})`}
          icon={finalProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={!hasCpkTrips ? "slate" : (finalProfit >= 0 ? "emerald" : "red")} />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {sorted.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-400">No trips found for this period.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full min-w-[1160px] text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-blue-600 select-none"
                    onClick={() => toggleSort("date")}>
                    Date{sortKey === "date" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Sheet / Booking</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Truck</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Route</th>
                  <SortTh label="Hire"           col="hire"    current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Trip Expenses"  col="expense" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Gross Profit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Truck Expenses</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Final Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((t, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(t.tripSheetDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-800">{t.tripSheetNo || "—"}</p>
                      <p className="text-[11px] text-gray-400">{t.bookingReferenceNo || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-gray-800">{t.truckId}</p>
                      <p className="text-[11px] text-gray-400">{t.registrationNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-700">{t.customerName || "—"}</p>
                      {t.cargoClassification && (
                        <span className="inline-block mt-0.5 rounded-full bg-gray-100 px-2 py-0 text-[10px] font-medium text-gray-500">
                          {shortLabel(t.cargoClassification)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.fromLocation && t.toLocation ? (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <span>{t.fromLocation}</span>
                          <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
                          <span>{t.toLocation}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      {t.totalKm > 0 && (
                        <p className="text-[11px] text-gray-400">{t.totalKm.toLocaleString("en-IN")} km</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">{fmt(t.hireAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">{fmt(t.totalExpense)}</td>
                    <td className="px-4 py-3 text-right"><PlBadge value={t.hireAmount - t.totalExpense} /></td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">
                      {(() => {
                        const cpk = costPerKmMap[mode]?.[t.truckId];
                        return (cpk != null && t.totalKm > 0) ? fmt(t.totalKm * cpk) : <span className="text-gray-400">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const cpk = costPerKmMap[mode]?.[t.truckId];
                        const truckExp = (cpk != null && t.totalKm > 0) ? t.totalKm * cpk : null;
                        const grossProfit = t.hireAmount - t.totalExpense;
                        return truckExp != null
                          ? <PlBadge value={grossProfit - truckExp} />
                          : <span className="text-gray-400 text-xs">—</span>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-gray-600">
                    Total ({trips.length} trips)
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-blue-700">{fmt(totalHire)}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700">{fmt(totalExp)}</td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totalHire - totalExp} /></td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                    {(() => {
                      const total = trips.reduce((sum, t) => {
                        const cpk = costPerKmMap[mode]?.[t.truckId];
                        return sum + (cpk != null && t.totalKm > 0 ? t.totalKm * cpk : 0);
                      }, 0);
                      return total > 0 ? fmt(total) : <span className="text-gray-400">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      let hasCpk = false;
                      const total = trips.reduce((sum, t) => {
                        const cpk = costPerKmMap[mode]?.[t.truckId];
                        const truckExp = (cpk != null && t.totalKm > 0) ? t.totalKm * cpk : null;
                        if (truckExp != null) { hasCpk = true; return sum + (t.hireAmount - t.totalExpense - truckExp); }
                        return sum;
                      }, 0);
                      return hasCpk ? <PlBadge value={total} /> : <span className="text-gray-400 text-xs">—</span>;
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Truck detail panel ─────────────────────────────────────────────────────────
function TruckDetailPanel({ entry, netTruckPl }: { entry: TruckPLEntry; netTruckPl: number }) {
  const tripPl     = entry.totalHireAmount - entry.tripExpenses;
  const tripRows   = entry.tripRows ?? [];
  const maintRows  = entry.maintenanceRows ?? [];
  const emiDetails = entry.emiDetails ?? [];

  return (
    <div className="space-y-5 px-6 py-5 bg-gray-50/70">

      {/* P&L walkthrough */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Net P&L Calculation</p>
        <div className="flex flex-wrap gap-3">

          {/* Trip income block */}
          <div className="min-w-[220px] flex-1 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-400">Trip Income</p>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-blue-700">Hire Revenue ({entry.tripCount} trips)</span>
              <span className="font-bold text-blue-800">{fmt(entry.totalHireAmount)}</span>
            </div>
            <div className="flex justify-between py-1 text-sm border-t border-blue-200 mt-1">
              <span className="text-blue-600">Trip Expenses</span>
              <span className="font-semibold text-blue-700">− {fmt(entry.tripExpenses)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-blue-200 mt-1 pt-2">
              <span className="text-xs font-bold text-blue-600">Gross Trip P&L</span>
              <PlBadge value={tripPl} />
            </div>
          </div>

          {/* Overhead deductions block */}
          <div className="min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-gray-100 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Overhead Deductions</p>
            {emiDetails.length > 0 ? (
              <div className="flex justify-between py-1 text-xs">
                <span className="text-purple-700 flex items-center gap-1">
                  <Landmark className="h-3 w-3" />
                  EMI Share ({emiDetails.length} loan{emiDetails.length !== 1 ? "s" : ""})
                </span>
                <span className="font-semibold text-purple-700">− {fmt(entry.emiShare)}</span>
              </div>
            ) : (
              <div className="flex justify-between py-1 text-xs">
                <span className="text-gray-400 flex items-center gap-1"><Landmark className="h-3 w-3" /> EMI</span>
                <span className="text-gray-400">No active loan</span>
              </div>
            )}
            <div className="flex justify-between py-1 text-xs border-t border-slate-100 mt-1">
              <span className="text-orange-700 flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                Maintenance ({entry.maintenanceCount} record{entry.maintenanceCount !== 1 ? "s" : ""})
              </span>
              <span className="font-semibold text-orange-700">− {fmt(entry.maintenanceExpenses)}</span>
            </div>
            <div className="flex justify-between py-1 text-xs border-t border-slate-100 mt-1">
              <span className="text-teal-700 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Document/Compliance Share
              </span>
              <span className="font-semibold text-teal-700">− {fmt(entry.documentShare)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 mt-1 pt-2">
              <span className="text-xs font-bold text-slate-600">Total Deductions</span>
              <span className="text-xs font-bold text-slate-700">− {fmt(entry.emiShare + entry.maintenanceExpenses + entry.documentShare)}</span>
            </div>
          </div>

          {/* Result */}
          <div className={`min-w-[140px] flex-none rounded-xl border p-4 flex flex-col items-center justify-center text-center ${
            netTruckPl >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
          }`}>
            {netTruckPl >= 0
              ? <TrendingUp className="mb-2 h-7 w-7 text-emerald-500" />
              : <TrendingDown className="mb-2 h-7 w-7 text-red-400" />}
            <p className={`text-xs font-semibold uppercase tracking-wider ${netTruckPl >= 0 ? "text-emerald-600" : "text-red-500"}`}>Net P&L</p>
            <p className={`mt-1 text-xl font-bold ${netTruckPl >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {netTruckPl >= 0 ? "+" : "−"}{fmt(netTruckPl)}
            </p>
          </div>
        </div>
      </div>

      {/* EMI details */}
      {emiDetails.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
            EMI Loans — Period Share: {fmt(entry.emiShare)}
          </p>
          <div className="flex flex-wrap gap-2">
            {emiDetails.map((e, i) => (
              <div key={i} className="rounded-lg border border-purple-100 bg-purple-50 px-4 py-3 min-w-[220px]">
                <p className="text-xs font-semibold text-purple-700">{e.emiName}</p>
                {e.bankName && <p className="text-[10px] text-purple-400">{e.bankName}</p>}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <p className="text-[10px] text-purple-400">Monthly EMI</p>
                    <p className="text-sm font-semibold text-purple-600">{fmt(e.monthlyEmi)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-400">Period Share</p>
                    <p className="text-sm font-bold text-purple-800">{fmt(e.shareForPeriod)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-400">Monthly Finance Cost</p>
                    <p className="text-sm font-semibold text-purple-600">
                      {e.monthlyFinanceCost > 0 ? fmt(e.monthlyFinanceCost) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-400">Period Finance Cost</p>
                    <p className="text-sm font-semibold text-purple-700">
                      {e.periodFinanceCost > 0 ? fmt(e.periodFinanceCost) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-400">Daily Finance Cost</p>
                    <p className="text-sm font-semibold text-purple-600">
                      {e.dailyFinanceCost > 0 ? fmt(e.dailyFinanceCost) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trip rows */}
      {tripRows.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
            Trips in Period ({tripRows.length})
          </p>
          <div className="overflow-auto max-h-[50vh] rounded-lg border border-gray-200">
            <table className="w-full min-w-[600px] text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Date", "Sheet No", "Route", "Hire", "Expenses", "Trip P&L"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tripRows.map((t, i) => {
                  const tPl = t.hireAmount - t.totalExpense;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(t.tripSheetDate)}</td>
                      <td className="px-3 py-2 font-medium text-gray-700">{t.tripSheetNo || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {t.fromLocation && t.toLocation
                          ? `${t.fromLocation} → ${t.toLocation}`
                          : "—"}
                        {t.totalKm > 0 && (
                          <span className="ml-1.5 text-gray-400">({t.totalKm.toLocaleString("en-IN")} km)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold text-blue-700">{fmt(t.hireAmount)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmt(t.totalExpense)}</td>
                      <td className="px-3 py-2"><PlBadge value={tPl} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-gray-600">Total</td>
                  <td className="px-3 py-2 font-bold text-blue-700">{fmt(entry.totalHireAmount)}</td>
                  <td className="px-3 py-2 font-semibold text-gray-700">{fmt(entry.tripExpenses)}</td>
                  <td className="px-3 py-2"><PlBadge value={tripPl} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Maintenance rows */}
      {maintRows.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
            Maintenance in Period ({maintRows.length} records · {fmt(entry.maintenanceExpenses)} total)
          </p>
          <div className="overflow-auto max-h-[40vh] rounded-lg border border-gray-200">
            <table className="w-full min-w-[420px] text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Date", "Type", "Description", "Cost"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-gray-400">{h}</th>
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
    </div>
  );
}

// ── Truck Profitability tab ────────────────────────────────────────────────────
function TruckProfitabilityTab({ data, mode }: { data: TruckPLEntry[]; mode: "Manual" | "Basic" | "Advanced" }) {
  // Cost-per-km map written by Running Cost Calculator, keyed by truckId (fleet ID) per mode
  const [costPerKmMap, setCostPerKmMap] = useState<Record<string, Record<string, number | null>>>({});
  const [expandedTruck, setExpandedTruck] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("canaan_rcc_cost_per_km");
      if (raw) setCostPerKmMap(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [mode]);

  const enriched = useMemo<EnrichedTruck[]>(() =>
    data.map((e) => ({
      ...e,
      tripPl:      e.totalHireAmount - e.tripExpenses,
      netTruckPl:  e.netPl,
    })),
    [data],
  );

  const filtered = enriched;

  const totals = useMemo(() => ({
    trips:   filtered.reduce((s, e) => s + e.tripCount, 0),
    hire:    filtered.reduce((s, e) => s + e.totalHireAmount, 0),
    tExp:    filtered.reduce((s, e) => s + e.tripExpenses, 0),
    totalKm: filtered.reduce((s, e) => s + e.totalKm, 0),
    tPl:     filtered.reduce((s, e) => s + e.tripPl, 0),
    netPl:   filtered.reduce((s, e) => s + e.netTruckPl, 0),
  }), [filtered]);

  const { total: finalProfit, hasCpk: hasCpkTrucks } = filtered.reduce((acc, e) => {
    const cpk = costPerKmMap[mode]?.[e.truckId];
    const truckExp = (cpk != null && e.totalKm > 0) ? e.totalKm * cpk : null;
    if (truckExp != null) return { total: acc.total + (e.totalHireAmount - e.tripExpenses - truckExp), hasCpk: true };
    return acc;
  }, { total: 0, hasCpk: false });
  const profitableTrucks = filtered.filter((e) => e.tripPl >= 0).length;

  return (
    <div className="flex flex-col gap-5">

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total Trucks" value={String(filtered.length)} icon={<BarChart3 className="h-4 w-4" />} color="blue" />
        <StatCard label="Profitable Trucks" value={`${profitableTrucks} / ${filtered.length}`}
          sub={filtered.length ? `${((profitableTrucks / filtered.length) * 100).toFixed(0)}% success rate` : ""}
          icon={<TrendingUp className="h-4 w-4" />} color="emerald" />
        <StatCard label="Total Hire Revenue" value={fmt(totals.hire)} sub={`Expenses: ${fmt(totals.tExp)}`}
          icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Net P&L" value={fmt(totals.netPl)} sub={totals.netPl >= 0 ? "Overall Profit" : "Overall Loss"}
          icon={totals.netPl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.netPl >= 0 ? "emerald" : "red"} />
        <StatCard label="Final Profit" value={hasCpkTrucks ? fmt(finalProfit) : "—"}
          sub={hasCpkTrucks ? (finalProfit >= 0 ? "After Truck Expenses" : "After Truck Expenses (Loss)") : `No cost-per-km set (${mode})`}
          icon={finalProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={!hasCpkTrucks ? "slate" : (finalProfit >= 0 ? "emerald" : "red")} />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-400">No trucks found for this period.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                <tr>
                  {["", "Truck", "No of Trips", "Total KM Covered", "Total Hire Amount", "Total Trip Expenses", "Total Gross Profit", "Total Truck Expenses", "Final Profit", "Net P&L"].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const isOpen = expandedTruck === entry.truckId;
                  return (
                  <Fragment key={entry.truckId}>
                  <tr
                    onClick={() => setExpandedTruck(isOpen ? null : entry.truckId)}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                      <td className="px-2 py-3 text-center">
                        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{entry.truckId}</p>
                        <p className="text-xs text-gray-400">{entry.registrationNumber}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                          {entry.tripCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium tabular-nums">
                        {entry.totalKm > 0 ? `${entry.totalKm.toLocaleString("en-IN")} km` : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-700">{fmt(entry.totalHireAmount)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmt(entry.tripExpenses)}</td>
                      <td className="px-4 py-3"><PlBadge value={entry.tripPl} /></td>
                      <td className="px-4 py-3">
                        {(() => {
                          const cpk = costPerKmMap[mode]?.[entry.truckId];
                          return (cpk != null && entry.totalKm > 0)
                            ? <span className="text-gray-700 font-medium">{fmt(entry.totalKm * cpk)}</span>
                            : <span className="text-gray-400">—</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const cpk = costPerKmMap[mode]?.[entry.truckId];
                          const truckExp = (cpk != null && entry.totalKm > 0) ? entry.totalKm * cpk : null;
                          const grossProfit = entry.totalHireAmount - entry.tripExpenses;
                          return truckExp != null
                            ? <PlBadge value={grossProfit - truckExp} />
                            : <span className="text-gray-400 text-xs">—</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3"><PlBadge value={entry.netTruckPl} /></td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-gray-100">
                      <td colSpan={9} className="p-0">
                        <TruckDetailPanel entry={entry} netTruckPl={entry.netTruckPl} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-2 py-3"></td>
                  <td className="px-4 py-3 text-gray-700">
                    Fleet Total
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      ({enriched.length} trucks)
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-blue-700">{totals.trips}</td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">
                    {totals.totalKm > 0 ? `${totals.totalKm.toLocaleString("en-IN")} km` : "—"}
                  </td>
                  <td className="px-4 py-3 text-blue-700">{fmt(totals.hire)}</td>
                  <td className="px-4 py-3 text-gray-700">{fmt(totals.tExp)}</td>
                  <td className="px-4 py-3"><PlBadge value={totals.tPl} /></td>
                  <td className="px-4 py-3">
                    {(() => {
                      let hasCpk = false;
                      const total = filtered.reduce((sum, e) => {
                        const cpk = costPerKmMap[mode]?.[e.truckId];
                        if (cpk != null && e.totalKm > 0) { hasCpk = true; return sum + e.totalKm * cpk; }
                        return sum;
                      }, 0);
                      return hasCpk ? <span className="font-semibold text-gray-700">{fmt(total)}</span> : <span className="text-gray-400">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      let hasCpk = false;
                      const total = filtered.reduce((sum, e) => {
                        const cpk = costPerKmMap[mode]?.[e.truckId];
                        const truckExp = (cpk != null && e.totalKm > 0) ? e.totalKm * cpk : null;
                        if (truckExp != null) { hasCpk = true; return sum + (e.totalHireAmount - e.tripExpenses - truckExp); }
                        return sum;
                      }, 0);
                      return hasCpk ? <PlBadge value={total} /> : <span className="text-gray-400 text-xs">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3"><PlBadge value={totals.netPl} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 italic">
        Total Gross Profit = Total Hire Amount − Total Trip Expenses. Final Profit = Total Gross Profit − Total Truck Expenses (cost-per-km based).
        Net P&L = Total Gross Profit − EMI Share − Maintenance − Document/Compliance Share. Click a row to see the full breakdown.
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PLSummaryPage() {
  const initial                              = thisMonth();
  const [startDate, setStartDate]            = useState(initial.start);
  const [endDate, setEndDate]                = useState(initial.end);
  const [activePreset, setActivePreset]      = useState("This Month");
  const [data, setData]                      = useState<TruckPLEntry[] | null>(null);
  const [loading, setLoading]                = useState(false);
  const [error, setError]                    = useState<string | null>(null);
  const [tab, setTab]                        = useState<Tab>("trips");
  const [mode, setMode]                      = useState<"Manual" | "Basic" | "Advanced">("Manual");
  const [showPreview, setShowPreview]        = useState(false);
  const [previewCostMap, setPreviewCostMap]  = useState<Record<string, Record<string, number | null>>>({});
  const [showHowCalculated, setShowHowCalculated] = useState(false);
  const [showQuickStart, setShowQuickStart]  = useState(false);

  useEffect(() => { fetchData(); }, []); // auto-load current month on mount

  function openPreview() {
    if (!data) return;
    let costMap: Record<string, Record<string, number | null>> = {};
    try { const raw = localStorage.getItem("canaan_rcc_cost_per_km"); if (raw) costMap = JSON.parse(raw); } catch { /* ignore */ }
    setPreviewCostMap(costMap);
    setShowPreview(true);
  }

  function printReport() {
    if (!data) return;
    const isTrips = tab === "trips";
    const period  = `${fmtDate(startDate)} to ${fmtDate(endDate)}`;
    const logoUrl = `${window.location.origin}${logoSrc.src}`;

    let bodyHtml = "";
    if (isTrips) {
      const rows = allTrips.map((t) => {
        const cpk = previewCostMap[mode]?.[t.truckId];
        const gp = t.hireAmount - t.totalExpense;
        const te = (cpk != null && t.totalKm > 0) ? t.totalKm * cpk : null;
        const fp = te != null ? gp - te : null;
        return `<tr>
          <td>${fmtDate(t.tripSheetDate)}</td>
          <td>${t.tripSheetNo || "—"}</td>
          <td>${t.truckId}</td>
          <td>${t.customerName || "—"}</td>
          <td>${t.fromLocation && t.toLocation ? `${t.fromLocation} → ${t.toLocation}` : "—"}</td>
          <td class="num">${fmt(t.hireAmount)}</td>
          <td class="num">${fmt(t.totalExpense)}</td>
          <td class="num ${gp >= 0 ? "pos" : "neg"}">${gp >= 0 ? "+" : "−"}${fmt(gp)}</td>
          <td class="num">${te != null ? fmt(te) : "—"}</td>
          <td class="num ${fp != null ? (fp >= 0 ? "pos" : "neg") : ""}">${fp != null ? `${fp >= 0 ? "+" : "−"}${fmt(fp)}` : "—"}</td>
        </tr>`;
      }).join("");
      bodyHtml = `<table><thead><tr>
        <th>Date</th><th>Sheet No</th><th>Truck</th><th>Customer</th><th>Route</th>
        <th class="num">Hire</th><th class="num">Trip Expenses</th><th class="num">Gross Profit</th>
        <th class="num">Truck Expenses</th><th class="num">Final Profit</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    } else {
      const rows = data.map((e) => {
        const cpk = previewCostMap[mode]?.[e.truckId];
        const gp = e.totalHireAmount - e.tripExpenses;
        const te = (cpk != null && e.totalKm > 0) ? e.totalKm * cpk : null;
        const fp = te != null ? gp - te : null;
        return `<tr>
          <td>${e.truckId}<br><small>${e.registrationNumber}</small></td>
          <td class="num">${e.tripCount}</td>
          <td class="num">${e.totalKm > 0 ? `${e.totalKm.toLocaleString("en-IN")} km` : "—"}</td>
          <td class="num">${fmt(e.totalHireAmount)}</td>
          <td class="num">${fmt(e.tripExpenses)}</td>
          <td class="num ${gp >= 0 ? "pos" : "neg"}">${gp >= 0 ? "+" : "−"}${fmt(gp)}</td>
          <td class="num">${te != null ? fmt(te) : "—"}</td>
          <td class="num ${fp != null ? (fp >= 0 ? "pos" : "neg") : ""}">${fp != null ? `${fp >= 0 ? "+" : "−"}${fmt(fp)}` : "—"}</td>
        </tr>`;
      }).join("");
      bodyHtml = `<table><thead><tr>
        <th>Truck</th><th class="num">No of Trips</th><th class="num">Total KM</th>
        <th class="num">Total Hire Amount</th><th class="num">Total Trip Expenses</th>
        <th class="num">Total Gross Profit</th><th class="num">Total Truck Expenses</th>
        <th class="num">Final Profit</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    }

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${isTrips ? "Trip" : "Truck"} Profitability — ${period}</title>
<style>
  @page{size:A4 landscape;margin:15mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;border-bottom:2px solid #2563eb;padding-bottom:12px}
  .logo{height:52px;width:auto;object-fit:contain}
  .rt{font-size:13px;font-weight:600;color:#374151;margin-top:4px}
  .per{font-size:10px;color:#6b7280;margin-top:3px}
  .badge{font-size:10px;font-weight:600;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;padding:2px 8px}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
  td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tr:nth-child(even) td{background:#fafafa}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .pos{color:#059669;font-weight:600}
  .neg{color:#dc2626;font-weight:600}
  .foot{margin-top:14px;font-size:9px;color:#9ca3af}
  small{font-size:9px;color:#9ca3af}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="hdr">
  <div style="display:flex;align-items:center;gap:14px">
    <img src="${logoUrl}" class="logo" alt="Canaan ERP" />
    <div>
      <div class="rt">${isTrips ? "Trip Profitability Report" : "Truck Profitability Report"}</div>
      <div class="per">Period: ${period}</div>
    </div>
  </div>
  <div style="text-align:right">
    <span class="badge">Mode: ${mode}</span>
    <div class="per" style="margin-top:6px">Generated: ${new Date().toLocaleDateString("en-IN")}</div>
  </div>
</div>
${bodyHtml}
<div class="foot">Gross Profit = Hire − Trip Expenses &nbsp;|&nbsp; Final Profit = Gross Profit − Truck Expenses &nbsp;|&nbsp; Truck Expenses = Total KM × Cost/KM (${mode} mode)</div>
</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    const { start, end } = p.fn();
    setStartDate(start);
    setEndDate(end);
    setActivePreset(p.label);
    fetchData(start, end); // pass dates directly — state hasn't updated yet
  }

  async function fetchData(overrideStart?: string, overrideEnd?: string) {
    const s = overrideStart ?? startDate;
    const e = overrideEnd   ?? endDate;
    if (!s || !e) return;
    setLoading(true);
    setError(null);
    try {
      setData(await plSummaryApi.get(s, e));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  // All trips across all trucks, enriched with truck identity and per-trip P&L
  const allTrips = useMemo<EnrichedTrip[]>(() => {
    if (!data) return [];
    return data.flatMap((entry) =>
      (entry.tripRows ?? []).map((t) => ({
        ...t,
        truckId: entry.truckId,
        registrationNumber: entry.registrationNumber,
        tripPl: t.hireAmount - t.totalExpense,
      }))
    );
  }, [data]);

  return (
    <div className="animate-stagger flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Profitability</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Trip-wise and truck-wise P&L for the selected period.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button" onClick={() => setShowQuickStart(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
          >
            <Compass className="h-4 w-4" />
            Quick Start Guide
          </button>
          <button
            type="button" onClick={() => setShowHowCalculated(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
          >
            <Calculator className="h-4 w-4" />
            How is it Calculated
          </button>
          {data && (
            <button
              type="button" onClick={openPreview}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              <FileDown className="h-4 w-4" />
              Generate Report
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label} type="button" onClick={() => applyPreset(p)}
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
              onChange={(v) => { setStartDate(v); setActivePreset(""); if (v && endDate) fetchData(v, endDate); }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <DatePickerInput
              value={endDate}
              onChange={(v) => { setEndDate(v); setActivePreset(""); if (startDate && v) fetchData(startDate, v); }}
            />
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 pb-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {data !== null && (
        <>
          {/* Report heading banner */}
          <div className="flex items-center gap-5 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-gray-100 px-6 py-4 shadow-sm">
            <div className="h-12 w-1 rounded-full bg-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-0.5">
                Profitability Report
              </p>
              <p className="text-lg font-bold text-gray-900 truncate">
                {tab === "trips" ? "Trip Profitability" : "Truck Profitability"}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 shadow-sm shrink-0">
              <CalendarDays className="h-4 w-4 text-blue-400 shrink-0" />
              <span className="text-sm font-semibold text-blue-800">{fmtDate(startDate)}</span>
              <span className="text-blue-300 font-light">→</span>
              <span className="text-sm font-semibold text-blue-800">{fmtDate(endDate)}</span>
            </div>
          </div>

          {/* Tab bar + Mode selector row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Tab bar */}
            <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
              {([
                { key: "trips"  as Tab, label: "Trip Profitability",  count: allTrips.length },
                { key: "trucks" as Tab, label: "Truck Profitability", count: data.length },
              ]).map(({ key, label, count }) => (
                <button
                  key={key} type="button" onClick={() => setTab(key)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                    tab === key ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    tab === key ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"
                  }`}>{count}</span>
                </button>
              ))}
            </div>

            {/* Mode selector */}
            <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
              {(["Manual", "Basic", "Advanced"] as const).map((m) => (
                <button
                  key={m} type="button" onClick={() => setMode(m)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                    mode === m ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {tab === "trips"  && <TripProfitabilityTab trips={allTrips} mode={mode} />}
          {tab === "trucks" && <TruckProfitabilityTab data={data} mode={mode} />}
        </>
      )}

      {data === null && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-14 text-center">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-semibold text-gray-500">Select a period to load profitability data</p>
          <p className="mt-2 text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            Gross Profit = Hire − Trip Expenses
            <br />
            Final Profit = Gross Profit − Truck Expenses
          </p>
        </div>
      )}

      {showHowCalculated && <HowCalculatedModal onClose={() => setShowHowCalculated(false)} />}
      {showQuickStart && <QuickStartModal onClose={() => setShowQuickStart(false)} />}

      {/* ── Report Preview Modal ───────────────────────────────────────────────── */}
      {showPreview && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Report Preview</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tab === "trips" ? "Trip Profitability" : "Truck Profitability"} · {fmtDate(startDate)} to {fmtDate(endDate)} · Mode: {mode}
                </p>
              </div>
              <button type="button" onClick={() => setShowPreview(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-auto px-6 py-5">

              {/* Report header block */}
              <div className="flex items-start justify-between border-b-2 border-blue-600 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoSrc.src} alt="Canaan ERP" className="h-14 w-auto object-contain" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {tab === "trips" ? "Trip Profitability Report" : "Truck Profitability Report"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Period: {fmtDate(startDate)} to {fmtDate(endDate)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded px-2.5 py-1">
                    Mode: {mode}
                  </span>
                  <p className="text-xs text-gray-400 mt-1.5">Generated: {new Date().toLocaleDateString("en-IN")}</p>
                </div>
              </div>

              {/* Preview table */}
              {tab === "trips" ? (
                <div className="overflow-auto">
                  <table className="w-full min-w-[900px] text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        {["Date","Sheet No","Truck","Customer","Route","Hire","Trip Expenses","Gross Profit","Truck Expenses","Final Profit"].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-gray-400 border-b border-gray-200 text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allTrips.map((t, i) => {
                        const cpk = previewCostMap[mode]?.[t.truckId];
                        const gp = t.hireAmount - t.totalExpense;
                        const te = (cpk != null && t.totalKm > 0) ? t.totalKm * cpk : null;
                        const fp = te != null ? gp - te : null;
                        return (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(t.tripSheetDate)}</td>
                            <td className="px-3 py-2 text-gray-700">{t.tripSheetNo || "—"}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{t.truckId}</td>
                            <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate">{t.customerName || "—"}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                              {t.fromLocation && t.toLocation ? `${t.fromLocation} → ${t.toLocation}` : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{fmt(t.hireAmount)}</td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmt(t.totalExpense)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={gp >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                                {gp >= 0 ? "+" : "−"}{fmt(gp)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{te != null ? fmt(te) : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {fp != null
                                ? <span className={fp >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{fp >= 0 ? "+" : "−"}{fmt(fp)}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full min-w-[820px] text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        {["Truck","No of Trips","Total KM","Total Hire Amount","Total Trip Expenses","Total Gross Profit","Total Truck Expenses","Final Profit"].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-gray-400 border-b border-gray-200 text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((e, i) => {
                        const cpk = previewCostMap[mode]?.[e.truckId];
                        const gp = e.totalHireAmount - e.tripExpenses;
                        const te = (cpk != null && e.totalKm > 0) ? e.totalKm * cpk : null;
                        const fp = te != null ? gp - te : null;
                        return (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-gray-800">{e.truckId}</p>
                              <p className="text-[10px] text-gray-400">{e.registrationNumber}</p>
                            </td>
                            <td className="px-3 py-2 text-center font-semibold text-blue-700">{e.tripCount}</td>
                            <td className="px-3 py-2 text-gray-600 tabular-nums">{e.totalKm > 0 ? `${e.totalKm.toLocaleString("en-IN")} km` : "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{fmt(e.totalHireAmount)}</td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmt(e.tripExpenses)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={gp >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{gp >= 0 ? "+" : "−"}{fmt(gp)}</span>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{te != null ? fmt(te) : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {fp != null
                                ? <span className={fp >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{fp >= 0 ? "+" : "−"}{fmt(fp)}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-4 text-[10px] text-gray-400 italic">
                Gross Profit = Hire − Trip Expenses · Final Profit = Gross Profit − Truck Expenses · Truck Expenses = Total KM × Cost/KM ({mode} mode)
              </p>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button type="button" onClick={() => setShowPreview(false)}
                className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={printReport}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm">
                <FileDown className="h-4 w-4" />
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
