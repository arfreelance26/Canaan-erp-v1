const IST = "Asia/Kolkata";

/** Returns today's date as "YYYY-MM-DD" in IST (for date-picker defaults). */
export function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

/**
 * True when a date or timestamp falls in the from–to range (both inclusive, IST
 * days). No range means everything is in; with a range, an undated value is out.
 */
export function inDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  let day = value.slice(0, 10);
  if (value.includes("T")) {
    const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value) ? `${value}Z` : value;
    day = new Date(utc).toLocaleDateString("en-CA", { timeZone: IST });
  }
  return (!from || day >= from) && (!to || day <= to);
}

/** True when a start–end period overlaps the range; a missing end is treated as open. */
export function overlapsDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  from: string,
  to: string,
): boolean {
  return (!from || !end || end.slice(0, 10) >= from) && (!to || !start || start.slice(0, 10) <= to);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    let parsedValue = value;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
      parsedValue += "Z";
    }
    const str = new Date(parsedValue).toLocaleDateString("en-GB", {
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

/** Formats a date value as "20 Sep 2026" (IST). Returns "—" for empty. */
export function formatDateWithMonth(value: string | null | undefined): string {
  if (!value) return "—";
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value) ? `${value}Z` : value;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: IST, day: "numeric", month: "short", year: "numeric" })
    .formatToParts(new Date(utc));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("day")} ${part("month")} ${part("year")}`;
}

/** Formats a date value as "DD-MM-YYYY". Returns "—" for empty. */
export function formatDateLong(value: string | null | undefined): string {
  return formatDate(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    let parsedValue = value;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
      parsedValue += "Z";
    }
    const str = new Date(parsedValue).toLocaleString("en-GB", {
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
