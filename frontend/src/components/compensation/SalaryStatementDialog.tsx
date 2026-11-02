"use client";

import { Fragment, useEffect, useState } from "react";
import { BookOpen, ChevronDown, Loader2 } from "lucide-react";
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
  if (part.rows.length === 0) return <p className="px-4 pb-3 text-xs text-gray-400">Nothing in this period.</p>;
  const isTrip = part.key === "trips";
  const isHalt = part.key === "halt";
  const head = isTrip
    ? ["Completed", "Trip", "Regular Pay", "Advance", "Expenses", "Net Payable"]
    : isHalt
      ? ["Completed", "Trip", "Company days", "Party days", "Amount"]
      : ["Date", "Status", "Truck", "Amount"];
  return (
    <div className="max-h-60 overflow-auto border-t border-gray-100">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-gray-50">
          <tr>{head.map((h, i) => <th key={h} className={cn("px-4 py-2 font-semibold uppercase tracking-wide text-gray-400", i >= 2 && "text-right")}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {part.rows.map((r, i) => (
            <tr key={i}>
              <td className="px-4 py-1.5 text-gray-500">{formatDate(r.date)}</td>
              {isTrip ? (
                <>
                  <td className="px-4 py-1.5 font-medium text-gray-800">{r.trip_id}{r.batta_excluded && <span className="ml-1 text-[10px] font-semibold text-purple-600">BATTA EXCLUDED</span>}</td>
                  <td className="px-4 py-1.5 text-right">{money(r.batta_excluded ? 0 : r.regular_pay)}</td>
                  <td className="px-4 py-1.5 text-right">{money(r.advance)}</td>
                  <td className="px-4 py-1.5 text-right">{money(r.expenses)}</td>
                  <td className="px-4 py-1.5 text-right font-semibold">{money(r.net_payable)}</td>
                </>
              ) : isHalt ? (
                <>
                  <td className="px-4 py-1.5 font-medium text-gray-800">{r.trip_id}</td>
                  <td className="px-4 py-1.5 text-right">{r.company_days}</td>
                  <td className="px-4 py-1.5 text-right">{r.party_days}</td>
                  <td className="px-4 py-1.5 text-right font-semibold">{money(r.amount)}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-1.5 text-gray-700">{r.status}</td>
                  <td className="px-4 py-1.5 text-right text-gray-700">{r.truck_registration ?? "—"}</td>
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
        <button type="button" onClick={onShowGuide} className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
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
                className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  filterMode === mode ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50")}
              >
                {label}
              </button>
            ))}
            {filterMode === "custom" && (
              <div className="flex items-center gap-2">
                <div className="w-36"><DatePickerInput value={customFrom} onChange={setCustomFrom} /></div>
                <span className="text-xs text-gray-400">to</span>
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
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : statement && (
          <div className={cn("flex flex-col gap-3 transition-opacity", loading && "opacity-60")}>
            <p className="text-xs text-gray-500">
              {from || to ? <>Period: <span className="font-semibold text-gray-700">{from ? formatDate(from) : "the start"} to {to ? formatDate(to) : "today"}</span></> : "All time"}
            </p>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              {statement.parts.map((p) => {
                const isOpen = expanded === p.key;
                return (
                  <Fragment key={p.key}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : p.key)}
                      className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                    >
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        p.sign < 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
                        {p.sign < 0 ? "−" : "+"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-900">{p.label}</span>
                        <span className="block text-xs text-gray-400">{p.count} {p.unit}{p.count === 1 ? "" : "s"} · {NOTES[p.key]}</span>
                      </span>
                      <span className={cn("text-sm font-semibold tabular-nums", p.sign < 0 ? "text-red-600" : "text-gray-900")}>
                        {p.sign < 0 && p.amount > 0 ? "−" : ""}{money(p.amount)}
                      </span>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && <PartRows part={p} />}
                  </Fragment>
                );
              })}
              <div className="flex items-center justify-between bg-gray-50 px-4 py-4">
                <span className="text-sm font-bold text-gray-900">Final Net Payable</span>
                <span className={cn("text-xl font-bold tabular-nums", statement.netPayable < 0 ? "text-red-600" : "text-emerald-700")}>
                  {money(statement.netPayable)}
                </span>
              </div>
            </div>
            {statement.netPayable < 0 && (
              <p className="text-xs text-red-600">A negative amount means the driver owes this back (advances are more than the pay).</p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
