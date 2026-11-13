"use client";

import { inputClass } from "@/components/ui/Field";

/**
 * "Only these (optional)" — narrows a Reports Center report to what matches,
 * the same as its page's search box (the server matches "contains"). Empty =
 * everything. `hint` is the line under it, e.g. "Type the full Trip ID for
 * just one trip".
 */
export function OnlyTheseField({ value, onChange, placeholder, hint }: {
  value: string;
  onChange: (v: string) => void;
  /** What can be typed, e.g. "Trip ID, truck or driver". */
  placeholder: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption-2-semibold text-text-tertiary">Only these (optional)</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        placeholder={`${placeholder}, or leave empty for all`}
        className={inputClass}
      />
      {hint && <span className="text-caption-1-regular text-text-tertiary">{hint}</span>}
    </label>
  );
}
