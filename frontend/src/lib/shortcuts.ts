"use client";

import { useEffect, useRef } from "react";

/**
 * App-wide keyboard shortcuts: single keys, like "/" for search, that work
 * anywhere in the app while no text field has focus. Single keys rather than
 * Ctrl/⌘ combos because Ctrl+D / Ctrl+T / Ctrl+N belong to the browser on
 * Windows and a page can't take them over.
 *
 * The listener is components/layout/KeyboardShortcuts.tsx; the hints shown in
 * the UI read the keys from here, so there is one place to change them.
 */
export const SHORTCUTS = {
  theme: { key: "D", label: "Dark mode" },
  todo: { key: "T", label: "To-do" },
  notes: { key: "N", label: "Notes" },
  meetings: { key: "M", label: "Meetings" },
  board: { key: "B", label: "Notice Board" },
  joshine: { key: "J", label: "Peek Joshine" },
} as const;

/** J: Joshine slides down to peek, or comes back up (components/joshine/JoshinePet.tsx). */
export const JOSHINE_PEEK_EVENT = "joshine:peek";

export type ShortcutPanel = "todo" | "notes" | "meetings" | "board";

/** True when a key press should go to a text field rather than a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}

// Panels that can be toggled by a shortcut. More than one of a kind can be
// mounted: the app-wide fallback (KeyboardShortcuts), plus the tile on
// My profile. The shortcut goes to the newest non-fallback one if any — the
// panel on the page you're looking at — otherwise to the fallback.
type Entry = { toggle: () => void; fallback: boolean };
const panels: Record<ShortcutPanel, Entry[]> = { todo: [], notes: [], meetings: [], board: [] };

/** Open or close the To-do / Notes panel, from a shortcut or a button. */
export function toggleShortcutPanel(name: ShortcutPanel) {
  const list = panels[name];
  const target = [...list].reverse().find((e) => !e.fallback) ?? list[list.length - 1];
  target?.toggle();
}

/** Registers a panel's open/close toggle for its shortcut while mounted. */
export function useShortcutPanel(name: ShortcutPanel, toggle: () => void, { fallback = false } = {}) {
  const latest = useRef(toggle);
  useEffect(() => {
    latest.current = toggle;
  });
  useEffect(() => {
    const entry: Entry = { toggle: () => latest.current(), fallback };
    panels[name].push(entry);
    return () => {
      panels[name] = panels[name].filter((e) => e !== entry);
    };
  }, [name, fallback]);
}
