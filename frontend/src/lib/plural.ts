/** "1 trip" / "3 trips" — count plus a noun that takes a plain "s" plural. */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString("en-IN")} ${noun}${n === 1 ? "" : "s"}`;
}
