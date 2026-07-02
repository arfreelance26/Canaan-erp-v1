"use client";

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

function getLast6Months(): { key: string; label: string }[] {
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    result.push({ key, label });
  }
  return result;
}

type Props = { trips: Trip[] };

export function TripTrendChart({ trips }: Props) {
  const months = getLast6Months();

  const data = months.map(({ key, label }) => {
    const monthTrips = trips.filter((t) => t.scheduledDate?.startsWith(key));
    return {
      month: label,
      Total: monthTrips.length,
      Completed: monthTrips.filter((t) => t.status === "Completed").length,
    };
  });

  const hasData = data.some((d) => d.Total > 0);

  if (!hasData) {
    return (
      <div className="flex h-[230px] items-center justify-center text-sm text-gray-400">
        No trip history yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
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
        <Line type="monotone" dataKey="Total" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="Completed" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: "#22c55e" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
