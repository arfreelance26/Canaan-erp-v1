# Canaan ERP: Complete System Walkthrough

**For:** Client Overview
**Prepared by:** Canaan Development Team
**Last updated:** August 2026

---

## What Is This System?

**Canaan ERP** is a purpose-built business management platform for a fleet logistics company. It handles the complete lifecycle of every trip — starting from the moment a booking is created, all the way through driver assignment, on-road updates, trip-sheet reconciliation, accounts verification, and final invoicing.

It also manages everything the business runs on: trucks, drivers, staff, customers, vendors, tyres, fuel, AdBlue, finances, EMIs, and compliance documents.

The entire system runs securely in a web browser. Staff log in with a username and password, and each person only sees the parts of the system relevant to their role — nothing more, nothing less.

---

## Who Uses the System?

There are **7 roles** in the system. Each role has its own login and its own set of pages. Each role maps to a real person (or people) in the business.

| Role in System | Real Person | What They Do |
|---|---|---|
| **Admin** | Sir / Owner | Full access to everything. Manages staff accounts, approves requests, oversees all operations, views the security log. |
| **Commercial Manager** | Kumar | Creates and assigns trips, assigns drivers and trucks, updates trip progress, manages customers. |
| **Assistant Commercial Manager** | Shibu | Same access as the Commercial Manager, plus per-trip Profit & Loss and Mileage, and the ability to update truck master data. |
| **Accounts** | Sunder, Thanamani | Verifies completed trip sheets, generates invoices, and manages finance and compliance. |
| **Maintenance** | Jebarson | Manages truck maintenance, tyre stock, tyre fitment, and vehicle records. |
| **Trip Sheet Register (Docs)** | Latha, Siva | Confirms receipt of physical trip sheets and enters the trip-sheet data for reconciliation. |
| **Yard Supervisor** | Antony | Collects physical trip sheets from drivers and verifies the advance paid to each driver. |

> The Admin can always see and do everything that any other role can do.

---

## Login Credentials

Use the credentials below to log in. Open the system in a web browser and enter your assigned username and password.

| Role | Name | Username | Password |
|---|---|---|---|
| Admin | | | |
| Commercial Manager | | | |
| Assistant Commercial Manager | | | |
| Accounts | | | |
| Maintenance | | | |
| Trip Sheet Register | | | |
| Yard Supervisor | | | |

> **Keep these credentials private.** Do not share your username and password with anyone else. If you forget your password, contact the Admin.

---

## How a Trip Works: The Full Journey

Every trip goes through a clear, step-by-step process, with a different person responsible at each stage. This built-in hand-off means every trip is checked by several people before any money moves. Here is what happens from start to finish.

---

### Step 1: Trip Booking Created and Assigned

**Who:** Commercial Manager / Admin
**Where:** Assign Trips page

A new trip is created in the system with all the booking details:

