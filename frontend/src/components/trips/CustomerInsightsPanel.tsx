"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Gauge, Info, Loader2, Truck as TruckIcon, User, Users, Wallet } from "lucide-react";
import {
  tripsApi, financeApi,
  type RouteInsights, type RouteInsightTrip, type RouteInsightRank, type ProfitLevel,
} from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type Props = {
  customerId: string;
  route: string;
  /** The picked route's id — trips linked to it count as "this route" even if
   * it was renamed or shares its name with another route. */
  routeId?: string | null;
  /** Extra classes for the outer card — e.g. a fixed height when used on a full page (Trip Planner). */
  className?: string;
};

function fmtCurrency(n: number): string {
  return `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const TABS = [
  { id: "trips",   label: "Profitable Trips" },
  { id: "trucks",  label: "Profitable Trucks" },
  { id: "drivers", label: "Profitable Drivers" },
  { id: "cost",    label: "Cost Effective Trucks" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// Rows shown per section before "Show all".
const SHOW_N = 5;

const STATUS_STYLE: Record<string, string> = {
  "Available": "bg-emerald-50 text-emerald-700",
  "On a trip": "bg-amber-50 text-amber-700",
  "No driver": "bg-gray-100 text-gray-600",
};

function Section({ title, count, note, children }: { title: string; count: number; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {title} <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">{count}</span>
      </p>
      {note}
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-center text-[11px] text-gray-400">{children}</p>
  );
}

function OtherCustomersNote({ origin, destination }: { origin: string; destination: string }) {
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2 text-[10px] leading-relaxed text-blue-800">
      <Users className="mt-0.5 h-3 w-3 shrink-0" />
      <span>From <span className="font-semibold">other customers</span>&apos; trips on the same road ({origin} → {destination}) — shown for comparison, not this customer&apos;s own history.</span>
    </p>
  );
}

function ShowAll<T>({ rows, render }: { rows: T[]; render: (row: T, i: number) => ReactNode }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOW_N);
  return (
    <>
      {shown.map(render)}
      {rows.length > SHOW_N && (
        <button type="button" onClick={() => setAll((a) => !a)} className="self-start text-[11px] font-semibold text-blue-600 hover:underline">
          {all ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}

// Profit is shown as a colour, not money (only Admin also sees ₹) — see the
// backend's profit_level. Fixed hex colours so they read the same in both themes.
const LEVELS: Record<ProfitLevel, { label: string; badge: string; edge: string; rule: string }> = {
  top:        { label: "Top profit",    badge: "bg-[#047857] text-white",     edge: "border-l-[#047857]", rule: "margin 40% or more" },
  strong:     { label: "Strong profit", badge: "bg-[#10b981] text-white",     edge: "border-l-[#10b981]", rule: "margin 25–40%" },
  good:       { label: "Good profit",   badge: "bg-[#6ee7b7] text-[#064e3b]", edge: "border-l-[#6ee7b7]", rule: "margin 10–25%" },
  thin:       { label: "Thin profit",   badge: "bg-[#d1fae5] text-[#065f46]", edge: "border-l-[#a7f3d0]", rule: "margin under 10%" },
  zero:       { label: "Break-even",    badge: "bg-[#3b82f6] text-white",     edge: "border-l-[#3b82f6]", rule: "₹0" },
  small_loss: { label: "Small loss",    badge: "bg-[#fbbf24] text-[#78350f]", edge: "border-l-[#fbbf24]", rule: "loss under ₹500" },
  mid_loss:   { label: "Medium loss",   badge: "bg-[#f97316] text-white",     edge: "border-l-[#f97316]", rule: "loss ₹500 – ₹2,500" },
  big_loss:   { label: "Big loss",      badge: "bg-[#dc2626] text-white",     edge: "border-l-[#dc2626]", rule: "loss over ₹2,500" },
};

const COST_BAND: Record<"low" | "mid" | "high", { label: string; cls: string }> = {
  low:  { label: "Cheapest to run", cls: "bg-[#d1fae5] text-[#065f46]" },
  mid:  { label: "Average to run",  cls: "bg-[#e0e7ff] text-[#3730a3]" },
  high: { label: "Costly to run",   cls: "bg-[#ffedd5] text-[#9a3412]" },
};

function LevelBadge({ level, prefix }: { level: ProfitLevel | null; prefix?: string }) {
  if (!level) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500" title="No Advanced-mode Cost/KM (with diesel) for this truck yet">
        Not enough data
      </span>
    );
  }
  const l = LEVELS[level];
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold", l.badge)} title={l.rule}>
      {prefix}{l.label}
    </span>
  );
}

// The colour key, grouped so each row fits on one line in the narrow panel.
const KEY_GROUPS: { title: string; levels: ProfitLevel[] }[] = [
  { title: "Profit · by margin", levels: ["top", "strong", "good", "thin"] },
  { title: "Break-even", levels: ["zero"] },
  { title: "Loss · by amount", levels: ["small_loss", "mid_loss", "big_loss"] },
];
const KEY_RULE: Record<ProfitLevel, string> = {
  top: "40% +", strong: "25 – 40%", good: "10 – 25%", thin: "under 10%",
  zero: "₹0", small_loss: "under ₹500", mid_loss: "₹500 – ₹2,500", big_loss: "over ₹2,500",
};

function ColourKey() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-gray-700">
        <span className="flex gap-0.5">
          {(Object.keys(LEVELS) as ProfitLevel[]).map((k) => (
            <span key={k} className={cn("h-2 w-2 rounded-full", LEVELS[k].badge.split(" ")[0])} />
          ))}
        </span>
        Colour key
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          {KEY_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">{g.title}</p>
              <div className="flex flex-col gap-1">
                {g.levels.map((k) => (
                  <div key={k} className="flex items-center gap-2 text-[11px]">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", LEVELS[k].badge.split(" ")[0])} />
                    <span className="whitespace-nowrap font-semibold text-gray-700">{LEVELS[k].label}</span>
                    <span className="ml-auto whitespace-nowrap tabular-nums text-gray-400">{KEY_RULE[k]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TripCard({ t, i, showCustomer }: { t: RouteInsightTrip; i: number; showCustomer?: boolean }) {
  // Admin only: the money behind the colour.
  const how = t.final_profit != null && t.cost_per_km != null && t.revenue != null && t.trip_expense != null
    ? `Hire ${fmtCurrency(t.revenue)} − Trip Expenses ${fmtCurrency(t.trip_expense)} − ${t.km.toLocaleString("en-IN")} km × ₹${t.cost_per_km.toFixed(2)}/km`
    : undefined;
  return (
    <div className={cn("flex gap-3 rounded-xl border border-l-4 border-gray-200 bg-white px-3.5 py-3", t.profit_level && LEVELS[t.profit_level].edge)} title={how}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-[11px] font-bold text-amber-600">#{i + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-semibold text-gray-500">{t.trip_id_str}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {t.final_profit != null && (
              <span className={cn("text-xs font-bold", t.final_profit >= 0 ? "text-emerald-700" : "text-red-600")}>{fmtCurrency(t.final_profit)}</span>
            )}
            <LevelBadge level={t.profit_level} />
          </span>
        </div>
        {showCustomer && t.customer_name && <p className="mt-0.5 truncate text-[10px] font-medium text-blue-700">{t.customer_name}</p>}
        <div className="mt-1.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <User className="h-3 w-3 shrink-0 text-gray-400" />
            <span className="truncate font-medium">{t.driver_name}</span>
            {t.driver_left && <span className="rounded bg-gray-100 px-1 text-[9px] font-semibold text-gray-500">Left</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <TruckIcon className="h-3 w-3 shrink-0 text-gray-400" />
            <span className="truncate font-medium">{t.truck_registration}</span>
            {t.truck_removed && <span className="rounded bg-gray-100 px-1 text-[9px] font-semibold text-gray-500">{t.truck_removed}</span>}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-gray-400">
          {t.date ? formatDate(t.date) : "—"}
          {t.margin_pct != null && ` · ${t.margin_pct.toFixed(0)}% margin`}
          {` · ${t.km.toLocaleString("en-IN")} km`}
        </p>
      </div>
    </div>
  );
}

function RankCard({ s, i, tone, extra }: { s: RouteInsightRank; i: number; tone: "emerald" | "violet"; extra?: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-l-4 border-gray-200 bg-white px-3.5 py-3", s.profit_level && LEVELS[s.profit_level].edge)}>
      <div className="flex items-center gap-3">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold",
          tone === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-violet-50 text-violet-600")}>#{i + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-gray-900">{s.name}</p>
          <p className="truncate text-[10px] text-gray-400">
            {s.trip_count} trip{s.trip_count !== 1 ? "s" : ""}
            {s.profit_trips > 0 && <span className="text-emerald-600"> · {s.profit_trips} profit</span>}
            {s.loss_trips > 0 && <span className="text-red-500"> · {s.loss_trips} loss</span>}
            {s.avg_margin_pct != null && ` · ${s.avg_margin_pct.toFixed(0)}% avg margin`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <LevelBadge level={s.profit_level} />
          <p className="text-[9px] text-gray-400">
            {s.avg_profit != null && <span className={cn("font-bold", s.avg_profit >= 0 ? "text-emerald-700" : "text-red-600")}>{fmtCurrency(s.avg_profit)} </span>}
            avg / trip
          </p>
        </div>
      </div>
      {extra}
    </div>
  );
}

/**
 * Customer Insights — the Assign Trip dialog's side panel and Insights → Trip
 * Planner. Every profit is FINAL PROFIT in the Running Cost Calculator's
 * Advanced mode (Hire − Trip Expenses − KM × Cost/KM), the same as
 * Profitability's last column. This customer's own history on the route comes
 * first; other customers' trips on the same road follow, clearly labelled.
 * Built by the backend's get_route_insights.
 */
export function CustomerInsightsPanel({ customerId, route, routeId, className }: Props) {
  const [tab, setTab] = useState<TabId>("trips");
  const activeIndex = TABS.findIndex((t) => t.id === tab);
  const [data, setData] = useState<RouteInsights | null>(null);
  const [loading, setLoading] = useState(true);
  // Total Net Payable this month, keyed by driver_id. null = the lookup failed.
  const [monthlyNetByDriver, setMonthlyNetByDriver] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    tripsApi.getRouteInsights(customerId, routeId, route || undefined)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [customerId, route, routeId]);

  const driverIds = useMemo(() => {
    if (!data) return [];
    return [...new Set([...data.drivers.this_route, ...data.drivers.other_customers].map((d) => d.id))];
  }, [data]);

  // Only fetched while the Drivers tab is open.
  useEffect(() => {
    if (tab !== "drivers") return;
    const missing = driverIds.filter((id) => !(id in monthlyNetByDriver));
    if (missing.length === 0) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    financeApi.driverMonthlyNetPayable(month, missing)
      .then((totals) => setMonthlyNetByDriver((prev) => ({ ...prev, ...Object.fromEntries(missing.map((id) => [id, totals[id] ?? 0])) })))
      .catch(() => setMonthlyNetByDriver((prev) => ({ ...prev, ...Object.fromEntries(missing.map((id) => [id, null])) })));
  }, [tab, driverIds, monthlyNetByDriver]);

  const r = data?.route;
  const noOwnHistory = "No trips for this customer on this route yet.";

  return (
    <div className={cn("flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl", className)}>
      <div className="shrink-0 border-b border-gray-100 bg-gray-50/60 px-4 py-3.5">
        <p className="text-sm font-bold text-gray-900">Customer Insights</p>
        <p className="mt-0.5 truncate text-[11px] text-gray-400">Route: {r && r.origin ? `${r.origin} → ${r.destination}` : route}</p>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500" title="Each colour is the trip's Final Profit — after trip expenses, diesel and the truck's running costs (Advanced mode)">
          <Info className="h-3 w-3 text-gray-400" /> Colour = how profitable, after all costs
        </p>
        <ColourKey />
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
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
          </div>
        ) : !data ? (
          <div className="px-4 py-3.5"><Empty>Couldn&apos;t load insights for this route.</Empty></div>
        ) : (
          <div className="flex flex-col gap-5 px-4 py-3.5">
            {/* Profitable Trips */}
            {tab === "trips" && (
              <>
                <Section title="This customer · this route" count={data.trips.this_route.length}>
                  {data.trips.this_route.length === 0 ? <Empty>{noOwnHistory}</Empty>
                    : <ShowAll rows={data.trips.this_route} render={(t, i) => <TripCard key={t.trip_id} t={t} i={i} />} />}
                </Section>
                {data.trips.other_customers.length > 0 && (
                  <Section title="Same route · other customers" count={data.trips.other_customers.length}
                    note={<OtherCustomersNote origin={data.route.origin} destination={data.route.destination} />}>
                    <ShowAll rows={data.trips.other_customers} render={(t, i) => <TripCard key={t.trip_id} t={t} i={i} showCustomer />} />
                  </Section>
                )}
                {data.trips.other_routes.length > 0 && (
                  <Section title="This customer · other routes" count={data.trips.other_routes.length}
                    note={<p className="text-[10px] text-gray-400">Different roads — for reference only.</p>}>
                    <ShowAll rows={data.trips.other_routes} render={(t, i) => (
                      <div key={t.trip_id}>
                        <p className="mb-1 truncate text-[10px] font-medium text-gray-500">{t.origin} → {t.destination}</p>
                        <TripCard t={t} i={i} />
                      </div>
                    )} />
                  </Section>
                )}
              </>
            )}

            {/* Profitable Trucks / Drivers — average Final Profit over every trip on this route */}
            {(tab === "trucks" || tab === "drivers") && (() => {
              const group = tab === "trucks" ? data.trucks : data.drivers;
              const tone = tab === "trucks" ? "emerald" : "violet";
              const extra = (s: RouteInsightRank) => tab !== "drivers" ? undefined : (
                <div className="mt-2 flex items-center gap-1.5 border-t border-gray-100 pt-2 text-[11px] text-gray-600">
                  <Wallet className="h-3 w-3 shrink-0 text-gray-400" />
                  <span>Net payable this month:</span>
                  <span className="font-semibold text-gray-800">
                    {!(s.id in monthlyNetByDriver) ? "…" : monthlyNetByDriver[s.id] === null ? "—" : fmtCurrency(monthlyNetByDriver[s.id] as number)}
                  </span>
                </div>
              );
              return (
                <>
                  <p className="text-[10px] leading-relaxed text-gray-400">
                    Ranked by average profit per trip over <span className="font-semibold">all</span> their trips on this route; the colour is that average.
                    {tab === "trucks" ? " Sold or removed trucks aren't recommended." : " Drivers who've left aren't recommended."}
                  </p>
                  <Section title="This customer · this route" count={group.this_route.length}>
                    {group.this_route.length === 0 ? <Empty>{noOwnHistory}</Empty>
                      : <ShowAll rows={group.this_route} render={(s, i) => <RankCard key={s.id} s={s} i={i} tone={tone} extra={extra(s)} />} />}
                  </Section>
                  {group.other_customers.length > 0 && (
                    <Section title="Same route · other customers" count={group.other_customers.length}
                      note={<OtherCustomersNote origin={data.route.origin} destination={data.route.destination} />}>
                      <ShowAll rows={group.other_customers} render={(s, i) => <RankCard key={s.id} s={s} i={i} tone={tone} extra={extra(s)} />} />
                    </Section>
                  )}
                  {group.this_route.length === 0 && group.other_customers.length === 0 && (
                    <Empty>No one has run this route yet.</Empty>
                  )}
                </>
              );
            })()}

            {/* Cost Effective Trucks — the fleet by Cost/KM, with an estimate for this route */}
            {tab === "cost" && (
              <>
                <div className="flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-blue-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Cheapest to run first · Advanced</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[10px] leading-relaxed text-gray-600">
                  {r?.est_km ? (
                    <>
                      This route: <span className="font-semibold" title={r.km_source ?? ""}>~{r.est_km.toLocaleString("en-IN")} km</span>
                      {r.est_hire != null && <> · hire <span className="font-semibold" title={r.hire_source ?? ""}>{fmtCurrency(r.est_hire)}</span></>}
                      {r.est_expense != null && <> · trip expenses ~<span className="font-semibold" title={r.expense_source ?? ""}>{fmtCurrency(r.est_expense)}</span></>}
                      <p className="mt-0.5 text-gray-400">The colour is each truck&apos;s estimated result on this route, after all costs.</p>
                    </>
                  ) : "No distance known for this route yet, so only Cost/KM is shown."}
                </div>
                {data.cost_trucks.length === 0 ? (
                  <Empty>No truck has an Advanced-mode Cost/KM with diesel yet.</Empty>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <ShowAll rows={data.cost_trucks} render={(c, i) => (
                      <div key={c.truck_id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-bold text-blue-600">#{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-gray-900">
                            {c.registration_number}
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", STATUS_STYLE[c.status])}>{c.status}</span>
                          </p>
                          <p className="truncate text-[10px] text-gray-400">
                            {c.driver_name ? c.driver_name : c.manufacturer}
                            {c.est_cost != null && ` · run cost ${fmtCurrency(c.est_cost)}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {c.cost_per_km != null ? (
                            <p className="text-[12px] font-bold text-blue-700">₹{c.cost_per_km.toFixed(2)}/km</p>
                          ) : (
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", COST_BAND[c.cost_band].cls)}>{COST_BAND[c.cost_band].label}</span>
                          )}
                          {r?.est_km != null && r.est_hire != null && (
                            <LevelBadge level={c.profit_level} prefix="Est. " />
                          )}
                          {c.est_profit != null && (
                            <p className={cn("text-[10px] font-semibold", c.est_profit >= 0 ? "text-emerald-600" : "text-red-600")}>
                              {fmtCurrency(c.est_profit)}
                            </p>
                          )}
                        </div>
                      </div>
                    )} />
                  </div>
                )}
                {data.trucks_without_cost > 0 && (
                  <p className="text-[10px] text-gray-400">
                    {data.trucks_without_cost} truck{data.trucks_without_cost !== 1 ? "s aren't" : " isn't"} listed — no Advanced-mode Cost/KM with diesel (no fuel logs yet).
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
