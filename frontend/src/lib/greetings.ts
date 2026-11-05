import type { GreetingContext } from "@/lib/api";
import type { JoshineExpression } from "@/lib/joshine";

/**
 * Joshine's greeting: one short, warm line, like "Up before the trucks,
 * Rhenius?" (components/joshine/JoshineGreeting.tsx shows it). Joshine
 * greets after every login, and again when someone comes back after a
 * 30-minute break; never just for moving between pages or refreshing.
 *
 * Rules for the words: first name only, a handful of words, no "!", never
 * guilt ("away 9 days!") or jokes about work; late-night lines are caring.
 * Every list below can be edited freely; {name} is the first name and
 * {days} / {years} fill in where a line uses them.
 *
 * The first rule that fits wins:
 *   birthday → work anniversary → festival → first visit ever → rare line →
 *   away 3+ days → back again today → Monday / Friday / weekend →
 *   first of the month → time of day.
 */

export type GreetingSlot = "early" | "morning" | "afternoon" | "evening" | "night" | "midnight";
export type GreetingKind = GreetingSlot | "birthday" | "anniversary" | "festival" | "first" | "rare" | "away" | "back"
  | "monday" | "friday" | "weekend" | "month" | "tea";

export type Greeting = { kind: GreetingKind; text: string; expression: JoshineExpression };

// ── The words ────────────────────────────────────────────────────────────────
const SLOT_LINES: Record<GreetingSlot, string[]> = {
  // 4:00 – 6:59
  early: [
    "Early start, {name}.", "Up before the trucks, {name}?", "The early shift, {name}.", "Before the sun, {name}.",
    "Quiet hours, {name}.", "First one in, {name}.", "Dawn patrol, {name}.", "An early one today, {name}.",
  ],
  // 7:00 – 11:59
  morning: [
    "Morning, {name}.", "Good morning, {name}.", "Ready when you are, {name}.", "Fresh start, {name}.",
    "Let's get rolling, {name}.", "A good day ahead, {name}.", "Coffee and trucks, {name}?", "Wheels turning, {name}.",
    "Bright and early, {name}.", "Here we go, {name}.",
  ],
  // 12:00 – 16:59
  afternoon: [
    "Good afternoon, {name}.", "Afternoon, {name}.", "Halfway there, {name}.", "Keeping it moving, {name}.",
    "Post-lunch push, {name}?", "Steady as she goes, {name}.", "Back from lunch, {name}?", "The afternoon stretch, {name}.",
  ],
  // 17:00 – 20:59
  evening: [
    "Good evening, {name}.", "Evening, {name}.", "Winding down, {name}?", "One last look, {name}?",
    "Nearly there, {name}.", "Wrapping up the day, {name}?", "Golden hour, {name}.", "Closing out strong, {name}.",
  ],
  // 21:00 – 23:59
  night: [
    "Working late, {name}?", "Still at it, {name}.", "The quiet shift, {name}.", "Late hours, {name}.",
    "Night owl mode, {name}?", "Trucks rest, you don't, {name}?", "One more thing, {name}?", "Calm night, {name}.",
  ],
  // 0:00 – 3:59
  midnight: [
    "Burning the midnight oil, {name}?", "Late one tonight, {name}.", "Past midnight, {name}.", "Couldn't sleep, {name}?",
    "The world's asleep, {name}.", "Don't stay up too long, {name}.", "Midnight check-in, {name}?", "Small hours, {name}.",
  ],
};

const SITUATION_LINES: Record<Exclude<GreetingKind, GreetingSlot | "festival" | "tea">, string[]> = {
  birthday: ["Happy birthday, {name}.", "Many happy returns, {name}.", "Your day today, {name}."],
  anniversary: ["{years} with Canaan today, {name}.", "Happy work anniversary, {name}.", "{years} together today, {name}."],
  first: ["Welcome to Canaan, {name}.", "Glad you're here, {name}.", "Let's get you started, {name}."],
  rare: [
    "The fleet's in good hands, {name}.", "Another day, another mile, {name}.", "Keep the wheels turning, {name}.",
    "Roads look good today, {name}.", "Steady hands, steady fleet, {name}.",
  ],
  away: ["Welcome back, {name}. It's been {days} days.", "Good to see you again, {name}.", "Long time, {name}.", "There you are, {name}."],
  back: ["Back at it, {name}.", "Welcome back, {name}.", "Picking up where you left off, {name}.", "Round two, {name}?", "Missed you, {name}."],
  monday: ["Fresh week, {name}.", "New week, new trips, {name}.", "Monday again, {name}.", "Let's start the week, {name}."],
  friday: ["Friday already, {name}.", "Last push of the week, {name}.", "Almost the weekend, {name}."],
  weekend: ["Weekend shift, {name}?", "Working the weekend, {name}?", "A quiet weekend check, {name}?"],
  month: ["A new month, {name}.", "Fresh month, {name}."],
};

