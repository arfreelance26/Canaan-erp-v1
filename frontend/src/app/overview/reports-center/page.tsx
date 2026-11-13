"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  RiFolderChartLine as FolderChart, RiFileList3Line as ClipboardList, RiArrowRightLine as ArrowRight, RiEyeLine as Eye,
  RiArrowRightUpLine as TrendingUp, RiBarChartBoxLine as BarChart3, RiCalculatorLine as Calculator, RiGroupLine as Users, RiFolderOpenLine as FolderOpen, RiArchiveLine as Archive, RiCalendarCheckLine as CalendarCheck, RiSteeringLine as Steering, RiUserLine as UserIcon, RiFileTextLine as FileText, RiToolsLine as Wrench, RiGasStationLine as Fuel, RiHourglassLine as Hourglass, RiVerifiedBadgeLine as BadgeCheck, RiFlagLine as Flag, RiShieldCheckLine as ShieldCheck, RiRouteLine as Route, RiHistoryLine as History, RiStackLine as Boxes, RiGroupLine as Team, RiProfileLine as IdCard, RiTruckLine as TruckIcon, RiBuilding2Line as Building2, RiShakeHandsLine as Handshake, RiDeleteBinLine as Trash, RiCheckDoubleLine as CheckDouble, RiMoneyRupeeCircleLine as Rupee, RiShieldFlashLine as ShieldAlert, RiShieldCrossLine as ShieldX, RiBankLine as Landmark, RiWallet3Line as Wallet, RiMoneyRupeeCircleLine as Banknote, RiTimerLine as Timer, RiFileShieldLine as FileShield, RiSendPlaneLine as Send, RiNavigationLine as Navigation, RiFileCheckLine as FileCheck, RiClipboardLine as ClipboardCheck, RiRecordCircleLine as TyreIcon, RiRefreshLine as Retread, RiDeleteBin2Line as Discard, RiDropLine as Drop, RiSearchEyeLine as AuditorEye, RiDashboard3Line as Gauge, type RemixiconComponentType,
} from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { todayIst } from "@/lib/format-date";

const WorkReportDialog = dynamic(() => import("@/components/activity/WorkReportDialog").then((m) => m.WorkReportDialog));
const ProfitabilityReportDialog = dynamic(() => import("@/components/reports/ProfitabilityReportDialog").then((m) => m.ProfitabilityReportDialog));
const CustomerProfitabilityReportDialog = dynamic(() => import("@/components/reports/CustomerProfitabilityReportDialog").then((m) => m.CustomerProfitabilityReportDialog));
const AttendanceReportDialog = dynamic(() => import("@/components/reports/AttendanceReportDialog").then((m) => m.AttendanceReportDialog));
const TripSummaryReportDialog = dynamic(() => import("@/components/reports/TripSummaryReportDialog").then((m) => m.TripSummaryReportDialog));
const TruckReportDialog = dynamic(() => import("@/components/reports/TruckReportDialog").then((m) => m.TruckReportDialog));
const AuditReportDialog = dynamic(() => import("@/components/reports/AuditReportDialog").then((m) => m.AuditReportDialog));
const TripHistoryReportDialog = dynamic(() => import("@/components/reports/TripHistoryReportDialog").then((m) => m.TripHistoryReportDialog));
const ResourceReportDialog = dynamic(() => import("@/components/reports/ResourceReportDialog").then((m) => m.ResourceReportDialog));
const ApprovalReportDialog = dynamic(() => import("@/components/reports/ApprovalReportDialog").then((m) => m.ApprovalReportDialog));
const FinanceReportDialog = dynamic(() => import("@/components/reports/FinanceReportDialog").then((m) => m.FinanceReportDialog));
const TripPageReportDialog = dynamic(() => import("@/components/reports/TripPageReportDialog").then((m) => m.TripPageReportDialog));
const TyreReportDialog = dynamic(() => import("@/components/reports/TyreReportDialog").then((m) => m.TyreReportDialog));
const RecordReportDialog = dynamic(() => import("@/components/reports/RecordReportDialog").then((m) => m.RecordReportDialog));
const ProofPackDialog = dynamic(() => import("@/components/reports/ProofPackDialog").then((m) => m.ProofPackDialog));
const RunningCostReportDialog = dynamic(() => import("@/components/reports/RunningCostReportDialog").then((m) => m.RunningCostReportDialog));

