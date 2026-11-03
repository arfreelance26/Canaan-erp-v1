"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
} from "recharts";
import type { Trip } from "@/types/trip";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState } from "@/components/ui/EmptyState";

type Range = "1w" | "15d" | "1m" | "6m" | "1y";
type Point = { period: string; Total: number; Completed: number; Open: number };

const RANGES: { value: Range; label: string }[] = [
  { value: "1w", label: "1 week" },
  { value: "15d", label: "15 days" },
  { value: "1m", label: "1 month" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "1 year" },
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

// Token colours: recharts takes CSS variables, so the chart flips with the theme.
const C = {
  done: "var(--color-accent-500)",
  open: "var(--color-fill-4)",
  grid: "var(--color-separator-border)",
  tick: "var(--color-text-tertiary)",
  paper: "var(--color-background-primary-default)",
};

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string; value?: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const done = payload.find((p) => p.dataKey === "Completed")?.value ?? 0;
  const open = payload.find((p) => p.dataKey === "Open")?.value ?? 0;
  const total = done + open;
  return (
    <div className="min-w-[168px] rounded-xl border border-separator-border bg-background-primary-default px-3 py-2.5 text-caption-1-regular text-text-primary shadow-lg">
      <p className="mb-1.5 text-caption-1-medium">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-text-secondary"><i className="size-2 rounded-full" style={{ background: C.done }} />Completed</span>
        <span className="tabular-nums">{done}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-text-secondary"><i className="size-2 rounded-full" style={{ background: C.open }} />Not completed</span>
        <span className="tabular-nums">{open}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-separator-border pt-1.5">
        <span className="text-text-tertiary">Total{total > 0 ? ` · ${Math.round((done / total) * 100)}% done` : ""}</span>
        <span className="tabular-nums">{total}</span>
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
    <section className="overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-headline-medium text-text-primary">Trip trend</h2>
          <p className="text-body-regular text-text-secondary">Trips scheduled and completed</p>
        </div>
        <Segmented label="Time range" value={range} onChange={setRange} options={RANGES} />
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-caption-1-regular text-text-tertiary">Scheduled</dt>
              <dd className="text-title-2-medium tabular-nums text-text-primary">{stats.total}</dd>
            </div>
            <div>
              <dt className="text-caption-1-regular text-text-tertiary">Completed</dt>
              <dd className="text-title-2-medium tabular-nums text-text-primary">
                {stats.done}
                <span className="ml-1.5 text-body-regular text-text-tertiary">{stats.pct}%</span>
              </dd>
            </div>
            {hasData && stats.peak && (
              <div>
                <dt className="text-caption-1-regular text-text-tertiary">Busiest</dt>
                <dd className="text-title-2-medium tabular-nums text-text-primary">
                  {stats.peak.Total}
                  <span className="ml-1.5 text-body-regular text-text-tertiary">{stats.peak.period}</span>
                </dd>
              </div>
            )}
          </dl>
          <div className="flex items-center gap-4 text-caption-1-regular text-text-secondary">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: C.done }} />Completed</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: C.open }} />Not completed</span>
          </div>
        </div>

        {!hasData ? (
          <EmptyState size="compact" illustration="no-data" title="No trips in this period" description="Pick a longer range to see the trend" className="h-[260px]" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="4 4" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: C.tick, fontFamily: "var(--font-mono-source)" }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                interval={range === "1m" ? 3 : "preserveStartEnd"}
              />
              <YAxis
                tick={{ fontSize: 11, fill: C.tick, fontFamily: "var(--font-mono-source)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickMargin={4}
                ticks={ticks}
                domain={[0, ticks[ticks.length - 1]]}
              />
              <Tooltip
                cursor={{ stroke: C.tick, strokeWidth: 1, strokeDasharray: "4 4" }}
                content={<TrendTooltip />}
              />
              {/* Stacked: the full height is the total, the split is how much got completed. */}
              <Area
                type="monotone"
                dataKey="Completed"
                stackId="trips"
                stroke={C.done}
                strokeWidth={2}
                fill={C.done}
                fillOpacity={0.14}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: C.paper, fill: C.done }}
              />
              <Area
                type="monotone"
                dataKey="Open"
                stackId="trips"
                stroke="none"
                fill={C.open}
                fillOpacity={0.6}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: C.paper, fill: C.tick }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
