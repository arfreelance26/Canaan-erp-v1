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

// Standard "From – To" date range control: one minimal pill that lifts on hover.
// The picker triggers keep their calendar icon but lose the default gold frame.
// No clear (✕) button: the pill is only 112px per date and the ✕ cut the date off.
export function DateRangePill({
  from,
  to,
  onFromChange,
  onToChange,
  fromPlaceholder = "From",
  toPlaceholder = "To",
}: Props) {
  return (
    <div className="flex h-10 items-center gap-1 rounded-full border border-separator-border bg-background-primary-default px-3 shadow-sm transition-transform duration-300 hover:shadow-md [&_.border-gold-solid]:!border-0 [&_.border-gold-solid]:!bg-transparent [&_.border-gold-solid]:!px-1 [&_.border-gold-solid]:!py-1 [&_.border-gold-solid]:!shadow-none [&_.border-brand-gold_svg]:!text-text-secondary">
      <div className="w-[112px]">
        <DatePickerInput value={from} onChange={onFromChange} placeholder={fromPlaceholder} clearable={false} />
      </div>
      <span className="text-xs text-text-tertiary">–</span>
      <div className="w-[112px]">
        <DatePickerInput value={to} onChange={onToChange} placeholder={toPlaceholder} clearable={false} />
      </div>
    </div>
  );
}
