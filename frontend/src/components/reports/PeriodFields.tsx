"use client";

import { Segmented } from "@/components/ui/Segmented";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

/** The Reports Center windows' period picker: quick periods, then From / To
 *  as two labelled date fields. `allTime` adds an "All Time" choice (empty dates). */

// Local calendar dates (toISOString() is UTC and would shift IST midnights back a day).
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthsBack(n: number) {
  const d = new Date();
  return { start: toISO(new Date(d.getFullYear(), d.getMonth() - (n - 1), 1)), end: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

export const PERIOD_PRESETS = [
  { label: "This Month", fn: () => monthsBack(1) },
  { label: "Last Month", fn: () => { const n = new Date(); return { start: toISO(new Date(n.getFullYear(), n.getMonth() - 1, 1)), end: toISO(new Date(n.getFullYear(), n.getMonth(), 0)) }; } },
  { label: "Last 3 Months", fn: () => monthsBack(3) },
  { label: "Last 6 Months", fn: () => monthsBack(6) },
  { label: "This Year", fn: () => { const y = new Date().getFullYear(); return { start: `${y}-01-01`, end: `${y}-12-31` }; } },
] as const;

export const ALL_TIME = "All Time";

export function PeriodFields({
  start, end, preset, onChange, allTime = false,
}: {
  start: string;
  end: string;
  /** The highlighted quick period ("" once dates are typed). */
  preset: string;
  onChange: (next: { start: string; end: string; preset: string }) => void;
  allTime?: boolean;
}) {
  const options = [
    ...(allTime ? [{ value: ALL_TIME, label: ALL_TIME }] : []),
    ...PERIOD_PRESETS.map((p) => ({ value: p.label, label: p.label })),
  ];
  const backwards = !!start && !!end && start > end;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption-1-semibold text-text-secondary">Period</p>
      <div className="overflow-x-auto">
        <Segmented
          label="Period"
          value={preset}
          onChange={(label) => {
            if (label === ALL_TIME) return onChange({ start: "", end: "", preset: ALL_TIME });
            const p = PERIOD_PRESETS.find((x) => x.label === label);
            if (p) onChange({ ...p.fn(), preset: p.label });
          }}
          options={options}
        />
      </div>
      <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption-2-semibold text-text-tertiary">From</span>
          <DatePickerInput
            value={start}
            onChange={(v) => onChange({ start: v, end, preset: "" })}
            clearable={allTime}
            placeholder={allTime ? "Beginning" : undefined}
            maxDate={end || undefined}
            aria-label="From date"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-caption-2-semibold text-text-tertiary">To</span>
          <DatePickerInput
            value={end}
            onChange={(v) => onChange({ start, end: v, preset: "" })}
            clearable={allTime}
            placeholder={allTime ? "Today" : undefined}
            minDate={start || undefined}
            aria-label="To date"
          />
        </label>
      </div>
      {backwards && <p className="text-caption-1-regular text-danger-text">The start date is after the end date.</p>}
    </div>
  );
}
