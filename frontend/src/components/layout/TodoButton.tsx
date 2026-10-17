"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ListTodo, Loader2, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { todosApi, type Todo, type TodoUsage } from "@/lib/api";
import { confirmDelete, showError } from "@/lib/swal";
import { todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

const TITLE_MAX = 300;

type Filter = "active" | "done";

function sortTodos(list: Todo[]): Todo[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (b.doneAt ?? "").localeCompare(a.doneAt ?? "") || b.id - a.id;
    if (a.important !== b.important) return a.important ? -1 : 1;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    return b.id - a.id;
  });
}

function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortDay(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short" });
}

/** "Overdue · 12 Oct" / "Today" / "Tomorrow" / "18 Oct", with a colour. */
function dueChip(t: Todo, today: string): { text: string; tone: "red" | "amber" | "gray" } | null {
  if (!t.dueDate) return null;
  if (t.done) return { text: shortDay(t.dueDate), tone: "gray" };
  if (t.dueDate < today) return { text: `Overdue · ${shortDay(t.dueDate)}`, tone: "red" };
  if (t.dueDate === today) return { text: "Today", tone: "amber" };
  if (t.dueDate === addDays(today, 1)) return { text: "Tomorrow", tone: "gray" };
  return { text: shortDay(t.dueDate), tone: "gray" };
}

/**
 * Topbar To-do — a private task list per person, next to Notes. Tasks live
 * on the server (so they follow the person to any device) and stay until
 * their owner deletes them; nobody else, Admin included, can read them.
 * The button shows how many open tasks are due today or overdue. Limits are
 * enforced by the server — see routers/todos.py.
 */
