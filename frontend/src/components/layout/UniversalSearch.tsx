"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { RiSearchLine } from "@remixicon/react";
import { Kbd } from "@/components/base/kbd/kbd";

// The search window (palette + record lists) loads on first use.
const UniversalSearchPalette = dynamic(() => import("./UniversalSearchPalette"), { ssr: false });
const preload = () => void import("./UniversalSearchPalette");

/**
 * Topbar search: one place to jump to any page this person can open, or find
 * a trip, truck, driver, customer, staff member or vendor. Opens with ⌘K /
 * Ctrl+K, or "/" when no text field has focus.
 */
export function UniversalSearch({ locked }: { locked?: boolean }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent));
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        setUsed(true);
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        data-tour="search"
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          setUsed(true);
          setOpen(true);
        }}
        className="flex h-10 items-center gap-2 rounded-xl border border-border-button-default bg-background-secondary-default px-3 text-text-tertiary outline-none transition-colors hover:bg-background-secondary-hover hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-border-focus-ring lg:w-64"
      >
        <RiSearchLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <span className="hidden flex-1 truncate text-start text-body-regular lg:inline">Search</span>
        <span className="hidden items-center gap-0.5 lg:flex" aria-hidden>
          <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      {used && <UniversalSearchPalette open={open} setOpen={setOpen} locked={locked} />}
    </>
  );
}
