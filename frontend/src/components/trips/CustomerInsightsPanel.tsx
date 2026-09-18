"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Gauge, Loader2, Truck as TruckIcon, User, Wallet } from "lucide-react";
import { tripsApi, trucksApi, financeApi, type CustomerTopProfitableTrip, type TruckCostPerKmRanking } from "@/lib/api";
import type { CompensationTransaction } from "@/types/compensation";
import { formatDate } from "@/lib/format-date";

type Props = {
  customerId: string;
  route: string;
};

function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const TABS = [
  { id: "trips",   label: "Profitable Trips" },
  { id: "trucks",  label: "Profitable Trucks" },
  { id: "drivers", label: "Profitable Drivers" },
  { id: "cost",    label: "Cost Effective Trucks" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Companion panel for the Assign Trip dialog — appears once both a customer
 * and a route are picked. Shows (1) this customer's most profitable past
 * trips, naming the driver + truck that achieved them, and (2) the fleet's
 * cheapest-to-run trucks by Cost/Km, as a "would be most profitable to
 * assign" suggestion. Both come from dedicated backend endpoints — see
 * routers/trips.py's get_customer_top_profitable_trips and
 * routers/trucks.py's get_cost_per_km_ranking.
 */
export function CustomerInsightsPanel({ customerId, route }: Props) {
  const [tab, setTab] = useState<TabId>("trips");
  const activeIndex = TABS.findIndex((t) => t.id === tab);
  const [trips, setTrips] = useState<CustomerTopProfitableTrip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [ranking, setRanking] = useState<TruckCostPerKmRanking[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [driverCompTx, setDriverCompTx] = useState<CompensationTransaction[]>([]);

  useEffect(() => {
    if (!customerId) return;
    setTripsLoading(true);
    tripsApi.getCustomerTopProfitableTrips(customerId, route || undefined)
      .then(setTrips)
      .catch(() => setTrips([]))
      .finally(() => setTripsLoading(false));
  }, [customerId, route]);

  useEffect(() => {
    setRankingLoading(true);
    trucksApi.getCostPerKmRanking()
      .then((r) => setRanking(r.slice(0, 5)))
      .catch(() => setRanking([]))
      .finally(() => setRankingLoading(false));
  }, []);

  // All driver compensation (Advance + Salary) payouts — used to derive
  // "Earnings this month" per driver in the Profitable Drivers tab, so a
  // Commercial Manager can see who's already been paid out this month
  // before deciding who to assign next.
  useEffect(() => {
    financeApi.listDriverCompensation()
      .then(setDriverCompTx)
      .catch(() => setDriverCompTx([]));
  }, []);

  // Keyed by personName (a snapshot on the transaction, matching the
  // driver_name already resolved on each trip — there's no driver DB id in
  // scope here to join on instead).
  const monthlyEarningsByDriver = useMemo(() => {
    const now = new Date();
    const map = new Map<string, number>();
    for (const tx of driverCompTx) {
      const d = new Date(tx.date);
      if (isNaN(d.getTime()) || d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
      const key = tx.personName || "—";
      map.set(key, (map.get(key) ?? 0) + tx.amount);
    }
    return map;
  }, [driverCompTx]);

  // "Profitable Trucks" — derived from the same route-scoped trips already
  // fetched for "Profitable Trips" above, grouped by truck. Ranked by AVERAGE
  // profit per trip rather than total profit, so a truck that's simply been
  // assigned more often doesn't automatically outrank one that's genuinely
  // more profitable per run. Trip count + average margin shown alongside so
  // a single lucky trip is visibly distinguishable from a consistent performer.
  const truckStats = useMemo(() => {
    const map = new Map<string, { tripCount: number; totalProfit: number; totalMarginPct: number }>();
    for (const t of trips) {
      const key = t.truck_registration || "—";
      const entry = map.get(key) ?? { tripCount: 0, totalProfit: 0, totalMarginPct: 0 };
      entry.tripCount += 1;
      entry.totalProfit += t.profit;
      entry.totalMarginPct += t.margin_pct;
      map.set(key, entry);
    }
    return [...map.entries()]
      .map(([truckRegistration, e]) => ({
        truckRegistration,
        tripCount: e.tripCount,
        totalProfit: e.totalProfit,
        avgProfitPerTrip: e.totalProfit / e.tripCount,
        avgMarginPct: e.totalMarginPct / e.tripCount,
      }))
      .sort((a, b) => b.avgProfitPerTrip - a.avgProfitPerTrip);
  }, [trips]);

  // "Profitable Drivers" — same idea as truckStats, grouped by driver instead.
  const driverStats = useMemo(() => {
    const map = new Map<string, { tripCount: number; totalProfit: number; totalMarginPct: number }>();
    for (const t of trips) {
      const key = t.driver_name || "—";
      const entry = map.get(key) ?? { tripCount: 0, totalProfit: 0, totalMarginPct: 0 };
      entry.tripCount += 1;
      entry.totalProfit += t.profit;
      entry.totalMarginPct += t.margin_pct;
      map.set(key, entry);
    }
    return [...map.entries()]
      .map(([driverName, e]) => ({
        driverName,
        tripCount: e.tripCount,
        totalProfit: e.totalProfit,
        avgProfitPerTrip: e.totalProfit / e.tripCount,
        avgMarginPct: e.totalMarginPct / e.tripCount,
      }))
      .sort((a, b) => b.avgProfitPerTrip - a.avgProfitPerTrip);
  }, [trips]);

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
      <div className="shrink-0 border-b border-gray-100 bg-gray-50/60 px-4 py-3.5">
        <p className="text-sm font-bold text-gray-900">Customer Insights</p>
        <p className="mt-0.5 truncate text-[11px] text-gray-400">Route: {route}</p>
      </div>

      {/* Sliding tab selector */}
      <div className="relative mx-4 mt-3 flex shrink-0 rounded-full border border-gray-200 bg-gray-100 p-1">
        <span
          className="absolute inset-y-1 left-1 rounded-full bg-blue-600 shadow-sm transition-transform duration-200 ease-out"
          style={{ width: `calc(25% - 2px)`, transform: `translateX(${activeIndex * 100}%)` }}
        />
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            title={t.label}
            className={`relative z-10 flex-1 rounded-full px-1 py-2 text-[9px] font-bold leading-tight transition-colors ${
              tab === t.id ? "text-white" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {/* Profitable Trips */}
        {tab === "trips" && (
        <div className="px-4 py-3.5">
          {tripsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
            </div>
          ) : trips.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-center text-[11px] text-gray-400">
              No completed trips for this customer{route ? " on this route" : ""} yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {trips.map((t, i) => (
                <div key={t.trip_id} className="flex gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-[11px] font-bold text-amber-600">
                    #{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold text-gray-500">{t.trip_id_str}</span>
                      <span className="shrink-0 text-sm font-bold text-emerald-700">{fmtCurrency(t.profit)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                        <User className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="truncate font-medium">{t.driver_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                        <TruckIcon className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="truncate font-medium">{t.truck_registration}</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[10px] text-gray-400">
                      {t.date ? formatDate(t.date) : "—"} · {t.margin_pct.toFixed(0)}% margin · {t.km.toLocaleString("en-IN")} km
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Profitable Trucks — trucks that ran this customer's route, ranked
            by average profit per trip (not total, so volume alone can't win) */}
        {tab === "trucks" && (
        <div className="px-4 py-3.5">
          {tripsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
            </div>
          ) : truckStats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-center text-[11px] text-gray-400">
              No completed trips for this customer{route ? " on this route" : ""} yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {truckStats.map((s, i) => (
                <div key={s.truckRegistration} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[11px] font-bold text-emerald-600">
                    #{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-gray-900">{s.truckRegistration}</p>
                    <p className="truncate text-[10px] text-gray-400">
                      {s.tripCount} trip{s.tripCount !== 1 ? "s" : ""} · {s.avgMarginPct.toFixed(0)}% avg margin
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] font-bold text-emerald-700">{fmtCurrency(s.avgProfitPerTrip)}</p>
                    <p className="text-[9px] text-gray-400">avg / trip</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Profitable Drivers — drivers who ran this customer's route, ranked
            by average profit per trip (not total, so volume alone can't win) */}
        {tab === "drivers" && (
        <div className="px-4 py-3.5">
          {tripsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
            </div>
          ) : driverStats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-center text-[11px] text-gray-400">
              No completed trips for this customer{route ? " on this route" : ""} yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {driverStats.map((s, i) => (
                <div key={s.driverName} className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-[11px] font-bold text-violet-600">
                      #{i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-gray-900">{s.driverName}</p>
                      <p className="truncate text-[10px] text-gray-400">
                        {s.tripCount} trip{s.tripCount !== 1 ? "s" : ""} · {s.avgMarginPct.toFixed(0)}% avg margin
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[12px] font-bold text-emerald-700">{fmtCurrency(s.avgProfitPerTrip)}</p>
                      <p className="text-[9px] text-gray-400">avg / trip</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 border-t border-gray-100 pt-2 text-[11px] text-gray-600">
                    <Wallet className="h-3 w-3 shrink-0 text-gray-400" />
                    <span>Earnings this month:</span>
                    <span className="font-semibold text-gray-800">
                      {monthlyEarningsByDriver.has(s.driverName) ? fmtCurrency(monthlyEarningsByDriver.get(s.driverName)!) : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Cost Effective Trucks — ranked by operating-efficiency cost/km
            (fuel + AdBlue + tyre + maintenance). EMI and compliance are
            financing/legal costs, not efficiency, so they're excluded from
            the ranking metric and shown only as part of the total below. */}
        {tab === "cost" && (
        <div className="px-4 py-3.5">
          <div className="mb-3 flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-blue-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Lowest Cost/Km (Efficiency)</p>
          </div>
          {rankingLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
            </div>
          ) : ranking.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-center text-[11px] text-gray-400">
              Not enough fleet cost data configured yet (fuel, maintenance, tyre) to rank trucks.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {ranking.map((r, i) => (
                <div key={r.truck_db_id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-bold text-blue-600">
                    #{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-gray-900">{r.registration_number}</p>
                    <p className="truncate text-[10px] text-gray-400">{r.manufacturer} · total incl. EMI/compliance: ₹{(r.total_cost_per_km ?? 0).toFixed(2)}/km</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-right">
                    <TrendingUp className="h-3 w-3 text-blue-500" />
                    <span className="text-[12px] font-bold text-blue-700">₹{(r.efficiency_cost_per_km ?? r.total_cost_per_km ?? 0).toFixed(2)}/km</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