type ResourceKind = "staff" | "drivers" | "fleet" | "customers" | "vendors" | "archive";
type ApprovalKind = "payments" | "edit" | "deletion" | "maintenance";
type FinanceKind = "drivercomp" | "staffcomp" | "emi" | "detention" | "compliance";
type TripPageKind = "trips_assign" | "trips_available" | "trips_current" | "trips_completed" | "trips_sheets"
  | "trips_reconciliation" | "trips_verification" | "trips_deleted" | "driver_assign";
type TyreKind = "tyre_inventory" | "tyre_management" | "tyre_retread" | "tyre_discarded" | "tyre_archive";
type RecordKind = "driver_record" | "vehicle_record" | "adblue" | "runrecord";
type Open = `rec-${RecordKind}` | `tyre-${TyreKind}` | `trip-${TripPageKind}` | `res-${ResourceKind}` | `appr-${ApprovalKind}` | `fin-${FinanceKind}` | "work" | "profit" | "customer" | "running" | "proofs" | "att-driver" | "att-staff" | "trips" | "maintenance" | "fuel" | "audit-pending" | "audit-verified" | "audit-flagged" | "trip-history" | null;

/** Admin only, like Recap Report: the sidebar hides it from other roles, and
 *  this guard sends anyone else who opens the link back home. (Every report
 *  here is also on its own page, for the roles that page allows.) */
const ALLOWED_ROLES = ["Admin"];

