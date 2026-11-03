"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RiProfileLine as IdCard, RiFileTextLine as FileText, RiFileList3Line as ClipboardList, RiCalculatorLine as Calculator, RiRouteLine as Route, RiWallet3Line as Wallet, RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import { driversApi, tripsApi, trucksApi, customersApi } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { Avatar } from "@/components/ui/Avatar";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { TripAuditActions, TripAuditBadge } from "@/components/audit/TripAuditActions";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const BookingSheetDialog = dynamic(() => import("@/components/trips/BookingSheetDialog").then((m) => m.BookingSheetDialog));
const TripSheetDialog = dynamic(() => import("@/components/trips/TripSheetDialog").then((m) => m.TripSheetDialog));
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
  // RETURN TRIP not marked batta-applicable: its batta isn't paid (it rode
  // along with the outbound trip), but leftover advance is still deducted.
  const excluded = trip.tripCategory === "RETURN TRIP" && !trip.isBattaApplicable;
  const netPayable = (excluded ? 0 : regularPay) - outstandingAdvance;
  return { regularPay, totalAdvance, totalExpenses, outstandingAdvance, netPayable, excluded };
}

function netPayableForTrip(trip: Trip, sheet: TripSheetData | undefined): number {
  if (!sheet) return 0;
  const b = salaryBreakdownForTrip(trip, sheet);
  return b.netPayable;
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
    <section className="rounded-xl border border-separator-border bg-background-primary-default shadow-sm overflow-hidden">
      <div className={cn("flex items-center gap-2.5 border-b border-separator-border px-4 py-2.5", accent)}>
        <p className="text-caption-2-semibold text-current opacity-70">{title}</p>
      </div>
      <div className="px-4 py-1.5">{children}</div>
    </section>
  );
}

