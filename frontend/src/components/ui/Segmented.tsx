"use client";

type Option<T extends string> = {
  value: T;
  label: string;
  /** Small count chip after the label. */
  count?: number;
  /** Tailwind background class for a leading colour dot. */
  dot?: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  /** "sm" for cards, "md" for page-level toolbars (matches the 40px pill height). */
  size?: "sm" | "md";
};

/** Pill-shaped segmented control (the `dk-seg` classes keep it visible in dark mode). */
export function Segmented<T extends string>({ value, onChange, options, label, size = "sm" }: Props<T>) {
  const md = size === "md";
  return (
    <div
      role="group"
      aria-label={label}
      className={`dk-seg flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-full ${md ? "min-h-10 p-1" : "p-0.5"}`}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors duration-150 ${
              md ? "h-8 px-4 text-[13px]" : "px-2.5 py-1 text-[11px]"
            } ${active ? "dk-seg-active text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {o.dot && <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} />}
            {o.label}
            {o.count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                  active ? "bg-blue-100 text-blue-700" : "bg-gray-200/70 text-gray-500"
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