export function TodoButton() {
  const [open, setOpen] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [usage, setUsage] = useState<TodoUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newImportant, setNewImportant] = useState(false);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLInputElement | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");

  const today = todayIst();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { items, usage: u } = await todosApi.list();
      setTodos(sortTodos(items));
      setUsage(u);
    } catch {
      if (!quiet) showError("Could not load your tasks.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // Once on mount, quietly, so the button can show what's due.
  useEffect(() => {
    setMounted(true);
    void load(true);
  }, [load]);

  function openPanel() {
    setOpen(true);
    void load();
    window.setTimeout(() => addRef.current?.focus(), 50);
  }

  function closePanel() {
    setOpen(false);
    setSearch("");
    setEditingId(null);
  }

  /** Optimistic change; the server's copy replaces it, or it's rolled back. */
  async function patch(t: Todo, change: { title?: string; done?: boolean; important?: boolean; dueDate?: string | null }) {
    const before = t;
    const optimistic: Todo = {
      ...t,
      ...change,
      doneAt: change.done === undefined ? t.doneAt : change.done ? new Date().toISOString() : null,
    };
    setTodos((prev) => sortTodos(prev.map((x) => (x.id === t.id ? optimistic : x))));
    try {
      const saved = await todosApi.update(t.id, change);
      setTodos((prev) => sortTodos(prev.map((x) => (x.id === t.id ? saved : x))));
    } catch (err) {
      setTodos((prev) => sortTodos(prev.map((x) => (x.id === t.id ? before : x))));
      showError(err instanceof Error && err.message ? err.message : "Could not update this task.");
    }
  }

  async function addTodo() {
    const title = newTitle.replace(/\s+/g, " ").trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const created = await todosApi.create({ title, dueDate: newDue || null, important: newImportant });
      setTodos((prev) => sortTodos([created, ...prev]));
      setUsage((u) => (u ? { ...u, count: u.count + 1 } : u));
      setNewTitle("");
      setNewDue("");
      setNewImportant(false);
      setFilter("active");
      addRef.current?.focus();
    } catch (err) {
      showError(err instanceof Error && err.message ? err.message : "Could not add this task.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(t: Todo) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditDue(t.dueDate ?? "");
  }

  async function saveEdit(t: Todo) {
    const title = editTitle.replace(/\s+/g, " ").trim();
    setEditingId(null);
    if (!title) return; // emptied out — keep the old text rather than save a blank task
    const due = editDue || null;
    if (title === t.title && due === t.dueDate) return;
    await patch(t, { title, dueDate: due });
  }

  async function deleteTodo(t: Todo) {
    const confirmed = await confirmDelete(`"${t.title.length > 60 ? `${t.title.slice(0, 60)}…` : t.title}"`);
    if (!confirmed.isConfirmed) return;
    try {
      setUsage(await todosApi.remove(t.id));
      setTodos((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      showError(err instanceof Error && err.message ? err.message : "Could not delete this task.");
    }
  }

  async function clearCompleted() {
    const n = todos.filter((t) => t.done).length;
    const confirmed = await confirmDelete(`${n} completed task${n === 1 ? "" : "s"}`);
    if (!confirmed.isConfirmed) return;
    try {
      setUsage(await todosApi.clearCompleted());
      setTodos((prev) => prev.filter((t) => !t.done));
    } catch (err) {
      showError(err instanceof Error && err.message ? err.message : "Could not clear completed tasks.");
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingId != null) setEditingId(null); // Esc first cancels an edit
      else closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, editingId]);

  const openCount = todos.filter((t) => !t.done).length;
  const doneCount = todos.length - openCount;
  const dueCount = todos.filter((t) => !t.done && t.dueDate && t.dueDate <= today).length;
  const atLimit = usage ? usage.count >= usage.maxTodos : false;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return todos.filter((t) => (filter === "done" ? t.done : !t.done) && (!q || t.title.toLowerCase().includes(q)));
  }, [todos, filter, search]);

  return (
    <>
      <button
        type="button"
        aria-label={dueCount ? `To-do — ${dueCount} due` : "To-do"}
        title={dueCount ? `To-do — ${dueCount} due today or overdue` : "To-do"}
        onClick={() => (open ? closePanel() : openPanel())}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300",
          "hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4",
          open
            ? "border-blue-300 bg-blue-50 text-brand-navy focus:ring-blue-500/20"
            : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-brand-navy focus:ring-blue-500/10",
        )}
      >
        <ListTodo className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
        {dueCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {dueCount > 99 ? "99+" : dueCount}
          </span>
        )}
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[95] flex justify-end p-0 sm:p-3">
          <div className="absolute inset-0 bg-black/40 animate-backdrop-in" onClick={closePanel} />
          {/* data-no-track: the activity tracker labels clicks with a button's
              visible text — here that would be task text, which must never
              reach the (Admin-visible) Activity Log. */}
          <aside
            data-no-track
            className="animate-notes-in relative flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl sm:border sm:border-gray-200"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3.5">
                <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-brand-navy shadow-sm">
                  <ListTodo className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-gray-900">To-do</h2>
                  <p className="text-xs text-gray-500">Private to you · saved automatically</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Close to-do"
                className="rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Add a task */}
            <div className="shrink-0 border-b border-gray-100 bg-gray-50/70 p-4 sm:px-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void addTodo();
                }}
                className="flex flex-col gap-2.5"
              >
                <input
                  ref={addRef}
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={TITLE_MAX}
                  disabled={atLimit}
                  placeholder={atLimit ? "Task limit reached — clear completed tasks to add more" : "Add a task…"}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="flex items-center gap-2">
                  <div className="w-44">
                    <DatePickerInput value={newDue} onChange={setNewDue} placeholder="Due date (optional)" />
                  </div>
                  {newDue && (
                    <button
                      type="button"
                      onClick={() => setNewDue("")}
                      title="Remove due date"
                      className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNewImportant((v) => !v)}
                    title={newImportant ? "Marked important" : "Mark important"}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
                      newImportant ? "border-amber-200 bg-amber-50 text-amber-500" : "border-gray-200 bg-white text-gray-400 hover:text-amber-500",
                    )}
                  >
                    <Star className={cn("h-4 w-4", newImportant && "fill-current")} />
                  </button>
                  <button
                    type="submit"
                    disabled={!newTitle.trim() || adding || atLimit}
                    className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </button>
                </div>
              </form>
            </div>

            {/* Tabs + search */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pt-4 sm:px-6">
              {(["active", "done"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                    filter === f ? "bg-brand-navy text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  )}
                >
                  {f === "active" ? `To do · ${openCount}` : `Done · ${doneCount}`}
                </button>
              ))}
              <div className="relative ml-auto w-full sm:w-48">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tasks…"
                  className="w-full rounded-full border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none transition-colors focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                />
              </div>
            </div>

            {/* List */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
              {loading && todos.length === 0 ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : visible.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    <ListTodo className="h-5 w-5 text-gray-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600">
                    {search.trim() ? "No matching tasks" : filter === "active" ? "Nothing to do" : "No completed tasks"}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {search.trim()
                      ? "Try a different search."
                      : filter === "active"
                        ? "Add a task above — only you can see your list."
                        : "Tick a task off and it shows up here."}
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {visible.map((t) => {
                    const chip = dueChip(t, today);
                    const editing = editingId === t.id;
                    return (
                      <li
                        key={t.id}
                        className={cn(
                          "group/item flex items-start gap-3 rounded-xl border bg-white px-3.5 py-3 transition-all duration-200",
                          editing ? "border-blue-200 shadow-[0_4px_14px_-6px_rgba(27,43,94,0.25)]" : "border-gray-200/80 hover:border-gray-300 hover:shadow-sm",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => void patch(t, { done: !t.done })}
                          aria-label={t.done ? "Mark as not done" : "Mark as done"}
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 hover:border-emerald-500",
                          )}
                        >
                          {t.done && <Check className="h-3 w-3" strokeWidth={3} />}
                        </button>

                        {editing ? (
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <input
                              autoFocus
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void saveEdit(t);
                                }
                              }}
                              maxLength={TITLE_MAX}
                              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="w-44">
                                <DatePickerInput value={editDue} onChange={setEditDue} placeholder="No due date" />
                              </div>
                              {editDue && (
                                <button
                                  type="button"
                                  onClick={() => setEditDue("")}
                                  title="Remove due date"
                                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="ml-auto rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveEdit(t)}
                                className="rounded-full bg-brand-navy px-3 py-1 text-xs font-semibold text-white hover:bg-brand-navy/90"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            title="Edit task"
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className={cn("block break-words text-sm", t.done ? "text-gray-400 line-through" : "text-gray-800")}>
                              {t.title}
                            </span>
                            {chip && (
                              <span
                                className={cn(
                                  "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  chip.tone === "red" && "bg-red-50 text-red-600",
                                  chip.tone === "amber" && "bg-amber-50 text-amber-700",
                                  chip.tone === "gray" && "bg-gray-100 text-gray-500",
                                )}
                              >
                                <CalendarDays className="h-3 w-3" /> {chip.text}
                              </span>
                            )}
                          </button>
                        )}

                        {!editing && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            {!t.done && (
                              <button
                                type="button"
                                onClick={() => void patch(t, { important: !t.important })}
                                title={t.important ? "Remove important" : "Mark important"}
                                className={cn(
                                  "rounded-full p-1.5 transition-colors",
                                  t.important ? "text-amber-500" : "text-gray-300 hover:text-amber-500",
                                )}
                              >
                                <Star className={cn("h-4 w-4", t.important && "fill-current")} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEdit(t)}
                              title="Edit task"
                              className="rounded-full p-1.5 text-gray-300 transition-colors hover:text-gray-600 sm:opacity-0 sm:group-hover/item:opacity-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteTodo(t)}
                              title="Delete task"
                              className="rounded-full p-1.5 text-gray-300 transition-colors hover:text-red-600 sm:opacity-0 sm:group-hover/item:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-2.5 text-[11px] font-medium text-gray-400">
              <span className={cn(atLimit && "font-semibold text-amber-600")}>
                {usage ? `${usage.count} of ${usage.maxTodos} tasks` : `${todos.length} tasks`}
                {dueCount > 0 && <span className="text-red-500"> · {dueCount} due today or overdue</span>}
              </span>
              {filter === "done" && doneCount > 0 && (
                <button
                  type="button"
                  onClick={() => void clearCompleted()}
                  className="flex items-center gap-1 font-semibold text-gray-500 transition-colors hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" /> Clear completed
                </button>
              )}
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
