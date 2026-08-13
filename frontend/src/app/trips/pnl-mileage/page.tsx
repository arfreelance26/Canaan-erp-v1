"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, TrendingUp, TrendingDown, Route, ChevronLeft, ChevronRight } from "lucide-react";
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
      }).finally(() => setLoading(false));
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
        const hire = n(s.hireAmount);
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">P&L — Per Trip</h1>
        <p className="mt-1 text-sm text-gray-500">
          Profit / Loss breakdown for all completed trip sheets
        </p>
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
    </div>
  );
}
