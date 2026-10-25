"use client";

import { Fragment, useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { COST_INPUT_RESOURCES } from "@/lib/api-cache";
import {
  TrendingUp, TrendingDown,
  Loader2, BarChart3, ArrowRight, Eye,
  DollarSign, Wrench, Landmark, AlertCircle, CalendarDays, X, ShieldCheck, ChevronDown,
  Calculator, Compass, Route, FileText, Fuel, MousePointerClick, SlidersHorizontal, Info,
} from "lucide-react";
import { fetchExcel, plSummaryApi, type PlComputed, type PlComputedTrip, type PlComputedTruck, type PlTruckMoney, type TruckPLEntry } from "@/lib/api";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { Segmented } from "@/components/ui/Segmented";
import { PillSearch } from "@/components/ui/PillSearch";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";
import { showError } from "@/lib/swal";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { cn } from "@/lib/utils";
import { TripBreakdownDialog } from "@/components/insights/TripBreakdownDialog";

// ── Date helpers ───────────────────────────────────────────────────────────────
// Local calendar date — toISOString() is UTC and shifted IST midnights back a day.
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
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
  return `₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────
// Every figure on this page is worked out on the server (backend/pl_compute.py,
// the same numbers as the Excel) — the page only displays and sorts them.
type EnrichedTrip = PlComputedTrip;

type Tab = "trips" | "trucks";
type TripSortKey = "date" | "hire" | "expense" | "pl";

// ── Shared components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color, onClick, active }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode;
  color: "blue" | "emerald" | "red" | "amber" | "purple" | "slate";
  /** When set, the card becomes a toggleable filter — see TripProfitabilityTab's
   * profitFilter (clicking "Profitable"/"Non-Profitable" drills the table below
   * into just those trips; clicking the active one again clears it). */
  onClick?: () => void;
  active?: boolean;
}) {
  const ring = { blue: "border-blue-200 bg-blue-50", emerald: "border-emerald-200 bg-emerald-50", red: "border-red-200 bg-red-50", amber: "border-amber-200 bg-amber-50", purple: "border-purple-200 bg-purple-50", slate: "border-slate-200 bg-slate-50" };
  const activeRing = { blue: "ring-2 ring-blue-400", emerald: "ring-2 ring-emerald-400", red: "ring-2 ring-red-400", amber: "ring-2 ring-amber-400", purple: "ring-2 ring-purple-400", slate: "ring-2 ring-slate-400" };
  const txt  = { blue: "text-blue-700", emerald: "text-emerald-700", red: "text-red-700", amber: "text-amber-700", purple: "text-purple-700", slate: "text-slate-700" };
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        `rounded-xl border p-5 text-left ${ring[color]}`,
        onClick && "cursor-pointer transition-shadow hover:shadow-sm",
        active && activeRing[color]
      )}
    >
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

function SortTh({ label, col, current, dir, onSort, hint }: {
  label: string; col: TripSortKey; current: TripSortKey; dir: "asc" | "desc";
  onSort: (c: TripSortKey) => void; hint?: string;
}) {
  const active = current === col;
  return (
    <th
      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer select-none hover:text-blue-600 whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}{active ? (dir === "asc" ? " ▲" : " ▼") : ""}
      {hint && <HintIcon text={hint} />}
    </th>
  );
}

/** A small ⓘ on a column header — hover for a one-line definition. */
function HintIcon({ text }: { text: string }) {
  return (
    <span title={text} className="ml-1 inline-flex cursor-help align-middle text-gray-300 hover:text-blue-500">
      <Info className="h-3 w-3" />
    </span>
  );
}

function HintTh({ label, hint }: { label: string; hint: string }) {
  return (
    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
      {label}<HintIcon text={hint} />
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
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
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
    <Segmented
      label="Guide section"
      value={active}
      onChange={onChange}
      options={GUIDE_TABS.map((g) => ({ value: g, label: g, dot: MODE_DOT[g] }))}
    />
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
            <Formula>Trip Profit&nbsp;&nbsp;=&nbsp;&nbsp;Hire Amount − Trip Expenses</Formula>
            <Formula>Diesel Expenses&nbsp;&nbsp;=&nbsp;&nbsp;Total KM × Mileage Cost/KM</Formula>
            <Formula>Gross Profit&nbsp;&nbsp;=&nbsp;&nbsp;Trip Profit − Diesel Expenses</Formula>
            <Formula>Truck Expenses&nbsp;&nbsp;=&nbsp;&nbsp;Total KM × (Cost/KM − Mileage Cost/KM)&nbsp;&nbsp;— EMI, tyres, maintenance, documents</Formula>
            <Formula>Final Profit&nbsp;&nbsp;=&nbsp;&nbsp;Gross Profit − Truck Expenses</Formula>
            <p className="text-xs text-gray-500">
              <b>Mileage Cost/KM</b> is the diesel part of the Running Cost Calculator (diesel price ÷ the truck&rsquo;s km/L) for the
              selected mode. It&rsquo;s already included in Cost/KM, so Gross Profit sits between Trip Profit and Final Profit — diesel
              is never counted twice.
            </p>
          </GuideSection>

          <GuideSection title="Truck Profitability tab" icon={<Wrench className="h-3.5 w-3.5" />}>
            <p>Per truck, across every trip in the period:</p>
            <Formula>Trip Profit&nbsp;&nbsp;=&nbsp;&nbsp;Hire − Trip Expenses</Formula>
            <Formula>Gross Profit&nbsp;&nbsp;=&nbsp;&nbsp;Trip Profit − Diesel&nbsp;&nbsp;(KM × Mileage cost per km)</Formula>
            <Formula>Running Costs&nbsp;&nbsp;=&nbsp;&nbsp;Tyres&nbsp;(KM × Tyre Charges per km) + Maintenance</Formula>
            <Formula>Fixed Costs&nbsp;&nbsp;=&nbsp;&nbsp;EMI share + Document share</Formula>
            <Formula>Net Profit&nbsp;&nbsp;=&nbsp;&nbsp;Gross Profit − Running Costs − Fixed Costs</Formula>
            <p className="text-xs text-gray-500">
              Diesel and Tyres use the Running Cost Calculator&rsquo;s per-km figures for the selected mode; maintenance, EMI and
              documents come from real records. Costs over time stop at today, so a period running into the future never charges
              months that haven&rsquo;t happened. Click any truck row for the full step-by-step breakdown.
            </p>
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
              Every cost input — diesel price/litre, mileage, tyre cost, EMI, maintenance (including AdBlue) and compliance cost per km — is
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
              (&ldquo;Set Base Litre Cost&rdquo;) and tyre cost comes from Admin → Tyre Cost Configuration. EMI fields (amount, per-day, per-km) stay manually editable, falling back to a
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
            { n: 3, title: "Pick a Cost/KM mode", body: "Manual, Basic or Advanced — controls the diesel, tyre and Cost/KM figures — Trip tab: Diesel Expenses, Gross Profit, Truck Expenses, Final Profit; Truck tab: Diesel, Gross Profit, Running Costs, Net Profit. Set actual values first on the Running Cost Calculator page (see the mode tabs above for how each one works)." },
            { n: 4, title: "Expand a truck row", body: "In Truck Profitability, click any row to open a step-by-step Net Profit breakdown — diesel, tyres, maintenance, EMI loans, documents, and the trip list behind the numbers. In Trip Profitability, click any trip for its own breakdown." },
            { n: 5, title: "Read the summary cards", body: "Total Trips/Trucks, Profitable count, Hire Revenue, Gross Profit and Net/Final Profit — a snapshot before you dig into the table." },
            { n: 6, title: "Export a report", body: "Click \"View\" top-right to preview both Trip and Truck Profitability for the selected period/mode, then download as Excel or PDF." },
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
            <p>2. Type in diesel price/litre, mileage, tyre cost, EMI and maintenance figures for a truck.</p>
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

/** "Sold" / "Deleted" chip for a truck no longer in the fleet. */
function DisposalChip({ disposal }: { disposal: string | null }) {
  if (!disposal) return null;
  return (
    <span
      title={`This truck has been ${disposal.toLowerCase()} — shown for its trips in this period`}
      className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
        disposal === "Sold" ? "bg-sky-100 text-sky-700" : "bg-gray-200 text-gray-600")}
    >
      {disposal}
    </span>
  );
}

// ── Trip Profitability tab ─────────────────────────────────────────────────────
function TripProfitabilityTab({
  trips,
  totals,
  mode,
}: {
  trips: EnrichedTrip[];
  totals: PlComputed["tripTotals"];
  mode: "Manual" | "Basic" | "Advanced";
}) {
  const [sortKey, setSortKey] = useState<TripSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Clicking "Profitable Trips" / "Non-Profitable Trips" below drills the
  // table into exactly the trips each card counts (tripPl >=/< 0, among
  // countedTrips — the same set the cards' own "X / Y" figures are built
  // from, so the filtered list never shows something the card didn't count).
  const [profitFilter, setProfitFilter] = useState<"all" | "profitable" | "non-profitable">("all");
  // Row clicked → Trip Breakdown window explaining that trip's numbers.
  const [breakdownTripId, setBreakdownTripId] = useState<number | null>(null);

  function toggleSort(col: TripSortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("desc"); }
  }

  // ── Sorted trips ──────────────────────────────────────────────────────────
  // Profitable / Non-Profitable = after ALL costs (Final Profit), as counted by
  // the server; a trip with no Cost/KM can't be judged and is in neither.
  const sorted = useMemo(() => {
    const fp = (t: EnrichedTrip) => t.money.finalProfit;
    const base =
      profitFilter === "all" ? trips :
      profitFilter === "profitable" ? trips.filter((t) => !t.excludedFromTotals && fp(t) != null && fp(t)! >= 0) :
      trips.filter((t) => !t.excludedFromTotals && fp(t) != null && fp(t)! < 0);
    return [...base].sort((a, b) => {
      let d = 0;
      if (sortKey === "date")    d = a.tripSheetDate.localeCompare(b.tripSheetDate);
      if (sortKey === "hire")    d = a.hireAmount - b.hireAmount;
      if (sortKey === "expense") d = a.totalExpense - b.totalExpense;
      if (sortKey === "pl")      d = a.money.tripProfit - b.money.tripProfit;
      return sortDir === "asc" ? d : -d;
    });
  }, [trips, sortKey, sortDir, profitFilter]);

  // ── Summary (from the server) ─────────────────────────────────────────────
  // A trip an Auditor has flagged for rechecking still appears in the table
  // (with an "Under Review" badge) but is left out of every total.
  const flaggedCount = totals.flagged;
  const judged = totals.finalTrips;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total Trips"      value={String(totals.trips)} icon={<BarChart3 className="h-4 w-4" />} color="blue" />
        <StatCard label="Profitable Trips" value={`${totals.profitable} / ${judged}`}
          sub={judged ? `${totals.profitablePct}% · after all costs${totals.unjudged ? ` · ${totals.unjudged} can't be worked out (no Cost/KM or no km)` : ""}` : `No cost-per-km set (${mode})`}
          icon={<TrendingUp className="h-4 w-4" />} color="emerald"
          onClick={() => setProfitFilter((f) => (f === "profitable" ? "all" : "profitable"))}
          active={profitFilter === "profitable"} />
        <StatCard label="Non-Profitable Trips" value={`${totals.nonProfitable} / ${judged}`}
          sub={judged ? `${totals.nonProfitablePct}% · after all costs` : `No cost-per-km set (${mode})`}
          icon={<TrendingDown className="h-4 w-4" />} color="red"
          onClick={() => setProfitFilter((f) => (f === "non-profitable" ? "all" : "non-profitable"))}
          active={profitFilter === "non-profitable"} />
        <StatCard label="Total Hire Revenue" value={fmt(totals.hire)} sub={`Expenses: ${fmt(totals.tripExpenses)}`}
          icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Trip Profit" value={fmt(totals.tripProfit)} sub={totals.tripProfit >= 0 ? "Hire − Trip Expenses" : "Hire − Trip Expenses (Loss)"}
          icon={totals.tripProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.tripProfit >= 0 ? "emerald" : "red"} />
        <StatCard label="Gross Profit" value={totals.grossTrips ? fmt(totals.gross) : "—"}
          sub={totals.grossTrips
            ? `After diesel · ${totals.grossTrips} of ${totals.counted} trips`
            : `No mileage cost set (${mode})`}
          icon={totals.gross >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={!totals.grossTrips ? "slate" : (totals.gross >= 0 ? "emerald" : "red")} />
        <StatCard label="Final Profit" value={totals.final != null ? fmt(totals.final) : "—"}
          sub={totals.final != null ? `After truck expenses · ${totals.finalTrips} of ${totals.counted} trips` : `No cost-per-km set (${mode})`}
          icon={(totals.final ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.final == null ? "slate" : (totals.final >= 0 ? "emerald" : "red")} />
      </div>

      {profitFilter !== "all" && (
        <div className="flex items-center gap-2 text-xs">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold",
            profitFilter === "profitable" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          )}>
            {profitFilter === "profitable" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            Showing: {profitFilter === "profitable" ? "Profitable" : "Non-Profitable"} trips only
          </span>
          <button
            type="button"
            onClick={() => setProfitFilter("all")}
            className="font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {sorted.length > 0 && (
        <p className="-mb-2 flex items-center gap-1.5 px-1 text-xs text-gray-500">
          <MousePointerClick className="h-3.5 w-3.5 text-blue-500" />
          Click any trip to see how its numbers are worked out. Hover <Info className="inline h-3 w-3 text-gray-400" /> on a column for what it means.
        </p>
      )}
      <div className="rounded-xl border border-gray-200 bg-white">
        {sorted.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-400">
              {profitFilter === "all" ? "No trips found for this period." : "No trips match this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full min-w-[1260px] text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Trip ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-blue-600 select-none"
                    onClick={() => toggleSort("date")}>
                    Date{sortKey === "date" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Sheet / Booking</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Truck</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Route</th>
                  <SortTh label="Hire"           col="hire"    current={sortKey} dir={sortDir} onSort={toggleSort}
                    hint="Hire on the trip sheet, less any commission on the customer's route." />
                  <SortTh label="Trip Expenses"  col="expense" current={sortKey} dir={sortDir} onSort={toggleSort}
                    hint="Everything entered on the trip sheet: driver batta, toll, port pass, parking, mamol and other expenses." />
                  <HintTh label="Trip Profit" hint="Hire − Trip Expenses" />
                  <HintTh label="Diesel Expenses" hint="Trip km × the truck's diesel cost per km (diesel price ÷ km per litre) in the selected mode." />
                  <HintTh label="Gross Profit" hint="Trip Profit − Diesel Expenses" />
                  <HintTh label="Truck Expenses" hint="Trip km × the truck's Cost/KM without diesel (EMI, tyres, maintenance, documents) in the selected mode — diesel has its own column." />
                  <HintTh label="Final Profit" hint="Gross Profit − Truck Expenses" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((t, i) => (
                  <tr
                    key={i}
                    onClick={() => t.tripId != null && setBreakdownTripId(t.tripId)}
                    title={t.tripId != null ? "Click to see how this trip's numbers are worked out" : undefined}
                    className={cn("transition-colors", t.tripId != null ? "cursor-pointer hover:bg-blue-50/50" : "hover:bg-gray-50", t.excludedFromTotals && "bg-amber-50/60 hover:bg-amber-50")}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-blue-700">{t.tripCode || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(t.tripSheetDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-800">
                        {t.tripSheetNo || "—"}
                        {t.flaggedForRecheck && (
                          <span
                            title={t.flaggedRemark ? `Flagged for recheck: ${t.flaggedRemark}` : "Flagged for recheck"}
                            className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700"
                          >
                            <AlertCircle className="h-2.5 w-2.5" /> Under Review
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400">{t.bookingReferenceNo || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-gray-800">{t.truckId}<DisposalChip disposal={t.disposal} /></p>
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
                    <td className={cn("px-4 py-3 text-right text-sm font-semibold", t.excludedFromTotals ? "text-gray-400" : "text-blue-700")}>{fmt(t.hireAmount)}</td>
                    <td className={cn("px-4 py-3 text-right text-xs", t.excludedFromTotals ? "text-gray-400" : "text-gray-600")}>{fmt(t.totalExpense)}</td>
                    <td className="px-4 py-3 text-right">
                      {t.excludedFromTotals ? <span className="text-[11px] text-gray-400">Excluded *</span> : <PlBadge value={t.money.tripProfit} />}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">
                      {t.excludedFromTotals ? <span className="text-gray-400">—</span> : (() => {
                        const { diesel, dieselRate } = t.money;
                        return diesel != null && dieselRate != null
                          ? <span title={`${t.totalKm.toLocaleString("en-IN")} km × ₹${dieselRate.toFixed(2)}/km`}>{fmt(diesel)}</span>
                          : <span className="text-gray-400">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.excludedFromTotals ? <span className="text-[11px] text-gray-400">Excluded *</span> : (
                        t.money.gross != null ? <PlBadge value={t.money.gross} /> : <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">
                      {t.excludedFromTotals ? <span className="text-gray-400">—</span> : (() => {
                        const te = t.money.truckExpenses;
                        if (te == null) return <span className="text-gray-400">—</span>;
                        return t.money.truckExpensesIncludeDiesel ? (
                          <span title="Includes diesel — no diesel figure to split it out in this mode" className="cursor-help">
                            <span className="mr-1 text-amber-500">⚠</span>{fmt(te)}
                          </span>
                        ) : fmt(te);
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.excludedFromTotals ? <span className="text-[11px] text-gray-400">Excluded *</span> : (
                        t.money.finalProfit != null
                          ? <PlBadge value={t.money.finalProfit} />
                          : <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-600">
                    Total ({totals.counted} of {totals.trips} trips)
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-blue-700">{fmt(totals.hire)}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700">{fmt(totals.tripExpenses)}</td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totals.tripProfit} /></td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                    {totals.grossTrips ? fmt(totals.diesel) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {totals.grossTrips ? <PlBadge value={totals.gross} /> : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700">
                    {totals.truckExpenses > 0 ? fmt(totals.truckExpenses) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {totals.final != null ? <PlBadge value={totals.final} /> : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <TripBreakdownDialog
        open={breakdownTripId != null}
        onClose={() => setBreakdownTripId(null)}
        tripId={breakdownTripId}
        mode={mode}
      />
      {flaggedCount > 0 && (
        <p className="text-[11px] text-amber-600">
          * {flaggedCount} trip{flaggedCount !== 1 ? "s" : ""} flagged for recheck by Audit — excluded from the totals above until resolved.
        </p>
      )}
    </div>
  );
}

// ── Truck detail panel ─────────────────────────────────────────────────────────
// One truck's numbers for the period, in the selected Cost/KM mode.
// Diesel and Tyres come from the Running Cost Calculator (km × its "Mileage"
// and "Tyre Charges" per km); everything else is from real records.
type TruckMoney = PlTruckMoney;

const DOC_LABELS: Record<string, string> = {
  rc: "RC", fc: "FC", road_tax: "Road Tax", insurance: "Insurance",
  national_permit: "National Permit", local_permit: "Local Permit", pollution_certificate: "Pollution Certificate",
};

function WaterfallRow({ label, value, kind, detail, scale }: {
  label: string; value: number | null; kind: "in" | "out" | "result"; detail?: ReactNode; scale: number;
}) {
  const isResult = kind === "result";
  const width = value == null ? 0 : Math.max(1, Math.min(100, (Math.abs(value) / scale) * 100));
  const bar = kind === "out" ? "bg-red-300" : kind === "in" ? "bg-blue-400" : (value ?? 0) >= 0 ? "bg-emerald-400" : "bg-red-400";
  const color = value == null ? "text-gray-400" : kind === "out" ? "text-red-600" : kind === "in" ? "text-blue-700" : value >= 0 ? "text-emerald-700" : "text-red-600";
  return (
    <div className={cn("rounded-lg px-3 py-2", isResult ? "bg-white ring-1 ring-gray-200" : "")}>
      <div className="flex items-center gap-3">
        <span className={cn("w-44 shrink-0 text-xs", isResult ? "font-bold text-gray-900" : "font-medium text-gray-700")}>{label}</span>
        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          {value != null && <span className={cn("absolute inset-y-0 left-0 rounded-full", bar)} style={{ width: `${width}%` }} />}
        </span>
        <span className={cn("w-32 shrink-0 text-right text-xs tabular-nums", isResult ? "font-bold" : "font-semibold", color)}>
          {value == null ? "—" : kind === "out" ? `− ${fmt(value)}` : `${value < 0 ? "−" : ""}${fmt(value)}`}
        </span>
      </div>
      {detail && <div className="mt-1 pl-[11.75rem] text-[11px] text-gray-500">{detail}</div>}
    </div>
  );
}

function TruckDetailPanel({ entry, money, mode }: { entry: TruckPLEntry; money: TruckMoney; mode: string }) {
  const tripRows   = entry.tripRows ?? [];
  const maintRows  = entry.maintenanceRows ?? [];
  const emiDetails = entry.emiDetails ?? [];
  const km = entry.totalKm;
  const scale = Math.max(entry.totalHireAmount, Math.abs(money.net), Math.abs(money.tripProfit), 1);
  const docs = Object.entries(entry.documentBreakdown ?? {}).filter(([, v]) => v > 0);

  const summary = (() => {
    const costs: string[] = [`${fmt(entry.tripExpenses)} of trip expenses`];
    if (money.diesel) costs.push(`${fmt(money.diesel)} of diesel`);
    if (money.running) costs.push(`${fmt(money.running)} of tyres and maintenance`);
    if (money.fixed) costs.push(`${fmt(money.fixed)} of EMI and documents`);
    const list = costs.length > 1 ? `${costs.slice(0, -1).join(", ")} and ${costs[costs.length - 1]}` : costs[0];
    const earned = entry.tripCount > 0
      ? `${entry.registrationNumber || entry.truckId} earned ${fmt(entry.totalHireAmount)} from ${entry.tripCount} trip${entry.tripCount !== 1 ? "s" : ""}`
      : `${entry.registrationNumber || entry.truckId} had no trips in this period`;
    return `${earned}. After ${list}, it ${money.net >= 0 ? "made" : "lost"} ${fmt(money.net)}.`;
  })();

  const lossReason = (() => {
    if (money.net >= 0) return null;
    if (entry.tripCount === 0) return "It had no trips, but its EMI and documents still cost money.";
    if (money.tripProfit < 0) return "Its trip expenses are more than its hire.";
    if (money.gross != null && money.gross < 0) return "Diesel is more than what's left after trip expenses.";
    if (money.fixed > (money.gross ?? money.tripProfit)) return `EMI and documents (${fmt(money.fixed)}) are more than what its trips left after diesel — it needs more trips to cover them.`;
    return "Tyres and maintenance took more than what was left after diesel.";
  })();

  return (
    <div className="space-y-5 px-6 py-5 bg-gray-50/70">
      {/* Plain-language summary */}
      <div className="space-y-1.5">
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-900">{summary}</p>
        {lossReason && (
          <p className="flex items-start gap-1.5 px-1 text-xs text-red-600"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Why a loss: {lossReason}</p>
        )}
        {money.incomplete.length > 0 && (
          <p className="flex items-start gap-1.5 px-1 text-xs text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Net Profit is missing something: {money.incomplete.join("; ")}. Set it in the Running Cost Calculator.
          </p>
        )}
        {entry.documentShare === 0 && (
          <p className="flex items-start gap-1.5 px-1 text-xs text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No document costs (RC, FC, insurance, permits…) are recorded for this truck.
          </p>
        )}
      </div>

      {/* Waterfall */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">How Net Profit is worked out · {mode} mode</p>
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-gray-50 p-2">
          <WaterfallRow scale={scale} label={`Hire (${entry.tripCount} trip${entry.tripCount !== 1 ? "s" : ""})`} value={entry.totalHireAmount} kind="in"
            detail="From the trip sheets in this period, less any route commission." />
          <WaterfallRow scale={scale} label="Trip Expenses" value={entry.tripExpenses} kind="out" detail="Everything entered on those trip sheets." />
          <WaterfallRow scale={scale} label="= Trip Profit" value={money.tripProfit} kind="result" />
          <WaterfallRow scale={scale} label="Diesel" value={money.diesel} kind="out"
            detail={km <= 0 ? "No km driven." : money.dieselRate != null
              ? `${km.toLocaleString("en-IN")} km × ₹${money.dieselRate.toFixed(2)} per km (Running Cost Calculator → ${mode} → Mileage)`
              : `No Mileage cost per km for this truck in Running Cost Calculator → ${mode}.`} />
          <WaterfallRow scale={scale} label="= Gross Profit" value={money.gross} kind="result" />
          <WaterfallRow scale={scale} label="Tyres" value={money.tyres} kind="out"
            detail={km <= 0 ? "No km driven." : money.tyreRate != null
              ? `${km.toLocaleString("en-IN")} km × ₹${money.tyreRate.toFixed(2)} per km (Running Cost Calculator → ${mode} → Tyre Charges)`
              : `No Tyre Charges per km for this truck in Running Cost Calculator → ${mode}.`} />
          <WaterfallRow scale={scale} label="Maintenance" value={entry.maintenanceExpenses} kind="out"
            detail={`${entry.maintenanceCount} maintenance record${entry.maintenanceCount !== 1 ? "s" : ""} in this period (Truck Maintenance).`} />
          <WaterfallRow scale={scale} label="EMI" value={entry.emiShare} kind="out"
            detail={emiDetails.length ? `This period's share of ${emiDetails.length} loan${emiDetails.length !== 1 ? "s" : ""} (Finance → EMI) — up to today.` : "No active loan."} />
          <WaterfallRow scale={scale} label="Documents" value={entry.documentShare} kind="out"
            detail={docs.length ? docs.map(([k, v]) => `${DOC_LABELS[k] ?? k} ${fmt(v)}`).join(" · ") : "None recorded."} />
          <WaterfallRow scale={scale} label="= Net Profit" value={money.net} kind="result" />
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
            <table className="w-full min-w-[680px] text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Trip ID", "Date", "Sheet No", "Route", "Hire", "Expenses", "Trip Profit"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tripRows.map((t, i) => {
                  const tPl = t.tripProfit ?? 0;
                  return (
                    <tr key={i} className={cn("hover:bg-gray-50", t.excludedFromTotals && "bg-amber-50/60 hover:bg-amber-50")}>
                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-blue-700">{t.tripCode || "—"}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(t.tripSheetDate)}</td>
                      <td className="px-3 py-2 font-medium text-gray-700">
                        {t.tripSheetNo || "—"}
                        {t.flaggedForRecheck && (
                          <span
                            title={t.flaggedRemark ? `Flagged for recheck: ${t.flaggedRemark}` : "Flagged for recheck"}
                            className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700"
                          >
                            <AlertCircle className="h-2.5 w-2.5" /> Under Review
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {t.fromLocation && t.toLocation ? `${t.fromLocation} → ${t.toLocation}` : "—"}
                        {t.totalKm > 0 && <span className="ml-1.5 text-gray-400">({t.totalKm.toLocaleString("en-IN")} km)</span>}
                      </td>
                      <td className={cn("px-3 py-2 font-semibold", t.excludedFromTotals ? "text-gray-400" : "text-blue-700")}>{fmt(t.hireAmount)}</td>
                      <td className={cn("px-3 py-2", t.excludedFromTotals ? "text-gray-400" : "text-gray-600")}>{fmt(t.totalExpense)}</td>
                      <td className="px-3 py-2">
                        {t.excludedFromTotals ? <span className="text-[11px] text-gray-400">Excluded *</span> : <PlBadge value={tPl} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {entry.flaggedTripCount > 0 && (
            <p className="mt-1.5 text-[11px] text-amber-600">
              * {entry.flaggedTripCount} trip{entry.flaggedTripCount !== 1 ? "s" : ""} flagged for recheck by Audit — excluded from the totals above until resolved.
            </p>
          )}
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
// The "real accounts" view: Net Profit = Hire − Trip Expenses − Diesel − Tyres
// − Maintenance − EMI − Documents. Diesel and Tyres come from the Running Cost
// Calculator's per-km figures for the selected mode; the rest from records.
function TruckProfitabilityTab({
  data,
  totals,
  mode,
  firstTripDate,
  startDate,
  endDate,
}: {
  data: PlComputedTruck[];
  totals: PlComputed["truckTotals"];
  mode: "Manual" | "Basic" | "Advanced";
  firstTripDate: string | null;
  startDate: string;
  endDate: string;
}) {
  const [expandedTruck, setExpandedTruck] = useState<string | null>(null);
  // Clicking "Profitable Trucks" / "Non-Profitable Trucks" drills the table
  // into exactly the trucks each card counts (Net Profit >=/< 0).
  const [profitFilter, setProfitFilter] = useState<"all" | "profitable" | "non-profitable">("all");

  const rows = useMemo(() => data.map((e) => ({ entry: e, money: e.money })), [data]);
  const filtered = profitFilter === "all" ? rows
    : profitFilter === "profitable" ? rows.filter((r) => r.money.net >= 0)
    : rows.filter((r) => r.money.net < 0);
  // Totals and counts come from the server, like every figure here.
  const idle = totals.idle;
  const incompleteCount = totals.incomplete;
  const profitable = totals.profitable;
  const nonProfitable = totals.nonProfitable;

  const today = new Date().toISOString().slice(0, 10);
  const startsBeforeData = !!firstTripDate && startDate < firstTripDate;
  const endsInFuture = endDate > today;

  return (
    <div className="flex flex-col gap-5">

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Trucks" value={String(totals.trucks)} sub={idle ? `${idle} idle (no trips)` : "All ran trips"}
          icon={<BarChart3 className="h-4 w-4" />} color="blue" />
        <StatCard label="Profitable Trucks" value={`${profitable} / ${totals.trucks}`}
          sub="By Net Profit"
          icon={<TrendingUp className="h-4 w-4" />} color="emerald"
          onClick={() => setProfitFilter((f) => (f === "profitable" ? "all" : "profitable"))}
          active={profitFilter === "profitable"} />
        <StatCard label="Non-Profitable Trucks" value={`${nonProfitable} / ${totals.trucks}`}
          sub="By Net Profit"
          icon={<TrendingDown className="h-4 w-4" />} color="red"
          onClick={() => setProfitFilter((f) => (f === "non-profitable" ? "all" : "non-profitable"))}
          active={profitFilter === "non-profitable"} />
        <StatCard label="Total Hire Revenue" value={fmt(totals.hire)} sub={`${totals.trips} trips`}
          icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Gross Profit" value={fmt(totals.gross)} sub="After trip expenses & diesel"
          icon={totals.gross >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.gross >= 0 ? "emerald" : "red"} />
        <StatCard label="Net Profit" value={fmt(totals.net)} sub="After every cost"
          icon={totals.net >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.net >= 0 ? "emerald" : "red"} />
      </div>

      {/* Period / data warnings */}
      {(startsBeforeData || endsInFuture || incompleteCount > 0) && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {startsBeforeData && (
            <p className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Trips are only recorded from {fmtDate(firstTripDate!)} — EMI and other costs before that date have no recorded trips to pay for them, so this period looks worse than it is. Pick a period starting on or after {fmtDate(firstTripDate!)} for a fair view.</p>
          )}
          {endsInFuture && (
            <p className="flex items-start gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This period runs past today — EMI, documents and maintenance are counted only up to today ({fmtDate(today)}).</p>
          )}
          {incompleteCount > 0 && (
            <p className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {incompleteCount} truck{incompleteCount !== 1 ? "s have" : " has"} no diesel or tyre cost per km in {mode} mode, so their Net Profit leaves that out (marked ⚠). Set them in the Running Cost Calculator.</p>
          )}
        </div>
      )}

      {profitFilter !== "all" && (
        <div className="flex items-center gap-2 text-xs">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold",
            profitFilter === "profitable" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          )}>
            {profitFilter === "profitable" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            Showing: {profitFilter === "profitable" ? "Profitable" : "Non-Profitable"} trucks only
          </span>
          <button
            type="button"
            onClick={() => setProfitFilter("all")}
            className="font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <p className="-mb-2 flex items-center gap-1.5 px-1 text-xs text-gray-500">
          <MousePointerClick className="h-3.5 w-3.5 text-blue-500" />
          Click any truck to see how its Net Profit is worked out. Hover <Info className="inline h-3 w-3 text-gray-400" /> on a column for what it means.
        </p>
      )}
      <div className="rounded-xl border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-400">
              {profitFilter === "all" ? "No trucks found for this period." : "No trucks match this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-2 py-3" />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Truck</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Trips</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">KM</th>
                  <HintTh label="Hire" hint="Hire from this truck's trip sheets in the period, less route commission." />
                  <HintTh label="Trip Expenses" hint="Everything entered on those trip sheets (batta, toll, port pass, …)." />
                  <HintTh label="Trip Profit" hint="Hire − Trip Expenses" />
                  <HintTh label="Diesel" hint="KM × the truck's Mileage cost per km in the Running Cost Calculator (selected mode)." />
                  <HintTh label="Gross Profit" hint="Trip Profit − Diesel" />
                  <HintTh label="Running Costs" hint="Tyres (KM × Tyre Charges per km from the Running Cost Calculator) + Maintenance records in the period." />
                  <HintTh label="Fixed Costs" hint="EMI share + document share (RC, FC, insurance, permits…) for the period, up to today." />
                  <HintTh label="Net Profit" hint="Gross Profit − Running Costs − Fixed Costs" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ entry, money }) => {
                  const isOpen = expandedTruck === entry.truckId;
                  return (
                  <Fragment key={entry.truckId}>
                  <tr
                    onClick={() => setExpandedTruck(isOpen ? null : entry.truckId)}
                    title="Click to see how this truck's Net Profit is worked out"
                    className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                      <td className="px-2 py-3 text-center">
                        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{entry.truckId}<DisposalChip disposal={entry.disposal} /></p>
                        <p className="text-xs text-gray-400">{entry.registrationNumber}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          entry.tripCount ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500")}>
                          {entry.tripCount || "Idle"}
                        </span>
                        {entry.flaggedTripCount > 0 && (
                          <span
                            title={`${entry.flaggedTripCount} trip(s) under review — excluded from this truck's totals`}
                            className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700"
                          >
                            <AlertCircle className="h-2.5 w-2.5" /> {entry.flaggedTripCount}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600 tabular-nums">
                        {entry.totalKm > 0 ? entry.totalKm.toLocaleString("en-IN") : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(entry.totalHireAmount)}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">{fmt(entry.tripExpenses)}</td>
                      <td className="px-4 py-3 text-right"><PlBadge value={money.tripProfit} /></td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">
                        {money.diesel != null ? fmt(money.diesel) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {money.gross != null ? <PlBadge value={money.gross} /> : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">{fmt(money.running)}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">{fmt(money.fixed)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {money.incomplete.length > 0 && (
                          <span title={`Missing: ${money.incomplete.join("; ")}`} className="mr-1 cursor-help text-amber-500">⚠</span>
                        )}
                        <PlBadge value={money.net} />
                      </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-gray-100">
                      <td colSpan={12} className="p-0">
                        <TruckDetailPanel entry={entry} money={money} mode={mode} />
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
                    <span className="ml-1.5 text-xs font-normal text-gray-400">({totals.trucks} trucks)</span>
                  </td>
                  <td className="px-4 py-3 text-center text-blue-700">{totals.trips}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700 tabular-nums">{totals.km > 0 ? totals.km.toLocaleString("en-IN") : "—"}</td>
                  <td className="px-4 py-3 text-right text-blue-700">{fmt(totals.hire)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{fmt(totals.tripExpenses)}</td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totals.tripProfit} /></td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{fmt(totals.diesel)}</td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totals.gross} /></td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{fmt(totals.running)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700">{fmt(totals.fixed)}</td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totals.net} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 italic">
        Net Profit = Hire − Trip Expenses − Diesel − Tyres − Maintenance − EMI − Documents. Diesel and Tyres use the Running Cost Calculator&rsquo;s
        per-km figures for the selected mode; everything else comes from real records. Click a row to see the full breakdown.
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
  const [computed, setComputed]              = useState<PlComputed | null>(null);
  const [loading, setLoading]                = useState(false);
  const [error, setError]                    = useState<string | null>(null);
  const [tab, setTab]                        = useState<Tab>("trips");
  const [mode, setMode]                      = useState<"Manual" | "Basic" | "Advanced">("Manual");
  const [exportPreview, setExportPreview] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[] } | null>(null);
  const [preparingExport, setPreparingExport] = useState(false);
  const [showHowCalculated, setShowHowCalculated] = useState(false);
  const [showQuickStart, setShowQuickStart]  = useState(false);

  const [firstTripDate, setFirstTripDate] = useState<string | null>(null);
  useEffect(() => { plSummaryApi.getFirstTripDate().then(setFirstTripDate).catch(() => {}); }, []);

  // Search runs on the server too (it narrows the totals), so it's debounced.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const q = debouncedSearch.toLowerCase();

  // Load (and reload) whenever the period, the Cost/KM mode or the search changes.
  const latestRequest = useRef(0);
  useEffect(() => { fetchData(); }, [mode, debouncedSearch]);
  // Live refresh — closing a trip sheet, editing an EMI, or logging maintenance
  // elsewhere previously left this page's numbers stale until a manual re-pick
  // of the date range.
  const refreshAll = () => { fetchData(); };
  useWebSocketEvent("trip_closed", refreshAll);
  useWebSocketEvent("trip_updated", refreshAll);
  useWebSocketEvent("finance_updated", refreshAll);
  useWebSocketEvent("maintenance_updated", refreshAll);
  useWebSocketEvent("truck_updated", refreshAll);
  // Fuel, tyres, run config, documents, the calculator's Manual inputs…
  useWebSocketEvent("data_changed", (payload) => {
    const r = String((payload as { resource?: unknown })?.resource ?? "");
    if (COST_INPUT_RESOURCES.has(r) || r === "running-cost") fetchData();
  });
  useAutoRefresh(refreshAll, 30000);

  /** View → the audit report, built on the server (backend/pl_export.py) for
   * this period and Cost/KM mode: Summary · Trips · Trip Expenses · Trucks ·
   * Rates, formatted, with live formulas. The preview comes from the server
   * too — it works the formulas out (the file stores them unevaluated). */
  async function openExportPreview() {
    if (!computed || preparingExport) return;
    setPreparingExport(true);
    try {
      const qs = new URLSearchParams({ start_date: startDate, end_date: endDate, mode }).toString();
      const [file, preview] = await Promise.all([
        fetchExcel(`/pl-summary/export?${qs}`, `Profitability_${fmtDate(startDate)}_to_${fmtDate(endDate)}.xlsx`),
        plSummaryApi.getExportPreview(qs),
      ]);
      setExportPreview({ blob: file.blob, filename: file.filename, sheets: preview.sheets });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Could not prepare the export.");
    } finally {
      setPreparingExport(false);
    }
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
    const req = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await plSummaryApi.getComputed(s, e, mode, debouncedSearch);
      if (req === latestRequest.current) setComputed(result);   // ignore a slower, older answer
    } catch (err) {
      if (req === latestRequest.current) setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      if (req === latestRequest.current) setLoading(false);
    }
  }

  return (
    <div className="animate-stagger flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Profitability</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Trip-wise and truck-wise P&L for the selected period.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button" onClick={() => setShowQuickStart(true)}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:border-blue-300 hover:text-blue-700 hover:shadow-md"
          >
            <Compass className="h-4 w-4" />
            Quick Start Guide
          </button>
          <button
            type="button" onClick={() => setShowHowCalculated(true)}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:border-blue-300 hover:text-blue-700 hover:shadow-md"
          >
            <Calculator className="h-4 w-4" />
            How is it Calculated
          </button>
          {computed && (
            <button
              type="button" onClick={openExportPreview} disabled={preparingExport}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preparingExport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {preparingExport ? "Preparing…" : "View"}
            </button>
          )}
        </div>
      </div>

      {/* Toolbar: period presets on the left, date range on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          size="md"
          label="Period"
          value={activePreset}
          onChange={(label) => {
            const preset = PRESETS.find((p) => p.label === label);
            if (preset) applyPreset(preset);
          }}
          options={PRESETS.map((p) => ({ value: p.label, label: p.label }))}
        />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {loading && (
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </span>
          )}
          <DateRangePill
            from={startDate}
            to={endDate}
            onFromChange={(v) => { setStartDate(v); setActivePreset(""); if (v && endDate) fetchData(v, endDate); }}
            onToChange={(v) => { setEndDate(v); setActivePreset(""); if (startDate && v) fetchData(startDate, v); }}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {computed !== null && (
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
            <Segmented
              size="md"
              label="Report view"
              value={tab}
              onChange={setTab}
              options={[
                { value: "trips", label: "Trip Profitability", count: computed.allTripCount },
                { value: "trucks", label: "Truck Profitability", count: computed.allTruckCount },
              ]}
            />

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <PillSearch
                placeholder={tab === "trips" ? "Search sheet, booking, truck, customer, route..." : "Search truck or registration..."}
                value={search}
                onChange={setSearch}
              />
              {/* Mode selector */}
              <Segmented
                size="md"
                label="Cost mode"
                value={mode}
                onChange={setMode}
                options={(["Manual", "Basic", "Advanced"] as const).map((m) => ({ value: m, label: m }))}
              />
            </div>
          </div>

          {q && (
            <div className="-mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">
                Showing {tab === "trips" ? `${computed.trips.length} of ${computed.allTripCount} trips` : `${computed.trucks.length} of ${computed.allTruckCount} trucks`} matching &ldquo;{debouncedSearch}&rdquo;
              </span>
              <button type="button" onClick={() => setSearch("")}
                className="font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline">
                Clear
              </button>
              <span className="text-gray-400">· cards and totals below are for these only</span>
            </div>
          )}

          {tab === "trips"  && <TripProfitabilityTab trips={computed.trips} totals={computed.tripTotals} mode={mode} />}
          {tab === "trucks" && (
            <TruckProfitabilityTab data={computed.trucks} totals={computed.truckTotals} mode={mode}
              firstTripDate={firstTripDate} startDate={startDate} endDate={endDate} />
          )}
        </>
      )}

      {computed === null && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-14 text-center">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-semibold text-gray-500">Select a period to load profitability data</p>
          <p className="mt-2 text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            Trip Profit = Hire − Trip Expenses
            <br />
            Gross Profit = Trip Profit − Diesel Expenses (KM × Mileage Cost/KM)
            <br />
            Final Profit = Gross Profit − Truck Expenses
          </p>
        </div>
      )}

      {showHowCalculated && <HowCalculatedModal onClose={() => setShowHowCalculated(false)} />}
      {showQuickStart && <QuickStartModal onClose={() => setShowQuickStart(false)} />}

      {exportPreview && (
        <ExportPreviewDialog
          title={`Profitability Report — ${fmtDate(startDate)} to ${fmtDate(endDate)}`}
          filename={exportPreview.filename}
          blob={exportPreview.blob}
          sheets={exportPreview.sheets}
          onClose={() => setExportPreview(null)}
        />
      )}
    </div>
  );
}
