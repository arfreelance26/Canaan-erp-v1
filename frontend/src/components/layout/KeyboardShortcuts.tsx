"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { SHORTCUTS, isTypingTarget, toggleShortcutPanel } from "@/lib/shortcuts";

// The To-do and Notes panels, mounted app-wide (no button) so their shortcuts
// work on every page. Loaded after the page, off the critical path.
const TodoButton = dynamic(() => import("./TodoButton").then((m) => m.TodoButton), { ssr: false });
const NotesButton = dynamic(() => import("./NotesButton").then((m) => m.NotesButton), { ssr: false });

/**
 * Listens for the app-wide shortcuts in lib/shortcuts.ts:
 * D toggles dark mode, T opens To-do, N opens Notes.
 */
export function KeyboardShortcuts() {
  const { toggleTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      const key = e.key.toUpperCase();
      if (key === SHORTCUTS.theme.key) toggleTheme();
      else if (key === SHORTCUTS.todo.key) toggleShortcutPanel("todo");
      else if (key === SHORTCUTS.notes.key) toggleShortcutPanel("notes");
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleTheme]);

  return (
    <>
      <TodoButton variant="panel" />
      <NotesButton variant="panel" />
    </>
  );
}
