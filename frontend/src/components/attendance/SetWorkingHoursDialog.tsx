"use client";

import { useEffect, useState } from "react";
import { securityApi } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { showError, showSuccess } from "@/lib/swal";

type Props = {
  open: boolean;
  onClose: () => void;
};

// Sets how many hours of genuine inactivity (no real logged activity, not
// just elapsed time since check-in) it takes before the system auto-closes
// an open shift — safe for split/dynamic schedules (morning, afternoon,
// late night, with gaps between) since continued real use keeps resetting
// the clock; it only fires once someone's actually gone quiet that long.
// The on/off switch and the hours value used to be two separate header
// controls — merged back into one dialog since they're really one setting
// (whether the sweep runs at all, and if so how long it waits), not two.
export function SetWorkingHoursDialog({ open, onClose }: Props) {
  const [hours, setHours] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    Promise.all([securityApi.getMaxShiftHours(), securityApi.getAutoCloseEnabled()])
      .then(([h, e]) => { setHours(String(h)); setEnabled(e); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the current settings."))
      .finally(() => setLoading(false));
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(hours);
    if (!Number.isInteger(value) || value < 1 || value > 24) {
      setError("Enter a whole number of hours between 1 and 24.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const [saved] = await Promise.all([
        securityApi.updateMaxShiftHours(value),
        securityApi.updateAutoCloseEnabled(enabled),
      ]);
      showSuccess(
        enabled
          ? `Shifts will close automatically after ${saved} hours of inactivity.`
          : "Auto-closing shifts is off — only manual Close Shift will end a shift."
      );
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save working hours.";
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} title="Auto-Close Settings">
      <form onSubmit={save} className="flex flex-col gap-4 p-1">
        <p className="text-sm text-gray-600">
          A shift that hasn&apos;t been closed by the staff member is closed automatically once this many
          hours pass with no real activity from them — not just elapsed time since check-in, so someone
          working a split schedule (morning, then evening, then late night) is never cut off mid-shift.
          The check-out time recorded is their real last activity, and the shift is marked &ldquo;Auto-closed.&rdquo;
        </p>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-700">Auto-Close Shifts</p>
            <p className="text-xs text-gray-500">Manual &ldquo;Close Shift&rdquo; always works either way.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={loading}
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              enabled ? "bg-emerald-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className={`font-medium ${enabled ? "text-gray-700" : "text-gray-400"}`}>
            Auto-close after this many hours of inactivity
          </span>
          <input
            type="number"
            min={1}
            max={24}
            step={1}
            required
            disabled={loading || !enabled}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
