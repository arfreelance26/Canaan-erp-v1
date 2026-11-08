"use client";

import { Fragment, useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { COST_INPUT_RESOURCES } from "@/lib/api-cache";
import { PendingCostNotice } from "@/components/maintenance/PendingCostNotice";
import { RiArrowRightUpLine as TrendingUp, RiArrowRightDownLine as TrendingDown, RiLoader4Line as Loader2, RiBarChartBoxLine as BarChart3, RiArrowRightLine as ArrowRight, RiEyeLine as Eye, RiMoneyDollarCircleLine as DollarSign, RiToolsLine as Wrench, RiBankLine as Landmark, RiErrorWarningLine as AlertCircle, RiCalendar2Line as CalendarDays, RiCloseLine as X, RiShieldCheckLine as ShieldCheck, RiArrowDownSLine as ChevronDown, RiCalculatorLine as Calculator, RiCompass3Line as Compass, RiRouteLine as Route, RiFileTextLine as FileText, RiGasStationLine as Fuel, RiCursorLine as MousePointerClick, RiEqualizerLine as SlidersHorizontal, RiInformationLine as Info, RiErrorWarningLine as WarnIcon } from "@remixicon/react";
import { problemFromMessage, reportProblem } from "@/lib/connection-problem";
import { fetchExcel, plSummaryApi, type PlComputed, type PlComputedTrip, type PlComputedTruck, type PlTruckMoney, type TruckPLEntry } from "@/lib/api";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { Segmented } from "@/components/ui/Segmented";
import { PillSearch } from "@/components/ui/PillSearch";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";
import { showError } from "@/lib/feedback";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import dynamic from "next/dynamic";
import Link from "next/link";
import { downloadPlReportPdf } from "@/lib/pl-report-pdf";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const TripBreakdownDialog = dynamic(() => import("@/components/insights/TripBreakdownDialog").then((m) => m.TripBreakdownDialog));

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
/** The exact amount (₹4,24,277.79) — shown on hover wherever fmt() shortens it. */
function fmtFull(v: number) {
  return `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** A shortened amount with the exact one on hover (to match the Excel). */
function Amount({ v }: { v: number }) {
  return <span title={fmtFull(v)}>{fmt(v)}</span>;
}
/** "EMI ₹20,000.00 · Tyres ₹1,000.00 · …" — what a combined cost is made of. */
function splitTitle(parts: [string, number | null | undefined][]): string {
  return parts.filter(([, v]) => v != null && Math.abs(v) >= 0.005).map(([k, v]) => `${k} ${fmtFull(v!)}`).join(" · ") || "Nothing";
}

/** "9 Nov" or "9–30 Nov" for a stretch of days. */
function dayRange(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00`), t = new Date(`${to}T00:00:00`);
  const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (from === to) return day(f);
  return f.getMonth() === t.getMonth() ? `${f.getDate()}–${day(t)}` : `${day(f)} – ${day(t)}`;
}

type EmiLoan = TruckPLEntry["emiDetails"][number];
const GAP_WHY: Record<EmiLoan["uncounted"][number]["reason"], string> = {
  future: "not over yet — it counts as those days pass",
  outside: "outside the dates you picked",
  loan_start: "before the loan started",
  loan_end: "after the loan ended",
  sold: "after the truck left the fleet",
};
/** Where the rest of a loan's instalments is, when less than the full EMI is
 *  counted: "The other ₹46,981.73 is for 9–30 Nov — not over yet …". */
function emiGapText(loans: EmiLoan[]): string | null {
  const full = loans.reduce((s, l) => s + l.fullForPeriod, 0);
  const counted = loans.reduce((s, l) => s + l.shareForPeriod, 0);
  if (full - counted < 1) return null;
  const parts: string[] = [];
  for (const l of loans) {
    for (const g of l.uncounted) {
      parts.push(`${fmtFull(g.amount)} for ${dayRange(g.from, g.to)}${loans.length > 1 ? ` (${l.emiName})` : ""}: ${GAP_WHY[g.reason]}`);
    }
  }
  return `${fmtFull(counted)} of ${fmtFull(full)} in full instalments. The other ${fmtFull(full - counted)} isn't counted here — ${parts.join("; ")}.`;
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
type TripSortKey = "date" | "hire" | "expense" | "pl" | "gross" | "final";
type TruckSortKey = "trips" | "km" | "hire" | "expense" | "tripProfit" | "diesel" | "gross" | "running" | "fixed" | "net";
type Mode = "Manual" | "Basic" | "Advanced";
const MODE_KEY = "canaan.pl.mode";

/** Why a trip has no Final Profit, in a few words. */
function unjudgedReason(t: PlComputedTrip): string {
  if (t.totalKm <= 0) return "No km";
  if (t.money.dieselRate == null) return "No diesel rate";
  return "No cost per km";
}

// ── Shared components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color, onClick, active, exact }: {
  label: string; value: string; sub?: string;
  /** The exact amount, shown on hover when `value` is shortened (₹4.24 L). */
  exact?: number | null;
  icon: React.ReactNode;
  color: "blue" | "emerald" | "red" | "amber" | "purple" | "slate";
  /** When set, the card becomes a toggleable filter — see TripProfitabilityTab's
   * profitFilter (clicking "Profitable"/"Non-Profitable" drills the table below
   * into just those trips; clicking the active one again clears it). */
  onClick?: () => void;
  active?: boolean;
}) {
  const ring = { blue: "border-accent-border bg-accent-surface", emerald: "border-success-border bg-success-surface", red: "border-danger-border bg-danger-surface", amber: "border-warning-border bg-warning-surface", purple: "border-purple-border bg-purple-surface", slate: "border-separator-border bg-fill-1" };
  const activeRing = { blue: "ring-2 ring-accent-border-strong", emerald: "ring-2 ring-success-border-strong", red: "ring-2 ring-danger-border-strong", amber: "ring-2 ring-warning-border-strong", purple: "ring-2 ring-purple-border-strong", slate: "ring-2 ring-border-button-default" };
  const txt  = { blue: "text-accent-text", emerald: "text-success-text", red: "text-danger-text", amber: "text-warning-text", purple: "text-purple-text", slate: "text-text-primary" };
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
        <span className="text-caption-1-semibold opacity-70">{label}</span>
      </div>
      <p className={`text-title-2-semibold ${txt[color]}`} title={exact != null ? fmtFull(exact) : undefined}><AnimatedNumber value={value} /></p>
      {sub && <p className={`mt-0.5 text-xs ${txt[color]} opacity-60`}>{sub}</p>}
    </div>
  );
}

