"use client";

import { useEffect, useState } from "react";
import { CircleDot, HandCoins, Loader2, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { tyreApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { TyreInventoryItem } from "@/types/tyre-inventory";

export type TyreAction = "sold" | "stock" | "retread" | "discard";

/** Sent to the backend (snake_case) — see schemas.TruckTyrePlan. */
export type TruckTyrePlan = {
  removed_date: string;
  removed_odometer: number;
  tyres: { fitment_id: number; action: TyreAction }[];
};

/** Readable copy for the Deletion Approvals page. */
export type TyrePlanRow = { tyre_number: string; position: string; action: TyreAction };

/** The date/odometer entered in the step (the sale date & odometer when selling), plus the sell-only fields. */
export type TruckStepDetails = { date: string; odometer: number; note: string; reason: string };

export const TYRE_ACTIONS: { value: TyreAction; label: string }[] = [
  { value: "sold", label: "Sold with the truck" },
  { value: "stock", label: "Return to stock" },
  { value: "retread", label: "Send to Retread Queue" },
  { value: "discard", label: "Discard" },
];
export const TYRE_ACTION_LABEL: Record<TyreAction, string> = Object.fromEntries(
  TYRE_ACTIONS.map((a) => [a.value, a.label]),
) as Record<TyreAction, string>;

// Short labels for the segmented control (full labels stay in TYRE_ACTIONS).
const ACTION_SHORT: Record<TyreAction, string> = {
  sold: "Sold with truck",
  stock: "To stock",
  retread: "Retread",
  discard: "Discard",
};

/** The app's pill toggle (same as Vendor / Individual, Active / Sold Trucks). */
function SegmentedChoice({
  value, onChange, label, size = "md",
}: { value: TyreAction | "" | undefined; onChange: (v: TyreAction) => void; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-full border border-gray-200 bg-gray-100 p-0.5 shadow-inner">
      {TYRE_ACTIONS.map((a) => {
        const on = value === a.value;
        return (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={a.label}
            onClick={() => onChange(a.value)}
            className={cn(
              "whitespace-nowrap rounded-full font-semibold transition-all duration-200",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              on
                ? "bg-brand-navy text-white shadow-[0_2px_6px_-1px_rgba(27,43,94,0.45)]"
                : "text-gray-500 hover:bg-white/70 hover:text-gray-800",
            )}
          >
            {ACTION_SHORT[a.value]}
          </button>
        );
      })}
    </div>
  );
}

// Plain field style (the shared form inputClass upper-cases text).
const FIELD_CLS =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors " +
  "placeholder:text-slate-300 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10";

type Props = {
  truck: Truck | null;
  /** "sell" adds the sale note (and shows even with no tyres fitted); every tyre option is offered for both. */
  mode: "sell" | "delete";
  /** Sell only: non-Admins send a request, so a reason is required. */
  requireReason?: boolean;
  onClose: () => void;
  /** Called with the choices; plan is null when the truck has no tyres fitted. */
  onConfirm: (plan: TruckTyrePlan | null, rows: TyrePlanRow[], details: TruckStepDetails) => void;
};

/**
 * The tyre step of Sell / Delete Truck. Every fitted tyre needs a choice —
 * there are no defaults. "Apply to all" sets every row; each row can then be
 * changed on its own. The date and odometer close every tyre's fitment.
 */
export function TruckTyreStepDialog({ truck, mode, requireReason = false, onClose, onConfirm }: Props) {
  const isSell = mode === "sell";
  const [fitments, setFitments] = useState<TyreFitmentRecord[]>([]);
  const [tyres, setTyres] = useState<Record<string, TyreInventoryItem>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [choices, setChoices] = useState<Record<string, TyreAction | "">>({});
  const [removedDate, setRemovedDate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!truck) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setChoices({});
    setNote("");
    setReason("");
    setRemovedDate(todayIst());
    setOdometer(truck.odometer ? String(Number(truck.odometer)) : "");
    Promise.all([tyreApi.listFitments(truck.id, true), tyreApi.listInventory()])
      .then(([fits, inventory]) => {
        if (cancelled) return;
        const open = fits.filter((f) => f.removedOdometer == null);
        setFitments(open);
        setTyres(Object.fromEntries(inventory.map((t) => [t.id, t])));
        // Nothing fitted — Delete skips the step entirely (Sell still needs its sale details).
        if (open.length === 0 && !isSell) {
          onConfirm(null, [], { date: todayIst(), odometer: Number(truck.odometer) || 0, note: "", reason: "" });
        }
      })
      .catch(() => !cancelled && setLoadError("Couldn't load this truck's tyres. Please try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Only re-runs for a different truck — not when the parent's onConfirm changes.
  }, [truck]);

  const odoNum = odometer === "" ? NaN : Number(odometer);
  const highestFitted = fitments.reduce((m, f) => Math.max(m, Number(f.fittedOdometer) || 0), 0);
  const latestFitted = fitments.reduce((m, f) => (f.fittedDate > m ? f.fittedDate : m), "");
  const odoError = !Number.isFinite(odoNum)
    ? "Enter the odometer reading."
    : odoNum < highestFitted
      ? `Must be at least ${highestFitted.toLocaleString("en-IN")} km (the highest fitted odometer).`
      : "";
  const dateError = !removedDate ? "Pick a date." : latestFitted && removedDate < latestFitted ? "Can't be before a tyre was fitted." : "";
  const unchosen = fitments.filter((f) => !choices[f.id]).length;

  const canConfirm =
    (fitments.length > 0 || isSell) && unchosen === 0 && !odoError && !dateError && (!requireReason || !!reason.trim());

  function applyToAll(action: TyreAction | "") {
    if (!action) return;
    setChoices(Object.fromEntries(fitments.map((f) => [f.id, action])));
  }

  function confirm() {
    if (!canConfirm) return;
    const details: TruckStepDetails = { date: removedDate, odometer: odoNum, note: note.trim(), reason: reason.trim() };
    if (fitments.length === 0) {
      onConfirm(null, [], details);
      return;
    }
    onConfirm(
      {
        removed_date: removedDate,
        removed_odometer: odoNum,
        tyres: fitments.map((f) => ({ fitment_id: parseInt(f.id), action: choices[f.id] as TyreAction })),
      },
      fitments.map((f) => ({
        tyre_number: tyres[f.tyreId]?.tyreNumber ?? `#${f.tyreId}`,
        position: f.position,
        action: choices[f.id] as TyreAction,
      })),
      details,
    );
  }

  if (!truck) return null;

  const choiceCounts = TYRE_ACTIONS.map((a) => ({
    ...a,
    count: fitments.filter((f) => choices[f.id] === a.value).length,
  }));

  return (
    <Dialog open={truck !== null} onClose={onClose} title={isSell ? "Sell Truck" : "What happens to the tyres?"} className="max-w-3xl">
      {/* Truck */}
      <div className="mb-5 flex items-center gap-3">
        <span className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          isSell ? "bg-brand-navy/10 text-brand-navy" : "bg-rose-50 text-rose-500",
        )}>
          {isSell ? <HandCoins className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {truck.registrationNumber}
            <span className="font-normal text-slate-400"> · {truck.truckId}</span>
          </p>
          <p className="text-xs text-slate-500">
            {isSell ? "Being sold" : "Being deleted"}
            {fitments.length > 0 && ` — choose what happens to each of its ${fitments.length} tyre${fitments.length === 1 ? "" : "s"}.`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : loadError ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{loadError}</p>
      ) : fitments.length === 0 && !isSell ? null : (
        <div className="flex flex-col gap-5">
          {fitments.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              No tyres are fitted on this truck.
            </p>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-200">
              {/* Apply to all */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Apply to all tyres</p>
                  <p className="mt-0.5 text-xs text-slate-500">Then change any tyre on its own below.</p>
                </div>
                <SegmentedChoice
                  label="Apply one choice to every tyre"
                  value={fitments.length > 0 && fitments.every((f) => choices[f.id] === choices[fitments[0].id]) ? choices[fitments[0].id] : ""}
                  onChange={applyToAll}
                />
              </div>

              {/* One row per tyre */}
              <ul className="max-h-[42vh] divide-y divide-slate-100 overflow-y-auto bg-white">
                {fitments.map((f) => {
                  const t = tyres[f.tyreId];
                  const chosen = choices[f.id];
                  return (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-slate-50/60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
                        <CircleDot className="h-4 w-4" />
                      </span>
                      <div className="min-w-[160px] flex-1">
                        <p className="flex items-center gap-1.5 font-mono text-[13px] font-semibold text-slate-800">
                          {t?.tyreNumber ?? `#${f.tyreId}`}
                          {!chosen && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Needs a choice" />}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {f.position}
                          {t && ` · ${t.brand}${t.tyreType ? ` ${t.tyreType.toLowerCase()}` : ""}`}
                          {t?.condition && ` · ${t.condition}`}
                        </p>
                      </div>
                      <SegmentedChoice
                        size="sm"
                        label={`What happens to tyre ${t?.tyreNumber ?? f.tyreId}`}
                        value={chosen}
                        onChange={(v) => setChoices((prev) => ({ ...prev, [f.id]: v }))}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Date + odometer (the sale date/odometer when selling) */}
          <section className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {isSell ? "Sale date" : "Removal date"}
              </span>
              <DatePickerInput value={removedDate} onChange={setRemovedDate} required />
              {dateError && <p className="text-xs text-rose-600">{dateError}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {isSell ? "Odometer at sale" : "Odometer"}
              </span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  className={FIELD_CLS + " pr-12 tabular-nums"}
                  placeholder="e.g. 85000"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">km</span>
              </div>
              {odoError && <p className="text-xs text-rose-600">{odoError}</p>}
            </div>

            {isSell && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Sale note <span className="normal-case tracking-normal text-slate-300">(optional)</span>
                </span>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={FIELD_CLS + " h-auto py-2"}
                  placeholder="e.g. buyer, amount, anything worth keeping"
                />
              </div>
            )}
            {isSell && requireReason && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Reason for request <span className="text-rose-500">*</span>
                </span>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={FIELD_CLS + " h-auto py-2"}
                  placeholder="The sale goes to Deletion Approvals for an Admin to approve."
                />
              </div>
            )}
          </section>

          {/* Summary + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {unchosen > 0 ? (
                <span className="flex items-center gap-1.5 font-semibold text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {unchosen} of {fitments.length} tyre{fitments.length === 1 ? "" : "s"} still need a choice
                </span>
              ) : (
                choiceCounts.filter((c) => c.count > 0).map((c) => (
                  <span key={c.value} className="flex items-center gap-1.5 text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-navy/60" />
                    <span className="font-semibold tabular-nums text-slate-700">{c.count}</span> {c.label.toLowerCase()}
                  </span>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={confirm}
                className="rounded-full bg-brand-navy px-5 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-2px_rgba(27,43,94,0.5)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {isSell ? (requireReason ? "Send Sell Request" : "Sell Truck") : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
