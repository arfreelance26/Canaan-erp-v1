"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Landmark,
  Wallet,
  ShieldCheck,
  History,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  IndianRupee,
  FileWarning,
  CalendarDays,
  CircleDot,
} from "lucide-react";
import { financeApi, tripsApi, trucksApi, dashboardApi } from "@/lib/api";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { getComplianceStatus } from "@/lib/compliance";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type { EmiRecord, RecurringPayment } from "@/types/finance";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";


const QUICK_LINKS = [
  { label: "Trip Finalization",   href: "/trips/finalization",         icon: CalendarCheck, color: "bg-blue-50 text-blue-600 border-blue-200" },
  { label: "Trip History",        href: "/trips/history",              icon: History,       color: "bg-violet-50 text-violet-600 border-violet-200" },
  { label: "Driver Compensation", href: "/finance/driver-compensation", icon: Wallet,        color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  { label: "EMI Tracking",        href: "/finance/emi-tracking",        icon: Landmark,      color: "bg-amber-50 text-amber-600 border-amber-200" },
  { label: "Compliance",          href: "/maintenance/compliance",      icon: ShieldCheck,   color: "bg-teal-50 text-teal-600 border-teal-200" },
];

const DOC_FIELDS: { label: string; key: keyof Truck }[] = [
  { label: "RC",                    key: "rcValidityDate" },
  { label: "FC",                    key: "fcExpiryDate" },
  { label: "Road Tax",              key: "roadTaxDate" },
  { label: "National Permit",       key: "nationalPermitDate" },
  { label: "Local Permit",          key: "localPermitDate" },
  { label: "Pollution Certificate", key: "pollutionCertificateDate" },
  { label: "Insurance",             key: "insuranceExpiryDate" },
];

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

function daysBetween(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function StatCard({ icon: Icon, label, value, sub, color, alert }: {
  icon: React.ElementType; label: string; value: string | number; color: string; sub?: string; alert?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-xl border bg-white px-5 py-4 shadow-sm ${alert ? "border-red-200 bg-red-50/40" : "border-gray-200"}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`mt-0.5 text-2xl font-bold ${alert ? "text-red-600" : "text-gray-900"}`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, badge, badgeColor }: {
  icon: React.ElementType; title: string; badge?: string | number; badgeColor?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-gray-400" />
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {badge !== undefined && Number(badge) > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor ?? "bg-gray-100 text-gray-600"}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

const Skeleton = () => <div className="h-5 w-full animate-pulse rounded bg-gray-100" />;

export function FinanceManagerDashboard() {
  const [emiRecords, setEmiRecords]     = useState<EmiRecord[]>([]);
  const [recurring, setRecurring]       = useState<RecurringPayment[]>([]);
  const [trips, setTrips]               = useState<Trip[]>([]);
  const [trucks, setTrucks]             = useState<Truck[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);

  useEffect(() => {
    Promise.all([
      financeApi.listEmi(),
      financeApi.listRecurring(),
      tripsApi.list(),
      trucksApi.list(),
    ])
      .then(([emi, rec, trps, trks]) => {
        setEmiRecords(emi);
        setRecurring(rec);
        setTrips(trps);
        setTrucks(trks);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useWebSocketEvent("finance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));

  const router = useRouter();
  const { expiredItems: complianceExpired, expiringSoonItems: complianceExpiringSoon } = useComplianceAlerts(trucks);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // EMI stats
  const activeEmis   = useMemo(() => emiRecords.filter((e) => e.emiEndDate >= todayStr), [emiRecords, todayStr]);
  const overdueEmis  = useMemo(() => activeEmis.filter((e) => e.emiPaymentDate <= todayStr), [activeEmis, todayStr]);
  const monthlyEmiTotal = useMemo(() => activeEmis.reduce((s, e) => s + Number(e.emiAmount || 0), 0), [activeEmis]);

  // Upcoming EMI payments (next 30 days, not overdue)
  const upcomingEmis = useMemo(() =>
    activeEmis
      .filter((e) => e.emiPaymentDate > todayStr)
      .sort((a, b) => a.emiPaymentDate.localeCompare(b.emiPaymentDate))
      .slice(0, 6),
    [activeEmis, todayStr]
  );

  // Trips pending finalization: completed + has sheet but not invoiced
  const pendingFinalization = useMemo(() =>
    trips.filter((t) => t.status === "Completed" && t.hasSheet && !t.isInvoiced && t.tripCategory !== "SHIFTING"),
    [trips]
  );

  // Recurring payments due in 7 days
  const dueSoonRecurring = useMemo(() =>
    recurring.filter((r) => r.status === "Active" && daysBetween(r.nextDueDate) <= 7 && daysBetween(r.nextDueDate) >= 0),
    [recurring]
  );

  // Compliance alerts
  const complianceAlerts = useMemo(() => {
    const alerts: { truck: Truck; doc: string; date: string; status: "Expired" | "Expiring Soon" }[] = [];
    for (const truck of trucks) {
      for (const { label, key } of DOC_FIELDS) {
        const date = truck[key] as string;
        if (!date) continue;
        const status = getComplianceStatus(date);
        if (status === "Valid") continue;
        alerts.push({ truck, doc: label, date, status });
      }
    }
    return alerts.sort((a, b) => a.date.localeCompare(b.date));
  }, [trucks]);

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Accounts Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">EMI obligations, trip finalization pipeline, and compliance overview</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!loading && overdueEmis.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{overdueEmis.length} EMI payment{overdueEmis.length > 1 ? "s" : ""} overdue</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Current Trips */}
      <CurrentTripsCard />

      {/* Compliance Alert Banner */}
      {(complianceExpired.length > 0 || complianceExpiringSoon.length > 0) && (
        <div className={cn(
          "rounded-2xl border px-5 py-4",
          complianceExpired.length > 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
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
              onClick={() => router.push("/maintenance/compliance")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                complianceExpired.length > 0
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              )}
            >
              View Compliance
            </button>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Landmark}     label="Active EMIs"           value={loading ? "—" : activeEmis.length}          color="bg-blue-100 text-blue-600"    sub={loading ? "" : `${fmt(monthlyEmiTotal)}/mo`} />
        <StatCard icon={AlertTriangle} label="EMI Overdue"           value={loading ? "—" : overdueEmis.length}         color="bg-red-100 text-red-600"      alert={overdueEmis.length > 0} sub={overdueEmis.length > 0 ? "Needs immediate action" : "All paid"} />
        <StatCard icon={CalendarCheck} label="Pending Finalization"  value={loading ? "—" : pendingFinalization.length} color="bg-violet-100 text-violet-600" sub="Trips awaiting invoice" />
        <StatCard icon={ShieldCheck}   label="Compliance Alerts"     value={loading ? "—" : complianceAlerts.length}   color="bg-amber-100 text-amber-600"  alert={complianceAlerts.filter(a => a.status === "Expired").length > 0} sub={complianceAlerts.length > 0 ? `${complianceAlerts.filter(a => a.status === "Expired").length} expired` : "All valid"} />
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Quick Access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <Link key={href} href={href}
              className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-center text-xs font-semibold transition-all hover:-translate-y-1 hover:shadow-md ${color}`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* EMI Schedule + Pending Finalization */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* EMI Payment Schedule */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={CalendarDays} title="Upcoming EMI Payments" badge={upcomingEmis.length} badgeColor="bg-blue-100 text-blue-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
          ) : overdueEmis.length === 0 && upcomingEmis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">No EMI payments due</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {/* Overdue first */}
              {overdueEmis.slice(0, 3).map((e) => {
                const daysOv = -daysBetween(e.emiPaymentDate);
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{e.emiName}</p>
                      <p className="text-[11px] text-gray-500">{e.truckRegistration} · {e.bankName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-red-600">{fmt(Number(e.emiAmount))}</p>
                      <p className="text-[10px] text-red-500">{daysOv}d overdue</p>
                    </div>
                  </li>
                );
              })}
              {/* Upcoming */}
              {upcomingEmis.map((e) => {
                const days = daysBetween(e.emiPaymentDate);
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                      <Landmark className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{e.emiName}</p>
                      <p className="text-[11px] text-gray-500">{e.truckRegistration} · {e.bankName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-gray-800">{fmt(Number(e.emiAmount))}</p>
                      <p className={`text-[10px] ${days <= 3 ? "font-semibold text-amber-600" : "text-gray-400"}`}>
                        {days === 0 ? "Due today" : `in ${days}d · ${fmtDate(e.emiPaymentDate)}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Pending Finalization */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={FileWarning} title="Trips Pending Invoice" badge={pendingFinalization.length} badgeColor="bg-violet-100 text-violet-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
          ) : pendingFinalization.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">All trips invoiced</p>
              <p className="text-xs text-gray-400">No pending finalization</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {pendingFinalization.slice(0, 6).map((trip) => (
                <li key={trip.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                    <CalendarCheck className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-900">{trip.tripId}</p>
                    <p className="text-[11px] text-gray-500 truncate">{trip.origin} → {trip.destination}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    trip.verificationStatus === "verified"
                      ? "bg-emerald-100 text-emerald-700"
                      : trip.verificationStatus === "flagged"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {trip.verificationStatus}
                  </span>
                </li>
              ))}
              {pendingFinalization.length > 6 && (
                <li className="pt-2 text-center">
                  <Link href="/trips/finalization" className="text-xs font-medium text-blue-600 hover:underline">
                    View all {pendingFinalization.length} trips →
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Compliance Alerts + Recurring Due Soon */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Compliance */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={ShieldCheck} title="Compliance Alerts" badge={complianceAlerts.length} badgeColor="bg-amber-100 text-amber-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
          ) : complianceAlerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <ShieldCheck className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">All documents valid</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {complianceAlerts.slice(0, 6).map((a, i) => {
                const days = daysBetween(a.date);
                const isExpired = a.status === "Expired";
                return (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isExpired ? "bg-red-100" : "bg-yellow-100"}`}>
                      <CircleDot className={`h-3 w-3 ${isExpired ? "text-red-600" : "text-yellow-600"}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{a.doc} — {a.truck.truckId}</p>
                      <p className="text-[11px] text-gray-500">{a.truck.registrationNumber}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${isExpired ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {isExpired ? `${Math.abs(days)}d ago` : `${days}d left`}
                      </span>
                    </div>
                  </li>
                );
              })}
              {complianceAlerts.length > 6 && (
                <li className="pt-2 text-center">
                  <Link href="/maintenance/compliance" className="text-xs font-medium text-blue-600 hover:underline">
                    View all {complianceAlerts.length} alerts →
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Recurring payments due soon */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={Clock} title="Recurring Payments Due Soon" badge={dueSoonRecurring.length} badgeColor="bg-teal-100 text-teal-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
          ) : dueSoonRecurring.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">No payments due in 7 days</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {dueSoonRecurring.map((r) => {
                const days = daysBetween(r.nextDueDate);
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50">
                      <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{r.title}</p>
                      <p className="text-[11px] text-gray-500">{r.category} · {r.frequency}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-gray-800">{fmt(r.amount)}</p>
                      <p className={`text-[10px] ${days === 0 ? "font-bold text-red-600" : days <= 3 ? "font-semibold text-amber-600" : "text-gray-400"}`}>
                        {days === 0 ? "Due today" : `in ${days}d`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

    </div>
  );
}
