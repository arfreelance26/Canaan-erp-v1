import type { JoshineExpression } from "@/lib/joshine";
import { SHORTCUTS } from "@/lib/shortcuts";

/**
 * Guided tours, led by Joshine (components/joshine/joshine-tour.ts runs them
 * with driver.js). This file holds the format and the app tour; every page's
 * tour is built from its guide in lib/page-tours.ts.
 *
 * A step points at one of:
 *   target    a `data-tour="x"` attribute (grep `data-tour=` to see them all)
 *   selector  a CSS selector, looked up inside the page (<main>)
 *   button    a button in the page, by its visible text ("Add Truck")
 * A step whose element isn't on screen (another role's menu, a page without
 * search) is skipped, so one script fits every role and page. A step can also
 * be limited to some roles (`roles` / `notRoles`) when the same button does
 * different things for different people.
 */

export type TourStep = {
  /** data-tour id of the element to point at, anywhere in the app. */
  target?: string;
  /** CSS selector inside the page's <main>, e.g. "table" or "h1". */
  selector?: string;
  /** A button inside the page's <main>, by its visible text. */
  button?: string;
  /** Before this step, click this button (by its visible text) to switch the
   *  view, e.g. a "Truck Profitability" tab. Only for tabs and view switches,
   *  never anything that saves. Starts a new part of the tour. */
  click?: string;
  /** A field by its label, or a section by its heading, by visible text
   *  ("Driver", "Trip Expenses"): in the open form if there is one
   *  (lib/form-tours.ts), otherwise in the page. */
  field?: string;
  /** If the element isn't on screen, say it in the middle instead of skipping. */
  orCentered?: boolean;
  /** No target at all: Joshine talks in the middle of the screen. */
  title: string;
  /** What Joshine says. `{name}` becomes the name the user gave Joshine. */
  text: string;
  /** Joshine's face for this step. */
  expression?: JoshineExpression;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Only for these roles (software designation). Lets one button have one
   *  wording for Admin ("saves straight away") and another for everyone else
   *  ("sends an edit request"). Omitted: every role. */
  roles?: string[];
  /** Every role except these. */
  notRoles?: string[];
};

/** Whether a step is meant for this role (see TourStep.roles / notRoles). */
export function stepIsForRole(step: TourStep, role: string | undefined): boolean {
  if (step.roles && !(role && step.roles.includes(role))) return false;
  if (step.notRoles && role && step.notRoles.includes(role)) return false;
  return true;
}

export type Tour = { id: string; title: string; steps: TourStep[] };

/** CSS selector for a data-tour id. */
export const tourSelector = (id: string) => `[data-tour="${id}"]`;

const visible = (el: Element | null | undefined): el is Element => !!el && el.getClientRects().length > 0;

/** The element a step points at, if it's on screen; undefined = no target. */
export function resolveTourTarget(step: TourStep): Element | null | undefined {
  if (!step.target && !step.selector && !step.button && !step.field) return undefined;
  const el = findTourElement(step);
  return el ?? (step.orCentered ? undefined : null);
}

const squash = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** A field (its <label>) or a section (its <section>, or the heading itself)
 *  in the open form, else the page, by the label or heading text; a trailing
 *  "*" is ignored. */
function findInForm(text: string): Element | null {
  const form = Array.from(document.querySelectorAll("[data-form-tour]")).pop() ?? document.querySelector("main");
  if (!form) return null;
  const want = squash(text);
  for (const el of Array.from(form.querySelectorAll("p, span, h2, h3, h4, legend, label"))) {
    if (!visible(el) || squash(el.textContent).replace(/\s*\*$/, "") !== want) continue;
    const parent = el.parentElement;
    return parent && (parent.tagName === "LABEL" || parent.tagName === "SECTION") ? parent : el;
  }
  return null;
}

function findTourElement(step: TourStep): Element | null {
  if (step.field) return findInForm(step.field);
  // Inside an open form, look there; otherwise in the page.
  const scope = Array.from(document.querySelectorAll("[data-form-tour]")).pop() ?? document.querySelector("main") ?? document.body;
  const pick = (list: Iterable<Element>) => Array.from(list).find(visible) ?? null;
  if (step.target) return pick(document.querySelectorAll(tourSelector(step.target)));
  if (step.selector) return pick(scope.querySelectorAll(step.selector));
  return findTourButton(step.button!);
}

/** A visible button or link in the page (or open form), by its text. Exact
 *  text first, so "Add Vendor" doesn't pick "Add Vendor Category". */
export function findTourButton(labelText: string): Element | null {
  const scope = Array.from(document.querySelectorAll("[data-form-tour]")).pop() ?? document.querySelector("main") ?? document.body;
  const pick = (list: Iterable<Element>) => Array.from(list).find(visible) ?? null;
  const label = labelText.toLowerCase();
  const buttons = Array.from(scope.querySelectorAll("button, a"));
  const text = (b: Element) => (b.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return pick(buttons.filter((b) => text(b) === label)) ?? pick(buttons.filter((b) => text(b).includes(label)));
}

/** The app as a whole: offered once on a person's first visit. */
export const APP_TOUR: Tour = {
  id: "app",
  title: "Getting around",
  steps: [
    {
      title: "Hi, I'm {name}",
      text: "I'll show you around Canaan Global in under a minute. Use the arrow keys or the buttons, and Esc to stop at any time.",
      expression: "happy",
    },
    {
      target: "nav",
      title: "Every module, one menu",
      text: "Trips, resources, maintenance, attendance, finance and insights live here. You only see what your role can open.",
      expression: "curious",
      side: "right",
    },
    {
      target: "search",
      title: "Find anything",
      text: "Jump to any page, or find a trip, truck, driver, customer or staff member. Press ⌘K, Ctrl+K or / from anywhere.",
      expression: "sparkle",
      side: "bottom",
      align: "end",
    },
    {
      target: "network",
      title: "Connection",
      text: "How fast the server is answering right now. If pages feel slow, check here first.",
      expression: "focused",
      side: "bottom",
    },
    {
      target: "display",
      title: "Your display",
      text: `Light or dark theme and text size, saved for you. Press ${SHORTCUTS.theme.key} to switch the theme.`,
      expression: "wink",
      side: "bottom",
      align: "end",
    },
    {
      target: "notifications",
      title: "Notifications",
      text: "Approvals and alerts meant for you arrive here.",
      expression: "surprised",
      side: "bottom",
      align: "end",
    },
    {
      target: "profile",
      title: "You",
      text: `Your profile, meetings, to-do and notes. Press ${SHORTCUTS.todo.key} for to-do and ${SHORTCUTS.notes.key} for notes on any page.`,
      expression: "love",
      side: "bottom",
      align: "end",
    },
    {
      target: "joshine",
      title: "And that's me",
      text: "Click me to change how I look, or to ask for a tour of the page you're on. More help is coming soon.",
      expression: "happy",
      side: "left",
      align: "end",
    },
  ],
};

export { pageTourFor } from "@/lib/page-tours";
