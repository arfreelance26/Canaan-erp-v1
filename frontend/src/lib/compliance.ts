export type ComplianceStatus = "Valid" | "Expiring Soon" | "Expired";

const EXPIRING_SOON_WINDOW_DAYS = 30;

export function getComplianceStatus(date: string): ComplianceStatus {
  if (!date) return "Expired";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(date);
  expiry.setHours(0, 0, 0, 0);

  const diffDays = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "Expired";
  if (diffDays <= EXPIRING_SOON_WINDOW_DAYS) return "Expiring Soon";
  return "Valid";
}
