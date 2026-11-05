import type { JoshineExpression } from "@/lib/joshine";
import type { Tour, TourStep } from "@/lib/tours";

/**
 * A tour for every page, led by Joshine. Each page has a short guide here;
 * buildPageTour turns it into steps:
 *
 *   1. the page title       what the page is for (`about`)
 *   2. its tabs             `tabs`                  (Segmented, if present)
 *   3. anything special     `steps`                 (page-specific, by data-tour id)
 *   4. search               `search`                (PillSearch)
 *   5. date range           shared text             (DateRangePill)
 *   6. main buttons         `actions`               (by button text)
 *   7. Excel download       shared text             (DownloadExcelButton)
 *   8. the table            `table`                 (first table on the page)
 *   9. pages                shared text             (TablePagination)
 *
 * Steps whose element isn't on the page (or isn't open to this role) are
 * skipped, so a guide only needs the words. A new page gets a tour by adding
 * its route here; `tour` replaces the generated steps entirely.
 *
 * When the same button does different things by role (Admin edits or deletes
 * directly, others send a request), give the step `roles` / `notRoles` so each
 * person hears their own version. Delete vs Request Delete on trip rows is
 * handled for every page in buildSteps.
 */

type Action = { label: string; text: string };

export type PageGuide = {
  title: string;
  about: string;
  search?: string;
  tabs?: string;
  actions?: Action[];
  table?: string;
  /** Extra page-specific steps, shown after the tabs. */
  steps?: TourStep[];
  /** A hand-written tour instead of the generated one. */
  tour?: TourStep[];
  expression?: JoshineExpression;
};

const READ_ONLY = "Read-only: nothing here can be changed, so it's safe to explore.";

