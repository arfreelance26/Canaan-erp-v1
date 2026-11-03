"use client";

import { Kbd } from "@/components/base/kbd/kbd";
import { SHORTCUTS } from "@/lib/shortcuts";
import { useEffect, useRef, useState } from "react";
import { RiSunLine as Sun, RiMoonLine as Moon, RiText as Type, RiSubtractLine as Minus, RiAddLine as Plus, RiSettings3Line as Settings2 } from "@remixicon/react";
import { useTheme, FONT_SCALE_STEPS } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

/**
 * Topbar control that lets the user switch between light/dark themes and
 * adjust the global font size. Preferences persist via ThemeContext.
 */
export function DisplaySettings() {
  const { theme, toggleTheme, fontScale, setFontScale, increaseFont, decreaseFont } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const minScale = FONT_SCALE_STEPS[0];
  const maxScale = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1];
  const scalePct = Math.round(fontScale * 100);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Display settings"
        onClick={() => setOpen((v) => !v)}
        className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-separator-border bg-background-primary-default text-text-secondary shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition duration-300 hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-accent-solid/10"
      >
        <Settings2 className="h-5 w-5 transition-transform duration-300 group-hover:rotate-45" />
      </button>

      {open && (
        <div className="absolute right-0 z-[100] mt-3 w-72 origin-top-right rounded-2xl border border-separator-border bg-background-primary-default p-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)]">
          <p className="mb-3 text-caption-1-semibold text-text-secondary">Display</p>

          {/* Theme toggle */}
          <div className="mb-4">
            <p className="mb-2 flex items-center justify-between text-body-medium text-text-primary">
              Theme
              <span className="flex items-center gap-1.5 text-caption-1-regular text-text-tertiary">
                Press <Kbd>{SHORTCUTS.theme.key}</Kbd>
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { if (theme !== "light") toggleTheme(); }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-body-medium transition",
                  theme === "light"
                    ? "border-accent-solid bg-accent-surface text-accent-text"
                    : "border-separator-border text-text-secondary hover:bg-fill-2",
                )}
              >
                <Sun className="h-4 w-4" /> Light
              </button>
              <button
                type="button"
                onClick={() => { if (theme !== "dark") toggleTheme(); }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-body-medium transition",
                  theme === "dark"
                    ? "border-accent-solid bg-accent-surface text-accent-text"
                    : "border-separator-border text-text-secondary hover:bg-fill-2",
                )}
              >
                <Moon className="h-4 w-4" /> Dark
              </button>
            </div>
          </div>

          {/* Font size */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-body-medium text-text-primary">
                <Type className="h-4 w-4" /> Font size
              </p>
              <span className="text-caption-1-semibold text-accent-text">{scalePct}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease font size"
                onClick={decreaseFont}
                disabled={fontScale <= minScale}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-separator-border text-text-secondary transition hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>

              <div className="flex flex-1 items-center gap-1">
                {FONT_SCALE_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    aria-label={`Font size ${Math.round(step * 100)}%`}
                    onClick={() => setFontScale(step)}
                    className={cn(
                      "h-2 flex-1 rounded-full transition-colors",
                      fontScale >= step ? "bg-accent-solid" : "bg-fill-3",
                    )}
                  />
                ))}
              </div>

              <button
                type="button"
                aria-label="Increase font size"
                onClick={increaseFont}
                disabled={fontScale >= maxScale}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-separator-border text-text-secondary transition hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-text-tertiary">Adjusts text size across the whole app.</p>
          </div>
        </div>
      )}
    </div>
  );
}
