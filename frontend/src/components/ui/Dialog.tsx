"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
  /**
   * Optional companion panel rendered as a sibling alongside the modal
   * (desktop only — hidden below `lg` since there isn't room for both).
   * The pair is centered together by the same flex row the modal already
   * uses, so no extra positioning is needed here.
   */
  sidePanel?: React.ReactNode;
};

export function Dialog({ open, onClose, title, children, className, headerRight, sidePanel }: DialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center gap-4 p-0 sm:items-center sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-scrim/50 animate-scrim-in" onClick={onClose} />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-separator-border bg-background-primary-default shadow-xl",
          "transform-gpu animate-modal-in rounded-t-2xl sm:rounded-2xl",
          !className?.includes("max-w") && "sm:max-w-2xl md:max-w-3xl",
          className
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-separator-border px-5 py-4 sm:px-6">
          <h2 className="truncate text-title-3-medium text-text-primary">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-lg text-foreground-icon-tertiary outline-none transition-colors hover:bg-fill-2 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
      </div>

      {/* Companion side panel — desktop only */}
      {sidePanel && (
        <div className="relative hidden max-h-[92dvh] w-[340px] shrink-0 animate-modal-in lg:flex">
          {sidePanel}
        </div>
      )}
    </div>,
    document.body
  );
}