/** A section of reports: a heading line, then its cards in a grid. */
function ReportSection({ tour, icon: Icon, title, hint, children }: { tour: string; icon: RemixiconComponentType; title: string; hint: string; children: ReactNode }) {
  return (
    <section data-tour={tour} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-tertiary" />
        <h2 className="text-body-semibold text-text-primary">{title}</h2>
        <span className="text-caption-1-regular text-text-tertiary">{hint}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

/** One report: icon, name, what it covers, its formats, and Open report. */
function ReportCard({ tour, icon: Icon, iconCls, title, text, formats, onOpen }: {
  tour: string; icon: RemixiconComponentType; iconCls: string; title: string; text: string; formats: string[]; onOpen: () => void;
}) {
  return (
    <div
      data-tour={tour}
      className="flex flex-col gap-4 rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm transition duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconCls}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-body-semibold text-text-primary">{title}</h3>
          <p className="mt-0.5 text-caption-1-regular text-text-secondary">{text}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {formats.map((f) => (
            <span key={f} className="rounded-full bg-fill-2 px-2.5 py-0.5 text-caption-2-semibold text-text-secondary">{f}</span>
          ))}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1.5 rounded-full bg-accent-solid px-4 py-2 text-caption-1-semibold text-on-solid shadow-sm transition-colors hover:bg-accent-solid-hover"
        >
          Open report
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Resource Hub: one card per page, each its page's "View" report. */
const RESOURCE_CARDS: { kind: ResourceKind; icon: RemixiconComponentType; iconCls: string; title: string; text: string }[] = [
  { kind: "staff", icon: Team, iconCls: "border-purple-border bg-purple-surface text-purple-text", title: "Our Staff Report",
    text: "A sheet per role: details, tenure, birthdays, masked Aadhaar and 12 months' attendance." },
  { kind: "drivers", icon: IdCard, iconCls: "border-accent-border bg-accent-surface text-accent-text", title: "Our Drivers Report",
    text: "A sheet per driver: licence, masked IDs and bank, current truck, and 12 months month by month." },
  { kind: "fleet", icon: TruckIcon, iconCls: "border-orange-border bg-orange-surface text-orange-text", title: "Our Fleet Report",
    text: "A sheet per truck: documents and expiry, loan, last service and fuel, and 12 months' trips." },
  { kind: "customers", icon: Building2, iconCls: "border-teal-border bg-teal-surface text-teal-text", title: "Our Customers Report",
    text: "A sheet per customer type, with Destinations, Pricing and 12 months' trips." },
  { kind: "vendors", icon: Handshake, iconCls: "border-success-border bg-success-surface text-success-text", title: "Our Vendors Report",
    text: "A sheet per vendor category, with what was spent with each over 12 months." },
  { kind: "archive", icon: Trash, iconCls: "border-separator-border bg-fill-2 text-text-secondary", title: "Archive Report",
    text: "A sheet per record type: everything still deleted, who asked, who approved, when and why." },
];

/** Trip and Driver Management: one card per page, each its page's View report (trip_pages_report.py). */
const TRIP_PAGE_CARDS: { kind: TripPageKind; icon: RemixiconComponentType; iconCls: string; title: string; text: string }[] = [
  { kind: "driver_assign", icon: Steering, iconCls: "border-accent-border bg-accent-surface text-accent-text", title: "Driver Assignments Report",
    text: "Every driver's truck and since when, trucks without a driver, and every assignment change." },
  { kind: "trips_assign", icon: Send, iconCls: "border-warning-border bg-warning-surface text-warning-text", title: "Assign Trips Report",
    text: "Assigned trips waiting to start, and how long each has waited." },
  { kind: "trips_available", icon: Navigation, iconCls: "border-teal-border bg-teal-surface text-teal-text", title: "Available Trips Report",
    text: "Every trip by stage: Booked, Current, Completed, Closed — with a stage × category table." },
  { kind: "trips_current", icon: Route, iconCls: "border-purple-border bg-purple-surface text-purple-text", title: "Current Trips Report",
    text: "Trips on the move, by live status, and how many days each has been out." },
  { kind: "trips_completed", icon: BadgeCheck, iconCls: "border-success-border bg-success-surface text-success-text", title: "Completed Trips Report",
    text: "Trips done on the road whose booking sheet isn't closed yet." },
  { kind: "trips_sheets", icon: FileCheck, iconCls: "border-orange-border bg-orange-surface text-orange-text", title: "Trip Sheet Collection Report",
    text: "Sheets pending, delivered and overdue, with who delivered each and when." },
  { kind: "trips_reconciliation", icon: ClipboardList, iconCls: "border-accent-border bg-accent-surface text-accent-text", title: "Trip Reconciliation Report",
    text: "Sheets to receive and enter, rejected ones, and the edit requests raised." },
  { kind: "trips_verification", icon: ClipboardCheck, iconCls: "border-success-border bg-success-surface text-success-text", title: "Verification & Invoicing Report",
    text: "Pending, verified, invoiced, rejected and waived trips, with invoice numbers and dates." },
  { kind: "trips_deleted", icon: Trash, iconCls: "border-danger-border bg-danger-surface text-danger-text", title: "Deleted Trips Report",
    text: "Every trip still deleted: who asked, why, who approved it and when." },
];

/** Tyre Records: one card per page, each its page's View report (tyre_reports.py). */
const TYRE_CARDS: { kind: TyreKind; icon: RemixiconComponentType; iconCls: string; title: string; text: string }[] = [
  { kind: "tyre_inventory", icon: TyreIcon, iconCls: "border-accent-border bg-accent-surface text-accent-text", title: "Tyre Inventory Report",
    text: "Every tyre by status: fitted, in stock, waiting for retread, discarded — cost, km run and where it is." },
  { kind: "tyre_management", icon: TruckIcon, iconCls: "border-orange-border bg-orange-surface text-orange-text", title: "Tyre Management Report",
    text: "Truck by truck: each fitted tyre's wear against its range, empty positions and the fitting history." },
  { kind: "tyre_retread", icon: Retread, iconCls: "border-warning-border bg-warning-surface text-warning-text", title: "Retread Queue Report",
    text: "Tyres waiting for retreading and for how long, and the retreads done with their cost." },
  { kind: "tyre_discarded", icon: Discard, iconCls: "border-danger-border bg-danger-surface text-danger-text", title: "Discarded Tyres Report",
    text: "Discarded tyres: why, and how many km each gave against what it was bought for." },
  { kind: "tyre_archive", icon: Archive, iconCls: "border-separator-border bg-fill-2 text-text-secondary", title: "Tyre Archive Report",
    text: "Deleted tyres with who asked and approved, and the tyre change log." },
];

/** Finance Hub: one card per page, each its page's "View" report (finance_report.py). */
const FINANCE_CARDS: { kind: FinanceKind; icon: RemixiconComponentType; iconCls: string; title: string; text: string }[] = [
  { kind: "drivercomp", icon: Wallet, iconCls: "border-accent-border bg-accent-surface text-accent-text", title: "Driver Compensation Report",
    text: "Each driver's Salary Record for the period: trip salary, halt pay, batta, workshop advance and the final net payable." },
  { kind: "staffcomp", icon: Banknote, iconCls: "border-purple-border bg-purple-surface text-purple-text", title: "Staff Compensation Report",
    text: "Each staff member's salary and advance entries for the period, and month by month." },
  { kind: "emi", icon: Landmark, iconCls: "border-teal-border bg-teal-surface text-teal-text", title: "EMI Tracking Report",
    text: "Every loan: paid, remaining and the next installment; overdue, ending soon, by bank, and recurring payments." },
  { kind: "detention", icon: Timer, iconCls: "border-warning-border bg-warning-surface text-warning-text", title: "Customer Detention Report",
    text: "Party halt to bill and recover: missed on invoice, not billed, billed, paid, and what each customer owes." },
  { kind: "compliance", icon: FileShield, iconCls: "border-danger-border bg-danger-surface text-danger-text", title: "Compliance & Renewals Report",
    text: "Every truck document's expiry and status (expired, expiring soon, not uploaded, no cost) and the renewals due." },
];

/** Approvals: one card per page, each its page's "View" report. */
const APPROVAL_CARDS: { kind: ApprovalKind; icon: RemixiconComponentType; iconCls: string; title: string; text: string }[] = [
  { kind: "payments", icon: Rupee, iconCls: "border-success-border bg-success-surface text-success-text", title: "Payment Requests Report",
    text: "A sheet per requester: every payment request in the period, its amount and whether it was paid." },
  { kind: "edit", icon: ShieldAlert, iconCls: "border-warning-border bg-warning-surface text-warning-text", title: "Edit Approvals Report",
    text: "A sheet per record type: every edit request, who asked, the decision and how long it took." },
  { kind: "deletion", icon: ShieldX, iconCls: "border-danger-border bg-danger-surface text-danger-text", title: "Deletion Approvals Report",
    text: "A sheet per record type: every deletion request, who asked, the decision and how long it took." },
  { kind: "maintenance", icon: Wrench, iconCls: "border-orange-border bg-orange-surface text-orange-text", title: "Maintenance Approvals Report",
    text: "A sheet per status: every maintenance request sent for approval, the truck, the work and its cost." },
];

export default function ReportsCenterPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    if (!isAllowed) router.replace("/");
  }, [isAllowed, router]);

  if (!isAllowed) return null;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div data-tour="reports-center-header" className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
          <FolderChart className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Reports Center</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Every report in the app, in one place</p>
        </div>
      </div>

      <ReportSection tour="reports-center-monitoring" icon={Eye} title="Monitoring" hint="How the team uses the app">
        <ReportCard
          tour="reports-center-work-report"
          icon={ClipboardList}
          iconCls="border-purple-border bg-purple-surface text-purple-text"
          title="Staff Work Report"
          text="What each person did in the app (time active, pages and saves) for one day or a date range of up to 31 days."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("work")}
        />
      </ReportSection>

      <ReportSection tour="reports-center-trips" icon={Route} title="Trips" hint="Every trip, stage by stage">
        <ReportCard
          tour="reports-center-trip-history"
          icon={History}
          iconCls="border-accent-border bg-accent-surface text-accent-text"
          title="Trip History Report"
          text="Trips for a period, a sheet per trip category: every trip with its hire, expenses and Trip Summary, by stage and by customer."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("trip-history")}
        />
      </ReportSection>

      <ReportSection tour="reports-center-trip-management" icon={Route} title="Trip Management" hint="Each Trip and Driver Management page">
        {TRIP_PAGE_CARDS.map((c) => (
          <ReportCard
            key={c.kind}
            tour={`reports-center-trip-${c.kind}`}
            icon={c.icon}
            iconCls={c.iconCls}
            title={c.title}
            text={c.text}
            formats={["PDF", "Excel"]}
            onOpen={() => setOpen(`trip-${c.kind}`)}
          />
        ))}
      </ReportSection>

      <ReportSection tour="reports-center-profitability" icon={TrendingUp} title="Profitability" hint="What the trips and trucks earned">
        <ReportCard
          tour="reports-center-profit-report"
          icon={BarChart3}
          iconCls="border-success-border bg-success-surface text-success-text"
          title="Profitability Report"
          text="Trip Profitability, Truck Profitability, or both: hire, trip expenses, diesel, AdBlue, tyres, maintenance, EMI and documents for a period."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("profit")}
        />
        <ReportCard
          tour="reports-center-customer-profit"
          icon={Users}
          iconCls="border-accent-border bg-accent-surface text-accent-text"
          title="Customer Profitability Report"
          text="Every customer ranked by Final Profit, the ones losing money, and a sheet per customer with their routes and recent trips."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("customer")}
        />
        <ReportCard
          tour="reports-center-trip-summary"
          icon={FileText}
          iconCls="border-purple-border bg-purple-surface text-purple-text"
          title="Trip Summary Report"
          text="Trips for a period by month, category, customer and truck: hire, expense, P&L and km, with the loss-making trips on their own sheet."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("trips")}
        />
        <ReportCard
          tour="reports-center-running-cost"
          icon={Calculator}
          iconCls="border-teal-border bg-teal-surface text-teal-text"
          title="Running Cost Report"
          text="Every truck's cost per km by part, the fleet average, trucks with a part missing, and how each part was worked out."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("running")}
        />
      </ReportSection>

      <ReportSection tour="reports-center-finance" icon={Landmark} title="Finance" hint="Pay, loans, money to recover and renewals">
        {FINANCE_CARDS.map((c) => (
          <ReportCard
            key={c.kind}
            tour={`reports-center-fin-${c.kind}`}
            icon={c.icon}
            iconCls={c.iconCls}
            title={c.title}
            text={c.text}
            formats={["PDF", "Excel"]}
            onOpen={() => setOpen(`fin-${c.kind}`)}
          />
        ))}
      </ReportSection>

      <ReportSection tour="reports-center-attendance" icon={CalendarCheck} title="Attendance" hint="Who was present, absent or on leave">
        <ReportCard
          tour="reports-center-driver-attendance"
          icon={Steering}
          iconCls="border-accent-border bg-accent-surface text-accent-text"
          title="Driver Attendance Report"
          text="Every driver's present, absent and leave days for a period, the day-by-day register, and a sheet per driver."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("att-driver")}
        />
        <ReportCard
          tour="reports-center-staff-attendance"
          icon={UserIcon}
          iconCls="border-purple-border bg-purple-surface text-purple-text"
          title="Staff Attendance Report"
          text="Every staff member's present, absent and leave days for a period, the register with holidays, and a sheet per person."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("att-staff")}
        />
      </ReportSection>

      <ReportSection tour="reports-center-audit" icon={ShieldCheck} title="Audit" hint="Trips checked by the Auditor">
        <ReportCard
          tour="reports-center-audit-pending"
          icon={Hourglass}
          iconCls="border-warning-border bg-warning-surface text-warning-text"
          title="Pending Audit Report"
          text="Trips still waiting for the Auditor, a sheet per driver, with how long each has waited."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("audit-pending")}
        />
        <ReportCard
          tour="reports-center-audit-verified"
          icon={BadgeCheck}
          iconCls="border-success-border bg-success-surface text-success-text"
          title="Audit Verified Trips Report"
          text="Trips the Auditor verified, a sheet per driver, and whether they were disputed first."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("audit-verified")}
        />
        <ReportCard
          tour="reports-center-audit-flagged"
          icon={Flag}
          iconCls="border-danger-border bg-danger-surface text-danger-text"
          title="Audit Flagged Trips Report"
          text="Trips the Auditor flagged: under review with the team, or returned and awaiting the Auditor."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("audit-flagged")}
        />
      </ReportSection>

      <ReportSection tour="reports-center-auditor" icon={AuditorEye} title="Auditor Pages" hint="Verified trips, by driver and by truck">
        <ReportCard
          tour="reports-center-rec-driver_record"
          icon={IdCard}
          iconCls="border-accent-border bg-accent-surface text-accent-text"
          title="Driver Based Record Report"
          text="Each driver's verified trips with their net payable and audit status."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("rec-driver_record")}
        />
        <ReportCard
          tour="reports-center-rec-vehicle_record"
          icon={TruckIcon}
          iconCls="border-orange-border bg-orange-surface text-orange-text"
          title="Vehicle Based Record Report"
          text="Each truck's verified trips with driver, km, hire and audit status — removed trucks too."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("rec-vehicle_record")}
        />
      </ReportSection>

      <ReportSection tour="reports-center-maintenance" icon={Wrench} title="Maintenance" hint="Repairs, services and diesel">
        <ReportCard
          tour="reports-center-maintenance-report"
          icon={Wrench}
          iconCls="border-orange-border bg-orange-surface text-orange-text"
          title="Truck Maintenance Report"
          text="Truck by truck: every job in the period with its parts and cost, the last service, jobs waiting for a cost or approval, and open reminders."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("maintenance")}
        />
        <ReportCard
          tour="reports-center-fuel-report"
          icon={Fuel}
          iconCls="border-accent-border bg-accent-surface text-accent-text"
          title="Fuel Report"
          text="Truck by truck: fills, litres, diesel cost and price paid, mileage against normal, odd fills to check, and totals by fuel station."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("fuel")}
        />
        <ReportCard
          tour="reports-center-rec-adblue"
          icon={Drop}
          iconCls="border-teal-border bg-teal-surface text-teal-text"
          title="AdBlue History Report"
          text="Every AdBlue fill by truck: litres, cost, km per litre, and totals by filling location."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("rec-adblue")}
        />
      </ReportSection>

      <ReportSection tour="reports-center-approvals" icon={CheckDouble} title="Approvals" hint="Requests and the decisions on them">
        {APPROVAL_CARDS.map((c) => (
          <ReportCard
            key={c.kind}
            tour={`reports-center-appr-${c.kind}`}
            icon={c.icon}
            iconCls={c.iconCls}
            title={c.title}
            text={c.text}
            formats={["PDF", "Excel"]}
            onOpen={() => setOpen(`appr-${c.kind}`)}
          />
        ))}
      </ReportSection>

      <ReportSection tour="reports-center-tyres" icon={TyreIcon} title="Tyres" hint="Every tyre: where it is, what it cost and how far it has run">
        {TYRE_CARDS.map((c) => (
          <ReportCard
            key={c.kind}
            tour={`reports-center-${c.kind}`}
            icon={c.icon}
            iconCls={c.iconCls}
            title={c.title}
            text={c.text}
            formats={["PDF", "Excel"]}
            onOpen={() => setOpen(`tyre-${c.kind}`)}
          />
        ))}
      </ReportSection>

      <ReportSection tour="reports-center-resources" icon={Boxes} title="Resource Hub" hint="Staff, drivers, trucks, customers and vendors">
        {RESOURCE_CARDS.map((c) => (
          <ReportCard
            key={c.kind}
            tour={`reports-center-res-${c.kind}`}
            icon={c.icon}
            iconCls={c.iconCls}
            title={c.title}
            text={c.text}
            formats={["PDF", "Excel"]}
            onOpen={() => setOpen(`res-${c.kind}`)}
          />
        ))}
      </ReportSection>

      <ReportSection tour="reports-center-records" icon={Archive} title="Records" hint="Proofs and documents kept in the app">
        <ReportCard
          tour="reports-center-proof-pack"
          icon={FolderOpen}
          iconCls="border-warning-border bg-warning-surface text-warning-text"
          title="Proof Pack"
          text="Every bill, proof of payment and document for a period as one PDF: a cover, an index with page numbers, then each file behind a strip naming it."
          formats={["PDF"]}
          onOpen={() => setOpen("proofs")}
        />
        <ReportCard
          tour="reports-center-rec-runrecord"
          icon={Gauge}
          iconCls="border-purple-border bg-purple-surface text-purple-text"
          title="Truck Run Record Report"
          text="Each truck's km month by month and trip by trip, its normal run a month, and trips still without a sheet."
          formats={["PDF", "Excel"]}
          onOpen={() => setOpen("rec-runrecord")}
        />
      </ReportSection>

      {open === "work" && <WorkReportDialog day={todayIst()} onClose={() => setOpen(null)} />}
      {open === "profit" && <ProfitabilityReportDialog onClose={() => setOpen(null)} />}
      {open === "customer" && <CustomerProfitabilityReportDialog onClose={() => setOpen(null)} />}
      {open === "att-driver" && <AttendanceReportDialog category="driver" onClose={() => setOpen(null)} />}
      {open === "att-staff" && <AttendanceReportDialog category="staff" onClose={() => setOpen(null)} />}
      {open === "trips" && <TripSummaryReportDialog onClose={() => setOpen(null)} />}
      {(open === "maintenance" || open === "fuel") && <TruckReportDialog kind={open} onClose={() => setOpen(null)} />}
      {open === "audit-pending" && <AuditReportDialog kind="pending" onClose={() => setOpen(null)} />}
      {open === "audit-verified" && <AuditReportDialog kind="verified" onClose={() => setOpen(null)} />}
      {open === "audit-flagged" && <AuditReportDialog kind="flagged" onClose={() => setOpen(null)} />}
      {open === "trip-history" && <TripHistoryReportDialog onClose={() => setOpen(null)} />}
      {open?.startsWith("res-") && <ResourceReportDialog kind={open.slice(4) as ResourceKind} onClose={() => setOpen(null)} />}
      {open?.startsWith("appr-") && <ApprovalReportDialog kind={open.slice(5) as ApprovalKind} onClose={() => setOpen(null)} />}
      {open?.startsWith("fin-") && <FinanceReportDialog kind={open.slice(4) as FinanceKind} onClose={() => setOpen(null)} />}
      {open?.startsWith("trip-") && <TripPageReportDialog kind={open.slice(5) as TripPageKind} onClose={() => setOpen(null)} />}
      {open?.startsWith("tyre-") && <TyreReportDialog kind={open.slice(5) as TyreKind} onClose={() => setOpen(null)} />}
      {open?.startsWith("rec-") && <RecordReportDialog kind={open.slice(4) as RecordKind} onClose={() => setOpen(null)} />}
      {open === "proofs" && <ProofPackDialog onClose={() => setOpen(null)} />}
      {open === "running" && <RunningCostReportDialog onClose={() => setOpen(null)} />}
    </div>
  );
}
