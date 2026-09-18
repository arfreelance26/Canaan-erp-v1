"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center gap-4 p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 animate-backdrop-in" onClick={onClose} />

      {/* Modal panel */}
      <div
        className={cn(
          "relative flex flex-col w-full max-h-[92dvh] overflow-hidden bg-white shadow-xl animate-dialog-enter",
          "rounded-t-2xl sm:rounded-xl",
          !className?.includes("max-w") && "sm:max-w-2xl md:max-w-3xl",
          className
        )}
      >
        {/* Sticky header */}
        <div className="flex flex-shrink-0 items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">{title}</h2>
          <div className="flex items-center gap-3">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 custom-scrollbar">
          {children}
        </div>
      </div>

      {/* Companion side panel — desktop only */}
      {sidePanel && (
        <div className="relative hidden max-h-[92dvh] w-[340px] shrink-0 animate-dialog-enter lg:flex">
          {sidePanel}
        </div>
      )}
    </div>,
    document.body
  );
}
