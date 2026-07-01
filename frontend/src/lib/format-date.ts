const IST = "Asia/Kolkata";

/** Returns today's date as "YYYY-MM-DD" in IST (for date-picker defaults). */
export function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

/** Formats a date/datetime value as "12 Jun 2026" in IST. Returns "—" for empty. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const str = new Date(value).toLocaleDateString("en-GB", {
      timeZone: IST,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    return str.replace(/\//g, "-");
  } catch {
    return String(value);
  }
}

/** Formats a date value as "DD-MM-YYYY". Returns "—" for empty. */
export function formatDateLong(value: string | null | undefined): string {
  return formatDate(value);
}

/** Formats a datetime value as "DD-MM-YYYY, h:mm a" in IST. Returns "—" for empty. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const str = new Date(value).toLocaleString("en-GB", {
      timeZone: IST,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    // en-GB gives DD/MM/YYYY, HH:MM
    return str.replace(/\//g, "-").toUpperCase();
  } catch {
    return String(value);
  }
}
