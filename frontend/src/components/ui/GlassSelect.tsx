import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** "field" (default): full-width form field. "pill": a rounded toolbar
   *  filter the height of PillSearch / DateRangePill, sized to its label. */
  variant?: "field" | "pill";
  /** "sm": compact, for table cells and small filters inside dialogs. */
  size?: "md" | "sm";
  /** Extra classes on the trigger button (e.g. a highlight when a value is set). */
  triggerClassName?: string;
  "aria-label"?: string;
}

export function GlassSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
  className,
  variant = "field",
  size = "md",
  triggerClassName,
  "aria-label": ariaLabel,
}: GlassSelectProps) {
  const pill = variant === "pill";
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => 
    String(opt.value).toLowerCase() === String(value).toLowerCase()
  );

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 240; // approx max-h-60
      
      const openUpwards = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      // A pill can be narrower than its longest option; the list never is.
      const width = pill || size === "sm" ? Math.max(rect.width, 208) : rect.width;
      // Keep the list on screen: a trigger near the right edge gets its list
      // lined up with its right side instead of running past the viewport.
      const viewportWidth = document.documentElement.clientWidth;
      const left = rect.left + width > viewportWidth - 8 ? Math.max(8, rect.right - width) : rect.left;

      setDropdownStyle({
        position: 'fixed',
        left,
        width,
        ...(openUpwards 
             ? { bottom: window.innerHeight - rect.top + 8, maxHeight: Math.min(spaceAbove - 20, 300) }
             : { top: rect.bottom + 8, maxHeight: Math.min(spaceBelow - 20, 300) })
      });
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      // Listen to scroll events on any scrollable ancestor
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen]);

  return (
    <div className={cn("relative text-[14px]", pill ? "w-auto shrink-0" : "w-full", className)} ref={containerRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between gap-2 border bg-background-primary-default text-left",
          pill ? "h-10 min-w-[9.5rem] rounded-full pl-4 pr-3.5" : size === "sm" ? "rounded-lg px-2 py-1.5 text-caption-1-semibold" : "rounded-lg px-3 py-2",
          " shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition duration-300 focus:outline-none focus:ring-4 focus:ring-accent-solid/10",
          disabled ? "cursor-not-allowed opacity-60 bg-fill-1" : "cursor-pointer hover:bg-fill-2 hover:shadow-md hover:border-accent-border/80",
          isOpen ? "border-accent-border-strong bg-background-primary-default shadow-md ring-4 ring-accent-solid/10" : "border-separator-border",
          !selectedOption ? "text-text-secondary" : "text-text-primary font-medium",
          triggerClassName
        )}
      >
        <span className="block truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-300",
            isOpen ? "rotate-180 text-accent-text" : ""
          )}
        />
      </button>

      {isOpen && typeof document !== "undefined" && createPortal(
        <div 
          ref={dropdownRef}
          style={dropdownStyle}
          className="z-[9999] overflow-y-auto rounded-xl border border-separator-border bg-background-primary-default p-1 shadow-[0_10px_40px_rgba(0,0,0,0.12)] animate-dropdown duration-200 custom-scrollbar"
        >
          {options.map((option, index) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={`${option.value}-${index}`}
                type="button"
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left transition duration-200",
                  isSelected
                    ? "bg-accent-surface/80 font-semibold text-accent-text shadow-md"
                    : "text-text-primary hover:bg-fill-3 hover:text-text-primary"
                )}
                // Mousedown only keeps focus on the trigger; the pick happens on
                // click, so the app-wide activity log (useActivityTracking) sees it.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
