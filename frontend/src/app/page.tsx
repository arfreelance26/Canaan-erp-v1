"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { DailySummaryCard } from "@/components/dashboard/DailySummaryCard";
import { FleetManagerDashboard } from "@/components/dashboard/FleetManagerDashboard";
import { TyreManagerDashboard } from "@/components/dashboard/TyreManagerDashboard";
import { FinanceManagerDashboard } from "@/components/dashboard/FinanceManagerDashboard";
import { StaffDashboard } from "@/components/dashboard/StaffDashboard";
import { TripSheetCoordinatorDashboard } from "@/components/dashboard/TripSheetCoordinatorDashboard";
import { AuditorDashboard } from "@/components/dashboard/AuditorDashboard";
import { CurrentTripsCard } from "@/components/dashboard/CurrentTripsCard";
import { BirthdayCard } from "@/components/dashboard/BirthdayCard";
import { SeasonCard } from "@/components/dashboard/SeasonCard";
import { FoundingCard } from "@/components/dashboard/FoundingCard";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { Button } from "@/components/base/buttons/button";
import { SheetTrackingCard } from "@/components/dashboard/SheetTrackingCard";
import Link from "next/link";
import { RiTruckLine as Truck, RiNavigationLine as Navigation, RiFileList3Line as ClipboardList, RiAlertLine as AlertTriangle, RiPulseLine as Activity, RiToolsLine as Wrench, RiShieldCheckLine as ShieldCheck, RiWallet3Line as Wallet, RiCheckboxCircleLine as CheckCircle2, RiUserFollowLine as UserCheck, RiFileShield2Line as FileCheck2, RiInboxLine as Inbox, RiFileExcel2Line as FileSpreadsheet, RiDatabase2Line as Database, RiFolderZipLine as FolderArchive, RiArrowRightLine as ArrowRight, RiCalendar2Line as CalendarDays, RiLoader4Line as Loader2, RiGasStationLine as Fuel, RiPencilLine as Pencil, RiFlagLine as Flag, RiDownloadLine as Download, RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { FleetStatusPanel } from "@/components/dashboard/FleetStatusPanel";
import {
  trucksApi,
  driversApi,
  staffApi,
  customersApi,
  vendorsApi,
  tripsApi,
  attendanceApi,
  maintenanceApi,
  tyreApi,
  financeApi,
  editApprovalsApi,
  fuelLogsApi,
  downloadExcel,
  type AuditVerifiedTrip,
} from "@/lib/api";
import { getComplianceStatus } from "@/lib/compliance";
import type { Truck as TruckType } from "@/types/truck";
import type { Driver } from "@/types/driver";
import type { Staff } from "@/types/staff";
import type { Customer } from "@/types/customer";
import type { Vendor } from "@/types/vendor";
import type { Trip, TripStatus } from "@/types/trip";
import type { DriverAttendanceRecord, StaffAttendanceRecord } from "@/types/attendance";
import type { LeaveRequest } from "@/types/leave-request";
import type { EditApprovalRequest } from "@/types/edit-approval";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { EmiRecord, RecurringPayment } from "@/types/finance";
import { formatDateWithMonth, inDateRange, todayIst } from "@/lib/format-date";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { LaneMapCard } from "@/components/dashboard/LaneMapCard";
import { ComplianceOverviewCard } from "@/components/dashboard/ComplianceOverviewCard";
import { AttendanceTodayCard } from "@/components/dashboard/AttendanceTodayCard";
import { PendingLeaveCard } from "@/components/dashboard/PendingLeaveCard";
import { FleetConstellationCard } from "@/components/dashboard/FleetConstellationCard";
import { TripTrendChart } from "@/components/dashboard/TripTrendChart";
import { showError } from "@/lib/feedback";

function formatCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// Trips that have actually started (excludes Assigned-but-not-started)
const CURRENT_TRIP_STATUSES: TripStatus[] = ["Started", "Loaded", "On-Transit", "Reached", "Unloaded"];

// Same rule as the trip form's "already on a trip" check: a truck is taken
// from the moment a trip is Assigned until that trip is Completed or Cancelled.
const BUSY_TRIP_STATUSES: TripStatus[] = ["Assigned", ...CURRENT_TRIP_STATUSES];

const AvailableVehiclesDialog = dynamic(() =>
  import("@/components/dashboard/AvailableVehiclesDialog").then((m) => m.AvailableVehiclesDialog));

function isActiveTrip(t: Trip): boolean {
  return CURRENT_TRIP_STATUSES.includes(t.status) && !t.hasClosure && !t.isInvoiced;
}

const RECURRING_FREQUENCY_DIVISOR: Record<string, number> = {
  Monthly: 1,
  Quarterly: 3,
  Yearly: 12,
};

const COMPLIANCE_DOCS: Array<{ key: string; label: string; field: keyof TruckType }> = [
  { key: "fc",         label: "FC",          field: "fcExpiryDate" },
  { key: "roadtax",   label: "Road Tax",     field: "roadTaxDate" },
  { key: "insurance", label: "Insurance",    field: "insuranceExpiryDate" },
  { key: "natpermit", label: "Nat. Permit",  field: "nationalPermitDate" },
  { key: "pollution", label: "Pollution",    field: "pollutionCertificateDate" },
];


export default function DashboardPage() {
  // The birthday person's greeting (and the Christmas / New Year one) sits
  // above whichever dashboard their role gets.
  return (
    <>
      <BirthdayCard />
      <SeasonCard />
      <FoundingCard />
      <RoleDashboard />
    </>
  );
}

function RoleDashboard() {
  const { user } = useAuth();

  if (user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager") {
    return <FleetManagerDashboard />;
  }
  if (user?.softwareDesignation === "Maintenance") {
    return <TyreManagerDashboard />;
  }
  if (user?.softwareDesignation === "Accounts") {
    return <FinanceManagerDashboard />;
  }
  if (user?.softwareDesignation === "Trip Sheet Register") {
    return <StaffDashboard />;
  }
  if (user?.softwareDesignation === "Yard Supervisor") {
    return <TripSheetCoordinatorDashboard />;
  }
  if (user?.softwareDesignation === "Auditor") {
    return <AuditorDashboard />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [trucks, setTrucks] = useState<TruckType[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [driverAttendance, setDriverAttendance] = useState<DriverAttendanceRecord[]>([]);
  const [staffAttendance, setStaffAttendance] = useState<StaffAttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [pendingEditApprovals, setPendingEditApprovals] = useState<EditApprovalRequest[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [tyreInventory, setTyreInventory] = useState<TyreInventoryItem[]>([]);
  const [emiRecords, setEmiRecords] = useState<EmiRecord[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [auditVerifiedTrips, setAuditVerifiedTrips] = useState<AuditVerifiedTrip[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "commercial" | "accounts" | "yard" | "tripsheet" | "maintenance">("overview");
  const [sheetDeliveredFilter, setSheetDeliveredFilter] = useState<"All" | "Awaiting Receipt" | "Received">("All");
  const [sheetDeliveredDate, setSheetDeliveredDate] = useState("");
  const [sheetReceivedFilter, setSheetReceivedFilter] = useState<"All" | "Pending Entry" | "Entered">("All");
  const [sheetReceivedDate, setSheetReceivedDate] = useState("");
  const [sheetEnteredDate, setSheetEnteredDate] = useState("");
  const [backupLoading, setBackupLoading] = useState<"excel" | "sql" | "files" | null>(null);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const backupMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!backupMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (backupMenuRef.current && !backupMenuRef.current.contains(e.target as Node)) {
        setBackupMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [backupMenuOpen]);
  const [fuelRate, setFuelRate] = useState<{ costPerLitre: number | null; updatedAt: string | null }>({ costPerLitre: null, updatedAt: null });
  const [fuelRateInput, setFuelRateInput] = useState("");
  const [fuelRateSaving, setFuelRateSaving] = useState(false);

  const today = todayIst();

  async function handleBackup(type: "excel" | "sql" | "files") {
    setBackupMenuOpen(false);
    setBackupLoading(type);
    const extMap = { excel: "xlsx", sql: "sql", files: "zip" } as const;
    const fallbackName = type === "files" ? "canaan_erp_files.zip" : `canaan_erp_backup.${extMap[type]}`;
    try {
      await downloadExcel(`/backup/${type}`, fallbackName);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err), "Backup failed");
    } finally {
      setBackupLoading(null);
    }
  }

  async function handleSaveFuelRate() {
    const val = parseFloat(fuelRateInput);
    if (isNaN(val) || val <= 0) return;
    setFuelRateSaving(true);
    try {
      const cfg = await fuelLogsApi.setBaseConfig(val);
      setFuelRate({ costPerLitre: cfg.cost_per_litre != null ? Number(cfg.cost_per_litre) : null, updatedAt: cfg.updated_at });
      setFuelRateInput("");
    } catch {
      showError("Please try again.", "Couldn't update the fuel rate");
    } finally {
      setFuelRateSaving(false);
    }
  }

  useWebSocketEvent("trip_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("leave_request_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("leave_request_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("maintenance_updated", () => setRefreshKey(k => k + 1));
  const { expiredItems: complianceExpired, expiringSoonItems: complianceExpiringSoon } = useComplianceAlerts(trucks);
  useWebSocketEvent("finance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("tyre_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("attendance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_collected", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_received", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_entered", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_unmarked", () => setRefreshKey(k => k + 1));
  // Robust fallback: refresh on ANY server mutation (data_changed) + slow poll,
  // so Trip Sheet Tracking stays live even if a specific WS event is missed.
  useAutoRefresh(() => setRefreshKey(k => k + 1), 15000);
  useWebSocketEvent("edit_approval_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_deleted", () => setRefreshKey(k => k + 1));

  // Pending edit approval requests (own lightweight fetch so it can render its own panel)
  useEffect(() => {
    editApprovalsApi.list("Pending").then(setPendingEditApprovals).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    fuelLogsApi.getBaseConfig()
      .then((cfg) => setFuelRate({ costPerLitre: cfg.cost_per_litre != null ? Number(cfg.cost_per_litre) : null, updatedAt: cfg.updated_at }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // allSettled, not all — a single failed source (e.g. a transient hiccup right
    // after relogin) must not blank out every other section of the dashboard.
    // Each source keeps its last-known-good state on failure; a toast names which
    // sections didn't refresh instead of silently rendering stale/empty data.
    Promise.allSettled([
      trucksApi.list(),
      driversApi.list(),
      staffApi.list(),
      customersApi.list(),
      vendorsApi.list(),
      tripsApi.list(),
      attendanceApi.listDrivers(today),
      attendanceApi.listStaff(today),
      attendanceApi.listLeaveRequests(),
      maintenanceApi.listRecords(),
      tyreApi.listInventory(),
      financeApi.listEmi(),
      financeApi.listRecurring(),
      tripsApi.listAuditVerified(),
    ])
      .then((results) => {
        const [t, d, s, c, v, tr, da, sa, lr, mr, ti, emi, rp, av] = results;
        const failed: string[] = [];
        if (t.status === "fulfilled") setTrucks(t.value); else failed.push("Trucks");
        if (d.status === "fulfilled") setDrivers(d.value); else failed.push("Drivers");
        if (s.status === "fulfilled") setStaffList(s.value); else failed.push("Staff");
        if (c.status === "fulfilled") setCustomers(c.value); else failed.push("Customers");
        if (v.status === "fulfilled") setVendors(v.value); else failed.push("Vendors");
        if (tr.status === "fulfilled") setTrips(tr.value); else failed.push("Trips");
        if (da.status === "fulfilled") setDriverAttendance(da.value); else failed.push("Driver Attendance");
        if (sa.status === "fulfilled") setStaffAttendance(sa.value); else failed.push("Staff Attendance");
        if (lr.status === "fulfilled") setLeaveRequests(lr.value); else failed.push("Leave Requests");
        if (mr.status === "fulfilled") setMaintenanceRecords(mr.value); else failed.push("Maintenance Records");
        if (ti.status === "fulfilled") setTyreInventory(ti.value); else failed.push("Tyre Inventory");
        if (emi.status === "fulfilled") setEmiRecords(emi.value); else failed.push("EMI Records");
        if (rp.status === "fulfilled") setRecurringPayments(rp.value); else failed.push("Recurring Payments");
        if (av.status === "fulfilled") setAuditVerifiedTrips(av.value); else failed.push("Audit Verified Trips");
        if (failed.length > 0) {
          showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
        }
      })
      .finally(() => setLoading(false));
  }, [today, refreshKey]);

  // ── Compliance ────────────────────────────────────────────────────────────
  const complianceCounts = useMemo(() => {
    const counts: Record<string, number> = { Valid: 0, "Expiring Soon": 0, Expired: 0 };
    for (const truck of trucks) {
      for (const doc of COMPLIANCE_DOCS) {
        const val = truck[doc.field] as string | undefined;
        counts[getComplianceStatus(val ?? "")] += 1;
      }
    }
    return counts;
  }, [trucks]);

  // ── Trips ─────────────────────────────────────────────────────────────────
  const tripStatusCounts = useMemo(() => {
    const counts: Record<TripStatus, number> = {
      Assigned: 0, Started: 0, Loaded: 0, "On-Transit": 0,
      Reached: 0, Unloaded: 0, Completed: 0, Cancelled: 0,
    };
    for (const trip of trips) counts[trip.status] += 1;
    return counts;
  }, [trips]);

  const activeTripsCount = useMemo(
    () => trips.filter(isActiveTrip).length,
    [trips]
  );

  // Auditor recheck workflow — flagged split into "under review" (blocked,
  // awaiting a fix) vs "returned" (fixed, awaiting the Auditor's decision),
  // both counted together for the KPI; Verified is a live count from Audit
  // Verified Trips, a positive "audit health" signal rather than a to-do.
  const flaggedUnderReviewCount = useMemo(
    () => trips.filter((t) => t.flaggedForRecheck && !t.recheckReturned).length,
    [trips]
  );
  const flaggedReturnedCount = useMemo(
    () => trips.filter((t) => t.flaggedForRecheck && t.recheckReturned).length,
    [trips]
  );
  const flaggedTotalCount = flaggedUnderReviewCount + flaggedReturnedCount;

  const trucksOnTripIds = useMemo(
    () =>
      new Set(
        trips
          .filter(isActiveTrip)
          .map((t) => t.vehicleId)
          .filter(Boolean)
      ),
    [trips]
  );

  // Free for a new trip: not sold, and not on an Assigned or running trip.
  const [availableOpen, setAvailableOpen] = useState(false);
  const { availableTrucks, bookedTruckCount } = useMemo(() => {
    const busy = new Set(trips.filter((t) => BUSY_TRIP_STATUSES.includes(t.status)).map((t) => t.vehicleId));
    const booked = new Set(trips.filter((t) => t.status === "Assigned").map((t) => t.vehicleId));
    return {
      availableTrucks: trucks.filter((t) => !t.soldDate && !busy.has(t.truckId)),
      bookedTruckCount: [...booked].filter((id) => !trucksOnTripIds.has(id)).length,
    };
  }, [trips, trucks, trucksOnTripIds]);

  // ── People ────────────────────────────────────────────────────────────────
  const driverById = useMemo(
    () => new Map(drivers.map((d) => [d.driverId, d])),
    [drivers]
  );
  const truckByVehicleId = useMemo(
    () => new Map(trucks.map((t) => [t.truckId, t])),
    [trucks]
  );

  const driverAttendanceToday = useMemo(() => {
    const counts = { Present: 0, Absent: 0, "On Leave": 0, "Not Marked": 0 };
    for (const driver of drivers) {
      const record = driverAttendance.find((r) => r.driverId === driver.id && r.date === today);
      counts[(record?.status ?? "Not Marked") as keyof typeof counts] += 1;
    }
    return counts;
  }, [drivers, driverAttendance, today]);

  const staffAttendanceToday = useMemo(() => {
    const counts = { Present: 0, Absent: 0, "On Leave": 0, "Not Marked": 0 };
    for (const member of staffList) {
      const record = staffAttendance.find((r) => r.staffId === member.id && r.date === today);
      counts[(record?.status ?? "Not Marked") as keyof typeof counts] += 1;
    }
    return counts;
  }, [staffList, staffAttendance, today]);

  const leaveSummary = useMemo(() => {
    const counts = { Pending: 0, Approved: 0, Rejected: 0 };
    for (const request of leaveRequests) counts[request.status] += 1;
    return counts;
  }, [leaveRequests]);

  const pendingLeaveRequests = useMemo(
    () => leaveRequests.filter((r) => r.status === "Pending"),
    [leaveRequests]
  );

  // ── Finance ───────────────────────────────────────────────────────────────
  const monthlyEmiTotal = useMemo(
    () => emiRecords.reduce((sum, emi) => sum + (Number(emi.emiAmount) || 0), 0),
    [emiRecords]
  );

  const activeRecurringPayments = useMemo(
    () => recurringPayments.filter((p) => p.status === "Active"),
    [recurringPayments]
  );

  const monthlyRecurringTotal = useMemo(
    () =>
      activeRecurringPayments.reduce(
        (sum, p) => sum + p.amount / (RECURRING_FREQUENCY_DIVISOR[p.frequency] ?? 1),
        0
      ),
    [activeRecurringPayments]
  );

  // ── Derived totals ────────────────────────────────────────────────────────
  const presentToday = driverAttendanceToday.Present + staffAttendanceToday.Present;
  const totalWorkforce = drivers.length + staffList.length;
  const trucksOnTripCount = trucksOnTripIds.size;
  const trucksAvailableCount = trucks.length - trucksOnTripCount;

  const ADMIN_TABS = [
    { key: "overview"     as const, label: "Admin Overview",  icon: Activity },
    { key: "commercial"   as const, label: "Commercial Manager",  icon: Navigation },
    { key: "accounts"     as const, label: "Accounts",        icon: Wallet },
    { key: "yard"         as const, label: "Yard Supervisor", icon: CheckCircle2 },
    { key: "tripsheet"    as const, label: "Trip Sheet Reg.", icon: Inbox },
    { key: "maintenance"  as const, label: "Maintenance",     icon: Wrench },
  ];

  const tabBar = (
    <div data-tour="dashboard-tabs" className="flex flex-wrap items-center gap-2.5">
      {ADMIN_TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => setActiveTab(key)}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-body-medium shadow-sm transition",
            activeTab === key
              ? "bg-accent-solid text-on-solid"
              : "border border-separator-border bg-background-primary-default text-text-secondary hover:border-border-button-default hover:bg-fill-2"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );

  if (loading && activeTab === "overview") {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="flex items-end justify-between">
          <div className="space-y-1.5">
            <div className="h-7 w-36 rounded-lg bg-fill-3" />
            <div className="h-4 w-60 rounded bg-fill-2" />
          </div>
          <div className="h-8 w-16 rounded-full bg-fill-3" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-separator-border bg-background-primary-default p-5">
              <div className="h-3 w-20 rounded bg-fill-3" />
              <div className="mt-3 h-8 w-16 rounded-lg bg-fill-3" />
              <div className="mt-2 h-3 w-28 rounded bg-fill-2" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[300px] rounded-xl border border-separator-border bg-background-primary-default p-5">
              <div className="h-4 w-32 rounded bg-fill-3 mb-1" />
              <div className="h-3 w-20 rounded bg-fill-2 mb-4" />
              <div className="h-[230px] rounded-lg bg-fill-2" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="h-52 rounded-xl border border-separator-border bg-background-primary-default lg:col-span-3" />
          <div className="h-52 rounded-xl border border-separator-border bg-background-primary-default lg:col-span-2" />
        </div>
      </div>
    );
  }

  // Today in IST, split up for the header's date badge.
  const istPart = (opts: Intl.DateTimeFormatOptions) =>
    new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", ...opts });
  const today_ = {
    weekday: istPart({ weekday: "long" }),
    day: istPart({ day: "numeric" }),
    month: istPart({ month: "short" }),
    monthLong: istPart({ month: "long" }),
    year: istPart({ year: "numeric" }),
  };

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {tabBar}

      {activeTab === "commercial" && <FleetManagerDashboard />}
      {activeTab === "accounts" && <FinanceManagerDashboard />}
      {activeTab === "yard" && <TripSheetCoordinatorDashboard />}
      {activeTab === "tripsheet" && <StaffDashboard />}
      {activeTab === "maintenance" && <TyreManagerDashboard />}

      {activeTab === "overview" && <>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      {/* relative z-30: keeps the open Backup menu above the cards below. */}
      <DashboardHero
        className="relative z-30 overflow-visible"
        role="Admin overview"
        description={
          loading
            ? "Loading today's fleet…"
            : `${trucks.length} trucks and ${drivers.length} drivers on record` +
              (complianceExpired.length > 0 ? ` · ${complianceExpired.length} documents expired` : "")
        }
        actions={
          <>
            <Link
              href="/trips/current"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent-solid px-4 text-body-medium text-on-solid outline-none transition-colors hover:bg-accent-solid-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <Truck className="size-4" />
              Current trips
            </Link>
          <div className="relative" ref={backupMenuRef}>
            <Button
              variant="secondary"
              onClick={() => setBackupMenuOpen((v) => !v)}
              disabled={backupLoading !== null}
              leadingIcon={backupLoading !== null ? Loader2 : Download}
              trailingIcon={ChevronDown}
            >
              {backupLoading !== null ? "Downloading…" : "Backup"}
            </Button>

            {backupMenuOpen && (
              <div className="absolute left-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-separator-border bg-background-primary-default py-1.5 shadow-lg">
                {(
                  [
                    { key: "excel", label: "Download Excel", icon: FileSpreadsheet, chip: "bg-success-surface-strong text-success-text" },
                    { key: "sql", label: "Download SQL", icon: Database, chip: "bg-purple-surface-strong text-purple-text" },
                    { key: "files", label: "Download Files (ZIP)", icon: FolderArchive, chip: "bg-warning-surface-strong text-warning-text" },
                  ] as const
                ).map(({ key, label, icon: Icon, chip }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleBackup(key)}
                    disabled={backupLoading !== null}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-medium text-text-primary transition-colors hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${chip}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          </>
        }
      />

      <DailySummaryCard />

      {/* ── Current Trips ────────────────────────────────────────────────── */}
      <CurrentTripsCard />

      {/* ── Compliance Alert Banner ─────────────────────────────────────── */}
      {(complianceExpired.length > 0 || complianceExpiringSoon.length > 0) && (() => {
        const hasExpired = complianceExpired.length > 0;
        const groupByLabel = (items: { truckId: string; label: string }[]) => {
          const map = new Map<string, string[]>();
          for (const it of items) map.set(it.label, [...(map.get(it.label) ?? []), it.truckId]);
          return [...map.entries()].sort((x, y) => y[1].length - x[1].length);
        };
        const sections = [
          { key: "expired", title: "Expired", groups: groupByLabel(complianceExpired), chip: "border-danger-border bg-background-primary-default text-danger-text", dot: "bg-danger-solid", count: "bg-danger-surface-strong text-danger-text" },
          { key: "soon", title: "Expiring soon", groups: groupByLabel(complianceExpiringSoon), chip: "border-warning-border bg-background-primary-default text-warning-text", dot: "bg-warning-solid", count: "bg-warning-surface-strong text-warning-text" },
        ].filter((sec) => sec.groups.length > 0);
        const total = hasExpired ? complianceExpired.length : complianceExpiringSoon.length;
        const truckCount = new Set((hasExpired ? complianceExpired : complianceExpiringSoon).map((i) => i.truckId)).size;
        return (
          <div className={cn(
            "overflow-hidden rounded-2xl border bg-background-primary-default shadow-sm",
            hasExpired ? "border-danger-border/80" : "border-warning-border/80"
          )}>
            <div className="flex items-center gap-3 px-5 py-3.5">
              <span className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                hasExpired ? "bg-danger-surface-strong text-danger-text" : "bg-warning-surface-strong text-warning-text"
              )}>
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-semibold text-text-primary">
                  {hasExpired
                    ? `${total} document${total === 1 ? " has" : "s have"} expired`
                    : `${total} document${total === 1 ? " is" : "s are"} expiring soon`}
                </p>
                <p className="text-xs text-text-secondary">
                  {hasExpired ? "Renewal required" : "Renew soon"} · {truckCount} truck{truckCount === 1 ? "" : "s"} affected
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/resources/fleet")}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-caption-1-semibold text-on-solid shadow-sm transition duration-300 hover:shadow-md",
                  hasExpired ? "bg-danger-solid hover:bg-danger-solid-hover" : "bg-warning-solid hover:bg-warning-solid-hover"
                )}
              >
                View Fleet
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className={cn("flex flex-col gap-2.5 border-t px-5 py-3", hasExpired ? "border-danger-border" : "border-warning-border")}>
              {sections.map((sec) =>
                sec.groups.map(([label, trucks]) => (
                  <div key={`${sec.key}-${label}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="flex w-40 shrink-0 items-center gap-2 text-caption-2-semibold text-text-secondary">
                      {label}
                      <span className={cn("rounded-full px-1.5 py-0.5 text-caption-2-semibold tabular-nums", sec.count)}>{trucks.length}</span>
                      {sections.length > 1 && <span className="font-medium normal-case tracking-normal text-text-tertiary">· {sec.title.toLowerCase()}</span>}
                    </span>
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {trucks.map((truckId, i) => (
                        <span key={`${truckId}-${i}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-caption-2-medium", sec.chip)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", sec.dot)} />
                          {truckId}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Today's Fuel Rate ────────────────────────────────────────────── */}
      {(() => {
        const updatedToday = inDateRange(fuelRate.updatedAt, today, today);
        return (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-separator-border bg-background-primary-default px-5 py-3.5 shadow-sm">
            <span className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              updatedToday ? "bg-success-surface text-success-text" : "bg-warning-surface text-warning-text"
            )}>
              <Fuel className="h-5 w-5" />
            </span>

            {/* Label + current value */}
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-caption-2-semibold text-text-tertiary">Today&apos;s Fuel Rate</p>
              <span className="text-title-2-semibold tabular-nums text-text-primary">
                {fuelRate.costPerLitre !== null ? (
                  <>
                    ₹{Number(fuelRate.costPerLitre).toFixed(2)}
                    <span className="ml-1 text-body-medium text-text-tertiary">/ L</span>
                  </>
                ) : "Not set"}
              </span>
            </div>

            {/* One status: fresh today, or due with the date the rate was set */}
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption-2-semibold",
              updatedToday ? "border-success-border bg-success-surface text-success-text" : "border-warning-border bg-warning-surface text-warning-text"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", updatedToday ? "bg-success-solid" : "bg-warning-solid")} />
              {updatedToday
                ? "Updated today"
                : fuelRate.updatedAt
                  ? `Update due · Set on ${formatDateWithMonth(fuelRate.updatedAt)}`
                  : "Update due"}
            </span>

            {/* Always-visible input + button */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-3.5 shadow-sm transition focus-within:border-accent-border-strong focus-within:ring-2 focus-within:ring-accent-border">
                <span className="text-sm text-text-tertiary">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fuelRateInput}
                  onChange={(e) => setFuelRateInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveFuelRate(); }}
                  className="w-24 bg-transparent text-body-semibold tabular-nums text-text-primary outline-none placeholder:font-normal placeholder:text-text-placeholder"
                  placeholder="e.g. 102.50"
                />
                <span className="text-xs text-text-tertiary">/ L</span>
              </div>
              <button
                type="button"
                onClick={handleSaveFuelRate}
                disabled={fuelRateSaving || !fuelRateInput}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-4 text-caption-1-semibold text-on-solid shadow-sm transition duration-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-sm",
                  updatedToday ? "bg-success-solid hover:bg-success-solid-hover" : "bg-warning-solid hover:bg-warning-solid-hover"
                )}
              >
                <Pencil className="h-3 w-3" />
                {fuelRateSaving ? "Saving…" : "Update"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Section 1: Fleet status ─────────────────────────────────────── */}
      {availableOpen && (
        <AvailableVehiclesDialog open trucks={availableTrucks} onClose={() => setAvailableOpen(false)} />
      )}
      <FleetStatusPanel
        segments={[
          {
            key: "active-trips", kind: "count",
            label: "Active trips", icon: Navigation,
            value: String(activeTripsCount),
            caption: `${tripStatusCounts.Completed} completed · ${trips.length} total`,
            onClick: () => router.push("/trips/current"),
          },
          {
            key: "fleet-on-road", kind: "ratio",
            label: "Fleet on road", icon: Truck,
            numerator: trucksOnTripCount, denominator: trucks.length,
            tone: trucksOnTripCount > 0 ? "neutral" : "good",
            caption: `${trucksAvailableCount} truck${trucksAvailableCount !== 1 ? "s" : ""} available`,
            onClick: () => router.push("/trips/current"),
          },
          {
            key: "available-vehicles", kind: "count", tour: "available-vehicles",
            label: "Available vehicles", icon: Truck,
            value: String(availableTrucks.length),
            tone: availableTrucks.length === 0 ? "warn" : "good",
            caption: `${bookedTruckCount} booked · ${trucksOnTripCount} on road`,
            onClick: () => setAvailableOpen(true),
          },
          {
            key: "present-today", kind: "ratio",
            label: "Present today", icon: UserCheck,
            numerator: presentToday, denominator: totalWorkforce,
            tone: totalWorkforce > 0 && presentToday < totalWorkforce * 0.7 ? "warn" : "good",
            caption: `${leaveSummary.Pending} leave request${leaveSummary.Pending !== 1 ? "s" : ""} pending`,
            onClick: () => router.push("/attendance/report"),
          },
          {
            key: "customers", kind: "count",
            label: "Customers", icon: UserCheck,
            value: String(customers.length),
            caption: `${vendors.length} vendor${vendors.length !== 1 ? "s" : ""} registered`,
            onClick: () => router.push("/resources/customers"),
          },
          {
            key: "monthly-fixed", kind: "count",
            label: "Monthly fixed", icon: Wallet,
            value: formatCurrency(monthlyEmiTotal + monthlyRecurringTotal),
            caption: `${emiRecords.length} EMI · ${activeRecurringPayments.length} recurring`,
          },
        ]}
      />

      {/* ── Section 1b: Audit ────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-body-semibold text-text-tertiary">Audit</h2>
        <FleetStatusPanel
          segments={[
            flaggedUnderReviewCount > 0
              ? {
                  key: "flagged-trips", kind: "alert",
                  label: "Flagged trips", icon: Flag,
                  value: String(flaggedTotalCount), active: true,
                  caption: `${flaggedUnderReviewCount} under review · ${flaggedReturnedCount} returned`,
                  onClick: () => router.push("/trips/flagged"),
                }
              : {
                  key: "flagged-trips", kind: "count",
                  label: "Flagged trips", icon: Flag,
                  value: String(flaggedTotalCount),
                  tone: flaggedTotalCount > 0 ? "warn" : "good",
                  caption: `${flaggedUnderReviewCount} under review · ${flaggedReturnedCount} returned`,
                  onClick: () => router.push("/trips/flagged"),
                },
            {
              key: "audit-verified", kind: "count",
              label: "Audit verified", icon: CheckCircle2,
              value: String(auditVerifiedTrips.length),
              tone: "good",
              caption: "Trips Audit has signed off on",
              onClick: () => router.push("/trips/audit-verified"),
            },
          ]}
        />
      </div>

      {/* ── Trip Sheet Tracking ─────────────────────────────────────────── */}
      {(() => {
        const fmtDate = (d: string | null) => {
          if (!d) return "—";
          let dt: Date;
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            const [y, m, day] = d.split("-").map(Number);
            dt = new Date(y, m - 1, day);
          } else {
            const s = d.endsWith("Z") || d.includes("+") ? d : d + "Z";
            dt = new Date(s);
          }
          return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/\//g, "-");
        };

        const completedTrips    = trips.filter((t) => t.status === "Completed");
        const sheetsDelivered   = completedTrips.filter((t) => t.tripSheetCollected);
        const sheetsReceived    = sheetsDelivered.filter((t) => t.tripSheetReceived);
        const awaitingReceipt   = sheetsDelivered.filter((t) => !t.tripSheetReceived);
        // Register card: any completed trip that was received OR already entered
        const receivedOrEntered = completedTrips.filter((t) => t.tripSheetReceived || !!t.tripSheetDate);
        const pendingEntry      = receivedOrEntered.filter((t) => !t.tripSheetDate);
        const entered           = receivedOrEntered.filter((t) => !!t.tripSheetDate);

        // Delivered card: filter by status tab + delivered date
        let deliveredVisible = sheetDeliveredFilter === "Awaiting Receipt"
          ? awaitingReceipt
          : sheetDeliveredFilter === "Received"
          ? sheetsReceived
          : sheetsDelivered;
        if (sheetDeliveredDate) {
          deliveredVisible = deliveredVisible.filter((t) =>
            t.tripSheetCollectedAt?.slice(0, 10) === sheetDeliveredDate
          );
        }

        // Received card: filter by status tab + received date + entry date
        let receivedVisible = sheetReceivedFilter === "Pending Entry"
          ? pendingEntry
          : sheetReceivedFilter === "Entered"
          ? entered
          : receivedOrEntered;
        if (sheetReceivedDate) {
          receivedVisible = receivedVisible.filter((t) =>
            t.tripSheetReceivedAt?.slice(0, 10) === sheetReceivedDate
          );
        }
        if (sheetEnteredDate) {
          receivedVisible = receivedVisible.filter((t) =>
            t.tripSheetDate === sheetEnteredDate
          );
        }

        return (
          <div>
            <h2 className="mb-3 text-body-semibold text-text-tertiary">Trip Sheet Tracking</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

              {/* Delivered by Yard Supervisor */}
              <SheetTrackingCard
                title="Delivered by Yard Supervisor"
                icon={FileCheck2}
                tone="emerald"
                total={sheetsDelivered.length}
                tabs={[
                  { key: "All", label: "All", count: sheetsDelivered.length },
                  { key: "Awaiting Receipt", label: "Awaiting Receipt", count: awaitingReceipt.length },
                  { key: "Received", label: "Received", count: sheetsReceived.length },
                ]}
                activeTab={sheetDeliveredFilter}
                onTabChange={(k) => setSheetDeliveredFilter(k as typeof sheetDeliveredFilter)}
                dates={[{ label: "Delivered on", value: sheetDeliveredDate, onChange: setSheetDeliveredDate }]}
                visibleCount={deliveredVisible.length}
                items={deliveredVisible.map((t) => ({
                  id: t.id,
                  tripId: t.tripId,
                  reference: t.bookingReferenceNo,
                  badge: t.tripSheetReceived
                    ? { label: "Received", tone: "blue" as const }
                    : { label: "Awaiting Receipt", tone: "amber" as const },
                  meta: [{ label: "Delivered", value: fmtDate(t.tripSheetCollectedAt) }],
                }))}
              />

              {/* Received by Trip Sheet Register */}
              <SheetTrackingCard
                title="Received by Trip Sheet Register"
                icon={Inbox}
                tone="blue"
                total={receivedOrEntered.length}
                tabs={[
                  { key: "All", label: "All", count: receivedOrEntered.length },
                  { key: "Pending Entry", label: "Pending Entry", count: pendingEntry.length },
                  { key: "Entered", label: "Entered", count: entered.length },
                ]}
                activeTab={sheetReceivedFilter}
                onTabChange={(k) => setSheetReceivedFilter(k as typeof sheetReceivedFilter)}
                dates={[
                  { label: "Received on", value: sheetReceivedDate, onChange: setSheetReceivedDate },
                  { label: "Entered on", value: sheetEnteredDate, onChange: setSheetEnteredDate },
                ]}
                visibleCount={receivedVisible.length}
                items={receivedVisible.map((t) => ({
                  id: t.id,
                  tripId: t.tripId,
                  reference: t.bookingReferenceNo,
                  badge: t.tripSheetDate
                    ? { label: "Entered", tone: "emerald" as const }
                    : { label: "Pending Entry", tone: "amber" as const },
                  meta: [
                    { label: "Received", value: fmtDate(t.tripSheetReceivedAt) },
                    ...(t.tripSheetDate ? [{ label: "Entered", value: fmtDate(t.tripSheetDate) }] : []),
                  ],
                }))}
              />
            </div>
            {awaitingReceipt.length > 0 && (
              <p className="mt-2 text-caption-1-medium text-warning-text">
                {awaitingReceipt.length} sheet{awaitingReceipt.length > 1 ? "s" : ""} delivered but not yet confirmed received.
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Edit Approval Requests ───────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body-semibold text-text-tertiary">Edit Approval Requests</h2>
          <Link
            href="/attendance/edit-approvals"
            className="group flex h-8 items-center gap-1.5 rounded-full border border-purple-border bg-background-primary-default px-4 text-caption-1-semibold text-purple-text shadow-sm transition duration-300 hover:border-purple-border-strong hover:bg-purple-surface-strong hover:shadow-md"
          >
            Open Edit Approvals
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300" />
          </Link>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-purple-border/70 bg-purple-surface/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-surface-strong text-purple-text">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h3 className="text-body-semibold text-text-primary">Pending Requests</h3>
            </div>
            <span className="rounded-full bg-purple-surface-strong px-3 py-0.5 text-body-semibold tabular-nums text-purple-text">
              {pendingEditApprovals.length}
            </span>
          </div>
          {pendingEditApprovals.length === 0 ? (
            <p className="py-4 text-center text-xs text-text-tertiary">No pending edit requests.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pendingEditApprovals.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link
                    href="/attendance/edit-approvals"
                    className="flex items-center gap-3 rounded-xl border border-separator-border bg-background-primary-default px-3 py-2 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-purple-border"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-surface-strong text-caption-2-semibold uppercase text-purple-text">
                      {r.staffName?.trim().charAt(0) || "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text-primary">{r.staffName}</span>
                      <span className="block truncate text-[11px] text-text-secondary">
                        {r.action} <span className="font-mono text-text-primary">{r.resourceName}</span>
                      </span>
                    </span>
                    <span className="hidden shrink-0 rounded-full bg-fill-2 px-2 py-0.5 text-caption-2-semibold text-text-secondary sm:inline">
                      {r.resourceType}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-surface px-2 py-0.5 text-caption-2-semibold text-warning-text">
                      <span className="h-1 w-1 rounded-full bg-current" />
                      Pending
                    </span>
                  </Link>
                </li>
              ))}
              {pendingEditApprovals.length > 6 && (
                <li className="px-1 pt-0.5 text-[11px] text-text-tertiary">
                  <Link href="/attendance/edit-approvals" className="font-medium text-purple-text hover:text-purple-text-strong">
                    +{pendingEditApprovals.length - 6} more
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* ── Booking Horizon ─────────────────────────────────────────────── */}
      {(() => {
        const ACTIVE = new Set(["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);
        const activeTrips = trips.filter((t) => ACTIVE.has(t.status));

        // Group by scheduledDate — shows how many trips are booked per day
        const byDate = new Map<string, Trip[]>();
        for (const t of activeTrips) {
          const d = t.scheduledDate || t.assignedDate;
          if (!d) continue;
          if (!byDate.has(d)) byDate.set(d, []);
          byDate.get(d)!.push(t);
        }
        const sortedDates = [...byDate.keys()].sort();
        const latestDate = sortedDates[sortedDates.length - 1] ?? null;

        const fmtD = (d: string) => {
          const [y, m, day] = d.split("-").map(Number);
          return new Date(y, m - 1, day).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
        };
        const dayName = (d: string) => {
          const [y, m, day] = d.split("-").map(Number);
          return new Date(y, m - 1, day).toLocaleDateString("en-IN", { weekday: "short" });
        };

        const past   = sortedDates.filter((d) => d < today);
        const upcoming = sortedDates.filter((d) => d >= today);

        return (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-body-semibold text-text-tertiary">Booking Horizon</h2>
              {latestDate && (
                <span className="flex items-center gap-2 rounded-full border border-separator-border bg-background-primary-default px-3.5 py-1.5 text-xs text-text-secondary shadow-sm">
                  <CalendarDays className="h-3.5 w-3.5 text-purple-text" />
                  Booked up to <span className="font-semibold tabular-nums text-text-primary">{fmtD(latestDate)}</span>
                </span>
              )}
            </div>
            <div className="rounded-2xl border border-purple-border/70 bg-purple-surface/80 p-4 shadow-sm">
              {sortedDates.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-tertiary">No active bookings found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Summary strip */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-surface-strong px-3 py-1 font-semibold text-purple-text">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-solid" />
                      {activeTrips.length} active trip{activeTrips.length !== 1 ? "s" : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-3 py-1 font-semibold text-text-secondary">
                      <CalendarDays className="h-3 w-3 text-text-tertiary" />
                      {sortedDates.length} date{sortedDates.length !== 1 ? "s" : ""} booked
                    </span>
                    {past.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-surface px-3 py-1 font-semibold text-warning-text ring-1 ring-inset ring-warning-border">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning-solid" />
                        {past.reduce((s, d) => s + byDate.get(d)!.length, 0)} trip{past.reduce((s, d) => s + byDate.get(d)!.length, 0) !== 1 ? "s" : ""} on past dates still active
                      </span>
                    )}
                  </div>

                  {/* Date rows */}
                  <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1">
                    {sortedDates.map((d) => {
                      const tripsOnDay = byDate.get(d)!;
                      const isPast = d < today;
                      const isToday = d === today;
                      return (
                        <div
                          key={d}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${
                            isToday
                              ? "border-purple-border bg-purple-surface"
                              : isPast
                              ? "border-warning-border/70 bg-warning-surface/60"
                              : "border-separator-border bg-background-primary-default"
                          }`}
                        >
                          <span className={`w-9 shrink-0 text-caption-2-semibold ${isPast ? "text-warning-text" : isToday ? "text-purple-text" : "text-text-tertiary"}`}>
                            {dayName(d)}
                          </span>
                          <span className={`flex w-40 shrink-0 items-center gap-2 font-semibold tabular-nums ${isPast ? "text-warning-text-strong" : isToday ? "text-purple-text-strong" : "text-text-primary"}`}>
                            {fmtD(d)}
                            {isToday && <span className="rounded-full bg-purple-solid px-2 py-0.5 text-[9px] font-semibold text-on-solid">Today</span>}
                            {isPast && <span className="rounded-full bg-warning-surface-strong px-2 py-0.5 text-[9px] font-semibold text-warning-text">Past</span>}
                          </span>
                          <div className="flex flex-1 flex-wrap gap-1">
                            {tripsOnDay.slice(0, 8).map((t) => (
                              <span key={t.id} className="rounded-md bg-background-primary-default px-1.5 py-0.5 font-mono text-caption-2-medium text-text-secondary ring-1 ring-inset ring-separator-border">
                                {t.tripId}
                              </span>
                            ))}
                            {tripsOnDay.length > 8 && (
                              <span className="text-[10px] text-text-tertiary">+{tripsOnDay.length - 8} more</span>
                            )}
                          </div>
                          <span className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-2 text-caption-2-semibold tabular-nums ${isPast ? "bg-warning-surface-strong text-warning-text" : isToday ? "bg-purple-surface-strong text-purple-text-strong" : "bg-success-surface-strong text-success-text"}`}>
                            {tripsOnDay.length}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {upcoming.length > 0 && (
                    <p className="text-[11px] text-text-tertiary">
                      Next booking: <span className="font-semibold text-text-secondary">{fmtD(upcoming[0])}</span>
                      {" · "}Furthest booking: <span className="font-semibold text-text-secondary">{fmtD(latestDate!)}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Section 2: Visual Charts ────────────────────────────────────── */}
      {/* Row 1: Lane Map + Fleet Constellation */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LaneMapCard trips={trips} />
        <FleetConstellationCard trucks={trucks} trips={trips} />
      </div>

      {/* Row 2: Trip Trend (full width) */}
      <TripTrendChart trips={trips} />

      {/* ── Section 3: Attendance + Pending Leave ───────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttendanceTodayCard
          dateLabel={fmtDate(today)}
          drivers={{ total: drivers.length, counts: driverAttendanceToday }}
          staff={{ total: staffList.length, counts: staffAttendanceToday }}
        />
        <PendingLeaveCard requests={pendingLeaveRequests} pendingCount={leaveSummary.Pending} />
      </div>

      {/* ── Section 6: Compliance Overview ──────────────────────────────── */}
      <ComplianceOverviewCard trucks={trucks} />

      </>}
    </div>
  );
}
