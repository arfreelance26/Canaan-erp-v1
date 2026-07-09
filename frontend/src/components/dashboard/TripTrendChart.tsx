"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
} from "recharts";
import type { Trip } from "@/types/trip";

type Range = "1w" | "15d" | "1m" | "6m" | "1y";

const RANGES: { key: Range; label: string }[] = [
  { key: "1w",  label: "1 Week"   },
  { key: "15d", label: "15 Days"  },
  { key: "1m",  label: "1 Month"  },
  { key: "6m",  label: "6 Months" },
  { key: "1y",  label: "1 Year"   },
];

function buildDailyBuckets(days: number): { key: string; label: string }[] {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
    result.push({ key, label });
  }
  return result;
}

function buildMonthlyBuckets(months: number): { key: string; label: string }[] {
  const result = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "2-digit" });
    result.push({ key, label });
  }
  return result;
}

function buildData(trips: Trip[], range: Range) {
  if (range === "1w") {
    return buildDailyBuckets(7).map(({ key, label }) => {
      const dayTrips = trips.filter((t) => t.scheduledDate?.startsWith(key));
      return { period: label, Total: dayTrips.length, Completed: dayTrips.filter((t) => t.status === "Completed").length };
    });
  }
  if (range === "15d") {
    return buildDailyBuckets(15).map(({ key, label }) => {
      const dayTrips = trips.filter((t) => t.scheduledDate?.startsWith(key));
      return { period: label, Total: dayTrips.length, Completed: dayTrips.filter((t) => t.status === "Completed").length };
    });
  }
  if (range === "1m") {
    return buildDailyBuckets(30).map(({ key, label }) => {
      const dayTrips = trips.filter((t) => t.scheduledDate?.startsWith(key));
      return { period: label, Total: dayTrips.length, Completed: dayTrips.filter((t) => t.status === "Completed").length };
    });
  }
  if (range === "6m") {
    return buildMonthlyBuckets(6).map(({ key, label }) => {
      const monthTrips = trips.filter((t) => t.scheduledDate?.startsWith(key));
      return { period: label, Total: monthTrips.length, Completed: monthTrips.filter((t) => t.status === "Completed").length };
    });
  }
  // 1y
  return buildMonthlyBuckets(12).map(({ key, label }) => {
    const monthTrips = trips.filter((t) => t.scheduledDate?.startsWith(key));
    return { period: label, Total: monthTrips.length, Completed: monthTrips.filter((t) => t.status === "Completed").length };
  });
}

type Props = { trips: Trip[] };

export function TripTrendChart({ trips }: Props) {
  const [range, setRange] = useState<Range>("6m");

  const data = buildData(trips, range);
  const hasData = data.some((d) => d.Total > 0);

  return (
    <div>
      {/* Range selector */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              range === r.key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <div className="flex h-[230px] items-center justify-center text-sm text-gray-400">
          No trip history yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              interval={range === "1m" ? 4 : "preserveStartEnd"}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / .05)" }}
            />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v) => <span style={{ color: "#6b7280" }}>{v}</span>}
            />
            <Line type="monotone" dataKey="Total" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2, fill: "#3b82f6" }} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="Completed" stroke="#22c55e" strokeWidth={2} dot={{ r: 2, fill: "#22c55e" }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
