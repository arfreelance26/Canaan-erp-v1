import type { EmiRecord } from "@/types/finance";

/**
 * Number of monthly installments booked so far, capped to [0, tenure] —
 * creation-anchored: one installment is logged immediately when the EMI is
 * created in the system, then one more per elapsed Auto-Debit Date since —
 * NOT counted from the loan's (possibly long-past) EMI Start Date, which
 * would overstate how much has actually been tracked here. Single source of
 * truth shared by EmiTrackingTable, EmiFormDialog, ViewEmiRecordDialog, and
 * the EMI Tracking page's stat cards.
 */
export function paidInstallments(record: Pick<EmiRecord, "createdAt" | "emiStartDate" | "autoDebitDate">, tenureMonths: number): number {
  const createdRaw = record.createdAt || record.emiStartDate;
  if (!createdRaw || tenureMonths <= 0) return 0;
  const created = new Date(createdRaw);
  if (isNaN(created.getTime())) return 0;

  const autoDebitDay = record.autoDebitDate ? new Date(record.autoDebitDate).getDate() : created.getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let monthsSinceCreation = (today.getFullYear() - created.getFullYear()) * 12 + (today.getMonth() - created.getMonth());
  if (today.getDate() < autoDebitDay) monthsSinceCreation -= 1;
  monthsSinceCreation = Math.max(0, monthsSinceCreation);

  return Math.min(tenureMonths, monthsSinceCreation + 1);
}

/** True once Amount Paid has reached Total EMI Payable (EMI Amount × Tenure). */
export function isEmiCompleted(record: EmiRecord): boolean {
  const tenure = Number(record.tenureMonths) || 0;
  if (tenure <= 0) return false;
  return paidInstallments(record, tenure) >= tenure;
}

/**
 * True when the loan's EMI End Date has already passed but the record still
 * isn't Completed — i.e. by its own dates the tenure should be finished, yet
 * our tracked installment count (paidInstallments) hasn't caught up. This is
 * a genuine anomaly worth flagging (wrong tenure/start date, a missed
 * Auto-Debit Date update, etc.), NOT "today is past this month's due date" —
 * that would flag every active EMI every month and isn't actionable.
 */
export function isEmiOverdue(record: EmiRecord): boolean {
  if (isEmiCompleted(record)) return false;
  if (!record.emiEndDate) return false;
  const end = new Date(record.emiEndDate);
  if (isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return today > end;
}
