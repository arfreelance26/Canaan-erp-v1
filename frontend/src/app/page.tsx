"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FleetManagerDashboard } from "@/components/dashboard/FleetManagerDashboard";
import { TyreManagerDashboard } from "@/components/dashboard/TyreManagerDashboard";
import { FinanceManagerDashboard } from "@/components/dashboard/FinanceManagerDashboard";
import { StaffDashboard } from "@/components/dashboard/StaffDashboard";
import { TripSheetCoordinatorDashboard } from "@/components/dashboard/TripSheetCoordinatorDashboard";
import { CurrentTripsCard } from "@/components/dashboard/CurrentTripsCard";
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
  downloadExcel,
} from "@/lib/api";
import {
  getMaintenanceStatus,
  getTruckMaintenanceSummary,
} from "@/lib/truck-maintenance-data";
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
import type { CompensationTransaction } from "@/types/compensation";
import { todayIst } from "@/lib/format-date";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { TripStatusDonutChart } from "@/components/dashboard/TripStatusDonutChart";
import { FleetUtilizationChart } from "@/components/dashboard/FleetUtilizationChart";
import { TripTrendChart } from "@/components/dashboard/TripTrendChart";
import { FinanceBreakdownChart } from "@/components/dashboard/FuelConsumptionChart";

function formatCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

const TRIP_STATUS_BADGE: Record<TripStatus, string> = {
  Assigned: "bg-blue-100 text-blue-700",
  Started: "bg-indigo-100 text-indigo-700",
  Loaded: "bg-purple-100 text-purple-700",
  "On-Transit": "bg-yellow-100 text-yellow-700",
  Reached: "bg-teal-100 text-teal-700",
  Unloaded: "bg-cyan-100 text-cyan-700",
  Completed: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
};

const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  "Assigned",
  "Started",
  "Loaded",
  "On-Transit",
  "Reached",
  "Unloaded",
];

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

function ComplianceBadge({ date }: { date?: string | null }) {
  if (!date) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-400">
        N/A
      </span>
    );
  }
  const status = getComplianceStatus(date);
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        status === "Valid" && "bg-emerald-100 text-emerald-700",
        status === "Expiring Soon" && "bg-amber-100 text-amber-700",
        status === "Expired" && "bg-red-100 text-red-700"
      )}
    >
      {status === "Expiring Soon" ? "Soon" : status}
    </span>
  );
}

