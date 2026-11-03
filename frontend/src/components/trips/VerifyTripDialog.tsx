"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import type { Customer } from "@/types/customer";
import { n, calcTripExpenses } from "@/types/trip-sheet";
import { haltPayFromClosure } from "@/lib/halt-pay";

import { RiCheckLine as OkIcon, RiCloseLine as NoIcon } from "@remixicon/react";
export type InvoiceHint = { label: string; value: number };
export const INVOICE_HINTS_KEY = (tripId: string) => `erp_invoice_hints_${tripId}`;

type VerifyTripDialogProps = {
  open: boolean;
  trip: Trip | null;
  closure: TripClosureData | undefined;
  sheet: TripSheetData | undefined;
  customer?: Customer;
  readOnly?: boolean;
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
    <section className="rounded-xl border border-separator-border bg-background-primary-default shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2.5 border-b border-separator-border px-4 py-2.5 ${accent}`}>
        <p className="text-caption-2-semibold text-current opacity-70 dark:opacity-100">{title}</p>
      </div>
      <div className="px-4 py-2">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-1.5 text-sm border-b border-separator-border last:border-0">
      <span className="shrink-0 text-text-tertiary font-medium">{label}</span>
      <span className={`text-right text-text-primary ${mono ? "font-mono text-caption-1-semibold" : ""}`}>
        {value || <span className="text-text-tertiary font-normal">—</span>}
      </span>
    </div>
  );
}