function Row({ label, hint, value, tone = "default" }: { label: string; hint?: string; value: string; tone?: "default" | "amber" | "red" | "gray" }) {
  const toneClasses: Record<string, string> = {
    default: "text-text-primary",
    amber: "text-warning-text",
    red: "text-danger-text",
    gray: "text-text-tertiary",
  };
  return (
    <div className="flex items-baseline justify-between gap-6 py-2 text-sm border-b border-separator-border last:border-0">
      <span className="shrink-0 text-text-tertiary font-medium">
        {label}
        {hint && <span className="ml-1.5 text-caption-2-regular text-text-tertiary">{hint}</span>}
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
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-fill-2">
        <div className="h-full bg-success-solid" style={{ width: `${keptPct}%` }} />
        <div className={cn("h-full", overspend ? "bg-purple-solid" : "bg-warning-solid")} style={{ width: `${otherPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-caption-2-medium text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success-solid" />
          {overspend ? "Driver Batta Amount" : "Kept as Net Payable"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", overspend ? "bg-purple-solid" : "bg-warning-solid")} />
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
  // Ids already requested (in-flight or resolved) — persists across renders so
  // an unrelated re-render (e.g. auto-refresh replacing `trips` with a new
  // array every 10s) can never re-fire a fetch that's already running or done.
  // This is what actually fixes the bug below, not the effect's dependency list.
  const requestedSheetIds = useRef<Set<string>>(new Set());
  const requestedClosureIds = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // ?search=<driver ID> — a Re-Verification notification opens its driver.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearchQuery(q);
  }, []);
  // Defaults to no range at all — Total Trips/Salary show lifetime earnings
  // until the user deliberately picks a range. tripsInRange's empty-string
  // checks already treat "" as "no bound on this side", so no other change is
  // needed to make an unset date act as lifetime.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bookingTrip, setBookingTrip] = useState<Trip | null>(null);
  const [sheetTrip, setSheetTrip] = useState<Trip | null>(null);
  const [breakdownTrip, setBreakdownTrip] = useState<Trip | null>(null);

  // Flag / Verify (TripAuditActions) hand the updated trip back — patch it in
  // for instant feedback; the "trip_updated" WS event also refetches.
  const patchTrip = (updated: Trip) => setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

  function toggleExpanded(driverId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId); else next.add(driverId);
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
    if (!t.hasSheet) return false;
    // Only trips Accounts has verified (Verify Trip dialog) reach the Auditor.
    if (t.verificationStatus !== "verified") return false;
    return true;
  }), [trips, dateFrom, dateTo]);

  // Lazy-load trip sheets for ONLY the in-range trips that have one and aren't
  // already cached — a fresh date range only ever needs to fetch the newly
  // exposed trips, not refetch everything.
  //
  // Guarded by requestedSheetIds (a ref, not state) rather than by "cancel the
  // previous run" — auto-refresh replaces `trips` (and so `tripsInRange`) with
  // a new array every ~10s even when nothing changed, which used to re-fire
  // this effect and cancel any in-flight batch before it could commit its
  // results. On a driver with enough trips to take longer than one refresh
  // cycle to fetch, that meant the fetch could restart forever and never
  // finish. Marking ids as requested synchronously, before the async call
  // starts, makes a re-run a no-op for anything already in flight or done —
  // so a slow batch is left alone to complete instead of being thrown away.
  useEffect(() => {
    const toFetch = tripsInRange.filter(
      (t) => t.hasSheet && !sheets.has(t.id) && !requestedSheetIds.current.has(t.id)
    );
    if (toFetch.length === 0) return;
    const ids = toFetch.map((t) => t.id);
    for (const id of ids) requestedSheetIds.current.add(id);
    // One bulk request (chunked) instead of one per trip.
    tripsApi.getSheetsBulk(ids)
      .then((shs) => { if (shs.size) setSheets((prev) => new Map([...prev, ...shs])); })
      // A genuine failure (network error, timeout) is allowed to retry on a
      // later pass rather than being stuck for the rest of the session — a
      // successful call that simply found no sheet is left marked done.
      .catch(() => { for (const id of ids) requestedSheetIds.current.delete(id); });
  }, [tripsInRange, sheets]);

  // Lazy-load booking-sheet closures for the "View Booking Sheet" button — same
  // pattern (and same fix) as the sheet fetch above, keyed off closure
  // existence instead.
  useEffect(() => {
    const toFetch = tripsInRange.filter(
      (t) => t.hasClosure && !closures.has(t.id) && !requestedClosureIds.current.has(t.id)
    );
    if (toFetch.length === 0) return;
    const ids = toFetch.map((t) => t.id);
    for (const id of ids) requestedClosureIds.current.add(id);
    tripsApi.getClosuresBulk(ids)
      .then((cls) => { if (cls.size) setClosures((prev) => new Map([...prev, ...cls])); })
      .catch(() => { for (const id of ids) requestedClosureIds.current.delete(id); });
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
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
          <IdCard className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Driver Based Record</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Read-only record of every driver</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by name or driver ID…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex items-center gap-2">
          {!dateFrom && !dateTo && (
            <span className="rounded-full bg-accent-surface px-2.5 py-1 text-caption-2-semibold text-accent-text">
              Showing lifetime earnings
            </span>
          )}
          <div title="Scopes Total Trips and Salary to this date range — leave blank for lifetime earnings">
            <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </div>
        </div>
      </div>

      {filteredDrivers.length === 0 ? (
        <EmptyState size="compact" illustration={drivers.length === 0 ? "logistics" : "not-found"} title={drivers.length === 0 ? "No driver records yet" : "No drivers match this search"} />
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
                className="rounded-2xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:border-accent-border hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
              >
                <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6">
                  {/* Avatar + Name / Driver ID */}
                  <div className="flex min-w-0 shrink-0 items-center gap-3 lg:w-56">
                    <Avatar photoUrl={driver.photoUrl} label={driver.name} size={48} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text-primary">{driver.name}</p>
                      <p className="truncate text-xs text-text-secondary">{driver.driverId || "—"}</p>
                    </div>
                  </div>

                  <div className="hidden h-12 w-px shrink-0 bg-fill-2 lg:block" />

                  {/* Total Trips — scoped to the selected date range */}
                  <div className="min-w-0 shrink-0 text-xs lg:w-28">
                    <p className="flex items-center gap-1 font-semibold text-text-tertiary">
                      <Route className="h-3 w-3" /> Total Trips
                    </p>
                    <p className="mt-0.5 font-medium text-text-primary">{tripCount}</p>
                  </div>

                  <div className="hidden h-12 w-px shrink-0 bg-fill-2 lg:block" />

                  {/* Salary — scoped to the selected date range */}
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="flex items-center gap-1 font-semibold text-text-tertiary">
                      <Wallet className="h-3 w-3" /> Salary
                    </p>
                    <p className="mt-0.5 font-medium text-text-primary">
                      ₹{salaryTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Proof docs */}
                  <div className="flex shrink-0 gap-1.5">
                    {driver.aadhaarFileName && (
                      <span className="flex items-center gap-1 rounded-full border border-separator-border bg-fill-1 px-2 py-1 text-caption-2-medium text-text-secondary" title={driver.aadhaarFileName}>
                        <FileText className="h-3 w-3" /> Aadhaar
                      </span>
                    )}
                    {driver.licenseFileName && (
                      <span className="flex items-center gap-1 rounded-full border border-separator-border bg-fill-1 px-2 py-1 text-caption-2-medium text-text-secondary" title={driver.licenseFileName}>
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
                    className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-full border border-separator-border text-text-secondary transition duration-200 hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text lg:self-auto"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-180")} />
                  </button>
                </div>

                {/* Expanded trip detail — every trip in the selected range, with its
                    own Net Payable, summing to the Salary figure above. */}
                {isExpanded && (
                  <div className="border-t border-separator-border px-4 pb-4 pt-3">
                    {driverTrips.length === 0 ? (
                      <p className="py-3 text-center text-xs text-text-tertiary">No trips in this date range.</p>
                    ) : (
                      <div className="overflow-auto rounded-lg border border-separator-border">
                        <table className="w-full min-w-[560px] text-left text-xs">
                          <thead>
                            <tr className="border-b border-separator-border bg-fill-1">
                              <th className="px-3 py-2 font-semibold text-text-tertiary">Trip ID</th>
                              <th className="px-3 py-2 font-semibold text-text-tertiary">Date</th>
                              <th className="px-3 py-2 font-semibold text-text-tertiary">Route</th>
                              <th className="px-3 py-2 text-right font-semibold text-text-tertiary">Salary</th>
                              <th className="px-3 py-2 font-semibold text-text-tertiary">Documents</th>
                            </tr>
                          </thead>
                          <PagedTbody className="divide-y divide-separator-border" items={driverTrips}>
                            {(trip) => {
                              const sheet = sheets.get(trip.id);
                              const hasSalary = trip.hasSheet && sheet;
                              return (
                                <tr key={trip.id}>
                                  <td className="px-3 py-2 font-medium text-text-primary">
                                    {trip.tripId}
                                    <TripAuditBadge trip={trip} />
                                  </td>
                                  <td className="px-3 py-2 text-text-secondary">{formatDate(trip.scheduledDate)}</td>
                                  <td className="px-3 py-2 text-text-secondary">
                                    {trip.origin || "—"} <span className="text-text-tertiary">→</span> {trip.destination || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-text-primary">
                                    {hasSalary
                                      ? `₹${netPayableForTrip(trip, sheet).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                      : <span className="text-text-tertiary">No sheet</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex flex-wrap gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setBookingTrip(trip)}
                                          disabled={!trip.hasClosure}
                                          className="flex items-center gap-1.5 rounded-lg border border-accent-border-strong bg-accent-surface px-2.5 py-1.5 text-caption-2-semibold text-accent-text hover:bg-accent-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                          title={trip.hasClosure ? undefined : "No booking sheet recorded for this trip"}
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          View Booking Sheet
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setSheetTrip(trip)}
                                          className="flex items-center gap-1.5 rounded-lg border border-purple-border-strong bg-purple-surface px-2.5 py-1.5 text-caption-2-semibold text-purple-text hover:bg-purple-surface-strong transition-colors"
                                        >
                                          <ClipboardList className="h-3.5 w-3.5" />
                                          View Trip Sheet
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setBreakdownTrip(trip)}
                                          disabled={!hasSalary}
                                          className="flex items-center gap-1.5 rounded-lg border border-success-border-strong bg-success-surface px-2.5 py-1.5 text-caption-2-semibold text-success-text hover:bg-success-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                          title={hasSalary ? undefined : "No trip sheet recorded for this trip"}
                                        >
                                          <Calculator className="h-3.5 w-3.5" />
                                          Salary Breakdown
                                        </button>
                                      </div>
                                      {/* Auditor decision buttons — shared with Vehicle Record. */}
                                      <TripAuditActions trip={trip} onUpdated={patchTrip} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            }}
                          </PagedTbody>
                          <tfoot>
                            <tr className="border-t border-separator-border bg-fill-1">
                              <td colSpan={3} className="px-3 py-2 text-right font-semibold text-text-secondary">Total Salary</td>
                              <td className="px-3 py-2 text-right font-semibold text-text-primary">
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
              <p className="text-sm leading-relaxed text-text-secondary">
                Computed live from this trip&apos;s Booking Sheet and Trip Sheet — the Driver Batta Amount minus
                whatever Advance is still outstanding (Advance Given minus Expenses Incurred).
              </p>

              <SectionCard title="Trip Sheet Figures" accent="bg-fill-1 text-text-secondary">
                <Row label="Driver Batta Amount" hint="from the Trip" value={money(b.regularPay)} />
                <Row label="Total Advance Given" hint="from the Trip Sheet" value={money(b.totalAdvance)} />
                <Row label="Total Driver Expenses" hint="from the Trip Sheet" value={money(b.totalExpenses)} />
              </SectionCard>

              <SectionCard title="Calculation" accent="bg-warning-surface text-warning-text">
                <Row
                  label="Outstanding Advance"
                  hint="Advance − Expenses"
                  value={money(b.outstandingAdvance)}
                  tone={outstandingTone(b.outstandingAdvance)}
                />
                <div className="py-2">
                  <p className="mb-2 text-caption-2-medium text-text-tertiary">How the Batta breaks down</p>
                  <FlowBar b={b} />
                </div>
              </SectionCard>

              <div className="flex items-center justify-between rounded-lg bg-success-solid px-4 py-3">
                <span className="text-body-semibold text-on-solid/80">Net Payable (Salary)</span>
                <span className="text-title-3-semibold text-on-solid">{money(b.netPayable)}</span>
              </div>

              {b.excluded && (
                <p className="rounded-lg border border-warning-border bg-warning-surface px-3.5 py-2.5 text-xs leading-relaxed text-warning-text">
                  This is a RETURN TRIP not marked batta-applicable — its batta already rode along with the
                  outbound trip&apos;s Salary, so it isn&apos;t paid again here. Any advance left with the driver is
                  still deducted, which is why Net Payable only reflects the outstanding advance.
                </p>
              )}
            </div>
          );
        })()}
      </Dialog>

    </div>
  );
}
