"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
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
  const [inputValue, setInputValue] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs so restoreLabel always reads the latest value/options even inside a timeout
  const valueRef = useRef(value);
  const optionsRef = useRef(options);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { optionsRef.current = options; }, [options]);

  useEffect(() => {
    setMounted(true);
    return () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); };
  }, []);

  // When the dropdown is closed, keep the input in sync with the external value
  useEffect(() => {
    if (!isOpen) {
      if (!value) { setInputValue(""); return; }
      const match = options.find((o) => String(o.value).toLowerCase() === String(value).toLowerCase());
      setInputValue(match ? match.label : value);
    }
  }, [value, options]); // eslint-disable-line react-hooks/exhaustive-deps

  const restoreLabel = () => {
    const v = valueRef.current;
    const opts = optionsRef.current;
    if (!v) { setInputValue(""); return; }
    const match = opts.find((o) => String(o.value).toLowerCase() === String(v).toLowerCase());
    setInputValue(match ? match.label : v);
  };

  const openDropdown = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    // Keep the current label visible (don't clear) so the value doesn't disappear on click.
    // Select-all so the user can immediately type to replace it.
    restoreLabel();
    setIsOpen(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpwards = spaceBelow < 240 && spaceAbove > spaceBelow;
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

  // Only filter when user has typed something that differs from the selected option's label
  const selectedLabel = options.find((o) => String(o.value).toLowerCase() === String(value).toLowerCase())?.label ?? "";
  const isSearching = inputValue !== "" && inputValue !== selectedLabel;
  const filteredOptions = isSearching
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(inputValue.toLowerCase()) ||
          String(o.value).toLowerCase().includes(inputValue.toLowerCase()),
      )
    : options;
  const displayOptions = filteredOptions.length > 0 ? filteredOptions : options;

  const handleOptionClick = (optVal: string, optLabel: string) => {
    setInputValue(optLabel);
    onChange(optVal);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onChange(e.target.value); // consumers that need constrained selection should validate in their onChange
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    blurTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      restoreLabel();
    }, 150);
  };

  return (
    <div className={cn("relative w-full text-[14px]", className)} ref={containerRef}>
      <div
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-white/60 px-3 py-2 text-left shadow-[0_2px_10px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all duration-300 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10",
          disabled ? "cursor-not-allowed bg-gray-50/50 opacity-60" : "hover:border-blue-200/80 hover:bg-white/80 hover:shadow-md",
          isOpen ? "border-blue-400 bg-white shadow-md ring-4 ring-blue-500/10" : "border-gray-200",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={openDropdown}
          onBlur={handleInputBlur}
          onKeyDown={(e) => {
            if (e.key === "Tab" && isOpen) {
              const first = filteredOptions.find((o) => !o.disabled);
              if (first) { e.preventDefault(); handleOptionClick(first.value, first.label); }
            }
          }}
          disabled={disabled}
          required={required}
          placeholder={isOpen ? "Type to search..." : placeholder}
          className="w-full bg-transparent font-medium uppercase text-gray-900 placeholder:normal-case placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
          }}
          onClick={() => {
            if (disabled) return;
            if (isOpen) { setIsOpen(false); restoreLabel(); }
            else { openDropdown(); inputRef.current?.focus(); }
          }}
          className="focus:outline-none"
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300", isOpen && "rotate-180 text-blue-500")} />
        </button>
      </div>

      {isOpen && displayOptions.length > 0 && mounted &&
        createPortal(
          <div
            style={dropdownStyle}
            className="overflow-y-auto rounded-xl border border-white/60 bg-white/80 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl animate-dropdown duration-200 custom-scrollbar"
          >
            {displayOptions.map((option, i) => {
              const isSelected = String(option.value) === String(value);
              const isOptDisabled = !!option.disabled;
              return (
                <button
                  key={`${option.value}-${i}`}
                  type="button"
                  disabled={isOptDisabled}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-all duration-200",
                    isOptDisabled
                      ? "cursor-not-allowed bg-gray-50/80 text-gray-400"
                      : isSelected
                      ? "bg-blue-50/80 font-semibold text-blue-700 shadow-[0_2px_10px_rgba(27,43,94,0.1)]"
                      : "text-gray-700 hover:bg-gray-100/80 hover:text-gray-900",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (isOptDisabled) return;
                    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                    handleOptionClick(option.value, option.label);
                  }}
                >
                  <span className="block truncate">{option.label}</span>
                  {isOptDisabled && (
                    <span className="ml-2 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      Active Trip
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
