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
      { title: "The dashboard", text: "Your start page: what's on the road and what needs attention today.", expression: "happy" },
      { target: "dashboard-tabs", title: "One dashboard per desk", text: "Switch between the overview and each team's view: commercial, accounts, yard, trip sheets and maintenance.", expression: "curious", side: "bottom", align: "start" },
      { target: "dashboard-hero", title: "Today at a glance", text: "The fleet in one line, with the things that need attention, and shortcuts to current trips and backups.", expression: "happy", side: "bottom" },
      { target: "available-vehicles", title: "Trucks free for a trip", text: "How many trucks aren't booked or on the road. Click it for the list, with a warning on any truck that has an expired document.", expression: "curious", side: "bottom" },
      { target: "current-trips", title: "Trips on the road", text: "Every live trip with its stage. Click a stage above the table to filter; the route line shows how far each trip has come.", expression: "focused", side: "top" },
      { target: "compliance", title: "Expiring documents", text: "Insurance, permits and fitness certificates that are due or overdue, so nothing lapses on the road.", expression: "determined", side: "top" },
    ],
  },

  // ── Personal ──────────────────────────────────────────────────────────────
  "/attendance/mark": {
    title: "Mark Attendance",
    about: "Mark yourself in for the day. Some of the app stays locked until today's attendance is marked.",
    expression: "determined",
  },
  "/attendance/leave-requests": {
    title: "Leave Requests",
    about: "Ask for leave and follow each request until it's approved or declined.",
    search: "Find a request by its reason or dates.",
    tabs: "Switch between your requests by status.",
    actions: [{ label: "Submit Leave Request", text: "Pick the dates and the reason; your approver is told straight away." }],
  },
  "/personal/edit-delete-requests": {
    title: "Edit & Delete Requests",
    about: "Every edit or delete you asked an Admin for, and what they decided. " + READ_ONLY,
    search: "Find a request by the record or your reason.",
    table: "One request per row, with its decision and who made it.",
  },
  "/personal/notifications": {
    title: "Notifications",
    about: "Everything meant for you, in full. The bell up top only shows the latest few.",
    search: "Find a notification by its text.",
  },
  "/personal/profile": {
    title: "My profile",
    about: "Your details and photo, plus your own meetings, to-do and notes. Press M for meetings, T for to-do and N for notes from any page.",
    expression: "love",
  },

  // ── Connect ───────────────────────────────────────────────────────────────
  "/connect/chat": {
    title: "Canaan Chat",
    about: "Message colleagues one-to-one or in groups, share files and send payment notes, all inside the app.",
    actions: [{ label: "New Group", text: "Start a group chat and choose who's in it." }],
    expression: "happy",
  },

  // ── Trips ─────────────────────────────────────────────────────────────────
  "/trips/assign-drivers": {
    title: "Assign Drivers",
    about: "Give each driver a vehicle. Only drivers with a vehicle can be picked when a trip is booked.",
    search: "Find a driver by name or ID.",
    table: "One driver per row, with the vehicle they're driving now. Change it from the row.",
  },
  "/trips/assign": {
    title: "Assign Trips",
    about: "Book a trip and hand it to a driver who has a vehicle.",
    search: "Find a trip by truck number, driver or trip ID.",
    actions: [{ label: "Assign Trip", text: "Opens the booking form: customer, route, cargo and driver. The planner suggests the best truck." }],
    table: "Trips booked and waiting to start.",
  },
  "/trips/available": {
    title: "Available Trips",
    about: "Every trip, by the four stages it goes through: Booked → Current → Completed → Closed.",
    steps: [{ target: "trip-stages", title: "Four stages", text: "Pick a stage to see only those trips.", expression: "curious", side: "bottom", align: "start" }],
    search: "Find a trip by ID, truck, driver or customer.",
    table: "The line under each status shows where the trip is in its four stages.",
  },
  "/trips/current": {
    title: "Current Trips",
    about: "Trips on the road now or about to leave, as the drivers update them.",
    search: "Find a trip by truck number, driver or trip ID.",
    table: "One trip per row. Mark it started or completed from the row.",
  },
  "/trips/completed": {
    title: "Completed Trips",
    about: "Trips the drivers have finished. Next they're closed with the booking sheet.",
    search: "Find a trip by truck number, driver or trip ID.",
    table: "One finished trip per row.",
  },
  "/trips/sheet-collection": {
    title: "Trip Sheet Collection",
    about: "Mark the trip sheets drivers have handed in, before reconciliation.",
    search: "Find a trip by truck number, driver or trip ID.",
    table: "Tick a trip once its sheet is in your hands.",
  },
  "/trips/reconciliation": {
    title: "Trip Reconciliation",
    about: "Match each closed trip's booking sheet with its trip sheet and enter the figures.",
    search: "Find a trip by truck number, driver or trip ID.",
    table: "One closed trip per row. Open it to see or enter its sheets.",
  },
  "/trips/verification": {
    title: "Verification & Invoicing",
    about: "Check each trip's figures, then raise its invoice, on its own or combined with others.",
    search: "Find a trip by truck number, driver or trip ID.",
    table: "Verify a trip from its row; verified trips can be invoiced.",
  },
  "/trips/pending-audit": {
    title: "Pending Audit",
    about: "Verified trips waiting for the Auditor to sign off or flag.",
    search: "Find a trip by ID, driver or truck.",
    table: "Audit a trip from its row: verify it or flag it with a reason.",
  },
  "/trips/audit-verified": {
    title: "Audit Verified Trips",
    about: "Trips the Auditor has reviewed and signed off.",
    search: "Find a trip by ID, driver or the verifier.",
  },
  "/trips/flagged": {
    title: "Audit Flagged Trips",
    about: "Trips the Auditor flagged for a second look, with the reason.",
    search: "Find a trip by ID, driver or the reason.",
    expression: "determined",
  },
  "/trips/history": {
    title: "Trip History",
    about: "Every trip ever booked, with its booking sheet, trip sheet and invoice.",
    search: "Find a trip by truck number, driver or trip ID.",
    table: "Open a trip's documents from its row.",
  },
  "/trips/deleted": {
    title: "Deleted Trips",
    about: "Trips that were permanently deleted: who asked, why, and who approved. " + READ_ONLY,
    search: "Find a trip by ID, requester or approver.",
  },
  "/trips/pnl-mileage": {
    title: "Trip Summary",
    about: "Profit or loss and mileage for every completed trip sheet.",
    search: "Find a trip by ID, vehicle or route.",
    table: "Each row is one trip: revenue, costs, profit and kilometres.",
  },

  // ── Resources ─────────────────────────────────────────────────────────────
  "/resources/staff": {
    title: "Our Staff",
    about: "Everyone who works at Canaan Global, across every branch.",
    search: "Find someone by name, ID or designation.",
    actions: [{ label: "Add Staff", text: "Add a new staff member with their role, branch and login." }],
    table: "Open someone's row to see their details, documents and history.",
  },
  "/resources/drivers": {
    title: "Our Drivers",
    about: "Every driver, with their licence, documents and branch.",
    search: "Find a driver by name or ID.",
    actions: [{ label: "Add Driver", text: "Add a driver with their licence and documents." }],
    table: "Open a driver's row to see their details and history.",
  },
  "/resources/fleet": {
    title: "Our Fleet",
    about: "Every truck, with its documents, tyre layout and branch.",
    search: "Find a truck by registration or truck ID.",
    actions: [{ label: "Add Truck", text: "Add a truck with its registration, layout and documents." }],
    table: "Open a truck's row to see its details, compliance and history.",
  },
  "/resources/customers": {
    title: "Our Customers",
    about: "Customer records, the prices agreed with them and their destinations.",
    search: "Find a customer by name or code.",
    actions: [
      { label: "Add Customer", text: "Add a new customer and their billing details." },
      { label: "Add Pricing", text: "Set the agreed rate for a customer's route." },
      { label: "Add Destination", text: "Add a place customers ship to, so trips can pick it." },
    ],
  },
  "/resources/vendors": {
    title: "Our Vendors",
    about: "Suppliers and workshops, grouped by category, with their contacts.",
    search: "Find a vendor by name or category.",
    actions: [
      { label: "Add Vendor", text: "Add a supplier or workshop." },
      { label: "Add Vendor Category", text: "Add a group to file vendors under, such as tyres or diesel." },
    ],
  },
  "/resources/archive": {
    title: "Archive",
    about: "Staff, drivers, trucks, customers and vendors removed from the hub. Restore them, or delete them for good.",
    search: "Find a record by name, requester or approver.",
  },
  "/resources/driver-record": {
    title: "Driver Based Record",
    about: "Everything about each driver in one place. " + READ_ONLY,
    search: "Find a driver by name or ID.",
  },
  "/resources/vehicle-record": {
    title: "Vehicle Based Record",
    about: "Everything about each vehicle in one place. " + READ_ONLY,
    search: "Find a vehicle by registration or truck ID.",
  },

  // ── Maintenance ───────────────────────────────────────────────────────────
  "/maintenance/trucks": {
    title: "Truck Maintenance",
    about: "How reliable each truck is: breakdowns, repairs and time in the workshop.",
    search: "Find a truck by registration.",
    table: "Open a truck's row to log or review its maintenance.",
  },
  "/maintenance/compliance": {
    title: "Compliance & Renewals",
    about: "RC, FC, road tax, permits, pollution certificate and insurance for every truck, and when each runs out.",
    search: "Find a truck by registration.",
    table: "Red means expired, amber means due soon. Renew from the row.",
    expression: "determined",
  },
  "/maintenance/fuel-history": {
    title: "Truck's Fuel History",
    about: "Every fuel fill for every truck, and the mileage it gave.",
    search: "Find a truck by registration.",
  },
  "/maintenance/tyre-inventory": {
    title: "Tyre Inventory",
    about: "Every tyre the company has bought, where it is and how far it has run.",
    search: "Find a tyre by number, brand or truck.",
    actions: [{ label: "Add Tyre", text: "Record a new tyre purchase." }],
  },
  "/maintenance/tyre-management": {
    title: "Tyre Management",
    about: "The tyre layout on each truck: which tyre sits where.",
    search: "Find a truck by registration.",
    table: "Open a truck to fit, swap or remove tyres.",
  },
  "/maintenance/retread-queue": {
    title: "Retread Queue",
    about: "Tyres waiting to go for retreading.",
  },
  "/maintenance/discarded-tyres": {
    title: "Discarded Tyres",
    about: "Tyres taken out of service and written off.",
  },
  "/maintenance/tyre-archive": {
    title: "Tyre Archive",
    about: "Tyres removed from the inventory. Restore them, or delete them for good.",
    search: "Find a tyre by number, requester or approver.",
  },
  "/maintenance/truck-run-record": {
    title: "Truck Run Record",
    about: "How far each truck has actually run, and its run history.",
    search: "Find a truck by registration.",
  },
  "/maintenance/truck-records": {
    title: "Truck Maintenance Record",
    about: "Every maintenance record across the fleet. " + READ_ONLY,
  },
  "/maintenance/truck-fuel-record": {
    title: "Truck Fuel Record",
    about: "Every fuel log across the fleet. " + READ_ONLY,
  },
  "/maintenance/truck-compliance-record": {
    title: "Truck Compliance Record",
    about: "Every compliance document and renewal across the fleet. " + READ_ONLY,
  },

  // ── Attendance & approvals ────────────────────────────────────────────────
  "/attendance/drivers": {
    title: "Driver Attendance",
    about: "Mark and track attendance for every driver: on trip, on halt, on leave or in the workshop.",
    search: "Find a driver by name.",
  },
  "/attendance/staff": {
    title: "Staff Attendance",
    about: "Mark and track attendance for every staff member.",
    search: "Find someone by name.",
  },
  "/attendance/report": {
    title: "Attendance Report",
    about: "Attendance totals per person over any period you pick.",
    tabs: "Switch between drivers and staff.",
  },
  "/attendance/holidays": {
    title: "Staff Holidays",
    about: "Government and company holidays. Sundays are holidays automatically.",
    search: "Find a holiday by name.",
  },
  "/attendance/leave-approvals": {
    title: "Leave Approvals",
    about: "Leave requests waiting for your answer.",
    search: "Find a request by the applicant's name.",
    table: "Approve or decline a request from its row.",
  },
  "/attendance/edit-approvals": {
    title: "Edit Approvals",
    about: "Requests to edit or delete customer, vendor, driver and truck records.",
    search: "Find a request by staff name or record.",
    table: "Approve or decline a request from its row.",
  },
  "/attendance/deletion-approvals": {
    title: "Deletion Approvals",
    about: "Requests from staff to delete records, waiting for an Admin.",
    search: "Find a request by requester or record.",
  },
  "/attendance/maintenance-approvals": {
    title: "Maintenance Approvals",
    about: "New maintenance records reach the truck's record only after they're approved here.",
    search: "Find a record by truck, type, vendor or invoice.",
  },
  "/attendance/payment-requests": {
    title: "Payment Requests",
    about: "Payments staff have asked for, and their status.",
    search: "Find a request by its description.",
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  "/finance/documents": {
    title: "Proof and Documents",
    about: "Every proof of payment and document, in one place.",
    search: "Find a file by invoice number, vendor, truck or tyre.",
  },
  "/finance/driver-compensation": {
    title: "Driver Compensation",
    about: "Advances and salaries paid to drivers.",
    search: "Find a driver by name.",
    table: "Open a driver to see their advance and salary records.",
  },
  "/finance/staff-compensation": {
    title: "Staff Compensation",
    about: "Pay staff salaries and keep the records.",
    search: "Find someone by name.",
  },
  "/finance/emi-tracking": {
    title: "EMI Tracking",
    about: "Loan EMIs for trucks and other financed assets, and when each is due.",
    search: "Find an EMI by truck or lender.",
    actions: [{ label: "Add EMI Entry", text: "Record a loan and its EMI schedule." }],
  },
  "/finance/customer-detention": {
    title: "Customer Detention",
    about: "Halt days paid to drivers that are to be recovered from the customer.",
    search: "Find a trip by ID, customer or invoice number.",
  },
  "/finance/truck-emi-record": {
    title: "Truck EMI Record",
    about: "Every loan EMI across the fleet. " + READ_ONLY,
  },

  // ── Insights ──────────────────────────────────────────────────────────────
  "/insights/pl-summary": {
    title: "Profitability",
    about: "Profit and loss by trip and by truck for the period you pick.",
    tabs: "Switch between the trip view and the truck view.",
    expression: "sparkle",
  },
  "/insights/running-cost-calculator": {
    title: "Running Cost Calculator",
    about: "Work out what each truck costs per kilometre to run.",
    search: "Find a truck by registration.",
    tabs: "Switch between the calculator and the analysis.",
    actions: [{ label: "Add vehicle", text: "Add a vehicle to the calculation." }],
  },
  "/insights/trip-profitability-calculator": {
    title: "Trip Profitability Calculator",
    about: "Estimate a trip's profit before you quote it.",
    search: "Find a truck by registration.",
    tabs: "Switch between the calculator and the analysis.",
  },
  "/insights/trip-planner": {
    title: "Trip Planner",
    about: "The truck and driver suggestions the Assign Trip form gives, before a trip is booked.",
    expression: "curious",
  },
  "/insights/fleet-summary": {
    title: "Fleet Summary",
    about: "Each truck's trips, kilometres and earnings for the period.",
  },
  "/insights/customer-profitability-analytics": {
    title: "Customer Profitability Analytics",
    about: "Revenue and profit per customer: at the trip, after diesel, or after the truck's full running cost.",
    search: "Find a customer by name.",
    tabs: "Choose how profit is counted.",
    expression: "sparkle",
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  "/admin/branches": {
    title: "Branch Management",
    about: "Company branches and their driver halt rates.",
    search: "Find a branch by name.",
    actions: [{ label: "Add Branch", text: "Add a branch and its halt rates." }],
  },
  "/admin/default-batta": {
    title: "Default Batta Management",
    about: "Default batta (allowance) rates used for trips and driver pay.",
    search: "Find a change by branch, trip type, cargo or who made it.",
  },
  "/admin/maintenance": {
    title: "Maintenance Management",
    about: "Repair types, grouped into categories, offered when maintenance is logged.",
    search: "Find a category or repair type.",
    actions: [
      { label: "Add Category", text: "Add a group of repair types." },
      { label: "Add Repair Type", text: "Add a repair to a category." },
    ],
  },
  "/admin/repairs": {
    title: "Repairs Management",
    about: "Repair types offered as quick picks when major repairs are logged on a trip sheet.",
    search: "Find a repair type.",
    actions: [{ label: "Add Repair Type", text: "Add a repair to the quick picks." }],
  },
  "/admin/sac-codes": {
    title: "SAC Code Management",
    about: "SAC codes used for GST on transport invoices.",
    search: "Find a code.",
    actions: [{ label: "SAC Code", text: "Add a new SAC code." }],
  },
  "/admin/trip-expenses": {
    title: "Trip Expenses",
    about: "The expense types drivers can claim on a trip.",
    search: "Find an expense type.",
  },
  "/admin/truck-run-config": {
    title: "Truck Run Configuration",
    about: "Run settings per truck, grouped by tyre layout.",
    search: "Find a truck or tyre layout.",
  },
  "/admin/tyre-cost-config": {
    title: "Tyre Cost Configuration",
    about: "Tyre quantities per layout. The base cost per kilometre is worked out for you.",
    search: "Find a layout or tyre type.",
  },
  "/admin/tyre-range-config": {
    title: "Tyre Range Configuration",
    about: "How many kilometres each tyre type should last. Changes save as you type.",
    search: "Find a tyre type.",
    actions: [{ label: "Add Tyre Type", text: "Add a tyre type and its expected range." }],
  },
  "/admin/adblue": {
    title: "Truck's AdBlue History",
    about: "Every AdBlue fill across the fleet.",
    search: "Find a truck by registration.",
  },
  "/admin/celebrations": {
    title: "Celebrations Management",
    about: "Birthdays, the December season and Founding Day: switch them on or off for everyone, edit the card text and preview any day.",
    expression: "love",
  },
  "/admin/security": {
    title: "Security Log",
    about: "Sign-ins, document access and locked accounts. Admins only.",
    table: "Unlock an account from its row.",
    expression: "focused",
  },
  "/admin/activity-log": {
    title: "Activity Log",
    about: "What everyone did in the app, and when.",
    search: "Filter by employee.",
  },
  "/admin/usage-analytics": {
    title: "SW Usage Analytics",
    about: "Time logged in, active and idle, and the modules each person uses. A picture of use, not a performance score.",
    search: "Find someone by name or role.",
  },
};

// ── Shared wording for the parts every page has ───────────────────────────────
const SHARED = {
  dates: "Pick the period. The list, its totals and the Excel download all follow it.",
  export: "Downloads what you're looking at as an Excel file.",
  table: "Each row is one record. The buttons at the end of a row open, edit or act on it.",
  pages: "Ten rows to a page. Move between pages here.",
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
