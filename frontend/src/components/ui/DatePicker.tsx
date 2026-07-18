"use client";

import React, { forwardRef } from "react";
import ReactDatePicker, { DatePickerProps as ReactDatePickerProps } from "react-datepicker";
import { CalendarIcon } from "lucide-react";
import "react-datepicker/dist/react-datepicker.css";
import { cn } from "@/lib/utils";

export interface DatePickerProps extends Omit<ReactDatePickerProps, "onChange" | "value"> {
  value?: Date | string | null;
  onChange: (date: Date | null) => void;
  label?: string;
  error?: string;
  className?: string;
}

export const DatePicker = forwardRef<any, DatePickerProps>(
  ({ value, onChange, label, error, className, required, ...props }, ref) => {
    // Parse ISO strings back to Date objects if needed
    const parsedDate = typeof value === "string" && value ? new Date(value) : (value as Date | null);

    return (
      <div className={cn("relative z-50 flex flex-col gap-1.5 w-full", className)}>
        {label && (
          <span className="text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </span>
        )}
        <div className="relative w-full">
          <ReactDatePicker
            ref={ref}
            selected={parsedDate}
            onChange={(date: any) => onChange(date)}
            className={cn(
              "peer w-full rounded-xl border bg-white px-4 py-2.5 pl-11 text-sm font-medium text-slate-800 shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-all duration-300 placeholder:text-slate-400 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] focus:border-[#D4AF37] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/10",
              error ? "border-red-300 focus:border-red-500 focus:ring-red-500/10" : "border-gray-200"
            )}
            dateFormat="dd-MM-yyyy"
            showPopperArrow={false}
            calendarClassName="canaan-calendar"
            {...(props as any)}
            shouldCloseOnSelect={true}
          />
          <CalendarIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-[#D4AF37]" />
        </div>
        {error && <span className="text-xs text-red-500 mt-1">{error}</span>}
      </div>
    );
  }
);

DatePicker.displayName = "DatePicker";
