const IST = "Asia/Kolkata";

/** Returns today's date as "YYYY-MM-DD" in IST (for date-picker defaults). */
export function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

/** Formats a date/datetime value as "12 Jun 2026" in IST. Returns "—" for empty. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-IN", {
      timeZone: IST,
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

/** Formats a date value as "12 June 2026" (long month) in IST. Returns "—" for empty. */
export function formatDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-IN", {
      timeZone: IST,
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

/** Formats a datetime value as "12 Jun 2026, 2:30 PM" in IST. Returns "—" for empty. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-IN", {
      timeZone: IST,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}
