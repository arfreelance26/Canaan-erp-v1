"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { RiCalendarLine, RiCloseLine } from "@remixicon/react";
import { QuickCalendar } from "@/components/ui/QuickCalendar";
import { cx } from "@/utils/cx";

type Props = {
  /** ISO "YYYY-MM-DD", or "" for no date. */
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Accepted for older call sites, which pass plain-input styling here; the
   *  field draws its own frame, so this is not applied (as before). */
  className?: string;
  /** Overrides the default "DD-MM-YYYY" placeholder. */
  placeholder?: string;
  /** date-fns display format; defaults to "dd-MM-yyyy". */
  dateFormat?: string;
  /** Show a ✕ that empties the date. On by default for every optional date
   *  (not required, not disabled); pass false where a date must stay set
   *  (e.g. a page's "day being shown" picker). */
  clearable?: boolean;
  /** Earliest / latest day that can be picked (ISO). */
  minDate?: string;
  maxDate?: string;
  /** "field" — a full-width form field; "bare" — no frame, for use inside
   *  another control (DateRangePill). */
  variant?: "field" | "bare";
  "aria-label"?: string;
};

function toCalendarDate(iso: string | undefined): CalendarDate | null {
  if (!iso || iso.length < 10) return null;
  try {
    return parseDate(iso.slice(0, 10));
  } catch {
    return null;
  }
}

/**
 * The app's date field: a trigger that shows the date as DD-MM-YYYY and opens
 * the calendar (components/ui/QuickCalendar.tsx): one click picks a day, month
 * and year dropdowns jump to far-off dates (birthdays, expiry years), and
 * Today / Clear / typing a date sit at its foot. The value in and out stays an
 * ISO "YYYY-MM-DD" string, so every form keeps working unchanged.
 */
export function DatePickerInput({
  value,
  onChange,
  required,
  disabled,
  placeholder,
  dateFormat = "dd-MM-yyyy",
  clearable,
  minDate,
  maxDate,
  variant = "field",
  "aria-label": ariaLabel,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const date = toCalendarDate(value);
  const allowClear = clearable ?? (!required && !disabled);
  const canClear = allowClear && Boolean(date);
  const shown = date ? format(new Date(date.year, date.month - 1, date.day), dateFormat) : "";
  const bare = variant === "bare";

  return (
    <div className="relative flex w-full min-w-0 items-center">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder ?? "Date"}
        aria-required={required || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex w-full min-w-0 items-center gap-2 text-start outline-none transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-not-allowed disabled:opacity-60",
          bare
            ? "h-8 rounded-md px-1 hover:text-text-primary"
            : cx(
                "h-10 rounded-xl border bg-background-primary-default px-3 shadow-xs hover:border-border-button-hover",
                open ? "border-accent-border-strong" : "border-border-button-default",
              ),
          canClear && "pe-8",
        )}
      >
        {!bare && <RiCalendarLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />}
        <span className={cx("min-w-0 flex-1 truncate text-body-regular tabular-nums", shown ? "text-text-primary" : "text-text-placeholder")}>
          {shown || (placeholder ?? "DD-MM-YYYY")}
        </span>
        {bare && <RiCalendarLine className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />}
      </button>

      {canClear && !disabled && (
        <button
          type="button"
          aria-label="Clear date"
          title="Clear date"
          onClick={() => onChange("")}
          className="absolute end-2 flex size-6 items-center justify-center rounded-full text-foreground-icon-tertiary outline-none transition-colors hover:bg-danger-surface-strong hover:text-danger-text focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiCloseLine className="size-4" />
        </button>
      )}

      {/* Keeps native form validation for required dates: an empty required
          field still blocks submit, as the old input did. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      )}

      <QuickCalendar
        triggerRef={triggerRef}
        isOpen={open}
        onOpenChange={setOpen}
        value={date}
        onChange={(next) => onChange(next ? next.toString() : "")}
        minValue={toCalendarDate(minDate)}
        maxValue={toCalendarDate(maxDate)}
        clearable={allowClear}
        aria-label={ariaLabel ?? placeholder ?? "Date"}
      />
    </div>
  );
}
