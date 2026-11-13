/** "Not Uploaded" = no expiry date entered for the document. It is a gap to
 * fill, not an expiry, so it's counted on its own and never as "Expired". */
export type ComplianceStatus = "Valid" | "Expiring Soon" | "Expired" | "Not Uploaded";

export type ComplianceField =
  | "fc"
  | "nationalPermit"
  | "localPermit"
  | "pollution"
  | "roadTax"
  | "insurance"
  | "rc"
  | "default";

const WARNING_DAYS: Record<ComplianceField, number> = {
  fc:            30,   // FC: 1 month
  nationalPermit: 10,
  localPermit:   10,
  pollution:      7,   // PUC: 7 days
  roadTax:       10,
  insurance:      7,
  rc:            30,
  default:       30,
};

/** "No Cost": the document is uploaded (has an expiry date) but its cost is
 * empty or 0 — it then counts as ₹0 in Profitability and the Running Cost
 * Calculator. Separate from the status: a document can be Valid and No Cost. */
export function isMissingCost(date: string | null | undefined, cost: string | number | null | undefined): boolean {
  return !!date && !(Number(cost) > 0);
}

/** The blue "No Cost" tag, the same everywhere. */
export const NO_COST_TAG = "bg-accent-surface text-accent-text";

export function getComplianceStatus(date: string, field: ComplianceField = "default"): ComplianceStatus {
  if (!date) return "Not Uploaded";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(date);
  expiry.setHours(0, 0, 0, 0);

  const diffDays = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  const warnDays = WARNING_DAYS[field] ?? WARNING_DAYS.default;

  if (diffDays < 0) return "Expired";
  if (diffDays <= warnDays) return "Expiring Soon";
  return "Valid";
}

/** The document filter's order on Compliance & Renewals: what needs doing first.
 *  Expired, then Not Uploaded, then Expiring Soon, then Valid (backend
 *  finance_report.COMPLIANCE_URGENCY — the report sorts the same way). */
export const COMPLIANCE_URGENCY: ComplianceStatus[] = ["Expired", "Not Uploaded", "Expiring Soon", "Valid"];

/** Most urgent first for one document: by COMPLIANCE_URGENCY, then the
 *  earliest expiry (most overdue / soonest due); Not Uploaded by registration. */
export function compareByUrgency(
  a: { date: string; reg: string }, b: { date: string; reg: string }, field: ComplianceField,
): number {
  const rank = (x: { date: string }) => COMPLIANCE_URGENCY.indexOf(getComplianceStatus(x.date, field));
  return rank(a) - rank(b)
    || (a.date && b.date ? a.date.localeCompare(b.date) : 0)
    || a.reg.localeCompare(b.reg);
}
