"use client";

import { useEffect, useState } from "react";
import { securityApi } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { showError, showSuccess } from "@/lib/swal";

type Props = {
  open: boolean;
  onClose: () => void;
};

// Sets how long a staff shift may run from check-in before the system closes it automatically.
// This is a limit, not a clock time, so it works for shifts ending at 5, 6 or 8 PM alike.
export function SetWorkingHoursDialog({ open, onClose }: Props) {
  const [hours, setHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    securityApi
      .getMaxShiftHours()
      .then((h) => setHours(String(h)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the current limit."))
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
      const saved = await securityApi.updateMaxShiftHours(value);
      showSuccess(`Shifts will close automatically ${saved} hours after check-in.`);
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
    <Dialog open={open} onClose={() => !saving && onClose()} title="Set Working Hours">
      <form onSubmit={save} className="flex flex-col gap-4 p-1">
        <p className="text-sm text-gray-600">
          A shift that hasn&apos;t been closed by the staff member is closed automatically this many hours
          after check-in. The check-out time recorded is that exact limit, and the shift is marked
          &ldquo;Auto-closed.&rdquo;
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Maximum shift length (hours)</span>
          <input
            type="number"
            min={1}
            max={24}
            step={1}
            required
            disabled={loading}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
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
