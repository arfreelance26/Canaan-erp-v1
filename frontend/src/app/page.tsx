"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FleetManagerDashboard } from "@/components/dashboard/FleetManagerDashboard";
import { TyreManagerDashboard } from "@/components/dashboard/TyreManagerDashboard";
import { FinanceManagerDashboard } from "@/components/dashboard/FinanceManagerDashboard";
import { StaffDashboard } from "@/components/dashboard/StaffDashboard";
import { TripSheetCoordinatorDashboard } from "@/components/dashboard/TripSheetCoordinatorDashboard";
import { AuditorDashboard } from "@/components/dashboard/AuditorDashboard";
import { CurrentTripsCard } from "@/components/dashboard/CurrentTripsCard";
import { SheetTrackingCard } from "@/components/dashboard/SheetTrackingCard";
import Link from "next/link";
import {
  Truck,
  Navigation,
  ClipboardList,
  AlertTriangle,
  Activity,
  Wrench,
  ShieldCheck,
  Wallet,
  CheckCircle2,
  UserCheck,
  FileCheck2,
  Inbox,
  FileSpreadsheet,
  Database,
  FolderArchive,
  ArrowRight,
  CalendarDays,
  Loader2,
  Fuel,
  Pencil,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/StatCard";
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
} from "@/lib/api";
import type { TruckMaintenanceStatus } from "@/types/maintenance-status";
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
import { todayIst } from "@/lib/format-date";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { LaneMapCard } from "@/components/dashboard/LaneMapCard";
import { ComplianceOverviewCard } from "@/components/dashboard/ComplianceOverviewCard";
import { AttendanceTodayCard } from "@/components/dashboard/AttendanceTodayCard";
import { PendingLeaveCard } from "@/components/dashboard/PendingLeaveCard";
import { FleetConstellationCard } from "@/components/dashboard/FleetConstellationCard";
import { TripTrendChart } from "@/components/dashboard/TripTrendChart";

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
  const [maintenanceStatus, setMaintenanceStatus] = useState<TruckMaintenanceStatus[]>([]);
  const [tyreInventory, setTyreInventory] = useState<TyreInventoryItem[]>([]);
  const [emiRecords, setEmiRecords] = useState<EmiRecord[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "commercial" | "accounts" | "yard" | "tripsheet" | "maintenance">("overview");
  const [sheetDeliveredFilter, setSheetDeliveredFilter] = useState<"All" | "Awaiting Receipt" | "Received">("All");
  const [sheetDeliveredDate, setSheetDeliveredDate] = useState("");
  const [sheetReceivedFilter, setSheetReceivedFilter] = useState<"All" | "Pending Entry" | "Entered">("All");
  const [sheetReceivedDate, setSheetReceivedDate] = useState("");
  const [sheetEnteredDate, setSheetEnteredDate] = useState("");
  const [backupLoading, setBackupLoading] = useState<"excel" | "sql" | "files" | null>(null);
  const [fuelRate, setFuelRate] = useState<{ costPerLitre: number | null; updatedAt: string | null }>({ costPerLitre: null, updatedAt: null });
  const [fuelRateInput, setFuelRateInput] = useState("");
  const [fuelRateSaving, setFuelRateSaving] = useState(false);

  const today = todayIst();

  async function handleBackup(type: "excel" | "sql" | "files") {
    setBackupLoading(type);
    const extMap = { excel: "xlsx", sql: "sql", files: "zip" } as const;
    const fallbackName = type === "files" ? "canaan_erp_files.zip" : `canaan_erp_backup.${extMap[type]}`;
    try {
      await downloadExcel(`/backup/${type}`, fallbackName);
    } catch (err) {
      alert(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
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
      alert("Failed to update fuel rate. Please try again.");
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
    Promise.all([
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
      maintenanceApi.getStatus(),
    ])
      .then(([t, d, s, c, v, tr, da, sa, lr, mr, ti, emi, rp, ms]) => {
        setTrucks(t);
        setDrivers(d);
        setStaffList(s);
        setCustomers(c);
        setVendors(v);
        setTrips(tr);
        setDriverAttendance(da);
        setStaffAttendance(sa);
        setLeaveRequests(lr);
        setMaintenanceRecords(mr);
        setTyreInventory(ti);
        setEmiRecords(emi);
        setRecurringPayments(rp);
        setMaintenanceStatus(ms);
      })
      .catch(() => {}).finally(() => setLoading(false));
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

  // ── Maintenance overdue (from DB-driven types) ────────────────────────────
  const maintenanceOverdueCount = useMemo(
    () => maintenanceStatus.reduce((sum, t) => sum + t.overdueCount, 0),
    [maintenanceStatus]
  );

  // ── Derived totals ────────────────────────────────────────────────────────
  const criticalAlerts = complianceCounts.Expired + maintenanceOverdueCount;
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
    <div className="flex flex-wrap items-center gap-2.5">
      {ADMIN_TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => setActiveTab(key)}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-all",
            activeTab === key
              ? "bg-blue-600 text-white shadow-blue-200"
              : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
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
            <div className="h-7 w-36 rounded-lg bg-slate-200" />
            <div className="h-4 w-60 rounded bg-slate-100" />
          </div>
          <div className="h-8 w-16 rounded-full bg-slate-200" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="mt-3 h-8 w-16 rounded-lg bg-slate-200" />
              <div className="mt-2 h-3 w-28 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[300px] rounded-xl border border-gray-200 bg-white p-5">
              <div className="h-4 w-32 rounded bg-slate-200 mb-1" />
              <div className="h-3 w-20 rounded bg-slate-100 mb-4" />
              <div className="h-[230px] rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="h-52 rounded-xl border border-gray-200 bg-white lg:col-span-3" />
          <div className="h-52 rounded-xl border border-gray-200 bg-white lg:col-span-2" />
        </div>
      </div>
    );
  }

  const dayLabel = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric", }).replace(/\//g, "-");

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {tabBar}

      {activeTab === "commercial" && <FleetManagerDashboard />}
      {activeTab === "accounts" && <FinanceManagerDashboard />}
      {activeTab === "yard" && <TripSheetCoordinatorDashboard />}
      {activeTab === "tripsheet" && <StaffDashboard />}
      {activeTab === "maintenance" && <TyreManagerDashboard />}

      {activeTab === "overview" && <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3.5">
            <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-400">
                Fleet command centre
                <span className="text-gray-300">·</span>
                <span className="font-medium text-gray-500">{dayLabel}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(
              [
                { key: "excel", label: "Download Excel", icon: FileSpreadsheet, tone: "emerald" },
                { key: "sql", label: "Download SQL", icon: Database, tone: "indigo" },
                { key: "files", label: "Download Files (ZIP)", icon: FolderArchive, tone: "amber" },
              ] as const
            ).map(({ key, label, icon: Icon, tone }) => {
              const busy = backupLoading === key;
              const styles = {
                emerald: "border-emerald-200/80 from-emerald-50 to-white text-emerald-800 hover:border-emerald-300 hover:shadow-emerald-200/60 [--chip:var(--color-emerald-100)] [--icon:var(--color-emerald-600)]",
                indigo: "border-indigo-200/80 from-indigo-50 to-white text-indigo-900 hover:border-indigo-300 hover:shadow-indigo-200/60 [--chip:var(--color-indigo-100)] [--icon:var(--color-indigo-600)]",
                amber: "border-amber-200/80 from-amber-50 to-white text-amber-800 hover:border-amber-300 hover:shadow-amber-200/60 [--chip:var(--color-amber-100)] [--icon:var(--color-amber-600)]",
              }[tone];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleBackup(key)}
                  disabled={backupLoading !== null}
                  className={`group flex h-11 items-center gap-2.5 rounded-full border bg-gradient-to-b py-1 pl-1.5 pr-5 text-sm font-semibold shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm ${styles}`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chip)] text-[var(--icon)] transition-transform duration-300 group-hover:scale-110">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  </span>
                  {busy ? "Downloading…" : label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
          { key: "expired", title: "Expired", groups: groupByLabel(complianceExpired), chip: "border-red-200 bg-white text-red-700", dot: "bg-red-500", count: "bg-red-100 text-red-700" },
          { key: "soon", title: "Expiring soon", groups: groupByLabel(complianceExpiringSoon), chip: "border-amber-200 bg-white text-amber-700", dot: "bg-amber-400", count: "bg-amber-100 text-amber-700" },
        ].filter((sec) => sec.groups.length > 0);
        const total = hasExpired ? complianceExpired.length : complianceExpiringSoon.length;
        const truckCount = new Set((hasExpired ? complianceExpired : complianceExpiringSoon).map((i) => i.truckId)).size;
        return (
          <div className={cn(
            "dk-inset overflow-hidden rounded-2xl border bg-gradient-to-r to-white shadow-sm",
            hasExpired ? "border-red-200/80 from-red-50" : "border-amber-200/80 from-amber-50"
          )}>
            <div className="flex items-center gap-3 px-5 py-3.5">
              <span className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                hasExpired ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
              )}>
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {hasExpired
                    ? `${total} document${total === 1 ? " has" : "s have"} expired`
                    : `${total} document${total === 1 ? " is" : "s are"} expiring soon`}
                </p>
                <p className="text-xs text-gray-500">
                  {hasExpired ? "Renewal required" : "Renew soon"} · {truckCount} truck{truckCount === 1 ? "" : "s"} affected
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/resources/fleet")}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md",
                  hasExpired ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                View Fleet
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className={cn("flex flex-col gap-2.5 border-t px-5 py-3", hasExpired ? "border-red-100" : "border-amber-100")}>
              {sections.map((sec) =>
                sec.groups.map(([label, trucks]) => (
                  <div key={`${sec.key}-${label}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="flex w-40 shrink-0 items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {label}
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums", sec.count)}>{trucks.length}</span>
                      {sections.length > 1 && <span className="font-medium normal-case tracking-normal text-gray-400">· {sec.title.toLowerCase()}</span>}
                    </span>
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {trucks.map((truckId, i) => (
                        <span key={`${truckId}-${i}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium", sec.chip)}>
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
        const updatedToday = fuelRate.updatedAt
          ? fuelRate.updatedAt.slice(0, 10) === today
          : false;
        return (
          <div className={cn(
            "dk-inset flex flex-wrap items-center gap-4 rounded-2xl border bg-gradient-to-r to-white px-5 py-3.5 shadow-sm",
            updatedToday ? "border-emerald-200/80 from-emerald-50" : "border-amber-200/80 from-amber-50"
          )}>
            <span className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              updatedToday ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
            )}>
              <Fuel className="h-4 w-4" />
            </span>

            {/* Label + current value */}
            <div className="flex min-w-0 flex-col">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Today&apos;s Fuel Rate</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums text-gray-900">
                  {fuelRate.costPerLitre !== null ? `₹ ${Number(fuelRate.costPerLitre).toFixed(2)} / L` : "Not set"}
                </span>
                {fuelRate.updatedAt && (
                  <span className="text-xs text-gray-500">
                    {updatedToday
                      ? "Updated today"
                      : `Last updated ${fuelRate.updatedAt.slice(0, 10).split("-").reverse().join("-")}`}
                  </span>
                )}
              </div>
            </div>

            {/* Always-visible input + button */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!updatedToday && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Update needed
                </span>
              )}
              <div className="flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 shadow-sm transition-all focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                <span className="text-sm text-gray-400">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fuelRateInput}
                  onChange={(e) => setFuelRateInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveFuelRate(); }}
                  className="w-24 bg-transparent text-sm font-semibold tabular-nums text-gray-800 outline-none placeholder:font-normal placeholder:text-gray-300"
                  placeholder="e.g. 102.50"
                />
                <span className="text-xs text-gray-400">/ L</span>
              </div>
              <button
                type="button"
                onClick={handleSaveFuelRate}
                disabled={fuelRateSaving || !fuelRateInput}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-sm",
                  updatedToday ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                <Pencil className="h-3 w-3" />
                {fuelRateSaving ? "Saving…" : "Update"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Section 1: Hero KPIs ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
        <StatCard
          label="Active Trips"
          value={String(activeTripsCount)}
          caption={`${tripStatusCounts.Completed} completed · ${trips.length} total`}
          icon={Navigation}
          variant="blue"
          onClick={() => router.push("/trips/current")}
        />
        <StatCard
          label="Fleet on Road"
          value={`${trucksOnTripCount}/${trucks.length}`}
          caption={`${trucksAvailableCount} truck${trucksAvailableCount !== 1 ? "s" : ""} available`}
          icon={Truck}
          variant={trucksOnTripCount > 0 ? "default" : "emerald"}
          onClick={() => router.push("/trips/current")}
        />
        <StatCard
          label="Urgent Alerts"
          value={String(criticalAlerts)}
          caption={`${complianceCounts.Expired} docs expired · ${maintenanceOverdueCount} maint. overdue`}
          icon={AlertTriangle}
          variant={criticalAlerts > 0 ? "red" : "emerald"}
        />
        <StatCard
          label="Present Today"
          value={`${presentToday}/${totalWorkforce}`}
          caption={`${leaveSummary.Pending} leave request${leaveSummary.Pending !== 1 ? "s" : ""} pending`}
          icon={UserCheck}
          variant={totalWorkforce > 0 && presentToday < totalWorkforce * 0.7 ? "amber" : "emerald"}
          onClick={() => router.push("/attendance/report")}
        />
        <StatCard
          label="Customers"
          value={String(customers.length)}
          caption={`${vendors.length} vendor${vendors.length !== 1 ? "s" : ""} registered`}
          icon={UserCheck}
          variant="purple"
          onClick={() => router.push("/resources/customers")}
        />
        <StatCard
          label="Monthly Fixed"
          value={formatCurrency(monthlyEmiTotal + monthlyRecurringTotal)}
          caption={`${emiRecords.length} EMI · ${activeRecurringPayments.length} recurring`}
          icon={Wallet}
          variant="default"
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
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Trip Sheet Tracking</h2>
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
              <p className="mt-2 text-xs font-medium text-amber-600">
                {awaitingReceipt.length} sheet{awaitingReceipt.length > 1 ? "s" : ""} delivered but not yet confirmed received.
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Edit Approval Requests ───────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Edit Approval Requests</h2>
          <Link
            href="/attendance/edit-approvals"
            className="group flex h-8 items-center gap-1.5 rounded-full border border-purple-200 bg-white px-4 text-xs font-semibold text-purple-700 shadow-sm transition-all duration-300 hover:scale-105 hover:border-purple-300 hover:bg-purple-50 hover:shadow-md"
          >
            Open Edit Approvals
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="dk-inset flex flex-col gap-3 rounded-2xl border border-purple-200/70 bg-gradient-to-b from-purple-50/80 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold text-gray-900">Pending Requests</h3>
            </div>
            <span className="rounded-full bg-purple-100 px-3 py-0.5 text-sm font-bold tabular-nums text-purple-700">
              {pendingEditApprovals.length}
            </span>
          </div>
          {pendingEditApprovals.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">No pending edit requests.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pendingEditApprovals.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link
                    href="/attendance/edit-approvals"
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-purple-200"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[11px] font-bold uppercase text-purple-700">
                      {r.staffName?.trim().charAt(0) || "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-gray-900">{r.staffName}</span>
                      <span className="block truncate text-[11px] text-gray-500">
                        {r.action} <span className="font-mono text-gray-700">{r.resourceName}</span>
                      </span>
                    </span>
                    <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 sm:inline">
                      {r.resourceType}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      <span className="h-1 w-1 rounded-full bg-current" />
                      Pending
                    </span>
                  </Link>
                </li>
              ))}
              {pendingEditApprovals.length > 6 && (
                <li className="px-1 pt-0.5 text-[11px] text-gray-400">
                  <Link href="/attendance/edit-approvals" className="font-medium text-purple-600 hover:text-purple-800">
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
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Booking Horizon</h2>
              {latestDate && (
                <span className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs text-gray-500 shadow-sm">
                  <CalendarDays className="h-3.5 w-3.5 text-indigo-500" />
                  Booked up to <span className="font-semibold tabular-nums text-gray-900">{fmtD(latestDate)}</span>
                </span>
              )}
            </div>
            <div className="dk-inset rounded-2xl border border-indigo-200/70 bg-gradient-to-b from-indigo-50/80 to-white p-4 shadow-sm">
              {sortedDates.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">No active bookings found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Summary strip */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 font-semibold text-indigo-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      {activeTrips.length} active trip{activeTrips.length !== 1 ? "s" : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 font-semibold text-gray-600">
                      <CalendarDays className="h-3 w-3 text-gray-400" />
                      {sortedDates.length} date{sortedDates.length !== 1 ? "s" : ""} booked
                    </span>
                    {past.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
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
                              ? "border-indigo-200 bg-indigo-50"
                              : isPast
                              ? "border-amber-200/70 bg-amber-50/60"
                              : "border-gray-100 bg-white"
                          }`}
                        >
                          <span className={`w-9 shrink-0 text-[11px] font-semibold uppercase tracking-wide ${isPast ? "text-amber-600" : isToday ? "text-indigo-600" : "text-gray-400"}`}>
                            {dayName(d)}
                          </span>
                          <span className={`flex w-40 shrink-0 items-center gap-2 font-semibold tabular-nums ${isPast ? "text-amber-800" : isToday ? "text-indigo-900" : "text-gray-800"}`}>
                            {fmtD(d)}
                            {isToday && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Today</span>}
                            {isPast && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Past</span>}
                          </span>
                          <div className="flex flex-1 flex-wrap gap-1">
                            {tripsOnDay.slice(0, 8).map((t) => (
                              <span key={t.id} className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                                {t.tripId}
                              </span>
                            ))}
                            {tripsOnDay.length > 8 && (
                              <span className="text-[10px] text-gray-400">+{tripsOnDay.length - 8} more</span>
                            )}
                          </div>
                          <span className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-bold tabular-nums ${isPast ? "bg-amber-100 text-amber-700" : isToday ? "bg-indigo-200 text-indigo-800" : "bg-emerald-100 text-emerald-700"}`}>
                            {tripsOnDay.length}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {upcoming.length > 0 && (
                    <p className="text-[11px] text-gray-400">
                      Next booking: <span className="font-semibold text-gray-600">{fmtD(upcoming[0])}</span>
                      {" · "}Furthest booking: <span className="font-semibold text-gray-600">{fmtD(latestDate!)}</span>
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
        <FleetConstellationCard trucks={trucks} trips={trips} maintenanceStatus={maintenanceStatus} />
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
