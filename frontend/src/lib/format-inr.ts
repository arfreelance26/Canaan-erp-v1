/** Compact rupee amount for dashboards: ₹48.6L, ₹1.2Cr, ₹850. */
export function fmtInrCompact(n: number): string {
  const v = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(v >= 1e8 ? 1 : 2)}Cr`;
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(v >= 1e6 ? 1 : 2)}L`;
  if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(1)}K`;
  return `${sign}₹${Math.round(v)}`;
}
