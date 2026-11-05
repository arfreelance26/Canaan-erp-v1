import type { Tour, TourStep } from "@/lib/tours";

/**
 * Guided tours of the big forms, led by Joshine. A form gets one by passing
 * `tour="id"` to its <Dialog>: Joshine offers it the first time the form opens,
 * and the ? in the form's header runs it any time.
 *
 * Steps point at a field by its label or a section by its heading (`field`),
 * so they need no extra markup. A tour only explains: it never fills anything
 * in or saves. `npm run check:tours` checks every field named here exists.
 */
type FormTour = { title: string; steps: TourStep[] };

const NOT_ADMIN = ["Admin"];

export const FORM_TOURS: Record<string, FormTour> = {
  "assign-trip": {
    title: "the trip form",
    steps: [
      { title: "Booking a trip", text: "Fill this in from top to bottom. Fields with a red * are required; the form won't save without them.", expression: "happy" },
      { field: "Booking Information", title: "Booking", text: "The booking reference, date and trip category.", expression: "focused", side: "right" },
      { field: "Customer Information", title: "Customer", text: "Pick the customer. Their saved destinations and prices fill in the route and rates further down.", expression: "curious", side: "right" },
      { field: "Cargo Information", title: "Cargo", text: "Container numbers and cargo. A container already on another active trip is caught when you save.", expression: "determined", side: "right" },
      { field: "Route Information", title: "Route", text: "Pick one of the customer's saved routes, or type your own origin and destination.", expression: "curious", side: "right" },
      { field: "Vehicle & Trip Assignment", title: "Truck and driver", text: "The trip date and the truck. The driver comes with the truck; changing the driver asks for a reason. A truck already on an active trip can't be booked twice.", expression: "determined", side: "right" },
      { field: "Payment & Advances", title: "Billing and advances", text: "Who's billed, and any cash or fuel advance the customer gave.", expression: "focused", side: "right" },
      { field: "Driver Compensation", title: "Driver pay", text: "The driver's advance and batta for this trip. The default batta comes from Default Batta Management.", expression: "calm", side: "right" },
      { field: "Transport Cost Details", title: "Hire", text: "The hire amount and any commission. This is what the trip earns.", expression: "sparkle", side: "right" },
      { title: "After you save", text: "The trip appears in Assign Trips. When the driver starts, mark it started and it moves to Current Trips.", expression: "wink" },
    ],
  },
  "close-trip": {
    title: "closing a trip",
    steps: [
      { title: "Closing a trip", text: "This is the booking sheet: the final figures for a finished trip. Most of it is filled in from the trip already.", expression: "happy" },
      { field: "1. Shipment Information", title: "Shipment", text: "Booking, container and release order details, as booked. Check them against the paperwork.", expression: "focused", side: "right" },
      { field: "2. Assignment", title: "Truck and driver", text: "The truck, driver and date the trip actually ran with.", expression: "curious", side: "right" },
      { field: "4. Billing", title: "Billing", text: "Who's billed and the amounts. Accounts invoices from these figures.", expression: "determined", side: "right" },
      { field: "5. Halt Information", title: "Halt", text: "Days the truck waited at the customer. Halt paid to the driver can be recovered from the customer (Customer Detention).", expression: "focused", side: "right" },
      { title: "After you save", text: "The trip is closed and waits for its trip sheet: the yard collects it next.", expression: "wink" },
    ],
  },
  "trip-sheet": {
    title: "the trip sheet",
    steps: [
      { title: "Entering a trip sheet", text: "Copy the driver's trip sheet in, section by section. Trip details already known are filled in for you.", expression: "happy" },
      { field: "Trip Information", title: "Trip details", text: "Filled in from the booking. Admin can change them directly.", roles: ["Admin"], expression: "focused", side: "right" },
      { field: "Trip Information", title: "Trip details", text: "Filled in from the booking and locked. If one is wrong, ask for an edit; once Admin approves, you can change it.", notRoles: NOT_ADMIN, expression: "focused", side: "right" },
      { field: "Trip Distance & Cargo", title: "Kilometres", text: "Start and end km from the odometer. They're checked against the truck's other trips, and you're warned if something doesn't add up.", expression: "determined", side: "right" },
      { field: "Diesel Entry", title: "Diesel", text: "Every fill on the trip: where, litres and amount.", expression: "focused", side: "right" },
      { field: "Trip Expenses", title: "Expenses", text: "Tolls, port pass, loading and other costs the driver paid. Common ones may already have their usual amount.", expression: "curious", side: "right" },
      { field: "Driver Settlement", title: "Settlement", text: "What's owed to or by the driver after the advance.", expression: "calm", side: "right" },
      { field: "Expense Summary", title: "Summary", text: "The totals, worked out for you. Check them against the paper sheet before saving.", expression: "sparkle", side: "right" },
      { title: "After you save", text: "The sheet goes to Verification & Invoicing, where Accounts checks it.", expression: "wink" },
    ],
  },
  "verify-trip": {
    title: "verifying a trip",
    steps: [
      { title: "Verifying a trip", text: "Check the trip sheet against the booking before it's invoiced.", expression: "happy" },
      { field: "Trip Identification", title: "The trip", text: "Who, what and where, from the booking.", expression: "focused", side: "right" },
      { field: "Trip Closure", title: "Closure", text: "The final figures from the booking sheet.", expression: "curious", side: "right" },
      { field: "Trip Expenses", title: "Tick every expense", text: "Mark each expense correct (tick) or wrong (cross). The decision unlocks once every one is marked.", expression: "determined", side: "right" },
      { title: "Your decision", text: "All ticked: Confirm Verification and the trip is ready to invoice. Any crossed: Send Back to Docs with a reason, and the trip sheet desk fixes it.", expression: "focused" },
    ],
  },
  "generate-invoice": {
    title: "the invoice",
    steps: [
      { title: "Making the invoice", text: "Most of this fills in from the trip and the customer. Check it, add the services, and generate.", expression: "happy" },
      { field: "1. Invoice Details", title: "Invoice number", text: "The invoice number is given automatically.", expression: "focused", side: "right" },
      { field: "2. Customer Details", title: "Customer", text: "Who's billed and their GST number.", expression: "curious", side: "right" },
      { field: "4. Service Details", title: "Services", text: "One line per service with its SAC code, quantity and rate. Add Service adds another line.", expression: "determined", side: "right" },
      { field: "7. Amount Details", title: "Totals", text: "GST and the total, worked out for you, with the amount in words.", expression: "sparkle", side: "right" },
    ],
  },
  "maintenance-record": {
    title: "the maintenance record",
    steps: [
      { title: "Recording maintenance", text: "One visit to the workshop for this truck: it can cover several repairs, each with its own cost and vendor.", expression: "happy" },
      { target: "maintenance-cost-known", orCentered: true, title: "No bill yet?", text: "If you don't know the cost yet, pick \"Not yet\". The job is saved to the truck's Scheduled Records with today's details; add the costs there when the bill comes. Nothing is counted until then, and once approved it lands on its start date, so that day's P&L stays right.", expression: "curious", side: "bottom" },
      { field: "Odometer (km)", title: "Odometer", text: "The reading when the work was done. The truck's current odometer is shown above, for reference.", expression: "focused", side: "right" },
      { field: "Maintenance Type", title: "What was done", text: "The type of work, then tick every repair that was done. Each one you tick gets its own card below.", expression: "curious", side: "right" },
      { target: "maintenance-repairs", title: "One card per repair", text: "Each repair has its own cost (required), location, who did it (a vendor or an individual) and their invoice, since different garages may have done different jobs. If one garage did everything on one bill, tick \"Same vendor & invoice for all\".", expression: "determined", side: "right" },
      { target: "maintenance-total", title: "The total", text: "Every repair's cost added up. This is what the truck's record, its running cost and Profitability use.", expression: "sparkle", side: "top" },
      { field: "Remarks", title: "Remarks", text: "A short note on the work. Required.", expression: "calm", side: "right" },
      { title: "After you save", text: "New records go to Maintenance Approvals and join the truck's record once Admin or Accounts approves them. You can also set a reminder for the next service.", expression: "wink" },
    ],
  },
  "scheduled-records": {
    title: "Scheduled Records",
    steps: [
      { title: "Waiting for a cost", text: "Maintenance saved before its bill came in. None of it is in the truck's records, running cost or P&L yet.", expression: "happy" },
      { target: "scheduled-list", orCentered: true, title: "Each job", text: "When the work was done, the repairs, who did it, and how long it has been waiting. After 7 days the person who scheduled it gets a reminder in the bell, and the Recap Report flags it.", expression: "focused", side: "right" },
      { target: "scheduled-add-costs", orCentered: true, title: "Add costs", text: "Opens the form filled in; enter every repair's cost (and the invoice, if you have it). It then goes to Maintenance Approvals and, once approved, counts on its original start date.", expression: "determined", side: "left" },
      { title: "Remove", text: "A job entered by mistake can be removed by the person who scheduled it, or by Admin.", expression: "wink" },
    ],
  },
  "add-truck": {
    title: "the truck form",
    steps: [
      { title: "Adding a truck", text: "The truck's details, its tyre layout and its documents.", expression: "happy" },
      { field: "Vehicle Images", title: "Photos", text: "Photos of the truck, so it's easy to recognise.", expression: "curious", side: "right" },
      { field: "Choose the Tyre Layout", title: "Tyre layout", text: "How many tyres and where. Tyre Management uses this layout for fitting tyres.", expression: "focused", side: "right" },
      { field: "RC Details", title: "Documents", text: "RC, FC, road tax, insurance, permits and pollution certificate, each with its expiry date and a copy. Expiry dates drive the compliance alerts.", expression: "determined", side: "right" },
      { title: "After you save", text: "Documents are only entered here when the truck is added. Later renewals happen in Compliance & Renewals, so their history is kept.", expression: "wink" },
    ],
  },
  "leave-request": {
    title: "the leave request",
    steps: [
      { field: "From Date", title: "Dates", text: "The first and last day you'll be away.", expression: "focused", side: "right" },
      { field: "Reason (Optional)", title: "Reason", text: "A short reason helps it get approved quickly.", expression: "calm", side: "right" },
      { title: "After you send", text: "Admin is told straight away. You'll see the decision in Leave Requests and in your notifications.", expression: "wink" },
    ],
  },
  "booking-sheet": {
    title: "the booking sheet",
    steps: [
      { title: "Editing a booking sheet", text: "Two parts: the trip as it was booked, and the closure figures entered when the trip was closed.", expression: "happy" },
      { field: "Booking Information", title: "The booking", text: "Everything from the Assign Trip form. It's shown for reference and can't be changed here.", expression: "focused", side: "right" },
      { field: "Closure — Billing", title: "Closure: billing", text: "Who's billed and the final amounts. These are the figures you can correct.", expression: "determined", side: "right" },
      { field: "Closure — Halt Information", title: "Closure: halt", text: "Days the truck waited at the customer, and the halt amounts.", expression: "focused", side: "right" },
      { title: "After you save", text: "The change is recorded in the trip's Edit History. Accounts verifies and invoices from these figures.", expression: "wink" },
    ],
  },
  "combined-invoice": {
    title: "the combined invoice",
    steps: [
      { title: "One invoice, several trips", text: "The trips you ticked go on one invoice. Most of it fills in from those trips.", expression: "happy" },
      { field: "Invoice Type", title: "Invoice type", text: "Tax Invoice or Bill of Supply. For a Tax Invoice, choose GST or IGST under Tax Details first.", expression: "determined", side: "right" },
      { field: "Tax Details", title: "Tax", text: "GST or IGST, depending on where the customer is.", expression: "focused", side: "right" },
      { field: "Invoice Details", title: "Invoice details", text: "The invoice number is given automatically; check the date, customer and containers.", expression: "focused", side: "right" },
      { field: "Amount Details", title: "Totals", text: "The services, tax and total for all the trips, with the amount in words.", expression: "sparkle", side: "right" },
    ],
  },
  "driver-form": {
    title: "the driver form",
    steps: [
      { title: "A driver's record", text: "Personal details, licence, bank account and their login.", expression: "happy" },
      { field: "License Number", title: "Licence", text: "The licence number and expiry date. Attach a copy of the licence lower down.", expression: "determined", side: "right" },
      { field: "Bank Account Details", title: "Bank account", text: "Where salary and advances are paid.", expression: "focused", side: "right" },
      { field: "Software Credentials", title: "Login", text: "The driver's username and password for the app. The username fills in from the email.", expression: "curious", side: "right" },
      { title: "Documents", text: "Aadhaar and licence copies (PDF, up to 25 MB) and a photo.", expression: "calm" },
    ],
  },
  "staff-form": {
    title: "the staff form",
    steps: [
      { title: "A staff member", text: "Their details, photos and login.", expression: "happy" },
      { field: "Preferred name (optional)", title: "What to call them", text: "The name Joshine and the dashboard greet them by. Leave it empty and it's worked out from the full name, skipping initials: \"D. MANUEL JEBARSON\" becomes Manuel. Fill it in when they go by something else.", expression: "curious", side: "right" },
      { field: "Software Designation", title: "Software role", text: "Decides which pages they see and what they can do. Choose carefully: Admin can do everything.", expression: "determined", side: "right" },
      { field: "Software Credentials", title: "Login", text: "Username and password. The username fills in from the email.", expression: "curious", side: "right" },
      { title: "Documents", text: "A photo, a passport-size identity photo and the Aadhaar card.", expression: "calm" },
    ],
  },
  "emi-form": {
    title: "the EMI entry",
    steps: [
      { title: "Recording a loan", text: "One loan or EMI, usually for a truck.", expression: "happy" },
      { field: "Truck Registration Number", title: "Which truck", text: "The truck the loan is for. Its EMI then counts in that truck's running cost.", expression: "focused", side: "right" },
      { field: "EMI Start Date", title: "Dates and amount", text: "The EMI amount, start and end dates. The tenure and what's left work themselves out.", expression: "determined", side: "right" },
      { field: "Daily Finance Cost", title: "Worked out for you", text: "Daily cost and cost per km, used by the Running Cost Calculator.", expression: "sparkle", side: "right" },
      { field: "Auto-Debit Date (Day of Month)", title: "Debit day", text: "The day of the month the bank takes the EMI, so overdue ones can be spotted.", expression: "calm", side: "right" },
    ],
  },
  "tyre-form": {
    title: "the tyre form",
    steps: [
      { title: "Adding a tyre", text: "One tyre bought for the fleet.", expression: "happy" },
      { field: "Tyre Number", title: "Tyre number", text: "The number moulded on the tyre, so it can be tracked from truck to truck.", expression: "focused", side: "right" },
      { field: "Purchase Cost (₹)", title: "Cost and range", text: "What it cost and how far it should last. The cost per km is worked out from these.", expression: "determined", side: "right" },
      { field: "Retread Count", title: "Retreads", text: "How many times it has been retreaded so far: 0 for a new tyre.", expression: "curious", side: "right" },
    ],
  },
  "customer-form": {
    title: "the customer form",
    steps: [
      { field: "Customer Name", title: "The customer", text: "Name, GSTIN and who to contact.", expression: "happy", side: "right" },
      { field: "Customer Type", title: "Customer type", text: "Transports or Shipping.", expression: "focused", side: "right" },
      { field: "Is GTA (Goods Transport Agent)?", title: "Tax settings", text: "Whether they're a GTA and need e-invoices. These affect the GST on their invoices.", expression: "determined", side: "right" },
    ],
  },
  "destination-form": {
    title: "the destination form",
    steps: [
      { field: "Customer Name", title: "The customer", text: "Whose route this is.", expression: "happy", side: "right" },
      { field: "Origin State", title: "From and to", text: "Where the trip starts and ends. The Assign Trip form offers this route for this customer.", expression: "focused", side: "right" },
      { field: "Approx Distance (In KM)", title: "Distance", text: "The usual distance. It fills in the approximate km when this route is picked for a trip.", expression: "determined", side: "right" },
      { field: "Cargo Classification", title: "Cargo", text: "The usual cargo, container type and weight on this route.", expression: "curious", side: "right" },
    ],
  },
  "vendor-form": {
    title: "the vendor form",
    steps: [
      { field: "Vendor Category", title: "Category", text: "What they do, such as tyres or electrical, so they show up in the right places.", expression: "focused", side: "right" },
      { field: "GSTIN", title: "Tax details", text: "GSTIN and PAN, for their bills.", expression: "calm", side: "right" },
    ],
  },
  "adblue-log": {
    title: "the AdBlue log",
    steps: [
      { field: "Odometer Reading", title: "Odometer", text: "The reading at the fill. It must be past the previous fill's reading.", expression: "determined", side: "right" },
      { field: "Quantity (Litres)", title: "Litres and price", text: "Litres and price per litre; the total works itself out.", expression: "focused", side: "right" },
      { field: "Reason for edit", title: "Why the change", text: "Your change goes to Admin with this reason and is applied once approved.", expression: "calm", side: "right" },
    ],
  },
  "fuel-log": {
    title: "the fuel log",
    steps: [
      { field: "Odometer Reading", title: "Odometer", text: "The reading at the fill. Mileage is worked out from the distance between fills.", expression: "determined", side: "right" },
      { field: "Cost Per Litre (₹)", title: "Price and total", text: "Price per litre and the total paid.", expression: "focused", side: "right" },
    ],
  },
  "pricing-form": {
    title: "the pricing form",
    steps: [
      { field: "Route", title: "Customer and route", text: "Pick the customer and one of their routes. If two routes share a name, confirm which one.", expression: "focused", side: "right" },
      { field: "Hire Amount", title: "Hire and commission", text: "What you charge for this route, and any commission. The Assign Trip form fills these in for the trip.", expression: "determined", side: "right" },
    ],
  },
  "final-pricing-form": {
    title: "the final pricing",
    steps: [
      { field: "Route", title: "Customer and route", text: "Pick the customer and one of their routes.", expression: "focused", side: "right" },
      { field: "Hire Amount as per Accounts (₹)", title: "Hire as per Accounts", text: "The amount invoices are made from, as agreed with the customer.", expression: "determined", side: "right" },
    ],
  },
  "payment-form": {
    title: "the payment",
    steps: [
      { field: "Amount", title: "Amount and date", text: "How much was paid, and when.", expression: "focused", side: "right" },
      { field: "Trip Number", title: "Which trip", text: "The trip this payment belongs to.", expression: "curious", side: "right" },
      { field: "Note", title: "Note", text: "Anything worth remembering about the payment.", expression: "calm", side: "right" },
    ],
  },
};

/** The tour for a form, by its Dialog `tour` id. */
export function formTourFor(id: string | null): Tour | null {
  if (!id) return null;
  const t = FORM_TOURS[id];
  return t ? { id: `form:${id}`, title: t.title, steps: t.steps } : null;
}