function PlBadge({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const p = value >= 0;
  const base = p ? "bg-success-surface-strong text-success-text" : "bg-danger-surface-strong text-danger-text";
  const cls  = size === "lg"
    ? `inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-body-semibold ${base}`
    : `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption-1-semibold ${base}`;
  return (
    <span className={cls} title={fmtFull(value)}>
      {p ? <TrendingUp className="h-3.5 w-3.5 shrink-0" /> : <TrendingDown className="h-3.5 w-3.5 shrink-0" />}
      {p ? "+" : "−"}{fmt(value)}
    </span>
  );
}

function SortTh<K extends string>({ label, col, current, dir, onSort, hint, align = "right" }: {
  label: string; col: K; current: K | null; dir: "asc" | "desc";
  onSort: (c: K) => void; hint?: string; align?: "right" | "center";
}) {
  const active = current === col;
  return (
    <th
      className={cn("px-4 py-3 text-caption-1-semibold text-text-secondary cursor-pointer select-none hover:text-accent-text whitespace-nowrap",
        align === "center" ? "text-center" : "text-right")}
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
    <span title={text} className="ml-1 inline-flex cursor-help align-middle text-text-tertiary hover:text-accent-text">
      <Info className="h-3 w-3" />
    </span>
  );
}

function HintTh({ label, hint }: { label: string; hint: string }) {
  return (
    <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary whitespace-nowrap">
      {label}<HintIcon text={hint} />
    </th>
  );
}

// ── Guide modal shell ────────────────────────────────────────────────────────────
type GuideTab = "Overview" | "Manual" | "Basic" | "Advanced";
const GUIDE_TABS: GuideTab[] = ["Overview", "Manual", "Basic", "Advanced"];
const MODE_DOT: Record<GuideTab, string> = { Overview: "bg-accent-solid", Manual: "bg-warning-solid", Basic: "bg-teal-solid", Advanced: "bg-purple-solid" };

function ModalShell({ title, subtitle, icon, onClose, tabBar, children }: {
  title: string; subtitle?: string; icon: React.ReactNode; onClose: () => void;
  tabBar?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4">
      <div className="bg-background-primary-default rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-separator-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg bg-accent-surface p-2 text-accent-text shrink-0">{icon}</div>
            <div className="min-w-0">
              <h2 className="text-title-3-semibold text-text-primary">{title}</h2>
              {subtitle && <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-fill-3 hover:text-text-primary">
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
    <div className="rounded-lg bg-accent-solid px-4 py-3 font-mono text-[11px] leading-relaxed text-on-solid/90 overflow-x-auto">
      {children}
    </div>
  );
}

function GuideSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2 flex items-center gap-1.5 text-caption-1-semibold text-text-tertiary">
        {icon}{title}
      </p>
      <div className="space-y-2 text-sm text-text-primary leading-relaxed">{children}</div>
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
          <GuideSection title="Two questions, two tabs" icon={<FileText className="h-3.5 w-3.5" />}>
            <p>
              <b>Trip Profitability</b> answers &ldquo;was each trip a good deal?&rdquo; — every trip is judged at steady costs per km.
              <b> Truck Profitability</b> answers &ldquo;what did each truck really make?&rdquo; — the real bills for the period. Both use the
              trip sheets completed in the period (a trip counts in the month it was completed). Their totals differ on purpose:
              &ldquo;Why the two tabs differ&rdquo; shows exactly by how much (EMI for idle days, repairs above or below normal,
              documents, idle trucks, trips with no km or no profit figure).
            </p>
            <p className="text-xs text-text-secondary">
              Trips under audit review are listed but left out of every total until the recheck is done. A past month is worked out
              with the prices, mileage and costs as they stood in that month, so later fills or bills don&rsquo;t change it.
            </p>
          </GuideSection>

          <GuideSection title="Trip Profitability tab" icon={<Route className="h-3.5 w-3.5" />}>
            <p>Per trip:</p>
            <Formula>Hire&nbsp;&nbsp;=&nbsp;&nbsp;Hire Amount − Route Commission</Formula>
            <Formula>Trip Profit&nbsp;&nbsp;=&nbsp;&nbsp;Hire − Trip Expenses</Formula>
            <Formula>Diesel Expenses&nbsp;&nbsp;=&nbsp;&nbsp;Total KM × (the month&rsquo;s diesel price paid ÷ the truck&rsquo;s mileage)</Formula>
            <Formula>Gross Profit&nbsp;&nbsp;=&nbsp;&nbsp;Trip Profit − Diesel Expenses</Formula>
            <Formula>Truck Expenses&nbsp;&nbsp;=&nbsp;&nbsp;EMI + Maintenance + Documents + Tyres + AdBlue&nbsp;&nbsp;(each Total KM × its cost per km)</Formula>
            <Formula>EMI, Documents, Maintenance&nbsp;&nbsp;=&nbsp;&nbsp;Trip KM × (the truck&rsquo;s monthly cost ÷ its monthly KM)</Formula>
            <Formula>AdBlue&nbsp;&nbsp;=&nbsp;&nbsp;Trip KM × (AdBlue price per litre ÷ the truck&rsquo;s AdBlue km per litre)</Formula>
            <Formula>Final Profit&nbsp;&nbsp;=&nbsp;&nbsp;Gross Profit − Truck Expenses</Formula>
            <p className="text-xs text-text-secondary">
              <b>Diesel per km</b> = the average price paid per litre in the trip&rsquo;s month (all trucks&rsquo; fuel fills; wrongly typed
              prices left out) ÷ the truck&rsquo;s mileage from its fuel fills up to the end of that month (only readings between 1.5 and
              6 km/L count, and odd fills far from the truck&rsquo;s usual are left out). <b>AdBlue</b> counts as ₹0 until the truck has
              at least 2 AdBlue fills.
            </p>
            <p className="text-xs text-text-secondary">
              This tab judges each trip at <b>steady costs per km</b>, so a good trip looks good whether the truck was busy or quiet
              that month. The monthly cost is the EMI and documents due in the trip&rsquo;s month and the truck&rsquo;s normal monthly
              maintenance. The monthly KM is, in <b>Basic</b>, the km/day set for its tyre layout × 26 (Admin → Truck Run
              Configuration) and, in <b>Advanced</b>, the truck&rsquo;s normal km a month (the average of the months it worked, in the
              last 6). No Final Profit is worked out for a trip whose truck has no diesel cost per km yet (no fuel fills) or whose
              sheet has no km — the yellow box lists them. EMI for idle days and repairs above normal show on the Truck Profitability
              tab — &ldquo;Why the two tabs differ&rdquo; shows by how much.
            </p>
          </GuideSection>

          <GuideSection title="Truck Profitability tab" icon={<Wrench className="h-3.5 w-3.5" />}>
            <p>Per truck, across every trip in the period:</p>
            <Formula>Trip Profit&nbsp;&nbsp;=&nbsp;&nbsp;Hire − Trip Expenses</Formula>
            <Formula>Gross Profit&nbsp;&nbsp;=&nbsp;&nbsp;Trip Profit − Diesel&nbsp;&nbsp;(the sum of its trips&rsquo; diesel)</Formula>
            <Formula>Running Costs&nbsp;&nbsp;=&nbsp;&nbsp;AdBlue + Tyres&nbsp;(for the km driven) + the real maintenance bills</Formula>
            <Formula>Maintenance&nbsp;&nbsp;=&nbsp;&nbsp;approved bills dated in the period (by the day the work was done)</Formula>
            <Formula>Fixed Costs&nbsp;&nbsp;=&nbsp;&nbsp;EMI share + Document share&nbsp;&nbsp;(EMI: one instalment per month)</Formula>
            <Formula>Net Profit&nbsp;&nbsp;=&nbsp;&nbsp;Gross Profit − Running Costs − Fixed Costs</Formula>
            <p className="text-xs text-text-secondary">
              <b>Maintenance</b> counts only approved bills; a scheduled job with no cost yet isn&rsquo;t counted until it&rsquo;s
              done and approved. <b>EMI</b> is every loan on Finance → EMI Tracking, one instalment per calendar month. Only part of
              an instalment is counted when the month is cut short — the current month (up to today), a From/To date in the middle of
              a month, the month a loan starts or ends, or the month a truck was sold (up to the sale date) — split by its days. Such
              trucks show a <b>part EMI</b> tag; hover it, or open the truck row, to see the full instalment and which days
              weren&rsquo;t counted and why. <b>Documents</b> are each one&rsquo;s cost spread over the days it&rsquo;s valid, also up
              to today and the sale date. <b>AdBlue</b> is ₹0 for a truck with fewer than 2 AdBlue fills. Click any truck row for the
              full step-by-step breakdown.
            </p>
          </GuideSection>

          <GuideSection title="Cost/KM modes" icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
            <p>
              The mode decides the costs per km on Trip Profitability (and diesel and tyres on Truck Profitability). <b>Advanced</b> is
              built from each truck&rsquo;s own records and is the one to trust; <b>Basic</b> uses the settings; <b>Manual</b> uses figures
              typed into the Running Cost Calculator. See each tab above.
            </p>
          </GuideSection>
        </>
      )}

      {tab === "Manual" && (
        <>
          <GuideSection title="How Manual mode works" icon={<Fuel className="h-3.5 w-3.5" />}>
            <p>
              The costs per km are the figures typed into the <b>Running Cost Calculator</b> → Manual for each truck — diesel price and
              mileage, AdBlue, tyres, EMI, maintenance and documents. Diesel here uses the typed price and mileage, not the fuel fills.
              Use it for &ldquo;what if&rdquo; checks with your own numbers.
            </p>
          </GuideSection>
          <GuideSection title="What that means here">
            <p>
              Truck Expenses = Total KM × the costs per km typed for that truck. A truck with nothing typed yet shows
              <span className="text-text-tertiary"> —</span>. On Truck Profitability, Manual changes only diesel, AdBlue and tyres —
              EMI, maintenance and documents there are always the real bills.
            </p>
            <p className="text-xs text-text-secondary">Best for: what-if estimates. For real figures use Advanced.</p>
          </GuideSection>
        </>
      )}

      {tab === "Basic" && (
        <>
          <GuideSection title="How Basic mode works" icon={<Fuel className="h-3.5 w-3.5" />}>
            <p>
              Uses the <b>settings</b> instead of each truck&rsquo;s history: EMI, documents and maintenance per km are the monthly cost ÷
              the km a month its tyre layout is set to run (km/day × 26, Admin → Truck Run Configuration); tyres use the tyre cost per km of
              its tyre layout. Diesel and AdBlue are the same as Advanced (the month&rsquo;s diesel price paid ÷ the truck&rsquo;s
              mileage; AdBlue price ÷ the truck&rsquo;s AdBlue km per litre, ₹0 until 2 fills).
            </p>
          </GuideSection>
          <GuideSection title="What that means here">
            <p>
              If the km/day setting is higher than the trucks really run, Basic spreads the costs over too many km and trips look better
              than they are — keep the settings close to reality.
            </p>
            <p className="text-xs text-text-secondary">Best for: a quick view based on how far each tyre layout is expected to run.</p>
          </GuideSection>
        </>
      )}

      {tab === "Advanced" && (
        <>
          <GuideSection title="How Advanced mode works" icon={<Fuel className="h-3.5 w-3.5" />}>
            <p>Fully automatic — built from each truck&rsquo;s own records, as they were in each trip&rsquo;s month:</p>
            <ul className="ml-4 list-disc space-y-1 text-xs text-text-secondary">
              <li>Diesel — the month&rsquo;s price paid ÷ the truck&rsquo;s mileage from its fuel fills (only readings between 1.5 and
                6 km/L count, and odd fills far from the truck&rsquo;s usual are left out)</li>
              <li>Tyres — the tyres fitted that month: cost ÷ expected range</li>
              <li>EMI, documents, maintenance — the month&rsquo;s cost ÷ the truck&rsquo;s normal km a month (the average of the months it
                worked, in the last 6; a part month — its first month, the current month or the month it was sold — is scaled up to a
                full month so it doesn&rsquo;t pull the average down)</li>
              <li>Maintenance per month — the truck&rsquo;s normal monthly maintenance over the 12 months up to the trip&rsquo;s month</li>
              <li>AdBlue — the AdBlue price per litre ÷ the truck&rsquo;s AdBlue km per litre (₹0 until it has 2+ fills)</li>
            </ul>
          </GuideSection>
          <GuideSection title="What that means here">
            <p>
              The most accurate view. A trip whose truck has no fuel fills yet, or whose sheet has no km, can&rsquo;t be judged — the yellow
              box on the page says what to fix.
            </p>
            <p className="text-xs text-text-secondary">Best for: final, audit-grade profitability figures once a truck&rsquo;s data is fully maintained.</p>
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
            { n: 1, title: "Pick a period", body: "Use a quick preset (This Month, Last 3 Months, …) or set a custom From/To date. Trips count in the period they were completed. Data loads automatically." },
            { n: 2, title: "Choose a tab", body: "Trip Profitability: was each trip a good deal (steady costs per km)? Truck Profitability: what did each truck really make (the real bills)? Their totals differ on purpose — \"Why the two tabs differ\" explains it." },
            { n: 3, title: "Pick a cost mode", body: "Advanced (the default) is built from each truck's own records — use it for real figures. Basic uses the km/day and tyre settings; Manual uses figures typed into the Running Cost Calculator. See the mode tabs above." },
            { n: 4, title: "Expand a truck row", body: "In Truck Profitability, click any row to open a step-by-step Net Profit breakdown — diesel, tyres, maintenance, EMI loans, documents, and the trip list behind the numbers. In Trip Profitability, click any trip for its own breakdown." },
            { n: 5, title: "Read the cards and the yellow box", body: "The cards give the totals; Profitable / Non-Profitable filter the table. The yellow box lists what holds the figures back (trips with no km, documents with no cost…) with a link to fix each. Hover any shortened amount for the exact figure." },
            { n: 6, title: "Export a report", body: "Click \"View\" top-right to preview both Trip and Truck Profitability for the selected period/mode, then download as Excel or PDF." },
          ].map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-surface-strong text-caption-1-semibold text-accent-text">{s.n}</div>
              <div>
                <p className="text-body-semibold text-text-primary">{s.title}</p>
                <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Manual" && (
        <div className="space-y-4">
          <GuideSection title="Getting started with Manual mode" icon={<MousePointerClick className="h-3.5 w-3.5" />}>
            <p>1. Go to <b>Running Cost Calculator</b> → Manual.</p>
            <p>2. Type in each truck&rsquo;s diesel price and mileage, AdBlue, tyre, EMI, maintenance and document costs.</p>
            <p>3. Come back here and pick <b>Manual</b> — Truck Expenses and Final Profit use those figures.</p>
          </GuideSection>
          <p className="text-xs text-text-secondary">Nothing here is fetched automatically, so revisit the Calculator whenever diesel prices or other costs change.</p>
        </div>
      )}

      {tab === "Basic" && (
        <div className="space-y-4">
          <GuideSection title="Getting started with Basic mode" icon={<MousePointerClick className="h-3.5 w-3.5" />}>
            <p>1. Set realistic km per day for each tyre layout in Admin → Truck Run Configuration.</p>
            <p>2. Fill in the tyre quantities for each layout (Admin → tyre settings).</p>
            <p>3. Pick <b>Basic</b> here — EMI, documents and maintenance are spread over those km.</p>
          </GuideSection>
          <p className="text-xs text-text-secondary">If the km/day settings are higher than the trucks really run, trips will look better than they are.</p>
        </div>
      )}

      {tab === "Advanced" && (
        <div className="space-y-4">
          <GuideSection title="Getting started with Advanced mode" icon={<MousePointerClick className="h-3.5 w-3.5" />}>
            <p>1. Keep each truck&rsquo;s records up to date: fuel and AdBlue fills, tyres, approved maintenance bills, EMI loans and document costs.</p>
            <p>2. Make sure trip sheets have their start and end km.</p>
            <p>3. <b>Advanced</b> is the default here — the most accurate figures.</p>
          </GuideSection>
          <p className="text-xs text-text-secondary">Anything missing is listed in the yellow box on the page, with a link to where it&rsquo;s fixed.</p>
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
      className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
        disposal === "Sold" ? "bg-teal-surface-strong text-teal-text" : "bg-fill-3 text-text-secondary")}
    >
      {disposal}
    </span>
  );
}

