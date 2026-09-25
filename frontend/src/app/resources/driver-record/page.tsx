"use client";

import { useEffect, useMemo, useState } from "react";
import { IdCard, FileText, ClipboardList, Calculator, Route, Wallet, ChevronDown } from "lucide-react";
import { driversApi, tripsApi, trucksApi, customersApi } from "@/lib/api";
import { mapLimit } from "@/lib/async-pool";
import type { Driver } from "@/types/driver";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { Avatar } from "@/components/ui/Avatar";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate, todayIst } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

// "YYYY-MM-DD" minus N calendar months, still as "YYYY-MM-DD" — used only for
// the default range, so plain calendar-date arithmetic (no timezone handling)
// is exactly right here.
function monthsBefore(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() - months);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

type SalaryBreakdown = {
  regularPay: number;
  totalAdvance: number;
  totalExpenses: number;
  outstandingAdvance: number;
  netPayable: number;
  excluded: boolean;
};

// Same formula as SalaryRecordDialog (the Driver Compensation page's "Salary
// Record" view): Driver Batta Amount minus Outstanding Advance, with a RETURN
// TRIP's batta excluded unless it was explicitly marked still owed. This is a
// live calculation from trip/trip-sheet data, not a sum of already-recorded
// "Salary" payments — matching what's actually shown as "salary" everywhere
// else in the app. Broken out into its components (not just the final number)
// so the "Salary Breakdown" dialog can show its working, not just the result.
function salaryBreakdownForTrip(trip: Trip, sheet: TripSheetData | undefined): SalaryBreakdown {
  const totalExpenses = parseFloat(sheet?.driverExpensesTotal ?? "0") || 0;
  const totalAdvance = parseFloat(sheet?.driverAdvanceAmount ?? "0") || 0;
  const outstandingAdvance = totalAdvance - totalExpenses;
  const regularPay = parseFloat(trip.driverAdvanceAmount || sheet?.driverPay || "0") || 0;
  const netPayable = regularPay - outstandingAdvance;
  const excluded = trip.tripCategory === "RETURN TRIP" && !trip.isBattaApplicable;
  return { regularPay, totalAdvance, totalExpenses, outstandingAdvance, netPayable, excluded };
}

function netPayableForTrip(trip: Trip, sheet: TripSheetData | undefined): number {
  if (!sheet) return 0;
  const b = salaryBreakdownForTrip(trip, sheet);
  return b.excluded ? 0 : b.netPayable;
}

function money(v: number): string {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

// Matches the SectionCard/Row idiom already used by VerifyTripDialog for
// trip-related read-outs elsewhere in the app: a flat white card, a tinted
// uppercase header bar, and label/value rows with hairline dividers — no
// gradients or glassmorphism, consistent with the rest of the ERP.
function SectionCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className={cn("flex items-center gap-2.5 border-b border-gray-100 px-4 py-2.5", accent)}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-current opacity-70">{title}</p>
      </div>
      <div className="px-4 py-1.5">{children}</div>
    </section>
  );
}

function Row({ label, hint, value, tone = "default" }: { label: string; hint?: string; value: string; tone?: "default" | "amber" | "red" | "gray" }) {
  const toneClasses: Record<string, string> = {
    default: "text-gray-800",
    amber: "text-amber-600",
    red: "text-red-600",
    gray: "text-gray-400",
  };
  return (
    <div className="flex items-baseline justify-between gap-6 py-2 text-sm border-b border-gray-50 last:border-0">
      <span className="shrink-0 text-gray-400 font-medium">
        {label}
        {hint && <span className="ml-1.5 text-[11px] font-normal text-gray-300">{hint}</span>}
      </span>
      <span className={cn("text-right font-semibold", toneClasses[tone])}>{value}</span>
    </div>
  );
}

function outstandingTone(v: number): "amber" | "red" | "gray" {
  if (v > 0) return "amber";
  if (v < 0) return "red";
  return "gray";
}

