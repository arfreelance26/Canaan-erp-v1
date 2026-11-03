"use client";

import { Fragment, useEffect, useState } from "react";
import { RiBookOpenLine as BookOpen, RiArrowDownSLine as ChevronDown, RiLoader4Line as Loader2 } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { compensationApi, type SalaryStatement, type SalaryStatementPart } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { CompensationPerson } from "./CompensationTable";

type FilterMode = "all" | "thisMonth" | "custom";

function thisMonthRange(): { from: string; to: string } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

function money(v: number): string {
  return `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const NOTES: Record<string, string> = {
  trips: "Same as the Trip Salary Record, by trip completed date. Advances are already deducted here.",
  halt: "Company and party halt pay from Close Trip, by trip completed date (Halt Pay Record).",
  cleaner: "Present / On Trip / On Halt days (Cleaner Batta Record).",
  workshop: "On Workshop days (Workshop Batta Record).",
  workshopAdvance: "Advance paid on On Workshop days (Workshop Advance Record).",
};

/** The rows behind one part, in a small table. */
function PartRows({ part }: { part: SalaryStatementPart }) {
  if (part.rows.length === 0) return <p className="px-4 pb-3 text-xs text-text-tertiary">Nothing in this period.</p>;
  const isTrip = part.key === "trips";
  const isHalt = part.key === "halt";
  const head = isTrip
    ? ["Completed", "Trip", "Regular Pay", "Advance", "Expenses", "Net Payable"]
    : isHalt
      ? ["Completed", "Trip", "Company days", "Party days", "Amount"]
      : ["Date", "Status", "Truck", "Amount"];
  return (
    <div className="max-h-60 overflow-auto border-t border-separator-border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-fill-1">
          <tr>{head.map((h, i) => <th key={h} className={cn("px-4 py-2 font-semibold text-text-tertiary", i >= 2 && "text-right")}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-separator-border">
          {part.rows.map((r, i) => (
            <tr key={i}>
              <td className="px-4 py-1.5 text-text-secondary">{formatDate(r.date)}</td>
              {isTrip ? (
                <>
                  <td className="px-4 py-1.5 font-medium text-text-primary">{r.trip_id}{r.batta_excluded && <span className="ml-1 text-caption-2-semibold text-purple-text">BATTA EXCLUDED</span>}</td>
                  <td className="px-4 py-1.5 text-right">{money(r.batta_excluded ? 0 : r.regular_pay)}</td>
                  <td className="px-4 py-1.5 text-right">{money(r.advance)}</td>
                  <td className="px-4 py-1.5 text-right">{money(r.expenses)}</td>
                  <td className="px-4 py-1.5 text-right font-semibold">{money(r.net_payable)}</td>
                </>
              ) : isHalt ? (
                <>
                  <td className="px-4 py-1.5 font-medium text-text-primary">{r.trip_id}</td>
                  <td className="px-4 py-1.5 text-right">{r.company_days}</td>
                  <td className="px-4 py-1.5 text-right">{r.party_days}</td>
                  <td className="px-4 py-1.5 text-right font-semibold">{money(r.amount)}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-1.5 text-text-primary">{r.status}</td>
                  <td className="px-4 py-1.5 text-right text-text-primary">{r.truck_registration ?? "—"}</td>
                  <td className="px-4 py-1.5 text-right font-semibold">{money(r.amount)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Driver Compensation → Salary Record: the driver's final pay for a period
 *  (backend finance.salary_statement). Trip Salary Record is one part of it. */
export function SalaryStatementDialog({ open, onClose, driver, onShowGuide }: {
  open: boolean;
  onClose: () => void;
  driver: CompensationPerson | null;
  onShowGuide?: () => void;
}) {
  const [filterMode, setFilterMode] = useState<FilterMode>("thisMonth");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statement, setStatement] = useState<SalaryStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const driverId = driver?.driverId ?? driver?.id ?? "";
  const { from, to } = filterMode === "thisMonth" ? thisMonthRange()
    : filterMode === "custom" ? { from: customFrom, to: customTo } : { from: "", to: "" };

  useEffect(() => {
    if (open) {
      setFilterMode("thisMonth");
      setCustomFrom("");
      setCustomTo("");
      setExpanded(null);
    }
  }, [open, driverId]);

  useEffect(() => {
    if (!open || !driverId) return;
    let stale = false;
    setLoading(true);
    setError(null);
    compensationApi.salaryStatement(driverId, from, to)
      .then((s) => { if (!stale) setStatement(s); })
      .catch((err: unknown) => { if (!stale) setError(err instanceof Error ? err.message : "Could not load the salary record."); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [open, driverId, from, to]);

  const params: Record<string, string> = { driver_id: driverId, ...(from ? { from_date: from } : {}), ...(to ? { to_date: to } : {}) };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Salary Record — ${driver?.name ?? ""}`}
      className="sm:max-w-3xl"
      headerRight={onShowGuide && (
        <button type="button" onClick={onShowGuide} className="flex items-center gap-1.5 rounded-full border border-separator-border px-3 py-1.5 text-caption-1-semibold text-text-secondary hover:bg-fill-2">
          <BookOpen className="h-3.5 w-3.5" /> How is this Calculated?
        </button>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {([["thisMonth", "This Month"], ["all", "All Time"], ["custom", "Custom"]] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={cn("rounded-full px-3.5 py-1.5 text-caption-1-semibold transition-colors",
                  filterMode === mode ? "bg-accent-solid text-on-solid" : "border border-separator-border text-text-secondary hover:bg-fill-2")}
              >
                {label}
              </button>
            ))}
            {filterMode === "custom" && (
              <div className="flex items-center gap-2">
                <div className="w-36"><DatePickerInput value={customFrom} onChange={setCustomFrom} /></div>
                <span className="text-xs text-text-tertiary">to</span>
                <div className="w-36"><DatePickerInput value={customTo} onChange={setCustomTo} /></div>
              </div>
            )}
          </div>
          {driverId && (
            <DownloadExcelButton
              path="/finance/compensation/salary-statement/export"
              filename={`Salary_Record_${driver?.name ?? ""}.xlsx`}
              title={`Salary Record — ${driver?.name ?? ""}`}
              params={params}
            />
          )}
        </div>

        {loading && !statement ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-text-tertiary" /></div>
        ) : error ? (
          <p className="rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-text">{error}</p>
        ) : statement && (
          <div className={cn("flex flex-col gap-3 transition-opacity", loading && "opacity-60")}>
            <p className="text-xs text-text-secondary">
              {from || to ? <>Period: <span className="font-semibold text-text-primary">{from ? formatDate(from) : "the start"} to {to ? formatDate(to) : "today"}</span></> : "All time"}
            </p>
            <div className="overflow-hidden rounded-xl border border-separator-border">
              {statement.parts.map((p) => {
                const isOpen = expanded === p.key;
                return (
                  <Fragment key={p.key}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : p.key)}
                      className="flex w-full items-center gap-3 border-b border-separator-border px-4 py-3 text-left transition-colors hover:bg-fill-2"
                    >
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-body-semibold",
                        p.sign < 0 ? "bg-danger-surface text-danger-text" : "bg-success-surface text-success-text")}>
                        {p.sign < 0 ? "−" : "+"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-semibold text-text-primary">{p.label}</span>
                        <span className="block text-xs text-text-tertiary">{p.count} {p.unit}{p.count === 1 ? "" : "s"} · {NOTES[p.key]}</span>
                      </span>
                      <span className={cn("text-body-semibold tabular-nums", p.sign < 0 ? "text-danger-text" : "text-text-primary")}>
                        {p.sign < 0 && p.amount > 0 ? "−" : ""}{money(p.amount)}
                      </span>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-tertiary transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && <PartRows part={p} />}
                  </Fragment>
                );
              })}
              <div className="flex items-center justify-between bg-fill-1 px-4 py-4">
                <span className="text-body-semibold text-text-primary">Final Net Payable</span>
                <span className={cn("text-title-2-semibold tabular-nums", statement.netPayable < 0 ? "text-danger-text" : "text-success-text")}>
                  {money(statement.netPayable)}
                </span>
              </div>
            </div>
            {statement.netPayable < 0 && (
              <p className="text-xs text-danger-text">A negative amount means the driver owes this back (advances are more than the pay).</p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
