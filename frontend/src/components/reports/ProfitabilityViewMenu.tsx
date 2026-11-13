"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RiEyeLine as Eye, RiLoader4Line as Loader2, RiArrowDownSLine as ChevronDown, RiCheckLine as Check } from "@remixicon/react";
import { cn } from "@/lib/utils";

/** Which half of the Profitability report to build (backend pl_export.py `part`). */
export type ProfitabilityPart = "trips" | "trucks" | "both";

export const PROFITABILITY_PARTS: { value: ProfitabilityPart; label: string; hint: string }[] = [
  { value: "trips", label: "Trip Profitability", hint: "Was each trip a good deal? Steady costs per km." },
  { value: "trucks", label: "Truck Profitability", hint: "What did each truck really make? The real bills." },
  { value: "both", label: "Both (one file)", hint: "The full report, with why the two differ." },
];

export const PROFITABILITY_TITLE: Record<ProfitabilityPart, string> = {
  trips: "Trip Profitability Report",
  trucks: "Truck Profitability Report",
  both: "Profitability Report",
};

const MENU_W = 288;

/**
 * The Profitability page's View: a small menu to pick Trip Profitability,
 * Truck Profitability or both. `current` (the tab on screen) is listed first
 * and marked, so one click still gets the report being looked at.
 *
 * The menu is drawn in a portal on <body>, fixed under the button: the page's
 * sections each animate in (animate-stagger), which gives every section its
 * own stacking layer, so a menu inside the header would sit behind the
 * sections below it whatever its z-index.
 */
export function ProfitabilityViewMenu({ current, busy, onPick }: {
  current: Exclude<ProfitabilityPart, "both">;
  busy: boolean;
  onPick: (part: ProfitabilityPart) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Place the menu under the button (right edges lined up, kept on screen); follow scroll / resize.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.min(Math.max(8, r.right - MENU_W), window.innerWidth - MENU_W - 8);
      setPos({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  // Close on a click outside (the button or the menu) or Escape.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const order = [...PROFITABILITY_PARTS].sort((a, b) => (a.value === current ? -1 : b.value === current ? 1 : 0));

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-tour="page-export"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        {busy ? "Preparing…" : "View"}
        {!busy && <ChevronDown className="h-4 w-4 opacity-80" />}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_W }}
          className="z-[200] overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default p-1.5 shadow-lg"
        >
          <p className="px-3 pb-1 pt-1.5 text-caption-2-semibold text-text-tertiary">Which report?</p>
          {order.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onPick(o.value); }}
              className={cn("flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-fill-2",
                o.value === current && "bg-accent-surface")}
            >
              <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center", o.value === current ? "text-accent-text" : "text-transparent")}>
                <Check className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-caption-1-semibold text-text-primary">
                  {o.label}{o.value === current && <span className="ml-1.5 font-normal text-text-tertiary">· this tab</span>}
                </span>
                <span className="block text-caption-2-regular text-text-secondary">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
