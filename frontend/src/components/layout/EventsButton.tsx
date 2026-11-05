"use client";

import { useEffect, useRef, useState } from "react";
import { RiCalendarScheduleLine as CalendarClock, RiCalendar2Line as CalendarDays, RiCheckLine as Check, RiCheckboxCircleLine as CheckCircle2, RiTimeLine as Clock, RiHistoryLine as History, RiLoader4Line as Loader2, RiAddLine as Plus, RiSearchLine as Search, RiDeleteBinLine as Trash2, RiGroupLine as Users, RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { Avatar } from "@/components/chat/shared";
import { chatApi, eventsApi, type CanaanEvent } from "@/lib/api";
import type { ChatMember, ChatConversation } from "@/types/chat";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { showError, showToast, confirmDelete, confirmAction } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
import { WorkspaceTile } from "./WorkspaceTile";
import { SHORTCUTS, useShortcutPanel } from "@/lib/shortcuts";
type Tab = "user" | "group";
type View = "list" | "create" | "history";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dayLabel = d.toLocaleDateString([], { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dayLabel}, ${time}`;
}

const pickerTriggerClass = cn(
  "flex w-full items-center gap-2 rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-left text-sm outline-none transition-colors",
  "focus:border-orange-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-orange-solid/20"
);

/** Local calendar day as ISO "YYYY-MM-DD" (for DatePickerInput). */
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Meeting times, every 15 minutes, as "HH:MM" with a "9:15 am" label. */
const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const label = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  return { value, label };
});
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Admin-schedules-a-meeting button — sits between Invite (left) and
 * Calculator (right) in the Topbar. Picks participants the same way as
 * Invite (a Canaan Chat user or group); everyone sees their own upcoming
 * meetings here, only Admin can create or cancel one. See
 * EventReminderListener (mounted in AppShell) for the live "starting now"
 * push this feeds into.
 */
/** `variant="tile"` draws the My profile card instead of the round icon;
 *  `variant="panel"` draws nothing but the dialog — the app-wide copy the M
 *  shortcut opens (KeyboardShortcuts), which only loads meetings while open. */
export function EventsButton({ variant = "icon" }: { variant?: "icon" | "tile" | "panel" } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [events, setEvents] = useState<CanaanEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CanaanEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);

  // -- creation form --------------------------------------------------------
  const [tab, setTab] = useState<Tab>("user");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<ChatMember[]>([]);
  const [groups, setGroups] = useState<ChatConversation[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [targets, setTargets] = useState<{ type: Tab; id: number; label: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggleTarget(sel: { type: Tab; id: number; label: string }) {
    setTargets((prev) => {
      const exists = prev.some((t) => t.type === sel.type && t.id === sel.id);
      if (exists) return prev.filter((t) => !(t.type === sel.type && t.id === sel.id));
      return [...prev, sel];
    });
  }

  const refresh = () => {
    setLoading(true);
    eventsApi.listUpcoming().then(setEvents).catch(() => {}).finally(() => setLoading(false));
  };

  // Background refresh — no spinner, so an open list doesn't flicker.
  const refreshQuietly = () => {
    eventsApi.listUpcoming().then(setEvents).catch(() => {});
  };

  const refreshHistory = () => {
    setHistoryLoading(true);
    eventsApi.listHistory().then(setHistory).catch(() => {}).finally(() => {
      setHistoryLoading(false);
      setHistoryLoaded(true);
    });
  };

  // The hidden panel copy stays idle (no requests) until M opens it.
  const idle = variant === "panel" && !open;
  const idleRef = useRef(idle);
  useEffect(() => {
    idleRef.current = idle;
  });
  useEffect(() => {
    if (!idle) refresh();
  }, [idle]);

  // M opens and closes this dialog from anywhere (lib/shortcuts.ts).
  useShortcutPanel("meetings", () => (open ? closeAndReset() : setOpen(true)), { fallback: variant === "panel" });

  // The event_created/cancelled/completed pushes below never reach browsers in
  // production (cPanel/Passenger can't carry WebSockets), so the badge and
  // list also refresh on a timer and whenever the tab comes back into focus.
  const refreshRef = useRef(refreshQuietly);
  useEffect(() => {
    refreshRef.current = refreshQuietly;
  });
  useEffect(() => {
    const tick = () => {
      if (!document.hidden && !idleRef.current) refreshRef.current();
    };
    const id = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);

  useEffect(() => {
    if (view === "history") refreshHistory();
  }, [view]);

  useWebSocketEvent("event_created", () => !idleRef.current && refresh());
  useWebSocketEvent("event_cancelled", () => !idleRef.current && refresh());
  useWebSocketEvent("event_completed", () => {
    if (idleRef.current) return;
    refresh();
    if (historyLoaded) refreshHistory();
  });

  useEffect(() => {
    if (view !== "create") return;
    setPickerLoading(true);
    Promise.all([chatApi.listContacts(), chatApi.listConversations()])
      .then(([c, convs]) => {
        setContacts(c);
        setGroups(convs.filter((v) => v.kind === "group"));
      })
      .catch(() => showError("Could not load Canaan Chat contacts/groups."))
      .finally(() => setPickerLoading(false));
  }, [view]);

  function resetForm() {
    setView("list");
    setTab("user");
    setSearch("");
    setTitle("");
    setDescription("");
    setLocation("");
    setStartsAt(null);
    setTargets([]);
  }

  async function handleCreate() {
    if (!title.trim() || !startsAt || targets.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await eventsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startsAt: startsAt.toISOString(),
        targets: targets.map((t) => ({ type: t.type, id: t.id })),
      });
      const who = targets.length === 1 ? targets[0].label : `${targets.length} invitees`;
      showToast(`"${title.trim()}" scheduled for ${who}.`, "success");
      resetForm();
      refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not schedule this meeting.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(ev: CanaanEvent) {
    const confirmed = await confirmDelete(ev.title);
    if (!confirmed.isConfirmed) return;
    try {
      await eventsApi.cancel(ev.id);
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      showToast("Meeting cancelled.", "success");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not cancel this meeting.");
    }
  }

  async function handleComplete(ev: CanaanEvent) {
    if (completingId) return;
    const confirmed = await confirmAction("Mark as completed?", `"${ev.title}" will move to Meeting History.`, "Mark completed");
    if (!confirmed.isConfirmed) return;
    setCompletingId(ev.id);
    try {
      await eventsApi.complete(ev.id);
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      if (historyLoaded) refreshHistory();
      showToast("Meeting marked as completed.", "success");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not mark this meeting as completed.");
    } finally {
      setCompletingId(null);
    }
  }

  function handleDateChange(date: Date | null) {
    if (!date) {
      setStartsAt(null);
      return;
    }
    setStartsAt((prev) => {
      const combined = new Date(date);
      if (prev) combined.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
      return combined;
    });
  }

  function handleTimeChange(time: Date | null) {
    if (!time) return;
    setStartsAt((prev) => {
      const combined = prev ? new Date(prev) : new Date();
      combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
      return combined;
    });
  }

  const filteredContacts = contacts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const filteredGroups = groups.filter((g) => (g.title ?? "").toLowerCase().includes(search.toLowerCase()));

  function closeAndReset() {
    setOpen(false);
    resetForm();
  }

  return (
    <>
      {variant === "panel" ? null : variant === "tile" ? (
        <WorkspaceTile
          icon={CalendarClock}
          title="Meetings"
          shortcut={SHORTCUTS.meetings.key}
          summary={events.length > 0 ? `${events.length} upcoming · next ${formatWhen(events[0]?.startsAt ?? null)}` : isAdmin ? "Nothing scheduled · schedule a meeting" : "Nothing scheduled"}
          count={events.length}
          onClick={() => setOpen(true)}
        />
      ) : (
      <button
        type="button"
        aria-label="Events"
        title="Upcoming meetings"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition duration-300",
          "shadow-md focus:outline-none focus:ring-4 focus:ring-orange-solid/20",
          "border-orange-border bg-orange-surface text-orange-text hover:border-orange-border-strong"
        )}
      >
        <CalendarClock className="h-5 w-5 transition-transform duration-300 group-hover:text-orange-text-strong" />
        {events.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-solid px-1 text-caption-2-semibold text-on-solid">
            {events.length > 9 ? "9+" : events.length}
          </span>
        )}
      </button>
      )}

      <Dialog
        open={open}
        onClose={closeAndReset}
        title={view === "create" ? "Schedule a meeting" : view === "history" ? "Meeting History" : "Upcoming Meetings"}
        className="sm:max-w-md"
      >
        {view === "create" ? (
          <div className="flex flex-col gap-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title"
              className="w-full rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-sm outline-none focus:border-gold-solid focus:bg-background-primary-default focus:ring-2 focus:ring-gold-solid/20"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-sm outline-none focus:border-gold-solid focus:bg-background-primary-default focus:ring-2 focus:ring-gold-solid/20"
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <DatePickerInput
                  value={startsAt ? isoDay(startsAt) : ""}
                  onChange={(iso) => handleDateChange(iso ? new Date(`${iso}T00:00:00`) : null)}
                  dateFormat="dd MMM yyyy"
                  minDate={isoDay(new Date())}
                  placeholder="Date"
                  clearable={false}
                  aria-label="Event date"
                />
              </div>
              {/* Time: a plain list of 15-minute slots (the date above uses the app calendar). */}
              <div className="relative flex-1">
                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-text" />
                <select
                  aria-label="Event time"
                  value={startsAt ? hhmm(startsAt) : ""}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    const t = new Date();
                    t.setHours(h, m, 0, 0);
                    handleTimeChange(t);
                  }}
                  className={cn(pickerTriggerClass, "cursor-pointer appearance-none pl-9", startsAt ? "text-text-primary" : "text-text-tertiary")}
                >
                  <option value="" disabled>Time</option>
                  {startsAt && !TIME_SLOTS.some((s) => s.value === hhmm(startsAt)) && (
                    <option value={hhmm(startsAt)}>{hhmm(startsAt)}</option>
                  )}
                  {TIME_SLOTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="w-full rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-sm outline-none focus:border-gold-solid focus:bg-background-primary-default focus:ring-2 focus:ring-gold-solid/20"
            />

            <div className="flex gap-2 rounded-full bg-fill-2 p-1">
              {([
                { id: "user", label: "User" },
                { id: "group", label: "Group" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 rounded-full py-1.5 text-body-semibold transition-colors",
                    tab === t.id ? "bg-background-primary-default text-accent-text-strong shadow-sm" : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "user" ? "Search people…" : "Search groups…"}
                className="w-full rounded-full border border-separator-border bg-fill-1 py-2 pl-9 pr-3 text-sm outline-none focus:border-gold-solid focus:bg-background-primary-default focus:ring-2 focus:ring-gold-solid/20"
              />
            </div>

            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {pickerLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
                </div>
              ) : tab === "user" ? (
                filteredContacts.map((c) => {
                  const selected = targets.some((t) => t.type === "user" && t.id === Number(c.staffId));
                  return (
                    <button
                      key={c.staffId}
                      type="button"
                      onClick={() => toggleTarget({ type: "user", id: Number(c.staffId), label: c.name })}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-2 py-2 text-left transition-colors",
                        selected ? "border-orange-border bg-orange-surface" : "border-transparent hover:bg-fill-2"
                      )}
                    >
                      <Avatar name={c.name} photoUrl={c.photoUrl} size={32} />
                      <p className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{c.name}</p>
                      {selected && <Check className="h-4 w-4 shrink-0 text-orange-text" />}
                    </button>
                  );
                })
              ) : (
                filteredGroups.map((g) => {
                  const selected = targets.some((t) => t.type === "group" && t.id === g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleTarget({ type: "group", id: g.id, label: g.title ?? "Group" })}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-2 py-2 text-left transition-colors",
                        selected ? "border-orange-border bg-orange-surface" : "border-transparent hover:bg-fill-2"
                      )}
                    >
                      <Avatar name={g.title ?? "Group"} photoUrl={g.hasPhoto ? chatApi.groupPhotoUrl(g.id) : null} size={32} group seed={`group-${g.id}`} />
                      <p className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{g.title}</p>
                      {selected && <Check className="h-4 w-4 shrink-0 text-orange-text" />}
                    </button>
                  );
                })
              )}
            </div>

            {targets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {targets.map((t) => (
                  <span
                    key={`${t.type}-${t.id}`}
                    className="flex items-center gap-1 rounded-full border border-orange-border bg-orange-surface py-1 pl-2.5 pr-1 text-caption-1-medium text-orange-text"
                  >
                    {t.label}
                    <button
                      type="button"
                      onClick={() => toggleTarget(t)}
                      aria-label={`Remove ${t.label}`}
                      className="rounded-full p-0.5 text-orange-text transition-colors hover:bg-orange-surface-strong hover:text-orange-text"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView("list")}
                className="flex-1 rounded-full border border-separator-border py-2 text-body-semibold text-text-secondary transition-colors hover:bg-fill-2"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!title.trim() || !startsAt || targets.length === 0 || submitting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-orange-solid py-2 text-body-semibold text-on-solid shadow-sm transition hover:bg-orange-solid-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Schedule
              </button>
            </div>
          </div>
        ) : view === "history" ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setView("list")}
              className="self-start text-body-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              ← Back to upcoming
            </button>
            <p className="-mt-2 text-xs text-text-tertiary">
              {isAdmin ? "Completed meetings across everyone." : "Meetings you attended that are marked complete."}
            </p>

            {historyLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
              </div>
            ) : history.length === 0 ? (
              <EmptyState size="compact" illustration="no-data" title="No completed meetings yet" description="Meetings marked as completed will show up here" className="rounded-2xl border border-separator-border bg-background-primary-default" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {history.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-separator-border p-3.5">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success-surface">
                        <CheckCircle2 className="h-4 w-4 text-success-text" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-body-semibold text-text-primary">{ev.title}</p>
                        <p className="mt-0.5 text-caption-1-medium text-text-secondary">
                          {formatWhen(ev.startsAt)}{ev.location ? ` · ${ev.location}` : ""}
                        </p>
                      </div>
                    </div>
                    {ev.description && <p className="mt-2 pl-[42px] text-xs text-text-secondary">{ev.description}</p>}
                    <p className="mt-2 flex items-center gap-1 pl-[42px] text-[11px] text-text-tertiary">
                      <Users className="h-3 w-3" /> {ev.participantNames.join(", ")}
                    </p>
                    <p className="mt-1 pl-[42px] text-[11px] text-success-text">
                      Completed{ev.completedByName ? ` by ${ev.completedByName}` : ""}
                      {ev.completedAt ? ` · ${formatWhen(ev.completedAt)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setView("create")}
                  className="group flex flex-1 items-center justify-center gap-1.5 rounded-full border border-orange-border bg-orange-surface py-2.5 text-body-semibold text-orange-text shadow-md transition duration-300 hover:border-orange-border-strong shadow-md"
                >
                  <Plus className="h-4 w-4 transition-transform duration-300" />
                  New Meeting
                </button>
              )}
              <button
                type="button"
                onClick={() => setView("history")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full border border-separator-border py-2.5 text-body-semibold text-text-secondary transition-colors hover:bg-fill-2",
                  isAdmin ? "px-4" : "flex-1"
                )}
              >
                <History className="h-4 w-4" />
                History
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
              </div>
            ) : events.length === 0 ? (
              <EmptyState size="compact" illustration="no-data" title="No upcoming meetings" description={isAdmin ? "Scheduled meetings will appear here" : "You'll see meetings you're invited to here"} className="rounded-2xl border border-separator-border bg-background-primary-default" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="group rounded-xl border border-separator-border p-3.5 transition-colors hover:border-orange-border hover:bg-orange-surface-strong/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-surface">
                          <CalendarClock className="h-4 w-4 text-orange-text" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-body-semibold text-text-primary">{ev.title}</p>
                          <p className="mt-0.5 text-caption-1-medium text-orange-text">
                            {formatWhen(ev.startsAt)}{ev.location ? ` · ${ev.location}` : ""}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleCancel(ev)}
                          aria-label="Cancel meeting"
                          className="shrink-0 rounded-lg p-1.5 text-text-tertiary opacity-0 transition-colors group-hover:opacity-100 hover:bg-danger-surface-strong hover:text-danger-text"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {ev.description && <p className="mt-2 pl-[42px] text-xs text-text-secondary">{ev.description}</p>}
                    <p className="mt-2 flex items-center gap-1 pl-[42px] text-[11px] text-text-tertiary">
                      <Users className="h-3 w-3" /> {ev.participantNames.join(", ")}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleComplete(ev)}
                      disabled={completingId === ev.id}
                      className="mt-2.5 ml-[42px] flex items-center gap-1.5 rounded-full border border-success-border bg-success-surface px-3 py-1 text-caption-1-semibold text-success-text transition-colors hover:bg-success-surface-strong disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {completingId === ev.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Mark as Completed
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
