"use client";
import ReactDatePicker from "react-datepicker";
import { forwardRef } from "react";
import { CalendarDays, X } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Overrides the default "DD-MM-YYYY" placeholder. */
  placeholder?: string;
  /** date-fns display format; defaults to "dd-MM-yyyy". */
  dateFormat?: string;
  /** Show a ✕ that empties the date. On by default for every optional date
   *  (not required, not disabled); pass false where a date must stay set
   *  (e.g. a page's "day being shown" picker). */
  clearable?: boolean;
};

function toDate(iso: string): Date | null {
  if (!iso || iso.length < 10) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y as number, (m as number) - 1, d as number);
  return isNaN(dt.getTime()) ? null : dt;
}

function toISO(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

type TriggerProps = React.InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void };

const TriggerInput = forwardRef<HTMLInputElement, TriggerProps>(
  ({ value, onClick, onChange, placeholder, required, disabled, onClear }, ref) => (
    <div
      onClick={disabled ? undefined : onClick}
      className={`relative flex w-full items-center rounded-lg border-2 border-brand-gold bg-white/80 px-3 py-2 backdrop-blur-sm transition-all duration-200 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer focus-within:bg-white dark:focus-within:bg-gray-100 focus-within:shadow-[0_0_0_4px_rgba(201,162,39,0.2)] hover:bg-white/90"}`}
    >
      <input
        ref={ref}
        type="text"
        value={value ?? ""}
        onChange={onChange}
        readOnly
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`w-full bg-transparent text-sm uppercase text-gray-900 outline-none placeholder:normal-case placeholder:text-gray-400 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      />
      {onClear && value && !disabled && (
        <button
          type="button"
          aria-label="Clear date"
          title="Clear date"
          // Don't let the click reach the wrapper (it would open the calendar).
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <CalendarDays className="ml-2 h-4 w-4 shrink-0 text-brand-gold" />
    </div>
  )
);
TriggerInput.displayName = "TriggerInput";

export function DatePickerInput({ value, onChange, required, disabled, placeholder, dateFormat = "dd-MM-yyyy", clearable }: Props) {
  const canClear = clearable ?? (!required && !disabled);
  return (
    <ReactDatePicker
      selected={toDate(value)}
      onChange={(date: Date | null) => onChange(date ? toISO(date) : "")}
      dateFormat={dateFormat}
      placeholderText={placeholder ?? "DD-MM-YYYY"}
      disabled={disabled}
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      popperPlacement="bottom-start"
      portalId="datepicker-portal"
      calendarClassName="canaan-calendar"
      wrapperClassName="w-full"
      customInput={<TriggerInput required={required} disabled={disabled} onClear={canClear ? () => onChange("") : undefined} />}
    />
  );
}