// A single flat, proportional bar — how the Batta splits between what the
// driver keeps and what's absorbed by outstanding advance (or, when the
// driver overspent their advance, how that overspend adds back on top).
function FlowBar({ b }: { b: SalaryBreakdown }) {
  const overspend = b.outstandingAdvance < 0;
  const total = Math.max(overspend ? b.netPayable : b.regularPay, 1);
  const keptPct = Math.max(0, Math.min(100, ((overspend ? b.regularPay : b.netPayable) / total) * 100));
  const otherPct = 100 - keptPct;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full bg-emerald-600" style={{ width: `${keptPct}%` }} />
        <div className={cn("h-full", overspend ? "bg-violet-500" : "bg-amber-500")} style={{ width: `${otherPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          {overspend ? "Driver Batta Amount" : "Kept as Net Payable"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", overspend ? "bg-violet-500" : "bg-amber-500")} />
          {overspend ? "Advance overspend, added back" : "Absorbed by outstanding advance"}
        </span>
      </div>
    </div>
  );
}

export default function DriverRecordPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Defaults to a rolling one-month window — e.g. today 25-09-2026 gives
  // From 25-08-2026 / To 25-09-2026.
  const [dateFrom, setDateFrom] = useState(() => monthsBefore(todayIst(), 1));
  const [dateTo, setDateTo] = useState(() => todayIst());
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bookingTrip, setBookingTrip] = useState<Trip | null>(null);
  const [sheetTrip, setSheetTrip] = useState<Trip | null>(null);
  const [breakdownTrip, setBreakdownTrip] = useState<Trip | null>(null);

  function toggleExpanded(driverId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(driverId) ? next.delete(driverId) : next.add(driverId);
      return next;
    });
  }

  // allSettled, not all — a source failing (e.g. Trips, if ever role-gated)
  // must not blank the whole page; each keeps its last-known-good state.
  useEffect(() => {
    Promise.allSettled([driversApi.list(), tripsApi.list(), trucksApi.list(), customersApi.list()])
      .then(([d, t, tr, c]) => {
        if (d.status === "fulfilled") setDrivers(d.value);
        if (t.status === "fulfilled") setTrips(t.value);
        if (tr.status === "fulfilled") setTrucks(tr.value);
        if (c.status === "fulfilled") setCustomers(c.value);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("driver_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));

  const driverById = useMemo(() => new Map(drivers.map((d) => [d.driverId, d])), [drivers]);
  const truckById = useMemo(() => new Map(trucks.map((t) => [t.truckId, t])), [trucks]);

  const filteredDrivers = drivers.filter((d) =>
    !searchQuery ||
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.driverId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Trips in the selected date range — the set both stats are drawn from, so
  // "Total Trips" and "Salary" always describe the same trips. Left out
  // entirely (not just zeroed out of Salary) rather than shown as a "no data"
  // row: a RETURN TRIP whose batta isn't marked applicable (its pay already
  // rode along with the outbound trip, per netPayableForTrip's rule), and any
  // trip with no trip sheet yet (nothing to compute Net Payable from). ISO
  // "YYYY-MM-DD" strings compare correctly lexicographically, so no Date
  // parsing is needed.
  const tripsInRange = useMemo(() => trips.filter((t) => {
    if (!t.scheduledDate) return false;
    if (dateFrom && t.scheduledDate < dateFrom) return false;
    if (dateTo && t.scheduledDate > dateTo) return false;
    if (t.tripCategory === "RETURN TRIP" && !t.isBattaApplicable) return false;
    if (!t.hasSheet) return false;
    return true;
  }), [trips, dateFrom, dateTo]);

  // Lazy-load trip sheets for ONLY the in-range trips that have one and aren't
  // already cached — a fresh date range only ever needs to fetch the newly
  // exposed trips, not refetch everything.
  useEffect(() => {
    const toFetch = tripsInRange.filter((t) => t.hasSheet && !sheets.has(t.id));
    if (toFetch.length === 0) return;
    let cancelled = false;
    mapLimit(toFetch, 8, (t) => tripsApi.getSheet(t.id).then((sh) => ({ id: t.id, sh })).catch(() => null))
      .then((results) => {
        if (cancelled) return;
        setSheets((prev) => {
          const next = new Map(prev);
          for (const r of results) if (r?.sh) next.set(r.id, r.sh);
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [tripsInRange, sheets]);

  // Lazy-load booking-sheet closures for the "View Booking Sheet" button — same
  // pattern as the sheet fetch above, but keyed off closure existence instead.
  useEffect(() => {
    const toFetch = tripsInRange.filter((t) => t.hasClosure && !closures.has(t.id));
    if (toFetch.length === 0) return;
    let cancelled = false;
    mapLimit(toFetch, 8, (t) => tripsApi.getClosure(t.id).then((cl) => ({ id: t.id, cl })).catch(() => null))
      .then((results) => {
        if (cancelled) return;
        setClosures((prev) => {
          const next = new Map(prev);
          for (const r of results) if (r?.cl) next.set(r.id, r.cl);
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [tripsInRange, closures]);

  const tripsByDriverId = useMemo(() => {
    const map = new Map<string, Trip[]>();
    for (const t of tripsInRange) {
      const list = map.get(t.driverId);
      if (list) list.push(t); else map.set(t.driverId, [t]);
    }
    return map;
  }, [tripsInRange]);

  const tripCountByDriverId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [driverId, list] of tripsByDriverId) map.set(driverId, list.length);
    return map;
  }, [tripsByDriverId]);

  const salaryByDriverId = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tripsInRange) {
      const sheet = sheets.get(t.id);
      if (!sheet) continue;
      map.set(t.driverId, (map.get(t.driverId) ?? 0) + netPayableForTrip(t, sheet));
    }
    return map;
  }, [tripsInRange, sheets]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
          <IdCard className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Driver Record</h1>
          <p className="mt-0.5 text-sm text-gray-500">Read-only record of every driver</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by name or driver ID…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto" title="Scopes Total Trips and Salary to this date range">
          <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        </div>
      </div>

      {filteredDrivers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {drivers.length === 0 ? "No driver records yet." : "No drivers match this search."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredDrivers.map((driver) => {
            const tripCount = tripCountByDriverId.get(driver.driverId) ?? 0;
            const salaryTotal = salaryByDriverId.get(driver.driverId) ?? 0;
            const isExpanded = expandedIds.has(driver.id);
            const driverTrips = tripsByDriverId.get(driver.driverId) ?? [];
            return (
              <div
                key={driver.id}
                className="rounded-2xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:border-blue-100 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
              >
                <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6">
                  {/* Avatar + Name / Driver ID */}
                  <div className="flex min-w-0 shrink-0 items-center gap-3 lg:w-56">
                    <Avatar photoUrl={driver.photoUrl} label={driver.name} size={48} />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-gray-900">{driver.name}</p>
                      <p className="truncate text-xs text-gray-500">{driver.driverId || "—"}</p>
                    </div>
                  </div>

                  <div className="hidden h-12 w-px shrink-0 bg-gray-100 lg:block" />

                  {/* Total Trips — scoped to the selected date range */}
                  <div className="min-w-0 shrink-0 text-xs lg:w-28">
                    <p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-gray-400">
                      <Route className="h-3 w-3" /> Total Trips
                    </p>
                    <p className="mt-0.5 font-medium text-gray-700">{tripCount}</p>
                  </div>

                  <div className="hidden h-12 w-px shrink-0 bg-gray-100 lg:block" />

                  {/* Salary — scoped to the selected date range */}
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-gray-400">
                      <Wallet className="h-3 w-3" /> Salary
                    </p>
                    <p className="mt-0.5 font-medium text-gray-700">
                      ₹{salaryTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Proof docs */}
                  <div className="flex shrink-0 gap-1.5">
                    {driver.aadhaarFileName && (
                      <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600" title={driver.aadhaarFileName}>
                        <FileText className="h-3 w-3" /> Aadhaar
                      </span>
                    )}
                    {driver.licenseFileName && (
                      <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600" title={driver.licenseFileName}>
                        <FileText className="h-3 w-3" /> License
                      </span>
                    )}
                  </div>

                  {/* Expand/collapse */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(driver.id)}
                    aria-label={isExpanded ? "Collapse trip details" : "Expand trip details"}
                    aria-expanded={isExpanded}
                    className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-full border border-gray-200 text-gray-500 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 lg:self-auto"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-180")} />
                  </button>
                </div>

                {/* Expanded trip detail — every trip in the selected range, with its
                    own Net Payable, summing to the Salary figure above. */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                    {driverTrips.length === 0 ? (
                      <p className="py-3 text-center text-xs text-gray-400">No trips in this date range.</p>
                    ) : (
                      <div className="overflow-auto rounded-lg border border-gray-100">
                        <table className="w-full min-w-[560px] text-left text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Trip ID</th>
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Date</th>
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Route</th>
                              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-gray-400">Salary</th>
                              <th className="px-3 py-2 font-semibold uppercase tracking-wide text-gray-400">Documents</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {driverTrips.map((trip) => {
                              const sheet = sheets.get(trip.id);
                              const hasSalary = trip.hasSheet && sheet;
                              return (
                                <tr key={trip.id}>
                                  <td className="px-3 py-2 font-medium text-gray-800">{trip.tripId}</td>
                                  <td className="px-3 py-2 text-gray-600">{formatDate(trip.scheduledDate)}</td>
                                  <td className="px-3 py-2 text-gray-600">
                                    {trip.origin || "—"} <span className="text-gray-300">→</span> {trip.destination || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-700">
                                    {hasSalary
                                      ? `₹${netPayableForTrip(trip, sheet).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                      : <span className="text-gray-400">No sheet</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setBookingTrip(trip)}
                                        disabled={!trip.hasClosure}
                                        className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        title={trip.hasClosure ? undefined : "No booking sheet recorded for this trip"}
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        View Booking Sheet
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setSheetTrip(trip)}
                                        className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                                      >
                                        <ClipboardList className="h-3.5 w-3.5" />
                                        View Trip Sheet
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setBreakdownTrip(trip)}
                                        disabled={!hasSalary}
                                        className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        title={hasSalary ? undefined : "No trip sheet recorded for this trip"}
                                      >
                                        <Calculator className="h-3.5 w-3.5" />
                                        Salary Breakdown
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-100 bg-gray-50">
                              <td colSpan={3} className="px-3 py-2 text-right font-semibold text-gray-600">Total Salary</td>
                              <td className="px-3 py-2 text-right font-bold text-gray-900">
                                ₹{salaryTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Both dialogs are always read-only here — this page is a read-only
          driver record, never an editing surface. */}
      <BookingSheetDialog
        open={bookingTrip !== null}
        trip={bookingTrip}
        closure={bookingTrip ? closures.get(bookingTrip.id) : undefined}
        driver={bookingTrip ? driverById.get(bookingTrip.driverId) : undefined}
        truck={bookingTrip ? truckById.get(bookingTrip.vehicleId) : undefined}
        customers={customers}
        readOnly
        onClose={() => setBookingTrip(null)}
        onSubmit={() => {}}
      />
      <TripSheetDialog
        open={sheetTrip !== null}
        trip={sheetTrip}
        closure={sheetTrip ? closures.get(sheetTrip.id) : undefined}
        existingSheet={sheetTrip ? sheets.get(sheetTrip.id) : undefined}
        readOnly
        drivers={drivers}
        trucks={trucks}
        onClose={() => setSheetTrip(null)}
        onSubmit={() => {}}
      />

      {/* Salary Breakdown — shows the Net Payable formula's working for one
          trip, not just the result: a bar visual plus the exact figures. */}
      <Dialog
        open={breakdownTrip !== null}
        onClose={() => setBreakdownTrip(null)}
        title={breakdownTrip ? `Salary Breakdown — ${breakdownTrip.tripId}` : "Salary Breakdown"}
        className="sm:max-w-lg"
      >
        {breakdownTrip && (() => {
          const b = salaryBreakdownForTrip(breakdownTrip, sheets.get(breakdownTrip.id));
          return (
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-gray-500">
                Computed live from this trip&apos;s Booking Sheet and Trip Sheet — the Driver Batta Amount minus
                whatever Advance is still outstanding (Advance Given minus Expenses Incurred).
              </p>

              <SectionCard title="Trip Sheet Figures" accent="bg-slate-50 text-slate-500">
                <Row label="Driver Batta Amount" hint="from the Trip" value={money(b.regularPay)} />
                <Row label="Total Advance Given" hint="from the Trip Sheet" value={money(b.totalAdvance)} />
                <Row label="Total Driver Expenses" hint="from the Trip Sheet" value={money(b.totalExpenses)} />
              </SectionCard>

              <SectionCard title="Calculation" accent="bg-amber-50 text-amber-600">
                <Row
                  label="Outstanding Advance"
                  hint="Advance − Expenses"
                  value={money(b.outstandingAdvance)}
                  tone={outstandingTone(b.outstandingAdvance)}
                />
                <div className="py-2">
                  <p className="mb-2 text-[11px] font-medium text-gray-400">How the Batta breaks down</p>
                  <FlowBar b={b} />
                </div>
              </SectionCard>

              <div className="flex items-center justify-between rounded-lg bg-emerald-600 px-4 py-3">
                <span className="text-sm font-semibold text-emerald-100">Net Payable (Salary)</span>
                <span className="text-lg font-bold text-white">{money(b.netPayable)}</span>
              </div>

              {b.excluded && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700">
                  This is a RETURN TRIP not marked batta-applicable — its pay already rode along with the
                  outbound trip&apos;s Salary, so it&apos;s excluded from this driver&apos;s totals and won&apos;t
                  appear in the trip list above.
                </p>
              )}
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
}
