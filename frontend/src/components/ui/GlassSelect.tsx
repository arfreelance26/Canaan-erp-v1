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
}

export function GlassSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
  className,
}: GlassSelectProps) {
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
      
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
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
    <div className={cn("relative w-full text-[14px]", className)} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-background-primary-default px-3 py-2 text-left shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition duration-300 focus:outline-none focus:ring-4 focus:ring-accent-solid/10",
          disabled ? "cursor-not-allowed opacity-60 bg-fill-1" : "cursor-pointer hover:bg-fill-2 hover:shadow-md hover:border-accent-border/80",
          isOpen ? "border-accent-border-strong bg-background-primary-default shadow-md ring-4 ring-accent-solid/10" : "border-separator-border",
          !selectedOption ? "text-text-secondary" : "text-text-primary font-medium"
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
                onMouseDown={(e) => {
                  e.preventDefault();
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
