"use client";

import { useEffect, useState, type FormEvent } from "react";
import { IndianRupee } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { maintenanceTypesApi } from "@/lib/api";
import { showSuccess, showError } from "@/lib/swal";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: (rate: string | null) => void;
};

export function SetBaseMaintenanceCostDialog({ open, onClose, onSaved }: Props) {
  const [ratePerKm, setRatePerKm] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    maintenanceTypesApi
      .getBaseConfig()
      .then((cfg) => {
        setRatePerKm(cfg.cost_per_km != null ? String(parseFloat(cfg.cost_per_km)) : "");
        setLastUpdated(cfg.updated_at);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const value = parseFloat(ratePerKm);
    if (isNaN(value) || value < 0) return;
    setSaving(true);
    try {
      const cfg = await maintenanceTypesApi.setBaseConfig(value);
      setLastUpdated(cfg.updated_at);
      onSaved?.(cfg.cost_per_km != null ? parseFloat(cfg.cost_per_km).toFixed(2) : null);
      showSuccess("Base maintenance rate saved.");
      onClose();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set Base Maintenance Cost"
      className="max-w-sm"
    >
      {/* Header icon + description */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/30">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-200 dark:bg-blue-800/60">
          <IndianRupee className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Set the base maintenance cost per kilometre for the fleet. This rate is saved as a
          reference value for future use.
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <Field label="Base Maintenance Rate per Km (₹) *">
          {loading ? (
            <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ) : (
            <input
              type="number"
              className={inputClass}
              required
              min="0"
              step="0.01"
              placeholder="e.g. 2.50"
              value={ratePerKm}
              onChange={(e) => setRatePerKm(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
            />
          )}
          {lastUpdated && (
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Last updated:{" "}
              {new Date(lastUpdated).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </Field>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || loading}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Rate"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
