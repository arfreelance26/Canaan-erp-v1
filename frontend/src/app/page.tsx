"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Truck,
  Navigation,
  Users,
  ClipboardList,
  AlertTriangle,
  Activity,
  Wrench,
  ShieldCheck,
  Wallet,
  CreditCard,
  Building2,
  Package,
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

const TABS = ["Overview", "Fleet & Trips", "Attendance & HR", "Maintenance", "Finance"] as const;
type Tab = (typeof TABS)[number];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
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

const COMPLIANCE_BADGE: Record<string, string> = {
  Valid: "bg-green-100 text-green-700",
  "Expiring Soon": "bg-yellow-100 text-yellow-700",
  Expired: "bg-red-100 text-red-700",
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
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

  const today = todayIso();

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
  }, [today]);

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
        item.status.map((status) => ({ ...status, registrationNumber: item.truck.registrationNumber }))
      ),
    [truckSummaries]
  );

  const maintenanceCounts = useMemo(() => {
    const counts = { attention: 0, upcoming: 0 };
    for (const item of maintenanceItems) counts[item.status] += 1;
    return counts;
  }, [maintenanceItems]);

  const topMaintenanceItems = useMemo(
    () => [...maintenanceItems].sort((a, b) => a.remainingKm - b.remainingKm).slice(0, 5),
    [maintenanceItems]
  );

  const complianceCounts = useMemo(() => {
    const counts: Record<string, number> = { Valid: 0, "Expiring Soon": 0, Expired: 0 };
    for (const truck of trucks) {
      const dates = [truck.fcExpiryDate, truck.roadTaxDate, truck.nationalPermitDate, truck.pollutionCertificateDate];
      for (const date of dates) counts[getComplianceStatus(date)] += 1;
    }
    return counts;
  }, [trucks]);

  const tripStatusCounts = useMemo(() => {
    const counts: Record<TripStatus, number> = {
      Assigned: 0, Started: 0, Loaded: 0, "On-Transit": 0,
      Reached: 0, Unloaded: 0, Completed: 0, Cancelled: 0,
    };
    for (const trip of trips) counts[trip.status] += 1;
    return counts;
  }, [trips]);

  const activeTripsCount = useMemo(
    () => trips.filter((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)).length,
    [trips]
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
    () => leaveRequests.filter((request) => request.status === "Pending"),
    [leaveRequests]
  );

  const pendingLeaveByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const request of pendingLeaveRequests) {
      counts[request.category] = (counts[request.category] ?? 0) + 1;
    }
    return counts;
  }, [pendingLeaveRequests]);

  const monthlyEmiTotal = useMemo(
    () => emiRecords.reduce((sum, emi) => sum + (Number(emi.emiAmount) || 0), 0),
    [emiRecords]
  );

  const activeRecurringPayments = useMemo(
    () => recurringPayments.filter((payment) => payment.status === "Active"),
    [recurringPayments]
  );

  const monthlyRecurringTotal = useMemo(
    () =>
      activeRecurringPayments.reduce(
        (sum, payment) => sum + payment.amount / (RECURRING_FREQUENCY_DIVISOR[payment.frequency] ?? 1),
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

  const totalAlerts = complianceCounts.Expired + complianceCounts["Expiring Soon"] + maintenanceCounts.attention;
  const activeCustomers = customers.filter((customer) => customer.status === "ACTIVE").length;
  const activeVendors = vendors.filter((vendor) => vendor.status === "ACTIVE").length;
  const tyreInventoryValue = tyreInventory.reduce((sum, tyre) => sum + (Number(tyre.cost) || 0), 0);
  const totalCompensationPaid = driverCompTotals.Salary + staffCompTotals.Salary;

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Real-time overview of fleet operations, trips, attendance, maintenance, and finances
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-all",
              activeTab === tab
                ? "bg-blue-600 text-white shadow-blue-200"
                : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <StatCard
                label="Total Vehicles"
                value={String(trucks.length)}
                caption="Active fleet vehicles"
                icon={Truck}
              />
            </div>
            <div>
              <StatCard
                label="Active Trips"
                value={String(activeTripsCount)}
                caption={`${trips.length} total trips`}
                icon={Navigation}
              />
            </div>
            <div>
              <StatCard
                label="Workforce"
                value={String(drivers.length + staffList.length)}
                caption={`${drivers.length} drivers, ${staffList.length} staff`}
                icon={Users}
              />
            </div>
            <div>
              <StatCard
                label="Active Alerts"
                value={String(totalAlerts)}
                caption={`${complianceCounts.Expired} expired docs, ${maintenanceCounts.attention} maintenance`}
                icon={AlertTriangle}
              />
            </div>
            <div>
              <StatCard
                label="Pending Leave Requests"
                value={String(leaveSummary.Pending)}
                caption={`${leaveSummary.Approved} approved, ${leaveSummary.Rejected} rejected`}
                icon={ClipboardList}
              />
            </div>
            <div>
              <StatCard
                label="Business Partners"
                value={String(customers.length + vendors.length)}
                caption={`${activeCustomers} active customers, ${activeVendors} active vendors`}
                icon={Building2}
              />
            </div>
            <div>
              <StatCard
                label="Monthly Recurring Spend"
                value={formatCurrency(monthlyRecurringTotal)}
                caption={`${activeRecurringPayments.length} of ${recurringPayments.length} payments active`}
                icon={Wallet}
              />
            </div>
            <div>
              <StatCard
                label="Compensation Paid"
                value={formatCurrency(totalCompensationPaid)}
                caption="Driver + staff salaries (latest cycle)"
                icon={CreditCard}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-base font-bold text-gray-900">Recent Trips</h2>
              <div className="mt-3 flex flex-col gap-3">
                {trips.map((trip, index) => (
                  <div key={trip.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{trip.tripId}</p>
                      <p className="text-xs text-gray-500">
                        {trip.origin} → {trip.destination} · {trip.shipperConsignee}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", TRIP_STATUS_BADGE[trip.status])}>
                      {trip.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-base font-bold text-gray-900">Pending Approvals</h2>
              <div className="mt-3 flex flex-col gap-3">
                {pendingLeaveRequests.length === 0 && (
                  <p className="text-sm text-gray-500">No pending leave requests.</p>
                )}
                {pendingLeaveRequests.map((request, index) => (
                  <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{request.applicantName}</p>
                      <p className="text-xs text-gray-500">
                        {request.category} · {request.fromDate} to {request.toDate}
                      </p>
                    </div>
                    <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Fleet & Trips" && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Vehicles"
              value={String(trucks.length)}
              caption={trucks.map((truck) => truck.registrationNumber).join(", ")}
              icon={Truck}
            />
            <StatCard
              label="Active Trips"
              value={String(activeTripsCount)}
              caption={`Out of ${trips.length} total trips`}
              icon={Navigation}
            />
            <StatCard
              label="Completed Trips"
              value={String(tripStatusCounts.Completed)}
              caption={`${tripStatusCounts.Cancelled} cancelled`}
              icon={ClipboardList}
            />

          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-base font-bold text-gray-900">Trip Status Breakdown</h2>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {(Object.entries(tripStatusCounts) as [TripStatus, number][])
                .filter(([, count]) => count > 0)
                .map(([status, count]) => (
                  <span
                    key={status}
                    className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", TRIP_STATUS_BADGE[status])}
                  >
                    {status}: {count}
                  </span>
                ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Trip ID</th>
                  <th className="px-4 py-3">Booking Ref</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Transport Hire (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trips.map((trip) => (
                  <tr key={trip.id}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.shipperConsignee}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {trip.origin} → {trip.destination}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{trip.tripCategory}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", TRIP_STATUS_BADGE[trip.status])}>
                        {trip.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(Number(trip.transportHireAmount) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Attendance & HR" && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Drivers"
              value={String(drivers.length)}
              caption="Active fleet drivers"
              icon={Users}
            />
            <StatCard
              label="Total Staff"
              value={String(staffList.length)}
              caption="Across all branches"
              icon={Users}
            />
            <StatCard
              label="Pending Leave Requests"
              value={String(leaveSummary.Pending)}
              caption={`${pendingLeaveByCategory["Driver"] ?? 0} drivers, ${pendingLeaveByCategory["Staff"] ?? 0} staff`}
              icon={ClipboardList}
            />
            <StatCard
              label="Today's Attendance Marked"
              value={String(
                driverAttendanceToday.Present +
                  driverAttendanceToday.Absent +
                  driverAttendanceToday["On Leave"] +
                  staffAttendanceToday.Present +
                  staffAttendanceToday.Absent +
                  staffAttendanceToday["On Leave"]
              )}
              caption={`Out of ${drivers.length + staffList.length} total`}
              icon={Activity}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-base font-bold text-gray-900">Driver Attendance Today</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Present</p>
                  <p className="mt-1 text-xl font-bold text-green-600">{driverAttendanceToday.Present}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Absent</p>
                  <p className="mt-1 text-xl font-bold text-red-600">{driverAttendanceToday.Absent}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">On Leave</p>
                  <p className="mt-1 text-xl font-bold text-yellow-600">{driverAttendanceToday["On Leave"]}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Not Marked</p>
                  <p className="mt-1 text-xl font-bold text-gray-500">{driverAttendanceToday["Not Marked"]}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-base font-bold text-gray-900">Staff Attendance Today</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Present</p>
                  <p className="mt-1 text-xl font-bold text-green-600">{staffAttendanceToday.Present}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Absent</p>
                  <p className="mt-1 text-xl font-bold text-red-600">{staffAttendanceToday.Absent}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">On Leave</p>
                  <p className="mt-1 text-xl font-bold text-yellow-600">{staffAttendanceToday["On Leave"]}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Not Marked</p>
                  <p className="mt-1 text-xl font-bold text-gray-500">{staffAttendanceToday["Not Marked"]}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingLeaveRequests.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-gray-500" colSpan={5}>
                      No pending leave requests.
                    </td>
                  </tr>
                )}
                {pendingLeaveRequests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{request.applicantName}</td>
                    <td className="px-4 py-3 text-gray-600">{request.category}</td>
                    <td className="px-4 py-3 text-gray-600">{request.fromDate}</td>
                    <td className="px-4 py-3 text-gray-600">{request.toDate}</td>
                    <td className="px-4 py-3 text-gray-600">{request.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Maintenance" && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <StatCard
              label="Maintenance Alerts"
              value={String(maintenanceCounts.attention)}
              caption="Require immediate attention"
              icon={Wrench}
            />
            <StatCard
              label="Upcoming Services"
              value={String(maintenanceCounts.upcoming)}
              caption="Due within 1,000 km"
              icon={ClipboardList}
            />
            <StatCard
              label="Tyre Inventory"
              value={String(tyreInventory.length)}
              caption={`Stock value ${formatCurrency(tyreInventoryValue)}`}
              icon={Package}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-base font-bold text-gray-900">Compliance Status</h2>
            <p className="mt-1 text-sm text-gray-500">FC, Road Tax, National Permit, and Pollution Certificate validity</p>
            <div className="mt-3 grid grid-cols-3 gap-4 sm:max-w-md">
              {(["Valid", "Expiring Soon", "Expired"] as const).map((status) => (
                <div key={status} className="rounded-lg border border-gray-100 p-4">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">{status}</p>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-bold",
                      status === "Valid" && "text-green-600",
                      status === "Expiring Soon" && "text-yellow-600",
                      status === "Expired" && "text-red-600"
                    )}
                  >
                    {complianceCounts[status]}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Remaining (km)</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topMaintenanceItems.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-gray-500" colSpan={5}>
                      No maintenance items due.
                    </td>
                  </tr>
                )}
                {topMaintenanceItems.map((item, index) => (
                  <tr key={`${item.truckId}-${item.item}-${index}`}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{item.registrationNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{item.category}</td>
                    <td className="px-4 py-3 text-gray-600">{item.item}</td>
                    <td className="px-4 py-3 text-gray-600">{item.remainingKm}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          item.status === "attention" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                        )}
                      >
                        {item.status === "attention" ? "Overdue" : "Upcoming"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Finance" && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Monthly EMI"
              value={formatCurrency(monthlyEmiTotal)}
              caption={`${emiRecords.length} active loan${emiRecords.length === 1 ? "" : "s"}`}
              icon={CreditCard}
            />
            <StatCard
              label="Recurring Payments"
              value={String(activeRecurringPayments.length)}
              caption={`Active of ${recurringPayments.length} total`}
              icon={Wallet}
            />
            <StatCard
              label="Monthly Recurring Spend"
              value={formatCurrency(monthlyRecurringTotal)}
              caption="Normalized to monthly cost"
              icon={ShieldCheck}
            />
            <StatCard
              label="Compensation Paid"
              value={formatCurrency(totalCompensationPaid)}
              caption={`${formatCurrency(driverCompTotals.Advance)} driver advances pending settlement`}
              icon={CreditCard}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">EMI Name</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Bank</th>
                  <th className="px-4 py-3">EMI Amount</th>
                  <th className="px-4 py-3">Next Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {emiRecords.map((emi) => (
                  <tr key={emi.id}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{emi.emiName}</td>
                    <td className="px-4 py-3 text-gray-600">{emi.truckRegistration}</td>
                    <td className="px-4 py-3 text-gray-600">{emi.bankName}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(Number(emi.emiAmount) || 0)}</td>
                    <td className="px-4 py-3 text-gray-600">{emi.emiPaymentDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Frequency</th>
                  <th className="px-4 py-3">Next Due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recurringPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{payment.title}</td>
                    <td className="px-4 py-3 text-gray-600">{payment.category}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(payment.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{payment.frequency}</td>
                    <td className="px-4 py-3 text-gray-600">{payment.nextDueDate}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          payment.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-base font-bold text-gray-900">Driver Compensation</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Salaries Paid</p>
                  <p className="mt-1 text-xl font-bold text-green-600">{formatCurrency(driverCompTotals.Salary)}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Advances Given</p>
                  <p className="mt-1 text-xl font-bold text-yellow-600">{formatCurrency(driverCompTotals.Advance)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-base font-bold text-gray-900">Staff Compensation</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Salaries Paid</p>
                  <p className="mt-1 text-xl font-bold text-green-600">{formatCurrency(staffCompTotals.Salary)}</p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Advances Given</p>
                  <p className="mt-1 text-xl font-bold text-yellow-600">{formatCurrency(staffCompTotals.Advance)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
