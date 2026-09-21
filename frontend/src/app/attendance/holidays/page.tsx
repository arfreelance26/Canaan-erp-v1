"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarOff, Plus, Trash2, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { attendanceApi } from "@/lib/api";
import type { Holiday } from "@/types/attendance";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError, confirmDelete } from "@/lib/swal";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

// Pill-shaped form field, same height as the buttons beside it.
const FIELD =
  "h-10 rounded-full border border-gray-200 bg-white px-4 shadow-sm dark:border-gray-300/30 dark:bg-gray-200 transition-shadow focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

// Sundays are automatic weekly holidays and are NOT stored — this screen manages
// government/company holidays only, which drive the staff attendance calculation.
export default function HolidaysPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"Government" | "Company">("Company");

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Holidays</h1>
          <p className="mt-1 text-sm text-gray-500">
            Government &amp; company holidays for staff attendance. Sundays are automatic weekly holidays.
          </p>
        </div>
        <div className="dk-inset flex h-10 items-center rounded-full border border-gray-200 bg-white px-1 shadow-sm transition-transform duration-300 hover:scale-105 hover:shadow-md">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[56px] text-center text-sm font-semibold tabular-nums text-gray-800">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add holiday card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-bold text-gray-800">Add a holiday</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="pl-3 text-xs font-medium text-gray-500">Date</label>
            <div className={`${FIELD} flex w-[150px] items-center [&>div]:w-full [&_.border-brand-gold]:!border-0 [&_.border-brand-gold]:!bg-transparent [&_.border-brand-gold]:!px-0 [&_.border-brand-gold]:!py-1 [&_.border-brand-gold]:!shadow-none [&_.border-brand-gold_svg]:!text-gray-500 [&_input]:!text-gray-900 [&_input::placeholder]:!text-gray-400`}>
              <DatePickerInput value={newDate} onChange={setNewDate} placeholder="Pick a date" />
            </div>
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label className="pl-3 text-xs font-medium text-gray-500">Holiday name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Independence Day"
              className={`${FIELD} w-full text-sm text-gray-900 outline-none placeholder:text-gray-400`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="pl-3 text-xs font-medium text-gray-500">Type</label>
            <div className="relative">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "Government" | "Company")}
                className={`${FIELD} w-[150px] cursor-pointer appearance-none pr-10 text-sm text-gray-900 outline-none`}
              >
                <option value="Government">Government</option>
                <option value="Company">Company</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {/* Holiday list */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <p className="text-sm font-bold text-gray-800">{year} Holidays</p>
          <span className="ml-auto text-xs text-gray-400">{sortedHolidays.length} listed</span>
        </div>
        {sortedHolidays.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <CalendarOff className="h-7 w-7 text-gray-300" />
            <p className="text-sm text-gray-400">No holidays added for {year} yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sortedHolidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50">
                  <span className="text-sm font-extrabold leading-none text-blue-600">
                    {new Date(h.date + "T00:00:00").getDate()}
                  </span>
                  <span className="text-[9px] font-semibold uppercase text-blue-400">
                    {new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{h.name}</p>
                  <p className="text-xs text-gray-400">{fmtDate(h.date)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${h.type === "Government" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
                  {h.type}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(h)}
                  className="rounded-full p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Remove holiday"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
