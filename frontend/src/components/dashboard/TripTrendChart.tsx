"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
} from "recharts";
import { Activity } from "lucide-react";
import type { Trip } from "@/types/trip";
import { Segmented } from "@/components/ui/Segmented";

type Range = "1w" | "15d" | "1m" | "6m" | "1y";
type Point = { period: string; Total: number; Completed: number; Open: number };

const RANGES: { value: Range; label: string }[] = [
  { value: "1w", label: "1 Week" },
  { value: "15d", label: "15 Days" },
  { value: "1m", label: "1 Month" },
  { value: "6m", label: "6 Months" },
  { value: "1y", label: "1 Year" },
];

// Local calendar date (not toISOString, which is UTC and shifts the day for IST mornings).
const localKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function buildDailyBuckets(days: number): { key: string; label: string }[] {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push({ key: localKey(d), label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
  }
  return result;
}

function buildMonthlyBuckets(months: number): { key: string; label: string }[] {
  const result = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    result.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    });
  }
  return result;
}

function buildData(trips: Trip[], range: Range): Point[] {
  const buckets =
    range === "1w" ? buildDailyBuckets(7)
    : range === "15d" ? buildDailyBuckets(15)
    : range === "1m" ? buildDailyBuckets(30)
    : range === "6m" ? buildMonthlyBuckets(6)
    : buildMonthlyBuckets(12);
  return buckets.map(({ key, label }) => {
    const inBucket = trips.filter((t) => t.status !== "Cancelled" && t.scheduledDate?.startsWith(key));
    const completed = inBucket.filter((t) => t.status === "Completed").length;
    return { period: label, Total: inBucket.length, Completed: completed, Open: inBucket.length - completed };
  });
}

function TrendTooltip({ active, payload, label, isDark }: { active?: boolean; payload?: { dataKey?: string; value?: number }[]; label?: string; isDark: boolean }) {
  if (!active || !payload?.length) return null;
  const done = payload.find((p) => p.dataKey === "Completed")?.value ?? 0;
  const open = payload.find((p) => p.dataKey === "Open")?.value ?? 0;
  const total = done + open;
  const line = isDark ? "#2d3660" : "#e5e7eb";
  return (
    <div
      className="min-w-[160px] rounded-xl border px-3 py-2.5 text-xs shadow-lg"
      style={{ background: isDark ? "#141929" : "#ffffff", borderColor: line, color: isDark ? "#edf3fb" : "#111827" }}
    >
      <p className="mb-1.5 font-semibold">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "#10b981" }} />Completed</span>
        <span className="font-bold tabular-nums">{done}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "#6366f1" }} />Not completed</span>
        <span className="font-bold tabular-nums">{open}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t pt-1.5" style={{ borderColor: line }}>
        <span className="opacity-70">Total{total > 0 ? ` · ${Math.round((done / total) * 100)}% done` : ""}</span>
        <span className="font-bold tabular-nums">{total}</span>
      </div>
    </div>
  );
}

/** Round a maximum up to a "nice" number so four even gridlines land on friendly values. */
function niceTicks(max: number): number[] {
  const raw = Math.max(1, max) / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return [0, 1, 2, 3, 4].map((i) => i * step);
}

type Props = { trips: Trip[] };

export function TripTrendChart({ trips }: Props) {
  const [range, setRange] = useState<Range>("1w");
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const gridColor = isDark ? "rgba(120,140,200,0.14)" : "rgba(120,135,180,0.18)";
  const tickColor = isDark ? "#7d92b0" : "#8b93a7";
  const openColor = isDark ? "#818cf8" : "#6366f1";
  const doneColor = isDark ? "#34d399" : "#10b981";

  const data = useMemo(() => buildData(trips, range), [trips, range]);
  const hasData = data.some((d) => d.Total > 0);
  const ticks = useMemo(() => niceTicks(Math.max(0, ...data.map((d) => d.Total))), [data]);

  const stats = useMemo(() => {
    const total = data.reduce((a, d) => a + d.Total, 0);
    const done = data.reduce((a, d) => a + d.Completed, 0);
    const peak = data.reduce((best, d) => (d.Total > best.Total ? d : best), data[0]);
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0, peak };
  }, [data]);

  return (
    <div className="dk-inset overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50/70 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Trip Trend</h2>
            <p className="text-xs text-gray-500">Trips scheduled vs completed over time</p>
          </div>
        </div>
        <Segmented label="Time range" value={range} onChange={setRange} options={RANGES} />
      </div>

      <div className="p-4">
        {/* Key numbers + legend */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Scheduled</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{stats.total}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Completed</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">
                {stats.done}
                <span className="ml-1.5 text-xs font-semibold text-gray-500">{stats.pct}%</span>
              </p>
            </div>
            {hasData && stats.peak && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Busiest</p>
                <p className="text-lg font-bold tabular-nums text-gray-900">
                  {stats.peak.Total}
                  <span className="ml-1.5 text-xs font-semibold text-gray-500">{stats.peak.period}</span>
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: doneColor }} />Completed</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: openColor }} />Not completed</span>
          </div>
        </div>

        {!hasData ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            <Activity className="h-6 w-6 text-gray-300" />
            No trips scheduled in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="tt-open" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={openColor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={openColor} stopOpacity={0.12} />
                </linearGradient>
                <linearGradient id="tt-done" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={doneColor} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={doneColor} stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="4 4" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: tickColor }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                interval={range === "1m" ? 3 : "preserveStartEnd"}
              />
              <YAxis
                tick={{ fontSize: 11, fill: tickColor }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickMargin={4}
                ticks={ticks}
                domain={[0, ticks[ticks.length - 1]]}
              />
              <Tooltip
                cursor={{ stroke: isDark ? "#4d5e7a" : "#c7cbe0", strokeWidth: 1, strokeDasharray: "4 4" }}
                content={<TrendTooltip isDark={isDark} />}
              />
              {/* Stacked: the full height is the total, the split is how much got completed. */}
              <Area
                type="monotone"
                dataKey="Completed"
                stackId="trips"
                stroke={doneColor}
                strokeWidth={2.5}
                fill="url(#tt-done)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: isDark ? "#141929" : "#ffffff", fill: doneColor }}
              />
              <Area
                type="monotone"
                dataKey="Open"
                stackId="trips"
                stroke="none"
                fill="url(#tt-open)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: isDark ? "#141929" : "#ffffff", fill: openColor }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
