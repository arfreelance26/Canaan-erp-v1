"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type Props = { onTrip: number; available: number };

export function FleetUtilizationChart({ onTrip, available }: Props) {
  const total = onTrip + available;
  const pct = total > 0 ? Math.round((onTrip / total) * 100) : 0;

  const data = [
    { name: "On Trip", value: onTrip, color: "#3b82f6" },
    { name: "Available", value: available, color: "#22c55e" },
  ].filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <div className="flex h-[230px] items-center justify-center text-sm text-gray-400">
        No fleet data
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={195}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={84}
            paddingAngle={3}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} trucks`, name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / .05)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ top: 0, height: 195 }}>
        <p className="text-2xl font-bold text-gray-900">{pct}%</p>
        <p className="text-xs text-gray-400">Utilized</p>
      </div>
      <div className="mt-1 flex justify-center gap-5">
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          On Trip ({onTrip})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Available ({available})
        </span>
      </div>
    </div>
  );
}
