import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface GlassComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function GlassCombobox({
  value,
  onChange,
  options,
  placeholder = "Select or type...",
  disabled = false,
  required = false,
  className,
}: GlassComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(value.toLowerCase()) ||
    opt.value.toLowerCase().includes(value.toLowerCase())
  );

  const displayOptions = filteredOptions.length > 0 ? filteredOptions : options;

  return (
    <div className={cn("relative w-full text-[14px]", className)} ref={containerRef}>
      <div
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-white/60 px-3 py-2 text-left shadow-[0_2px_10px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all duration-300 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-400 focus-within:bg-white",
          disabled ? "cursor-not-allowed opacity-60 bg-gray-50/50" : "hover:bg-white/80 hover:shadow-md hover:border-blue-200/80",
          isOpen ? "border-blue-400 bg-white shadow-md ring-4 ring-blue-500/10" : "border-gray-200"
        )}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          className="w-full bg-transparent text-gray-900 font-medium placeholder:text-gray-400 placeholder:normal-case focus:outline-none disabled:cursor-not-allowed uppercase"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) {
              setIsOpen(!isOpen);
              if (!isOpen) inputRef.current?.focus();
            }
          }}
          className="focus:outline-none"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300",
              isOpen ? "rotate-180 text-blue-500" : ""
            )}
          />
        </button>
      </div>

      {isOpen && displayOptions.length > 0 && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[100] max-h-60 w-full overflow-y-auto rounded-xl border border-white/60 bg-white/80 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl animate-dropdown duration-200 custom-scrollbar">
          {displayOptions.map((option, index) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={`${option.value}-${index}`}
                type="button"
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left transition-all duration-200",
                  isSelected
                    ? "bg-blue-50/80 font-semibold text-blue-700 shadow-[0_2px_10px_rgba(27,43,94,0.1)]"
                    : "text-gray-700 hover:bg-gray-100/80 hover:text-gray-900"
                )}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