const FESTIVAL_LINES: Record<string, string[]> = {
  pongal: ["Happy Pongal, {name}.", "Pongal greetings, {name}."],
  deepavali: ["Happy Deepavali, {name}.", "A bright Deepavali, {name}."],
  ayudha_pooja: ["Happy Ayudha Pooja, {name}.", "Ayudha Pooja greetings, {name}."],
  christmas: ["Happy Christmas, {name}.", "Season's greetings, {name}."],
  newyear: ["Happy New Year, {name}.", "A fresh year, {name}."],
};

/** Joshine's face for each kind of greeting. */
const EXPRESSION: Record<GreetingKind, JoshineExpression> = {
  early: "curious", morning: "happy", afternoon: "focused", evening: "calm", night: "calm", midnight: "sleepy",
  birthday: "sparkle", anniversary: "love", festival: "sparkle", first: "happy", rare: "wink",
  away: "happy", back: "happy", monday: "determined", friday: "wink", weekend: "curious", month: "sparkle",
  tea: "sparkle",
};

// ── Time in India ────────────────────────────────────────────────────────────
function istParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23", weekday: "short", day: "numeric",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")) % 24, weekday: get("weekday"), day: Number(get("day")) };
}

export function greetingSlot(now: Date = new Date()): GreetingSlot {
  const { hour } = istParts(now);
  if (hour < 4) return "midnight";
  if (hour < 7) return "early";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

// ── Per-person memory (this browser) ─────────────────────────────────────────
const KEY = (userKey: string, what: string) => `canaan.greet.v2.${userKey}.${what}`;
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private window: the greeting may repeat sooner, harmless */
  }
};

/** Coming back after this long is a new visit, and gets a new hello. */
const VISIT_GAP_MS = 30 * 60 * 1000;

/** The per-person key the greeting memory is stored under. */
export function greetingUserKey(user: { id: number | null; email?: string | null }): string {
  return String(user.id ?? user.email ?? "");
}

/** Called at login: the next page greets, however recently they were greeted. */
export function markLoginGreeting(userKey: string): void {
  if (userKey) write(KEY(userKey, "login"), "1");
}

/** Greet again on the next page load (Admin's celebration preview). */
export function resetVisitGreeting(userKey: string): void {
  write(KEY(userKey, "shown"), "0");
}

/** Whether to greet now: just logged in, or back after a 30-minute break.
 *  Only asks; markGreeted() records it once the bubble is really on screen,
 *  so a check that gets cancelled (React runs effects twice in development)
 *  can't use the greeting up. */
export function shouldGreet(userKey: string, now: Date = new Date()): boolean {
  if (!userKey) return false;
  if (read(KEY(userKey, "login")) === "1") return true;
  const last = Number(read(KEY(userKey, "shown")) ?? 0);
  return now.getTime() - last >= VISIT_GAP_MS;
}

/** The greeting is on screen: no more until the next login or break. */
export function markGreeted(userKey: string, now: Date = new Date()): void {
  write(KEY(userKey, "shown"), String(now.getTime()));
  write(KEY(userKey, "login"), "0");
}

/** Every line once before any repeats, and never the same one twice in a row. */
function fromDeck(userKey: string, pool: string, lines: string[]): string {
  const k = KEY(userKey, `deck.${pool}`);
  type Deck = { order: number[]; next: number; last: number | null };
  let deck: Deck | null = null;
  try {
    const d = JSON.parse(read(k) ?? "null") as Deck | null;
    if (d && Array.isArray(d.order) && d.order.length === lines.length) deck = d;
  } catch {
    deck = null;
  }
  if (!deck || deck.next >= deck.order.length) {
    const order = lines.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const last = deck?.last ?? null;
    if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
    deck = { order, next: 0, last };
  }
  const index = deck.order[deck.next];
  write(k, JSON.stringify({ ...deck, next: deck.next + 1, last: index }));
  return lines[index];
}

