"use client";

import { useState, useMemo, Fragment, useEffect } from "react";
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  Loader2, Search, Truck, BarChart3, ArrowRight,
  DollarSign, Wrench, Landmark, AlertCircle, CalendarDays,
  SlidersHorizontal, Check, X,
} from "lucide-react";
import { plSummaryApi, type TruckPLEntry, type TruckPLTripRow } from "@/lib/api";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

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
function fmt(v: number) { return `₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`; }
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
  const base = p ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600";
  const cls  = size === "lg"
    ? `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${base}`
    : `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${base}`;
  return (
    <span className={cls}>
      {p ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
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

// ── Filter helpers ─────────────────────────────────────────────────────────────

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

function tog(set: Set<string>, val: string, setter: (s: Set<string>) => void) {
  const next = new Set(set);
  next.has(val) ? next.delete(val) : next.add(val);
  setter(next);
}

function profitableSet(trips: EnrichedTrip[], key: (t: EnrichedTrip) => string): Set<string> {
  const m = new Map<string, number>();
  for (const t of trips) {
    const k = key(t);
    if (k) m.set(k, (m.get(k) ?? 0) + t.tripPl);
  }
  return new Set([...m.entries()].filter(([, v]) => v > 0).map(([k]) => k));
}

function FilterPillRow({ label, options, selected, onToggle, labelFn }: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  labelFn?: (v: string) => string;
}) {
  if (options.length === 0) return null;
  const display = labelFn ?? shortLabel;
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-24 shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.has(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`rounded-full px-3 py-0.5 text-xs font-semibold border transition-all ${
                active
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              {active && <Check className="inline h-2.5 w-2.5 mr-1 -mt-0.5" />}
              {display(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ADV_FILTERS = [
  { key: "profitableTrips",     label: "Profitable Trips",     tip: "Only trips where Hire > Expenses" },
  { key: "profitableCustomers", label: "Profitable Customers",  tip: "Only trips from customers with net +ve P&L in period" },
  { key: "profitableCategory",  label: "Profitable Trip Type",  tip: "Only trips from trip categories with net +ve P&L" },
  { key: "profitableCargo",     label: "Profitable Cargo",      tip: "Only trips from cargo types with net +ve P&L" },
  { key: "profitableContainer", label: "Profitable Container",  tip: "Only trips from container types with net +ve P&L" },
] as const;

// ── Trip Profitability tab ─────────────────────────────────────────────────────
function TripProfitabilityTab({ trips }: { trips: EnrichedTrip[] }) {
  // ── Sort ──────────────────────────────────────────────────────────────────
  const [search,  setSearch]  = useState("");
  const [sortKey, setSortKey] = useState<TripSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Basic filter state (empty Set = show all) ─────────────────────────────
  const [fCargo,     setFCargo]     = useState<Set<string>>(new Set());
  const [fCategory,  setFCategory]  = useState<Set<string>>(new Set());
  const [fContainer, setFContainer] = useState<Set<string>>(new Set());
  const [fCustomer,  setFCustomer]  = useState<Set<string>>(new Set());
  const [fTruck,     setFTruck]     = useState<Set<string>>(new Set());

  // ── Advanced filter state ─────────────────────────────────────────────────
  const [advTrips,     setAdvTrips]     = useState(false);
  const [advCustomers, setAdvCustomers] = useState(false);
  const [advCategory,  setAdvCategory]  = useState(false);
  const [advCargo,     setAdvCargo]     = useState(false);
  const [advContainer, setAdvContainer] = useState(false);

  // ── Option sets (unique values present in the period) ─────────────────────
  const cargoOpts     = useMemo(() => [...new Set(trips.map(t => t.cargoClassification).filter(Boolean))].sort(), [trips]);
  const categoryOpts  = useMemo(() => [...new Set(trips.map(t => t.tripCategory).filter(Boolean))].sort(), [trips]);
  const containerOpts = useMemo(() => [...new Set(trips.map(t => t.containerSpecification).filter(Boolean))].sort(), [trips]);
  const customerOpts  = useMemo(() => [...new Set(trips.map(t => t.customerName).filter(Boolean))].sort(), [trips]);
  const truckOpts     = useMemo(() => [...new Set(trips.map(t => t.truckId).filter(Boolean))].sort(), [trips]);

  // ── Profitable-group sets (computed from ALL trips in period, not filtered) ─
  const profCustomers  = useMemo(() => profitableSet(trips, t => t.customerName), [trips]);
  const profCategories = useMemo(() => profitableSet(trips, t => t.tripCategory), [trips]);
  const profCargos     = useMemo(() => profitableSet(trips, t => t.cargoClassification), [trips]);
  const profContainers = useMemo(() => profitableSet(trips, t => t.containerSpecification), [trips]);

  // ── Active filter count (for badge) ───────────────────────────────────────
  const activeBasic = fCargo.size + fCategory.size + fContainer.size + fCustomer.size + fTruck.size;
  const activeAdv   = [advTrips, advCustomers, advCategory, advCargo, advContainer].filter(Boolean).length;
  const hasFilters  = activeBasic + activeAdv > 0;

  function clearFilters() {
    setFCargo(new Set()); setFCategory(new Set()); setFContainer(new Set());
    setFCustomer(new Set()); setFTruck(new Set());
    setAdvTrips(false); setAdvCustomers(false);
    setAdvCategory(false); setAdvCargo(false); setAdvContainer(false);
  }

  function toggleSort(col: TripSortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("desc"); }
  }

  // ── Filtered + sorted trips ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trips
      .filter((t) => {
        // Text search
        if (q && ![t.truckId, t.registrationNumber, t.tripSheetNo, t.bookingReferenceNo,
                    t.fromLocation, t.toLocation, t.customerName]
                   .some(f => (f || "").toLowerCase().includes(q))) return false;
        // Basic filters (OR within dimension, AND across)
        if (fCargo.size     && !fCargo.has(t.cargoClassification))     return false;
        if (fCategory.size  && !fCategory.has(t.tripCategory))         return false;
        if (fContainer.size && !fContainer.has(t.containerSpecification)) return false;
        if (fCustomer.size  && !fCustomer.has(t.customerName))         return false;
        if (fTruck.size     && !fTruck.has(t.truckId))                 return false;
        // Advanced filters (all AND)
        if (advTrips     && t.tripPl <= 0)                                    return false;
        if (advCustomers && !profCustomers.has(t.customerName))               return false;
        if (advCategory  && !profCategories.has(t.tripCategory))              return false;
        if (advCargo     && !profCargos.has(t.cargoClassification))           return false;
        if (advContainer && !profContainers.has(t.containerSpecification))    return false;
        return true;
      })
      .sort((a, b) => {
        let d = 0;
        if (sortKey === "date")    d = a.tripSheetDate.localeCompare(b.tripSheetDate);
        if (sortKey === "hire")    d = a.hireAmount - b.hireAmount;
        if (sortKey === "expense") d = a.totalExpense - b.totalExpense;
        if (sortKey === "pl")      d = a.tripPl - b.tripPl;
        return sortDir === "asc" ? d : -d;
      });
  }, [trips, search, sortKey, sortDir,
      fCargo, fCategory, fContainer, fCustomer, fTruck,
      advTrips, advCustomers, advCategory, advCargo, advContainer,
      profCustomers, profCategories, profCargos, profContainers]);

  // ── Summary stats (always from full trip set) ─────────────────────────────
  const profitable = trips.filter((t) => t.tripPl >= 0).length;
  const totalHire  = trips.reduce((s, t) => s + t.hireAmount, 0);
  const totalExp   = trips.reduce((s, t) => s + t.totalExpense, 0);
  const netPl      = trips.reduce((s, t) => s + t.tripPl, 0);
  const fHire      = filtered.reduce((s, t) => s + t.hireAmount, 0);
  const fExp       = filtered.reduce((s, t) => s + t.totalExpense, 0);
  const fPl        = filtered.reduce((s, t) => s + t.tripPl, 0);

  // ── Advanced filter toggle map ────────────────────────────────────────────
  const advState: Record<string, [boolean, () => void]> = {
    profitableTrips:     [advTrips,     () => setAdvTrips(v => !v)],
    profitableCustomers: [advCustomers, () => setAdvCustomers(v => !v)],
    profitableCategory:  [advCategory,  () => setAdvCategory(v => !v)],
    profitableCargo:     [advCargo,     () => setAdvCargo(v => !v)],
    profitableContainer: [advContainer, () => setAdvContainer(v => !v)],
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Trips"      value={String(trips.length)} icon={<BarChart3 className="h-4 w-4" />} color="blue" />
        <StatCard label="Profitable Trips" value={`${profitable} / ${trips.length}`}
          sub={trips.length ? `${((profitable / trips.length) * 100).toFixed(0)}% success rate` : ""}
          icon={<TrendingUp className="h-4 w-4" />} color="emerald" />
        <StatCard label="Total Hire Revenue" value={fmt(totalHire)} sub={`Expenses: ${fmt(totalExp)}`}
          icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Net Trip P&L" value={fmt(netPl)} sub={netPl >= 0 ? "Overall Profit" : "Overall Loss"}
          icon={netPl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={netPl >= 0 ? "emerald" : "red"} />
      </div>

      {/* Filter pills panel */}
      {trips.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Filters</span>
              {hasFilters && (
                <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {activeBasic + activeAdv}
                </span>
              )}
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>

          {/* Basic filters */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">Basic Filters</p>
            <FilterPillRow label="Cargo"     options={cargoOpts}     selected={fCargo}     onToggle={v => tog(fCargo, v, setFCargo)} />
            <FilterPillRow label="Trip Type" options={categoryOpts}  selected={fCategory}  onToggle={v => tog(fCategory, v, setFCategory)} />
            <FilterPillRow label="Container" options={containerOpts} selected={fContainer} onToggle={v => tog(fContainer, v, setFContainer)} />
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-24 shrink-0 pt-1">Customer</span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {customerOpts.map(opt => (
                  <button key={opt} type="button" onClick={() => tog(fCustomer, opt, setFCustomer)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all ${fCustomer.has(opt) ? "border-blue-500 bg-blue-500 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-24 shrink-0 pt-1">Truck</span>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
                {truckOpts.map(opt => (
                  <button key={opt} type="button" onClick={() => tog(fTruck, opt, setFTruck)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all ${fTruck.has(opt) ? "border-blue-500 bg-blue-500 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Advanced filters */}
          <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-3">
              Advanced Filters — Profitability Based
            </p>
            <div className="flex flex-wrap gap-2">
              {ADV_FILTERS.map(({ key, label, tip }) => {
                const [active, toggle] = advState[key];
                return (
                  <button
                    key={key}
                    type="button"
                    title={tip}
                    onClick={toggle}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                      active
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                  >
                    <TrendingUp className={`h-3 w-3 ${active ? "text-white" : "text-emerald-400"}`} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            type="text" placeholder="Search by truck, customer, route, sheet no…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder-gray-400"
          />
          {search && <button onClick={() => setSearch("")} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
          <span className="text-xs text-gray-400 shrink-0">
            {filtered.length}{trips.length !== filtered.length ? ` / ${trips.length}` : ""} trips
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <SlidersHorizontal className="mx-auto mb-2 h-7 w-7 text-gray-300" />
            <p className="text-sm text-gray-400">No trips match the active filters.</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-xs text-blue-500 hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full min-w-[900px] text-sm">
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
                  <SortTh label="Hire"     col="hire"    current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Expenses" col="expense" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Trip P&L" col="pl"      current={sortKey} dir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((t, i) => (
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
                    <td className="px-4 py-3 text-right"><PlBadge value={t.tripPl} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-gray-600">
                    Total ({filtered.length} trips{trips.length !== filtered.length ? `, filtered from ${trips.length}` : ""})
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-blue-700">{fmt(fHire)}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700">{fmt(fExp)}</td>
                  <td className="px-4 py-3 text-right"><PlBadge value={fPl} /></td>
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
            <div className="flex justify-between border-t border-slate-200 mt-1 pt-2">
              <span className="text-xs font-bold text-slate-600">Total Deductions</span>
              <span className="text-xs font-bold text-slate-700">− {fmt(entry.emiShare + entry.maintenanceExpenses)}</span>
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

// ── Truck filter constants ─────────────────────────────────────────────────────
const ADV_TRUCK_FILTERS = [
  { key: "netProfitable",  label: "Net Profitable",   tip: "Only trucks with Net P&L > 0 (after EMI & maintenance)" },
  { key: "tripProfitable", label: "Trip Profitable",  tip: "Only trucks with gross Trip P&L > 0 (before overhead)" },
  { key: "hasEmi",         label: "EMI Active",       tip: "Only trucks with an active EMI loan in this period" },
  { key: "hasMaint",       label: "Has Maintenance",  tip: "Only trucks with maintenance records in this period" },
  { key: "activeOnly",     label: "Active Trucks",    tip: "Only trucks that completed at least one trip" },
] as const;

// ── Truck Profitability tab ────────────────────────────────────────────────────
function TruckProfitabilityTab({ data }: { data: TruckPLEntry[] }) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // ── Basic filter state ──────────────────────────────────────────────────────
  const [fCargo,    setFCargo]    = useState<Set<string>>(new Set());
  const [fCategory, setFCategory] = useState<Set<string>>(new Set());
  const [fEmi,      setFEmi]      = useState<Set<string>>(new Set()); // "With EMI" | "No EMI"

  // ── Advanced filter state ───────────────────────────────────────────────────
  const [advNetProfit,  setAdvNetProfit]  = useState(false);
  const [advTripProfit, setAdvTripProfit] = useState(false);
  const [advHasEmi,     setAdvHasEmi]     = useState(false);
  const [advHasMaint,   setAdvHasMaint]   = useState(false);
  const [advActiveOnly, setAdvActiveOnly] = useState(false);

  const enriched = useMemo<EnrichedTruck[]>(() =>
    data.map((e) => ({
      ...e,
      tripPl:      e.totalHireAmount - e.tripExpenses,
      netTruckPl:  e.totalHireAmount - e.tripExpenses - e.emiShare - e.maintenanceExpenses,
    })),
    [data],
  );

  // ── Option sets (derived from all trucks' tripRows) ─────────────────────────
  const cargoOpts = useMemo(() => {
    const vals = new Set<string>();
    for (const e of enriched) for (const t of (e.tripRows ?? [])) if (t.cargoClassification) vals.add(t.cargoClassification);
    return [...vals].sort();
  }, [enriched]);

  const categoryOpts = useMemo(() => {
    const vals = new Set<string>();
    for (const e of enriched) for (const t of (e.tripRows ?? [])) if (t.tripCategory) vals.add(t.tripCategory);
    return [...vals].sort();
  }, [enriched]);

  // "With EMI" / "No EMI" pills — only show a label if at least one truck has it
  const emiOpts = useMemo(() => {
    const w = enriched.some(e => e.emiShare > 0);
    const n = enriched.some(e => e.emiShare === 0);
    return [...(w ? ["With EMI"] : []), ...(n ? ["No EMI"] : [])];
  }, [enriched]);

  // ── Active filter count ─────────────────────────────────────────────────────
  const activeBasic = fCargo.size + fCategory.size + fEmi.size;
  const activeAdv   = [advNetProfit, advTripProfit, advHasEmi, advHasMaint, advActiveOnly].filter(Boolean).length;
  const hasFilters  = activeBasic + activeAdv > 0;

  function clearFilters() {
    setFCargo(new Set()); setFCategory(new Set()); setFEmi(new Set());
    setAdvNetProfit(false); setAdvTripProfit(false);
    setAdvHasEmi(false); setAdvHasMaint(false); setAdvActiveOnly(false);
  }

  // Advanced toggle map
  const advState: Record<string, [boolean, () => void]> = {
    netProfitable:  [advNetProfit,  () => setAdvNetProfit(v  => !v)],
    tripProfitable: [advTripProfit, () => setAdvTripProfit(v => !v)],
    hasEmi:         [advHasEmi,     () => setAdvHasEmi(v     => !v)],
    hasMaint:       [advHasMaint,   () => setAdvHasMaint(v   => !v)],
    activeOnly:     [advActiveOnly, () => setAdvActiveOnly(v => !v)],
  };

  // ── Filtered trucks ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter((e) => {
      // Text search
      if (q && !e.truckId.toLowerCase().includes(q) && !e.registrationNumber.toLowerCase().includes(q)) return false;

      // Basic: Cargo — truck must have ≥1 trip in any of the selected cargo types
      if (fCargo.size) {
        const truckCargos = new Set((e.tripRows ?? []).map(t => t.cargoClassification).filter(Boolean));
        if (![...fCargo].some(c => truckCargos.has(c))) return false;
      }

      // Basic: Trip Type — truck must have ≥1 trip in any of the selected categories
      if (fCategory.size) {
        const truckCats = new Set((e.tripRows ?? []).map(t => t.tripCategory).filter(Boolean));
        if (![...fCategory].some(c => truckCats.has(c))) return false;
      }

      // Basic: EMI status pill
      if (fEmi.size) {
        const label = e.emiShare > 0 ? "With EMI" : "No EMI";
        if (!fEmi.has(label)) return false;
      }

      // Advanced filters (AND)
      if (advNetProfit  && e.netTruckPl          <= 0) return false;
      if (advTripProfit && e.tripPl              <= 0) return false;
      if (advHasEmi     && e.emiShare            <= 0) return false;
      if (advHasMaint   && e.maintenanceExpenses <= 0) return false;
      if (advActiveOnly && e.tripCount           === 0) return false;

      return true;
    });
  }, [enriched, search, fCargo, fCategory, fEmi,
      advNetProfit, advTripProfit, advHasEmi, advHasMaint, advActiveOnly]);

  const totals = useMemo(() => ({
    trips: filtered.reduce((s, e) => s + e.tripCount, 0),
    hire:  filtered.reduce((s, e) => s + e.totalHireAmount, 0),
    tExp:  filtered.reduce((s, e) => s + e.tripExpenses, 0),
    tPl:   filtered.reduce((s, e) => s + e.tripPl, 0),
    emi:   filtered.reduce((s, e) => s + e.emiShare, 0),
    maint: filtered.reduce((s, e) => s + e.maintenanceExpenses, 0),
    net:   filtered.reduce((s, e) => s + e.netTruckPl, 0),
  }), [filtered]);

  const profitable = filtered.filter((e) => e.netTruckPl >= 0).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Active Trucks" value={String(filtered.length)}
          sub={`${profitable} profitable`}
          icon={<Truck className="h-4 w-4" />} color="blue" />
        <StatCard
          label="Total EMI Deducted" value={totals.emi > 0 ? fmt(totals.emi) : "None"}
          sub={totals.emi > 0 ? "Active loans in period" : "No EMI active"}
          icon={<Landmark className="h-4 w-4" />} color="purple" />
        <StatCard
          label="Total Maintenance" value={fmt(totals.maint)}
          sub={`Across ${filtered.length} trucks`}
          icon={<Wrench className="h-4 w-4" />} color="amber" />
        <StatCard
          label="Net Fleet P&L" value={fmt(totals.net)}
          sub={totals.net >= 0 ? "Fleet is profitable" : "Fleet is at loss"}
          icon={totals.net >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={totals.net >= 0 ? "emerald" : "red"} />
      </div>

      {/* Filter pills panel */}
      {enriched.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Filters</span>
              {hasFilters && (
                <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {activeBasic + activeAdv}
                </span>
              )}
            </div>
            {hasFilters && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>

          {/* Basic filters */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">Basic Filters</p>
            <FilterPillRow label="Cargo"     options={cargoOpts}    selected={fCargo}    onToggle={v => tog(fCargo, v, setFCargo)} />
            <FilterPillRow label="Trip Type" options={categoryOpts} selected={fCategory} onToggle={v => tog(fCategory, v, setFCategory)} />
            <FilterPillRow label="EMI"       options={emiOpts}      selected={fEmi}      onToggle={v => tog(fEmi, v, setFEmi)} labelFn={v => v} />
          </div>

          {/* Advanced filters */}
          <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-3">
              Advanced Filters — Profitability Based
            </p>
            <div className="flex flex-wrap gap-2">
              {ADV_TRUCK_FILTERS.map(({ key, label, tip }) => {
                const [active, toggle] = advState[key];
                return (
                  <button
                    key={key} type="button" title={tip} onClick={toggle}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                      active
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                  >
                    <TrendingUp className={`h-3 w-3 ${active ? "text-white" : "text-emerald-400"}`} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            type="text" placeholder="Search by truck ID or registration…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder-gray-400"
          />
          {search && <button onClick={() => setSearch("")} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
          <span className="text-xs text-gray-400 shrink-0">
            {filtered.length}{enriched.length !== filtered.length ? ` / ${enriched.length}` : ""} trucks
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <SlidersHorizontal className="mx-auto mb-2 h-7 w-7 text-gray-300" />
            <p className="text-sm text-gray-400">No trucks match the active filters.</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-xs text-blue-500 hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Truck", "Trips", "Hire Revenue", "Trip Expenses", "Gross Trip P&L", "− EMI", "− Maintenance", "Net Truck P&L", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <Fragment key={entry.truckId}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{entry.truckId}</p>
                        <p className="text-xs text-gray-400">{entry.registrationNumber}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                          {entry.tripCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-700">{fmt(entry.totalHireAmount)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmt(entry.tripExpenses)}</td>
                      <td className="px-4 py-3"><PlBadge value={entry.tripPl} /></td>
                      <td className="px-4 py-3">
                        {entry.emiShare > 0
                          ? <span className="font-medium text-purple-700">− {fmt(entry.emiShare)}</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {entry.maintenanceExpenses > 0
                          ? <span className="font-medium text-orange-700">− {fmt(entry.maintenanceExpenses)}</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3"><PlBadge value={entry.netTruckPl} /></td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setOpenId(openId === entry.truckId ? null : entry.truckId)}
                          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                            openId === entry.truckId
                              ? "border-blue-300 bg-blue-50 text-blue-700"
                              : "border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                          }`}
                        >
                          {openId === entry.truckId
                            ? <><ChevronUp className="h-3.5 w-3.5" /> Hide</>
                            : <><ChevronDown className="h-3.5 w-3.5" /> Details</>}
                        </button>
                      </td>
                    </tr>
                    {openId === entry.truckId && (
                      <tr>
                        <td colSpan={9} className="border-b border-gray-200 p-0">
                          <TruckDetailPanel entry={entry} netTruckPl={entry.netTruckPl} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-gray-700">
                    Fleet Total
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      ({filtered.length}{enriched.length !== filtered.length ? ` / ${enriched.length}` : ""} trucks)
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-blue-700">{totals.trips}</td>
                  <td className="px-4 py-3 text-blue-700">{fmt(totals.hire)}</td>
                  <td className="px-4 py-3 text-gray-700">{fmt(totals.tExp)}</td>
                  <td className="px-4 py-3"><PlBadge value={totals.tPl} /></td>
                  <td className="px-4 py-3 text-purple-700">{totals.emi > 0 ? `− ${fmt(totals.emi)}` : "—"}</td>
                  <td className="px-4 py-3 text-orange-700">{totals.maint > 0 ? `− ${fmt(totals.maint)}` : "—"}</td>
                  <td className="px-4 py-3"><PlBadge value={totals.net} /></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 italic">
        Net Truck P&L = Gross Trip P&L (Hire − Trip Expenses) − EMI Share for Period − Maintenance Expenses in Period.
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

  useEffect(() => { fetchData(); }, []); // auto-load current month on mount

  function applyPreset(p: (typeof PRESETS)[number]) {
    const { start, end } = p.fn();
    setStartDate(start);
    setEndDate(end);
    setActivePreset(p.label);
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

  const periodLabel = startDate && endDate ? `${fmtDate(startDate)} → ${fmtDate(endDate)}` : "";

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
        {data && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            {periodLabel}
          </span>
        )}
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
              onChange={(v) => { setStartDate(v); setActivePreset(""); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <DatePickerInput
              value={endDate}
              onChange={(v) => { setEndDate(v); setActivePreset(""); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <button
            type="button" onClick={fetchData}
            disabled={loading || !startDate || !endDate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            {loading ? "Loading…" : "Generate Report"}
          </button>
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

          {tab === "trips"  && <TripProfitabilityTab trips={allTrips} />}
          {tab === "trucks" && <TruckProfitabilityTab data={data} />}
        </>
      )}

      {data === null && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-14 text-center">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-semibold text-gray-500">Select a period and click Generate Report</p>
          <p className="mt-2 text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            Trip P&L = Hire Income − Trip Expenses
            <br />
            Truck P&L = Trip P&L − EMI (if active) − Maintenance
          </p>
        </div>
      )}
    </div>
  );
}