- Booking reference number
- Customer name (or "Self / CGI" for the company's own cargo)
- Origin and destination — chosen from ready-made dropdown lists, not free typing
- Container details: number, type, shipping line
- Cargo weight and classification
- Scheduled date
- Payment type and billing details
- Approximate distance (KM) for the trip

The system applies several built-in rules automatically to prevent mistakes:

- **Container number check:** every container number must be exactly 4 letters followed by 7 numbers (for example, `ABCD1234567`). Anything else is rejected.
- **"Self / CGI" bookings:** when the company is carrying its own cargo, billing is switched off, payment is fixed to "Credit", the invoice type is fixed to "Transport Memo" (no GST), and the clearing agent is auto-filled as "CGI".
- **Trip date:** if a booking is created for today, the trip date automatically defaults to tomorrow (still changeable if needed).
- **Hire amount:** locked after entry for all trip types except "Return" and "Open Load", so the agreed amount cannot be changed by accident.
- **Lift-on amount:** filled automatically for standard trips, entered manually for Shifting/Empty/Open trips, and fixed at zero for Coastal trips.

The trip is now in **"Assigned"** status. Before the driver can start, a driver and truck are linked to the trip on the **Assign Drivers** page — the Commercial Manager picks from drivers who are not already on another trip.

Once assigned, the booking becomes visible on **every** user's dashboard with its live status, and stays visible until invoicing is complete.

---

### Step 2: Trip in Progress (Live Status)

**Who:** Commercial Manager / Admin
**Where:** Current Trips page

As the driver moves through the journey, the Commercial Manager updates the trip status:

| Status | Meaning |
|---|---|
| **Assigned** | Booking created, driver assigned |
| **Started** | Driver has left |
| **Loaded** | Cargo has been loaded |
| **On-Transit** | Vehicle is on the road |
| **Reached** | Vehicle has reached the destination |
| **Unloaded** | Cargo has been unloaded |
| **Completed** | Trip is operationally done |

When the trip reaches **Completed**, the Commercial Manager fills in the **Trip Closure / Booking Sheet** — the internal financial summary of the trip: actual hire amount, transport amount, billing amount, driver advance paid, halt days (company-side and party-side), payment mode, and whom the trip is billed to. This is saved as the **Booking Sheet** for the trip.

---

### Step 3: Physical Trip Sheet Collected

**Who:** Yard Supervisor
**Where:** Sheet Collection page

When the driver returns, they hand over a **physical trip sheet** (a paper document filled out during the trip). The Yard Supervisor receives this document and marks it as "Delivered" in the system — one trip at a time, or many at once using the multi-select feature.

The Yard Supervisor also does an important cross-check here:

- **Advance verification:** for each trip, the advance amount paid to the driver is shown. The Yard Supervisor confirms it is correct (tick) or incorrect (cross). If incorrect, they enter a remark and the correct amount. This is saved and visible to the Admin.

The system records the exact date and time of collection (in Indian Standard Time). The column order on this screen is standardised as Vehicle Number, Driver, Container Number, From, To. Table headers stay frozen while scrolling, and results are shown 10 per page.

> **Important:** A trip only moves to reconciliation **after** the physical sheet has been marked delivered here. If a received sheet has not been entered by the Docs team within one day, the Yard Supervisor's screen shows a reminder popup.

---

### Step 4: Trip Sheet Received & Reconciliation

**Who:** Trip Sheet Register (Docs — Latha, Siva)
**Where:** Trip Reconciliation page

The Docs team sees only the trips whose physical sheets have been marked delivered by the Yard Supervisor. For each trip there are two simple actions:

- **Mark as Received:** confirms the physical sheet actually arrived at their desk.
- **Mark as Not Received:** reports that the sheet never arrived (this instantly alerts the Admin and Commercial Manager).

With this two-step hand-off — the Yard Supervisor delivers it and the Docs team receives it — every physical document is accounted for by two different people.

Only after **Mark as Received** can the trip-sheet data be entered. The entry date is set automatically to today and cannot be back-dated. The Docs team then enters:

- Trip sheet number and date
- Start and end odometer readings (total KM)
- Driver pay, driver advance, and driver balance
- All trip expenses: halt pay, port pass, weight sheet, mamool, traffic/RTO, lift-on/off, crane, parking, puncture, spare parts, toll, and other costs
- **Diesel entry:** litres, rate per litre, and total. This automatically copies into the vehicle's **Fuel Log**, so fuel data never has to be entered twice.

Two safeguards run automatically during entry:

- **Distance check:** if the total KM differs by more than 10% from the approximate distance the Commercial Manager set at booking, a popup requires the Docs team to type a remark before saving.
- **Flag for re-checking:** the Docs team can flag any trip to keep it pending if something needs verification before it is confirmed. Flagged trips are clearly marked and can be filtered.

If a correction is needed on a locked record, the Docs team sends an edit request to the Commercial Manager, who reviews and approves it before the change can be made.

This reconciliation sheet becomes the master cost record for the trip.

---

### Step 5: Accounts Verification

**Who:** Accounts (Sunder, Thanamani)
**Where:** Verification & Invoicing page

Once the trip sheet is entered, the Accounts team reviews everything and makes a simple decision per trip:

- **Verify (tick):** everything is correct — the trip proceeds to invoice generation.
- **Reject (cross):** something is wrong — a reason box opens, and the trip sheet is sent back to the Docs team with the reason clearly displayed.

When a rejected trip comes back, the Docs team can send an edit request to the Commercial Manager explaining the required change. Once the Commercial Manager approves, the Docs team edits the trip sheet and re-submits it for verification. This closes the loop so nothing is changed without the right approvals.

---

### Step 6: Invoice Generation

**Who:** Accounts (Sunder, Thanamani)
**Where:** Verification & Invoicing page

Once a trip is verified, Accounts generates the invoice. The system chooses the correct invoice type automatically, based on who is being billed:

| Billing Party | Invoice Type | GST |
|---|---|---|
| **Self (CGI)** | Transport Memo | No GST — shows freight and halt charges only |
| **Customer + GTA** | Bill of Supply | No GST — Accounts can add extra charges (weighment, lift-on, mamool, etc.) |
| **Customer + non-GTA** | Tax Invoice | With GST — Accounts choose which charges to include |

Key rules that protect financial accuracy:

- The **invoice date** is set automatically to today and cannot be back-dated.
- The **GST number** stays editable for the Accounts team.
- Charges are editable only for Open Load and Return Trip types.
- Each invoice type has its **own separate running number** — for example, Transport Memo `CGI{FY}/TM0001`, Bill of Supply `CGI{FY}/BS0001`, Tax Invoice `CGI{FY}/T0001`.

Accounts can also generate an **LR (Lorry Receipt / Consignment Note)** for any trip — a professionally formatted A4 document with all the trip, cargo, driver, and freight details, created straight from the trip record.

Once invoiced, the trip is fully closed financially.

---

### Step 7: Trip History

**Who:** Admin, Commercial Manager, Accounts
**Where:** Trip History page

Every completed trip lives permanently in the history log. Staff can search, filter, and download:

- The full trip details
- The booking sheet (closure document)
- The trip sheet (reconciliation document)
- The invoice and the LR

Nothing is ever deleted from history.

---

## Notifications: What the Bell Icon Shows

The notification bell in the top bar keeps everyone informed. It refreshes automatically, so there is no need to reload the page.

### Admin sees:
- **Trip Sheet Alerts:** when a sheet was marked "delivered" but reported as never arrived in reconciliation
- **Distance Alerts:** when a trip's actual KM differed by more than 10% from the estimate (with the remark the Docs team entered)
- **Renewals & Payments:** vehicle and driver documents nearing expiry; EMI payments and recurring bills due soon
- **Leave Requests:** pending leave applications from drivers and staff
- **Edit Requests:** staff asking permission to edit a locked record

### Commercial Manager sees:
- **Trip Sheet Alerts:** same as Admin
- **Edit Requests from Docs:** requests to change a trip sheet after an Accounts rejection, to approve or reject
- **Renewals & Payments:** vehicle and driver document expiries

### Trip Sheet Register (Docs) sees:
- **Edit Access Approved:** confirmation when the Commercial Manager has approved their edit request

Notifications are saved in the system. Even if the Admin is logged out when an alert is raised, they will see it the next time they log in.

---

## Global Search: Find a Truck's Trips Instantly

The search bar at the top of every screen works across the whole application:

- Type a **truck number** (registration number), trip ID, or booking reference and press Enter
- The system takes you straight to your role's main trips page, already filtered to what you searched
- If you are already on a trips page, the list filters **live as you type**

Every trip page supports searching by truck number, so answering "where are the trips for this truck?" takes just one search from anywhere.

---

## All Pages: What Each One Does

Pages are grouped into sections in the left-hand menu. Each user only sees the sections and pages their role allows.

### Overview

**Dashboard (`/`)** — The home screen. Shows a live summary of the business: active trips, trucks on the road, driver count, and quick-access cards. Each role sees a dashboard tailored to their work.

- **Clickable stat cards:** clicking a number (for example "12 Active Trips") opens the filtered trip list showing exactly those trips.
- **Active Bookings panel:** every role's dashboard shows all current bookings with their live status until invoicing is complete.
- The Admin and Commercial Manager dashboards also show a **Trip Sheet Tracking** panel: how many sheets have been delivered by the Yard Supervisor, how many received by the Docs team, and a warning if any sheet was delivered but not yet confirmed received. Once a trip sheet is entered, it drops off this panel automatically.
- **Compliance popups:** on login, the Admin and fleet screens show alerts for any vehicle document that is expired or expiring soon.

### Insights

**P&L Summary (`/insights/pl-summary`)** — *Admin, Accounts.* A profit-and-loss report that sets income (hire from invoiced trips) against costs (driver pay, fuel, maintenance, EMI, recurring payments) over any date range.

**Operating Cost Calculator (`/insights/operating-cost-calculator`)** — *Admin.* Works out the running cost per kilometre from fuel, tyre, finance, and maintenance figures.

### Trip and Driver Management

**Assign Drivers (`/trips/assign-drivers`)** — *Commercial Manager, Assistant Commercial Manager, Admin.* Shows all active drivers and which trips they are currently on, so availability is clear before assigning new trips.

**Assign Trips (`/trips/assign`)** — *Commercial Manager, Assistant Commercial Manager, Admin.* Where new trips are created and existing trips edited, using the full booking form with all the built-in checks described in Step 1.

**Current Trips (`/trips/current`)** — *Commercial Manager, Assistant Commercial Manager, Admin.* Live view of all in-progress trips. Status is updated here, and the Booking Sheet is filled in once a trip reaches "Completed."

**Completed Trips (`/trips/completed`)** — *Commercial Manager, Assistant Commercial Manager, Admin.* All trips that have reached "Completed" but not yet moved through reconciliation and invoicing. Booking sheets can be reviewed and edited here.

**Sheet Collection (`/trips/sheet-collection`)** — *Yard Supervisor.* The Yard Supervisor's dedicated workspace. Marks physical sheets as delivered (one at a time or in bulk), verifies the advance paid to each driver, and records the exact date and time of delivery. A stats bar shows total completed trips, sheets delivered, and sheets still pending. Sheets already submitted into reconciliation are locked to prevent accidental changes. Download by date range is available for reporting.

**Trip Reconciliation (`/trips/reconciliation`)** — *Trip Sheet Register (Docs).* Confirms receipt of the physical sheet, then enters the detailed trip-sheet data (KM, expenses, driver settlement, diesel). Includes the distance check, the diesel-to-fuel-log sync, and the flag-for-re-checking feature described in Step 4.

**Verification & Invoicing (`/trips/verification`)** — *Accounts.* Accounts verify or reject each trip sheet, and generate the correct invoice type once verified (Steps 5 and 6).

**Trip History (`/trips/history`)** — *Admin, Commercial Manager, Accounts.* Permanent, searchable archive of all trips. Every document (booking sheet, trip sheet, invoice, LR) is downloadable.

**P&L & Mileage (`/trips/pnl-mileage`)** — *Assistant Commercial Manager.* A per-trip view showing Hire minus Expenses (the profit or loss) and the mileage (kilometres per litre) for each trip.

### Attendance

**Mark Attendance (`/attendance/mark`)** — *All staff.* Each staff member marks their own attendance for the day.

**Driver Attendance (`/attendance/drivers`)** — *Admin, Commercial Manager, Assistant Commercial Manager.* Mark daily attendance for each driver (Present, Absent, On Leave, On Trip, and more). Saved by date, so history is always available.

**Staff Attendance (`/attendance/staff`)** — *Admin.* The same, for office staff, including shift close-out times.

**Leave Requests (`/attendance/leave-requests`)** — *All roles (for themselves).* Any driver or staff member submits a leave application (dates, reason, type). A notification goes to the Admin instantly.

**Leave Approvals (`/attendance/leave-approvals`)** — *Admin.* The Admin approves or rejects pending leave requests; the outcome is saved to the person's record.

**Edit Approvals (`/attendance/edit-approvals`)** — *Admin (reviews), Commercial Manager (reviews Docs requests), Docs (requests).* Locked records can only be changed after an approval. An approved request grants a 1-hour edit window for that specific record, creating a clear trail.

**Attendance Report (`/attendance/report`)** — *Admin.* A summary of attendance statistics for all staff and drivers over any selected date range.

### Resource Hub

**Our Staff (`/resources/staff`)** — *Admin.* Complete staff directory. Add staff, set their role (which controls what they can see), upload photos and ID documents, and manage login credentials.

**Our Drivers (`/resources/drivers`)** — *Admin, Commercial Manager.* Driver directory: licence details and expiry, contact information, Aadhaar, bank details, and joining date.

**Our Fleet (`/resources/fleet`)** — *Admin, Commercial Manager.* Full list of all trucks: registration numbers, model details, specifications, and compliance documents.

**Our Customers (`/resources/customers`)** — *Admin, Commercial Manager, Accounts.* Customer master data: names, contacts, GST numbers, default origins and destinations, and pricing agreements.

**Our Vendors (`/resources/vendors`)** — *Admin.* Master data for all third-party service providers and suppliers.

### Maintenance and Care

**Truck Maintenance (`/maintenance/trucks`)** — *Admin, Maintenance.* Logs all maintenance work per truck: service dates, repair type, cost, and the workshop/vendor. Gives a full service history per vehicle.

**Tyre Management (`/maintenance/tyre-management`)** — *Maintenance, Admin.* Manages which tyre is fitted to which position on which truck, with fitment and removal dates, KM readings, and condition. Tracks the full life of each tyre across vehicles.

**Tyre Inventory (`/maintenance/tyre-inventory`)** — *Maintenance, Admin.* Stock list of all tyres — new, in use, retread, or worn out — with tyre IDs, brand, size, and status.

**Fuel History (`/maintenance/fuel-history`)** — *Admin, Trip Sheet Register.* Every fuel fill-up per truck: date, litres, cost, and odometer. Fed automatically by the diesel entries from trip sheets.

### Finance Hub

**Driver Compensation (`/finance/driver-compensation`)** — *Accounts, Admin.* Records driver salary and advance payments, with a running ledger per driver showing what is paid and what is outstanding.

**Staff Compensation (`/finance/staff-compensation`)** — *Admin.* The same, for office staff.

**EMI Tracking (`/finance/emi-tracking`)** — *Accounts, Admin.* Manages all vehicle loan EMIs (bank, loan number, amount, tenure, monthly EMI). The system alerts the Admin when a payment date is coming up. Recurring payments (monthly, quarterly, or yearly bills) are also tracked here with due-date reminders.

**Compliance & Renewals (`/maintenance/compliance`)** — *Admin, Accounts.* A dashboard of all vehicle compliance documents and their expiry dates, with tailored warning windows for each document type:

| Document | Alert Before Expiry |
|---|---|
| Fitness Certificate (FC) | 30 days |
| National Permit | 10 days |
| Local Permit | 10 days |
| Road Tax | 10 days |
| Insurance | 7 days |
| Pollution Certificate (PUC) | 7 days |

The Admin also receives on-screen alerts automatically.

### Administration

**Branch Management (`/admin/branches`)** — *Admin.* Create and manage office branches, including halt-day fees and driver halt-day compensation percentages used across the system.

**Trip Expenses Management (`/admin/trip-expenses`)** — *Admin.* Sets the default expense rates (port pass, weight sheet, mamool, lift-on, crane, parking, and more) used when entering trip sheets, so figures stay consistent.

**Repairs Management (`/admin/repairs`)** — *Admin.* Maintains the master list of standard repair types used across maintenance records.

**SAC Code Management (`/admin/sac-codes`)** — *Admin, Accounts.* Manages the SAC (Services Accounting Code) codes used in invoices for GST compliance, including which invoice type each code applies to.

**AdBlue Management (`/admin/adblue`)** — *Admin.* Manages AdBlue suppliers, default prices, and per-truck consumption rates.

**Security Log (`/admin/security`)** — *Admin only.* A complete record of logins, failed logins, logouts, and document downloads, each showing the time, the user, and the network address (IP). The Admin can search by user or IP, filter by event, export the log to CSV or JSON, and manage account lockouts (see Security below).

---

## Security: How the System Stays Safe

- **Every user must log in** with a username and password. There are no public pages.
- **Passwords are never stored in plain text** — they are protected using industry-standard encryption (hashing).
- **Sessions expire after 12 hours** — a login lasts a full working day, then asks the user to sign in again.
- **Automatic logout when idle** — if a screen is left untouched for 15 minutes, the system logs the user out to protect an unattended computer.
- **Role-based access** — the system enforces, at both the menu level and the server level, that users can only reach what their role permits. A Docs user cannot open a Finance page even by typing the address directly.
- **5-attempt login lockout** — after 5 wrong passwords, that attempt is blocked for 15 minutes. The lock is tied to both the account and the specific computer, so an outsider cannot lock a genuine employee out from elsewhere. The Admin can instantly clear any lock from the Security Log (useful when someone gets a new computer).
- **Per-tab sessions** — each browser tab keeps its own login, so two people can work in two tabs on the same computer without clashing.
- **Protected documents** — ID cards, licences, and other files can only be downloaded by a logged-in user, and every sensitive download is recorded.
- **Logout is instant and complete** — clicking logout ends the session on the server immediately, so a copied login cannot be reused afterwards.
- **Full audit trail** — every login, logout, and document access is written to a permanent record the Admin can review in the Security Log, giving a clear paper trail if anything ever needs investigating.
- **Edit locking with approvals** — certain records are locked after submission; changes require an explicit approval, creating accountability at every step.

---

## Summary: The Business Value

| Area | What the System Solves |
|---|---|
| **Trip Operations** | Complete end-to-end trip lifecycle from booking to invoice, with a different person accountable at every step |
| **Financial Accuracy** | Trip sheets, closures, and invoices are cross-checked across several separate stages before money moves |
| **Correct Invoicing** | The right invoice type (Transport Memo, Bill of Supply, or Tax Invoice) and GST treatment are chosen automatically, with separate numbering and no back-dating |
| **Fleet Health** | Every truck's documents, maintenance history, fuel, AdBlue, and tyres are tracked in one place |
| **Compliance** | The system proactively alerts the team before any document expires, with the right notice period for each document type |
| **EMI & Payments** | Loan and recurring payment due dates trigger automatic reminders in advance |
| **People Management** | Attendance, leave, and compensation for all drivers and staff managed centrally |
| **Access Control & Audit** | Every action is tied to a logged-in user with a specific role, and a full security log records who did what |
| **Real-Time Awareness** | Dashboards and the notification bell refresh automatically, so nobody has to ask "has it been done yet?" |
