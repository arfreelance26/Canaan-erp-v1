"use client";

/**
 * The "react to this message" popover: a row of quick emojis plus a "+" that
 * opens the full EmojiPicker. Rendered in a portal with fixed positioning so
 * the chat's scroll container can't clip it, and flipped above/below the
 * anchor depending on which side has room.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmojiPicker } from "./EmojiPicker";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const QUICK_W = 7 * 36 + 12;
const QUICK_H = 44;
const FULL_W = 288;
const FULL_H = 320;
const GAP = 6;

export function ReactionMenu({
  anchor,
  align,
  current,
  onPick,
  onClose,
}: {
  /** The button that opened the menu — the menu positions itself next to it. */
  anchor: HTMLElement;
  /** Line the menu up with the anchor's left ("start") or right ("end") edge. */
  align: "start" | "end";
  /** My current reaction on this message, highlighted (tapping it again removes it). */
  current: string | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<"quick" | "full">("quick");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function place() {
      const r = anchor.getBoundingClientRect();
      const w = stage === "quick" ? QUICK_W : FULL_W;
      const h = stage === "quick" ? QUICK_H : FULL_H;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const above = r.top - GAP - h >= 8 || r.bottom + GAP + h > vh - 8;
      const top = above ? Math.max(8, r.top - GAP - h) : r.bottom + GAP;
      const rawLeft = align === "end" ? r.right - w : r.left;
      setPos({ top, left: Math.min(Math.max(8, rawLeft), vw - w - 8) });
    }
    place();
    window.addEventListener("resize", place);
    // The chat list scrolling underneath would leave the menu floating in the wrong place.
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchor, align, stage, onClose]);

  // The quick bar closes itself; the full picker already handles outside-click/Escape.
  useEffect(() => {
    if (stage !== "quick") return;
    function down(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [stage, anchor, onClose]);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div ref={ref} className="fixed z-[60]" style={{ top: pos.top, left: pos.left }}>
      {stage === "quick" ? (
        <div
          role="menu"
          aria-label="React to message"
          className="flex items-center gap-0.5 rounded-full border border-gray-200 bg-white p-1 shadow-xl"
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitemradio"
              aria-label={`React ${emoji}`}
              aria-checked={current === emoji}
              onClick={() => onPick(emoji)}
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-gray-100 active:scale-95",
                current === emoji && "bg-brand-navy/10",
              )}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            aria-label="More emojis"
            onClick={() => setStage("full")}
            className="flex size-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-navy"
          >
            <Plus className="size-5" />
          </button>
        </div>
      ) : (
        <EmojiPicker onSelect={onPick} onClose={onClose} className="relative bottom-auto left-auto mb-0" />
      )}
    </div>,
    document.body,
  );
}
