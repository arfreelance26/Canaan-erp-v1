"use client";

import React, { useEffect, useState } from "react";
import {
  Users, TrendingUp, IndianRupee, Trophy,
  ChevronDown, ChevronUp, Search, BarChart2,
} from "lucide-react";
import { tripsApi, type CustomerProfitabilityData } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteBreakdown = CustomerProfitabilityData["routes"][number];
type RecentTrip     = CustomerProfitabilityData["recent_trips"][number];
type Mode = "basic" | "intermediate" | "advanced";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtINR(n: number, compact = false): string {
  if (compact) {
    if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (Math.abs(n) >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)}L`;
    if (Math.abs(n) >= 1_000)       return `₹${(n / 1_000).toFixed(1)}K`;
    return `₹${n.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n);
}

function profitColor(n: number): string {
  return n >= 0 ? "text-emerald-700" : "text-red-600";
}

function marginBg(pct: number): string {
  if (pct >= 20) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (pct >= 10) return "bg-amber-50 text-amber-700 border-amber-200";
  if (pct >= 0)  return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-red-50 text-red-600 border-red-200";
}

// ---------------------------------------------------------------------------
// Mode info content + modal
// ---------------------------------------------------------------------------

const MODE_INFO: Record<Mode, {
  calc: { heading: string; body: string }[];
  guide: { step: string; body: string }[];
}> = {
  basic: {
    calc: [
      { heading: "Revenue", body: "Sum of all freight amounts billed to the customer across completed trips that have a trip sheet submitted." },
      { heading: "Expenses", body: "Sum of all trip-level costs (fuel, driver allowance, tolls, loading/unloading, and any other expenses logged in the trip sheet) attributed to trips for this customer." },
      { heading: "Net Profit", body: "Revenue minus Expenses. A negative value means you are spending more to service this customer than you are earning." },
      { heading: "Profit Margin %", body: "(Net Profit ÷ Revenue) × 100. The share of each rupee earned that becomes profit. The Avg Margin KPI is the simple average across all customers." },
    ],
    guide: [
      { step: "Check the KPI row", body: "Get the fleet-wide totals at a glance — total revenue, total profit, and average margin across all customers." },
      { step: "Scan the leaderboard", body: "Customers are sorted by Net Profit (highest first). The top rows are your most profitable relationships; scroll down to find trouble spots." },
      { step: "Expand a row", body: "Click any customer row to reveal a route-by-route breakdown — useful for spotting which specific lane is dragging down an otherwise good account." },
      { step: "Read the margin badge", body: "Green = ≥20%, Amber = 10–20%, Orange = 0–10%, Red = negative. Use it as a quick health signal without reading the numbers." },
    ],
  },
  intermediate: {
    calc: [
      { heading: "Quadrant placement", body: "Each customer is placed based on two metrics: their total revenue vs. the median revenue of all customers, and their profit margin % vs. the median margin. Medians are recalculated each time data is refreshed." },
      { heading: "Stars (high revenue, high margin)", body: "Above-median revenue AND above-median margin. Best accounts by both volume and efficiency." },
      { heading: "Gems (low revenue, high margin)", body: "Below-median revenue but above-median margin. Profitable per rupee earned — worth growing if capacity exists." },
      { heading: "Workhorses (high revenue, low margin)", body: "Above-median revenue but below-median margin. High-volume accounts with thin profitability — review trip costs or freight rates." },
      { heading: "Underperformers (low revenue, low margin)", body: "Below-median on both dimensions. Candidates for repricing or deprioritisation." },
    ],
    guide: [
      { step: "Identify your Stars", body: "Top-right quadrant. These relationships drive both volume and profit — they deserve the most attention for retention and service quality." },
      { step: "Grow your Gems", body: "Top-left quadrant. The economics are great; the only constraint is trip volume. These are ideal targets for pitching more lanes or frequency." },
      { step: "Fix or reprice Workhorses", body: "Bottom-right quadrant. Revenue is healthy but margins are thin. Open a card and check which routes are the worst — sometimes one bad lane drags the whole account." },
      { step: "Expand a card for details", body: "Click any customer card in a quadrant to see revenue, profit, trip count, distance, and route count inline." },
    ],
  },
  advanced: {
    calc: [
      { heading: "Route-level profit", body: "For each route a customer uses, revenue is the sum of freight for trips on that lane; expenses are the sum of all logged trip costs. Profit and margin are derived from these two figures." },
      { heading: "Best / Worst Route", body: "Best Route is the lane with the highest net profit. Worst Route is the lane with the lowest net profit (most negative, or least positive). Both are from the customer's own history." },
      { heading: "Recent Trips", body: "The last completed trips for the selected customer, ordered by date descending. Revenue and profit here are trip-level figures, not route aggregates." },
      { heading: "Total Distance", body: "Sum of KM across all completed trips for this customer — a proxy for fleet utilisation on this account." },
    ],
    guide: [
      { step: "Select a customer", body: "Use the sidebar — type in the search box to filter by name, then click any row to load their full scorecard on the right." },
      { step: "Check the scorecard KPIs", body: "The six KPI tiles give the overall picture: revenue, expenses, net profit, best route, worst route, and total distance." },
      { step: "Drill into route breakdown", body: "The Route Breakdown table shows every lane sorted by profitability. A negative-margin route is the conversation to have with ops." },
      { step: "Review recent trips", body: "Use the Recent Trips table to spot if a sudden margin drop is a one-off anomaly or a sustained trend." },
      { step: "Compare customers", body: "Customers in the sidebar show trip count and margin below the name. Use it to benchmark the selected customer at a glance." },
    ],
  },
};

