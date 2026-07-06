"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { FleetManagerDashboard } from "@/components/dashboard/FleetManagerDashboard";
import { TyreManagerDashboard } from "@/components/dashboard/TyreManagerDashboard";
import { FinanceManagerDashboard } from "@/components/dashboard/FinanceManagerDashboard";
import { StaffDashboard } from "@/components/dashboard/StaffDashboard";
import { TripSheetCoordinatorDashboard } from "@/components/dashboard/TripSheetCoordinatorDashboard";
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
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { EmiRecord, RecurringPayment } from "@/types/finance";
import type { CompensationTransaction } from "@/types/compensation";
import { todayIst } from "@/lib/format-date";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
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

  if (user?.softwareDesignation === "Fleet Manager") {
    return <FleetManagerDashboard />;
  }

  if (user?.softwareDesignation === "Tyre Manager") {
    return <TyreManagerDashboard />;
  }

  if (user?.softwareDesignation === "Finance Manager") {
    return <FinanceManagerDashboard />;
  }

  if (user?.softwareDesignation === "Trip Sheet Coordinator") {
    return <StaffDashboard />;
  }

  if (user?.softwareDesignation === "Yard Staff") {
    return <TripSheetCoordinatorDashboard />;
  }

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
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [tyreInventory, setTyreInventory] = useState<TyreInventoryItem[]>([]);
  const [emiRecords, setEmiRecords] = useState<EmiRecord[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [driverTransactions, setDriverTransactions] = useState<CompensationTransaction[]>([]);
  const [staffTransactions, setStaffTransactions] = useState<CompensationTransaction[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const today = todayIst();

  useWebSocketEvent("trip_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("leave_request_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("leave_request_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("maintenance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("finance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("tyre_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("attendance_updated", () => setRefreshKey(k => k + 1));

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
    () => trips.filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status)).length,
    [trips]
  );

  const liveTrips = useMemo(
    () => trips.filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status)).slice(0, 8),
    [trips]
  );

  const trucksOnTripIds = useMemo(
    () =>
      new Set(
        trips
          .filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status))
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

  if (loading) {
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

  const dayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="animate-stagger flex flex-col gap-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-400">Fleet command centre · {dayLabel}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Live
        </div>
      </div>

      {/* ── Section 1: Hero KPIs ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
        <StatCard
          label="Active Trips"
          value={String(activeTripsCount)}
          caption={`${tripStatusCounts.Completed} completed · ${trips.length} total`}
          icon={Navigation}
          variant="blue"
        />
        <StatCard
          label="Fleet on Road"
          value={`${trucksOnTripCount}/${trucks.length}`}
          caption={`${trucksAvailableCount} truck${trucksAvailableCount !== 1 ? "s" : ""} available`}
          icon={Truck}
          variant={trucksOnTripCount > 0 ? "default" : "emerald"}
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

      {/* ── Section 2: Visual Charts ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

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

        {/* 6-Month Trip Trend */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-bold text-gray-900">Trip Trend</h2>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">Total vs completed — last 6 months</p>
          <div className="mt-3">
            <TripTrendChart trips={trips} />
          </div>
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
            <div className="divide-y divide-gray-50">
              {liveTrips.map((trip) => {
                const driver = driverById.get(trip.driverId);
                const truck = truckByVehicleId.get(trip.vehicleId);
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
                        {driver?.name ?? "—"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {truck?.registrationNumber ?? trip.vehicleId ?? "—"}
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
          <div className="mt-4 flex flex-wrap gap-2">
            {trucks.map((truck) => {
              const onTrip = trucksOnTripIds.has(truck.truckId);
              return (
                <span
                  key={truck.truckId}
                  title={truck.registrationNumber}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    onTrip
                      ? "bg-blue-100 text-blue-700"
                      : "bg-emerald-100 text-emerald-700"
                  )}
                >
                  {truck.truckId}
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm whitespace-nowrap">
            <thead>
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
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-gray-900">Maintenance Due</h2>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-semibold text-red-700">
              {maintenanceCounts.attention} Overdue
            </span>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-700">
              {maintenanceCounts.upcoming} Upcoming
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Vehicle", "Category", "Item", "Remaining (km)", "Status"].map((col) => (
                  <th
                    key={col}
                    className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {topMaintenanceItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-xs text-gray-400">
                    No maintenance items due — fleet is in good shape.
                  </td>
                </tr>
              ) : (
                topMaintenanceItems.map((item, i) => (
                  <tr
                    key={`${item.truckId}-${item.item}-${i}`}
                    className="transition-colors hover:bg-gray-50/70"
                  >
                    <td className="px-5 py-3 font-semibold text-gray-900">
                      {item.registrationNumber}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{item.category}</td>
                    <td className="px-5 py-3 text-gray-700">{item.item}</td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "font-bold",
                          item.remainingKm <= 0
                            ? "text-red-600"
                            : item.remainingKm <= 500
                              ? "text-amber-600"
                              : "text-gray-700"
                        )}
                      >
                        {item.remainingKm.toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          item.status === "attention"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {item.status === "attention" ? "Overdue" : "Upcoming"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
