# Canaan ERP: Complete System Walkthrough

**For:** Client Overview
**Prepared by:** Canaan Development Team
**Last updated:** July 2026

---

## What Is This System?

**Canaan ERP** is a purpose-built business management platform for a fleet logistics company. It handles the complete lifecycle of every trip. It starts from the moment a booking is created and goes all the way through driver assignment, on-road updates, financial settlement, and final invoicing.

It also manages everything the business runs on: trucks, drivers, staff, customers, vendors, tyres, fuel, finances, and compliance documents.

The entire system runs securely in a web browser. Staff log in with a username and password, and each person only sees the parts of the system relevant to their role. Nothing more, nothing less.

---

## Who Uses the System?

There are **6 roles** in the system. Each role has its own login and its own set of pages.

| Role | What They Do |
|---|---|
| **Admin** | Full access to everything. Manages staff accounts, approves requests, oversees all operations. |
| **Fleet Manager** | Manages trips from assignment through completion. Assigns drivers and trucks. |
| **Finance Manager** | Handles financial settlement and invoicing of completed trips. Tracks EMI and compliance. |
| **Tyre Manager** | Manages tyre stock, fitment, and vehicle tyre records. |
| **Yard Staff** | Receives physical trip sheets from drivers and marks them as delivered in the system. |
| **Trip Sheet Register** | Confirms receipt of physical trip sheets and enters the trip sheet data for reconciliation. |

> The Admin can always see and do everything that any other role can do.

---

## Login Credentials

Use the credentials below to log in. Open the system in a web browser and enter your assigned username and password.

| Role | Name | Username | Password |
|---|---|---|---|
| Admin | | | |
| Fleet Manager | | | |
| Finance Manager | | | |
| Tyre Manager | | | |
| Yard Staff | | | |
| Trip Sheet Register | | | |

> **Keep these credentials private.** Do not share your username and password with anyone else. If you forget your password, contact the Admin.

---

## How a Trip Works: The Full Journey

Every trip goes through a clear, step-by-step process. Here is what happens from start to finish.

---

### Step 1: Trip Booking Created
**Who:** Fleet Manager / Admin
**Where:** Assign Trips page

A new trip is created in the system with all the booking details:
- Booking reference number
- Customer name
- Origin and destination
- Container details (number, type, shipping line)
- Cargo weight and classification
- Scheduled date
- Payment type and billing details

The trip is now in **"Assigned"** status.

---

### Step 2: Driver Assigned to the Trip
**Who:** Fleet Manager / Admin
**Where:** Assign Drivers page

Before the driver can start, a driver and truck must be linked to the trip. The Fleet Manager checks which drivers are available (not already on another trip), selects one, and assigns them. The truck registration is also confirmed here.

---

### Step 3: Trip in Progress (Live Tracking)
**Who:** Fleet Manager / Admin
**Where:** Current Trips page

Once the trip starts, the Fleet Manager updates the trip status as the driver moves through each stage:

| Status | Meaning |
|---|---|
| **Assigned** | Booking created, driver assigned |
| **Started** | Driver has left |
| **Loaded** | Cargo has been loaded |
| **On-Transit** | Vehicle is on the road |
| **Reached** | Vehicle has reached the destination |
| **Unloaded** | Cargo has been unloaded |
| **Completed** | Trip is operationally done |

---

### Step 4: Trip Closure (Booking Sheet)
**Who:** Fleet Manager / Admin
**Where:** Completed Trips page

Once a trip is marked Completed, the Fleet Manager fills in the **Trip Closure / Booking Sheet**. This is the internal financial summary of what happened on the trip:

- Actual hire amount, transport amount, and billing amount
- Driver advance paid
- Halt days (company-side and party-side)
- Payment mode (Cash, UPI, Bank Transfer, etc.)
- Whom the trip is billed to (Customer / Consignee / Self)

This is saved as the **Booking Sheet** for the trip.

---

### Step 5: Physical Trip Sheet Collected
**Who:** Yard Staff
**Where:** Sheet Collection page

When the driver returns, they hand over a **physical trip sheet** (a paper document filled out during the trip). The Yard Staff receives this document and marks it as "Delivered" in the system, one trip at a time, or many at once using the multi-select feature.

The system records the exact date and time of collection (in Indian Standard Time).

> **Important:** A trip only moves to reconciliation **after** the physical sheet has been marked as delivered here. If the sheet is marked delivered but was never actually received, the Trip Sheet Register in reconciliation can click "Mark as Not Received", and the Admin is alerted instantly with a notification.

---

### Step 6: Trip Sheet Received & Reconciliation
**Who:** Trip Sheet Register
**Where:** Trip Reconciliation page

The Trip Sheet Register sees only the trips whose physical sheets have been marked delivered by the Yard Staff. For each trip there are two simple buttons:

- **Mark as Received**: confirms the physical sheet actually arrived at their desk
- **Mark as Not Received**: reports that the sheet never arrived (this instantly alerts the Admin and Fleet Manager)

Only after clicking **Mark as Received** can the trip sheet data be entered. With this two-step hand-off, where the Yard Staff delivers it and the Trip Sheet Register receives it, every physical document is accounted for by two different people.

Once received, they enter the detailed **Trip Sheet data** for the trip:

- Trip sheet number and date
- Start and end odometer readings (total KM)
- Driver pay, driver advance, and driver balance
- All trip expenses: halt pay, port pass, weight sheet, toll charges, fuel, spare parts, crane charges, parking, puncture, and other miscellaneous costs
- Total expense summary

This reconciliation sheet becomes the master cost record for the trip.

---

### Step 7: Trip Verification
**Who:** Admin
**Where:** Trip Verification page

Once the trip sheet is entered, the Admin reviews everything. They can either:

- ✅ **Verify** the trip when everything looks correct
- 🚩 **Flag** the trip when something needs to be checked or corrected

Only verified trips move forward to finalization.

---

### Step 8: Trip Finalization & Invoice
**Who:** Finance Manager / Admin
**Where:** Trip Finalization page

The Finance Manager does the final financial step:
- Reviews the booking sheet and trip sheet together
- Generates a **Trip Invoice** with a sequential invoice number
- Marks the trip as invoiced

Once invoiced, the trip is fully closed financially.

---

### Step 9: Trip History
**Who:** Admin, Finance Manager
**Where:** Trip History page

Every completed trip lives permanently in the history log. Staff can search, filter, and download:
- The full trip details
- The booking sheet (closure document)
- The trip sheet (reconciliation document)
- The invoice

Nothing is ever deleted from history.

---

## Notifications: What the Bell Icon Shows

The notification bell in the top bar keeps everyone informed in real time. It updates automatically the moment something changes, so there is no need to refresh the page.

### Admin sees:
- **Trip Sheet Alerts**: when a trip sheet was marked "delivered" but never arrived in reconciliation (someone flagged it as not received)
- **Renewals & Payments**: vehicles and driver documents expiring within 30 days; EMI payments and recurring bills due within 7 days
- **Leave Requests**: pending leave applications from drivers and staff
- **Edit Requests**: staff asking permission to edit a locked record

### Fleet Manager sees:
- **Trip Sheet Alerts**: same as Admin
- **Renewals & Payments**: vehicle and driver document expiries

### Trip Sheet Register sees:
- **Edit Access Approved**: confirmation when the Admin has approved their edit request

Notifications are saved in the system. Even if the Admin is logged out when a trip sheet alert is raised, they will see it the next time they log in.

---

## Global Search: Find a Truck's Trips Instantly

The search bar at the top of every screen works across the whole application:

- Type a **truck number** (registration number), trip ID, or booking reference and press Enter
- The system takes you straight to your role's main trips page, already filtered to what you searched
- If you are already on a trips page, the list filters **live as you type**

Every trip page (Current Trips, Completed Trips, History, Reconciliation, Sheet Collection, and more) supports searching by truck number. Answering "where are the trips for this truck?" takes just one search from anywhere.

---

## All Pages: What Each One Does

### Dashboard (`/`)
The home screen. Shows a live summary of the business: how many trips are active, how many trucks are running, driver count, and quick-access cards for the most common actions. Each role sees a dashboard tailored to their work.

The Admin and Fleet Manager dashboards also include a **Trip Sheet Tracking** panel showing, in real time:
- How many sheets have been **Delivered by the Yard Staff** (and which trips)
- How many sheets have been **Received by the Trip Sheet Register** (and which trips)
- A warning line if any sheet was delivered but not yet confirmed received

Once the trip sheet data is entered for a trip, it drops off this panel automatically. The panel only tracks the physical hand-over.

---

### P&L Summary (`/insights/pl-summary`)
**Who:** Admin, Finance Manager

A profit and loss report that pulls together income (hire amounts from invoiced trips) against costs (driver pay, fuel, maintenance, EMI, recurring payments) over any date range. Gives the business a clear financial picture.

---

### Attendance: Drivers (`/attendance/drivers`)
**Who:** Admin, Fleet Manager

Mark daily attendance for each driver: Present, Absent, On Leave, or Not Marked. Records are saved by date so attendance history is always available.

---

### Attendance: Staff (`/attendance/staff`)
**Who:** Admin

Same as above, but for office staff.

---

### Attendance Report (`/attendance/report`)
**Who:** Admin

A summary report showing attendance statistics for all staff and drivers across any selected date range.

---