function InfoModal({
  mode, panel, onClose,
}: { mode: Mode; panel: "calc" | "guide"; onClose: () => void }) {
  const info  = MODE_INFO[mode];
  const isCalc = panel === "calc";
  const title  = isCalc ? "How is this Calculated?" : "Quick Start Guide";
  const items  = isCalc ? info.calc : info.guide;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* Panel — slides in from right */}
      <div
        className="relative z-10 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">
              {MODES.find(m => m.id === mode)?.label} mode
            </p>
            <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {isCalc
            ? (items as { heading: string; body: string }[]).map(item => (
                <div key={item.heading} className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-gray-800">{item.heading}</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{item.body}</p>
                </div>
              ))
            : (items as { step: string; body: string }[]).map((item, i) => (
                <div key={i} className="flex gap-3">
                  <span
                    className="flex shrink-0 items-center justify-center rounded-full bg-blue-50 text-[9px] font-bold text-blue-600"
                    style={{ minWidth: "1.25rem", height: "1.25rem", marginTop: "1px" }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-semibold text-gray-800">{item.step}</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode Slider
// ---------------------------------------------------------------------------

const MODES: { id: Mode; label: string; sub: string }[] = [
  { id: "basic",        label: "Basic",        sub: "Leaderboard"      },
  { id: "intermediate", label: "Intermediate", sub: "Portfolio Matrix" },
  { id: "advanced",     label: "Advanced",     sub: "Scorecard"        },
];

function ModeSlider({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const idx = MODES.findIndex((m) => m.id === mode);

  return (
    <div className="relative inline-flex rounded-xl bg-gray-100 p-1 shrink-0">
      {/* Sliding pill */}
      <div
        className="pointer-events-none absolute top-1 bottom-1 rounded-lg bg-white"
        style={{
          width: `calc((100% - 8px) / 3)`,
          left: `calc(4px + ${idx} * (100% - 8px) / 3)`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)",
          transition: "left 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className="relative z-10 flex flex-col items-center px-6 py-2 rounded-lg"
          >
            <span
              className={`text-xs whitespace-nowrap transition-all ${active ? "font-semibold text-gray-900" : "font-normal text-gray-400"}`}
              style={{ lineHeight: 1.4 }}
            >
              {m.label}
            </span>
            <span
              className={`text-[9px] tracking-[0.04em] transition-colors ${active ? "text-gray-500" : "text-gray-300"}`}
            >
              {m.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Basic View — Profitability Leaderboard
// ---------------------------------------------------------------------------

function RankBadge({ rank }: { rank: number }) {
  const base = "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm";
  if (rank === 1) return <span className={`${base} bg-amber-400`}>1</span>;
  if (rank === 2) return <span className={`${base} bg-slate-400`}>2</span>;
  if (rank === 3) return <span className={`${base} bg-orange-400`}>3</span>;
  return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">{rank}</span>;
}

function BasicView({ data }: { data: CustomerProfitabilityData[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch]     = useState("");

  const filtered = search.trim()
    ? data.filter((c) => c.customer_name.toLowerCase().includes(search.trim().toLowerCase()))
    : data;

  const totalRevenue = data.reduce((s, d) => s + d.total_revenue, 0);
  const totalProfit  = data.reduce((s, d) => s + d.total_profit, 0);
  const avgMargin    = data.length > 0 ? data.reduce((s, d) => s + d.profit_margin_pct, 0) / data.length : 0;

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Customers",   value: String(data.length),          accent: "text-blue-500",   icon: <Users className="h-4 w-4" />       },
          { label: "Total Revenue",     value: fmtINR(totalRevenue, true),   accent: "text-indigo-400", icon: <IndianRupee className="h-4 w-4" /> },
          { label: "Total Profit",      value: fmtINR(totalProfit, true),    accent: totalProfit >= 0 ? "text-emerald-500" : "text-red-400", icon: <TrendingUp className="h-4 w-4" />, profitVal: true, n: totalProfit },
          { label: "Avg Profit Margin", value: `${avgMargin.toFixed(1)}%`,   accent: "text-amber-500",  icon: <BarChart2 className="h-4 w-4" />   },
        ].map(({ label, value, accent, icon, profitVal, n }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className={`${accent}`}>{icon}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
            </div>
            <p className={`text-xl font-semibold tabular-nums ${profitVal ? profitColor(n ?? 0) : "text-gray-900"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 flex items-center gap-3">
          <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
          <h2 className="text-sm font-bold text-gray-800 shrink-0">Customer Leaderboard</h2>
          <div className="relative ml-auto w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-800 shadow-sm outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>
          <span className="shrink-0 text-xs text-gray-400">
            {search.trim() ? `${filtered.length} of ${data.length}` : `${data.length} customers`}
          </span>
        </div>

        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-left min-w-[720px]">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {["#", "Customer", "Trips", "Revenue", "Expenses", "Net Profit", "Margin", ""].map((h, i) => (
                  <th key={i} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 ${i >= 2 && i <= 6 ? "text-right" : ""} ${i === 7 ? "w-8" : ""} ${i === 0 ? "w-12" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                    No customers match &quot;{search}&quot;.
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const isOpen = expanded.has(c.customer_id);
                return (
                  <React.Fragment key={c.customer_id}>
                    <tr
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => toggle(c.customer_id)}
                    >
                      <td className="px-4 py-3"><RankBadge rank={data.indexOf(c) + 1} /></td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">{c.customer_name}</p>
                        <p className="text-[10px] text-gray-400">{c.total_km.toFixed(0)} km · {c.routes.length} route{c.routes.length !== 1 ? "s" : ""}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700 tabular-nums">{c.trip_count}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700 tabular-nums">{fmtINR(c.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700 tabular-nums">{fmtINR(c.total_expense)}</td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${profitColor(c.total_profit)}`}>
                        {c.total_profit >= 0 ? "+" : ""}{fmtINR(c.total_profit)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums ${marginBg(c.profit_margin_pct)}`}>
                          {c.profit_margin_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400">
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-blue-50/30 px-6 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Route Breakdown</p>
                          <div className="flex flex-col gap-1.5">
                            {c.routes.map((r: RouteBreakdown) => (
                              <div key={r.route} className="flex items-center gap-3 rounded-lg bg-white border border-gray-100 px-3 py-2 shadow-sm">
                                <span className="flex-1 text-xs font-semibold text-gray-800 truncate min-w-0">{r.route}</span>
                                <span className="text-[10px] text-gray-400 shrink-0">{r.trip_count} trip{r.trip_count !== 1 ? "s" : ""}</span>
                                <span className="text-[11px] font-semibold text-gray-600 tabular-nums w-28 text-right shrink-0">{fmtINR(r.revenue)}</span>
                                <span className={`text-[11px] font-semibold tabular-nums w-28 text-right shrink-0 ${profitColor(r.profit)}`}>
                                  {r.profit >= 0 ? "+" : ""}{fmtINR(r.profit)}
                                </span>
                                <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-medium tabular-nums shrink-0 ${marginBg(r.margin_pct)}`}>
                                  {r.margin_pct.toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intermediate View — Portfolio Matrix (SVG scatter)
// ---------------------------------------------------------------------------

type Quadrant = "stars" | "gems" | "workhorses" | "underperformers";

const QUADRANT_META: Record<Quadrant, { label: string; color: string; fill: string; text: string; desc: string }> = {
  stars:           { label: "Stars",           color: "#16a34a", fill: "#f0fdf4", text: "#15803d", desc: "High revenue, high margin. Your most valuable customers — prioritise retention and deepening the relationship." },
  gems:            { label: "Gems",            color: "#2563eb", fill: "#eff6ff", text: "#1d4ed8", desc: "Low revenue but strong margin. Unit economics are excellent — these accounts are worth growing aggressively." },
  workhorses:      { label: "Workhorses",      color: "#d97706", fill: "#fffbeb", text: "#b45309", desc: "High revenue, thin margin. Volume drivers that keep trucks moving — review pricing or rein in trip costs." },
  underperformers: { label: "Underperformers", color: "#dc2626", fill: "#fef2f2", text: "#b91c1c", desc: "Low revenue and low margin. Candidates for renegotiation, repricing, or deprioritising." },
};

function quadrant(c: CustomerProfitabilityData, medRev: number, medMgn: number): Quadrant {
  const hiRev = c.total_revenue >= medRev;
  const hiMgn = c.profit_margin_pct >= medMgn;
  if ( hiRev &&  hiMgn) return "stars";
  if (!hiRev &&  hiMgn) return "gems";
  if ( hiRev && !hiMgn) return "workhorses";
  return "underperformers";
}


function IntermediateView({ data }: { data: CustomerProfitabilityData[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const q = search.trim().toLowerCase();

  if (data.length === 0) return <p className="py-20 text-center text-sm text-gray-400">No data.</p>;

  const revenues = data.map(d => d.total_revenue);
  const margins  = data.map(d => d.profit_margin_pct);

  const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const medRev = sorted(revenues)[Math.floor(revenues.length / 2)];
  const medMgn = sorted(margins)[Math.floor(margins.length / 2)];

  // Quadrant order for the 2×2 board: top-left=gems, top-right=stars, bottom-left=underperformers, bottom-right=workhorses
  const BOARD_ORDER: Quadrant[] = ["gems", "stars", "underperformers", "workhorses"];

  const groups = Object.fromEntries(
    BOARD_ORDER.map(q => [
      q,
      data
        .filter(c => quadrant(c, medRev, medMgn) === q)
        .sort((a, b) => b.total_revenue - a.total_revenue),
    ])
  ) as Record<Quadrant, CustomerProfitabilityData[]>;

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer across quadrants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-800 shadow-sm outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        {q && (
          <span className="text-xs text-gray-400">
            {BOARD_ORDER.reduce((n, qq) => n + groups[qq].filter((c) => c.customer_name.toLowerCase().includes(q)).length, 0)} match{" "}of {data.length}
          </span>
        )}
      </div>

      {/* 2×2 Matrix board */}
      <div className="grid grid-cols-2 gap-px rounded-2xl overflow-hidden border border-gray-200 bg-gray-200 shadow-sm">
        {BOARD_ORDER.map((quad) => {
          const m       = QUADRANT_META[quad];
          const group   = groups[quad];
          const visible = q ? group.filter((c) => c.customer_name.toLowerCase().includes(q)) : group;
          const rev     = group.reduce((s, c) => s + c.total_revenue, 0);
          const profit  = group.reduce((s, c) => s + c.total_profit, 0);

          return (
            <div
              key={quad}
              className="flex flex-col gap-0 bg-white"
              style={{ minHeight: 260 }}
            >
              {/* Quadrant header strip — translucent tint adapts to light & dark */}
              <div
                className="flex items-center gap-2 px-4 py-2.5"
                style={{ background: m.color + "1f" }}
              >
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: m.color }} />
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: m.color }}>
                  {m.label}
                </span>
                <span className="ml-auto text-[10px] font-medium" style={{ color: m.color + "bb" }}>
                  {q ? `${visible.length} of ${group.length}` : `${group.length} customer${group.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              {/* Description + aggregate stats */}
              <div className="px-4 pt-2.5 pb-2 border-b border-gray-50">
                <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{m.desc}</p>
                <div className="flex items-center gap-5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Total Revenue</p>
                    <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtINR(rev, true)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Net Profit</p>
                    <p className={`text-sm font-semibold tabular-nums ${profitColor(profit)}`}>
                      {profit >= 0 ? "+" : ""}{fmtINR(profit, true)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Customer cards */}
              <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5" style={{ maxHeight: 280 }}>
                {group.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-gray-300 italic">No customers here yet.</p>
                )}
                {group.length > 0 && visible.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-gray-300 italic">No match in this quadrant.</p>
                )}
                {visible.map((c) => {
                  const isOpen = expandedId === c.customer_id;
                  return (
                    <div key={c.customer_id}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : c.customer_id)}
                        className="w-full text-left rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{c.customer_name}</span>
                          <span
                            className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium tabular-nums"
                            style={{ borderColor: m.color + "50", color: m.color, background: m.color + "1f" }}
                          >
                            {c.profit_margin_pct.toFixed(1)}%
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-gray-700 tabular-nums">
                            {fmtINR(c.total_revenue, true)}
                          </span>
                        </div>
                        {/* Expanded detail */}
                        {isOpen && (
                          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-x-3 gap-y-1">
                            {[
                              ["Expenses", fmtINR(c.total_expense, true), "text-gray-600"],
                              ["Profit",   (c.total_profit >= 0 ? "+" : "") + fmtINR(c.total_profit, true), profitColor(c.total_profit)],
                              ["Trips",    String(c.trip_count) + " trips", "text-blue-600"],
                              ["Distance", c.total_km.toFixed(0) + " km",   "text-gray-600"],
                              ["Routes",   String(c.routes.length),          "text-gray-600"],
                            ].map(([k, v, cls]) => (
                              <div key={k}>
                                <p className="text-[8px] font-semibold uppercase tracking-wider text-gray-400">{k}</p>
                                <p className={`text-[10px] font-semibold tabular-nums ${cls}`}>{v}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Advanced View — Customer Scorecard
// ---------------------------------------------------------------------------

function AdvancedView({ data }: { data: CustomerProfitabilityData[] }) {
  const [search, setSearch]       = useState("");
  const [selectedId, setSelectedId] = useState(data[0]?.customer_id ?? "");

  const list     = data.filter(d => d.customer_name.toLowerCase().includes(search.toLowerCase()));
  const selected = data.find(d => d.customer_id === selectedId) ?? data[0];

  if (!selected) return <p className="py-20 text-center text-sm text-gray-400">No customer data available.</p>;

  const bestRoute  = selected.routes[0];
  const worstRoute = [...selected.routes].sort((a, b) => a.profit - b.profit)[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4 items-start">
      {/* Customer list sidebar */}
      <div className="col-span-1 flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-800 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <p className="px-1 text-[10px] font-medium text-gray-400">
          {search.trim() ? `${list.length} of ${data.length} customers` : `${data.length} customers`}
        </p>
        <div className="flex flex-col gap-1 max-h-[100vh] overflow-y-auto">
          {list.length === 0 && (
            <p className="px-3 py-6 text-center text-[11px] text-gray-400">No customers match &quot;{search}&quot;.</p>
          )}
          {list.map((c) => {
            const active = selectedId === c.customer_id;
            return (
              <button
                key={c.customer_id}
                type="button"
                onClick={() => setSelectedId(c.customer_id)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ${
                  active
                    ? "bg-blue-600 shadow-sm"
                    : "bg-white border border-gray-100 hover:bg-gray-50 shadow-sm"
                }`}
              >
                <span className={`text-[10px] font-semibold w-4 shrink-0 tabular-nums ${active ? "text-blue-200" : "text-gray-300"}`}>
                  {data.indexOf(c) + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-bold truncate ${active ? "text-white" : "text-gray-800"}`}>{c.customer_name}</p>
                  <p className={`text-[9px] ${active ? "text-blue-200" : "text-gray-400"}`}>
                    {c.trip_count} trips · {c.profit_margin_pct.toFixed(1)}%
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scorecard panel */}
      <div className="col-span-3 flex flex-col gap-4">
        {/* Header + KPIs */}
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selected.customer_name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {selected.trip_count} completed trips · {selected.total_km.toFixed(0)} km total
              </p>
            </div>
            <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${marginBg(selected.profit_margin_pct)}`}>
              {selected.profit_margin_pct.toFixed(1)}% margin
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Revenue",  value: fmtINR(selected.total_revenue),          profitVal: false, n: 0 },
              { label: "Total Expenses", value: fmtINR(selected.total_expense),          profitVal: false, n: 0 },
              { label: "Net Profit",     value: fmtINR(selected.total_profit),           profitVal: true,  n: selected.total_profit },
              { label: "Best Route",     value: bestRoute?.route  ?? "—",                profitVal: false, n: 0, small: true },
              { label: "Worst Route",    value: worstRoute?.route ?? "—",               profitVal: false, n: 0, small: true },
              { label: "Total Distance", value: `${selected.total_km.toFixed(0)} km`,   profitVal: false, n: 0 },
            ].map(({ label, value, profitVal, n, small }) => (
              <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
                <p className={`font-semibold tabular-nums ${profitVal ? profitColor(n) : "text-gray-900"} ${small ? "text-xs truncate" : "text-base"}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Route breakdown table */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-800">Route Breakdown</h3>
            <span className="ml-auto text-xs text-gray-400">{selected.routes.length} route{selected.routes.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-left min-w-[600px]">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="border-b border-gray-50 bg-gray-50/40">
                  {["Route", "Trips", "Revenue", "Expenses", "Profit", "Margin", "Avg KM"].map((h, i) => (
                    <th key={h} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 ${i >= 1 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selected.routes.map((r: RouteBreakdown) => (
                  <tr key={r.route} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-xs font-semibold text-gray-800 max-w-[200px] truncate">{r.route}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500">{r.trip_count}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmtINR(r.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmtINR(r.expense)}</td>
                    <td className={`px-4 py-2.5 text-right text-xs font-semibold tabular-nums ${profitColor(r.profit)}`}>
                      {r.profit >= 0 ? "+" : ""}{fmtINR(r.profit)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-medium tabular-nums ${marginBg(r.margin_pct)}`}>
                        {r.margin_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400 tabular-nums">{r.avg_km.toFixed(0)} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent trips table */}
        {selected.recent_trips.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-800">Recent Trips</h3>
              <span className="text-xs text-gray-400">last {selected.recent_trips.length}</span>
            </div>
            <div className="overflow-auto max-h-[45vh]">
              <table className="w-full text-left min-w-[560px]">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-50 bg-gray-50/40">
                    {["Trip ID", "Date", "Route", "Revenue", "Profit", "Margin"].map((h, i) => (
                      <th key={h} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 ${i >= 3 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selected.recent_trips.map((t: RecentTrip) => (
                    <tr key={t.trip_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-xs font-mono font-semibold text-blue-600">{t.trip_id}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 tabular-nums">{t.date ?? "—"}</td>
                      <td className="px-4 py-2 text-xs text-gray-700 max-w-[180px] truncate">{t.route}</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmtINR(t.revenue)}</td>
                      <td className={`px-4 py-2 text-right text-xs font-semibold tabular-nums ${profitColor(t.profit)}`}>
                        {t.profit >= 0 ? "+" : ""}{fmtINR(t.profit)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-medium tabular-nums ${marginBg(t.margin_pct)}`}>
                          {t.margin_pct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CustomerProfitabilityPage() {
  const [mode, setMode]               = useState<Mode>("basic");
  const [transitionKey, setTKey]      = useState(0);
  const [data, setData]               = useState<CustomerProfitabilityData[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activePanel, setActivePanel] = useState<"calc" | "guide" | null>(null);

  function handleModeChange(m: Mode) {
    if (m === mode) return;
    setMode(m);
    setTKey((k) => k + 1);
    setActivePanel(null);
  }

  useEffect(() => {
    tripsApi.getCustomerProfitability()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-72 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes modeEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mode-content-enter {
          animation: modeEnter 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      {activePanel && (
        <InfoModal mode={mode} panel={activePanel} onClose={() => setActivePanel(null)} />
      )}

      <div className="flex flex-col gap-6">
        {/* Page header + mode switcher */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customer Profitability Analytics</h1>
            <p className="mt-1 text-sm text-gray-500">
              Revenue, expenses, and profit margins across your customer base — based on completed trips.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <ModeSlider mode={mode} onChange={handleModeChange} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivePanel(p => p === "calc" ? null : "calc")}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                How is this Calculated?
              </button>
              <button
                type="button"
                onClick={() => setActivePanel(p => p === "guide" ? null : "guide")}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Quick Start Guide
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {data.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-24 text-sm text-gray-400">
            No completed trips with trip sheets found. Complete and sheet some trips to see analytics here.
          </div>
        ) : (
          <div key={transitionKey} className="mode-content-enter">
            {mode === "basic" ? (
              <BasicView data={data} />
            ) : mode === "intermediate" ? (
              <IntermediateView data={data} />
            ) : (
              <AdvancedView data={data} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
