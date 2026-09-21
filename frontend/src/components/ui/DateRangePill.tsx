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
export function DateRangePill({
  from,
  to,
  onFromChange,
  onToChange,
  fromPlaceholder = "From",
  toPlaceholder = "To",
}: Props) {
  return (
    <div className="flex h-10 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 shadow-sm transition-transform duration-300 hover:scale-105 hover:shadow-md dark:border-gray-300/30 dark:bg-gray-200 [&_.border-brand-gold]:!border-0 [&_.border-brand-gold]:!bg-transparent [&_.border-brand-gold]:!px-1 [&_.border-brand-gold]:!py-1 [&_.border-brand-gold]:!shadow-none [&_.border-brand-gold_svg]:!text-gray-500">
      <div className="w-[112px]">
        <DatePickerInput value={from} onChange={onFromChange} placeholder={fromPlaceholder} />
      </div>
      <span className="text-xs text-gray-300">–</span>
      <div className="w-[112px]">
        <DatePickerInput value={to} onChange={onToChange} placeholder={toPlaceholder} />
      </div>
    </div>
  );
}
