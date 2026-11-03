"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { RiCalendarCloseLine as CalendarOff, RiAddLine as Plus, RiDeleteBinLine as Trash2, RiCalendar2Line as CalendarDays, RiArrowLeftSLine as ChevronLeft, RiArrowRightSLine as ChevronRight, RiArrowDownSLine as ChevronDown, RiLoader4Line as Loader2, RiHistoryLine as History, RiPencilLine as Pencil } from "@remixicon/react";
import { attendanceApi, type HolidayEditEventRow } from "@/lib/api";
import type { Holiday } from "@/types/attendance";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError, confirmDelete } from "@/lib/feedback";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
const EDIT_EVENT_ICON: Record<HolidayEditEventRow["event"], typeof Plus> = {
  "Holiday Created": Plus,
  "Holiday Updated": Pencil,
  "Holiday Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<HolidayEditEventRow["event"], string> = {
  "Holiday Created": "bg-accent-surface-strong text-accent-text",
  "Holiday Updated": "bg-warning-surface-strong text-warning-text",
  "Holiday Deleted": "bg-danger-surface-strong text-danger-text",
};

// Pill-shaped form field, same height as the buttons beside it.
const FIELD =
  "h-10 rounded-full border border-separator-border bg-background-primary-default px-4 shadow-sm transition-shadow focus-within:border-accent-solid focus-within:ring-4 focus-within:ring-accent-solid/10 focus:border-accent-solid focus:ring-4 focus:ring-accent-solid/10";

// Sundays are automatic weekly holidays and are NOT stored — this screen manages
// government/company holidays only, which drive the staff attendance calculation.
export default function HolidaysPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"Government" | "Company">("Company");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<HolidayEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    attendanceApi.listHolidayEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  function load() {
    setLoading(true);
    attendanceApi
      .listHolidays(`${year}-01-01`, `${year}-12-31`)
      .then(setHolidays)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [year]);
  useWebSocketEvent("attendance_updated", load);

  const sortedHolidays = useMemo(
    () => [...holidays].sort((a, b) => a.date.localeCompare(b.date)),
    [holidays]
  );

  async function handleAdd() {
    if (saving) return;
    if (!newDate) { showError("Please pick a date."); return; }
    if (!newName.trim()) { showError("Please enter a holiday name."); return; }
    setSaving(true);
    try {
      const saved = await attendanceApi.createHoliday(newDate, newName.trim(), newType);
      setHolidays((prev) => [...prev.filter((h) => h.date !== saved.date), saved]);
      setNewDate(""); setNewName(""); setNewType("Government");
      showSuccess("Holiday added.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to add holiday.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(h: Holiday) {
    const ok = await confirmDelete(`${h.name} (${fmtDate(h.date)})`);
    if (!ok) return;
    try {
      await attendanceApi.deleteHoliday(h.id);
      setHolidays((prev) => prev.filter((x) => x.id !== h.id));
      showSuccess("Holiday removed.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to remove holiday.");
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  }

  if (loading) return <PageSkeleton hasButton hasSearch={false} columns={4} />;

  return (
    <div className="animate-stagger flex w-full flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning-border bg-warning-surface text-warning-text shadow-sm">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Staff Holidays</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Government &amp; company holidays for staff attendance. Sundays are automatic weekly holidays.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
        <div className="flex h-10 items-center rounded-full border border-separator-border bg-background-primary-default px-1 shadow-sm transition-transform duration-300 hover:shadow-md">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-fill-3 hover:text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[56px] text-center text-body-semibold tabular-nums text-text-primary">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-fill-3 hover:text-text-primary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        </div>
      </div>

      {/* Add holiday card */}
      <div className="rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm">
        <p className="mb-3 text-body-semibold text-text-primary">Add a holiday</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="pl-3 text-caption-1-medium text-text-secondary">Date</label>
            <div className={`${FIELD} flex w-[150px] items-center [&>div]:w-full [&_.border-gold-solid]:!border-0 [&_.border-gold-solid]:!bg-transparent [&_.border-gold-solid]:!px-0 [&_.border-gold-solid]:!py-1 [&_.border-gold-solid]:!shadow-none [&_.border-brand-gold_svg]:!text-text-secondary [&_input]:!text-text-primary [&_input::placeholder]:!text-text-tertiary`}>
              <DatePickerInput value={newDate} onChange={setNewDate} placeholder="Pick a date" />
            </div>
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label className="pl-3 text-caption-1-medium text-text-secondary">Holiday name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Independence Day"
              className={`${FIELD} w-full text-sm text-text-primary outline-none placeholder:text-text-placeholder`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="pl-3 text-caption-1-medium text-text-secondary">Type</label>
            <div className="relative">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "Government" | "Company")}
                className={`${FIELD} w-[150px] cursor-pointer appearance-none pr-10 text-sm text-text-primary outline-none`}
              >
                <option value="Government">Government</option>
                <option value="Company">Company</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {/* Holiday list */}
      <div className="overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
        <div className="flex items-center gap-2 border-b border-separator-border px-5 py-3.5">
          <CalendarDays className="h-4 w-4 text-text-tertiary" />
          <p className="text-body-semibold text-text-primary">{year} Holidays</p>
          <span className="ml-auto text-xs text-text-tertiary">{sortedHolidays.length} listed</span>
        </div>
        {sortedHolidays.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <CalendarOff className="h-7 w-7 text-text-tertiary" />
            <p className="text-sm text-text-tertiary">No holidays added for {year} yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-separator-border">
            {sortedHolidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-5 py-3 hover:bg-fill-2">
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-accent-surface">
                  <span className="text-body-semibold leading-none text-accent-text">
                    {new Date(h.date + "T00:00:00").getDate()}
                  </span>
                  <span className="text-[9px] font-semibold uppercase text-accent-text">
                    {new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-semibold text-text-primary">{h.name}</p>
                  <p className="text-xs text-text-tertiary">{fmtDate(h.date)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-caption-2-semibold ${h.type === "Government" ? "bg-success-surface-strong text-success-text" : "bg-teal-surface-strong text-teal-text"}`}>
                  {h.type}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(h)}
                  className="rounded-full p-2 text-text-tertiary transition-colors hover:bg-danger-surface-strong hover:text-danger-text"
                  title="Remove holiday"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          holiday, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by holiday name or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q || ev.name.toLowerCase().includes(q) || ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No holiday edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Holiday</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator-border">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            {ev.name} <span className="text-caption-2-regular text-text-tertiary">({ev.holidayDate})</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
