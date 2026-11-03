"use client";

import { cx } from "@/utils/cx";

type Option<T extends string> = {
  value: T;
  label: string;
  /** Small count after the label. */
  count?: number;
  /** Tailwind background class for a leading status dot, e.g. "bg-success-solid". */
  dot?: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  /** "sm" inside cards, "md" in page toolbars (40px, matches inputs). */
  size?: "sm" | "md";
};

/** Segmented control: a quiet well with the selected segment raised on it. */
export function Segmented<T extends string>({ value, onChange, options, label, size = "sm" }: Props<T>) {
  const md = size === "md";
  return (
    <div
      role="group"
      aria-label={label}
      className={cx("seg-track flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-lg p-0.5", md && "min-h-10 rounded-[10px] p-1")}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cx(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              md ? "h-8 px-3.5 text-body-medium" : "h-7 px-2.5 text-caption-1-medium",
              active ? "seg-thumb text-text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {o.dot && <span className={cx("size-1.5 rounded-full", o.dot)} />}
            {o.label}
            {o.count !== undefined && (
              <span className={cx("font-mono text-caption-1-regular tabular-nums", active ? "text-text-secondary" : "text-text-tertiary")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