function fill(line: string, name: string, extra: Record<string, string> = {}): string {
  let text = line;
  for (const [k, v] of Object.entries(extra)) text = text.replaceAll(`{${k}}`, v);
  // No name on record: "Good morning, {name}." reads "Good morning."
  text = name ? text.replaceAll("{name}", name) : text.replace(/,\s*\{name\}/g, "").replaceAll("{name}", "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ── Tea time: 11:00 AM and 4:00 PM, India time ──────────────────────────────
export type TeaSlot = "11" | "16";
const TEA_SLOTS: TeaSlot[] = ["11", "16"];
/** Missed the minute (laptop asleep, another tab)? Still said up to this late. */
const TEA_GRACE_MIN = 10;

const TEA_LINES: Record<TeaSlot, string[]> = {
  "11": [
    "Tea time, right {name}?",
    "11 o'clock. Chai break, {name}?",
    "Kettle's on, {name}. Tea?",
    "Tea kudikalaama, {name}?",
    "Five-minute tea break, {name}. You've earned it.",
  ],
  "16": [
    "Tea time, right {name}?",
    "4 o'clock chai, {name}?",
    "Evening tea, {name}. Biscuits too?",
    "Vada with that tea, {name}?",
    "Tea time! The trucks can wait five minutes, {name}.",
  ],
};
const TEA_LATE_LINES = [
  "Tea's getting cold, {name}!",
  "Did you get your tea, {name}?",
  "Still time for that tea, {name}.",
];

/** Today's date and the minutes since midnight, in India. */
function istClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/**
 * The tea time due now, if it hasn't been said today: within its first
 * minute it's on time; up to 10 minutes after, it's "late" (a different
 * line). Only asks; claimTeaTime() records it once the bubble is on screen,
 * which also keeps other tabs from saying it again.
 */
export function teaTimeDue(userKey: string, now: Date = new Date()): { slot: TeaSlot; late: boolean } | null {
  if (!userKey) return null;
  const { date, minutes } = istClock(now);
  for (const slot of TEA_SLOTS) {
    const since = minutes - Number(slot) * 60;
    if (since < 0 || since > TEA_GRACE_MIN) continue;
    if (read(KEY(userKey, `tea.${date}.${slot}`)) === "1") return null;
    return { slot, late: since >= 2 };
  }
  return null;
}

/** Said: not again today, in this tab or any other. */
export function claimTeaTime(userKey: string, slot: TeaSlot, now: Date = new Date()): void {
  write(KEY(userKey, `tea.${istClock(now).date}.${slot}`), "1");
}

/** The tea-time line, from its own no-repeat deck. */
export function teaTimeGreeting(userKey: string, name: string, slot: TeaSlot, late: boolean): Greeting {
  const line = late ? fromDeck(userKey, "tea.late", TEA_LATE_LINES) : fromDeck(userKey, `tea.${slot}`, TEA_LINES[slot]);
  return { kind: "tea", text: fill(line, name), expression: EXPRESSION.tea };
}

const RARE_ODDS = 1 / 20;

/**
 * The line to greet `fullName` with now. `ctx` comes from the server
 * (celebrationsApi.greeting); without it, the time-of-day line is used.
 */
export function pickGreeting(userKey: string, name: string, ctx: GreetingContext | null, now: Date = new Date()): Greeting {
  const say = (kind: GreetingKind, lines: string[], extra?: Record<string, string>): Greeting => ({
    kind, text: fill(fromDeck(userKey, kind === "festival" ? `festival.${ctx?.festival?.key}` : kind, lines), name, extra), expression: EXPRESSION[kind],
  });
  const { weekday, day } = istParts(now);
  const today = ctx?.today ?? "";

  if (ctx?.birthday) return say("birthday", SITUATION_LINES.birthday);
  if (ctx?.workYears) {
    const years = `${ctx.workYears} year${ctx.workYears === 1 ? "" : "s"}`;
    return say("anniversary", SITUATION_LINES.anniversary, { years });
  }
  if (ctx?.festival && FESTIVAL_LINES[ctx.festival.key]) return say("festival", FESTIVAL_LINES[ctx.festival.key]);
  if (ctx?.firstVisit) return say("first", SITUATION_LINES.first);

  // A rare line now and then, at most once a day.
  if (ctx && read(KEY(userKey, "rare")) !== today && Math.random() < RARE_ODDS) {
    write(KEY(userKey, "rare"), today);
    return say("rare", SITUATION_LINES.rare);
  }

  const lastSeen = ctx?.lastSeen ? new Date(ctx.lastSeen) : null;
  const awayDays = ctx?.awayDays ?? null;
  const firstToday = awayDays === null || awayDays >= 1;
  if (awayDays !== null && awayDays >= 3) {
    // "It's been {days} days" only fits when the number is in the line.
    return say("away", SITUATION_LINES.away, { days: String(awayDays) });
  }
  if (lastSeen && awayDays === 0 && now.getTime() - lastSeen.getTime() < 6 * 3600 * 1000) {
    return say("back", SITUATION_LINES.back);
  }
  if (firstToday) {
    if (weekday === "Mon") return say("monday", SITUATION_LINES.monday);
    if (weekday === "Fri") return say("friday", SITUATION_LINES.friday);
    if (weekday === "Sat" || weekday === "Sun") return say("weekend", SITUATION_LINES.weekend);
    if (day === 1) return say("month", SITUATION_LINES.month);
  }
  const slot = greetingSlot(now);
  return say(slot, SLOT_LINES[slot]);
}
