"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { JOSHINE_PEEK_EVENT, SHORTCUTS, isTypingTarget, toggleShortcutPanel } from "@/lib/shortcuts";

// The To-do, Notes and Meetings panels, mounted app-wide (no button) so their shortcuts
// work on every page. Loaded after the page, off the critical path.
const TodoButton = dynamic(() => import("./TodoButton").then((m) => m.TodoButton), { ssr: false });
const NotesButton = dynamic(() => import("./NotesButton").then((m) => m.NotesButton), { ssr: false });
const EventsButton = dynamic(() => import("./EventsButton").then((m) => m.EventsButton), { ssr: false });

/**
 * Listens for the app-wide shortcuts in lib/shortcuts.ts:
 * D toggles dark mode, T opens To-do, N opens Notes, M opens Meetings,
 * B opens the Notice Board (it drops down beside the bell — Topbar),
 * J sends Joshine down to peek (or brings it back).
 */
export function KeyboardShortcuts() {
  const { toggleTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // React Aria's search boxes (e.g. the Ctrl+K palette) re-send every key
      // to their results list as a copied event, which no longer looks like it
      // came from the text box. Skip copies, and go by where the cursor is.
      if (!e.isTrusted) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      const key = e.key.toUpperCase();
      if (key === SHORTCUTS.theme.key) toggleTheme();
      else if (key === SHORTCUTS.todo.key) toggleShortcutPanel("todo");
      else if (key === SHORTCUTS.notes.key) toggleShortcutPanel("notes");
      else if (key === SHORTCUTS.meetings.key) toggleShortcutPanel("meetings");
      else if (key === SHORTCUTS.board.key) toggleShortcutPanel("board");
      else if (key === SHORTCUTS.joshine.key) window.dispatchEvent(new Event(JOSHINE_PEEK_EVENT));
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
      <EventsButton variant="panel" />
    </>
  );
}
