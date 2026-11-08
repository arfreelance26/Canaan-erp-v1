import { visibleSections } from "@/lib/nav-config";
import { PAGE_GUIDES } from "@/lib/page-tours";
import { SHORTCUTS } from "@/lib/shortcuts";
import type { Tour, TourStep } from "@/lib/tours";

/**
 * Joshine's app tour, built for the person's role from the same menu the
 * sidebar shows (lib/nav-config.ts), so every page they can open is covered
 * and the tour follows the menu as it changes:
 *
 *   Welcome         hello, attendance first (where it applies), the menu
 *   one part per    a word on the section, then each page: what it's for
 *   menu section    (its page guide's `about`) plus a note for this role
 *                   where the page works differently for them
 *   The top bar     search, invite, calculator, connection, display,
 *                   privacy, notifications, you, shortcuts, help, Joshine
 *
 * Bump APP_TOUR_ID to offer a changed tour to everyone once more.
 */
export const APP_TOUR_ID = "app-v2";

/** One line on each menu section, said before its pages. */
const SECTION_INTRO: Record<string, string> = {
  Overview: "Where your day starts.",
  Personal: "Your own attendance, leave, requests and notifications.",
  Connect: "Talking to the team.",
  Insights: "Profit, costs and planning, worked out from the data everyone enters.",
  Monitoring: "Read-only views of the fleet's records, for checking.",
  "Attendance & Approvals": "Attendance for drivers and staff, and every request waiting for a decision.",
  "Trip and Driver Management": "A trip's whole life: booked, on the road, completed, closed, its sheet collected, entered, verified and invoiced.",
  "Audit Outcomes": "What the Auditor decided about each trip.",
  "Resource Hub": "The people, trucks, customers and vendors everything else is built on.",
  "Auditor Pages": "Each driver's and truck's trips, for the Auditor to check.",
  "Maintenance and Care": "Repairs, documents, fuel and AdBlue for every truck.",
  "Tyre Records": "Every tyre, from purchase to retreading to the scrap pile.",
  "Finance Hub": "Pay, loans, documents and money owed.",
  Administration: "The settings behind the rest of the app.",
};

type Note = { roles: string[]; text: string };
const CM = ["Commercial Manager", "Assistant Commercial Manager"];

/** Where a page works differently for some roles, the extra line they hear. */
const ROLE_NOTES: Record<string, Note[]> = {
  "/": [
    { roles: ["Admin"], text: "As Admin you can also switch to each team's dashboard to see what they see." },
  ],
  "/personal/edit-delete-requests": [
    { roles: ["Admin"], text: "You decide requests in Edit Approvals and Deletion Approvals; this is the record." },
  ],
  "/connect/chat": [
    { roles: ["Admin"], text: "Only you can create groups or open Owner view." },
  ],
  "/trips/assign": [
    { roles: ["Admin"], text: "You can cancel and delete trips directly." },
    { roles: CM, text: "Deleting a trip sends Admin a request with your reason." },
  ],
  "/trips/sheet-collection": [
    { roles: ["Yard Supervisor"], text: "This is your main page: check each advance, then mark the sheet delivered." },
  ],
  "/trips/reconciliation": [
    { roles: ["Trip Sheet Register"], text: "This is your main page. A sheet Accounts rejects comes back here; request edit approval to fix it." },
  ],
  "/trips/verification": [
    { roles: ["Accounts"], text: "This is your main page. Changing an invoice that's already made needs Admin's approval." },
  ],
  "/trips/history": [
    { roles: ["Admin"], text: "You can also delete several trips at once." },
  ],
  "/resources/drivers": [
    { roles: ["Admin"], text: "You edit and delete drivers directly." },
    { roles: ["Commercial Manager"], text: "You edit drivers directly; deleting sends Admin a request." },
    { roles: ["Assistant Commercial Manager"], text: "Editing or deleting a driver sends Admin a request first." },
  ],
  "/resources/fleet": [
    { roles: ["Admin", "Assistant Commercial Manager"], text: "You edit and remove trucks directly." },
    { roles: ["Commercial Manager"], text: "You edit trucks directly; removing one sends Admin a request." },
  ],
  "/resources/customers": [
    { roles: ["Accounts"], text: "You also see the final pricing invoices are made from. Editing sends Admin a request." },
    { roles: CM, text: "Editing or deleting sends Admin a request first." },
  ],
  "/resources/vendors": [
    { roles: ["Maintenance"], text: "Editing or deleting a vendor sends Admin a request first." },
  ],
  "/maintenance/tyre-inventory": [
    { roles: ["Maintenance"], text: "Deleting a tyre sends Admin a request first." },
  ],
  "/admin/adblue": [
    { roles: ["Maintenance"], text: "Changing a log sends Admin a request first." },
  ],
  "/attendance/drivers": [
    { roles: ["Admin"], text: "You can mark any date." },
    { roles: CM, text: "You can mark today and the last two days; older dates need a late-entry reason." },
  ],
  "/attendance/report": [
    { roles: CM, text: "You see the drivers' report." },
  ],
  "/attendance/edit-approvals": [
    { roles: CM, text: "You can approve or reject edit requests too." },
  ],
  "/attendance/maintenance-approvals": [
    { roles: ["Accounts"], text: "You approve new maintenance records along with Admin." },
  ],
  "/resources/driver-record": [
    { roles: ["Auditor"], text: "This is where you audit: verify each trip or flag it with a reason." },
  ],
  "/resources/vehicle-record": [
    { roles: ["Auditor"], text: "The same audit, truck by truck." },
  ],
};

