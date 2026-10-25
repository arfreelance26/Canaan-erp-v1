"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, ChevronDown, Gauge, Info, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { runningCostApi, type CostExplanation, type ExplainTable } from "@/lib/api";
import { cn } from "@/lib/utils";

const PART_COLOR: Record<string, string> = {
  emi: "bg-blue-500",
  fuel: "bg-amber-500",
  tyre: "bg-teal-500",
  maintenance: "bg-slate-500",
  compliance: "bg-violet-500",
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
        <p className="py-10 text-center text-sm text-red-500">Couldn&apos;t load the explanation. Please try again.</p>
      ) : !data ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Working it out…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Summary */}
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-gradient-to-br from-[#1b2b5e] via-[#22356f] to-[#2d4590] px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">{data.mode} mode</p>
              <p className="mt-1 text-sm text-white/80">
                {data.truckId} · layout {data.tyreLayout || "—"}
              </p>
              {data.mode !== "Manual" && data.distance.trips > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-white/70">
                  <Gauge className="h-3 w-3" />
                  Runs {Math.round(data.distance.monthlyAvg).toLocaleString("en-IN")} km a month ·{" "}
                  {Math.round(data.distance.dailyAvg).toLocaleString("en-IN")} km a day
                  {data.mode === "Basic" && data.distance.configuredKmPerDay != null &&
                    ` (Basic uses the configured ${Math.round(data.distance.configuredKmPerDay)} km/day)`}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Cost per km</p>
              <p className="text-2xl font-bold tabular-nums">{total != null ? `₹${total.toFixed(4)}` : "—"}</p>
            </div>
          </div>

          {data.note && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {data.note}
            </p>
          )}

          {/* Parts */}
          <ol className="flex max-h-[58vh] flex-col gap-3 overflow-y-auto pr-1">
            {data.parts.map((p, i) => (
              <li key={p.key} className={cn("rounded-xl border p-3.5", p.value == null ? "border-dashed border-gray-200 bg-gray-50/60" : "border-gray-100 bg-white shadow-sm")}>
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-gray-400">{CIRCLED[i]}</span>
                  <span className="w-28 shrink-0 text-sm font-semibold text-gray-800">{p.label}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    {p.value != null && (
                      <span className={cn("absolute inset-y-0 left-0 rounded-full", PART_COLOR[p.key])} style={{ width: `${Math.max(1, (p.value / scale) * 100)}%` }} />
                    )}
                  </span>
                  <span className={cn("w-32 shrink-0 text-right text-sm font-bold tabular-nums", p.value == null ? "text-gray-400" : "text-gray-900")}>
                    {perKm(p.value)}
                  </span>
                </div>

                <div className="mt-2 pl-8">
                  {p.formula ? (
                    <p className="text-xs font-medium text-gray-700">= {p.formula}</p>
                  ) : p.missing ? (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.missing}
                    </p>
                  ) : null}

                  {p.table && p.table.rows.length > 0 && <PartTable table={p.table} />}

                  {p.inputs.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {p.inputs.map((inp, j) => (
                        <li key={j} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                          <span className="text-gray-400">{inp.label}:</span>
                          <span className="font-semibold tabular-nums text-gray-700">{inp.value}</span>
                          {inp.source && (
                            inp.href ? (
                              <Link
                                href={inp.href}
                                className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-px font-medium text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100"
                                title={`Open ${inp.source}`}
                              >
                                {inp.source} <ArrowUpRight className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="rounded-full bg-gray-100 px-2 py-px text-gray-500">{inp.source}</span>
                            )
                          )}
                          {inp.detail && <span className="basis-full text-gray-400">{inp.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Total */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
            <p className="text-xs text-gray-500">
              Total = {data.parts.map((_, i) => CIRCLED[i]).join(" + ")}
              <span className="ml-1 text-gray-400">(a NIL part adds ₹0 — it isn&apos;t a real zero, just missing data)</span>
            </p>
            <p className="text-sm font-bold tabular-nums text-gray-900">{total != null ? `₹${total.toFixed(4)} per km` : "—"}</p>
          </div>
          {data.mode === "Manual" && (
            <p className="-mt-2 text-[11px] text-gray-400">
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
    <div className="mt-2 overflow-hidden rounded-lg border border-gray-100">
      {table.title && (
        <p className="border-b border-gray-100 bg-gray-50/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {table.title}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-gray-100 text-gray-400">
              {table.columns.map((c, i) => (
                <th key={i} className={cn("whitespace-nowrap px-3 py-1.5 font-semibold", align(i))}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, ri) => {
              const skipped = NOT_COUNTED.test(r[r.length - 1] ?? "");
              return (
                <tr key={ri} className={skipped ? "text-gray-400" : "text-gray-700"}>
                  {r.map((cell, i) => (
                    <td key={i} className={cn("whitespace-nowrap px-3 py-1.5", align(i), i === r.length - 1 && !skipped && "font-semibold text-gray-900")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {table.footer && (!long || expanded) && (
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50/80 font-bold text-gray-900">
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
          className="flex w-full items-center justify-center gap-1 border-t border-gray-100 bg-white py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-50"
        >
          {expanded ? "Show less" : `Show all ${table.rows.length}`}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
