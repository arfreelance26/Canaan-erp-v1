"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const [inputValue, setInputValue] = useState(value || "");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); };
  }, []);

  // Sync internal inputValue with external value prop
  useEffect(() => {
    if (value === undefined || value === null) {
      setInputValue("");
      return;
    }
    const matchingOption = options.find((opt) => String(opt.value).toLowerCase() === String(value).toLowerCase());
    if (matchingOption) {
      setInputValue(matchingOption.label);
    } else {
      setInputValue(value);
    }
  }, [value, options]);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 240;
      const openUpwards = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        ...(openUpwards
          ? { bottom: window.innerHeight - rect.top + 8, maxHeight: Math.min(spaceAbove - 20, 300) }
          : { top: rect.bottom + 8, maxHeight: Math.min(spaceBelow - 20, 300) }),
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen]);

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes((inputValue || "").toLowerCase()) ||
      String(opt.value).toLowerCase().includes((inputValue || "").toLowerCase()),
  );
  const displayOptions = filteredOptions.length > 0 ? filteredOptions : options;

  const handleInputBlur = () => {
    blurTimerRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  const handleOptionMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); 
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  };

  const handleOptionClick = (optionValue: string, optionLabel: string) => {
    setInputValue(optionLabel);
    onChange(optionValue);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setInputValue(newVal);
    onChange(newVal);
    setIsOpen(true);
  };

  return (
    <div className={cn("relative w-full text-[14px]", className)} ref={containerRef}>
      <div
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-white/60 px-3 py-2 text-left shadow-[0_2px_10px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all duration-300 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-400 focus-within:bg-white",
          disabled
            ? "cursor-not-allowed opacity-60 bg-gray-50/50"
            : "hover:bg-white/80 hover:shadow-md hover:border-blue-200/80",
          isOpen ? "border-blue-400 bg-white shadow-md ring-4 ring-blue-500/10" : "border-gray-200",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); setIsOpen(true); }}
          onBlur={handleInputBlur}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          className="w-full bg-transparent text-gray-900 font-medium placeholder:text-gray-400 placeholder:normal-case focus:outline-none disabled:cursor-not-allowed uppercase"
        />
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
          }}
          onClick={() => {
            if (!disabled) {
              const next = !isOpen;
              setIsOpen(next);
              if (next) inputRef.current?.focus();
            }
          }}
          className="focus:outline-none"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300",
              isOpen ? "rotate-180 text-blue-500" : "",
            )}
          />
        </button>
      </div>

      {isOpen && displayOptions.length > 0 && mounted &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="overflow-y-auto rounded-xl border border-white/60 bg-white/80 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl animate-dropdown duration-200 custom-scrollbar"
          >
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
                      : "text-gray-700 hover:bg-gray-100/80 hover:text-gray-900",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                    handleOptionClick(option.value, option.label);
                  }}
                >
                  <span className="block truncate">{option.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

