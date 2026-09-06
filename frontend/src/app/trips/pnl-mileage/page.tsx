"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Search, TrendingUp, TrendingDown, Route, ChevronLeft, ChevronRight,
  Compass, Calculator, X, FileText, Wallet, MousePointerClick, CalendarDays, FileSpreadsheet,
} from "lucide-react";
import { tripsApi } from "@/lib/api";
import { n } from "@/types/trip-sheet";
import type { Trip } from "@/types/trip";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

const PAGE_SIZE = 10;

type Row = {
  trip: Trip;
  hire: number;
  expense: number;
  pnl: number;
  km: number;
};

function fmt(v: number) {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

// ── Guide modal shell ────────────────────────────────────────────────────────────
function ModalShell({ title, subtitle, icon, onClose, children }: {
  title: string; subtitle?: string; icon: React.ReactNode; onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
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
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
      </div>
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
  return (
    <ModalShell
      title="How is it Calculated"
      subtitle="Formulas behind every figure on this page"
      icon={<Calculator className="h-5 w-5" />}
      onClose={onClose}
    >
      <GuideSection title="Data source" icon={<FileText className="h-3.5 w-3.5" />}>
        <p>
          This page lists every trip that has a saved <b>Trip Sheet</b>. Trips without one (nothing filled in on the
          trip sheet yet) don&rsquo;t appear here, since there&rsquo;s no expense/KM data to show.
        </p>
      </GuideSection>

      <GuideSection title="Hire Amount" icon={<Wallet className="h-3.5 w-3.5" />}>
        <p>
          Same figure as the <b>&ldquo;Hire Amount (excluding Commission Amount)&rdquo;</b> field on the trip
          assignment form — the trip sheet&rsquo;s hire amount minus whatever commission was set on the route:
        </p>
        <Formula>Hire Amount&nbsp;&nbsp;=&nbsp;&nbsp;Trip Sheet Hire Amount − Transport Commission Amount</Formula>
      </GuideSection>

      <GuideSection title="Total Expense" icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
        <p>Everything the company bears for the trip, taken straight from the trip sheet:</p>
        <Formula>
          Total Expense&nbsp;&nbsp;=&nbsp;&nbsp;Driver Batta + Port Pass + Weight Sheet + Mamol + Claimable Mamol
          + Traffic/RTO + Lift On/Off + Crane Operator + Parking + Other Expenses + Toll Charges + Halt Pay
        </Formula>
      </GuideSection>

      <GuideSection title="P&L" icon={<TrendingUp className="h-3.5 w-3.5" />}>
        <Formula>P&amp;L&nbsp;&nbsp;=&nbsp;&nbsp;Hire Amount − Total Expense</Formula>
        <p className="text-xs text-gray-500">Green with an up arrow means profit; red with a down arrow means loss.</p>
      </GuideSection>

      <GuideSection title="KM" icon={<Route className="h-3.5 w-3.5" />}>
        <Formula>KM&nbsp;&nbsp;=&nbsp;&nbsp;Trip Sheet End KM − Start KM</Formula>
      </GuideSection>

      <GuideSection title="Filters &amp; sorting" icon={<CalendarDays className="h-3.5 w-3.5" />}>
        <p>
          From/To filters by the trip&rsquo;s <b>Scheduled Date</b>. Search matches Trip ID, vehicle, origin, or
          destination. Rows are always sorted latest-scheduled first, then by highest P&amp;L. The totals row at the
          bottom of the table sums every filtered trip, not just the current page.
        </p>
      </GuideSection>
    </ModalShell>
  );
}

// ── "Quick Start Guide" modal ─────────────────────────────────────────────────────
function QuickStartModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { n: 1, title: "Pick a date range", body: "Use From/To to narrow trips to a period, based on each trip's Scheduled Date. Leave both blank to see every trip with a saved trip sheet." },
    { n: 2, title: "Search if needed", body: "Type a Trip ID, vehicle registration, or origin/destination to jump straight to a specific trip." },
    { n: 3, title: "Read the summary cards", body: "Trips, Total Hire, and Net P&L for everything currently matching your filters — updates live as you filter." },
    { n: 4, title: "Scan the table", body: "Each row shows Hire Amount, Total Expense, P&L and KM for one trip. Rows are sorted latest first." },
    { n: 5, title: "Click a row for details", body: "Opens the full read-only Trip Sheet — every expense line item, driver batta, and KM reading behind the numbers." },
    { n: 6, title: "Check \"How is it Calculated\"", body: "Click that button any time to see the exact formulas behind Hire Amount, Total Expense, P&L, and KM." },
  ];
  return (
    <ModalShell
      title="Quick Start Guide"
      subtitle="Get comfortable with this page in under a minute"
      icon={<Compass className="h-5 w-5" />}
      onClose={onClose}
    >
      <div className="space-y-4">
        {steps.map((s) => (
          <div key={s.n} className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{s.n}</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{s.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.body}</p>
            </div>
          </div>
        ))}
        <div className="flex gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <MousePointerClick className="h-3.5 w-3.5" />
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Tip: this page is read-only — to add or edit a trip sheet, go to the trip in <b>Trip Sheet Collection</b>.
          </p>
        </div>
      </div>
    </ModalShell>
  );
}