export const PAGE_GUIDES: Record<string, PageGuide> = {
  // ── Home ──────────────────────────────────────────────────────────────────
  "/": {
    title: "The dashboard",
    about: "",
    tour: [
      { title: "The dashboard", text: "Your start page: what's on the road and what needs your attention today. What you see here depends on your role.", expression: "happy" },
      { target: "dashboard-tabs", roles: ["Admin"], title: "One dashboard per desk", text: "Your overview, plus each team's dashboard (commercial, accounts, yard, trip sheets, maintenance) exactly as they see it. Run this tour again on any tab and I'll explain what's there.", expression: "curious", side: "bottom", align: "start" },
      { target: "dashboard-hero", title: "Today at a glance", text: "A one-line picture of your day, with shortcuts to the pages you use most.", expression: "happy", side: "bottom" },
      { button: "Backup", roles: ["Admin"], title: "Backup", text: "Download a full copy of the data: Excel for reading, SQL to restore the database, or a ZIP of every uploaded file. Worth doing regularly.", expression: "determined", side: "bottom" },
      { target: "current-trips", title: "Trips on the road", text: "Every live trip with its stage. Click a stage to filter; the route line shows how far each trip has come.", expression: "focused", side: "top" },
      { target: "compliance-banner", roles: ["Admin"], title: "Documents needing action", text: "Trucks with expired or soon-expiring documents. Open it to renew them.", expression: "surprised", side: "bottom" },
      { target: "fuel-rate", roles: ["Admin"], title: "Today's fuel rate", text: "Set the diesel price per litre each day. Running costs and trip profitability use it. It shows when it was last set, so you know if today's is missing.", expression: "determined", side: "bottom" },
      { target: "fleet-status", title: "Key counts", text: "The main numbers for your desk. Click any card to open the page behind it.", expression: "focused", side: "bottom" },
      { target: "available-vehicles", roles: ["Admin"], title: "Trucks free for a trip", text: "Trucks not booked and not on the road. Click it for the list; a red badge marks a truck with an expired document.", expression: "curious", side: "bottom" },
      { target: "audit-strip", roles: ["Admin"], title: "Audit", text: "How many trips are waiting for the Auditor, verified, or flagged. Click a card to open that list.", expression: "focused", side: "bottom" },
      { target: "sheet-tracking", roles: ["Admin", "Commercial Manager", "Assistant Commercial Manager"], title: "Trip sheet tracking", text: "Sheets the yard has delivered and the trip sheet desk has received or entered, each with a date filter.", expression: "curious", side: "top" },
      { target: "edit-requests", roles: ["Admin"], title: "Edit requests", text: "The latest requests from staff to change or delete records. Open Edit Approvals to decide.", expression: "determined", side: "top" },
      { target: "booking-horizon", roles: ["Admin"], title: "Booking Horizon", text: "Active trips by their scheduled date: how far ahead you're booked, and trips whose date has passed but are still open.", expression: "curious", side: "top" },
      { target: "lane-map", roles: ["Admin"], title: "Lane Map", text: "Where your trucks actually run. Thicker lines are busier routes.", expression: "sparkle", side: "top" },
      { target: "fleet-constellation", roles: ["Admin"], title: "Fleet Constellation", text: "Every truck at a glance. Hover a truck for its details.", expression: "sparkle", side: "top" },
      { target: "trip-trend", roles: ["Admin"], title: "Trip trend", text: "Trips scheduled and completed over time, to see if you're busier than last month.", expression: "focused", side: "top" },
      { target: "attendance-today-card", roles: ["Admin"], title: "Attendance today", text: "Drivers and staff present, absent, on leave or not marked yet.", expression: "calm", side: "top" },
      { target: "pending-leave", roles: ["Admin"], title: "Pending leave", text: "Leave requests waiting for your decision.", expression: "determined", side: "top" },
      { target: "compliance", roles: ["Admin"], title: "Compliance overview", text: "Every truck's documents, valid, due or expired, so nothing lapses on the road.", expression: "determined", side: "top" },
      { target: "pending-invoice", roles: ["Admin", "Accounts"], title: "Waiting to be invoiced", text: "Completed trips with a trip sheet that still need an invoice. Click one to open it in Verification & Invoicing.", expression: "determined", side: "top" },
      { target: "compliance-alerts", roles: ["Admin", "Accounts"], title: "Compliance alerts", text: "Truck documents that have expired or expire soon.", expression: "surprised", side: "top" },
      { target: "recurring-due", roles: ["Admin", "Accounts"], title: "Payments due", text: "Recurring payments and EMIs coming due, so nothing is paid late.", expression: "focused", side: "top" },
      { target: "awaiting-collection", roles: ["Admin", "Yard Supervisor"], title: "Sheets to collect", text: "Trips whose trip sheet hasn't been collected from the driver yet. The oldest are the most urgent.", expression: "determined", side: "top" },
      { target: "recently-delivered", roles: ["Admin", "Yard Supervisor"], title: "Recently delivered", text: "Sheets collected lately, as a quick check.", expression: "calm", side: "top" },
      { target: "pending-receive", roles: ["Admin", "Trip Sheet Register"], title: "Sheets to receive", text: "Sheets the yard has collected that the trip sheet desk hasn't received yet.", expression: "determined", side: "top" },
      { target: "pending-entry", roles: ["Admin", "Trip Sheet Register"], title: "Sheets to enter", text: "Sheets received but not entered yet. They're entered in Trip Reconciliation.", expression: "focused", side: "top" },
      { target: "quick-access", title: "Quick access", text: "One click to the pages this desk uses every day.", expression: "wink", side: "top" },
      { field: "Tyre Life Status", roles: ["Admin", "Maintenance"], title: "Tyre life", text: "Every tyre on the fleet and how much of its expected range it has used. Filter by condition, or search.", expression: "focused", side: "top" },
      { field: "Tyre Condition", roles: ["Admin", "Maintenance"], title: "Tyre condition", text: "New tyres against retreaded ones.", expression: "curious", side: "top" },
      { field: "Top Brands", roles: ["Admin", "Maintenance"], title: "Top brands", text: "Which tyre brands make up the fleet.", expression: "curious", side: "top" },
      { field: "Recent Maintenance", roles: ["Admin", "Maintenance"], title: "Recent maintenance", text: "The latest repairs and services logged.", expression: "calm", side: "top" },
    ],
  },

  "/overview/recap-report": {
    title: "Recap Report",
    about: "",
    tour: [
      { target: "recap-report-header", title: "Recap Report", text: "Yesterday's work across the whole company, on one page. Only Admin sees it.", expression: "happy", side: "bottom", align: "start" },
      { target: "recap-greeting", title: "Which day", text: "The day this recap covers, and when it was put together. Each morning it's saved and the bell tells you; clicking that notification opens this page.", expression: "calm", side: "bottom", align: "start" },
      { target: "recap-mode", title: "Morning or Live", text: "Morning is the recap as saved at the start of the day. Live works it out again right now; press Refresh to update it. In Live, a line shows how each figure has moved since the morning.", expression: "curious", side: "bottom", align: "end" },
      { target: "recap-changes", title: "What changed", text: "Each figure that moved since the morning, old → new. \"Nothing has changed\" means the morning recap still holds.", expression: "surprised", side: "bottom" },
      { target: "recap-headline", title: "The day in one line", text: "Trips booked and completed, and the work done by the team.", expression: "happy", side: "bottom", align: "start" },
      { target: "recap-figures", title: "Key figures", text: "Trips booked and completed, waiting to be invoiced, documents expired, waiting for audit, and staff work items. Amber ones need action. Click a tile to open its page.", expression: "focused", side: "bottom" },
      { target: "recap-attention", title: "Needs your attention", text: "The urgent items: trips waiting too long for an invoice or a trip sheet, party halt left off an invoice, requests waiting for a decision. Click one to go there. Drag them into the order you like; it's remembered.", expression: "determined", side: "top" },
      { target: "recap-sections", title: "One card per area", text: "Trips, invoices, fuel, maintenance and tyres, documents, attendance, payments, approvals, audit and staff work. A long card scrolls inside. Drag the cards into your own order too.", expression: "curious", side: "top" },
      { target: "recap-today", title: "Today so far", text: "Quick facts for today, separate from yesterday's recap. Click one to open its page.", expression: "sparkle", side: "top" },
      { target: "recap-collapse", title: "Fold it away", text: "Collapse the recap to just its header; open it again any time.", expression: "wink", side: "left" },
    ],
  },

  // ── Personal ──────────────────────────────────────────────────────────────
  "/attendance/mark": {
    title: "Mark Attendance",
    about: "",
    tour: [
      { selector: "h1", title: "Mark Attendance", text: "Mark your attendance for today. Until you do, most of the app stays locked; only this page and Canaan Chat open.", expression: "determined", side: "bottom", align: "start" },
      { target: "attendance-today", title: "Your day", text: "Pick Present, Absent or On Leave. Present starts your shift; Absent and On Leave are final for the day. On a holiday it's optional, but you can still mark it if you're working.", expression: "happy", side: "left" },
      { target: "attendance-today", title: "Closing your shift", text: "When you finish, press Close shift. If the app closed it for you after a long idle spell, \"Still working — resume shift\" reopens it. Total Working Time is the time you were active in the app.", expression: "focused", side: "left" },
      { target: "attendance-month", title: "This month", text: "Your month so far: days present, absent, on leave and holidays.", expression: "curious", side: "bottom" },
      { target: "attendance-history", title: "History", text: "Day by day, with check-in and check-out times. Use the arrows to see earlier months. If Admin changed a day, it's marked here and on today's card.", expression: "calm", side: "top" },
    ],
  },
  "/attendance/leave-requests": {
    title: "Leave Requests",
    about: "Ask for leave and follow each request until Admin approves or declines it.",
    tabs: "All, or only Pending, Approved or Rejected requests.",
    search: "Find a request by its reason or dates.",
    actions: [{ label: "Submit Leave Request", text: "Pick the dates and give a reason. Admin is told straight away, and you're notified of the decision." }],
    table: "One request per row, with its dates, days and decision.",
  },
  "/personal/edit-delete-requests": {
    title: "Edit & Delete Requests",
    about: "",
    tour: [
      { selector: "h1", title: "Edit & Delete Requests", text: "Every change or deletion you asked for, and what was decided. Nothing here can be changed, so it's safe to explore.", expression: "happy", side: "bottom", align: "start", notRoles: ["Admin"] },
      { selector: "h1", title: "Edit & Delete Requests", text: "Every edit or delete request in one place. You approve them in Edit Approvals and Deletion Approvals; this page is the record.", expression: "happy", side: "bottom", align: "start", roles: ["Admin"] },
      { button: "Edit Requests", title: "Edits or deletions", text: "Switch between edit requests and deletion requests.", expression: "curious", side: "bottom" },
      { selector: '[aria-label="Status"]', title: "Status", text: "Show all requests, or only Pending, Approved or Rejected ones.", expression: "focused", side: "bottom", align: "end" },
      { selector: '[data-tour="page-search"]', title: "Search", text: "Find a request by the record's name or the reason given.", expression: "sparkle", side: "bottom", align: "start" },
      { selector: "table", title: "The list", text: "One request per row: the record, the reason, the decision, who made it and when. An approved edit can be used once; after that you'll need a new request.", expression: "focused", side: "top" },
    ],
  },
  "/personal/notifications": {
    title: "Notifications",
    about: "",
    tour: [
      { selector: "h1", title: "Notifications", text: "Everything meant for you, in full. The bell up top only shows the latest few.", expression: "happy", side: "bottom", align: "start" },
      { title: "What arrives here", roles: ["Admin"], text: "Edit, deletion, leave, repair and payment requests waiting for you, trip sheet and km alerts, documents about to expire, and your morning recap.", expression: "curious" },
      { title: "What arrives here", roles: ["Commercial Manager", "Assistant Commercial Manager"], text: "Decisions on your edit requests, edit requests from your team, maintenance alerts and trips that need a look.", expression: "curious" },
      { title: "What arrives here", roles: ["Accounts"], text: "Payment and repair requests waiting for you, decisions on your own requests, and trips sent back for checking.", expression: "curious" },
      { title: "What arrives here", notRoles: ["Admin", "Accounts", "Commercial Manager", "Assistant Commercial Manager"], text: "Decisions on your requests, reminders and alerts for your desk.", expression: "curious" },
      { selector: '[data-tour="page-search"]', title: "Search", text: "Find a notification by its text.", expression: "sparkle", side: "bottom", align: "start" },
      { title: "Acting on one", text: "Click a notification to open the page it's about.", expression: "wink" },
    ],
  },
  "/personal/profile": {
    title: "My profile",
    about: "",
    tour: [
      { selector: "h1", title: "My profile", text: "Your details as the office holds them, and this month's attendance. To correct anything here, ask Admin.", expression: "love", side: "bottom", align: "start" },
      { target: "workspace", title: "Your workspace", text: "Your own meetings, to-do list and notes. Press M for meetings, T for to-do and N for notes from any page.", expression: "happy", side: "bottom", align: "start" },
      { title: "Meetings", roles: ["Admin"], text: "As Admin you can schedule meetings with a person or a Canaan Chat group, and cancel them. Everyone invited gets a reminder when it starts.", expression: "determined" },
      { title: "Meetings", notRoles: ["Admin"], text: "Meetings Admin has scheduled with you appear here, and you're reminded when one starts.", expression: "calm" },
      { field: "Work", title: "Your details", text: "Work, personal and identity details as the office holds them.", expression: "calm", side: "bottom" },
      { field: "Signed-in devices", title: "Signed-in devices", text: "The phones and computers your login is tied to. If you change device and can't log in, ask Admin to reset it.", expression: "focused", side: "top" },
    ],
  },

  // ── Connect ───────────────────────────────────────────────────────────────
  "/connect/chat": {
    title: "Canaan Chat",
    about: "",
    tour: [
      { selector: "h1", orCentered: true, title: "Canaan Chat", text: "Message colleagues one-to-one or in groups, share photos, files and voice notes, all inside the app.", expression: "happy", side: "bottom", align: "start" },
      { button: "Chats", title: "Chats and groups", text: "Your one-to-one conversations, and the groups you're in. Unread messages show a count.", expression: "curious", side: "right" },
      { selector: '[title="New group"]', roles: ["Admin"], title: "New group", text: "Only Admin creates groups: name it, add a photo and pick the members. You can add or remove people later from the group's info.", expression: "determined", side: "bottom" },
      { selector: '[title="Owner view"]', roles: ["Admin"], title: "Owner view", text: "Read any conversation in the company, for oversight. It asks for the owner password and is read-only.", expression: "focused", side: "bottom" },
      { selector: '[title="Attach a file"]', title: "Attach", text: "Send photos, videos, PDFs and other files. Tap a photo to see it full size.", expression: "wink", side: "top" },
      { selector: '[title="Send a payment note"]', title: "Payment note", text: "Send an amount with a note, for example an advance. The other person can mark it accepted or declined; no money moves through the app.", expression: "curious", side: "top" },
      { title: "Group info", text: "Open a group's name to see its members and the media, links and documents shared in it, or to leave the group.", expression: "calm" },
      { selector: '[title="Record a voice message"]', title: "Voice notes", text: "With nothing typed, this records a voice message; once you type, it sends.", expression: "happy", side: "top" },
      { title: "On a message", text: "Each message can be reacted to with an emoji, or replied to; a reply quotes the original.", expression: "love" },
      { title: "Managing a group", text: "Group admins can rename the group, change its photo and add or remove members from the group's info panel.", expression: "determined" },
    ],
  },

  // ── Trips ─────────────────────────────────────────────────────────────────
  "/trips/assign-drivers": {
    title: "Assign Drivers",
    about: "Give each driver a vehicle. Only drivers with a vehicle can be picked when a trip is booked.",
    search: "Find a driver by name or ID.",
    table: "One driver per row, with the vehicle they drive now. Use the row's button to give them a vehicle, change it or take it away. A truck can only be with one driver at a time.",
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every vehicle assigned or taken away, by whom and when.", expression: "curious", side: "bottom", align: "end" },
    ],
  },
  "/trips/assign": {
    title: "Assign Trips",
    about: "Book a trip and hand it to a driver who has a vehicle. Trips stay here until the driver starts them.",
    search: "Find a trip by truck number, driver or trip ID.",
    actions: [{ label: "Assign Trip", text: "Opens the booking form: customer, route, cargo, rates and the driver. A truck or container already on another trip is caught before you save." }],
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every change made to any trip (created, edited, closed, verified, deleted, restored) and who made it.", expression: "curious", side: "bottom", align: "end" },
    ],
    table: "One booked trip per row. The pencil edits it, Mark as Started moves it to Current Trips, and the LR icon downloads the lorry receipt.",
  },
  "/trips/available": {
    title: "Available Trips",
    about: "Every trip, by the four stages it goes through: Booked → Current → Completed → Closed.",
    steps: [{ target: "trip-stages", title: "Four stages", text: "Pick a stage to see only those trips. The Excel download follows the stage you pick.", expression: "curious", side: "bottom", align: "start" }],
    search: "Find a trip by ID, truck, driver or customer.",
    table: "The line under each status shows where the trip is in its four stages.",
  },
  "/trips/current": {
    title: "Current Trips",
    about: "Trips on the road now, as the drivers update them.",
    search: "Find a trip by truck number, driver or trip ID.",
    table: "One trip per row. Mark as Completed when the driver finishes; it then moves to Completed Trips.",
  },
  "/trips/completed": {
    title: "Completed Trips",
    about: "Trips the drivers have finished, waiting to be closed with the booking sheet.",
    search: "Find a trip by truck number, driver or trip ID.",
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every change made to any trip and who made it.", expression: "curious", side: "bottom", align: "end" },
    ],
    table: "One finished trip per row. CLOSE TRIP opens the booking sheet: fill in the final figures to close it. Closed trips leave this list and go on to the trip sheet desk.",
  },
  "/trips/sheet-collection": {
    title: "Trip Sheet Collection",
    about: "Collect each closed trip's sheet from the driver, check the advance, and hand the sheet to the trip sheet desk.",
    steps: [
      { target: "sheet-stats", title: "Where sheets stand", text: "All, Pending, Delivered and Entry Overdue. Click a card to show only those trips. Entry Overdue means the trip sheet desk received it over a day ago but hasn't entered it yet.", expression: "curious", side: "bottom" },
      { target: "sheet-workflow", title: "The workflow", text: "Trip closed → you mark the sheet delivered → the trip sheet desk receives it → it's entered in Trip Reconciliation.", expression: "focused", side: "bottom" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every delivery and change on this page, and who made it.", expression: "curious", side: "bottom", align: "end" },
      { selector: '[aria-label="Sheet status"]', title: "Sheet status", text: "Show only pending, delivered or overdue sheets. The cards above do the same.", expression: "focused", side: "bottom" },
      { selector: '[title="Select all pending"]', title: "Deliver several at once", text: "Tick the trips whose sheets you have, then Mark as Delivered for all of them together.", expression: "determined", side: "right" },
    ],
    search: "Find a trip by truck number, driver or trip ID.",
    actions: [{ label: "View", text: "A report of the sheets in the Delivered On range, to view or download as a PDF. Leave the dates empty for every date." }],
    table: "First check the driver advance (Correct, or Mismatch with the right amount); then Sheet Delivered unlocks. Tick several rows to mark them delivered together. Once a sheet is entered in Reconciliation, its row is locked.",
  },
  "/trips/reconciliation": {
    title: "Trip Reconciliation",
    about: "Receive the trip sheets the yard delivers, and enter each one: expenses, km and fuel.",
    steps: [
      { target: "recon-stats", title: "Where sheets stand", text: "Pending Receive, Pending Sheet Entry, Sheet Entered, Rejected, and your edit requests. Click a card to show only those trips.", expression: "curious", side: "bottom" },
      { target: "recon-workflow", title: "The workflow", text: "Delivered by the yard → you receive it → you enter the sheet → it moves to Verification & Invoicing.", expression: "focused", side: "bottom" },
      { button: "View Current Trips", title: "Current trips", text: "A quick look at trips still on the road, so you know which sheets are coming.", expression: "calm", side: "bottom" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every sheet entered or changed, and who did it.", expression: "curious", side: "bottom", align: "end" },
      { button: "Request Edit Approval", notRoles: ["Admin"], title: "Fixing a rejected sheet", text: "When Accounts rejects a sheet, it comes back here with their reason. Request edit approval, and once Admin approves, the sheet opens for you to fix.", expression: "calm", side: "left" },
    ],
    search: "Find a trip by truck number, driver, container or trip ID.",
    actions: [{ label: "View", text: "A report of trip sheets in the date range, to view or download as a PDF." }],
    table: "Receive the sheet first, then enter it from the row. A sheet the Accounts team rejects comes back here with their reason.",
  },
  "/trips/verification": {
    title: "Verification & Invoicing",
    about: "Check each entered trip sheet, then invoice it, or waive the invoice when the trip isn't billed.",
    steps: [
      { target: "verify-stats", title: "Where trips stand", text: "Pending, Rejected, Verified, Invoiced and Waived Invoice. Click a card to show only those trips.", expression: "curious", side: "bottom" },
      { target: "verify-workflow", title: "The workflow", text: "Pending → verify the trip data → generate the invoice. Under Invoiced you can also filter by invoice type.", expression: "focused", side: "bottom" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every verification, invoice and change, and who made it.", expression: "curious", side: "bottom", align: "end" },
      { button: "Review", title: "Rejected trips", text: "A trip you sent back shows the reason. Once the sheet is fixed, Review it again.", expression: "calm", side: "left" },
      { button: "View Details", title: "View details", text: "The trip, its booking sheet and trip sheet, read-only.", expression: "curious", side: "left" },
      { button: "Edit Invoice", roles: ["Admin"], title: "Edit an invoice", text: "Change an invoice that's already made.", expression: "determined", side: "left" },
      { button: "Edit Invoice", roles: ["Accounts"], title: "Edit an invoice", text: "Changing a made invoice needs Admin's approval: this sends an edit request first.", expression: "calm", side: "left" },
    ],
    search: "Find a trip by truck, container, booking ref or invoice number.",
    actions: [{ label: "View", text: "A report of trips invoiced in the date range, to view or download as a PDF." }],
    table: "VERIFY TRIP DATA checks the booking and trip sheet; verify it or reject it back to the trip sheet desk with a reason. A verified trip gets GENERATE INVOICE, GENERATE LR or WAIVE INVOICE. Tick two or more to make one combined invoice.",
  },
  "/trips/pending-audit": {
    title: "Trips Pending Audit",
    about: "Trips verified by Accounts that the Auditor hasn't checked yet. " + READ_ONLY,
    search: "Find a trip by ID, truck or customer.",
    table: "One trip per row. The Auditor verifies or flags each one.",
  },
  "/trips/audit-verified": {
    title: "Audit Verified Trips",
    about: "Trips the Auditor has checked and signed off.",
    search: "Find a trip by ID, truck or customer.",
    table: "One signed-off trip per row. \"Was Disputed\" marks trips that were flagged before. If something is still wrong, Flag for Re-Verification sends it back to the Auditor with your reason.",
  },
  "/trips/flagged": {
    title: "Auditor Flagged Trips",
    about: "Trips the Auditor flagged, with their reason. Fix the sheet, then return the trip for review.",
    steps: [
      { button: "History", title: "History", text: "Every flag, return and re-check, and who did it.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a trip by ID, truck or customer.",
    table: "View Booking Sheet and View Trip Sheet open them read-only. Return for Review sends the trip back to the Auditor, who verifies it or flags it again.",
  },
  "/trips/history": {
    title: "Trip History",
    about: "Every trip ever booked, at any stage, with its booking sheet, trip sheet and invoice.",
    steps: [
      { target: "history-stats", title: "By stage", text: "Assigned, Current, Completed, Invoiced, Waived Invoice and Cancelled. Click a card to show only those trips.", expression: "curious", side: "bottom" },
      { button: "Edit History", roles: ["Admin", "Commercial Manager", "Assistant Commercial Manager"], title: "Edit History", text: "Every change made to any trip, and who made it.", expression: "curious", side: "bottom", align: "end" },
      { selector: '[title="Select all trips"]', roles: ["Admin"], title: "Delete several", text: "Tick trips to delete them together. Deleted trips go to Deleted Trips and can be restored.", expression: "determined", side: "right" },
      { button: "View Invoice", title: "Invoices", text: "Open an invoiced trip's invoice, or the combined invoice it belongs to.", expression: "curious", side: "left" },
    ],
    search: "Find a trip by ID, truck, driver, customer or container.",
    actions: [{ label: "View", text: "A report of the trips in the date range and stage you've picked, to view or download as a PDF." }],
    table: "Open a trip's booking sheet, trip sheet or invoice from its row.",
  },
  "/trips/deleted": {
    title: "Deleted Trips",
    about: "Trips that were deleted, with who asked, why and who approved.",
    steps: [
      { button: "Edit History", title: "Edit History", text: "Every delete, restore and permanent delete, and who did it.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a trip by ID or the reason given.",
    table: "Restore brings a trip back exactly as it was. Permanently Delete removes it for good and can't be undone.",
  },
  "/trips/pnl-mileage": {
    title: "P&L Mileage Report",
    about: "Profit or loss and mileage for every trip with an entered trip sheet.",
    steps: [
      { button: "Quick Start Guide", title: "Quick Start Guide", text: "A short guide to reading this report.", expression: "happy", side: "bottom", align: "end" },
      { button: "How is it Calculated", title: "How it's calculated", text: "Exactly how hire, expenses, profit and mileage are worked out.", expression: "focused", side: "bottom", align: "end" },
    ],
    search: "Find a trip by ID, truck or customer.",
    table: "One trip per row: hire, expenses, net P&L and kilometres. Click a row to open its trip sheet.",
  },

  // ── Resources ─────────────────────────────────────────────────────────────
  "/resources/staff": {
    title: "Our Staff",
    about: "Everyone who logs in to Canaan ERP: their details, role and login.",
    search: "Find someone by name, ID, phone or role.",
    actions: [{ label: "Add Staff", text: "Add a person and their login. Their software role decides which pages they see." }],
    steps: [
      { button: "Freeze History", title: "Freeze History", text: "Every account frozen or unfrozen, with the reason. A frozen account can't log in until it's unfrozen.", expression: "focused", side: "bottom", align: "end" },
      { button: "Edit History", title: "Edit History", text: "Every staff record created, edited, deleted or restored, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { selector: '[title="Reset device binding"]', title: "Device binding", text: "Each login is tied to the device it was first used on. If someone changes phone or laptop, reset it here so they can log in from the new one.", expression: "focused", side: "left" },
    ],
    table: "One person per row. Open a row for their full details; edit, freeze or delete them from the row. A deleted person goes to the Archive.",
  },
  "/resources/drivers": {
    title: "Our Drivers",
    about: "Every driver: contact details, licence and documents.",
    search: "Find a driver by name, ID or phone.",
    actions: [{ label: "Add Driver", text: "Add a driver with their licence, Aadhaar and photo." }],
    steps: [
      { title: "Making changes", roles: ["Admin"], text: "You edit and delete drivers directly. A deleted driver goes to the Archive and can be restored.", expression: "determined" },
      { title: "Making changes", roles: ["Commercial Manager"], text: "You edit drivers directly. Deleting sends Admin a delete request with your reason.", expression: "calm" },
      { title: "Making changes", roles: ["Assistant Commercial Manager"], text: "Editing a driver sends Admin an edit request; once approved, you can make the change. Deleting sends a delete request.", expression: "calm" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every driver record created, edited, deleted or restored, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    table: "One driver per row. Open their licence, Aadhaar and photo from the row.",
  },
  "/resources/fleet": {
    title: "Our Fleet",
    about: "Every truck: its details, branch, odometer, tyres and documents.",
    search: "Find a truck by registration, ID, type or branch.",
    actions: [{ label: "Add Truck", text: "Add a truck with its documents and tyre layout." }],
    steps: [
      { target: "truck-cards", title: "One card per truck", text: "Each card shows the branch and odometer. Its buttons view, edit or remove the truck, change its branch, and show branch and document history.", expression: "focused", side: "top" },
      { selector: '[title="Correct odometer"]', roles: ["Admin"], title: "Correct odometer", text: "Fix a wrong odometer reading. The old and new readings and your reason are kept.", expression: "determined", side: "left" },
      { title: "Making changes", roles: ["Admin", "Assistant Commercial Manager"], text: "You edit and remove trucks directly. Removing asks whether the truck was sold or is being deleted, and what happens to its tyres.", expression: "determined" },
      { title: "Making changes", roles: ["Commercial Manager"], text: "You edit trucks directly. Removing a truck sends Admin a request with your reason.", expression: "calm" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every truck record created, edited, removed or restored, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
  },
  "/resources/customers": {
    title: "Our Customers",
    about: "Customers, the places you deliver to for them, and what you charge.",
    tabs: "Customer List, Destinations and Pricing.",
    steps: [
      { button: "Customer List", title: "Four lists", text: "Customers, their destinations, your pricing, and the final pricing Accounts bills from.", expression: "curious", side: "bottom", align: "start" },
      { button: "Final Customer Pricing", roles: ["Admin", "Accounts"], title: "Final pricing", text: "The rates invoices are made from. Only Admin and Accounts see this list.", expression: "focused", side: "bottom" },
      { title: "Making changes", roles: ["Admin"], text: "You add, edit and delete directly.", expression: "determined" },
      { title: "Making changes", notRoles: ["Admin"], text: "You can add. Editing or deleting sends Admin a request with your reason; once approved, you make the change.", expression: "calm" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every customer, destination and price change, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a customer by name, GST number or place.",
    table: "One entry per row. Edit or delete from the row.",
  },
  "/resources/vendors": {
    title: "Our Vendors",
    about: "Workshops, tyre shops and suppliers, grouped by category.",
    search: "Find a vendor by name, category or phone.",
    actions: [
      { label: "Add Vendor Category", text: "Make a new category, such as tyres or electrical." },
      { label: "Add Vendor", text: "Add a vendor and the category they belong to." },
    ],
    steps: [
      { title: "Making changes", roles: ["Admin"], text: "You edit and delete vendors directly.", expression: "determined" },
      { title: "Making changes", notRoles: ["Admin"], text: "Editing or deleting a vendor sends Admin a request with your reason; once approved, you make the change.", expression: "calm" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every vendor created, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    table: "One vendor per row. Open a row to see the repairs and purchases made with them.",
  },
  "/resources/archive": {
    title: "Archive",
    about: "Deleted drivers, trucks, staff, customers, vendors and yards, kept so they can be brought back.",
    tabs: "One tab per kind of record.",
    steps: [
      { button: "Edit History", title: "Edit History", text: "Every record deleted, restored or permanently deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a record by name or ID.",
    table: "Open a row for its details. Restore brings it back as it was; Permanently Delete removes it for good and can't be undone.",
  },
  "/resources/driver-record": {
    title: "Driver Record",
    about: "Each driver's trips, earnings and documents, for checking.",
    search: "Find a driver by name or ID.",
    steps: [
      { title: "How to audit", text: "Pick a date range (empty means lifetime), then expand a driver to see every trip with a trip sheet. Open its booking sheet and trip sheet, then Verify it or Flag it with a reason.", expression: "focused" },
      { title: "Changed your mind?", roles: ["Admin", "Auditor"], text: "Undo Verification sends a verified trip back to be checked again.", expression: "calm" },
    ],
    table: "One driver per row: trips and salary for the range. Salary Breakdown shows how the pay is made up.",
  },
  "/resources/vehicle-record": {
    title: "Vehicle Record",
    about: "Each truck's trips, km and hire, for checking. Sold and deleted trucks are here too, so their past trips can still be audited.",
    search: "Find a truck by registration or ID.",
    steps: [
      { title: "How to audit", text: "Pick a date range (empty means lifetime), then expand a truck to see every trip with a trip sheet. Open its booking sheet, trip sheet or Trip Breakdown, then Verify it or Flag it with a reason.", expression: "focused" },
      { title: "Changed your mind?", roles: ["Admin", "Auditor"], text: "Undo Verification sends a verified trip back to be checked again.", expression: "calm" },
    ],
    table: "One truck per row, with its trips, km and hire for the range.",
  },

  // ── Maintenance ───────────────────────────────────────────────────────────
  "/maintenance/trucks": {
    title: "Truck Maintenance",
    about: "Every truck's repairs and services, and how reliable it is.",
    search: "Find a truck by registration.",
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every maintenance record added, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    table: "One truck per row. Update Record adds a repair or service; it goes to Maintenance Approvals and joins the truck's record once Admin or Accounts approves it. Scheduled Records holds jobs saved before their cost was known (the number shows how many wait), View Record its history, and Full Status its overall condition.",
  },
  "/maintenance/compliance": {
    title: "Compliance & Renewals",
    about: "RC, FC, road tax, permits, pollution certificate and insurance for every truck, and when each runs out.",
    search: "Find a truck by registration.",
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every document renewed or changed, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { button: "Update Document", title: "Renew a document", text: "A truck's seven documents as cards, each with Renew for the new expiry date, cost and a copy.", expression: "determined", side: "left" },
      { button: "View Truck Data", title: "Truck documents", text: "A truck's documents at a glance, with their expiry dates and copies.", expression: "curious", side: "left" },
      { button: "View Cost Breakdown", title: "What documents cost", text: "Each document's cost spread per day, month and km. The Running Cost Calculator uses these figures.", expression: "focused", side: "left" },
      { button: "View Updation History", title: "History", text: "Every renewal and correction. Mistakes are fixed from here.", expression: "calm", side: "left" },
    ],
    table: "Red means expired, amber means due soon. Renew a document from its row, with the new expiry date and a copy of it.",
    expression: "determined",
  },
  "/maintenance/fuel-history": {
    title: "Truck's Fuel History",
    about: "Every fuel fill for every truck, and the mileage it gave.",
    search: "Find a truck by registration.",
    steps: [
      { button: "Edit History", roles: ["Admin", "Maintenance"], title: "Edit History", text: "Every fuel log added, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { title: "Diesel price", text: "The base price per litre is set from the dashboard; here it's shown read-only.", expression: "calm" },
      { button: "Enter Fuel Log", title: "Log a fill", text: "Record a fuel fill: date, odometer, litres, price and the station.", expression: "determined", side: "left" },
      { button: "View Fuel History", title: "A truck's fills", text: "Every fill for the truck, with its km per litre.", expression: "curious", side: "left" },
    ],
    table: "One truck per row. Open it to see every fill with litres, cost and km per litre.",
  },
  "/maintenance/tyre-inventory": {
    title: "Tyre Inventory",
    about: "Every tyre the company has bought: whether it's on a truck or in stock, and how far it has run.",
    search: "Find a tyre by number, brand or truck.",
    actions: [{ label: "Add Tyre", text: "Record a new tyre purchase with its number, brand, size and cost." }],
    steps: [
      { title: "Making changes", roles: ["Admin"], text: "You edit and delete tyres directly. A deleted tyre goes to the Tyre Archive.", expression: "determined" },
      { title: "Making changes", notRoles: ["Admin"], text: "Deleting a tyre sends Admin a request with your reason.", expression: "calm" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every tyre added, edited, deleted or restored, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { button: "View Tyre Data", title: "A tyre's details", text: "Everything about one tyre: purchase, cost per km and where it has been.", expression: "curious", side: "left" },
      { button: "View Tyre History", title: "Tyre history", text: "Every truck and position the tyre was fitted to, and the km it ran.", expression: "focused", side: "left" },
      { button: "Flag for Retreading", title: "Retreading", text: "Send a worn tyre to the Retread Queue.", expression: "determined", side: "left" },
      { button: "Flag as Discarded", title: "Discard", text: "Write a tyre off; it moves to Discarded Tyres.", expression: "sad", side: "left" },
    ],
    table: "One tyre per row, with where it is now (Attached or Available) and its km so far.",
  },
  "/maintenance/tyre-management": {
    title: "Tyre Management",
    about: "The tyre layout on each truck: which tyre sits where.",
    search: "Find a truck by registration.",
    actions: [{ label: "Manage Remarks", text: "The ready-made remarks to pick from when a tyre is fitted or removed." }],
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every tyre fitted or removed on any truck, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { button: "View Truck History", title: "Truck history", text: "Every tyre fitted to or removed from this truck, and when.", expression: "curious", side: "left" },
    ],
    table: "Open a truck to see its layout and fit, swap or remove tyres. Removing a tyre needs a remark saying why, and its km so far are recorded.",
  },
  "/maintenance/retread-queue": {
    title: "Retread Queue",
    about: "Tyres waiting to be sent for retreading.",
    search: "Find a tyre by number or brand.",
    table: "When a tyre comes back, Move to Inventory records the retread count, invoice date and proof of payment. If it can't be retreaded, Flag as Discarded writes it off.",
  },
  "/maintenance/discarded-tyres": {
    title: "Discarded Tyres",
    about: "Tyres taken out of service and written off, including tyres sold along with a truck.",
    search: "Find a tyre by number or brand.",
    table: "View Tyre Data shows its whole history. Move to Inventory brings a tyre back into use if it was discarded by mistake.",
  },
  "/maintenance/tyre-archive": {
    title: "Tyre Archive",
    about: "Tyres deleted from the inventory. Restore them, or delete them for good.",
    search: "Find a tyre by number, requester or approver.",
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every tyre deleted, restored or permanently deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    table: "Open a row for details. Restore puts the tyre back in the inventory; Delete Permanently removes it for good.",
  },
  "/maintenance/truck-run-record": {
    title: "Truck Run Record",
    about: "How far each truck has actually run, and its run history.",
    search: "Find a truck by registration.",
    table: "View Record shows the truck's runs over time; View Breakdown shows how the total is made up.",
  },
  "/maintenance/truck-records": {
    title: "Truck Maintenance Record",
    about: "Every maintenance record across the fleet, for checking. " + READ_ONLY,
    search: "Find a truck by registration.",
    steps: [
      { title: "Using this page", text: "The totals are at the top. Below them, filter and search (by truck, type or description). Each truck is a card; open one to see its maintenance records, with dates, costs and who did the work.", expression: "focused" },
    ],
  },
  "/maintenance/truck-fuel-record": {
    title: "Truck Fuel Record",
    about: "Every fuel log across the fleet, for checking. " + READ_ONLY,
    search: "Find a truck by registration.",
    steps: [
      { title: "Using this page", text: "The totals are at the top. Below them, filter and search (by truck, fuel station or who entered it). Each truck is a card; open one to see its fuel logs: litres, cost, station and who entered them.", expression: "focused" },
    ],
  },
  "/maintenance/truck-compliance-record": {
    title: "Truck Compliance Record",
    about: "Every compliance document and renewal across the fleet, for checking. " + READ_ONLY,
    search: "Find a truck by registration.",
    steps: [
      { title: "Using this page", text: "The totals are at the top. Below them, filter and search (by truck, manufacturer or model). Each truck is a card; open one to see its seven documents with their expiry dates (green valid, amber expiring soon, red expired).", expression: "focused" },
    ],
  },

  // ── Attendance & approvals ────────────────────────────────────────────────
  "/attendance/drivers": {
    title: "Driver Attendance",
    about: "Mark every driver for the day you pick: On Trip, On Halt, Leave or On Workshop.",
    steps: [
      { title: "Which day", roles: ["Admin"], text: "Pick any date and mark or change it. If someone filled in a late entry for that date, a note shows who and why.", expression: "focused" },
      { title: "Which day", notRoles: ["Admin"], text: "You can mark today and the last two days freely. An older date is locked: to mark it, give a reason for the late entry, and Admin can see it.", expression: "focused" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every attendance mark and change, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { selector: '[title="Change the max amount"]', roles: ["Admin"], title: "Advance limit", text: "The most a driver can be given as a workshop advance. Click to change it.", expression: "determined", side: "bottom" },
    ],
    search: "Find a driver by name or ID.",
    actions: [{ label: "View", text: "A report of driver attendance for the date range, to view or download as a PDF." }],
    table: "One driver per row. Pick their status; it saves as you go. On Trip and On Halt ask for the vehicle type (it decides the cleaner batta). On Workshop asks for the advance paid to the driver. Add a remark to any day.",
  },
  "/attendance/staff": {
    title: "Staff Attendance",
    about: "Everyone's attendance for the day you pick. Staff mark their own; you can mark or correct anyone's.",
    steps: [
      { button: "Mandatory Attendance", title: "Make marking compulsory", text: "When this is On, staff must mark their attendance before the rest of the app opens for them.", expression: "determined", side: "bottom", align: "end" },
      { button: "Edit History", title: "Edit History", text: "Every mark you made or changed for someone else, and when.", expression: "curious", side: "bottom", align: "end" },
      { button: "Auto-Close Settings", title: "Auto-close", text: "How long someone can be inactive before their open shift closes by itself. Real activity keeps resetting the clock, so split shifts are safe.", expression: "focused", side: "bottom", align: "end" },
      { selector: '[title="Close this shift now, on their behalf"]', title: "Close a shift", text: "Close someone's shift for them if they forgot. They can resume it if they were still working.", expression: "calm", side: "left" },
      { selector: '[title="When this person was last actually active"]', title: "Last active", text: "When this person last really used the app, not just when they logged in.", expression: "curious", side: "left" },
    ],
    search: "Find a staff member by name or ID.",
    actions: [{ label: "View", text: "A report of staff attendance for the date range, to view or download as a PDF." }],
    table: "One person per row with their status, check-in and check-out. Changing someone's status shows them \"Updated by admin\" on their own page.",
  },
  "/attendance/report": {
    title: "Attendance Report",
    about: "Attendance over any period, as a summary or day by day.",
    steps: [
      { title: "Drivers or staff", roles: ["Admin"], text: "Switch between drivers and staff, and between the Summary and the day-by-day Register.", expression: "curious" },
      { title: "Drivers", roles: ["Commercial Manager", "Assistant Commercial Manager"], text: "You see the drivers' report, as a Summary or a day-by-day Register.", expression: "curious" },
      { button: "Legend", title: "Legend", text: "What each letter and colour in the register means.", expression: "calm", side: "bottom" },
    ],
    search: "Find a person by name or ID.",
    actions: [
      { label: "View", text: "Shows the report for the date range you've picked." },
      { label: "Download Excel", text: "The same report as an Excel file." },
    ],
  },
  "/attendance/holidays": {
    title: "Holidays",
    about: "Government and company holidays for staff attendance. Sundays are holidays automatically.",
    steps: [
      { title: "Adding a holiday", text: "Pick the date, name it and choose Government or Company. Staff can still mark attendance on a holiday if they're working.", expression: "happy" },
      { button: "Edit History", title: "Edit History", text: "Every holiday added, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { selector: '[aria-label="Previous year"]', title: "Other years", text: "Step back or forward a year to plan ahead or look back.", expression: "calm", side: "bottom" },
    ],
    table: "Every holiday this year. Edit or delete from the row.",
  },
  "/attendance/leave-approvals": {
    title: "Leave Approvals",
    about: "Leave requests from drivers and staff, waiting for your decision.",
    steps: [
      { button: "Edit History", title: "Edit History", text: "Every leave request made, approved or rejected, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a request by person, reason or dates.",
    actions: [{ label: "View", text: "A report of leave requests for the date range, to view or download as a PDF." }],
    table: "One request per row. Approve or reject it; the person is told straight away.",
  },
  "/attendance/edit-approvals": {
    title: "Edit Approvals",
    about: "Requests to edit or delete customer, vendor, driver, truck and trip records, waiting for a decision.",
    steps: [
      { title: "Your decision", text: "View a request to see what will change and why, then Approve or Reject it. An approved edit lets that person make the change once.", expression: "focused" },
      { title: "Deleting a trip", roles: ["Admin"], text: "Approving a trip deletion asks you for a note, which is kept with the deleted trip.", expression: "determined" },
      { title: "Clearing old requests", roles: ["Admin"], text: "Tick requests to delete them from this list. Only Admin can do this.", expression: "calm" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every request raised, approved or rejected, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a request by record, person or reason.",
  },
  "/attendance/deletion-approvals": {
    title: "Deletion Approvals",
    about: "Requests to delete records, including truck removals and sales, waiting for your decision.",
    tabs: "Pending, Approved or Rejected requests.",
    steps: [
      { title: "Before you decide", text: "Open a request to see the record, the reason and, for a truck, the sale details and what happens to its tyres. Approve to delete it (it can be restored from the Archive), or Reject.", expression: "focused" },
      { button: "Edit History", title: "Edit History", text: "Every deletion request and decision, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a request by record or person.",
  },
  "/attendance/maintenance-approvals": {
    title: "Maintenance Approvals",
    about: "New maintenance records join a truck's record only after they're approved here.",
    tabs: "Pending, Approved, Rejected or Withdrawn records.",
    search: "Find a record by truck, vendor or person.",
    table: "Open a record to check the work, cost and proofs, then Approve or Reject it with a reason.",
  },
  "/attendance/payment-requests": {
    title: "Payment Requests",
    about: "Payment notes sent in Canaan Chat, waiting to be paid.",
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every payment marked paid or rejected, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    actions: [{ label: "View", text: "A report of payment requests for the date range, to view or download as a PDF." }],
    table: "One request per row. Mark as Paid once the money is sent, attaching the proof of payment, or Reject it. A note the other person declined in chat shows as rejected.",
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  "/finance/documents": {
    title: "Documents",
    about: "Every proof of payment and document in the app, in one place.",
    steps: [
      { button: "All documents", title: "All, or missing proof", text: "Missing proof lists payments that were made without a proof attached, so you can chase them.", expression: "determined", side: "bottom", align: "start" },
    ],
    search: "Find a document by name, truck, person or type.",
    table: "One document per row. View opens it.",
  },
  "/finance/driver-compensation": {
    title: "Driver Compensation",
    about: "Drivers' advances, salaries, batta and halt pay.",
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every payment added or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { button: "How is this Calculated?", title: "How pay is worked out", text: "Which trips and days count, how batta and halt are priced, and how the final pay is reached, in plain words.", expression: "focused", side: "left" },
    ],
    search: "Find a driver by name or ID.",
    table: "One driver per row. From the row, pay an advance or salary, record halt pay or cleaner and workshop batta, and open the salary statement for any month.",
  },
  "/finance/staff-compensation": {
    title: "Staff Compensation",
    about: "Pay staff salaries and advances, and see what each person has been paid.",
    steps: [
      { button: "Edit History", title: "Edit History", text: "Every payment added or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a staff member by name or ID.",
    table: "One person per row. Pay an advance or salary, or open their payment history.",
  },
  "/finance/emi-tracking": {
    title: "EMI Tracking",
    about: "Loan EMIs for trucks and other financed assets, and what's still owed.",
    actions: [{ label: "Add EMI Entry", text: "Record a loan: the asset, lender, EMI amount, dates and tenure." }],
    steps: [
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every EMI entry added, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
      { field: "Overdue EMI", title: "Overdue", text: "EMIs past their due date and not yet paid.", expression: "surprised", side: "bottom" },
      { field: "Completed EMI", title: "Completed", text: "Loans that are fully paid off.", expression: "happy", side: "bottom" },
      { button: "View EMI Record", title: "One loan in detail", text: "Every instalment, paid and to come, and what's left.", expression: "focused", side: "left" },
      { button: "View Insights", title: "Insights", text: "The loan's daily and per-km cost, as used by the Running Cost Calculator.", expression: "sparkle", side: "left" },
    ],
    search: "Find an EMI by truck, lender or loan number.",
    table: "One loan per row, with paid and pending instalments.",
  },
  "/finance/customer-detention": {
    title: "Customer Detention",
    about: "Halt days paid to drivers that are to be recovered from the customer.",
    steps: [
      { title: "The four totals", text: "To recover, Billed and awaiting payment, Missed on invoice (halt the invoice left out) and Paid this month. Click one to show only those trips.", expression: "curious" },
      { title: "Undo a payment", roles: ["Admin"], text: "Undo on a paid row removes the payment and its proof, if it was recorded by mistake.", expression: "calm" },
    ],
    search: "Find a trip by ID, customer or invoice number.",
    table: "Mark as Paid once the customer pays, with the date, amount and an optional proof.",
  },
  "/finance/truck-emi-record": {
    title: "Truck EMI Record",
    about: "Every loan EMI across the fleet, for checking. " + READ_ONLY,
    search: "Find a truck by registration.",
    steps: [
      { title: "Using this page", text: "The totals are at the top. Below them, filter and search (by truck, EMI name, bank or loan number). Each truck is a card; open one to see its loans: EMI amount, bank, dates and what's left.", expression: "focused" },
    ],
  },

  // ── Insights ──────────────────────────────────────────────────────────────
  "/insights/pl-summary": {
    title: "Profitability",
    about: "",
    tour: [
      { selector: "h1", title: "Profitability", text: "Profit and loss for every trip and every truck in the period you pick, after every cost.", expression: "sparkle", side: "bottom", align: "start" },
      { button: "Quick Start Guide", title: "Quick Start Guide", text: "A one-minute guide to this page. Start here if it's new to you.", expression: "happy", side: "bottom", align: "end" },
      { button: "How is it Calculated", title: "How it's calculated", text: "Every formula behind every figure, for each cost mode.", expression: "focused", side: "bottom", align: "end" },
      { button: "View", title: "The report", text: "The report for this period and view, to look through or download as a PDF.", expression: "wink", side: "bottom", align: "end" },
      { selector: '[aria-label="Period"]', title: "Period", text: "Quick periods: this month, last month, the last 3 or 6 months, or this year.", expression: "curious", side: "bottom", align: "start" },
      { selector: '[data-tour="page-dates"]', title: "Your own dates", text: "Or pick any start and end date. Picking dates clears the quick period.", expression: "focused", side: "bottom", align: "end" },
      { target: "pl-empty", title: "Nothing loaded yet", text: "Pick a period above and the report loads here.", expression: "calm", side: "top" },
      { selector: '[aria-label="Report view"]', title: "Trips or trucks", text: "Two views of the same period: profit trip by trip, or added up truck by truck with its running and fixed costs.", expression: "curious", side: "bottom", align: "start" },
      { selector: '[data-tour="page-search"]', title: "Search", text: "Narrow the list to a truck, customer or trip. The cards and totals then cover only what matches.", expression: "sparkle", side: "bottom" },
      { selector: '[aria-label="Cost mode"]', title: "Cost mode", text: "Where the truck's cost per km comes from. Manual: the figures you typed into the Running Cost Calculator. Basic: real diesel and tyre prices plus your EMI figures. Advanced: everything fetched per truck automatically. Truck costs and final profit change with it.", expression: "determined", side: "bottom", align: "end" },
      { target: "pl-trip-cards", title: "The totals", text: "Trips, hire and profit for the period. Profitable and Non-Profitable also filter the list: click one, click it again to show all.", expression: "focused", side: "bottom" },
      { target: "pl-trip-table", title: "Reading a trip", text: "Left to right: Hire − Trip Expenses = Trip Profit; − Diesel = Gross Profit; − Truck Expenses = Final Profit. Click a column title to sort; hover the ⓘ for what a column means. Click a trip to see its numbers worked out.", expression: "focused", side: "top" },
      { selector: '[title^="Flagged for recheck"]', title: "Under Review", text: "A trip the Auditor flagged. It's listed, but left out of every total until it's cleared.", expression: "surprised", side: "right" },
      { click: "Truck Profitability", target: "pl-truck-cards", title: "Truck by truck", text: "I've switched to the truck view. These are the totals per truck, ending in Net Profit after every cost.", expression: "curious", side: "bottom" },
      { target: "pl-warnings", title: "Worth knowing", text: "Gaps in the data that affect the figures, such as a truck with no cost per km in this mode, or a period that runs before the first trip or past today.", expression: "surprised", side: "bottom" },
      { target: "pl-truck-table", title: "Reading a truck", text: "Hire → Trip Profit → minus Diesel = Gross Profit → minus Running Costs (tyres, maintenance) and Fixed Costs (EMI, documents) = Net Profit.", expression: "focused", side: "top" },
      { target: "pl-truck-table", title: "The full breakdown", text: "Click any truck for its story: a plain-language summary, a waterfall from hire to net profit, its EMI share, and every trip and maintenance bill behind the figures.", expression: "happy", side: "top" },
    ],
  },
  "/insights/running-cost-calculator": {
    title: "Running Cost Calculator",
    about: "",
    tour: [
      { selector: "h1", title: "Running Cost Calculator", text: "What it costs to run each truck per kilometre: diesel, AdBlue, tyres, maintenance, documents and EMI. Profitability uses these figures for every truck's costs.", expression: "sparkle", side: "bottom", align: "start" },
      { button: "Quick Start Guide", title: "Quick Start Guide", text: "A short guide to this page. Start here if it's new to you.", expression: "happy", side: "bottom", align: "end" },
      { button: "How is this calculated?", title: "How it's calculated", text: "Every formula, step by step, for each mode, with a replay.", expression: "focused", side: "bottom", align: "end" },
      { button: "View", title: "The report", text: "These figures as a report, to look through or download.", expression: "wink", side: "bottom", align: "end" },
      { selector: '[aria-label="Truck view"]', title: "Which trucks", text: "Single shows one truck in detail. Compare puts two or more side by side (Add vehicle adds another). List shows every truck, with a search.", expression: "curious", side: "bottom", align: "start" },
      { selector: '[aria-label="Calculation mode"]', title: "Calculation mode", text: "Manual: you type every cost yourself. Basic: diesel price, mileage, tyre cost and EMI are fetched from their pages. Advanced: everything is fetched per truck, nothing to type. Your choice is remembered, and Profitability offers the same three modes.", expression: "determined", side: "bottom", align: "end" },
      { target: "rcc-mode-banner", title: "Current mode", text: "Which mode the figures below are in right now.", expression: "calm", side: "bottom" },
      { target: "rcc-truck-card", title: "The truck", text: "One card per truck, with its registration, make and tyre layout.", expression: "happy", side: "right" },
      { target: "rcc-distance", title: "How far it runs", text: "Actual km per month and per day, from the Truck Run Record. Hover for how it's worked out.", expression: "curious", side: "bottom" },
      { target: "rcc-figures", title: "The figures", text: "EMI per day and per km, fuel price and mileage, AdBlue, tyres, maintenance and documents. Calculated ones fill themselves in; the others are typed or fetched, depending on the mode.", expression: "focused", side: "top" },
      { target: "rcc-total", title: "Total cost per km", text: "The six parts added up. The coloured bar shows each part's share; hover a segment for its amount.", expression: "sparkle", side: "top" },
      { title: "Saving", text: "Anything you type saves by itself after a moment, to the server too, so it's the same on any computer. There's no save button.", expression: "wink" },
      { target: "rcc-tyre-details", title: "Tyre details", text: "Cost and expected range for each tyre type. The cost per km is worked out for you.", expression: "focused", side: "left" },
      { target: "rcc-run-details", title: "Truck run details", text: "Expected km per month and per day for each tyre layout.", expression: "focused", side: "left" },
      { target: "rcc-fuel-details", title: "Fuel details", text: "The diesel price per litre used in Manual mode.", expression: "focused", side: "left" },
      { target: "rcc-tyre-config", title: "Tyre cost configuration", text: "How many of each tyre type every layout uses; the tyre cost per km follows from it.", expression: "focused", side: "left" },
      { selector: '[data-rcc-mode="Basic"], [data-rcc-mode="Advanced"]', title: "Your own figures", text: "The input cards (tyres, truck runs, fuel, tyre configuration and AdBlue) are only in Manual mode. Switch to Manual and run this tour again to see them.", expression: "curious", side: "bottom" },
      { target: "rcc-adblue-details", title: "AdBlue details", text: "AdBlue price per litre for each brand.", expression: "focused", side: "left" },
    ],
  },
  "/insights/trip-profitability-calculator": {
    title: "Trip Profitability Calculator",
    about: "Estimate a trip's profit before you quote it.",
    tabs: "Switch between the calculator and the analysis.",
    steps: [
      { button: "Quick Start Guide", title: "Quick Start Guide", text: "A short, plain guide to using this page. Start here if it's new to you.", expression: "happy", side: "bottom", align: "end" },
      { title: "Filling it in", text: "Pick the vehicle type and route; most costs fill in by themselves. Fields marked with a pencil you can change by hand. The footer shows the total expense and the profit or loss.", expression: "focused" },
      { selector: '[aria-label="Truck view"]', title: "One truck or several", text: "Work out one truck, or compare a few side by side for the same trip.", expression: "curious", side: "bottom" },
      { button: "Reset to auto-fetched", title: "Undo your changes", text: "Puts a field you changed back to the figure fetched from the app.", expression: "calm", side: "left" },
    ],
    search: "Find a truck by registration.",
  },
  "/insights/trip-planner": {
    title: "Trip Planner",
    about: "Pick a customer and route to see which truck and driver the Assign Trip form would suggest, before you book.",
    expression: "curious",
    steps: [
      { title: "Pick a customer and route", text: "Choose the customer, then one of their routes. The recommendations fill in on the right.", expression: "focused" },
      { button: "Profitable Trips", title: "Four lists", text: "Profitable Trips (this route, then other customers on the same road), Profitable Trucks and Drivers (average final profit on this route), and Cost Effective Trucks (cheapest to run per km).", expression: "curious", side: "bottom" },
      { title: "Profit levels", text: "Each trip carries a coloured label, from Strong profit to Big loss, for its final profit after trip expenses, diesel and the truck's running costs. Hover a label for its rule.", expression: "sparkle" },
    ],
  },
  "/insights/fleet-summary": {
    title: "Fleet Summary",
    about: "Each truck's trips, kilometres and hire for the period, with its documents and permits.",
    search: "Find a truck by registration.",
    steps: [
      { title: "Truck cards", text: "Each card shows a truck's trips, km and hire. Truck Details opens its documents; Trip History its trips; Full Report everything for the period.", expression: "focused" },
    ],
  },
  "/insights/customer-profitability-analytics": {
    title: "Customer Profitability Analytics",
    about: "Revenue and profit per customer: at the trip, after diesel, or after the truck's full running cost.",
    tabs: "Choose how profit is counted: Basic, Intermediate or Advanced.",
    steps: [
      { button: "Quick Start Guide", title: "Quick Start Guide", text: "A short, plain guide to using this page. Start here if it's new to you.", expression: "happy", side: "bottom", align: "end" },
      { title: "Two views", text: "A leaderboard of customers, and a 2×2 board that sorts them into Stars, Gems, Workhorses and Underperformers by volume and margin. Click a customer for their best routes.", expression: "curious" },
      { selector: '[aria-label="Cost/KM mode"]', title: "Cost mode", text: "Which Running Cost Calculator mode the truck costs come from: Manual, Basic or Advanced.", expression: "focused", side: "bottom" },
      { title: "One customer in detail", text: "Click a customer for their route breakdown, best and worst routes, and recent trips.", expression: "happy" },
    ],
    search: "Find a customer by name.",
    expression: "sparkle",
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  "/admin/branches": {
    title: "Branch Management",
    about: "Company branches and their driver halt rates. Trucks and staff are linked to a branch.",
    search: "Find a branch by name.",
    actions: [{ label: "Add Branch", text: "Add a branch and its halt rates." }],
    steps: [{ button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every branch added, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" }],
  },
  "/admin/default-batta": {
    title: "Default Batta Management",
    about: "The default batta (driver allowance) for each branch, trip type and cargo. New trip sheets start with these amounts.",
    steps: [
      { title: "Changing a rate", text: "Edit a rate and it saves by itself; \"Saved\" confirms it.", expression: "focused" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every rate change, its old and new amount, and who made it.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a change by branch, trip type, cargo or who made it.",
  },
  "/admin/maintenance": {
    title: "Maintenance Management",
    about: "Repair types, grouped into categories, offered as choices when a maintenance record is added.",
    search: "Find a category or repair type.",
    actions: [
      { label: "Add Category", text: "Add a group of repair types, such as Engine or Electrical." },
      { label: "Add Repair Type", text: "Add a repair type under a category." },
    ],
    steps: [{ button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every category and repair type added, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" }],
  },
  "/admin/repairs": {
    title: "Repairs Management",
    about: "Repair types offered as quick picks when major repairs are logged on a trip sheet.",
    search: "Find a repair type.",
    actions: [{ label: "Add Repair Type", text: "Add a repair to the quick picks." }],
    steps: [{ button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every repair type added, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" }],
  },
  "/admin/sac-codes": {
    title: "SAC Code Management",
    about: "SAC codes used for GST on transport invoices.",
    actions: [{ label: "SAC Code", text: "Add a new SAC code with its description and GST rate." }],
    steps: [
      { button: "Retrieve Values From", title: "Retrieve values", text: "Link a SAC code to a trip expense, so its amount fills in from the trip sheet when the invoice is made.", expression: "curious", side: "left" },
      { title: "Auto Populate", text: "Turn it on for an invoice type and that SAC code appears on those invoices by itself.", expression: "focused" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every SAC code change, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
    search: "Find a code.",
  },
  "/admin/trip-expenses": {
    title: "Trip Expenses",
    about: "Default amounts for the common trip expenses: port pass, weight sheet, mamool, lift on/off and more.",
    steps: [
      { title: "Auto-populate", text: "Switch Auto-populate on for an expense and its default amount fills in on every new trip sheet. It can still be changed on the sheet.", expression: "focused" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every default amount changed, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
  },
  "/admin/truck-run-config": {
    title: "Truck Run Configuration",
    about: "How far each truck is expected to run per day and per month, grouped by tyre layout. Running costs per km are based on these.",
    search: "Find a truck or tyre layout.",
    steps: [
      { button: "Set Run Configuration", title: "Set run figures", text: "Set the expected km per day and per month for each tyre layout.", expression: "determined", side: "bottom" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every run figure changed, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
  },
  "/admin/tyre-cost-config": {
    title: "Tyre Cost Configuration",
    about: "How many tyres each layout uses. The tyre cost per km is worked out from this and fed into the Running Cost Calculator.",
    search: "Find a layout or tyre type.",
    steps: [{ button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every tyre quantity changed, and by whom.", expression: "curious", side: "bottom", align: "end" }],
  },
  "/admin/tyre-range-config": {
    title: "Tyre Range Configuration",
    about: "How many kilometres each tyre type should last. Changes save as you type.",
    search: "Find a tyre type.",
    actions: [{ label: "Add Tyre Type", text: "Add a tyre type and its expected range." }],
    steps: [{ button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every tyre type and range changed, and by whom.", expression: "curious", side: "bottom", align: "end" }],
  },
  "/admin/adblue": {
    title: "Truck's AdBlue History",
    about: "Every AdBlue fill across the fleet.",
    search: "Find a truck by registration.",
    steps: [
      { button: "Manufacturers", title: "Manufacturers", text: "The AdBlue brands to pick from when a fill is logged.", expression: "calm", side: "bottom" },
      { title: "Logging a fill", text: "Enter Log on a truck records a fill: date, odometer, litres and price. Each fill's odometer must be past the previous one. View History shows the truck's fills.", expression: "focused" },
      { title: "Changing a log", roles: ["Admin"], text: "You edit and delete logs directly.", expression: "determined" },
      { title: "Changing a log", notRoles: ["Admin"], text: "Editing or deleting a log sends Admin a request with your reason.", expression: "calm" },
      { button: "Edit History", roles: ["Admin"], title: "Edit History", text: "Every AdBlue log added, edited or deleted, and by whom.", expression: "curious", side: "bottom", align: "end" },
    ],
  },
  "/admin/celebrations": {
    title: "Celebrations Management",
    about: "Birthdays, Christmas, New Year and Founding Day cards on the dashboard, and Joshine's tea time: switch each on or off for everyone, edit its text, and preview any day.",
    steps: [
      { button: "Preview on the Dashboard", title: "Preview", text: "See exactly how the dashboard will look on a chosen day. Exit preview when you're done; nobody else sees it.", expression: "love", side: "bottom" },
      { field: "Upcoming · next 90 days", title: "Coming up", text: "Birthdays and celebrations in the next 90 days.", expression: "happy", side: "bottom" },
      { field: "Card text", title: "Card text", text: "Edit the words on each card: birthday, Christmas, New Year and Founding Day.", expression: "love", side: "bottom" },
      { field: "Preview any day", title: "Preview any day", text: "Pick a date (or your own birthday) and see the dashboard as it will look then.", expression: "curious", side: "bottom" },
      { field: "Change history", title: "Change history", text: "Every change to the cards, and who made it.", expression: "calm", side: "top" },
      { field: "Tea Time", title: "Tea time", text: "At 11 AM and 4 PM Joshine reminds everyone it's tea time. Switch it off here for everyone; each person can also turn it off for themselves in Joshine's settings. The buttons show it on your screen now.", expression: "happy", side: "bottom" },
      { field: "Festival greetings", title: "Festival greetings", text: "Pongal, Deepavali and Ayudha Pooja move every year: add each year's date here and switch each on or off. On that day Joshine greets everyone for it.", expression: "sparkle", side: "bottom" },
    ],
    expression: "love",
  },
  "/admin/security": {
    title: "Security Log",
    about: "Sign-ins and sign-outs, failed logins, document downloads and every time private chats were opened.",
    tabs: "Pick a kind of event: logins, failed logins, document downloads or private chat access.",
    steps: [
      { field: "Device Lock", title: "Device lock", text: "Each login is tied to the devices it was first used on, up to the limit you set. Reset clears every device lock at once, if people need to log in afresh.", expression: "determined", side: "bottom" },
      { field: "Active Login Lockouts", title: "Locked out", text: "People blocked after too many wrong passwords. Unlock lets them try again straight away.", expression: "surprised", side: "bottom" },
      { field: "Audit Trail", title: "Audit trail", text: "Every sign-in, sign-out, failed login, document download and private-chat opening. Pick a kind of event and a date range to narrow it.", expression: "focused", side: "bottom" },
      { button: "Refresh", title: "Refresh", text: "Load the newest events.", expression: "calm", side: "bottom", align: "end" },
    ],
    table: "One event per row: who, what, when and from which IP address. Preview opens the document that was downloaded.",
    expression: "focused",
  },
  "/admin/activity-log": {
    title: "Activity Log",
    about: "What everyone did in the app: pages opened, saves, deletes and exports.",
    steps: [
      { button: "Download Report", title: "Download Report", text: "One person's work report for a single day or a date range, as a PDF or Excel file.", expression: "determined", side: "bottom", align: "end" },
      { button: "Failed only", title: "Failed only", text: "Show only actions that failed, to spot problems quickly.", expression: "surprised", side: "bottom" },
      { field: "Needs attention", title: "Needs attention", text: "Failed actions and failed logins worth a look.", expression: "surprised", side: "bottom" },
      { field: "Online now", title: "Online now", text: "Who is using the app right now, with activity by hour beside it.", expression: "happy", side: "bottom" },
      { field: "Most-used screens", title: "Most-used screens", text: "Which pages people spend their time on.", expression: "curious", side: "top" },
      { title: "One person in detail", text: "Open someone from the list to see the screens they visited and a timeline of everything they did.", expression: "focused" },
    ],
    search: "Filter by employee.",
    table: "A summary per person for the day; open someone to see each action in order.",
  },
  "/admin/usage-analytics": {
    title: "SW Usage Analytics",
    about: "Time logged in, active and idle, and the modules each person uses. A picture of use, not a performance score.",
    search: "Find someone by name or role.",
    table: "One person per row: login time, active and idle time, number of actions and when they were last seen, for the period. Click a person to see their recent actions, by area.",
  },
};

// ── Shared wording for the parts every page has ───────────────────────────────
const SHARED = {
  dates: "Pick the period. The list, its totals and the Excel download all follow it.",
  export: "Downloads what you're looking at as an Excel file.",
  table: "Each row is one record. The buttons at the end of a row open, edit or act on it.",
  pages: "Ten rows to a page. Move between pages here.",
  deleteAdmin: "Deletes the trip straight away. You give a reason, which is kept with the record, and it can be restored from Deleted Trips.",
  deleteRequest: "You can't delete directly: this sends Admin a delete request with your reason. Follow it in Edit & Delete Requests.",
};

/** Turns a page's guide into its tour steps. */
function buildSteps(g: PageGuide): TourStep[] {
  if (g.tour) return g.tour;
  const steps: TourStep[] = [
    // The title, or Joshine in the middle if the page has none.
    { selector: "h1", orCentered: true, title: g.title, text: g.about, expression: g.expression ?? "happy", side: "bottom", align: "start" },
  ];
  if (g.tabs) steps.push({ target: "page-tabs", title: "Views", text: g.tabs, expression: "curious", side: "bottom" });
  if (g.steps) steps.push(...g.steps);
  steps.push({ selector: '[data-tour="page-search"]', title: "Search", text: g.search ?? "Type to narrow the list.", expression: "sparkle", side: "bottom", align: "start" });
  steps.push({ selector: '[data-tour="page-dates"]', title: "Period", text: SHARED.dates, expression: "focused", side: "bottom" });
  for (const a of g.actions ?? []) steps.push({ button: a.label, title: a.label, text: a.text, expression: "determined", side: "bottom", align: "end" });
  steps.push({ selector: '[data-tour="page-export"]', title: "Excel", text: SHARED.export, expression: "wink", side: "bottom", align: "end" });
  steps.push({ selector: "table", title: "The list", text: g.table ?? SHARED.table, expression: "focused", side: "top" });
  // The same row button does different things by role (see TourStep.roles).
  steps.push({ selector: '[title="Delete this trip and all its data"], [title="Delete trip"]', roles: ["Admin"], title: "Delete", text: SHARED.deleteAdmin, expression: "determined", side: "left" });
  steps.push({ selector: '[title="Cancel trip"]', roles: ["Admin"], title: "Cancel a trip", text: "Cancels a trip that won't run. It stays in Trip History, marked Cancelled.", expression: "sad", side: "left" });
  steps.push({ selector: '[title="Download Lorry Receipt (LR)"]', title: "Lorry Receipt", text: "Downloads the trip's lorry receipt (LR) for the driver to carry.", expression: "wink", side: "left" });
  steps.push({ selector: '[title="Request Admin to delete this trip"]', notRoles: ["Admin"], title: "Request Delete", text: SHARED.deleteRequest, expression: "calm", side: "left" });
  steps.push({ selector: '[data-tour="page-pagination"]', title: "Pages", text: SHARED.pages, expression: "calm", side: "top" });
  return steps;
}

/** The current page's tour, or null when it has none. Trailing slashes are ignored. */
export function pageTourFor(pathname: string | null): Tour | null {
  const path = (pathname ?? "/").replace(/\/+$/, "") || "/";
  const guide = PAGE_GUIDES[path];
  if (!guide) return null;
  return { id: `page:${path}`, title: guide.title, steps: buildSteps(guide) };
}
