"use client";

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

const BARS = [
  { key: "emi",       label: "EMI",       color: "#8b5cf6" },
  { key: "recurring", label: "Recurring", color: "#3b82f6" },
  { key: "salaries",  label: "Salaries",  color: "#22c55e" },
  { key: "advances",  label: "Advances",  color: "#f59e0b" },
];

export function FinanceBreakdownChart({ emiTotal, recurringTotal, salaryTotal, advanceTotal }: Props) {
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
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtAxis}
        />
        <Tooltip
          formatter={(value) => [
            `₹${Math.round(Number(value)).toLocaleString("en-IN")}`,
            "Amount",
          ]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / .05)" }}
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