export default function PnlMileagePage() {
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [showHowCalculated, setShowHowCalculated] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);

  useEffect(() => {
    tripsApi.list().then((trips) => {
      setAllTrips(trips);
      const withSheet = trips.filter((t) => t.hasSheet);
      Promise.all(
        withSheet.map((t) =>
          tripsApi.getSheet(t.id)
            .then((s) => s ? ({ id: t.id, sheet: s }) : null)
            .catch(() => null)
        )
      ).then((results) => {
        const m = new Map<string, TripSheetData>();
        for (const r of results) { if (r) m.set(r.id, r.sheet); }
        setSheets(m);

        const withClosure = trips.filter((t) => t.hasClosure);
        return Promise.all(
          withClosure.map((t) =>
            tripsApi.getClosure(t.id)
              .then((c) => ({ id: t.id, closure: c }))
              .catch(() => null)
          )
        );
      }).then((results) => {
        const m = new Map<string, TripClosureData>();
        for (const r of results) { if (r) m.set(r.id, r.closure); }
        setClosures(m);
      }).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo]);

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTrips
      .filter((t) => sheets.has(t.id))
      .map((t) => {
        const s = sheets.get(t.id)!;
        // Hire Amount excluding Commission Amount — matches the "Hire Amount
        // (excluding Commission Amount)" field on the trip assignment form.
        const hire = n(s.hireAmount) - n(t.transportCommissionAmount ?? "");
        const expense = n(s.totalExpense);
        const pnl = hire - expense;
        const km = n(s.totalKm);
        return { trip: t, hire, expense, pnl, km };
      })
      .filter(({ trip: t }) => {
        if (dateFrom && t.scheduledDate && t.scheduledDate < dateFrom) return false;
        if (dateTo && t.scheduledDate && t.scheduledDate > dateTo) return false;
        if (q) {
          const haystack = [t.tripId, t.vehicleId, t.origin, t.destination].join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (b.trip.scheduledDate > a.trip.scheduledDate) return 1;
        if (b.trip.scheduledDate < a.trip.scheduledDate) return -1;
        return b.pnl - a.pnl;
      });
  }, [allTrips, sheets, search, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);
  const totalHire = rows.reduce((s, r) => s + r.hire, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);

  const clearFilters = () => { setDateFrom(""); setDateTo(""); setSearch(""); };
  const hasFilters = !!(dateFrom || dateTo || search);

  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={3} columns={9} rows={10} />;

  return (
    <div className="flex flex-col gap-6">
      {/* Page title */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Summary</h1>
          <p className="mt-1 text-sm text-gray-500">
            Profit / Loss breakdown for all completed trip sheets
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
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Trips</p>
          <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Hire</p>
          <p className="text-xl font-bold text-blue-700">{fmt(totalHire)}</p>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Net P&L</p>
          <p className={`text-xl font-bold ${totalPnl >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {fmt(totalPnl)}
          </p>
        </div>
      </div>

      {/* ── Sticky controls ── */}
      <div className="sticky top-0 z-20 bg-white/95 px-6 py-3 shadow-sm backdrop-blur border-b rounded-xl border-gray-100">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by trip ID, vehicle, or route…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">From</label>
              <DatePickerInput
                value={dateFrom}
                onChange={setDateFrom}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">To</label>
              <DatePickerInput
                value={dateTo}
                onChange={setDateTo}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[75vh] rounded-xl border border-gray-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-gray-400">
            <Route className="h-8 w-8 text-gray-300" />
            <span>No trips found matching your filters.</span>
          </div>
        ) : (
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Trip ID", "Date", "Driver", "Reg. No.", "Route", "Hire Amount", "Total Expense", "P&L", "KM"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.map(({ trip: t, hire, expense, pnl, km }) => (
                <tr
                  key={t.id}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                  onClick={() => setSelectedTrip(t)}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{t.tripId}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {t.scheduledDate
                      ? new Date(t.scheduledDate).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }).replace(/\//g, "-")
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{t.driverName || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{t.truckRegistration || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.origin} → {t.destination}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-blue-700">{fmt(hire)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{fmt(expense)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center gap-1 font-bold ${pnl >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {pnl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {fmt(pnl)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{km > 0 ? `${km} km` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td colSpan={5} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Total ({rows.length} trips)
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-blue-700">{fmt(totalHire)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-700">{fmt(totalExpense)}</td>
                <td className={`whitespace-nowrap px-4 py-3 ${totalPnl >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {fmt(totalPnl)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} of {rows.length} trips
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p as number)}
                    className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-2 text-sm font-medium transition ${
                      p === safePage
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Trip sheet popup */}
      <TripSheetDialog
        open={selectedTrip !== null}
        trip={selectedTrip}
        closure={selectedTrip ? closures.get(selectedTrip.id) : undefined}
        existingSheet={selectedTrip ? sheets.get(selectedTrip.id) : undefined}
        readOnly
        drivers={[]}
        trucks={[]}
        onSubmit={() => {}}
        onClose={() => setSelectedTrip(null)}
      />

      {showHowCalculated && <HowCalculatedModal onClose={() => setShowHowCalculated(false)} />}
      {showQuickStart && <QuickStartModal onClose={() => setShowQuickStart(false)} />}
    </div>
  );
}
