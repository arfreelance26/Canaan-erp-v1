"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, NotebookPen, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { notesApi, type NoteSummary, type NoteUsage } from "@/lib/api";
import { confirmDelete, showError } from "@/lib/swal";

const AUTOSAVE_MS = 800;
const RETRY_MS = 15_000;
const NOTE_MAX_CHARS = 50_000;

type SaveState = "idle" | "saving" | "saved" | "error";

/** A list entry, plus its body once it's been opened (the list never ships bodies). */
type Item = NoteSummary & { body?: string };

const encoder = new TextEncoder();
const byteSize = (s: string) => encoder.encode(s).length;

function sortNotes(list: Item[]): Item[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || b.id - a.id;
  });
}

function isBlank(n: Item): boolean {
  return !n.title.trim() && !(n.body ?? n.preview).trim();
}

function edited(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
}

function toPreview(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 140);
}

function kb(bytes: number): string {
  return bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
}

/**
 * Topbar Notes — a private notepad per person, sitting left of the
 * Calculator. Notes live on the server (so they follow the person to any
 * device) and stay until their owner deletes them; nobody else, Admin
 * included, can read them. Edits autosave a moment after typing stops.
 * Limits (20 notes, 100 KB each, a daily save allowance) are enforced by the
 * server — see routers/notes.py — and surfaced here.
 */