/** A page's one-line description, from its page guide. */
function describe(href: string): string {
  const g = PAGE_GUIDES[href];
  if (!g) return "";
  const text = g.about || g.tour?.[0]?.text || "";
  // Keep it to a sentence or two: the page's own tour says the rest.
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return sentences.slice(0, 2).join("").trim();
}

const HAS_BELL = (role: string) => role !== "Yard Supervisor";

/** The app tour for this role; `pagesOnly` skips the welcome and top bar. */
export function appTourFor(role: string | undefined, { pagesOnly = false } = {}): Tour {
  const r = role ?? "";
  const sections = visibleSections(role, false);
  const pageCount = sections.reduce((n, s) => n + s.items.length, 0);
  const steps: TourStep[] = [];

  if (!pagesOnly) {
    steps.push(
      { part: "Welcome", title: "Hi, I'm {name}", text: `I'll show you every page you can open (${pageCount} of them), then the bar along the top. Use the arrow keys or the buttons, and Esc to stop at any time.`, expression: "happy" },
      { target: "nav", title: "Your menu", text: `Everything you can open is here, in ${sections.length} section${sections.length === 1 ? "" : "s"}. Others see a different menu: it follows each person's role.`, expression: "curious", side: "right" },
      { target: "sidebar-toggle", title: "Folding the menu", text: "Fold the menu down to icons for more room; hover an icon for its name.", expression: "calm", side: "right" },
    );
  }

  for (const section of sections) {
    steps.push({
      part: section.title,
      target: `nav-section:${section.title}`,
      orCentered: true,
      title: section.title,
      text: SECTION_INTRO[section.title] ?? `Pages for ${section.title.toLowerCase()}.`,
      expression: "curious",
      side: "right",
      align: "start",
    });
    for (const item of section.items) {
      const note = (ROLE_NOTES[item.href] ?? []).find((n) => n.roles.includes(r));
      steps.push({
        target: `nav:${item.href}`,
        title: item.label,
        text: [describe(item.href), note?.text].filter(Boolean).join(" "),
        expression: note ? "determined" : "focused",
        side: "right",
        align: "start",
      });
    }
  }

  if (!pagesOnly) {
    steps.push(
      { part: "The top bar", target: "search", title: "Find anything", text: "Jump to any page, or find a trip, truck, driver, customer or staff member. Press Ctrl+K (⌘K on a Mac) or / from anywhere.", expression: "sparkle", side: "bottom", align: "start" },
      { target: "invite", roles: ["Admin"], title: "Invite", text: "Call a person or a Canaan Chat group to your room; it pops up on their screen straight away.", expression: "determined", side: "bottom", align: "end" },
      { target: "calculator", title: "Calculator", text: "A quick calculator, percentages included, without leaving the page.", expression: "wink", side: "bottom", align: "end" },
      { target: "network", title: "Connection", text: "How fast the server is answering right now. If pages feel slow, check here first.", expression: "focused", side: "bottom", align: "end" },
      { target: "display", title: "Your display", text: `Light or dark theme and text size, saved for you. Press ${SHORTCUTS.theme.key} to switch the theme.`, expression: "wink", side: "bottom", align: "end" },
      { target: "privacy", title: "Privacy", text: "What the app records about its use (sign-ins and activity) and why. Worth a read.", expression: "calm", side: "bottom", align: "end" },
    );
    if (HAS_BELL(r)) {
      const bell =
        r === "Admin" ? "Edit, deletion, leave, repair and payment requests waiting for you, alerts about trip sheets, km and documents, and your morning recap."
        : CM.includes(r) ? "Decisions on your requests, edit requests from your team, and maintenance, trip sheet and km alerts."
        : r === "Accounts" ? "Repair and payment requests waiting for you, and decisions on your own requests."
        : r === "Auditor" ? "Trips sent back to you for another check, and decisions on your requests."
        : "Decisions on your requests, and alerts for your desk.";
      steps.push({ target: "notifications", title: "Notifications", text: `${bell} The full list is under Notifications in your menu.`, expression: "surprised", side: "bottom", align: "end" });
    }
    steps.push(
      { target: "profile", title: "You", text: "Your profile, your edit and delete requests, notifications, and Log out.", expression: "love", side: "bottom", align: "end" },
      { title: "Shortcuts", text: `From any page, when you're not typing: ${SHORTCUTS.meetings.key} for meetings, ${SHORTCUTS.todo.key} for to-do, ${SHORTCUTS.notes.key} for notes, ${SHORTCUTS.theme.key} for dark mode, and Ctrl+K to search.`, expression: "sparkle" },
      { title: "Help as you go", text: "The first time you open a page or a big form, I'll offer to show you around it. Forms have a ? in their header to run it any time.", expression: "happy" },
      { target: "joshine", title: "And that's me", text: "Click me to change how I look, or for a tour of the page you're on. I'll say hello each time you log in. In the way? Press J, drag me down or use the little arrow on hover — I'll peek from the corner until you call me back.", expression: "love", side: "left", align: "end" },
    );
  }

  return {
    id: pagesOnly ? `${APP_TOUR_ID}-pages` : APP_TOUR_ID,
    title: pagesOnly ? "your pages" : "the app",
    steps,
    hold: "sidebar",
  };
}

/** For checks: every role note, by page. */
export const APP_ROLE_NOTES = ROLE_NOTES;
