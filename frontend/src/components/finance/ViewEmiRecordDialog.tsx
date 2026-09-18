"use client";

import { Landmark, CalendarClock, CircleDollarSign, Wallet, TrendingDown, CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { EmiRecord } from "@/types/finance";
import { formatDate } from "@/lib/format-date";
import { paidInstallments } from "@/lib/emi-schedule";

type ViewEmiRecordDialogProps = {
  open: boolean;
  onClose: () => void;
  record: EmiRecord | null;
};

function fmtCur(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** "YYYY-MM-DD" from a local Date, without a UTC round-trip that could shift the day. */
function toDateOnlyString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Clamp a day-of-month to the last valid day of the given month (e.g. day 31 in Feb -> 28/29). */
function clampedMonthDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

type ScheduleNode = {
  index: number;
  date: Date;
  amountPaid: number;
  remaining: number;
  isLast: boolean;
};

/**
 * Builds the monthly repayment flow: node 0 is logged on the EMI's creation
 * date (one month's installment is booked immediately), then one further node
 * per elapsed Auto-Debit Date since then — capped at both the loan's tenure
 * and today (never shows a future, not-yet-debited month).
 *
 * EMI Amount is already the monthly installment (that's what "EMI" means) —
 * NOT a lump sum to divide by tenure. Total payable over the loan's life is
 * EMI Amount × Tenure; Amount Paid accumulates by a full EMI Amount each
 * month, and Remaining is what's left of that total.
 */
function buildScheduleNodes(record: EmiRecord): ScheduleNode[] {
  const emiAmount = Number(record.emiAmount) || 0;
  const tenure = Number(record.tenureMonths) || 0;
  const createdRaw = record.createdAt || record.emiStartDate;

  if (tenure <= 0 || emiAmount <= 0 || !createdRaw) return [];
  const created = new Date(createdRaw);
  if (isNaN(created.getTime())) return [];

  const autoDebitDay = record.autoDebitDate ? new Date(record.autoDebitDate).getDate() : created.getDate();

  const nodeCount = paidInstallments(record, tenure);
  const totalPayable = emiAmount * tenure;

  const nodes: ScheduleNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const date = i === 0 ? created : clampedMonthDate(created.getFullYear(), created.getMonth() + i, autoDebitDay);
    const amountPaid = emiAmount * (i + 1);
    const remaining = Math.max(0, totalPayable - amountPaid);
    nodes.push({ index: i, date, amountPaid, remaining, isLast: i === tenure - 1 });
  }
  return nodes;
}

export function ViewEmiRecordDialog({ open, onClose, record }: ViewEmiRecordDialogProps) {
  if (!record) return null;

  const emiAmount = Number(record.emiAmount) || 0;
  const tenure = Number(record.tenureMonths) || 0;
  const totalPayable = emiAmount * tenure;
  const nodes = buildScheduleNodes(record);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`EMI Record — ${record.emiName || record.truckRegistration || "Untitled"}`}
      className="sm:max-w-xl md:max-w-2xl"
    >
      <div className="flex flex-col">
        {/* Header node — the EMI entry itself */}
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Landmark className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-gray-900">EMI Entry Created</p>
              <p className="text-xs text-gray-500">{record.bankName || "—"}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/70 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">EMI Amount</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">{fmtCur(emiAmount)}</p>
            </div>
            <div className="rounded-xl bg-white/70 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Created On</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">{formatDate(record.createdAt || record.emiStartDate)}</p>
            </div>
            <div className="rounded-xl bg-white/70 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tenure</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">{tenure || "—"} months</p>
            </div>
            <div className="rounded-xl bg-white/70 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total EMI Payable</p>
              <p className="mt-0.5 text-sm font-bold text-blue-700">{fmtCur(totalPayable)}</p>
            </div>
          </div>
        </div>

        {/* Flow connector + monthly nodes */}
        {nodes.length > 0 && <div className="ml-[11px] h-4 w-px bg-gray-200" />}
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarClock className="h-7 w-7 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              No monthly payments logged yet — the first will appear here once tenure, EMI amount and Auto-Debit Date are set.
            </p>
          </div>
        ) : (
          <div className="relative mt-2 flex flex-col">
            {nodes.map((node) => (
              <div key={node.index} className="relative flex gap-4 pb-2 pt-4">
                {/* Connector line + dot */}
                <div className="relative flex w-6 shrink-0 flex-col items-center">
                  <span className="absolute top-0 h-4 w-px bg-gray-200" />
                  <span
                    className={`relative z-10 mt-4 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                      node.isLast && node.remaining === 0
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-blue-400 bg-white text-blue-600"
                    }`}
                  >
                    {node.isLast && node.remaining === 0 ? <CheckCircle2 className="h-3.5 w-3.5" /> : node.index + 1}
                  </span>
                  {!node.isLast && <span className="mt-1 flex-1 w-px bg-gray-200" style={{ minHeight: "2.5rem" }} />}
                </div>

                {/* Node card */}
                <div className="mb-1 flex-1 rounded-xl border border-gray-200 bg-white/80 px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-gray-900">
                      Month {node.index + 1} · {formatDate(toDateOnlyString(node.date))}
                    </p>
                    {node.isLast && node.remaining === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Loan Fully Repaid
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                        <CircleDollarSign className="h-2.5 w-2.5" /> This Month&apos;s EMI
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-gray-800">{fmtCur(emiAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
                        <Wallet className="h-2.5 w-2.5" /> Amount Paid
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-emerald-700">{fmtCur(node.amountPaid)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-amber-600">
                        <TrendingDown className="h-2.5 w-2.5" /> Remaining
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-amber-700">{fmtCur(node.remaining)}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${totalPayable > 0 ? Math.min(100, (node.amountPaid / totalPayable) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
