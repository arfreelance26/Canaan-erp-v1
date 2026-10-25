"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRight, ChevronDown, Info, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { plSummaryApi, type TripBreakdown, type TripBreakdownCost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/Segmented";

type Mode = "Manual" | "Basic" | "Advanced";

type Props = {
  open: boolean;
  onClose: () => void;
  /** trips.id of the row clicked on Profitability → Trip Profitability. */
  tripId: number | null;
  /** The page's mode — the window opens on it and can switch on its own. */
  mode: Mode;
};

const fmt = (v: number) =>
  `₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned = (v: number) => `${v < 0 ? "−" : ""}${fmt(v)}`;
const fmtRate = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;
const fmtKm = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 1 });

const PART_LABEL: Record<string, string> = {
  emi: "EMI",
  tyre: "Tyres",
  maintenance: "Maintenance",
  compliance: "Documents / Compliance",
};
const PART_SOURCE: Record<Mode, Record<string, string>> = {
  Manual: {
    emi: "Running Cost Calculator → Manual",
    tyre: "Running Cost Calculator → Manual",
    maintenance: "Running Cost Calculator → Manual",
    compliance: "Running Cost Calculator → Manual",
  },
  Basic: {
    emi: "Finance → EMI (daily cost ÷ km per day for the tyre layout)",
    tyre: "Tyre cost for this truck's tyre layout",
    maintenance: "Truck Maintenance records (cost per km)",
    compliance: "Compliance & Renewals (cost per km)",
  },
  Advanced: {
    emi: "Finance → EMI (daily cost ÷ this truck's monthly average km)",
    tyre: "Tyres fitted on this truck (cost ÷ expected range)",
    maintenance: "Truck Maintenance (per day ÷ monthly average km)",
    compliance: "Compliance & Renewals (per day ÷ monthly average km)",
  },
};

/** Why there's no diesel cost for this truck in this mode, in plain words. */
function dieselMissingReason(mode: Mode, cost: TripBreakdownCost | undefined): string {
  if (!cost?.dieselPrice) return mode === "Manual"
    ? "No diesel price is set in Running Cost Calculator → Manual."
    : "No base diesel price is set in Maintenance → Fuel History.";
  return mode === "Manual"
    ? "No mileage has been typed for this truck in Running Cost Calculator → Manual."
    : "This truck has no fuel logs in Maintenance → Fuel History to work out its mileage from.";
}

function Step({
  label, amount, tone, barPct, emptyText, children, defaultOpen = false,
}: {
  label: string;
  amount: number | null;
  tone: "in" | "out" | "result";
  barPct: number;
  emptyText?: string;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [openDetail, setOpenDetail] = useState(defaultOpen);
  const isResult = tone === "result";
  const color =
    amount == null ? "text-gray-400"
    : tone === "out" ? "text-red-600"
    : tone === "in" ? "text-blue-700"
    : amount >= 0 ? "text-emerald-700" : "text-red-600";
  const barColor = tone === "out" ? "bg-red-300" : tone === "in" ? "bg-blue-400" : (amount ?? 0) >= 0 ? "bg-emerald-400" : "bg-red-400";
  return (
    <div className={cn("rounded-xl border px-4 py-3", isResult ? "border-gray-200 bg-gray-50" : "border-gray-100 bg-white")}>
      <button
        type="button"
        disabled={!children}
        onClick={() => setOpenDetail((o) => !o)}
        className="flex w-full items-center gap-3 text-left disabled:cursor-default"
      >
        <span className={cn("w-40 shrink-0 text-sm", isResult ? "font-bold text-gray-900" : "font-medium text-gray-700")}>{label}</span>
        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
          {amount != null && (
            <span className={cn("absolute inset-y-0 left-0 rounded-full", barColor)} style={{ width: `${Math.max(1, Math.min(100, barPct))}%` }} />
          )}
        </span>
        <span className={cn("w-32 shrink-0 text-right text-sm tabular-nums", isResult ? "font-bold" : "font-semibold", color)}>
          {amount == null ? "—" : tone === "out" ? `− ${fmt(amount)}` : fmtSigned(amount)}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", !children && "invisible", openDetail && "rotate-180")} />
      </button>
      {amount == null && emptyText && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {emptyText}
        </p>
      )}
      {openDetail && children && (
        <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">{children}</div>
      )}
    </div>
  );
}

function Line({ label, value, muted }: { label: ReactNode; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-0.5">
      <span className={muted ? "text-gray-400" : ""}>{label}</span>
      <span className={cn("shrink-0 tabular-nums", muted ? "text-gray-400" : "font-medium text-gray-700")}>{value}</span>
    </div>
  );
}

function Source({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-400">
      <Info className="mt-0.5 h-3 w-3 shrink-0" /> {children}
    </p>
  );
}

/**
 * Profitability → Trip Profitability → click a row: explains that one trip's
 * numbers step by step (Hire → Trip Profit → Gross Profit → Final Profit),
 * with where each figure comes from. Built from /pl-summary/trip-breakdown,
 * which uses the same numbers as the table, so it always adds up to the row.
 */
export function TripBreakdownDialog({ open, onClose, tripId, mode: pageMode }: Props) {
  const [data, setData] = useState<TripBreakdown | null>(null);
  // Switchable inside the window (every mode is already loaded); starts on the page's mode.
  const [mode, setMode] = useState<Mode>(pageMode);
  useEffect(() => { if (open) setMode(pageMode); }, [open, pageMode]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || tripId == null) return;
    setData(null);
    setError(null);
    setLoading(true);
    plSummaryApi.getTripBreakdown(tripId)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load this trip's breakdown."))
      .finally(() => setLoading(false));
  }, [open, tripId]);

  const cost = data?.cost?.[mode];
  const km = data?.km.total ?? 0;
  const hire = data?.hire.net ?? 0;
  const tripExp = data?.expenses.total ?? 0;
  const tripProfit = hire - tripExp;
  const dieselRate = cost?.parts.fuel ?? null;
  const diesel = dieselRate != null && km > 0 ? km * dieselRate : null;
  const truckExp = cost?.total != null && km > 0 ? km * cost.total : null;
  const other = truckExp != null ? truckExp - (diesel ?? 0) : null;
  const gross = diesel != null ? tripProfit - diesel : null;
  const final = truckExp != null ? tripProfit - truckExp : null;
  const scale = Math.max(hire, Math.abs(tripProfit), 1);
  const pct = (v: number | null) => (v == null ? 0 : (Math.abs(v) / scale) * 100);

  const summary = (() => {
    if (!data) return "";
    const parts = [`${fmt(tripExp)} of trip expenses`];
    if (diesel != null) parts.push(`${fmt(diesel)} of diesel`);
    if (other != null && other > 0.005) parts.push(`${fmt(other)} of ${diesel != null ? "other running costs" : "truck running costs"}`);
    const last = final ?? gross ?? tripProfit;
    const listed = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    return `This trip earned ${fmt(hire)}. After ${listed}, it ${last >= 0 ? "made" : "lost"} ${fmt(last)}.`;
  })();

  const lossReason = (() => {
    if (!data || final == null || final >= 0) return null;
    if (tripProfit < 0) return "The trip expenses are more than the hire for this trip.";
    if (diesel != null && diesel > tripProfit) return `Diesel (${fmt(diesel)}) is more than what's left after trip expenses (${fmt(tripProfit)}).`;
    return `The truck's running costs (${fmt(truckExp ?? 0)}) are more than what's left after trip expenses (${fmt(tripProfit)}).`;
  })();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={data ? `Trip Breakdown — ${data.tripSheetNo || data.tripCode}` : "Trip Breakdown"}
      className="max-w-3xl"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading breakdown…
        </div>
      ) : error ? (
        <p className="py-12 text-center text-sm text-red-600">{error}</p>
      ) : data ? (
        <div className="flex flex-col gap-4">
          {/* Trip */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-xs text-gray-600">
            <span><span className="font-semibold text-gray-800">{data.truckId}</span> {data.registrationNumber && <span className="text-gray-400">· {data.registrationNumber}</span>}</span>
            {data.customerName && <span className="text-gray-700">{data.customerName}</span>}
            {(data.fromLocation || data.toLocation) && (
              <span className="flex items-center gap-1">{data.fromLocation || "—"} <ArrowRight className="h-3 w-3 text-gray-300" /> {data.toLocation || "—"}</span>
            )}
            <span>{fmtKm(km)} km</span>
          </div>

          {/* Cost mode — Diesel, Gross Profit and the running costs depend on it */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-gray-500">
              Diesel and running costs use the Running Cost Calculator&apos;s <span className="font-semibold text-gray-700">{mode}</span> mode.
            </p>
            <Segmented
              label="Cost mode"
              value={mode}
              onChange={setMode}
              options={(["Manual", "Basic", "Advanced"] as const).map((m) => ({ value: m, label: m }))}
            />
          </div>

          {data.flaggedForRecheck && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">Under review</span> — flagged for recheck by Audit, so this trip is left out of the page totals until it&apos;s resolved.
                {data.flaggedRemark && <> Remark: &ldquo;{data.flaggedRemark}&rdquo;</>}
              </span>
            </div>
          )}

          {/* Plain-language summary */}
          <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-900">{summary}</p>
          {lossReason && (
            <p className="-mt-2 flex items-start gap-1.5 px-1 text-xs text-red-600">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Why a loss: {lossReason}
            </p>
          )}

          <p className="px-1 text-[11px] text-gray-400">Click a line to see where its number comes from.</p>

          {/* Waterfall */}
          <div className="flex flex-col gap-2">
            <Step label="Hire" amount={hire} tone="in" barPct={pct(hire)}>
              {data.hire.commission > 0 ? (
                <>
                  <Line label="Hire on the trip sheet" value={fmt(data.hire.gross)} />
                  <Line label="− Commission on this route" value={fmt(data.hire.commission)} />
                  <Line label={<span className="font-semibold">= Hire counted</span>} value={fmt(hire)} />
                </>
              ) : (
                <Line label="Hire amount on the trip sheet" value={fmt(hire)} />
              )}
              <Source>From the trip sheet (the booking&apos;s hire, less any commission on the customer&apos;s route).</Source>
            </Step>

            <Step label="Trip Expenses" amount={tripExp} tone="out" barPct={pct(tripExp)}>
              {data.expenses.items.length === 0 ? (
                <Line label="No expenses on the trip sheet" value={fmt(0)} muted />
              ) : (
                data.expenses.items.map((i) => <Line key={i.label} label={i.label} value={fmt(i.amount)} />)
              )}
              <Source>Entered on trip sheet {data.tripSheetNo || data.tripCode}.</Source>
            </Step>

            <Step label="= Trip Profit" amount={tripProfit} tone="result" barPct={pct(tripProfit)} />

            <Step
              label="Diesel Expenses"
              amount={diesel}
              tone="out"
              barPct={pct(diesel)}
              emptyText={km <= 0 ? "This trip sheet has no km, so diesel can't be worked out." : dieselMissingReason(mode, cost)}
            >
              {diesel != null && dieselRate != null && (
                <>
                  <Line label={`${fmtKm(km)} km × ${fmtRate(dieselRate)} per km`} value={fmt(diesel)} />
                  <Line label={`Km: odometer ${fmtKm(data.km.start)} → ${fmtKm(data.km.end)}`} value={`${fmtKm(km)} km`} muted />
                  {cost?.dieselPrice && cost.mileage ? (
                    <>
                      <Line label={`Diesel per km = ₹${cost.dieselPrice.toFixed(2)} per litre ÷ ${cost.mileage.toFixed(2)} km per litre`} value={`${fmtRate(dieselRate)}/km`} muted />
                      <Source>Diesel price: {cost.priceSource}. Mileage: {cost.mileageSource}.</Source>
                    </>
                  ) : (
                    <Source>Diesel per km as saved by Running Cost Calculator → {mode}.</Source>
                  )}
                </>
              )}
            </Step>

            <Step label="= Gross Profit" amount={gross} tone="result" barPct={pct(gross)} />

            <Step
              label={diesel != null ? "Other running costs" : "Truck running costs"}
              amount={other}
              tone="out"
              barPct={pct(other)}
              emptyText={km <= 0 ? "This trip sheet has no km." : `This truck has no Cost/KM in ${mode} mode — set it up in the Running Cost Calculator.`}
            >
              {other != null && cost && (
                <>
                  {cost.partsKnown ? (
                    (["emi", "tyre", "maintenance", "compliance"] as const).map((k) => {
                      const rate = cost.parts[k];
                      return (
                        <div key={k} className="py-0.5">
                          <Line
                            label={`${PART_LABEL[k]}: ${fmtKm(km)} km × ${rate != null ? fmtRate(rate) : "₹0"}/km`}
                            value={rate != null ? fmt(km * rate) : <span className="text-gray-400">not set</span>}
                          />
                          <p className="text-[11px] text-gray-400">{PART_SOURCE[mode][k]}</p>
                        </div>
                      );
                    })
                  ) : (
                    <>
                      <Line label={`${fmtKm(km)} km × ${fmtRate(other / km)}/km (EMI, tyres, maintenance and documents together)`} value={fmt(other)} />
                      <p className="mt-1.5 text-[11px] text-amber-700">
                        The split isn&apos;t saved yet for this truck. Open Running Cost Calculator → Manual once and it&apos;ll be saved.
                      </p>
                    </>
                  )}
                  <Source>
                    Full Cost/KM in {mode} mode: {fmtRate(cost.total ?? 0)}/km (diesel included) — the same figure as the Truck Expenses column.
                  </Source>
                </>
              )}
            </Step>

            <Step label="= Final Profit" amount={final} tone="result" barPct={pct(final)} />
          </div>

          <p className="px-1 text-[11px] text-gray-400">
            &ldquo;Other running costs&rdquo; is the table&apos;s Truck Expenses column (diesel has its own column).
            {mode !== pageMode && ` The table behind this window is still showing ${pageMode} mode.`}
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
