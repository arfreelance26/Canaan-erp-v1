"use client";

import Link from "next/link";
import { RiArrowRightLine as ArrowRight, RiUserFollowLine as UserCheck } from "@remixicon/react";

type Counts = { Present: number; Absent: number; "On Leave": number; "Not Marked": number };

// Static class strings so Tailwind can see them.
const SEGMENTS: { key: keyof Counts; label: string; bar: string; dot: string }[] = [
  { key: "Present", label: "Present", bar: "bg-success-solid", dot: "bg-success-solid" },
  { key: "On Leave", label: "On leave", bar: "bg-warning-solid", dot: "bg-warning-solid" },
  { key: "Absent", label: "Absent", bar: "bg-danger-solid", dot: "bg-danger-solid" },
  { key: "Not Marked", label: "Not marked", bar: "bg-fill-4", dot: "bg-fill-4" },
];

function Group({ title, total, counts }: { title: string; total: number; counts: Counts }) {
  const pct = total > 0 ? Math.round((counts.Present / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-separator-border bg-fill-1 p-4">
      <div className="flex items-center justify-between">
        <p className="text-caption-2-semibold text-text-secondary">{title}</p>
        <span className="text-[11px] text-text-tertiary">{total} total</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-display-4-semibold tabular-nums text-text-primary">{counts.Present}</span>
        <span className="text-sm text-text-secondary">of {total} present</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-caption-2-semibold tabular-nums ${
            counts.Present > 0 ? "bg-success-surface-strong text-success-text" : "bg-fill-3 text-text-secondary"
          }`}
        >
          {pct}%
        </span>
      </div>

      {/* One bar showing how the whole group splits */}
      <div
        className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-fill-3"
        role="img"
        aria-label={SEGMENTS.map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`).join(", ")}
      >
        {total > 0 &&
          SEGMENTS.map((s) =>
            counts[s.key] > 0 ? (
              <div
                key={s.key}
                className={`${s.bar} h-full transition duration-500`}
                style={{ width: `${(counts[s.key] / total) * 100}%` }}
              />
            ) : null
          )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {SEGMENTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <i className={`h-2 w-2 rounded-full ${s.dot}`} />
              {s.label}
            </span>
            <span className="font-semibold tabular-nums text-text-primary">{counts[s.key]}</span>
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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator-border bg-accent-surface/70 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
            <UserCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-body-semibold text-text-primary">Attendance Today</h2>
            <p className="text-xs text-text-secondary">{dateLabel}</p>
          </div>
        </div>
        <Link
          href="/attendance/report"
          className="group flex h-8 items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-3.5 text-caption-1-semibold text-text-primary shadow-sm transition duration-300 hover:border-accent-border-strong hover:text-accent-text hover:shadow-md"
        >
          Report
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300" />
        </Link>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Group title="Drivers" total={drivers.total} counts={drivers.counts} />
        <Group title="Staff" total={staff.total} counts={staff.counts} />
      </div>
    </div>
  );
}
