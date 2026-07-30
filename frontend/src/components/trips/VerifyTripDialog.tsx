"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import type { Customer } from "@/types/customer";
import { n, calcTripExpenses } from "@/types/trip-sheet";

export type InvoiceHint = { label: string; value: number };
export const INVOICE_HINTS_KEY = (tripId: string) => `erp_invoice_hints_${tripId}`;

type VerifyTripDialogProps = {
  open: boolean;
  trip: Trip | null;
  closure: TripClosureData | undefined;
  sheet: TripSheetData | undefined;
  customer?: Customer;
  onClose: () => void;
  onViewSheet: () => void;
  onEditSheet: () => void;
  onViewBookingSheet: () => void;
  onEditBookingSheet: () => void;
  onConfirm: () => void;
  onReject: (reason: string) => void;
};

function SectionCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 ${accent}`}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-current opacity-70 dark:text-white dark:opacity-100">{title}</p>
      </div>
      <div className="px-4 py-2">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-1.5 text-sm border-b border-gray-50 last:border-0">
      <span className="shrink-0 text-gray-400 font-medium dark:text-white">{label}</span>
      <span className={`text-right font-semibold text-gray-800 dark:text-white ${mono ? "font-mono text-xs" : ""}`}>
        {value || <span className="text-gray-300 font-normal dark:text-gray-500">—</span>}
      </span>
    </div>
  );
}

export function VerifyTripDialog({
  open, trip, closure, sheet, customer,
  onClose, onViewSheet, onEditSheet, onViewBookingSheet, onEditBookingSheet, onConfirm, onReject,
}: VerifyTripDialogProps) {
  const [markedLabels, setMarkedLabels] = useState<Set<string>>(new Set());
  const [expenseMarks, setExpenseMarks] = useState<Record<string, "tick" | "untick">>({});
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (!trip) return;
    try {
      const saved = localStorage.getItem(INVOICE_HINTS_KEY(trip.id));
      if (saved) {
        const arr: InvoiceHint[] = JSON.parse(saved);
        setMarkedLabels(new Set(arr.map((e) => e.label)));
      } else {
        setMarkedLabels(new Set());
      }
    } catch {}
  }, [trip?.id, open]);

  useEffect(() => {
    if (!open) {
      setExpenseMarks({});
      setRejectionReason("");
    }
  }, [open]);

  function setExpenseMark(label: string, mark: "tick" | "untick") {
    setExpenseMarks((prev) => {
      if (prev[label] === mark) {
        const next = { ...prev };
        delete next[label];
        return next;
      }
      return { ...prev, [label]: mark };
    });
  }

  if (!trip) return null;

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const hireAmount    = sheet ? n(sheet.hireAmount) : 0;
  const compHD        = closure ? Number(closure.companyHaltDays || 0) : 0;
  const partHD        = closure ? Number(closure.partyHaltDays   || 0) : 0;
  const totalHD       = compHD + partHD;
  const totalHaltComp = closure ? Number(closure.driverHaltCompensation || 0) : 0;
  const perDayRate    = totalHD > 0 ? totalHaltComp / totalHD : 0;
  const haltPay       = compHD * perDayRate;

  const majorRepairsTotal = sheet
    ? (sheet.majorRepairs || []).reduce((sum, r) => sum + n(r.cost), 0)
    : 0;

  const expenses: { label: string; value: number; note?: string }[] = sheet
    ? [
        { label: "Driver Batta",           value: n(sheet.driverPay) },
        { label: "Halt Pay (Company)",      value: haltPay,                      note: compHD > 0 ? `${compHD} day${compHD > 1 ? "s" : ""}` : undefined },
        { label: "Port Pass Expense",       value: n(sheet.portPassExpense) },
        { label: "Weight Sheet Expense",    value: n(sheet.weightSheetExpense) },
        { label: "Mamol Expense",           value: n(sheet.mamolExpense) },
        { label: "Claimable Mamol Expense", value: n(sheet.claimableMamolExpense) },
        { label: "Traffic / RTO / Police",  value: n(sheet.trafficRtoExpense) },
        { label: "Lift On / Off",           value: n(sheet.liftOnOffExpense) },
        { label: "Crane Operator",          value: n(sheet.craneOperatorExpense) },
        { label: "Parking",                 value: n(sheet.parkingExpense) },
        { label: "Toll Charges",            value: n(sheet.tollCharges) },
        { label: "Other Expenses",          value: n(sheet.otherExpenses) },
      ]
    : [];

  const totalExpense  = calcTripExpenses(sheet ?? {} as TripSheetData) + haltPay;
  const markedCount   = markedLabels.size;

  // Verification logic — only non-zero expenses need to be ticked or unticked
  const nonZeroExpenses = expenses.filter((e) => e.value > 0);
  const verifiedCount   = nonZeroExpenses.filter((e) => expenseMarks[e.label] !== undefined).length;
  const allMarked       = nonZeroExpenses.length === 0 || nonZeroExpenses.every((e) => expenseMarks[e.label] !== undefined);
  const anyUnticked     = nonZeroExpenses.some((e) => expenseMarks[e.label] === "untick");
  const autoDecision: "approve" | "reject" | null = allMarked ? (anyUnticked ? "reject" : "approve") : null;

  function toggleMark(label: string, value: number) {
    const next = new Set(markedLabels);
    if (next.has(label)) { next.delete(label); } else { next.add(label); }
    setMarkedLabels(next);
    const marked = expenses.filter((e) => next.has(e.label));
    localStorage.setItem(
      INVOICE_HINTS_KEY(trip!.id),
      JSON.stringify(marked.map(({ label: l, value: v }) => ({ label: l, value: v }))),
    );
  }

  const containerRef =
    trip.containerSpecification === "2 X 20 FEET CONTAINERS"
      ? `${trip.containerNumber1} / ${trip.containerNumber2}`
      : trip.containerSpecification === "20 FT CONTAINER" || trip.containerSpecification === "40 FT CONTAINER"
      ? trip.containerNumber ?? ""
      : trip.containerSpecification === "OPEN LOAD CARGO"
      ? trip.cargoReference ?? ""
      : "";

  return (
    <Dialog open={open} onClose={onClose} title={`Verify Trip — ${trip.tripId}`} className="max-w-4xl">
      <div className="flex flex-col gap-4">

        {/* Status banner */}
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Trip sheet pending verification</p>
            <p className="text-xs text-gray-500 dark:text-white">Uploaded by Commercial Manager · Review all details before confirming.</p>
          </div>
        </div>

        {/* Trip Identification */}
        <SectionCard title="Trip Identification" accent="bg-slate-50 text-slate-500">
          <Row label="Trip ID"                value={trip.tripId} mono />
          <Row label="Booking Reference"      value={trip.bookingReferenceNo} mono />
          <Row label="Customer"               value={customer?.name ?? ""} />
          <Row label="Container Reference"    value={containerRef} />
          <Row label="Origin → Destination"   value={`${trip.origin} → ${trip.destination}`} />
          <Row label="Approx Distance"        value={trip.approxKm ? `${trip.approxKm} KM` : trip.approxTripDistance ? `${trip.approxTripDistance} KM` : ""} />
          <Row label="Cargo Classification"   value={trip.cargoClassification} />
          <Row label="Container Specification" value={trip.containerSpecification} />
        </SectionCard>

        {/* Trip Closure */}
        <SectionCard title="Trip Closure" accent="bg-violet-50 text-violet-500">
          <Row label="Bill To"             value={closure?.billTo ?? ""} />
          <Row label="Trip Completed Date" value={closure?.tripCompletedDate ?? ""} />
          <Row label="Hire Amount"         value={closure ? fmt(Number(closure.hireAmount)) : ""} />
          <Row label="Transport Amount"    value={closure?.transportAmount ? fmt(Number(closure.transportAmount)) : ""} />
          <Row label="Advance Amount"      value={closure ? fmt(Number(closure.advanceAmount)) : ""} />
          <Row label="Payment Mode"        value={trip.paymentType ?? ""} />
          <Row label="Company Halt Days"   value={closure?.companyHaltDays ?? ""} />
          <Row label="Party Halt Days"     value={closure?.partyHaltDays ?? ""} />
          <Row label="Halt Remarks"        value={closure?.haltRemarks ?? ""} />
        </SectionCard>

        {/* Trip Sheet */}
        <SectionCard title="Trip Sheet" accent="bg-blue-50 text-blue-500">
          <Row label="Trip Category"            value={sheet?.tripType ?? ""} />
          <Row label="Route"                    value={sheet ? `${sheet.from} → ${sheet.to}` : ""} />
          <Row label="Start km"                 value={sheet?.startKm ?? ""} />
          <Row label="End km"                   value={sheet?.endKm ?? ""} />
          <Row label="Total km"                 value={sheet?.totalKm ? `${sheet.totalKm} km` : ""} />
          {sheet?.kmVarianceRemark && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">KM Variance Remark</p>
              <p className="mt-1 text-xs text-amber-800">{sheet.kmVarianceRemark}</p>
            </div>
          )}
          <Row label="Driver Compensation Type" value={sheet?.driverCompensationType ?? ""} />
          <Row label="Driver Advance (Assigned)"   value={trip.driverAdvance ? fmt(Number(trip.driverAdvance)) : ""} />
          {trip.initialDisbursedAdvance && trip.initialDisbursedAdvance !== "0" && (
            <div className="flex items-start justify-between gap-6 py-1.5 text-sm border-b border-gray-50">
              <span className="shrink-0 text-gray-400 font-medium dark:text-white">Initial Disbursed Advance</span>
              <div className="text-right">
                <span className="font-semibold text-gray-800 dark:text-white">
                  {fmt(Number(trip.initialDisbursedAdvance))}
                </span>
                <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">
                  Actual amount given to driver (used for balance)
                </p>
              </div>
            </div>
          )}
          <Row label="Advance Paid to Driver (Sheet)"   value={sheet ? fmt(n(sheet.driverAdvanceAmount)) : ""} />
          <Row label="Driver Balance"           value={sheet ? fmt(n(sheet.driverBalance)) : ""} />
          <div className="mt-2 mb-1 flex items-center justify-between rounded-lg bg-blue-600 px-4 py-2.5">
            <span className="text-sm font-semibold text-blue-100">Hire Amount</span>
            <span className="text-base font-bold text-white">{fmt(hireAmount)}</span>
          </div>
        </SectionCard>

        {/* Trip Expenses */}
        <SectionCard
          title="Trip Expenses"
          accent="bg-emerald-50 text-emerald-600"
        >
          {sheet ? (
            <div className="flex flex-col gap-2 py-1">
              {/* Verification progress */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {!allMarked && (
                    <p className="text-xs text-gray-500 dark:text-white">
                      Verify each expense below — <span className="font-semibold text-gray-700 dark:text-white">{verifiedCount}/{nonZeroExpenses.length}</span> done
                    </p>
                  )}
                  {allMarked && !anyUnticked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      All expenses verified — ready to approve
                    </span>
                  )}
                  {anyUnticked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Issues found — rejection required
                    </span>
                  )}
                </div>
                {markedCount > 0 && (
                  <p className="text-xs font-medium text-indigo-600 dark:text-white">
                    {markedCount} flagged for invoice
                  </p>
                )}
              </div>

              {/* expense rows */}
              <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                {expenses.map(({ label, value, note }, idx) => {
                  const invMarked  = markedLabels.has(label);
                  const verifyMark = expenseMarks[label];
                  const isZero     = value === 0;
                  const rowBg = verifyMark === "tick"
                    ? "!bg-emerald-50/60"
                    : verifyMark === "untick"
                    ? "!bg-red-50/60"
                    : invMarked
                    ? "!bg-indigo-50/70"
                    : idx % 2 === 0 ? "bg-white" : "bg-gray-50/60";
                  return (
                    <div
                      key={label}
                      className={[
                        "flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors",
                        rowBg,
                        idx !== 0 ? "border-t border-gray-100" : "",
                      ].join(" ")}
                    >
                      <span className={`flex items-center gap-1.5 min-w-0 ${isZero ? "text-gray-300 dark:text-gray-600" : "text-gray-600 dark:text-white"}`}>
                        {invMarked && !verifyMark && (
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                        )}
                        {verifyMark === "tick" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                        {verifyMark === "untick" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                        )}
                        {label}
                        {note && <span className="text-xs text-gray-400 font-normal dark:text-white">({note})</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0 ml-3">
                        <span className={isZero ? "text-gray-300 text-sm dark:text-gray-600" : "font-semibold text-gray-800 text-sm dark:text-white"}>
                          {fmt(value)}
                        </span>

                        {/* ✓ / ✗ verification buttons — only on non-zero expenses */}
                        {!isZero && (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setExpenseMark(label, "tick")}
                              title="Mark as correct"
                              className={[
                                "flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                                verifyMark === "tick"
                                  ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                                  : "border-gray-200 bg-white text-gray-300 hover:border-emerald-400 hover:text-emerald-500",
                              ].join(" ")}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpenseMark(label, "untick")}
                              title="Mark as incorrect"
                              className={[
                                "flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                                verifyMark === "untick"
                                  ? "border-red-500 bg-red-500 text-white shadow-sm"
                                  : "border-gray-200 bg-white text-gray-300 hover:border-red-400 hover:text-red-500",
                              ].join(" ")}
                            >
                              ✗
                            </button>
                          </span>
                        )}

                      </span>
                    </div>
                  );
                })}

                {/* Major repairs */}
                {majorRepairsTotal > 0 && (
                  <>
                    <div className="flex items-center justify-between border-t border-orange-100 bg-orange-50 px-3.5 py-2.5">
                      <span className="flex items-center gap-1.5 text-sm text-orange-700 dark:text-white">
                        Major Repairs
                        <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-500 dark:text-white dark:bg-orange-900/40">not in trip cost</span>
                      </span>
                      <span className="text-sm font-semibold text-orange-700 dark:text-white">{fmt(majorRepairsTotal)}</span>
                    </div>
                    {(sheet.majorRepairs || []).map((r, i) => (
                      <div key={i} className="flex justify-between border-t border-orange-50 bg-orange-50/40 px-3.5 py-1.5">
                        <span className="pl-3 text-xs text-gray-400 dark:text-white">· {r.name}</span>
                        <span className="text-xs text-gray-500 dark:text-white">{fmt(n(r.cost))}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Total */}
              <div className="mt-1 flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3.5 shadow-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Total Trip Expense</p>
                </div>
                <span className="text-xl font-bold text-white tracking-tight">{fmt(totalExpense)}</span>
              </div>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-gray-400 dark:text-white">No trip sheet available yet.</p>
          )}
        </SectionCard>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onViewSheet}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-colors">
              View Trip Sheet
            </button>
            <button type="button" onClick={onEditSheet}
              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-sm hover:bg-blue-50 transition-colors">
              Edit Trip Sheet
            </button>
            <button type="button" onClick={onViewBookingSheet}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-colors">
              View Booking Sheet
            </button>
            <button type="button" onClick={onEditBookingSheet}
              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-sm hover:bg-blue-50 transition-colors">
              Edit Booking Sheet
            </button>
          </div>

          {/* Verification Decision — auto-derived from tick/untick marks */}
          <div className="border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider dark:text-white">Verification Decision</p>

            {/* Pending state */}
            {autoDecision === null && (
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-400 dark:text-white">
                  Tick (✓) or untick (✗) every expense above to unlock the decision.
                  <span className="ml-1 font-semibold text-gray-500 dark:text-white">
                    {verifiedCount}/{nonZeroExpenses.length} verified.
                  </span>
                </p>
              </div>
            )}

            {/* Rejection reason — auto-shown when any expense is unticked */}
            {autoDecision === "reject" && (
              <div className="mb-3 flex flex-col gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-600 dark:text-white">
                  One or more expenses were marked incorrect (✗) — rejection required.
                </p>
                <label className="text-xs font-semibold text-red-500 dark:text-white">Rejection Reason (required — sent back to Docs team)</label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Describe what needs to be corrected..."
                  className="w-full resize-none rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
            )}

            {/* Confirm Verification — only when all are ticked */}
            {autoDecision === "approve" && (
              <button
                type="button"
                onClick={onConfirm}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Confirm Verification
              </button>
            )}

            {/* Send Back to Docs — only when any expense is unticked */}
            {autoDecision === "reject" && (
              <button
                type="button"
                disabled={!rejectionReason.trim()}
                onClick={() => onReject(rejectionReason.trim())}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Send Back to Docs
              </button>
            )}
          </div>
        </div>

      </div>
    </Dialog>
  );
}
