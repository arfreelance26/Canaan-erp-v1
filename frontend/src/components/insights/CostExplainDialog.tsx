"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiErrorWarningLine as AlertCircle, RiArrowRightUpLine as ArrowUpRight, RiArrowDownSLine as ChevronDown, RiDashboard3Line as Gauge, RiInformationLine as Info, RiLoader4Line as Loader2 } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { runningCostApi, type CostExplanation, type ExplainTable } from "@/lib/api";
import { cn } from "@/lib/utils";

const PART_COLOR: Record<string, string> = {
  emi: "bg-accent-solid",
  fuel: "bg-warning-solid",
  tyre: "bg-teal-solid",
  maintenance: "bg-foreground-icon-tertiary",
  compliance: "bg-purple-solid",
};
const CIRCLED = ["①", "②", "③", "④", "⑤"];

const perKm = (n: number | null) => (n == null ? "NIL" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}/km`);

/**
 * Running Cost Calculator → a truck card's "How is this calculated?": its
 * Cost/KM in the current mode, part by part, with the real numbers behind
 * each part and an Open link to the page each number comes from. The
 * explanation comes from the server's own Cost/KM code, so it always matches
 * the card and Profitability.
 */
export function CostExplainDialog({
  open, onClose, truckId, mode,
}: { open: boolean; onClose: () => void; truckId: string; mode: string }) {
  const [data, setData] = useState<CostExplanation | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setFailed(false);
    runningCostApi.explain(truckId, mode).then(setData).catch(() => setFailed(true));
  }, [open, truckId, mode]);

  const total = data?.total ?? null;
  const scale = Math.max(total ?? 0, ...(data?.parts.map((p) => p.value ?? 0) ?? [0]), 0.0001);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={data ? `How is this calculated? — ${data.registrationNumber}` : "How is this calculated?"}
      className="sm:max-w-3xl"
    >
      {failed ? (
        <p className="py-10 text-center text-sm text-danger-text">Couldn&apos;t load the explanation. Please try again.</p>
      ) : !data ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" /> Working it out…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Summary */}
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-accent-solid px-5 py-4 text-on-solid">
            <div>
              <p className="text-caption-2-semibold text-on-solid/80">{data.mode} mode</p>
              <p className="mt-1 text-sm text-on-solid/80">
                {data.truckId} · layout {data.tyreLayout || "—"}
              </p>
              {data.mode !== "Manual" && data.distance.trips > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-on-solid/70">
                  <Gauge className="h-3 w-3" />
                  Runs {Math.round(data.distance.monthlyAvg).toLocaleString("en-IN")} km a month ·{" "}
                  {Math.round(data.distance.dailyAvg).toLocaleString("en-IN")} km a day
                  {data.mode === "Basic" && data.distance.configuredKmPerDay != null &&
                    ` (Basic uses the configured ${Math.round(data.distance.configuredKmPerDay)} km/day)`}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-caption-2-semibold text-on-solid/60">Cost per km</p>
              <p className="text-title-1-semibold tabular-nums">{total != null ? `₹${total.toFixed(4)}` : "—"}</p>
            </div>
          </div>

          {data.note && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-surface px-3 py-2 text-xs text-warning-text-strong ring-1 ring-warning-border">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {data.note}
            </p>
          )}

          {/* Parts */}
          <ol className="flex max-h-[58vh] flex-col gap-3 overflow-y-auto pr-1">
            {data.parts.map((p, i) => (
              <li key={p.key} className={cn("rounded-xl border p-3.5", p.value == null ? "border-dashed border-separator-border bg-fill-1" : "border-separator-border bg-background-primary-default shadow-sm")}>
                <div className="flex items-center gap-3">
                  <span className="text-headline-semibold text-text-tertiary">{CIRCLED[i]}</span>
                  <span className="w-28 shrink-0 text-body-semibold text-text-primary">{p.label}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-fill-2">
                    {p.value != null && (
                      <span className={cn("absolute inset-y-0 left-0 rounded-full", PART_COLOR[p.key])} style={{ width: `${Math.max(1, (p.value / scale) * 100)}%` }} />
                    )}
                  </span>
                  <span className={cn("w-32 shrink-0 text-right text-body-semibold tabular-nums", p.value == null ? "text-text-tertiary" : "text-text-primary")}>
                    {perKm(p.value)}
                  </span>
                </div>

                <div className="mt-2 pl-8">
                  {p.formula ? (
                    <p className="text-caption-1-medium text-text-primary">= {p.formula}</p>
                  ) : p.missing ? (
                    <p className="flex items-start gap-1.5 text-xs text-warning-text">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.missing}
                    </p>
                  ) : null}

                  {p.table && p.table.rows.length > 0 && <PartTable table={p.table} />}

                  {p.inputs.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {p.inputs.map((inp, j) => (
                        <li key={j} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                          <span className="text-text-tertiary">{inp.label}:</span>
                          <span className="font-semibold tabular-nums text-text-primary">{inp.value}</span>
                          {inp.source && (
                            inp.href ? (
                              <Link
                                href={inp.href}
                                className="inline-flex items-center gap-0.5 rounded-full bg-accent-surface px-2 py-px font-medium text-accent-text ring-1 ring-accent-border transition hover:bg-accent-surface-strong"
                                title={`Open ${inp.source}`}
                              >
                                {inp.source} <ArrowUpRight className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="rounded-full bg-fill-2 px-2 py-px text-text-secondary">{inp.source}</span>
                            )
                          )}
                          {inp.detail && <span className="basis-full text-text-tertiary">{inp.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Total */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-fill-1 px-4 py-3 ring-1 ring-separator-border">
            <p className="text-xs text-text-secondary">
              Total = {data.parts.map((_, i) => CIRCLED[i]).join(" + ")}
              <span className="ml-1 text-text-tertiary">(a NIL part adds ₹0 — it isn&apos;t a real zero, just missing data)</span>
            </p>
            <p className="text-body-semibold tabular-nums text-text-primary">{total != null ? `₹${total.toFixed(4)} per km` : "—"}</p>
          </div>
          {data.mode === "Manual" && (
            <p className="-mt-2 text-[11px] text-text-tertiary">
              Manual is explained from what this page has saved — if you&apos;ve just typed something, it appears here a moment later.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

const COLLAPSED_ROWS = 5;
const NOT_COUNTED = /^(not counted|no cost|no range|not set|—)$/;

/** The rows behind a part (fitted tyres, documents, loans…) — long lists start
 *  collapsed so the window stays readable. */
function PartTable({ table }: { table: ExplainTable }) {
  const [expanded, setExpanded] = useState(false);
  const long = table.rows.length > COLLAPSED_ROWS + 1;
  const rows = long && !expanded ? table.rows.slice(0, COLLAPSED_ROWS) : table.rows;
  const align = (i: number) => (table.numeric.includes(i) ? "text-right tabular-nums" : "text-left");
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-separator-border">
      {table.title && (
        <p className="border-b border-separator-border bg-fill-1 px-3 py-1.5 text-caption-2-semibold text-text-secondary">
          {table.title}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-separator-border text-text-tertiary">
              {table.columns.map((c, i) => (
                <th key={i} className={cn("whitespace-nowrap px-3 py-1.5 font-semibold", align(i))}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-separator-border">
            {rows.map((r, ri) => {
              const skipped = NOT_COUNTED.test(r[r.length - 1] ?? "");
              return (
                <tr key={ri} className={skipped ? "text-text-tertiary" : "text-text-primary"}>
                  {r.map((cell, i) => (
                    <td key={i} className={cn("whitespace-nowrap px-3 py-1.5", align(i), i === r.length - 1 && !skipped && "font-semibold text-text-primary")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {table.footer && (!long || expanded) && (
            <tfoot>
              <tr className="border-t border-separator-border bg-fill-1 font-semibold text-text-primary">
                {table.footer.map((c, i) => (
                  <td key={i} className={cn("whitespace-nowrap px-3 py-1.5", align(i))}>{c}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-separator-border bg-background-primary-default py-1.5 text-caption-2-semibold text-accent-text transition hover:bg-accent-surface-strong"
        >
          {expanded ? "Show less" : `Show all ${table.rows.length}`}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