### Leave Requests (`/attendance/leave-requests`)
**Who:** All roles (for themselves)

Any driver or staff member can submit a leave application by specifying the dates, reason, and leave type. Once submitted, a notification goes to the Admin instantly.

---

### Leave Approvals (`/attendance/leave-approvals`)
**Who:** Admin

The Admin sees all pending leave requests and approves or rejects them. The outcome is saved to the employee's record.

---

### Edit Approvals (`/attendance/edit-approvals`)
**Who:** Admin (reviews), Trip Sheet Register (requests)

Some records are locked after they are saved to prevent accidental changes. If a Trip Sheet Register needs to correct something, they submit an edit request explaining what they want to change. The Admin sees this as a notification and can approve it, which grants a 1-hour edit window for that specific record.

---

### Assign Drivers (`/trips/assign-drivers`)
**Who:** Fleet Manager, Admin

Shows all active drivers and which trips they are currently assigned to. Used to manage driver availability before assigning new trips.

---

### Assign Trips (`/trips/assign`)
**Who:** Fleet Manager, Admin

Where new trips are created. The full booking form is filled in here. Existing trips can also be edited from this page.

---

### Current Trips (`/trips/current`)
**Who:** Fleet Manager, Admin

Live view of all trips that are in progress (from Assigned to Completed). The Fleet Manager updates the status as the trip moves through each stage. The Booking Sheet (Trip Closure) is also filled in here once the trip reaches "Completed."

---

### Completed Trips (`/trips/completed`)
**Who:** Fleet Manager, Admin

All trips that have reached "Completed" status but have not yet moved through reconciliation and invoicing. Booking sheets can be reviewed and edited here.

---

### Sheet Collection (`/trips/sheet-collection`)
**Who:** Yard Staff

This is the **only page the Yard Staff uses**. It is their dedicated workspace. When a driver returns from a trip and hands in the physical trip sheet (the paper document filled out on the road), the Yard Staff opens this page and marks that trip's sheet as "Delivered."

Key features:
- **Search by truck number**: type a truck's registration number to instantly find its trips
- Shows all completed trips waiting for their physical sheet to be received, with each truck's registration number visible
- Each trip can be marked delivered one at a time, or many trips can be selected together and marked in bulk using the multi-select checkboxes
- Once marked, the system records the exact date and time of delivery in Indian Standard Time (IST)
- If a sheet has already been submitted into reconciliation, the row is **locked** and cannot be undone. This prevents accidental changes to settled records
- A **stats bar** at the top shows at a glance: total completed trips, how many sheets have been delivered, and how many are still pending

> **What happens next:** Once the Yard Staff marks a sheet as delivered, it immediately becomes visible to the Trip Sheet Register in Trip Reconciliation. Nothing reaches reconciliation without going through this step first. This is the quality gate that ensures only physically received documents are processed.

---

### Trip Reconciliation (`/trips/reconciliation`)
**Who:** Trip Sheet Register

Shows only trips whose physical sheets have been marked delivered by the Yard Staff. For each trip:

- **Mark as Received** confirms the physical sheet arrived. Only then can the trip sheet data be entered
- **Mark as Not Received** sends an instant alert to the Admin and Fleet Manager if a sheet was marked delivered but never actually arrived

After confirming receipt, the Trip Sheet Register enters the detailed trip sheet data (expenses, KM, driver settlement) here. Trips can be searched by truck number.

---

### Trip Verification (`/trips/verification`)
**Who:** Admin

The Admin reviews completed reconciliation sheets and marks them as Verified (ready for invoicing) or Flagged (needs re-check).

---

### Trip Finalization (`/trips/finalization`)
**Who:** Finance Manager, Admin

Verified trips land here. The Finance Manager generates the official invoice, assigns an invoice number, and marks the trip as invoiced. The trip is now fully closed.

---

### Trip History (`/trips/history`)
**Who:** Admin, Finance Manager

Permanent archive of all trips. Searchable and filterable. Every document (booking sheet, trip sheet, invoice) is downloadable.

---

### Our Staff (`/resources/staff`)
**Who:** Admin

Complete staff directory. Add new staff, update details, set their software role (which controls what they can see in the system), upload profile photos and ID documents, and manage login credentials.

---

### Our Drivers (`/resources/drivers`)
**Who:** Admin, Fleet Manager

Complete driver directory. Add and manage driver profiles including license details, license expiry date, contact information, Aadhaar, and joining date.

---

### Our Fleet (`/resources/fleet`)
**Who:** Admin, Fleet Manager

Full list of all trucks in the fleet. Add new vehicles, track registration numbers, model details, and basic specifications.

---

### Our Customers (`/resources/customers`)
**Who:** Admin

Customer master data: company names, contact details, billing information, GST numbers, default origins and destinations for that customer, and pricing agreements.

