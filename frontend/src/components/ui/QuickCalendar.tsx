"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Calendar, Dialog, Popover, useLocale } from "react-aria-components";
import { getLocalTimeZone, today as todayIn, type CalendarDate } from "@internationalized/date";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { MonthPanel, popoverClassName } from "@/components/base/date-picker/shared";
import { useDismissOnOutsidePress } from "@/utils/use-dismiss-on-outside-press";
import { cx } from "@/utils/cx";

type Props = {
  triggerRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  value: CalendarDate | null;
  /** Called with the picked day (or null for Clear); the calendar closes. */
  onChange: (date: CalendarDate | null) => void;
  minValue?: CalendarDate | null;
  maxValue?: CalendarDate | null;
  /** Show the Clear button (optional dates only). */
  clearable?: boolean;
  "aria-label"?: string;
};

const selectClass = cx(
  "h-8 cursor-pointer appearance-none rounded-lg border border-border-button-default bg-background-primary-default py-0 pl-2.5 pr-7",
  "text-body-medium text-text-primary outline-none transition-colors hover:border-border-button-hover",
  "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
  // A small chevron drawn in the text colour, so it follows the theme.
  "bg-[length:14px_14px] bg-[position:right_8px_center] bg-no-repeat",
);
const chevron = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888'%3E%3Cpath d='M12 15.6 6.4 10l1.4-1.4 4.2 4.2 4.2-4.2 1.4 1.4z'/%3E%3C/svg%3E\")";

const navButton = cx(
  "flex size-8 shrink-0 items-center justify-center rounded-lg text-text-secondary outline-none transition-colors",
  "hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:opacity-40",
);
const footButton = cx(
  "rounded-lg px-2.5 py-1.5 text-caption-1-semibold outline-none transition-colors",
  "focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-not-allowed disabled:opacity-40",
);

/** "15-08-2026", "15/8/2026" or "15.08.2026" → a date, else null. */
function parseTyped(text: string): CalendarDate | null {
  const m = text.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  try {
    const date = todayIn(getLocalTimeZone()).set({ year: y, month: mo, day: d });
    return date.day === d && date.month === mo ? date : null;
  } catch {
    return null;
  }
}

/**
 * The app's calendar, in the classic shape people asked for: click a day and
 * it's picked (no Apply step); month and year dropdowns to jump straight to
 * a birth year or an expiry date; ‹ › for the next or previous month; Today
 * and Clear at the foot; or type a date. Built from the kit's own calendar
 * pieces (React Aria `Calendar`, the shared day grid and popover surface),
 * so it follows the theme in light and dark.
 */
export function QuickCalendar({ triggerRef, isOpen, onOpenChange, value, onChange, minValue, maxValue, clearable, "aria-label": ariaLabel = "Date" }: Props) {
  const { locale } = useLocale();
  const popoverRef = useRef<HTMLElement>(null);
  const now = todayIn(getLocalTimeZone());

  // The month on show, driven by the dropdowns and arrows; reset to the
  // chosen date (or today) every time the calendar opens.
  const [focused, setFocused] = useState<CalendarDate>(value ?? now);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (isOpen) {
      setFocused(value ?? (maxValue && now.compare(maxValue) > 0 ? maxValue : minValue && now.compare(minValue) < 0 ? minValue : now));
      setTyped("");
    }
    // Reset on opening only.
  }, [isOpen]);

  useDismissOnOutsidePress(isOpen, () => onOpenChange(false), [triggerRef, popoverRef]);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2026, i, 1))),
    [locale],
  );
  // Years from 1940 (birth dates) to 15 years ahead (expiry dates), widened
  // to any min/max the field sets, and narrowed to it when there's one.
  const firstYear = minValue?.year ?? Math.min(1940, now.year);
  const lastYear = maxValue?.year ?? Math.max(now.year + 15, value?.year ?? 0);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i);

  const pick = (date: CalendarDate | null) => {
    onChange(date);
    onOpenChange(false);
    (triggerRef.current as HTMLElement | null)?.focus();
  };
  const inRange = (d: CalendarDate) => (!minValue || d.compare(minValue) >= 0) && (!maxValue || d.compare(maxValue) <= 0);
  const typedDate = parseTyped(typed);
  const typedOk = typedDate !== null && inRange(typedDate);

  return (
    <Popover
      ref={popoverRef}
      triggerRef={triggerRef}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      offset={6}
      placement="bottom start"
      isNonModal
      className={popoverClassName}
    >
      <Dialog aria-label={ariaLabel} className="outline-none">
        <Calendar
          aria-label={ariaLabel}
          value={value}
          onChange={pick}
          focusedValue={focused}
          onFocusChange={setFocused}
          minValue={minValue ?? undefined}
          maxValue={maxValue ?? undefined}
        >
          <div className="flex w-[318px] flex-col gap-3 p-3">
            {/* ‹ Month Year › */}
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Previous month" className={navButton} onClick={() => setFocused((f) => f.subtract({ months: 1 }))}>
                <RiArrowLeftSLine className="size-5" />
              </button>
              <select
                aria-label="Month"
                value={focused.month}
                onChange={(e) => setFocused((f) => f.set({ month: Number(e.target.value) }))}
                className={cx(selectClass, "min-w-0 flex-1")}
                style={{ backgroundImage: chevron }}
              >
                {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select
                aria-label="Year"
                value={focused.year}
                onChange={(e) => setFocused((f) => f.set({ year: Number(e.target.value) }))}
                className={cx(selectClass, "w-[88px] tabular-nums")}
                style={{ backgroundImage: chevron }}
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <button type="button" aria-label="Next month" className={navButton} onClick={() => setFocused((f) => f.add({ months: 1 }))}>
                <RiArrowRightSLine className="size-5" />
              </button>
            </div>

            {/* The days: one click picks. */}
            <div className="rounded-2xl bg-background-primary-default p-3 shadow-xs">
              <MonthPanel offset={0} hideHeader bare showToday />
            </div>

            {/* Type a date, or Today / Clear. */}
            <div className="flex items-center gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typedOk) {
                    e.preventDefault();
                    pick(typedDate);
                  }
                }}
                placeholder="Type DD-MM-YYYY"
                aria-label="Type a date"
                aria-invalid={typed !== "" && !typedOk}
                className={cx(
                  "h-8 min-w-0 flex-1 rounded-lg border bg-background-primary-default px-2.5 text-body-regular tabular-nums text-text-primary outline-none",
                  "placeholder:text-text-placeholder focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  typed !== "" && !typedOk ? "border-danger-border-strong" : "border-border-button-default",
                )}
              />
              {typed !== "" ? (
                <button type="button" disabled={!typedOk} onClick={() => typedDate && pick(typedDate)} className={cx(footButton, "bg-accent-solid text-on-solid hover:bg-accent-solid-hover")}>
                  Set
                </button>
              ) : (
                <>
                  <button type="button" disabled={!inRange(now)} onClick={() => pick(now)} className={cx(footButton, "text-accent-text hover:bg-accent-surface")}>
                    Today
                  </button>
                  {clearable && value && (
                    <button type="button" onClick={() => pick(null)} className={cx(footButton, "text-text-secondary hover:bg-fill-2")}>
                      Clear
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </Calendar>
      </Dialog>
    </Popover>
  );
}