export function NotesButton() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Item[]>([]);
  const [usage, setUsage] = useState<NoteUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  const notesRef = useRef<Item[]>([]);
  const pending = useRef(new Map<number, { title?: string; body?: string }>());
  const timer = useRef<number | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const focusTitleNext = useRef(false);
  // A failed save retries itself via this (flush can't reference itself).
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const flush = useCallback(async (keepalive = false) => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current.size === 0) return;
    const batch = Array.from(pending.current.entries());
    pending.current.clear();
    setSaveState("saving");
    let error = "";
    await Promise.all(
      batch.map(async ([id, patch]) => {
        try {
          const saved = await notesApi.update(id, patch, keepalive);
          setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, updatedAt: saved.note.updatedAt } : n)));
          setUsage(saved.usage);
        } catch (err) {
          error = err instanceof Error && err.message ? err.message : "Couldn't save.";
          // Put it back (merged under anything typed since) so a later flush retries it.
          pending.current.set(id, { ...patch, ...pending.current.get(id) });
        }
      }),
    );
    setSaveError(error);
    setSaveState(error ? "error" : "saved");
    if (error && !timer.current) timer.current = window.setTimeout(() => retryRef.current(), RETRY_MS);
  }, []);

  useEffect(() => {
    retryRef.current = () => void flush();
  }, [flush]);

  // Don't lose the last few keystrokes when the tab closes or navigates away.
  useEffect(() => {
    const onHide = () => void flush(true);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flush]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    try {
      const { items, usage: u } = await notesApi.list();
      // Keep bodies already loaded this session unless the server copy is newer.
      setNotes((prev) => sortNotes(items.map((s) => {
        const known = prev.find((p) => p.id === s.id);
        return known && known.updatedAt === s.updatedAt ? { ...s, body: known.body } : s;
      })));
      setUsage(u);
      setActiveId((cur) => (cur && items.some((n) => n.id === cur) ? cur : null));
    } catch {
      showError("Could not load your notes.");
    } finally {
      setLoading(false);
    }
  }

  /** A note that was created but never written in isn't worth keeping. */
  async function dropIfBlank(id: number | null) {
    if (id == null) return;
    const note = notesRef.current.find((n) => n.id === id);
    if (!note || !isBlank(note)) return;
    pending.current.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      setUsage(await notesApi.remove(id));
    } catch {
      /* harmless — an empty note */
    }
  }

  async function closePanel() {
    await flush();
    await dropIfBlank(activeId);
    setOpen(false);
    setSearch("");
    setSaveState("idle");
  }

  async function loadBody(id: number) {
    if (notesRef.current.find((n) => n.id === id)?.body !== undefined) return;
    setBodyLoading(true);
    try {
      const full = await notesApi.get(id);
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: full.title, body: full.body } : n)));
    } catch {
      showError("Could not open this note.");
      setActiveId(null);
    } finally {
      setBodyLoading(false);
    }
  }

  async function selectNote(id: number | null) {
    if (id === activeId) return;
    await flush();
    await dropIfBlank(activeId);
    setActiveId(id);
    setSaveState("idle");
    setSaveError("");
    if (id != null) void loadBody(id);
  }

  async function newNote() {
    if (creating) return;
    setCreating(true);
    try {
      await flush();
      await dropIfBlank(activeId);
      const note = await notesApi.create();
      const item: Item = {
        id: note.id, title: note.title, body: note.body, preview: "", sizeBytes: 0,
        pinned: note.pinned, createdAt: note.createdAt, updatedAt: note.updatedAt,
      };
      setNotes((prev) => sortNotes([item, ...prev]));
      setUsage((u) => (u ? { ...u, count: u.count + 1 } : u));
      focusTitleNext.current = true;
      setActiveId(note.id);
      setSearch("");
      setSaveState("idle");
      setSaveError("");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not create a note.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (focusTitleNext.current && activeId != null) {
      focusTitleNext.current = false;
      titleRef.current?.focus();
    }
  }, [activeId]);

  function edit(field: "title" | "body", value: string) {
    if (activeId == null) return;
    const id = activeId;
    const current = notesRef.current.find((n) => n.id === id);
    if (!current) return;
    const next = { ...current, [field]: value };
    const body = next.body ?? "";
    next.preview = toPreview(body);
    next.sizeBytes = byteSize(next.title) + byteSize(body);
    setNotes((prev) => prev.map((n) => (n.id === id ? next : n)));
    if (usage && byteSize(body) > usage.noteMaxBytes) {
      // The server would refuse it anyway — say so now instead of retrying a doomed save.
      if (timer.current) window.clearTimeout(timer.current);
      pending.current.set(id, { ...pending.current.get(id), [field]: value });
      setSaveState("error");
      setSaveError(`This note is over the ${kb(usage.noteMaxBytes)} limit — shorten it to save.`);
      return;
    }
    pending.current.set(id, { ...pending.current.get(id), [field]: value });
    setSaveState("saving");
    setSaveError("");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  async function togglePin(note: Item) {
    const pinned = !note.pinned;
    setNotes((prev) => sortNotes(prev.map((n) => (n.id === note.id ? { ...n, pinned } : n))));
    try {
      await notesApi.update(note.id, { pinned });
    } catch (err) {
      setNotes((prev) => sortNotes(prev.map((n) => (n.id === note.id ? { ...n, pinned: !pinned } : n))));
      showError(err instanceof Error && err.message ? err.message : "Could not update this note.");
    }
  }

  async function deleteNote(note: Item) {
    const confirmed = await confirmDelete(note.title.trim() ? `"${note.title.trim()}"` : "this note");
    if (!confirmed.isConfirmed) return;
    pending.current.delete(note.id);
    try {
      setUsage(await notesApi.remove(note.id));
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      if (activeId === note.id) setActiveId(null);
      setSaveState("idle");
      setSaveError("");
    } catch (err) {
      showError(err instanceof Error && err.message ? err.message : "Could not delete this note.");
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || (n.body ?? n.preview).toLowerCase().includes(q));
  }, [notes, search]);

  const active = notes.find((n) => n.id === activeId) ?? null;
  const activeBody = active?.body ?? "";
  const words = activeBody.trim() ? activeBody.trim().split(/\s+/).length : 0;
  const activeBytes = active ? byteSize(activeBody) : 0;
  const atNoteLimit = usage ? usage.count >= usage.maxNotes : false;
  const nearSizeLimit = usage ? activeBytes > usage.noteMaxBytes * 0.9 : false;

  const saveLabel =
    saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? saveError || "Couldn't save — retrying" : "";

  return (
    <>
      <button
        type="button"
        aria-label="Notes"
        title="Notes"
        onClick={() => (open ? void closePanel() : void openPanel())}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300",
          "hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4",
          open
            ? "border-blue-300 bg-blue-50 text-brand-navy focus:ring-blue-500/20"
            : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-brand-navy focus:ring-blue-500/10",
        )}
      >
        <NotebookPen className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[95] flex justify-end p-0 sm:p-3">
          <div className="absolute inset-0 bg-black/40 animate-backdrop-in" onClick={() => void closePanel()} />
          {/* data-no-track: the activity tracker labels clicks with a button's
              visible text — here that would be note titles/content, which
              must never reach the (Admin-visible) Activity Log. */}
          <aside
            data-no-track
            className="animate-notes-in relative flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl sm:border sm:border-gray-200"
          >
            {/* Header — same icon-chip treatment as the app's page headers */}
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3.5">
                <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-brand-navy shadow-sm">
                  <NotebookPen className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-gray-900">Notes</h2>
                  <p className="text-xs text-gray-500">Private to you · saved automatically</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void closePanel()}
                aria-label="Close notes"
                className="rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex min-h-0 flex-1">
              {/* Note list */}
              <div className={cn(
                "flex w-full flex-col border-gray-100 bg-gray-50/70 sm:w-72 sm:shrink-0 sm:border-r",
                active && "hidden sm:flex",
              )}>
                <div className="flex flex-col gap-2.5 p-4">
                  <button
                    type="button"
                    onClick={() => void newNote()}
                    disabled={creating || atNoteLimit}
                    title={atNoteLimit ? "You've reached the note limit — delete or merge some to add more" : undefined}
                    className="flex items-center justify-center gap-1.5 rounded-full bg-brand-navy py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    New note
                  </button>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search notes…"
                      className="w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                    />
                  </div>
                  {usage ? (
                    <div className="px-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
                        <span className={atNoteLimit ? "text-amber-600" : "text-gray-400"}>
                          {usage.count} of {usage.maxNotes} notes
                        </span>
                        <span className="normal-case tracking-normal text-gray-400">{kb(usage.bytesUsed)} used</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={cn("h-full rounded-full transition-all", atNoteLimit ? "bg-amber-500" : "bg-brand-navy")}
                          style={{ width: `${Math.min(100, (usage.count / Math.max(1, usage.maxNotes)) * 100)}%` }}
                        />
                      </div>
                      {atNoteLimit && (
                        <p className="mt-2 text-xs text-amber-700">You&apos;ve reached {usage.maxNotes} notes — delete or merge some to add more.</p>
                      )}
                    </div>
                  ) : (
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {notes.length} note{notes.length === 1 ? "" : "s"}
                    </p>
                  )}
                </div>

                <div className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-4">
                  {loading && notes.length === 0 ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : visible.length === 0 ? (
                    <div className="mx-1 rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <NotebookPen className="h-5 w-5 text-gray-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-600">{notes.length === 0 ? "No notes yet" : "No matching notes"}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {notes.length === 0 ? "Jot down reminders, numbers, anything — only you can see them." : "Try a different search."}
                      </p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {visible.map((n) => {
                        const selected = n.id === activeId;
                        return (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => void selectNote(n.id)}
                              className={cn(
                                "relative w-full overflow-hidden rounded-xl border bg-white px-3.5 py-3 text-left transition-all duration-200",
                                selected
                                  ? "border-blue-200 shadow-[0_4px_14px_-6px_rgba(27,43,94,0.25)]"
                                  : "border-gray-200/80 hover:border-gray-300 hover:shadow-sm",
                              )}
                            >
                              {selected && <span className="absolute inset-y-0 left-0 w-1 bg-brand-navy" />}
                              <span className="flex items-center gap-1.5">
                                {n.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-brand-gold" />}
                                <span className={cn("truncate text-sm font-semibold", n.title.trim() ? "text-gray-900" : "text-gray-400")}>
                                  {n.title.trim() || "Untitled"}
                                </span>
                              </span>
                              <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-gray-500">
                                {n.preview || "No text yet"}
                              </span>
                              <span className="mt-1.5 block text-[11px] font-medium text-gray-400">{edited(n.updatedAt)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Editor */}
              <div className={cn("min-w-0 flex-1 flex-col bg-white", active ? "flex" : "hidden sm:flex")}>
                {active ? (
                  <>
                    <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-2.5 sm:px-6">
                      <button
                        type="button"
                        onClick={() => void selectNote(null)}
                        aria-label="Back to notes"
                        className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 sm:hidden"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <span className="mr-auto flex items-center gap-1.5 text-xs font-medium">
                        {saveState !== "idle" && (
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            saveState === "saving" ? "animate-pulse bg-brand-gold" : saveState === "saved" ? "bg-emerald-500" : "bg-red-500",
                          )} />
                        )}
                        <span className={cn("line-clamp-1", saveState === "error" ? "text-red-500" : "text-gray-400")} title={saveLabel}>
                          {saveLabel}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void togglePin(active)}
                        title={active.pinned ? "Unpin" : "Pin to top"}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                          active.pinned
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                        )}
                      >
                        {active.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        {active.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteNote(active)}
                        title="Delete note"
                        className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col px-6 pt-6 sm:px-10">
                      <input
                        ref={titleRef}
                        type="text"
                        value={active.title}
                        onChange={(e) => edit("title", e.target.value)}
                        maxLength={200}
                        placeholder="Untitled note"
                        className="w-full bg-transparent text-2xl font-bold tracking-tight text-gray-900 outline-none placeholder:text-gray-300"
                      />
                      <div className="my-4 h-0.5 w-12 rounded-full bg-brand-gold/60" />
                      {active.body === undefined ? (
                        <div className="flex flex-1 items-start justify-center pt-10">
                          {bodyLoading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
                        </div>
                      ) : (
                        <textarea
                          value={activeBody}
                          onChange={(e) => edit("body", e.target.value)}
                          maxLength={NOTE_MAX_CHARS}
                          placeholder="Start writing…"
                          className="custom-scrollbar min-h-0 w-full flex-1 resize-none bg-transparent pb-6 text-[15px] leading-7 text-gray-700 outline-none placeholder:text-gray-300"
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 bg-gray-50/70 px-6 py-2.5 text-[11px] font-medium text-gray-400 sm:px-10">
                      <span>{words} word{words === 1 ? "" : "s"}</span>
                      <span className="h-1 w-1 rounded-full bg-gray-300" />
                      <span className={cn(nearSizeLimit && "font-semibold text-amber-600")}>
                        {kb(activeBytes)} of {kb(usage?.noteMaxBytes ?? 100_000)}
                      </span>
                      {active.updatedAt && (
                        <>
                          <span className="h-1 w-1 rounded-full bg-gray-300" />
                          <span>Edited {edited(active.updatedAt)}</span>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-brand-navy shadow-sm">
                      <NotebookPen className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700">Pick a note or start a new one</p>
                    <p className="mt-1 max-w-xs text-xs text-gray-400">Everything saves automatically and stays until you delete it.</p>
                    <button
                      type="button"
                      onClick={() => void newNote()}
                      disabled={creating || atNoteLimit}
                      className="mt-5 flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" /> New note
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