---

### Our Vendors (`/resources/vendors`)
**Who:** Admin

Vendor master data: all third-party service providers and suppliers the company works with.

---

### Truck Maintenance (`/maintenance/trucks`)
**Who:** Admin, Tyre Manager

Logs all maintenance work done on each truck: service dates, type of repair, cost, and the workshop/vendor who did the work. Gives a full service history per vehicle.

---

### Tyre Management (`/maintenance/tyre-management`)
**Who:** Tyre Manager, Admin

Manages which tyre is fitted to which position on which truck. Records fitment and removal dates, KM readings, and tyre condition. Tracks the full life of each tyre across vehicles.

---

### Tyre Inventory (`/maintenance/tyre-inventory`)
**Who:** Tyre Manager, Admin

Stock list of all tyres owned by the company, whether new, in-use, or worn out. Tracks tyre IDs, brand, size, and current status.

---

### Fuel History (`/maintenance/fuel-history`)
**Who:** Admin, Trip Sheet Register

Logs every fuel fill-up for every truck: date, quantity (litres), cost, and odometer reading. Used to track fuel efficiency and cost per KM.

---

### Compliance & Renewals (`/maintenance/compliance`)
**Who:** Admin, Finance Manager

A dashboard of all vehicle compliance documents and their expiry dates:
- Insurance
- Fitness Certificate (FC)
- RC Validity
- Road Tax
- National Permit
- Local Permit
- Pollution Certificate (PUC)

Documents expiring within 30 days are highlighted. The Admin also receives a bell notification automatically.

---

### Driver Compensation (`/finance/driver-compensation`)
**Who:** Finance Manager, Admin

Records driver salary payments and advance payments. Maintains a running ledger for each driver showing what has been paid and what is outstanding.

---

### Staff Compensation (`/finance/staff-compensation`)
**Who:** Finance Manager, Admin

Same as Driver Compensation, but for office staff members.

---

### EMI Tracking (`/finance/emi-tracking`)
**Who:** Finance Manager, Admin

Manages all vehicle loan EMIs. Stores loan details (bank, loan number, amount, tenure, monthly EMI) for each truck. The system automatically alerts the Admin when an EMI payment date is coming up within 7 days.

Also includes **Recurring Payments**, monthly, quarterly, or yearly bills like insurance premiums, annual subscriptions, or fixed service contracts. These also trigger 7-day due alerts.

---

### Branch Management (`/admin/branches`)
**Who:** Admin

Create and manage office branches. Branch names are used across the system when assigning staff to locations.

---

### Repairs Management (`/admin/repairs`)
**Who:** Admin

Maintain a master list of standard repair types used across maintenance records, so data entry is consistent.

---

### SAC Code Management (`/admin/sac-codes`)
**Who:** Admin

Manage the SAC (Services Accounting Code) codes used in invoices for GST compliance.

---

## Security: How the System Stays Safe

- **Every user must log in** with a username and password to access the system. There are no public pages.
- **Passwords are never stored in plain text**: they are encrypted using industry-standard hashing.
- **Sessions expire after 12 hours**: each login session is valid for 12 hours. After that, the system will automatically log the user out and ask them to sign in again. This means staff who log in at the start of their shift will stay logged in for the full working day without interruption.
- **Role-based access**: the system enforces at both the screen level (menus) and the server level (API) that users can only access what their role permits. A Trip Sheet Register user cannot reach a Finance page even if they type the URL directly.
- **5-attempt login lockout**: if someone enters the wrong password 5 times for an account, that account is locked out for 15 minutes.
- **Per-tab sessions**: each browser tab maintains its own independent login session. Two different users can be logged in simultaneously in two tabs on the same computer without interfering with each other.
- **Edit locking**: certain records are locked after submission. Changes require an explicit approval from the Admin, creating an audit trail.

---

## Summary: The Business Value

| Area | What the System Solves |
|---|---|
| **Trip Operations** | Complete end-to-end trip lifecycle from booking to invoice, with clear accountability at every step |
| **Financial Accuracy** | Trip sheets, closures, and invoices are cross-checked in three separate steps before money moves |
| **Fleet Health** | Every truck's documents, maintenance history, fuel logs, and tyres are tracked in one place |
| **Compliance** | The system proactively alerts the team 30 days before any document expires, so there are no surprises |
| **EMI & Payments** | Loan and recurring payment due dates trigger automatic reminders 7 days in advance |
| **People Management** | Attendance, leave, and compensation for all drivers and staff managed centrally |
| **Access Control** | Every action is tied to a logged-in user with a specific role, no unauthorised changes |
| **Real-Time Awareness** | The notification bell updates live across the whole team, so nobody has to ask "has it been done yet?" |
