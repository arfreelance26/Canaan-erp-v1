"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import ReactDatePicker from "react-datepicker";
import { CalendarClock, CalendarDays, Check, CheckCircle2, Clock, History, Loader2, Plus, Search, Trash2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/Dialog";
import { Avatar } from "@/components/chat/shared";
import { chatApi, eventsApi, type CanaanEvent } from "@/lib/api";
import type { ChatMember, ChatConversation } from "@/types/chat";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { showError, showToast, confirmDelete, confirmAction } from "@/lib/swal";

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
  "flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm outline-none transition-colors",
  "focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
);

const EventDateTrigger = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ value, onClick }, ref) => (
    <button ref={ref} type="button" onClick={onClick} className={cn(pickerTriggerClass, value ? "text-gray-800" : "text-gray-400")}>
      <CalendarDays className="h-4 w-4 shrink-0 text-orange-400" />
      <span className="truncate">{value || "Date"}</span>
    </button>
  )
);
EventDateTrigger.displayName = "EventDateTrigger";

const EventTimeTrigger = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ value, onClick }, ref) => (
    <button ref={ref} type="button" onClick={onClick} className={cn(pickerTriggerClass, value ? "text-gray-800" : "text-gray-400")}>
      <Clock className="h-4 w-4 shrink-0 text-orange-400" />
      <span className="truncate">{value || "Time"}</span>
    </button>
  )
);
EventTimeTrigger.displayName = "EventTimeTrigger";

/**
 * Admin-schedules-a-meeting button — sits between Invite (left) and
 * Calculator (right) in the Topbar. Picks participants the same way as
 * Invite (a Canaan Chat user or group); everyone sees their own upcoming
 * meetings here, only Admin can create or cancel one. See
 * EventReminderListener (mounted in AppShell) for the live "starting now"
 * push this feeds into.
 */