// ── Period / data warnings (both tabs) ───────────────────────────────────────────
/** Things about the period or the data that hold its figures back — each with
 *  where it's fixed. Shown on both tabs (the same yellow box as before). */
function PeriodWarnings({ startDate, endDate, firstTripDate, health, mode, incompleteTrucks }: {
  startDate: string; endDate: string; firstTripDate: string | null;
  health: PlComputed["dataHealth"]; mode: Mode; incompleteTrucks?: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const startsBeforeData = !!firstTripDate && startDate < firstTripDate;
  const endsInFuture = endDate > today;
  const fix = (href: string, label: string) => (
    <Link href={href} className="ml-1 font-semibold underline underline-offset-2 hover:text-warning-text">{label} →</Link>
  );
  const lines: ReactNode[] = [];
  if (startsBeforeData) lines.push(
    <>Trips are only recorded from {fmtDate(firstTripDate!)} — EMI and other costs before that date have no recorded trips to pay for them, so this period looks worse than it is. Pick a period starting on or after {fmtDate(firstTripDate!)} for a fair view.</>);
  if (endsInFuture) lines.push(
    <>This period runs past today — on Truck Profitability, EMI, documents and maintenance are counted only up to today ({fmtDate(today)}).</>);
  if (health.noKmTrips) lines.push(
    <>{health.noKmTrips} trip{health.noKmTrips === 1 ? " has" : "s have"} no km on {health.noKmTrips === 1 ? "its" : "their"} trip sheet, so Trip Profitability can&apos;t judge {health.noKmTrips === 1 ? "it" : "them"} (Truck Profitability still counts the hire).{fix("/trips/completed", "Add the km")}</>);
  if (health.noDieselTrips) lines.push(
    <>{health.noDieselTrips} trip{health.noDieselTrips === 1 ? "" : "s"} on {health.noDieselTrucks} truck{health.noDieselTrucks === 1 ? "" : "s"} can&apos;t be judged: no diesel cost per km (the truck needs at least 2 fuel fills).{fix("/maintenance/truck-fuel-record", "Fuel records")}</>);
  if (incompleteTrucks) lines.push(
    <>{incompleteTrucks} truck{incompleteTrucks !== 1 ? "s have" : " has"} no diesel or tyre cost per km in {mode} mode, so {incompleteTrucks !== 1 ? "their" : "its"} Net Profit leaves that out (marked with a warning icon).{fix("/insights/running-cost-calculator", "Running Cost Calculator")}</>);
  if (health.documentsWithoutCost) lines.push(
    <>{health.documentsWithoutCost} document{health.documentsWithoutCost === 1 ? " has" : "s have"} an expiry date but no cost entered, so {health.documentsWithoutCost === 1 ? "it counts" : "they count"} as ₹0.{fix("/maintenance/compliance", "Enter the costs")}</>);
  if (!lines.length) return null;
  return (
    <div data-tour="pl-warnings" className="flex flex-col gap-1.5 rounded-xl border border-warning-border bg-warning-surface px-4 py-3 text-xs text-warning-text-strong">
      {lines.map((l, i) => (
        <p key={i} className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{l}</span></p>
      ))}
    </div>
  );
}

// ── Trip Profitability tab ─────────────────────────────────────────────────────
function TripProfitabilityTab({
  trips,
  totals,
  mode,
  warnings,
}: {
  trips: EnrichedTrip[];
  totals: PlComputed["tripTotals"];
  mode: Mode;
  warnings: ReactNode;
}) {
  const [sortKey, setSortKey] = useState<TripSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Clicking "Profitable Trips" / "Non-Profitable Trips" below drills the
  // table into exactly the trips each card counts (tripPl >=/< 0, among
  // countedTrips — the same set the cards' own "X / Y" figures are built
  // from, so the filtered list never shows something the card didn't count).
  const [profitFilter, setProfitFilter] = useState<"all" | "profitable" | "non-profitable" | "unjudged">("all");
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
      profitFilter === "unjudged" ? trips.filter((t) => !t.excludedFromTotals && fp(t) == null) :
      trips.filter((t) => !t.excludedFromTotals && fp(t) != null && fp(t)! < 0);
    // Trips with no figure sort last, whichever way.
    const nums = (t: EnrichedTrip): number | null =>
      sortKey === "hire" ? t.hireAmount : sortKey === "expense" ? t.totalExpense : sortKey === "pl" ? t.money.tripProfit
        : sortKey === "gross" ? t.money.gross : sortKey === "final" ? t.money.finalProfit : null;
    return [...base].sort((a, b) => {
      if (sortKey === "date") return sortDir === "asc" ? a.tripDate.localeCompare(b.tripDate) : b.tripDate.localeCompare(a.tripDate);
      const x = nums(a), y = nums(b);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
      return sortDir === "asc" ? x - y : y - x;
    });
  }, [trips, sortKey, sortDir, profitFilter]);

  // ── Summary (from the server) ─────────────────────────────────────────────
  // A trip an Auditor has flagged for rechecking still appears in the table
  // (with an "Under Review" badge) but is left out of every total.
  const flaggedCount = totals.flagged;
  const judged = totals.finalTrips;
  // Why the trips that can't be judged can't be (counted trips only).
  const unjudged = trips.filter((t) => !t.excludedFromTotals && t.money.finalProfit == null);
  const reasons = Object.entries(unjudged.reduce<Record<string, number>>((acc, t) => {
    const r = unjudgedReason(t);
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {})).map(([r, n]) => `${n} ${r.toLowerCase()}`).join(", ");

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div data-tour="pl-trip-cards" className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total Trips"      value={String(totals.trips)} icon={<BarChart3 className="h-4 w-4" />} color="blue" />
        <StatCard label="Profitable Trips" value={`${totals.profitable} / ${judged}`}
          sub={judged ? `${totals.profitablePct}% · after all costs${totals.unjudged ? ` · ${totals.unjudged} can't be judged (${reasons})` : ""}` : `No cost-per-km set (${mode})`}
          icon={<TrendingUp className="h-4 w-4" />} color="emerald"
          onClick={() => setProfitFilter((f) => (f === "profitable" ? "all" : "profitable"))}
          active={profitFilter === "profitable"} />
        <StatCard label="Non-Profitable Trips" value={`${totals.nonProfitable} / ${judged}`}
          sub={judged ? `${totals.nonProfitablePct}% · after all costs` : `No cost-per-km set (${mode})`}
          icon={<TrendingDown className="h-4 w-4" />} color="red"
          onClick={() => setProfitFilter((f) => (f === "non-profitable" ? "all" : "non-profitable"))}
          active={profitFilter === "non-profitable"} />
        <StatCard label="Total Hire Revenue" value={fmt(totals.hire)} exact={totals.hire} sub={`Expenses: ${fmt(totals.tripExpenses)}`}
          icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Trip Profit" value={fmt(totals.tripProfit)} exact={totals.tripProfit} sub={totals.tripProfit >= 0 ? "Hire − Trip Expenses" : "Hire − Trip Expenses (Loss)"}
          icon={totals.tripProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.tripProfit >= 0 ? "emerald" : "red"} />
        <StatCard label="Gross Profit" value={totals.grossTrips ? fmt(totals.gross) : "—"} exact={totals.grossTrips ? totals.gross : null}
          sub={totals.grossTrips
            ? `After diesel · ${totals.grossTrips} of ${totals.counted} trips`
            : `No mileage cost set (${mode})`}
          icon={totals.gross >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={!totals.grossTrips ? "slate" : (totals.gross >= 0 ? "emerald" : "red")} />
        <StatCard label="Final Profit" value={totals.final != null ? fmt(totals.final) : "—"} exact={totals.final}
          sub={totals.final != null ? `After truck expenses · ${totals.finalTrips} of ${totals.counted} trips` : `No cost-per-km set (${mode})`}
          icon={(totals.final ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.final == null ? "slate" : (totals.final >= 0 ? "emerald" : "red")} />
      </div>

      {/* Trips that can't be judged: say so, and let them be listed. */}
      {unjudged.length > 0 && profitFilter !== "unjudged" && (
        <p className="-mt-2 text-xs text-text-secondary">
          {unjudged.length} trip{unjudged.length === 1 ? "" : "s"} can&apos;t be judged ({reasons}).{" "}
          <button type="button" onClick={() => setProfitFilter("unjudged")}
            className="font-semibold text-accent-text underline-offset-2 hover:underline">Show them</button>
        </p>
      )}

      {warnings}

      {profitFilter !== "all" && (
        <div className="flex items-center gap-2 text-xs">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold",
            profitFilter === "profitable" ? "bg-success-surface-strong text-success-text"
              : profitFilter === "unjudged" ? "bg-fill-2 text-text-secondary" : "bg-danger-surface-strong text-danger-text"
          )}>
            {profitFilter === "profitable" ? <TrendingUp className="h-3 w-3" /> : profitFilter === "unjudged" ? <AlertCircle className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            Showing: {profitFilter === "profitable" ? "Profitable trips" : profitFilter === "unjudged" ? "Trips that can't be judged" : "Non-Profitable trips"} only
          </span>
          <button
            type="button"
            onClick={() => setProfitFilter("all")}
            className="font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {sorted.length > 0 && (
        <p className="-mb-2 flex items-center gap-1.5 px-1 text-xs text-text-secondary">
          <MousePointerClick className="h-3.5 w-3.5 text-accent-text" />
          Click any trip to see how its numbers are worked out. Hover <Info className="inline h-3 w-3 text-text-tertiary" /> on a column for what it means.
        </p>
      )}
      <div className="rounded-xl border border-separator-border bg-background-primary-default">
        {sorted.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-text-tertiary">
              {profitFilter === "all" ? "No trips found for this period." : "No trips match this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table data-tour="pl-trip-table" className="w-full min-w-[1260px] text-sm">
              <thead className="sticky top-0 z-10 bg-fill-1 border-b border-separator-border">
                <tr>
                  <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary whitespace-nowrap">Trip ID</th>
                  <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary cursor-pointer hover:text-accent-text select-none"
                    onClick={() => toggleSort("date")}>
                    Date{sortKey === "date" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary whitespace-nowrap">Sheet / Booking</th>
                  <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Truck</th>
                  <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Customer</th>
                  <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Route</th>
                  <SortTh label="Hire"           col="hire"    current={sortKey} dir={sortDir} onSort={toggleSort}
                    hint="Hire on the trip sheet, less any commission on the customer's route." />
                  <SortTh label="Trip Expenses"  col="expense" current={sortKey} dir={sortDir} onSort={toggleSort}
                    hint="Everything entered on the trip sheet: driver batta, toll, port pass, parking, mamol and other expenses." />
                  <SortTh label="Trip Profit"    col="pl"      current={sortKey} dir={sortDir} onSort={toggleSort} hint="Hire − Trip Expenses" />
                  <HintTh label="Diesel Expenses" hint="Trip km × diesel per km: the average price paid per litre in the trip's month ÷ the truck's mileage (km per litre) then." />
                  <SortTh label="Gross Profit"   col="gross"   current={sortKey} dir={sortDir} onSort={toggleSort} hint="Trip Profit − Diesel Expenses" />
                  <HintTh label="Truck Expenses" hint="Trip km × steady costs per km: EMI, documents and maintenance (the truck's monthly cost ÷ its monthly km), plus AdBlue and tyres. Hover a figure to see the split." />
                  <SortTh label="Final Profit"   col="final"   current={sortKey} dir={sortDir} onSort={toggleSort} hint="Gross Profit − Truck Expenses: the trip after all costs. A trip with no km or no diesel rate can't be judged." />
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={sorted}>
                {(t, i) => (
                  <tr
                    key={i}
                    onClick={() => t.tripId != null && setBreakdownTripId(t.tripId)}
                    title={t.tripId != null ? "Click to see how this trip's numbers are worked out" : undefined}
                    className={cn("transition-colors", t.tripId != null ? "cursor-pointer hover:bg-accent-surface-strong/50" : "hover:bg-fill-2", t.excludedFromTotals && "bg-warning-surface/60 hover:bg-warning-surface-strong")}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-caption-1-semibold text-accent-text">{t.tripCode || "—"}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">{fmtDate(t.tripDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-caption-1-medium text-text-primary">
                        {t.tripSheetNo || "—"}
                        {t.flaggedForRecheck && (
                          <span
                            title={t.flaggedRemark ? `Flagged for recheck: ${t.flaggedRemark}` : "Flagged for recheck"}
                            className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-1.5 py-0.5 text-[9px] font-semibold text-warning-text"
                          >
                            <AlertCircle className="h-2.5 w-2.5" /> Under Review
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-text-tertiary">{t.bookingReferenceNo || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-caption-1-semibold text-text-primary">{t.truckId}<DisposalChip disposal={t.disposal} /></p>
                      <p className="text-[11px] text-text-tertiary">{t.registrationNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-text-primary">{t.customerName || "—"}</p>
                      {t.cargoClassification && (
                        <span className="inline-block mt-0.5 rounded-full bg-fill-2 px-2 py-0 text-caption-2-medium text-text-secondary">
                          {shortLabel(t.cargoClassification)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.fromLocation && t.toLocation ? (
                        <span className="flex items-center gap-1 text-xs text-text-secondary">
                          <span>{t.fromLocation}</span>
                          <ArrowRight className="h-3 w-3 text-text-tertiary shrink-0" />
                          <span>{t.toLocation}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
                      {t.totalKm > 0 && (
                        <p className="text-[11px] text-text-tertiary">{t.totalKm.toLocaleString("en-IN")} km</p>
                      )}
                    </td>
                    <td className={cn("px-4 py-3 text-right text-body-semibold", t.excludedFromTotals ? "text-text-tertiary" : "text-accent-text")}><Amount v={t.hireAmount} /></td>
                    <td className={cn("px-4 py-3 text-right text-xs", t.excludedFromTotals ? "text-text-tertiary" : "text-text-secondary")}><Amount v={t.totalExpense} /></td>
                    <td className="px-4 py-3 text-right">
                      {t.excludedFromTotals ? <span className="text-[11px] text-text-tertiary">Excluded *</span> : <PlBadge value={t.money.tripProfit} />}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-text-secondary">
                      {t.excludedFromTotals ? <span className="text-text-tertiary">—</span> : (() => {
                        const { diesel, dieselRate } = t.money;
                        return diesel != null && dieselRate != null
                          ? <span title={`${t.totalKm.toLocaleString("en-IN")} km × ₹${dieselRate.toFixed(2)}/km = ${fmtFull(diesel)}`}>{fmt(diesel)}</span>
                          : <span className="text-text-tertiary">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.excludedFromTotals ? <span className="text-[11px] text-text-tertiary">Excluded *</span> : (
                        t.money.gross != null ? <PlBadge value={t.money.gross} /> : <span className="text-text-tertiary text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-text-secondary">
                      {t.excludedFromTotals ? <span className="text-text-tertiary">—</span> : (() => {
                        const te = t.money.truckExpenses;
                        if (te == null) return <span className="text-text-tertiary">—</span>;
                        const sp = t.money.split;
                        return t.money.truckExpensesIncludeDiesel ? (
                          <span title="Includes diesel — no diesel figure to split it out in this mode" className="cursor-help">
                            <WarnIcon aria-label="Incomplete" className="mr-1 inline size-3.5 -translate-y-px text-warning-text" />{fmt(te)}
                          </span>
                        ) : (
                          <span className="cursor-help" title={sp ? `${splitTitle([["EMI", sp.emi], ["Maintenance", sp.maintenance], ["Tyres", sp.tyre], ["AdBlue", sp.adblue], ["Documents", sp.compliance]])} = ${fmtFull(te)}` : fmtFull(te)}>
                            {fmt(te)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.excludedFromTotals ? <span className="text-[11px] text-text-tertiary">Excluded *</span> : (
                        t.money.finalProfit != null
                          ? <PlBadge value={t.money.finalProfit} />
                          : <span className="whitespace-nowrap rounded-full bg-fill-2 px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                              title="This trip can't be judged — see the yellow box above for how to fix it.">{unjudgedReason(t)}</span>
                      )}
                    </td>
                  </tr>
                )}
              </PagedTbody>
              <tfoot>
                <tr className="border-t-2 border-separator-border bg-fill-1">
                  <td colSpan={6} className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                    Total ({totals.counted} of {totals.trips} trips)
                  </td>
                  <td className="px-4 py-3 text-right text-body-semibold text-accent-text"><Amount v={totals.hire} /></td>
                  <td className="px-4 py-3 text-right text-caption-1-semibold text-text-primary"><Amount v={totals.tripExpenses} /></td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totals.tripProfit} /></td>
                  <td className="px-4 py-3 text-right text-caption-1-semibold text-text-primary">
                    {totals.grossTrips ? <Amount v={totals.diesel} /> : <span className="text-text-tertiary">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {totals.grossTrips ? <PlBadge value={totals.gross} /> : <span className="text-text-tertiary text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-caption-1-semibold text-text-primary">
                    {totals.truckExpenses > 0 ? <Amount v={totals.truckExpenses} /> : <span className="text-text-tertiary">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {totals.final != null ? <PlBadge value={totals.final} /> : <span className="text-text-tertiary text-xs">—</span>}
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
        <p className="text-[11px] text-warning-text">
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
  const bar = kind === "out" ? "bg-danger-border" : kind === "in" ? "bg-accent-solid" : (value ?? 0) >= 0 ? "bg-success-solid" : "bg-danger-solid";
  const color = value == null ? "text-text-tertiary" : kind === "out" ? "text-danger-text" : kind === "in" ? "text-accent-text" : value >= 0 ? "text-success-text" : "text-danger-text";
  return (
    <div className={cn("rounded-lg px-3 py-2", isResult ? "bg-background-primary-default ring-1 ring-separator-border" : "")}>
      <div className="flex items-center gap-3">
        <span className={cn("w-44 shrink-0 text-xs", isResult ? "font-semibold text-text-primary" : "font-medium text-text-primary")}>{label}</span>
        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-fill-2">
          {value != null && <span className={cn("absolute inset-y-0 left-0 rounded-full", bar)} style={{ width: `${width}%` }} />}
        </span>
        <span className={cn("w-32 shrink-0 text-right text-xs tabular-nums", isResult ? "font-semibold" : "font-semibold", color)}>
          {value == null ? "—" : kind === "out" ? `− ${fmt(value)}` : `${value < 0 ? "−" : ""}${fmt(value)}`}
        </span>
      </div>
      {detail && <div className="mt-1 pl-[11.75rem] text-[11px] text-text-secondary">{detail}</div>}
    </div>
  );
}

/** Why this truck's Net Profit differs from the sum of its trips on the Trips
 *  tab. The Trucks tab counts the period's actual maintenance bills, the full
 *  EMI for the period (paid even on idle days) and the documents' share; each
 *  trip carries km × those costs' per-km rates. Worked out on the server and
 *  adds up exactly: Trips' Final Profit + each line = Net Profit. */
function TripsReconcile({ money, entry, mode }: { money: TruckMoney; entry: TruckPLEntry; mode: string }) {
  const rc = money.reconcile;
  if (!rc) return null;
  const lines: { label: string; value: number; detail: string }[] = [];
  if (rc.tripsCounted > 0 && rc.tripsJudged === 0) {
    return (
      <div>
        <p className="mb-2 text-caption-1-semibold text-text-tertiary">Trips tab vs this total</p>
        <p className="rounded-xl border border-separator-border bg-background-primary-default px-4 py-3 text-xs text-text-secondary">
          This truck&apos;s trips can&apos;t be judged in {mode} mode (no km on their sheets, or no diesel cost per km for the truck), so they can&apos;t be compared.
        </p>
      </div>
    );
  }
  if (Math.abs(rc.emi) >= 0.01) lines.push({
    label: rc.emi < 0 ? "EMI not covered by trips" : "EMI: trips carried more",
    value: rc.emi,
    detail: rc.tripsJudged === 0
      ? `No trips in this period — the EMI (${fmt(rc.emiActual)}) is still paid.`
      : `The real instalments for this period: ${fmt(rc.emiActual)} (paid even on days the truck doesn't run). Its trips carry ${fmt(rc.emiOnTrips)} at a steady EMI per km.`,
  });
  if (Math.abs(rc.maintenance) >= 0.01) lines.push({
    label: "Maintenance: real bills vs normal",
    value: rc.maintenance,
    detail: `Real maintenance bills in this period: ${fmt(rc.maintenanceActual)}. The trips carry ${fmt(rc.maintenanceOnTrips)} at the truck's normal maintenance per km.`,
  });
  if (Math.abs(rc.documents) >= 0.01) lines.push({
    label: "Documents: period share vs steady rate",
    value: rc.documents,
    detail: `This period's share of RC, insurance, permits…: ${fmt(rc.documentsActual)}. The trips were charged ${fmt(rc.documentsOnTrips)} (km × the documents rate).`,
  });
  if (Math.abs(rc.other) >= 0.01) lines.push({
    label: "Other differences",
    value: rc.other,
    detail: [
      rc.tripsFlagged ? `${rc.tripsFlagged} trip${rc.tripsFlagged !== 1 ? "s" : ""} under audit review (left out of the Trips tab's totals)` : "",
      rc.tripsCounted > rc.tripsJudged ? `${rc.tripsCounted - rc.tripsJudged} trip${rc.tripsCounted - rc.tripsJudged !== 1 ? "s" : ""} that can't be judged (no km on the sheet, or no diesel rate) — their hire and expenses count here only` : "",
      !rc.itemised && rc.tripsJudged > 0 ? `the trips' costs aren't itemised in ${mode} mode` : "",
    ].filter(Boolean).join("; ") || "Diesel, AdBlue or tyre rates differ between the two tabs.",
  });
  const same = lines.length === 0;
  return (
    <div>
      <p className="mb-2 text-caption-1-semibold text-text-tertiary">Trips tab vs this total</p>
      <div className="flex flex-col gap-1 rounded-xl border border-separator-border bg-background-primary-default p-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-text-primary">
            Trips&apos; Final Profit ({rc.tripsJudged} trip{rc.tripsJudged !== 1 ? "s" : ""}, as on the Trips tab)
          </span>
          <span className={cn("font-semibold tabular-nums", rc.tripsFinal >= 0 ? "text-success-text" : "text-danger-text")}>
            {rc.tripsFinal < 0 ? "−" : ""}{fmt(Math.abs(rc.tripsFinal))}
          </span>
        </div>
        {lines.map((l) => (
          <div key={l.label}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-text-primary">{l.value < 0 ? "−" : "+"} {l.label}</span>
              <span className={cn("font-semibold tabular-nums", l.value < 0 ? "text-danger-text" : "text-success-text")}>
                {l.value < 0 ? "−" : "+"}{fmt(Math.abs(l.value))}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-text-secondary">{l.detail}</p>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-separator-border pt-2">
          <span className="font-semibold text-text-primary">= Net Profit (this tab)</span>
          <span className={cn("font-semibold tabular-nums", money.net >= 0 ? "text-success-text" : "text-danger-text")}>
            {money.net < 0 ? "−" : ""}{fmt(Math.abs(money.net))}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-text-tertiary">
          {same
            ? "Both tabs agree for this truck."
            : `Both figures are right: this tab counts ${entry.registrationNumber || entry.truckId}'s real costs for the whole period; the Trips tab judges each trip at steady costs per km.`}
        </p>
      </div>
    </div>
  );
}

/**
 * Why Trip Profitability and Truck Profitability end on different totals —
 * both are right: trips are judged at steady costs per km; trucks pay the real
 * bills. Trucks' net = trips' profit + each line below, exactly (the server's
 * reconciliation, pl_compute.reconcile).
 */
function WhyTabsDiffer({ why, truckNet }: { why: NonNullable<PlComputed["truckTotals"]["whyDiffer"]>; truckNet: number }) {
  const [open, setOpen] = useState(false);
  const gap = truckNet - why.tripsFinal;
  if (Math.abs(gap) < 1) return null;
  const signed = (v: number) => `${v < 0 ? "−" : "+"}${fmt(Math.abs(v))}`;
  const lines = [
    { label: "EMI not covered by trips", value: why.emi,
      detail: `EMI for days trucks stood idle or ran less than normal${why.idleTrucks ? ` (${why.idleTrucks} truck${why.idleTrucks === 1 ? "" : "s"} had no trips)` : ""}.` },
    { label: "Repairs above (or below) normal", value: why.maintenance,
      detail: "This period's real repair bills compared with the trucks' normal monthly maintenance." },
    { label: "Documents", value: why.documents, detail: "Document costs falling in this period vs the steady share on trips." },
    { label: why.noKmTrips ? `Trips with no km (${why.noKmTrips})` : "Other", value: why.other,
      detail: why.noKmTrips
        ? "Their trip sheets have no km, so Trip Profitability can't judge them; Truck Profitability still counts their hire. Add their km to fix."
        : "Small items counted on one tab only." },
  ].filter((l) => Math.abs(l.value) >= 1);
  return (
    <div data-tour="pl-why-differ" className="rounded-xl border border-separator-border bg-background-primary-default shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm">
        <Info className="h-4 w-4 shrink-0 text-accent-text" />
        <span className="font-semibold text-text-primary">Why the two tabs differ</span>
        <span className="text-text-secondary">
          Trips {signed(why.tripsFinal)} · Trucks {signed(truckNet)} · difference {signed(gap)}
        </span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-text-tertiary transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-separator-border px-4 py-3 text-sm">
          <p className="text-xs text-text-secondary">
            Trip Profitability judges each trip at <b>steady costs per km</b> (was the trip a good deal?). Truck Profitability
            uses the <b>real bills</b> (what each truck really made). Both are right; the difference is made of:
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-text-primary">Trip Profitability: profit after all costs</span>
            <span className="font-semibold tabular-nums">{signed(why.tripsFinal)}</span>
          </div>
          {lines.map((l) => (
            <div key={l.label}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-primary">{l.label}</span>
                <span className={cn("font-semibold tabular-nums", l.value < 0 ? "text-danger-text" : "text-success-text")}>{signed(l.value)}</span>
              </div>
              <p className="text-[11px] text-text-tertiary">{l.detail}</p>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-separator-border pt-2">
            <span className="font-semibold text-text-primary">= Truck Profitability: net profit</span>
            <span className={cn("font-semibold tabular-nums", truckNet >= 0 ? "text-success-text" : "text-danger-text")}>{signed(truckNet)}</span>
          </div>
        </div>
      )}
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
    if (money.running) costs.push(`${fmt(money.running)} of AdBlue, tyres and maintenance`);
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
    return "AdBlue, tyres and maintenance took more than what was left after diesel.";
  })();

  return (
    <div className="space-y-5 px-6 py-5 bg-fill-1">
      {/* Plain-language summary */}
      <div className="space-y-1.5">
        <p className="rounded-xl bg-accent-surface px-4 py-3 text-sm leading-relaxed text-accent-text-strong">{summary}</p>
        {lossReason && (
          <p className="flex items-start gap-1.5 px-1 text-xs text-danger-text"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Why a loss: {lossReason}</p>
        )}
        {money.incomplete.length > 0 && (
          <p className="flex items-start gap-1.5 px-1 text-xs text-warning-text">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Net Profit is missing something: {money.incomplete.join("; ")}. Set it in the Running Cost Calculator.
          </p>
        )}
        {entry.documentShare === 0 && (
          <p className="flex items-start gap-1.5 px-1 text-xs text-warning-text">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No document costs (RC, FC, insurance, permits…) are recorded for this truck.
          </p>
        )}
      </div>

      {/* Waterfall */}
      <div>
        <p className="mb-2 text-caption-1-semibold text-text-tertiary">How Net Profit is worked out · {mode} mode</p>
        <div className="flex flex-col gap-1 rounded-xl border border-separator-border bg-fill-1 p-2">
          <WaterfallRow scale={scale} label={`Hire (${entry.tripCount} trip${entry.tripCount !== 1 ? "s" : ""})`} value={entry.totalHireAmount} kind="in"
            detail="From the trip sheets in this period, less any route commission." />
          <WaterfallRow scale={scale} label="Trip Expenses" value={entry.tripExpenses} kind="out" detail="Everything entered on those trip sheets." />
          <WaterfallRow scale={scale} label="= Trip Profit" value={money.tripProfit} kind="result" />
          <WaterfallRow scale={scale} label="Diesel" value={money.diesel} kind="out"
            detail={km <= 0 ? "No km driven." : money.dieselRate != null
              ? (mode === "Manual"
                ? `${km.toLocaleString("en-IN")} km × ₹${money.dieselRate.toFixed(2)} per km (Running Cost Calculator → Manual → Mileage)`
                : `${km.toLocaleString("en-IN")} km × ₹${money.dieselRate.toFixed(2)} per km on average — each trip at its month's diesel price paid ÷ the truck's mileage then (Fuel History)`)
              : "No diesel cost per km — the truck needs at least 2 fuel fills in Fuel History."} />
          <WaterfallRow scale={scale} label="= Gross Profit" value={money.gross} kind="result" />
          <WaterfallRow scale={scale} label="AdBlue" value={money.adblue} kind="out"
            detail={km <= 0 ? "No km driven." : money.adblueRate != null
              ? `${km.toLocaleString("en-IN")} km × ₹${money.adblueRate.toFixed(2)} per km (Truck's AdBlue History × the manufacturer's AdBlue price)`
              : "No AdBlue rate yet — the truck needs at least 2 fills in Truck's AdBlue History (counted as ₹0)."} />
          <WaterfallRow scale={scale} label="Tyres" value={money.tyres} kind="out"
            detail={km <= 0 ? "No km driven." : money.tyreRate != null
              ? `${km.toLocaleString("en-IN")} km × ₹${money.tyreRate.toFixed(2)} per km (${mode === "Advanced"
                ? "the tyres fitted on this truck in each trip's month: cost ÷ expected range"
                : mode === "Basic" ? "the tyre cost per km of its tyre layout" : "Running Cost Calculator → Manual → Tyre Charges"})`
              : `No tyre cost per km for this truck in ${mode} mode.`} />
          <WaterfallRow scale={scale} label="Maintenance" value={entry.maintenanceExpenses} kind="out"
            detail={`The real bills: ${entry.maintenanceCount} maintenance record${entry.maintenanceCount !== 1 ? "s" : ""} dated in this period (Truck Maintenance).`} />
          <WaterfallRow scale={scale} label="EMI" value={entry.emiShare} kind="out"
            detail={emiDetails.length ? (
              <>
                {emiDetails.map((e) => `${e.emiName} ${fmtFull(e.monthlyEmi)}`).join(" + ")} a month (each a row on Finance → EMI Tracking).
                {emiGapText(emiDetails) && (
                  <span className="mt-0.5 block font-medium text-warning-text">{emiGapText(emiDetails)}</span>
                )}
              </>
            ) : "No active loan."} />
          <WaterfallRow scale={scale} label="Documents" value={entry.documentShare} kind="out"
            detail={docs.length ? `This period's share of each document's cost: ${docs.map(([k, v]) => `${DOC_LABELS[k] ?? k} ${fmt(v)}`).join(" · ")}` : "No document costs entered (Compliance & Renewals)."} />
          <WaterfallRow scale={scale} label="= Net Profit" value={money.net} kind="result" />
        </div>
      </div>

      <TripsReconcile money={money} entry={entry} mode={mode} />

      {/* EMI details */}
      {emiDetails.length > 0 && (
        <div>
          <p className="mb-2 text-caption-1-semibold text-text-tertiary">
            EMI Loans — Period Share: {fmt(entry.emiShare)}
          </p>
          <div className="flex flex-wrap gap-2">
            {emiDetails.map((e, i) => (
              <div key={i} className="rounded-lg border border-purple-border bg-purple-surface px-4 py-3 min-w-[220px]">
                <p className="text-caption-1-semibold text-purple-text">{e.emiName}</p>
                {e.bankName && <p className="text-[10px] text-purple-text">{e.bankName}</p>}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <p className="text-[10px] text-purple-text">Monthly EMI</p>
                    <p className="text-body-semibold text-purple-text">{fmt(e.monthlyEmi)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-text">Counted for this period</p>
                    <p className="text-body-semibold text-purple-text-strong" title={fmtFull(e.shareForPeriod)}>
                      {fmt(e.shareForPeriod)}
                      {e.fullForPeriod - e.shareForPeriod >= 1 && (
                        <span className="ml-1 text-[11px] font-normal text-purple-text">of {fmt(e.fullForPeriod)}</span>
                      )}
                    </p>
                  </div>
                </div>
                {e.uncounted.length > 0 && e.fullForPeriod - e.shareForPeriod >= 1 && (
                  <ul className="mt-2 space-y-0.5 border-t border-purple-border pt-2 text-[11px] text-purple-text">
                    {e.uncounted.map((g, j) => (
                      <li key={j}>{fmtFull(g.amount)} for {dayRange(g.from, g.to)}: {GAP_WHY[g.reason]}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trip rows */}
      {tripRows.length > 0 && (
        <div>
          <p className="mb-2 text-caption-1-semibold text-text-tertiary">
            Trips in Period ({tripRows.length})
          </p>
          <div className="overflow-auto max-h-[50vh] rounded-lg border border-separator-border">
            <table className="w-full min-w-[680px] text-xs">
              <thead className="sticky top-0 bg-fill-1 border-b border-separator-border">
                <tr>
                  {["Trip ID", "Date", "Sheet No", "Route", "Hire", "Expenses", "Trip Profit"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-text-tertiary">{h}</th>
                  ))}
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={tripRows}>
                {(t, i) => {
                  const tPl = t.tripProfit ?? 0;
                  return (
                    <tr key={i} className={cn("hover:bg-fill-2", t.excludedFromTotals && "bg-warning-surface/60 hover:bg-warning-surface-strong")}>
                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-accent-text">{t.tripCode || "—"}</td>
                      <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{fmtDate(t.tripDate)}</td>
                      <td className="px-3 py-2 font-medium text-text-primary">
                        {t.tripSheetNo || "—"}
                        {t.flaggedForRecheck && (
                          <span
                            title={t.flaggedRemark ? `Flagged for recheck: ${t.flaggedRemark}` : "Flagged for recheck"}
                            className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-1.5 py-0.5 text-[9px] font-semibold text-warning-text"
                          >
                            <AlertCircle className="h-2.5 w-2.5" /> Under Review
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {t.fromLocation && t.toLocation ? `${t.fromLocation} → ${t.toLocation}` : "—"}
                        {t.totalKm > 0 && <span className="ml-1.5 text-text-tertiary">({t.totalKm.toLocaleString("en-IN")} km)</span>}
                      </td>
                      <td className={cn("px-3 py-2 font-semibold", t.excludedFromTotals ? "text-text-tertiary" : "text-accent-text")}>{fmt(t.hireAmount)}</td>
                      <td className={cn("px-3 py-2", t.excludedFromTotals ? "text-text-tertiary" : "text-text-secondary")}>{fmt(t.totalExpense)}</td>
                      <td className="px-3 py-2">
                        {t.excludedFromTotals ? <span className="text-[11px] text-text-tertiary">Excluded *</span> : <PlBadge value={tPl} />}
                      </td>
                    </tr>
                  );
                }}
              </PagedTbody>
            </table>
          </div>
          {entry.flaggedTripCount > 0 && (
            <p className="mt-1.5 text-[11px] text-warning-text">
              * {entry.flaggedTripCount} trip{entry.flaggedTripCount !== 1 ? "s" : ""} flagged for recheck by Audit — excluded from the totals above until resolved.
            </p>
          )}
        </div>
      )}

      {/* Maintenance rows */}
      {maintRows.length > 0 && (
        <div>
          <p className="mb-2 text-caption-1-semibold text-text-tertiary">
            Maintenance in Period ({maintRows.length} records · {fmt(entry.maintenanceExpenses)} total)
          </p>
          <div className="overflow-auto max-h-[40vh] rounded-lg border border-separator-border">
            <table className="w-full min-w-[420px] text-xs">
              <thead className="sticky top-0 bg-fill-1 border-b border-separator-border">
                <tr>
                  {["Date", "Type", "Description", "Cost"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-text-tertiary">{h}</th>
                  ))}
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={maintRows}>
                {(m, i) => (
                  <tr key={i} className="hover:bg-fill-2">
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{fmtDate(m.date)}</td>
                    <td className="px-3 py-2 font-medium text-text-primary">{m.maintenanceType || "—"}</td>
                    <td className="px-3 py-2 text-text-secondary">{m.description || "—"}</td>
                    <td className="px-3 py-2 font-semibold text-orange-text">{fmt(m.cost)}</td>
                  </tr>
                )}
              </PagedTbody>
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
  warnings,
}: {
  data: PlComputedTruck[];
  totals: PlComputed["truckTotals"];
  mode: Mode;
  warnings: ReactNode;
}) {
  const [expandedTruck, setExpandedTruck] = useState<string | null>(null);
  // Clicking "Profitable Trucks" / "Non-Profitable Trucks" drills the table
  // into exactly the trucks each card counts (Net Profit >=/< 0).
  const [profitFilter, setProfitFilter] = useState<"all" | "profitable" | "non-profitable">("all");

  // Column sorting — none until a heading is clicked (then the server's order).
  const [sortKey, setSortKey] = useState<TruckSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  function toggleSort(col: TruckSortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("desc"); }
  }

  const rows = useMemo(() => data.map((e) => ({ entry: e, money: e.money })), [data]);
  const picked = profitFilter === "all" ? rows
    : profitFilter === "profitable" ? rows.filter((r) => r.money.net >= 0)
    : rows.filter((r) => r.money.net < 0);
  const value = (r: (typeof rows)[number]): number | null => {
    switch (sortKey) {
      case "trips": return r.entry.tripCount;
      case "km": return r.entry.totalKm;
      case "hire": return r.entry.totalHireAmount;
      case "expense": return r.entry.tripExpenses;
      case "tripProfit": return r.money.tripProfit;
      case "diesel": return r.money.diesel;
      case "gross": return r.money.gross;
      case "running": return r.money.running;
      case "fixed": return r.money.fixed;
      case "net": return r.money.net;
      default: return null;
    }
  };
  const filtered = sortKey == null ? picked : [...picked].sort((a, b) => {
    const x = value(a), y = value(b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    return sortDir === "asc" ? x - y : y - x;
  });
  // Totals and counts come from the server, like every figure here.
  const idle = totals.idle;
  const profitable = totals.profitable;
  const nonProfitable = totals.nonProfitable;

  return (
    <div className="flex flex-col gap-5">

      {/* Summary cards */}
      <div data-tour="pl-truck-cards" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
        <StatCard label="Total Hire Revenue" value={fmt(totals.hire)} exact={totals.hire} sub={`${totals.trips} trips`}
          icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Gross Profit" value={fmt(totals.gross)} exact={totals.gross} sub="After trip expenses & diesel"
          icon={totals.gross >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.gross >= 0 ? "emerald" : "red"} />
        <StatCard label="Net Profit" value={fmt(totals.net)} exact={totals.net} sub="After every cost"
          icon={totals.net >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.net >= 0 ? "emerald" : "red"} />
      </div>

      {/* Period / data warnings */}
      {warnings}

      {profitFilter !== "all" && (
        <div className="flex items-center gap-2 text-xs">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold",
            profitFilter === "profitable" ? "bg-success-surface-strong text-success-text" : "bg-danger-surface-strong text-danger-text"
          )}>
            {profitFilter === "profitable" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            Showing: {profitFilter === "profitable" ? "Profitable" : "Non-Profitable"} trucks only
          </span>
          <button
            type="button"
            onClick={() => setProfitFilter("all")}
            className="font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <p className="-mb-2 flex items-center gap-1.5 px-1 text-xs text-text-secondary">
          <MousePointerClick className="h-3.5 w-3.5 text-accent-text" />
          Click any truck to see how its Net Profit is worked out. Hover <Info className="inline h-3 w-3 text-text-tertiary" /> on a column for what it means.
        </p>
      )}
      <div className="rounded-xl border border-separator-border bg-background-primary-default">
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-text-tertiary">
              {profitFilter === "all" ? "No trucks found for this period." : "No trucks match this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table data-tour="pl-truck-table" className="w-full min-w-[1280px] text-sm">
              <thead className="sticky top-0 z-10 bg-fill-1 border-b border-separator-border">
                <tr>
                  <th className="px-2 py-3" />
                  <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Truck</th>
                  <SortTh label="Trips" col="trips" current={sortKey} dir={sortDir} onSort={toggleSort} align="center" />
                  <SortTh label="KM" col="km" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Hire" col="hire" current={sortKey} dir={sortDir} onSort={toggleSort} hint="Hire from this truck's trip sheets in the period, less route commission." />
                  <SortTh label="Trip Expenses" col="expense" current={sortKey} dir={sortDir} onSort={toggleSort} hint="Everything entered on those trip sheets (batta, toll, port pass, …)." />
                  <SortTh label="Trip Profit" col="tripProfit" current={sortKey} dir={sortDir} onSort={toggleSort} hint="Hire − Trip Expenses" />
                  <SortTh label="Diesel" col="diesel" current={sortKey} dir={sortDir} onSort={toggleSort} hint="The sum of its trips' diesel: each trip's km × that month's diesel price paid ÷ the truck's mileage then." />
                  <SortTh label="Gross Profit" col="gross" current={sortKey} dir={sortDir} onSort={toggleSort} hint="Trip Profit − Diesel" />
                  <SortTh label="Running Costs" col="running" current={sortKey} dir={sortDir} onSort={toggleSort} hint="AdBlue and tyres for the km driven + the real maintenance bills in the period. Hover a figure to see the split." />
                  <SortTh label="Fixed Costs" col="fixed" current={sortKey} dir={sortDir} onSort={toggleSort} hint="The real EMI instalments (one per month, every loan) + the period's share of each document's cost, up to today. Hover a figure to see the split." />
                  <SortTh label="Net Profit" col="net" current={sortKey} dir={sortDir} onSort={toggleSort} hint="Gross Profit − Running Costs − Fixed Costs: what the truck really made." />
                </tr>
              </thead>
              <PagedTbody items={filtered}>
                {({ entry, money }) => {
                  const isOpen = expandedTruck === entry.truckId;
                  return (
                  <Fragment key={entry.truckId}>
                  <tr
                    onClick={() => setExpandedTruck(isOpen ? null : entry.truckId)}
                    title="Click to see how this truck's Net Profit is worked out"
                    className="border-b border-separator-border hover:bg-accent-surface-strong/50 transition-colors cursor-pointer"
                  >
                      <td className="px-2 py-3 text-center">
                        <ChevronDown className={`h-4 w-4 text-text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-text-primary">{entry.truckId}<DisposalChip disposal={entry.disposal} /></p>
                        <p className="text-xs text-text-tertiary">{entry.registrationNumber}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-caption-1-semibold",
                          entry.tripCount ? "bg-accent-surface-strong text-accent-text" : "bg-fill-2 text-text-secondary")}>
                          {entry.tripCount || "Idle"}
                        </span>
                        {entry.flaggedTripCount > 0 && (
                          <span
                            title={`${entry.flaggedTripCount} trip(s) under review — excluded from this truck's totals`}
                            className="ml-1 inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-1.5 py-0.5 text-[9px] font-semibold text-warning-text"
                          >
                            <AlertCircle className="h-2.5 w-2.5" /> {entry.flaggedTripCount}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-text-secondary tabular-nums">
                        {entry.totalKm > 0 ? entry.totalKm.toLocaleString("en-IN") : <span className="text-text-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-accent-text"><Amount v={entry.totalHireAmount} /></td>
                      <td className="px-4 py-3 text-right text-xs text-text-secondary"><Amount v={entry.tripExpenses} /></td>
                      <td className="px-4 py-3 text-right"><PlBadge value={money.tripProfit} /></td>
                      <td className="px-4 py-3 text-right text-xs text-text-secondary">
                        {money.diesel != null ? <Amount v={money.diesel} /> : <span className="text-text-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {money.gross != null ? <PlBadge value={money.gross} /> : <span className="text-text-tertiary text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-text-secondary">
                        <span className="cursor-help" title={`${splitTitle([["Maintenance", entry.maintenanceExpenses], ["Tyres", money.tyres], ["AdBlue", money.adblue]])} = ${fmtFull(money.running)}`}>{fmt(money.running)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-text-secondary">
                        <span className="cursor-help" title={`${splitTitle([["EMI", entry.emiShare], ["Documents", entry.documentShare]])} = ${fmtFull(money.fixed)}${emiGapText(entry.emiDetails ?? []) ? `\nEMI: ${emiGapText(entry.emiDetails ?? [])}` : ""}`}>
                          {fmt(money.fixed)}
                          {(() => {
                            const full = (entry.emiDetails ?? []).reduce((s, l) => s + l.fullForPeriod, 0);
                            return full - entry.emiShare >= 1
                              ? <span className="ml-1 rounded-full bg-warning-surface px-1.5 py-px text-[10px] font-semibold text-warning-text" title="Less than the full EMI instalments is counted here — hover for why">part EMI</span>
                              : null;
                          })()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {money.incomplete.length > 0 && (
                          <span title={`Missing: ${money.incomplete.join("; ")}`} className="mr-1 inline-flex cursor-help text-warning-text"><WarnIcon className="size-3.5" /></span>
                        )}
                        <PlBadge value={money.net} />
                      </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-separator-border">
                      <td colSpan={12} className="p-0">
                        <TruckDetailPanel entry={entry} money={money} mode={mode} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                }}
              </PagedTbody>
              <tfoot>
                <tr className="border-t-2 border-separator-border bg-fill-1 font-semibold">
                  <td className="px-2 py-3"></td>
                  <td className="px-4 py-3 text-text-primary">
                    Fleet Total
                    <span className="ml-1.5 text-caption-1-regular text-text-tertiary">({totals.trucks} trucks)</span>
                  </td>
                  <td className="px-4 py-3 text-center text-accent-text">{totals.trips}</td>
                  <td className="px-4 py-3 text-right text-xs text-text-primary tabular-nums">{totals.km > 0 ? totals.km.toLocaleString("en-IN") : "—"}</td>
                  <td className="px-4 py-3 text-right text-accent-text"><Amount v={totals.hire} /></td>
                  <td className="px-4 py-3 text-right text-xs text-text-primary"><Amount v={totals.tripExpenses} /></td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totals.tripProfit} /></td>
                  <td className="px-4 py-3 text-right text-xs text-text-primary"><Amount v={totals.diesel} /></td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totals.gross} /></td>
                  <td className="px-4 py-3 text-right text-xs text-text-primary"><Amount v={totals.running} /></td>
                  <td className="px-4 py-3 text-right text-xs text-text-primary"><Amount v={totals.fixed} /></td>
                  <td className="px-4 py-3 text-right"><PlBadge value={totals.net} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-text-tertiary">
        Net Profit = Hire − Trip Expenses − Diesel − AdBlue − Tyres − Maintenance − EMI − Documents. Diesel, AdBlue and tyres are for the km
        driven (diesel at each month&rsquo;s price paid); maintenance, EMI and documents are the real costs of the period. Click a row to see the full breakdown.
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
  // Opens in Advanced (built from each truck's own records); each person's last choice is remembered.
  const [mode, setModeState]                 = useState<Mode>("Advanced");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "Manual" || saved === "Basic" || saved === "Advanced") setModeState(saved);
    } catch { /* private window — Advanced it is */ }
  }, []);
  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered, still switched */ }
  };
  const [exportPreview, setExportPreview] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[]; search: string } | null>(null);
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
   * this period, Cost/KM mode and search: Summary · Trips · Trip Expenses · Trucks ·
   * Rates, formatted, with live formulas. The preview comes from the server
   * too — it works the formulas out (the file stores them unevaluated). */
  async function openExportPreview() {
    if (!computed || preparingExport) return;
    setPreparingExport(true);
    try {
      const typed = search.trim();
      const qs = new URLSearchParams({ start_date: startDate, end_date: endDate, mode, ...(typed ? { search: typed } : {}) }).toString();
      const [file, preview] = await Promise.all([
        fetchExcel(`/pl-summary/export?${qs}`, `Profitability_${fmtDate(startDate)}_to_${fmtDate(endDate)}.xlsx`),
        plSummaryApi.getExportPreview(qs),
      ]);
      setExportPreview({ blob: file.blob, filename: file.filename, sheets: preview.sheets, search: typed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not prepare the export.";
      const problem = problemFromMessage(message);
      if (problem) reportProblem({ ...problem, onRetry: openExportPreview });
      else showError(message);
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Profitability</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Trip-wise and truck-wise P&L for the selected period.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button" onClick={() => setShowQuickStart(true)}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-5 text-body-medium text-text-primary shadow-sm transition duration-300 hover:border-accent-border-strong hover:text-accent-text hover:shadow-md"
          >
            <Compass className="h-4 w-4" />
            Quick Start Guide
          </button>
          <button
            type="button" onClick={() => setShowHowCalculated(true)}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-5 text-body-medium text-text-primary shadow-sm transition duration-300 hover:border-accent-border-strong hover:text-accent-text hover:shadow-md"
          >
            <Calculator className="h-4 w-4" />
            How is it Calculated
          </button>
          {computed && (
            <button
              type="button" onClick={openExportPreview} disabled={preparingExport}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
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
            <span className="flex items-center gap-2 text-sm text-text-secondary">
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
        <div className="flex items-center gap-2 rounded-xl border border-danger-border bg-danger-surface px-5 py-4 text-sm text-danger-text">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Maintenance in this period still waiting for its cost (Scheduled Records). */}
      <PendingCostNotice from={startDate} to={endDate} />

      {computed !== null && (
        <>
          {/* Report heading banner */}
          <div className="flex items-center gap-5 rounded-2xl border border-accent-border bg-accent-surface px-6 py-4 shadow-sm">
            <div className="h-12 w-1 rounded-full bg-accent-solid shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-caption-2-semibold text-accent-text mb-0.5">
                Profitability Report
              </p>
              <p className="text-title-3-semibold text-text-primary truncate">
                {tab === "trips" ? "Trip Profitability" : "Truck Profitability"}
              </p>
              {/* A period that isn't over: say how much of it has happened. */}
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                if (endDate <= today || startDate > today) return null;
                const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1;
                const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7);
                const label = sameMonth ? new Date(`${startDate}T00:00:00`).toLocaleDateString("en-IN", { month: "long" }) : "This period";
                return (
                  <p className="mt-0.5 text-xs font-semibold text-warning-text">
                    {label} so far: {days(startDate, today)} of {days(startDate, endDate)} days — on Truck Profitability, EMI and other costs count only up to today.
                  </p>
                );
              })()}
              {/* What this tab answers. */}
              <p className="mt-0.5 text-xs text-text-secondary">
                {tab === "trips"
                  ? "Was each trip a good deal? Each trip is judged at steady costs per km, whether the truck was busy or quiet that month."
                  : "What did each truck really make? The real bills: full EMI instalments (idle days too), actual repair bills and documents."}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-accent-border bg-accent-surface px-4 py-2.5 shadow-sm shrink-0">
              <CalendarDays className="h-4 w-4 text-accent-text shrink-0" />
              <span className="text-body-semibold text-accent-text-strong">{fmtDate(startDate)}</span>
              <span className="text-on-solid/80 font-light">→</span>
              <span className="text-body-semibold text-accent-text-strong">{fmtDate(endDate)}</span>
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
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface-strong px-3 py-1 font-semibold text-accent-text">
                Showing {tab === "trips" ? `${computed.trips.length} of ${computed.allTripCount} trips` : `${computed.trucks.length} of ${computed.allTruckCount} trucks`} matching &ldquo;{debouncedSearch}&rdquo;
              </span>
              <button type="button" onClick={() => setSearch("")}
                className="font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">
                Clear
              </button>
              <span className="text-text-tertiary">· cards and totals below are for these only</span>
            </div>
          )}

          {computed.truckTotals.whyDiffer && (
            <WhyTabsDiffer why={computed.truckTotals.whyDiffer} truckNet={computed.truckTotals.net} />
          )}

          {tab === "trips"  && (
            <TripProfitabilityTab trips={computed.trips} totals={computed.tripTotals} mode={mode}
              warnings={<PeriodWarnings startDate={startDate} endDate={endDate} firstTripDate={firstTripDate} health={computed.dataHealth} mode={mode} />} />
          )}
          {tab === "trucks" && (
            <TruckProfitabilityTab data={computed.trucks} totals={computed.truckTotals} mode={mode}
              warnings={<PeriodWarnings startDate={startDate} endDate={endDate} firstTripDate={firstTripDate} health={computed.dataHealth}
                mode={mode} incompleteTrucks={computed.truckTotals.incomplete} />} />
          )}
        </>
      )}

      {computed === null && !loading && (
        <div data-tour="pl-empty" className="rounded-xl border border-dashed border-border-button-default bg-fill-1 p-14 text-center">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 text-text-tertiary" />
          <p className="text-body-semibold text-text-secondary">Select a period to load profitability data</p>
          <p className="mt-2 text-xs text-text-tertiary max-w-sm mx-auto leading-relaxed">
            Trip Profit = Hire − Trip Expenses
            <br />
            Gross Profit = Trip Profit − Diesel (km × diesel per km)
            <br />
            Final Profit = Gross Profit − EMI, maintenance, tyres, AdBlue and documents per km
          </p>
        </div>
      )}

      {showHowCalculated && <HowCalculatedModal onClose={() => setShowHowCalculated(false)} />}
      {showQuickStart && <QuickStartModal onClose={() => setShowQuickStart(false)} />}

      {exportPreview && (
        <ExportPreviewDialog
          title={`Profitability Report — ${fmtDate(startDate)} to ${fmtDate(endDate)}${exportPreview.search ? ` — "${exportPreview.search}"` : ""}`}
          filename={exportPreview.filename}
          blob={exportPreview.blob}
          sheets={exportPreview.sheets}
          onClose={() => setExportPreview(null)}
          // The full report as a PDF (summary, trucks, trips) — not the sheet on screen.
          onPdf={computed ? () => downloadPlReportPdf({
            computed, startDate, endDate, mode, search: exportPreview.search, filename: exportPreview.filename,
          }) : undefined}
        />
      )}
    </div>
  );
}
