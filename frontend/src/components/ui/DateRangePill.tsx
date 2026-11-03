"use client";

import { DatePickerInput } from "@/components/ui/DatePickerInput";

type Props = {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  fromPlaceholder?: string;
  toPlaceholder?: string;
};

// Standard "From – To" date range control: one pill holding two frameless
// ("bare") date pickers. No clear (✕) button: each date has only 112px.
export function DateRangePill({
  from,
  to,
  onFromChange,
  onToChange,
  fromPlaceholder = "From",
  toPlaceholder = "To",
}: Props) {
  return (
    <div className="flex h-10 items-center gap-1 rounded-full border border-border-button-default bg-background-primary-default px-3 shadow-xs transition-colors hover:border-border-button-hover">
      <div className="w-[112px]">
        <DatePickerInput value={from} onChange={onFromChange} placeholder={fromPlaceholder} clearable={false} variant="bare" aria-label="From date" />
      </div>
      <span className="text-xs text-text-tertiary">–</span>
      <div className="w-[112px]">
        <DatePickerInput value={to} onChange={onToChange} placeholder={toPlaceholder} clearable={false} variant="bare" aria-label="To date" />
      </div>
    </div>
  );
}
