"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Cell,
} from "recharts";

type Props = {
  emiTotal: number;
  recurringTotal: number;
  salaryTotal: number;
  advanceTotal: number;
};

function fmtAxis(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

export function FinanceBreakdownChart({ emiTotal, recurringTotal, salaryTotal, advanceTotal }: Props) {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const gridColor    = isDark ? "#2d3660" : "#e5e7eb";
  const tickColor    = isDark ? "#4d5e7a" : "#9ca3af";
  const tooltipBg    = isDark ? "#141929" : "#ffffff";
  const tooltipBorder = isDark ? "#2d3660" : "#e5e7eb";
  const tooltipText  = isDark ? "#edf3fb" : "#111827";
  const cursorFill   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  const data = [
    { name: "EMI",       value: emiTotal,       color: "#8b5cf6" },
    { name: "Recurring", value: recurringTotal,  color: "#3b82f6" },
    { name: "Salaries",  value: salaryTotal,     color: "#22c55e" },
    { name: "Advances",  value: advanceTotal,    color: "#f59e0b" },
  ];

  const allZero = data.every((d) => d.value === 0);

  if (allZero) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-gray-400">
        No financial data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: tickColor }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: tickColor }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtAxis}
        />
        <Tooltip
          cursor={{ fill: cursorFill }}
          formatter={(value) => [
            `₹${Math.round(Number(value)).toLocaleString("en-IN")}`,
            "Amount",
          ]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: `1px solid ${tooltipBorder}`,
            backgroundColor: tooltipBg,
            color: tooltipText,
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / .2)",
          }}
          labelStyle={{ color: tooltipText, fontWeight: 600 }}
          itemStyle={{ color: tooltipText }}
        />
        <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={72}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
