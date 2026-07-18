"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { TripStatus } from "@/types/trip";

const STATUS_COLORS: Record<TripStatus, string> = {
  Assigned:     "#3b82f6",
  Started:      "#6366f1",
  Loaded:       "#a855f7",
  "On-Transit": "#f59e0b",
  Reached:      "#14b8a6",
  Unloaded:     "#06b6d4",
  Completed:    "#22c55e",
  Cancelled:    "#ef4444",
};

type Props = { counts: Record<TripStatus, number> };

export function TripStatusDonutChart({ counts }: Props) {
  const data = (Object.keys(counts) as TripStatus[])
    .filter((k) => counts[k] > 0)
    .map((k) => ({ name: k, value: counts[k], color: STATUS_COLORS[k] }));

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-[230px] items-center justify-center text-sm text-gray-400">
        No trip data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="43%"
          innerRadius={55}
          outerRadius={78}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [value, name]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / .05)" }}
        />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(v) => <span style={{ color: "#6b7280" }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
