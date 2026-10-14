export type GreetingSlot = "morning" | "afternoon" | "evening" | "night";

const POOLS: Record<GreetingSlot, string[]> = {
  morning: [
    "A pleasant morning, {username}.",
    "A beautiful morning, {username}.",
    "A fresh morning, {username}.",
    "A fine morning, {username}.",
    "A bright morning, {username}.",
  ],
  afternoon: [
    "A pleasant afternoon, {username}.",
    "A lovely afternoon, {username}.",
    "A fine afternoon, {username}.",
    "A bright afternoon, {username}.",
    "A refreshing afternoon, {username}.",
  ],
  evening: [
    "A pleasant evening, {username}.",
    "A beautiful evening, {username}.",
    "A fine evening, {username}.",
    "A calm evening, {username}.",
  ],
  night: [
    "A peaceful night, {username}.",
    "A pleasant night, {username}.",
    "A calm night, {username}.",
  ],
};

const PENDING_KEY = "canaan_greet_pending";
const DECK_KEY_PREFIX = "canaan_greet_deck";

export function greetingSlot(now: Date = new Date()): GreetingSlot {
  const hour = Number(
    now.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }),
  ) % 24;
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function shuffled(n: number, avoidFirst: number | null): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // A fresh deck never opens with the greeting the previous deck ended on.
  if (n > 1 && order[0] === avoidFirst) {
    const k = 1 + Math.floor(Math.random() * (n - 1));
    [order[0], order[k]] = [order[k], order[0]];
  }
  return order;
}

type Deck = { order: number[]; next: number; last: number | null };

/**
 * Next greeting for this person and time of day — a per-user shuffled deck
 * per slot, so every greeting in a slot is shown once before any repeats,
 * and never the same one twice in a row (even across a reshuffle).
 */
export function nextGreeting(userKey: string, name: string, now: Date = new Date()): { slot: GreetingSlot; text: string } {
  const slot = greetingSlot(now);
  const pool = POOLS[slot];
  const storageKey = `${DECK_KEY_PREFIX}:${userKey}:${slot}`;

  let deck: Deck | null = null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Deck;
      if (Array.isArray(parsed.order) && parsed.order.length === pool.length) deck = parsed;
    }
  } catch {
    deck = null;
  }
  if (!deck || deck.next >= deck.order.length) {
    deck = { order: shuffled(pool.length, deck?.last ?? null), next: 0, last: deck?.last ?? null };
  }

  const index = deck.order[deck.next];
  const saved: Deck = { order: deck.order, next: deck.next + 1, last: index };
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    /* private window / storage blocked — still greet, just without memory */
  }
  return { slot, text: pool[index].replace("{username}", name) };
}

type Claimed = { slot: GreetingSlot; text: string; done: boolean };
let current: Claimed | null = null;

/**
 * The greeting to show for this login, or null. Held at module level so a
 * double-invoked initializer (React StrictMode) or a Topbar remount mid-
 * animation gets the same greeting instead of consuming a second one — and
 * once finishGreeting() runs it never shows again until the next login.
 */
export function claimGreeting(userKey: string, name: string): Claimed | null {
  if (current && !current.done) return current;
  if (!takeGreetingPending()) return null;
  current = { ...nextGreeting(userKey, name), done: false };
  return current;
}

export function finishGreeting(): void {
  if (current) current.done = true;
}

/** Called once at login; consumed (and cleared) by the Topbar on first render. */
export function markGreetingPending(): void {
  try {
    sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function takeGreetingPending(): boolean {
  try {
    if (sessionStorage.getItem(PENDING_KEY) !== "1") return false;
    sessionStorage.removeItem(PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}
