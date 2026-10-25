"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, Gauge, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { trucksApi, type OdometerInfo } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import { showError, showSuccess } from "@/lib/swal";
import type { Truck } from "@/types/truck";

const km = (n: number) => `${n.toLocaleString("en-IN")} km`;

/** Our Fleet → Admin's pencil on a truck's odometer chip. The only way the
 *  current odometer is set by hand or goes down (trip sheets only move it up);
 *  every correction is kept with its reason. */
export function OdometerCorrectionDialog({
  truck, onClose, onSaved,
}: { truck: Truck | null; onClose: () => void; onSaved: (saved: Truck) => void }) {
  const [info, setInfo] = useState<OdometerInfo | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!truck) return;
    setInfo(null);
    setValue("");
    setReason("");
    trucksApi.getOdometerInfo(truck.id).then(setInfo).catch(() => showError("Couldn't load the odometer details."));
  }, [truck]);

  const current = info?.odometer ?? Number(truck?.odometer || 0);
  const next = value === "" ? null : Number(value);
  const unchanged = next !== null && next === current;
  // A correction below what the truck's own trip sheets / maintenance records
  // say it has already done — allowed (that's how typos are fixed), but flagged.
  const below = next === null || !info ? [] : [
    info.maxTripSheetEndKm != null && next < info.maxTripSheetEndKm ? `its highest trip sheet End KM (${km(info.maxTripSheetEndKm)})` : null,
    info.maxMaintenanceOdometer != null && next < info.maxMaintenanceOdometer ? `its highest maintenance record (${km(info.maxMaintenanceOdometer)})` : null,
  ].filter((x): x is string => x !== null);
  const canSave = next !== null && next >= 0 && !unchanged && reason.trim() !== "" && !saving;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!truck || !canSave || next === null) return;
    setSaving(true);
    try {
      const saved = await trucksApi.correctOdometer(truck.id, next, reason.trim());
      showSuccess(`Odometer corrected to ${km(next)}.`);
      onSaved(saved);
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to correct the odometer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={truck !== null} onClose={onClose} title={truck ? `Correct Odometer — ${truck.registrationNumber}` : "Correct Odometer"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <Gauge className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Current Odometer</span>
          <span className="ml-auto text-sm font-bold tabular-nums text-blue-800">{km(current)}</span>
        </div>

        {info && (info.maxTripSheetEndKm != null || info.maxMaintenanceOdometer != null) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-gray-400">Highest trip sheet End KM</p>
              <p className="font-semibold tabular-nums text-gray-700">{info.maxTripSheetEndKm != null ? km(info.maxTripSheetEndKm) : "—"}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-gray-400">Highest maintenance record</p>
              <p className="font-semibold tabular-nums text-gray-700">{info.maxMaintenanceOdometer != null ? km(info.maxMaintenanceOdometer) : "—"}</p>
            </div>
          </div>
        )}

        <Field label="Correct reading (km)" required>
          <DecimalInput type="number"
            required
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
            placeholder="e.g. 808233"
          />
          {unchanged && <p className="mt-1 text-xs text-red-600">That is already the current reading.</p>}
        </Field>

        {below.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              This is below {below.join(" and ")}. If one of those is a typo, correct it there too —
              otherwise the next trip sheet will move the odometer back up to it.
            </p>
          </div>
        )}

        <Field label="Reason" required>
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            rows={2}
            placeholder="e.g. End KM typo on TRP-1282"
          />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">Correction History</p>
          {!info ? (
            <div className="flex items-center gap-2 py-3 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
          ) : info.corrections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-center text-xs text-gray-400">No corrections yet.</p>
          ) : (
            <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
              {info.corrections.map((c) => (
                <li key={c.id} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold tabular-nums text-gray-800">
                    {km(c.oldOdometer)} <ArrowRight className="h-3 w-3 text-gray-400" /> {km(c.newOdometer)}
                    <span className="ml-auto font-normal text-gray-400">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-gray-600">{c.reason}</p>
                  <p className="text-gray-400">by {c.actorName}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95">
            Cancel
          </button>
          <button type="submit" disabled={!canSave}
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "Saving…" : "Correct Odometer"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
