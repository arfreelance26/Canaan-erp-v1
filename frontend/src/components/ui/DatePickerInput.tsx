"use client";
import ReactDatePicker from "react-datepicker";
import { forwardRef } from "react";
import { CalendarDays } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
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

const TriggerInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ value, onClick, onChange, placeholder, required, disabled }, ref) => (
    <div className="relative flex w-full items-center rounded-lg border border-gray-200 bg-white/80 px-3 py-2 backdrop-blur-sm transition-all duration-200 focus-within:border-blue-500 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(27,43,94,0.1)] hover:border-gray-300 hover:bg-white/90">
      <input
        ref={ref}
        type="text"
        value={value ?? ""}
        onClick={onClick}
        onChange={onChange}
        readOnly
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full cursor-pointer bg-transparent text-sm uppercase text-gray-900 outline-none placeholder:normal-case placeholder:text-gray-400"
      />
      <CalendarDays className="pointer-events-none ml-2 h-4 w-4 shrink-0 text-blue-400" />
    </div>
  )
);
TriggerInput.displayName = "TriggerInput";

export function DatePickerInput({ value, onChange, required, disabled }: Props) {
  return (
    <ReactDatePicker
      selected={toDate(value)}
      onChange={(date: Date | null) => onChange(date ? toISO(date) : "")}
      dateFormat="dd-MM-yyyy"
      placeholderText="DD-MM-YYYY"
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      popperPlacement="bottom-start"
      portalId="datepicker-portal"
      calendarClassName="canaan-calendar"
      wrapperClassName="w-full"
      customInput={<TriggerInput required={required} disabled={disabled} />}
    />
  );
}
