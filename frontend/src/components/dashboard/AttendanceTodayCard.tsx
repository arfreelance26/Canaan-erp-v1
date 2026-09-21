"use client";

import Link from "next/link";
import { ArrowRight, UserCheck } from "lucide-react";

type Counts = { Present: number; Absent: number; "On Leave": number; "Not Marked": number };

// Static class strings so Tailwind can see them.
const SEGMENTS: { key: keyof Counts; label: string; bar: string; dot: string }[] = [
  { key: "Present", label: "Present", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "On Leave", label: "On leave", bar: "bg-amber-400", dot: "bg-amber-400" },
  { key: "Absent", label: "Absent", bar: "bg-red-400", dot: "bg-red-400" },
  { key: "Not Marked", label: "Not marked", bar: "bg-gray-300", dot: "bg-gray-300" },
];

function Group({ title, total, counts }: { title: string; total: number; counts: Counts }) {
  const pct = total > 0 ? Math.round((counts.Present / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{title}</p>
        <span className="text-[11px] text-gray-400">{total} total</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-gray-900">{counts.Present}</span>
        <span className="text-sm text-gray-500">of {total} present</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            counts.Present > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-200/70 text-gray-500"
          }`}
        >
          {pct}%
        </span>
      </div>

      {/* One bar showing how the whole group splits */}
      <div
        className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-gray-200/70"
        role="img"
        aria-label={SEGMENTS.map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`).join(", ")}
      >
        {total > 0 &&
          SEGMENTS.map((s) =>
            counts[s.key] > 0 ? (
              <div
                key={s.key}
                className={`${s.bar} h-full transition-all duration-500`}
                style={{ width: `${(counts[s.key] / total) * 100}%` }}
              />
            ) : null
          )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {SEGMENTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <i className={`h-2 w-2 rounded-full ${s.dot}`} />
              {s.label}
            </span>
            <span className="font-bold tabular-nums text-gray-800">{counts[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AttendanceTodayCard({
  dateLabel,
  drivers,
  staff,
}: {
  dateLabel: string;
  drivers: { total: number; counts: Counts };
  staff: { total: number; counts: Counts };
}) {
  return (
    <div className="dk-inset flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <UserCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Attendance Today</h2>
            <p className="text-xs text-gray-500">{dateLabel}</p>
          </div>
        </div>
        <Link
          href="/attendance/report"
          className="group flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:border-blue-300 hover:text-blue-700 hover:shadow-md"
        >
          Report
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Group title="Drivers" total={drivers.total} counts={drivers.counts} />
        <Group title="Staff" total={staff.total} counts={staff.counts} />
      </div>
    </div>
  );
}