export function VerifyTripDialog({
  open, trip, closure, sheet, customer, readOnly = false,
  onClose, onViewSheet, onEditSheet, onViewBookingSheet, onEditBookingSheet, onConfirm, onReject,
}: VerifyTripDialogProps) {
  const [markedLabels, setMarkedLabels] = useState<Set<string>>(new Set());
  const [expenseMarks, setExpenseMarks] = useState<Record<string, "tick" | "untick">>({});
  const [rejectionReason, setRejectionReason] = useState("");
  const [directReject, setDirectReject] = useState(false);

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
      setDirectReject(false);
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

  // Hire comes from the live trip (source of truth). The trip-sheet snapshot can be
  // stale if the booking hire was edited after the sheet was saved, so only fall back
  // to it when the trip has no hire recorded.
  const hireAmount    = trip.transportHireAmount ? n(trip.transportHireAmount) : (sheet ? n(sheet.hireAmount) : 0);
  // Company halt pay only (a trip expense) — each part saved at its own rate.
  const haltSaved     = haltPayFromClosure(closure);
  const compHD        = haltSaved.companyDays;
  const haltPay       = haltSaved.companyPay;

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

  const isShifting  = trip.tripCategory === "SHIFTING";
  const isToBePaid  = trip.paymentType === "To Be Paid";
  const autoWaives  = isShifting || isToBePaid;

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
        {readOnly ? (
          <div className="flex items-center gap-3 rounded-xl bg-success-surface border border-success-border px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-surface-strong text-success-text">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div>
              <p className="text-body-semibold text-text-primary">Trip Verified</p>
              <p className="text-xs text-text-secondary">This trip has been verified. All details are read-only.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-accent-surface border border-accent-border px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <div>
              <p className="text-body-semibold text-text-primary">Trip sheet pending verification</p>
              <p className="text-xs text-text-secondary">Uploaded by Commercial Manager · Review all details before confirming.</p>
            </div>
          </div>
        )}

        {/* Trip Identification */}
        <SectionCard title="Trip Identification" accent="bg-fill-1 text-text-secondary">
          <Row label="Trip ID"                value={trip.tripId} mono />
          <Row label="Booking Reference"      value={trip.bookingReferenceNo} mono />
          <Row label="Customer"               value={customer?.name ?? ""} />
          <Row label="Container Reference"    value={containerRef} />
          <Row label="Origin → Destination"   value={`${trip.origin} → ${trip.destination}`} />
          <Row label="Approx Distance"        value={trip.approxKm ? `${trip.approxKm} KM` : trip.approxTripDistance ? `${trip.approxTripDistance} KM` : ""} />
          <Row label="Cargo Classification"   value={trip.cargoClassification} />
          <Row label="Container Specification" value={trip.containerSpecification} />
          <Row label="Driver Name"             value={trip.driverName ?? ""} />
          <Row label="Booking Date"            value={trip.bookingCreatedDate
            ? new Date(trip.bookingCreatedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")
            : ""} />
        </SectionCard>

        {/* Trip Closure */}
        <SectionCard title="Trip Closure" accent="bg-purple-surface text-purple-text">
          <Row label="Bill To"             value={closure?.billTo ?? ""} />
          <Row label="Trip Completed Date" value={closure?.tripCompletedDate ?? ""} />
          <Row label="Hire Amount"         value={closure ? fmt(Number(closure.hireAmount)) : ""} />
          <Row label="Transport Amount"    value={closure?.transportAmount ? fmt(Number(closure.transportAmount)) : ""} />
          <Row label="Advance Amount"      value={closure ? fmt(Number(closure.advanceAmount)) : ""} />
          <Row label="Payment Type"        value={trip.paymentType ?? ""} />
          <Row label="Company Halt Days"   value={closure?.companyHaltDays ?? ""} />
          <Row label="Party Halt Days"     value={closure?.partyHaltDays ?? ""} />
          <Row label="Halt Remarks"        value={closure?.haltRemarks ?? ""} />
        </SectionCard>

        {/* Trip Sheet */}
        <SectionCard title="Trip Sheet" accent="bg-accent-surface text-accent-text">
          <Row label="Trip Category"            value={sheet?.tripType ?? ""} />
          <Row label="Route"                    value={sheet ? `${sheet.from} → ${sheet.to}` : ""} />
          <Row label="Start km"                 value={sheet?.startKm ?? ""} />
          <Row label="End km"                   value={sheet?.endKm ?? ""} />
          <Row label="Total km"                 value={sheet?.totalKm ? `${sheet.totalKm} km` : ""} />
          {sheet?.kmVarianceRemark && (
            <div className="rounded-lg border border-warning-border bg-warning-surface px-3 py-2.5">
              <p className="text-caption-2-semibold text-warning-text">KM Variance Remark</p>
              <p className="mt-1 text-xs text-warning-text-strong">{sheet.kmVarianceRemark}</p>
            </div>
          )}
          <Row label="Driver Compensation Type" value={sheet?.driverCompensationType ?? ""} />
          <Row label="Driver Advance (Assigned)"   value={trip.driverAdvance ? fmt(Number(trip.driverAdvance)) : ""} />
          {trip.initialDisbursedAdvance && trip.initialDisbursedAdvance !== "0" && (
            <div className="flex items-start justify-between gap-6 py-1.5 text-sm border-b border-separator-border">
              <span className="shrink-0 text-text-tertiary font-medium">Initial Disbursed Advance</span>
              <div className="text-right">
                <span className="font-semibold text-text-primary">
                  {fmt(Number(trip.initialDisbursedAdvance))}
                </span>
                <p className="text-xs text-text-tertiary mt-0.5">
                  Actual amount given to driver (used for balance)
                </p>
              </div>
            </div>
          )}
          <Row label="Additional Driver Advance (₹)" value={sheet?.additionalDriverAdvance ? fmt(n(sheet.additionalDriverAdvance)) : ""} />
          <Row label="Advance Paid to Driver (Sheet)"   value={sheet ? fmt(n(sheet.driverAdvanceAmount)) : ""} />
          <Row label="Driver Balance"           value={sheet ? fmt(n(sheet.driverBalance)) : ""} />
          <div className="mt-2 mb-1 flex items-center justify-between rounded-lg bg-accent-solid px-4 py-2.5">
            <span className="text-body-semibold text-on-solid/80">Hire Amount</span>
            <span className="text-headline-semibold text-on-solid">{fmt(hireAmount)}</span>
          </div>
        </SectionCard>

        {/* Trip Expenses */}
        <SectionCard
          title="Trip Expenses"
          accent="bg-success-surface text-success-text"
        >
          {sheet ? (
            <div className="flex flex-col gap-2 py-1">
              {/* Verification progress */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {!allMarked && (
                    <p className="text-xs text-text-secondary">
                      Verify each expense below — <span className="font-semibold text-text-primary">{verifiedCount}/{nonZeroExpenses.length}</span> done
                    </p>
                  )}
                  {allMarked && !anyUnticked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-success-text">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      All expenses verified — ready to approve
                    </span>
                  )}
                  {anyUnticked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-danger-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-danger-text">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Issues found — rejection required
                    </span>
                  )}
                </div>
                {markedCount > 0 && (
                  <p className="text-caption-1-medium text-purple-text">
                    {markedCount} flagged for invoice
                  </p>
                )}
              </div>

              {/* expense rows */}
              <div className="rounded-xl border border-separator-border overflow-hidden shadow-sm">
                {expenses.map(({ label, value, note }, idx) => {
                  const invMarked  = markedLabels.has(label);
                  const verifyMark = expenseMarks[label];
                  const isZero     = value === 0;
                  const rowBg = verifyMark === "tick"
                    ? "!bg-success-surface/60"
                    : verifyMark === "untick"
                    ? "!bg-danger-surface/60"
                    : invMarked
                    ? "!bg-purple-surface/70"
                    : idx % 2 === 0 ? "bg-background-primary-default" : "bg-fill-1";
                  return (
                    <div
                      key={label}
                      className={[
                        "flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors",
                        rowBg,
                        idx !== 0 ? "border-t border-separator-border" : "",
                      ].join(" ")}
                    >
                      <span className={`flex items-center gap-1.5 min-w-0 ${isZero ? "text-text-tertiary " : "text-text-secondary "}`}>
                        {invMarked && !verifyMark && (
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-solid shrink-0" />
                        )}
                        {verifyMark === "tick" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-success-solid shrink-0" />
                        )}
                        {verifyMark === "untick" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-danger-solid shrink-0" />
                        )}
                        {label}
                        {note && <span className="text-caption-1-regular text-text-tertiary">({note})</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0 ml-3">
                        <span className={isZero ? "text-text-tertiary text-sm" : "text-text-primary text-body-semibold"}>
                          {fmt(value)}
                        </span>

                        {/* Tick / cross verification buttons — only on non-zero expenses in edit mode */}
                        {!isZero && !readOnly && (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setExpenseMark(label, "tick")}
                              title="Mark as correct"
                              className={[
                                "flex h-6 w-6 items-center justify-center rounded-full border-2 text-caption-1-semibold transition",
                                verifyMark === "tick"
                                  ? "border-success-solid bg-success-solid text-on-solid shadow-sm"
                                  : "border-separator-border bg-background-primary-default text-text-tertiary hover:border-success-border-strong hover:text-success-text",
                              ].join(" ")}
                            >
                              <OkIcon className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpenseMark(label, "untick")}
                              title="Mark as incorrect"
                              className={[
                                "flex h-6 w-6 items-center justify-center rounded-full border-2 text-caption-1-semibold transition",
                                verifyMark === "untick"
                                  ? "border-danger-solid bg-danger-solid text-on-solid shadow-sm"
                                  : "border-separator-border bg-background-primary-default text-text-tertiary hover:border-danger-border-strong hover:text-danger-text",
                              ].join(" ")}
                            >
                              <NoIcon className="size-3.5" />
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
                    <div className="flex items-center justify-between border-t border-orange-border bg-orange-surface px-3.5 py-2.5">
                      <span className="flex items-center gap-1.5 text-sm text-orange-text">
                        Major Repairs
                        <span className="rounded-full bg-orange-surface-strong px-1.5 py-0.5 text-caption-2-semibold text-orange-text">not in trip cost</span>
                      </span>
                      <span className="text-body-semibold text-orange-text">{fmt(majorRepairsTotal)}</span>
                    </div>
                    {(sheet.majorRepairs || []).map((r, i) => (
                      <div key={i} className="flex justify-between border-t border-orange-border bg-orange-surface/40 px-3.5 py-1.5">
                        <span className="pl-3 text-xs text-text-tertiary">· {r.name}</span>
                        <span className="text-xs text-text-secondary">{fmt(n(r.cost))}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Total */}
              <div className="mt-1 flex items-center justify-between rounded-xl bg-success-solid px-5 py-3.5 shadow-sm">
                <div>
                  <p className="text-caption-1-semibold text-on-solid/80">Total Trip Expense</p>
                </div>
                <span className="text-title-2-semibold text-on-solid tracking-tight">{fmt(totalExpense)}</span>
              </div>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-text-tertiary">No trip sheet available yet.</p>
          )}
        </SectionCard>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onViewSheet}
              className="rounded-lg border border-separator-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-secondary shadow-sm hover:bg-fill-2 hover:border-border-button-default transition-colors">
              View Trip Sheet
            </button>
            {!readOnly && (
              <button type="button" onClick={onEditSheet}
                className="rounded-lg border border-accent-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-accent-text shadow-sm hover:bg-accent-surface-strong transition-colors">
                Edit Trip Sheet
              </button>
            )}
            <button type="button" onClick={onViewBookingSheet}
              className="rounded-lg border border-separator-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-secondary shadow-sm hover:bg-fill-2 hover:border-border-button-default transition-colors">
              View Booking Sheet
            </button>
            {!readOnly && (
              <>
                <button type="button" onClick={onEditBookingSheet}
                  className="rounded-lg border border-accent-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-accent-text shadow-sm hover:bg-accent-surface-strong transition-colors">
                  Edit Booking Sheet
                </button>
                <button type="button" onClick={() => setDirectReject(true)}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-danger-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-danger-text shadow-sm hover:bg-danger-surface-strong hover:border-danger-border-strong transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject Trip
                </button>
              </>
            )}
          </div>

          {/* Verification Decision — auto-derived from tick/untick marks — hidden in read-only mode */}
          {!readOnly && <div className="border-t border-separator-border pt-3">
            <p className="mb-2 text-caption-1-semibold text-text-secondary">Verification Decision</p>

            {/* SHIFTING trips are never billed to a customer, and "To Be Paid" trips are
                deliberately not being invoiced either — verifying either skips the invoice
                step entirely and goes straight to Waived Invoice. Only relevant when the
                trip could actually be approved right now, not while rejecting. */}
            {autoWaives && !directReject && autoDecision !== "reject" && (
              <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-purple-border bg-purple-surface px-3.5 py-2.5">
                <svg className="h-4 w-4 shrink-0 text-purple-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-caption-1-medium text-purple-text">
                  {isShifting
                    ? "This is a SHIFTING trip — it isn't billed to a customer, so confirming verification will"
                    : "This trip's payment type is \"To Be Paid\" — so confirming verification will"}{" "}
                  automatically mark it <span className="font-semibold">Waived Invoice</span> instead of Verified.
                </p>
              </div>
            )}

            {/* Direct reject — bypasses expense verification entirely */}
            {directReject && (
              <div className="flex flex-col gap-2 rounded-xl border border-danger-border bg-danger-surface p-3">
                <p className="text-caption-1-semibold text-danger-text">
                  Rejecting this trip sheet — it will be sent back to the Docs team.
                </p>
                <label className="text-caption-1-semibold text-danger-text">Rejection Reason (required)</label>
                <textarea
                  rows={3}
                  autoFocus
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Describe why this trip sheet is being rejected..."
                  className="w-full resize-none rounded-lg border border-danger-border bg-background-primary-default px-3 py-2 text-sm text-text-primary placeholder-text-placeholder focus:outline-none focus:ring-2 focus:ring-danger-border-strong"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setDirectReject(false); setRejectionReason(""); }}
                    className="flex-1 rounded-xl border border-separator-border bg-background-primary-default px-4 py-2.5 text-body-semibold text-text-secondary hover:bg-fill-2 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!rejectionReason.trim()}
                    onClick={() => onReject(rejectionReason.trim())}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-danger-solid px-4 py-2.5 text-body-semibold text-on-solid shadow-sm hover:bg-danger-solid-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Send Back to Docs
                  </button>
                </div>
              </div>
            )}

            {/* Pending state */}
            {!directReject && autoDecision === null && (
              <div className="flex items-center gap-2 rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
                <svg className="h-4 w-4 shrink-0 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-text-tertiary">
                  Tick or cross every expense above to unlock the decision.
                  <span className="ml-1 font-semibold text-text-secondary">
                    {verifiedCount}/{nonZeroExpenses.length} verified.
                  </span>
                </p>
              </div>
            )}

            {/* Rejection reason — auto-shown when any expense is unticked */}
            {!directReject && autoDecision === "reject" && (
              <div className="mb-3 flex flex-col gap-2 rounded-xl border border-danger-border bg-danger-surface p-3">
                <p className="text-caption-1-semibold text-danger-text">
                  One or more expenses were marked incorrect — rejection required.
                </p>
                <label className="text-caption-1-semibold text-danger-text">Rejection Reason (required — sent back to Docs team)</label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Describe what needs to be corrected..."
                  className="w-full resize-none rounded-lg border border-danger-border bg-background-primary-default px-3 py-2 text-sm text-text-primary placeholder-text-placeholder focus:outline-none focus:ring-2 focus:ring-danger-border-strong"
                />
              </div>
            )}

            {/* Confirm Verification — only when all are ticked */}
            {!directReject && autoDecision === "approve" && (
              <button
                type="button"
                onClick={onConfirm}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-success-solid px-5 py-3 text-body-semibold text-on-solid shadow-sm hover:bg-success-solid-hover transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Confirm Verification
              </button>
            )}

            {/* Send Back to Docs — only when any expense is unticked */}
            {!directReject && autoDecision === "reject" && (
              <button
                type="button"
                disabled={!rejectionReason.trim()}
                onClick={() => onReject(rejectionReason.trim())}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-danger-solid px-5 py-3 text-body-semibold text-on-solid shadow-sm hover:bg-danger-solid-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Send Back to Docs
              </button>
            )}
          </div>}
        </div>

      </div>
    </Dialog>
  );
}
