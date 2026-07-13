export type ComplianceStatus = "Valid" | "Expiring Soon" | "Expired";

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

export function getComplianceStatus(date: string, field: ComplianceField = "default"): ComplianceStatus {
  if (!date) return "Expired";

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