function AttendanceBar({
  label,
  count,
  total,
  barColor,
}: {
  label: string;
  count: number;
  total: number;
  barColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <p className="w-24 shrink-0 text-xs text-gray-500">{label}</p>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn("h-2 rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="w-8 shrink-0 text-right text-xs font-bold text-gray-700">{count}</p>
    </div>
  );
}

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
  const [tyreInventory, setTyreInventory] = useState<TyreInventoryItem[]>([]);
  const [emiRecords, setEmiRecords] = useState<EmiRecord[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [driverTransactions, setDriverTransactions] = useState<CompensationTransaction[]>([]);
  const [staffTransactions, setStaffTransactions] = useState<CompensationTransaction[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "commercial" | "accounts" | "yard" | "tripsheet" | "maintenance">("overview");
  const [sheetDeliveredFilter, setSheetDeliveredFilter] = useState<"All" | "Awaiting Receipt" | "Received">("All");
  const [sheetDeliveredDate, setSheetDeliveredDate] = useState("");
  const [sheetReceivedFilter, setSheetReceivedFilter] = useState<"All" | "Pending Entry" | "Entered">("All");
  const [sheetReceivedDate, setSheetReceivedDate] = useState("");
  const [sheetEnteredDate, setSheetEnteredDate] = useState("");
  const [backupLoading, setBackupLoading] = useState<"excel" | "sql" | "files" | null>(null);

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
      financeApi.listDriverCompensation(),
      financeApi.listStaffCompensation(),
    ])
      .then(([t, d, s, c, v, tr, da, sa, lr, mr, ti, emi, rp, dtx, stx]) => {
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
        setDriverTransactions(dtx);
        setStaffTransactions(stx);
      })
      .finally(() => setLoading(false));
  }, [today, refreshKey]);

  // ── Maintenance ───────────────────────────────────────────────────────────
  const truckSummaries = useMemo(
    () =>
      trucks.map((truck) => ({
        truck,
        summary: getTruckMaintenanceSummary(truck, maintenanceRecords),
        status: getMaintenanceStatus(truck, maintenanceRecords),
      })),
    [trucks, maintenanceRecords]
  );

  const maintenanceItems = useMemo(
    () =>
      truckSummaries.flatMap((item) =>
        item.status.map((status) => ({
          ...status,
          registrationNumber: item.truck.registrationNumber,
        }))
      ),
    [truckSummaries]
  );

  const maintenanceCounts = useMemo(() => {
    const counts = { attention: 0, upcoming: 0 };
    for (const item of maintenanceItems) counts[item.status] += 1;
    return counts;
  }, [maintenanceItems]);

  const topMaintenanceItems = useMemo(
    () => [...maintenanceItems].sort((a, b) => a.remainingKm - b.remainingKm).slice(0, 8),
    [maintenanceItems]
  );

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

  const liveTrips = useMemo(
    () => trips.filter(isActiveTrip).slice(0, 8),
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

  const driverCompTotals = useMemo(() => {
    const totals = { Salary: 0, Advance: 0 };
    for (const tx of driverTransactions) totals[tx.type as keyof typeof totals] += tx.amount;
    return totals;
  }, [driverTransactions]);

  const staffCompTotals = useMemo(() => {
    const totals = { Salary: 0, Advance: 0 };
    for (const tx of staffTransactions) totals[tx.type as keyof typeof totals] += tx.amount;
    return totals;
  }, [staffTransactions]);

  // ── Alert board ───────────────────────────────────────────────────────────
  const alertItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: "compliance" | "maintenance";
      critical: boolean;
      truck: string;
      detail: string;
    }> = [];

    for (const truck of trucks) {
      for (const doc of COMPLIANCE_DOCS) {
        const val = truck[doc.field] as string | undefined;
        const status = getComplianceStatus(val ?? "");
        if (status === "Expired") {
          items.push({
            id: `${truck.truckId}-${doc.key}-exp`,
            type: "compliance",
            critical: true,
            truck: truck.registrationNumber,
            detail: `${doc.label} has expired`,
          });
        } else if (status === "Expiring Soon") {
          items.push({
            id: `${truck.truckId}-${doc.key}-soon`,
            type: "compliance",
            critical: false,
            truck: truck.registrationNumber,
            detail: `${doc.label} expiring soon`,
          });
        }
      }
    }

    for (const item of maintenanceItems) {
      if (item.status === "attention") {
        items.push({
          id: `${item.registrationNumber}-maint-${item.item}`,
          type: "maintenance",
          critical: true,
          truck: item.registrationNumber,
          detail: `${item.item} overdue`,
        });
      }
    }

    return items.sort((a, b) => Number(b.critical) - Number(a.critical)).slice(0, 8);
  }, [trucks, maintenanceItems]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const criticalAlerts = complianceCounts.Expired + maintenanceCounts.attention;
  const totalAlerts = criticalAlerts + complianceCounts["Expiring Soon"];
  const presentToday = driverAttendanceToday.Present + staffAttendanceToday.Present;
  const totalWorkforce = drivers.length + staffList.length;
  const trucksOnTripCount = trucksOnTripIds.size;
  const trucksAvailableCount = trucks.length - trucksOnTripCount;
  const totalCompSalary = driverCompTotals.Salary + staffCompTotals.Salary;
  const totalCompAdvance = driverCompTotals.Advance + staffCompTotals.Advance;

  const sortedComplianceTrucks = useMemo(() => {
    const statusPriority = (s: string) =>
      s === "Expired" ? 0 : s === "Expiring Soon" ? 1 : 2;
    return [...trucks].sort((a, b) => {
      const aScore = Math.min(
        ...COMPLIANCE_DOCS.map((d) =>
          statusPriority(getComplianceStatus((a[d.field] as string) ?? ""))
        )
      );
      const bScore = Math.min(
        ...COMPLIANCE_DOCS.map((d) =>
          statusPriority(getComplianceStatus((b[d.field] as string) ?? ""))
        )
      );
      return aScore - bScore;
    });
  }, [trucks]);

  const ADMIN_TABS = [
    { key: "overview"     as const, label: "Admin Overview",  icon: Activity },
    { key: "commercial"   as const, label: "Commercial Mgr",  icon: Navigation },
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

  const dayLabel = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric", });

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
        <div className="flex flex-col gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-0.5 text-sm text-gray-400">Fleet command centre · {dayLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleBackup("excel")}
              disabled={backupLoading !== null}
              className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {backupLoading === "excel" ? "Downloading…" : "Download Excel"}
            </button>
            <button
              type="button"
              onClick={() => handleBackup("sql")}
              disabled={backupLoading !== null}
              className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
            >
              <Database className="h-3.5 w-3.5" />
              {backupLoading === "sql" ? "Downloading…" : "Download SQL"}
            </button>
            <button
              type="button"
              onClick={() => handleBackup("files")}
              disabled={backupLoading !== null}
              className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              <FolderArchive className="h-3.5 w-3.5" />
              {backupLoading === "files" ? "Downloading…" : "Download Files (ZIP)"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Current Trips ────────────────────────────────────────────────── */}
      <CurrentTripsCard />

      {/* ── Compliance Alert Banner ─────────────────────────────────────── */}
      {(complianceExpired.length > 0 || complianceExpiringSoon.length > 0) && (
        <div className={cn(
          "rounded-2xl border px-5 py-4",
          complianceExpired.length > 0
            ? "border-red-200 bg-red-50"
            : "border-amber-200 bg-amber-50"
        )}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              complianceExpired.length > 0 ? "text-red-500" : "text-amber-500"
            )} />
            <div className="flex-1">
              <p className={cn(
                "text-sm font-bold",
                complianceExpired.length > 0 ? "text-red-700" : "text-amber-700"
              )}>
                {complianceExpired.length > 0
                  ? `${complianceExpired.length} expired document${complianceExpired.length === 1 ? "" : "s"} — immediate renewal required`
                  : `${complianceExpiringSoon.length} document${complianceExpiringSoon.length === 1 ? "" : "s"} expiring soon`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {complianceExpired.map((item, i) => (
                  <span key={`exp-${i}`} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    {item.truckId} · {item.label}
                  </span>
                ))}
                {complianceExpiringSoon.map((item, i) => (
                  <span key={`soon-${i}`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {item.truckId} · {item.label}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/resources/fleet")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                complianceExpired.length > 0
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              )}
            >
              View Fleet
            </button>
          </div>
        </div>
      )}

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
          caption={`${complianceCounts.Expired} expired · ${maintenanceCounts.attention} maint. overdue`}
          icon={AlertTriangle}
          variant={criticalAlerts > 0 ? "red" : "emerald"}
        />
        <StatCard
          label="Present Today"
          value={`${presentToday}/${totalWorkforce}`}
          caption={`${leaveSummary.Pending} leave request${leaveSummary.Pending !== 1 ? "s" : ""} pending`}
          icon={UserCheck}
          variant={totalWorkforce > 0 && presentToday < totalWorkforce * 0.7 ? "amber" : "emerald"}
        />
        <StatCard
          label="Customers"
          value={String(customers.length)}
          caption={`${vendors.length} vendor${vendors.length !== 1 ? "s" : ""} registered`}
          icon={UserCheck}
          variant="purple"
        />
        <StatCard
          label="Monthly Fixed"
          value={formatCurrency(monthlyEmiTotal + monthlyRecurringTotal)}
          caption={`${emiRecords.length} EMI · ${activeRecurringPayments.length} recurring`}
          icon={Wallet}
          variant="default"
        />
      </div>

      {/* Trip pipeline strip */}
      {ACTIVE_TRIP_STATUSES.some((s) => tripStatusCounts[s] > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Pipeline:
          </span>
          {(["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"] as TripStatus[])
            .filter((s) => tripStatusCounts[s] > 0)
            .map((s) => (
              <span
                key={s}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold", TRIP_STATUS_BADGE[s])}
              >
                {s}: {tripStatusCounts[s]}
              </span>
            ))}
        </div>
      )}

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
          return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
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
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                    <FileCheck2 className="h-4 w-4" />
                    Delivered by Yard Supervisor
                  </p>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-bold text-emerald-700">
                    {sheetsDelivered.length}
                  </span>
                </div>
                {/* Status filter tabs */}
                <div className="mb-2 flex flex-wrap gap-1">
                  {(["All", "Awaiting Receipt", "Received"] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setSheetDeliveredFilter(f)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${sheetDeliveredFilter === f ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-emerald-100"}`}>
                      {f} ({f === "All" ? sheetsDelivered.length : f === "Awaiting Receipt" ? awaitingReceipt.length : sheetsReceived.length})
                    </button>
                  ))}
                </div>
                {/* Date filter */}
                <div className="mb-3 flex items-center gap-2">
                  <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap">Delivered on</label>
                  <input
                    type="date"
                    value={sheetDeliveredDate}
                    onChange={(e) => setSheetDeliveredDate(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  {sheetDeliveredDate && (
                    <>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {deliveredVisible.length}
                      </span>
                      <button type="button" onClick={() => setSheetDeliveredDate("")} className="text-[11px] text-gray-400 hover:text-gray-600">✕</button>
                    </>
                  )}
                </div>
                {deliveredVisible.length === 0 ? (
                  <p className="text-xs text-gray-400">No trips in this filter.</p>
                ) : (
                  <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1">
                    {deliveredVisible.map((t) => (
                      <li key={t.id} className="rounded-lg bg-white/80 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-800">{t.tripId}</span>
                          <span className="text-gray-500">{t.bookingReferenceNo}</span>
                          {t.tripSheetReceived ? (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">Received</span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">Awaiting Receipt</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-400">
                          Delivered: <span className="text-gray-600">{fmtDate(t.tripSheetCollectedAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Received by Trip Sheet Register */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
                    <Inbox className="h-4 w-4" />
                    Received by Trip Sheet Register
                  </p>
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-bold text-blue-700">
                    {receivedOrEntered.length}
                  </span>
                </div>
                {/* Status filter tabs */}
                <div className="mb-2 flex flex-wrap gap-1">
                  {(["All", "Pending Entry", "Entered"] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setSheetReceivedFilter(f)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${sheetReceivedFilter === f ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-blue-100"}`}>
                      {f} ({f === "All" ? receivedOrEntered.length : f === "Pending Entry" ? pendingEntry.length : entered.length})
                    </button>
                  ))}
                </div>
                {/* Date filters */}
                <div className="mb-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-[11px] font-medium text-gray-500">Received on</label>
                    <input type="date" value={sheetReceivedDate} onChange={(e) => setSheetReceivedDate(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    {sheetReceivedDate && (
                      <>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          {receivedVisible.length}
                        </span>
                        <button type="button" onClick={() => setSheetReceivedDate("")} className="text-[11px] text-gray-400 hover:text-gray-600">✕</button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-[11px] font-medium text-gray-500">Entered on</label>
                    <input type="date" value={sheetEnteredDate} onChange={(e) => setSheetEnteredDate(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    {sheetEnteredDate && (
                      <>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          {receivedVisible.length}
                        </span>
                        <button type="button" onClick={() => setSheetEnteredDate("")} className="text-[11px] text-gray-400 hover:text-gray-600">✕</button>
                      </>
                    )}
                  </div>
                </div>
                {receivedVisible.length === 0 ? (
                  <p className="text-xs text-gray-400">No trips in this filter.</p>
                ) : (
                  <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1">
                    {receivedVisible.map((t) => (
                      <li key={t.id} className="rounded-lg bg-white/80 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-800">{t.tripId}</span>
                          <span className="text-gray-500">{t.bookingReferenceNo}</span>
                          {t.tripSheetDate ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">Entered</span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">Pending Entry</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex gap-3 text-[11px] text-gray-400">
                          <span>Received: <span className="text-gray-600">{fmtDate(t.tripSheetReceivedAt)}</span></span>
                          {t.tripSheetDate && <span>Entered: <span className="text-gray-600">{fmtDate(t.tripSheetDate)}</span></span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
          <Link href="/attendance/edit-approvals" className="text-xs font-medium text-blue-600 hover:text-blue-800">
            Open Edit Approvals →
          </Link>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-600">
              <ShieldCheck className="h-4 w-4" />
              Pending Requests
            </p>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-sm font-bold text-purple-700">
              {pendingEditApprovals.length}
            </span>
          </div>
          {pendingEditApprovals.length === 0 ? (
            <p className="text-xs text-gray-400">No pending edit requests.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pendingEditApprovals.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link
                    href="/attendance/edit-approvals"
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 text-xs transition-colors hover:bg-white"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-gray-800">{r.staffName}</span>
                      <span className="text-gray-400"> · {r.action} </span>
                      <span className="text-gray-600">{r.resourceName}</span>
                      <span className="text-gray-400"> ({r.resourceType})</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">Pending</span>
                  </Link>
                </li>
              ))}
              {pendingEditApprovals.length > 6 && (
                <li className="px-3 text-[11px] text-gray-400">+{pendingEditApprovals.length - 6} more…</li>
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
          return new Date(y, m - 1, day).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
                <span className="text-xs font-medium text-gray-500">
                  Bookings made up to <span className="font-semibold text-gray-800">{fmtD(latestDate)}</span>
                </span>
              )}
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              {sortedDates.length === 0 ? (
                <p className="text-xs text-gray-400">No active bookings found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Summary strip */}
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="rounded-full bg-indigo-100 px-3 py-1 font-semibold text-indigo-700">
                      {activeTrips.length} active trip{activeTrips.length !== 1 ? "s" : ""}
                    </span>
                    <span className="rounded-full bg-white border border-gray-200 px-3 py-1 font-semibold text-gray-600">
                      {sortedDates.length} date{sortedDates.length !== 1 ? "s" : ""} booked
                    </span>
                    {past.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
                        {past.reduce((s, d) => s + byDate.get(d)!.length, 0)} trip{past.reduce((s, d) => s + byDate.get(d)!.length, 0) !== 1 ? "s" : ""} on past dates still active
                      </span>
                    )}
                  </div>

                  {/* Date rows */}
                  <div className="flex max-h-64 flex-col gap-1 overflow-y-auto custom-scrollbar pr-1">
                    {sortedDates.map((d) => {
                      const tripsOnDay = byDate.get(d)!;
                      const isPast = d < today;
                      const isToday = d === today;
                      return (
                        <div
                          key={d}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs ${
                            isToday
                              ? "bg-indigo-100 border border-indigo-200"
                              : isPast
                              ? "bg-amber-50 border border-amber-100"
                              : "bg-white/80"
                          }`}
                        >
                          <span className={`w-8 shrink-0 font-semibold ${isPast ? "text-amber-600" : isToday ? "text-indigo-700" : "text-gray-500"}`}>
                            {dayName(d)}
                          </span>
                          <span className={`w-28 shrink-0 font-medium ${isPast ? "text-amber-700" : isToday ? "text-indigo-800" : "text-gray-700"}`}>
                            {fmtD(d)}
                            {isToday && <span className="ml-1.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Today</span>}
                            {isPast && <span className="ml-1.5 text-[10px] text-amber-500">(past)</span>}
                          </span>
                          <div className="flex flex-1 flex-wrap gap-1">
                            {tripsOnDay.slice(0, 8).map((t) => (
                              <span key={t.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                {t.tripId}
                              </span>
                            ))}
                            {tripsOnDay.length > 8 && (
                              <span className="text-[10px] text-gray-400">+{tripsOnDay.length - 8} more</span>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${isPast ? "bg-amber-100 text-amber-700" : isToday ? "bg-indigo-200 text-indigo-800" : "bg-emerald-100 text-emerald-700"}`}>
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
      {/* Row 1: Trip Distribution + Fleet Utilization */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Trip Status Donut */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-bold text-gray-900">Trip Distribution</h2>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{trips.length} trips across all statuses</p>
          <div className="mt-3">
            <TripStatusDonutChart counts={tripStatusCounts} />
          </div>
        </div>

        {/* Fleet Utilization Donut */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-bold text-gray-900">Fleet Utilization</h2>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{trucks.length} trucks in fleet</p>
          <div className="mt-3">
            <FleetUtilizationChart onTrip={trucksOnTripCount} available={trucksAvailableCount} />
          </div>
        </div>
      </div>

      {/* Row 2: Trip Trend (full width) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-bold text-gray-900">Trip Trend</h2>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">Total vs completed trips over time</p>
        <div className="mt-3">
          <TripTrendChart trips={trips} />
        </div>
      </div>

      {/* ── Section 3: Live Ops + Alert Board ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

        {/* Live Trips (3/5) */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white lg:col-span-3">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-bold text-gray-900">Live Operations</h2>
            </div>
            <span className="text-xs text-gray-400">
              {activeTripsCount} active trip{activeTripsCount !== 1 ? "s" : ""}
            </span>
          </div>
          {liveTrips.length === 0 ? (
            <div className="flex items-center justify-center px-5 py-12 text-sm text-gray-400">
              No active trips right now.
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {liveTrips.map((trip) => {
                return (
                  <div
                    key={trip.id}
                    className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-gray-900">{trip.tripId}</p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            TRIP_STATUS_BADGE[trip.status]
                          )}
                        >
                          {trip.status}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        <span className="text-gray-700">{trip.origin}</span>
                        <span className="mx-1 text-gray-300">→</span>
                        <span className="text-gray-700">{trip.destination}</span>
                        {trip.shipperConsignee && (
                          <span className="ml-1.5 text-gray-400">· {trip.shipperConsignee}</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-gray-700">
                        {trip.driverName ?? "—"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {trip.truckRegistration ?? trip.vehicleId ?? "—"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alert Board (2/5) */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-bold text-gray-900">Alert Board</h2>
            </div>
            {totalAlerts === 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> All Clear
              </span>
            ) : (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {totalAlerts} issues
              </span>
            )}
          </div>
          {alertItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="mt-2 text-sm font-medium text-emerald-700">Fleet is all clear</p>
              <p className="text-xs text-gray-400">No expired documents or maintenance overdue</p>
            </div>
          ) : (
            <div className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
              {alertItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3",
                    item.critical ? "bg-red-50/40" : "bg-amber-50/40"
                  )}
                >
                  {item.type === "maintenance" ? (
                    <Wrench
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        item.critical ? "text-red-500" : "text-amber-500"
                      )}
                    />
                  ) : (
                    <ShieldCheck
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        item.critical ? "text-red-500" : "text-amber-500"
                      )}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800">{item.truck}</p>
                    <p className="text-xs text-gray-500">{item.detail}</p>
                  </div>
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold",
                      item.critical
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    )}
                  >
                    {item.critical ? "!" : "↑"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: Attendance + Pending Leave ───────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Attendance */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-bold text-gray-900">Attendance Today</h2>
            </div>
            <span className="text-xs text-gray-400">{fmtDate(today)}</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Drivers ({drivers.length})
              </p>
              <div className="space-y-2.5">
                <AttendanceBar
                  label="Present"
                  count={driverAttendanceToday.Present}
                  total={drivers.length}
                  barColor="bg-emerald-500"
                />
                <AttendanceBar
                  label="On Leave"
                  count={driverAttendanceToday["On Leave"]}
                  total={drivers.length}
                  barColor="bg-amber-400"
                />
                <AttendanceBar
                  label="Absent"
                  count={driverAttendanceToday.Absent}
                  total={drivers.length}
                  barColor="bg-red-400"
                />
                <AttendanceBar
                  label="Not Marked"
                  count={driverAttendanceToday["Not Marked"]}
                  total={drivers.length}
                  barColor="bg-gray-300"
                />
              </div>
            </div>
            <div>
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Staff ({staffList.length})
              </p>
              <div className="space-y-2.5">
                <AttendanceBar
                  label="Present"
                  count={staffAttendanceToday.Present}
                  total={staffList.length}
                  barColor="bg-emerald-500"
                />
                <AttendanceBar
                  label="On Leave"
                  count={staffAttendanceToday["On Leave"]}
                  total={staffList.length}
                  barColor="bg-amber-400"
                />
                <AttendanceBar
                  label="Absent"
                  count={staffAttendanceToday.Absent}
                  total={staffList.length}
                  barColor="bg-red-400"
                />
                <AttendanceBar
                  label="Not Marked"
                  count={staffAttendanceToday["Not Marked"]}
                  total={staffList.length}
                  barColor="bg-gray-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Pending Leave */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-gray-900">Pending Leave Requests</h2>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                leaveSummary.Pending > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-500"
              )}
            >
              {leaveSummary.Pending}
            </span>
          </div>
          {pendingLeaveRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="mt-2 text-sm font-medium text-emerald-700">All caught up!</p>
              <p className="text-xs text-gray-400">No pending leave requests</p>
            </div>
          ) : (
            <div className="max-h-64 divide-y divide-gray-50 overflow-y-auto">
              {pendingLeaveRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-start justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900">{req.applicantName}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {req.category} · {fmtDate(req.fromDate)} → {fmtDate(req.toDate)}
                    </p>
                    {req.reason && (
                      <p className="mt-0.5 truncate text-xs text-gray-400">{req.reason}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Fleet Status + Finance ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Fleet Status */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-bold text-gray-900">Fleet Status</h2>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{trucksOnTripCount} on trip</span>
              <span className="font-semibold text-gray-700">
                {trucks.length > 0
                  ? Math.round((trucksOnTripCount / trucks.length) * 100)
                  : 0}
                % utilized
              </span>
              <span>{trucksAvailableCount} available</span>
            </div>
            <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-3 rounded-l-full bg-blue-500 transition-all duration-700"
                style={{
                  width:
                    trucks.length > 0
                      ? `${(trucksOnTripCount / trucks.length) * 100}%`
                      : "0%",
                }}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {trucks.map((truck) => {
              const onTrip = trucksOnTripIds.has(truck.truckId);
              return (
                <span
                  key={truck.truckId}
                  title={truck.truckId}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    onTrip
                      ? "bg-blue-100 text-blue-700"
                      : "bg-emerald-100 text-emerald-700"
                  )}
                >
                  {truck.registrationNumber}
                </span>
              );
            })}
            {trucks.length === 0 && (
              <p className="text-xs text-gray-400">No trucks in fleet.</p>
            )}
          </div>
          {trucks.length > 0 && (
            <div className="mt-3 flex gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-400" /> On Trip
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Available
              </span>
            </div>
          )}
        </div>

        {/* Finance Snapshot */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-purple-500" />
            <h2 className="text-sm font-bold text-gray-900">Finance Snapshot</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-purple-500">
                Monthly EMI
              </p>
              <p className="mt-1 text-xl font-bold text-purple-800">
                {formatCurrency(monthlyEmiTotal)}
              </p>
              <p className="text-xs text-purple-600/70">
                {emiRecords.length} active loan{emiRecords.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-500">
                Recurring Spend
              </p>
              <p className="mt-1 text-xl font-bold text-blue-800">
                {formatCurrency(monthlyRecurringTotal)}
              </p>
              <p className="text-xs text-blue-600/70">
                {activeRecurringPayments.length}/{recurringPayments.length} payments active
              </p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
                Salaries Paid
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-800">
                {formatCurrency(totalCompSalary)}
              </p>
              <p className="text-xs text-emerald-600/70">Drivers + Staff</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">
                Advances Given
              </p>
              <p className="mt-1 text-xl font-bold text-amber-800">
                {formatCurrency(totalCompAdvance)}
              </p>
              <p className="text-xs text-amber-600/70">Pending settlement</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 5: Finance Breakdown Chart ──────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-purple-500" />
            <h2 className="text-sm font-bold text-gray-900">Monthly Expenditure Breakdown</h2>
          </div>
          <span className="text-xs font-semibold text-gray-500">
            Total: {formatCurrency(monthlyEmiTotal + monthlyRecurringTotal + totalCompSalary + totalCompAdvance)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">EMI · Recurring · Salaries · Advances</p>
        <div className="mt-4">
          <FinanceBreakdownChart
            emiTotal={monthlyEmiTotal}
            recurringTotal={monthlyRecurringTotal}
            salaryTotal={totalCompSalary}
            advanceTotal={totalCompAdvance}
          />
        </div>
      </div>

      {/* ── Section 6: Compliance Grid ───────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-bold text-gray-900">Compliance Overview</h2>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {complianceCounts.Valid} Valid
            </span>
            <span className="flex items-center gap-1 text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {complianceCounts["Expiring Soon"]} Soon
            </span>
            <span className="flex items-center gap-1 text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              {complianceCounts.Expired} Expired
            </span>
          </div>
        </div>
        <div className="max-h-80 overflow-x-auto overflow-y-auto custom-scrollbar">
          <table className="w-full min-w-[680px] text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Truck
                </th>
                {COMPLIANCE_DOCS.map((doc) => (
                  <th
                    key={doc.key}
                    className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {doc.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {trucks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs text-gray-400">
                    No trucks in fleet.
                  </td>
                </tr>
              ) : (
                sortedComplianceTrucks.map((truck) => {
                  const hasExpired = COMPLIANCE_DOCS.some(
                    (d) => getComplianceStatus((truck[d.field] as string) ?? "") === "Expired"
                  );
                  return (
                  <tr
                    key={truck.truckId}
                    className={cn("transition-colors hover:bg-gray-50/70", hasExpired && "bg-red-50/40")}
                  >
                    <td className="px-5 py-3">
                      <p className="text-xs font-bold text-gray-900">
                        {truck.registrationNumber}
                      </p>
                      <p className="text-xs text-gray-400">{truck.truckId}</p>
                    </td>
                    {COMPLIANCE_DOCS.map((doc) => (
                      <td key={doc.key} className="px-4 py-3">
                        <ComplianceBadge
                          date={truck[doc.field] as string | undefined}
                        />
                      </td>
                    ))}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 6: Maintenance Due ───────────────────────────────────── */}
      

      {/* ── Section: Tyre Manager ──────────────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-6">
        <TyreManagerDashboard embedded />
      </div>
      </>}
    </div>
  );
}