export function EventsButton() {
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

  useEffect(() => {
    refresh();
  }, []);

  // The event_created/cancelled/completed pushes below never reach browsers in
  // production (cPanel/Passenger can't carry WebSockets), so the badge and
  // list also refresh on a timer and whenever the tab comes back into focus.
  const refreshRef = useRef(refreshQuietly);
  useEffect(() => {
    refreshRef.current = refreshQuietly;
  });
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) refreshRef.current();
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

  useWebSocketEvent("event_created", refresh);
  useWebSocketEvent("event_cancelled", refresh);
  useWebSocketEvent("event_completed", () => {
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
      <button
        type="button"
        aria-label="Events"
        title="Upcoming meetings"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300",
          "hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(194,101,30,0.22)] focus:outline-none focus:ring-4 focus:ring-orange-500/20",
          "border-orange-200 bg-gradient-to-br from-orange-50 to-white text-orange-700 hover:border-orange-300 hover:from-orange-100"
        )}
      >
        <CalendarClock className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-hover:text-orange-800" />
        {events.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
            {events.length > 9 ? "9+" : events.length}
          </span>
        )}
      </button>

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
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
            />
            <div className="flex gap-2">
              <ReactDatePicker
                selected={startsAt}
                onChange={handleDateChange}
                dateFormat="dd MMM yyyy"
                minDate={new Date()}
                popperPlacement="bottom-start"
                portalId="event-date-picker-portal"
                calendarClassName="canaan-calendar"
                wrapperClassName="flex-1"
                customInput={<EventDateTrigger />}
              />
              <ReactDatePicker
                selected={startsAt}
                onChange={handleTimeChange}
                showTimeSelect
                showTimeSelectOnly
                timeIntervals={15}
                timeCaption="Time"
                dateFormat="h:mm aa"
                popperPlacement="bottom-start"
                portalId="event-time-picker-portal"
                calendarClassName="canaan-calendar"
                wrapperClassName="flex-1"
                customInput={<EventTimeTrigger />}
              />
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
            />

            <div className="flex gap-2 rounded-full bg-gray-100 p-1">
              {([
                { id: "user", label: "User" },
                { id: "group", label: "Group" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 rounded-full py-1.5 text-sm font-semibold transition-colors",
                    tab === t.id ? "bg-white text-brand-navy shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "user" ? "Search people…" : "Search groups…"}
                className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
              />
            </div>

            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {pickerLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
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
                        selected ? "border-orange-200 bg-orange-50" : "border-transparent hover:bg-gray-50"
                      )}
                    >
                      <Avatar name={c.name} photoUrl={c.photoUrl} size={32} />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{c.name}</p>
                      {selected && <Check className="h-4 w-4 shrink-0 text-orange-600" />}
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
                        selected ? "border-orange-200 bg-orange-50" : "border-transparent hover:bg-gray-50"
                      )}
                    >
                      <Avatar name={g.title ?? "Group"} photoUrl={g.hasPhoto ? chatApi.groupPhotoUrl(g.id) : null} size={32} group />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{g.title}</p>
                      {selected && <Check className="h-4 w-4 shrink-0 text-orange-600" />}
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
                    className="flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 py-1 pl-2.5 pr-1 text-xs font-medium text-orange-700"
                  >
                    {t.label}
                    <button
                      type="button"
                      onClick={() => toggleTarget(t)}
                      aria-label={`Remove ${t.label}`}
                      className="rounded-full p-0.5 text-orange-400 transition-colors hover:bg-orange-100 hover:text-orange-700"
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
                className="flex-1 rounded-full border border-gray-200 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!title.trim() || !startsAt || targets.length === 0 || submitting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-orange-600 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="self-start text-sm font-semibold text-gray-500 transition-colors hover:text-gray-700"
            >
              ← Back to upcoming
            </button>
            <p className="-mt-2 text-xs text-gray-400">
              {isAdmin ? "Completed meetings across everyone." : "Meetings you attended that are marked complete."}
            </p>

            {historyLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <History className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-600">No completed meetings yet</p>
                <p className="mt-1 text-xs text-gray-400">Meetings marked as completed will show up here.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {history.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-gray-100 p-3.5">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{ev.title}</p>
                        <p className="mt-0.5 text-xs font-medium text-gray-500">
                          {formatWhen(ev.startsAt)}{ev.location ? ` · ${ev.location}` : ""}
                        </p>
                      </div>
                    </div>
                    {ev.description && <p className="mt-2 pl-[42px] text-xs text-gray-500">{ev.description}</p>}
                    <p className="mt-2 flex items-center gap-1 pl-[42px] text-[11px] text-gray-400">
                      <Users className="h-3 w-3" /> {ev.participantNames.join(", ")}
                    </p>
                    <p className="mt-1 pl-[42px] text-[11px] text-green-700">
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
                  className="group flex flex-1 items-center justify-center gap-1.5 rounded-full border border-orange-200 bg-gradient-to-br from-orange-50 to-white py-2.5 text-sm font-semibold text-orange-700 shadow-[0_2px_10px_-3px_rgba(194,101,30,0.15)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-300 hover:from-orange-100 hover:shadow-[0_8px_24px_-6px_rgba(194,101,30,0.3)]"
                >
                  <Plus className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                  New Meeting
                </button>
              )}
              <button
                type="button"
                onClick={() => setView("history")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50",
                  isAdmin ? "px-4" : "flex-1"
                )}
              >
                <History className="h-4 w-4" />
                History
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-50">
                  <CalendarClock className="h-5 w-5 text-orange-400" />
                </div>
                <p className="text-sm font-semibold text-gray-600">No upcoming meetings</p>
                <p className="mt-1 text-xs text-gray-400">
                  {isAdmin ? "Scheduled meetings will appear here." : "You'll see meetings you're invited to here."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="group rounded-xl border border-gray-100 p-3.5 transition-colors hover:border-orange-100 hover:bg-orange-50/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50">
                          <CalendarClock className="h-4 w-4 text-orange-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{ev.title}</p>
                          <p className="mt-0.5 text-xs font-medium text-orange-600">
                            {formatWhen(ev.startsAt)}{ev.location ? ` · ${ev.location}` : ""}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleCancel(ev)}
                          aria-label="Cancel meeting"
                          className="shrink-0 rounded-lg p-1.5 text-gray-300 opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {ev.description && <p className="mt-2 pl-[42px] text-xs text-gray-500">{ev.description}</p>}
                    <p className="mt-2 flex items-center gap-1 pl-[42px] text-[11px] text-gray-400">
                      <Users className="h-3 w-3" /> {ev.participantNames.join(", ")}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleComplete(ev)}
                      disabled={completingId === ev.id}
                      className="mt-2.5 ml-[42px] flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
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
