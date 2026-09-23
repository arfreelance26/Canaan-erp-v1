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
  CircleDot,
} from "lucide-react";
import { financeApi, tripsApi, trucksApi, dashboardApi } from "@/lib/api";
import { showError } from "@/lib/swal";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { ComplianceAlertBanner } from "./ComplianceAlertBanner";
import { StatCard } from "./StatCard";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { getComplianceStatus } from "@/lib/compliance";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  return dt.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
}

function daysBetween(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function SectionTitle({ icon: Icon, title, badge, badgeVariant }: {
  icon: React.ElementType;
  title: string;
  badge?: string | number;
  badgeVariant?: "active" | "available" | "warning" | "critical" | "neutral" | "purple";
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-gray-400" />
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {badge !== undefined && Number(badge) > 0 && (
        <Badge variant={badgeVariant ?? "neutral"}>{badge}</Badge>
      )}
    </div>
  );
}

export function FinanceManagerDashboard() {
  const [emiRecords, setEmiRecords]     = useState<EmiRecord[]>([]);
  const [recurring, setRecurring]       = useState<RecurringPayment[]>([]);
  const [trips, setTrips]               = useState<Trip[]>([]);
  const [trucks, setTrucks]             = useState<Truck[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);

  useEffect(() => {
    // allSettled, not all — a failed call (e.g. right after relogin) must not
    // blank the whole dashboard; each section keeps its last-known-good state
    // and a toast names what didn't refresh.
    Promise.allSettled([
      financeApi.listEmi(),
      financeApi.listRecurring(),
      tripsApi.list(),
      trucksApi.list(),
    ])
      .then(([emi, rec, trps, trks]) => {
        const failed: string[] = [];
        if (emi.status === "fulfilled") setEmiRecords(emi.value); else failed.push("EMI Records");
        if (rec.status === "fulfilled") setRecurring(rec.value); else failed.push("Recurring Payments");
        if (trps.status === "fulfilled") setTrips(trps.value); else failed.push("Trips");
        if (trks.status === "fulfilled") setTrucks(trks.value); else failed.push("Trucks");
        if (failed.length > 0) {
          showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
        }
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
  const monthlyEmiTotal = useMemo(() => activeEmis.reduce((s, e) => s + Number(e.emiAmount || 0), 0), [activeEmis]);

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
          <div className="flex items-center gap-3.5">
            <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-600 shadow-sm">
              <Landmark className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Accounts Dashboard</h1>
              <p className="mt-0.5 text-sm text-gray-500">EMI obligations, trip finalization pipeline, and compliance overview</p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Compliance Alert Banner */}
      <ComplianceAlertBanner
        expired={complianceExpired}
        expiringSoon={complianceExpiringSoon}
        href="/maintenance/compliance"
        actionLabel="View Compliance"
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard icon={Landmark}      label="Active EMIs"          value={loading ? "—" : activeEmis.length}          variant="blue"    caption={loading ? "" : `${fmt(monthlyEmiTotal)}/mo`} />
        <StatCard icon={CalendarCheck} label="Pending Finalization" value={loading ? "—" : pendingFinalization.length} variant="purple"  caption="Trips awaiting invoice" />
        <StatCard icon={ShieldCheck}   label="Compliance Alerts"    value={loading ? "—" : complianceAlerts.length}    variant={complianceAlerts.some(a => a.status === "Expired") ? "red" : "amber"} caption={complianceAlerts.length > 0 ? `${complianceAlerts.filter(a => a.status === "Expired").length} expired` : "All valid"} />
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

      {/* Pending Finalization */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-gray-800">Trips Pending Invoice</h2>
              {!loading && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-blue-700">
                  {pendingFinalization.length}
                </span>
              )}
            </div>
            {pendingFinalization.length > 0 && (
              <Link href="/trips/finalization" className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800">
                View all →
              </Link>
            )}
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : pendingFinalization.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">All trips invoiced</p>
              <p className="text-xs text-gray-400">No pending finalization</p>
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1">
              {pendingFinalization.slice(0, 8).map((trip) => {
                const st = trip.verificationStatus;
                const tone =
                  st === "verified" ? { text: "text-emerald-700", dot: "bg-emerald-500" }
                  : st === "flagged" ? { text: "text-red-700", dot: "bg-red-500" }
                  : { text: "text-gray-500", dot: "bg-gray-400" };
                return (
                  <li key={trip.id} className="flex items-center gap-4 py-2.5">
                    <p className="w-24 shrink-0 text-sm font-semibold tabular-nums text-gray-900">{trip.tripId}</p>
                    <p className="min-w-0 flex-1 truncate text-xs uppercase text-gray-500">
                      {trip.origin} <span className="px-1 text-gray-300">→</span> {trip.destination}
                    </p>
                    <span className={`flex shrink-0 items-center gap-1.5 text-xs font-medium capitalize ${tone.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                      {st}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Compliance Alerts + Recurring Due Soon */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Compliance */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-gray-800">Compliance Alerts</h2>
                {!loading && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    complianceAlerts.some((a) => a.status === "Expired") ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    {complianceAlerts.length}
                  </span>
                )}
              </div>
              {complianceAlerts.length > 0 && (
                <Link href="/maintenance/compliance" className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800">
                  View all →
                </Link>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : complianceAlerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <ShieldCheck className="h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium text-gray-600">All documents valid</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1">
                {complianceAlerts.slice(0, 10).map((a, i) => {
                  const days = daysBetween(a.date);
                  const isExpired = a.status === "Expired";
                  return (
                    <li key={i} className="flex items-center gap-3 py-2.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${isExpired ? "bg-red-500" : "bg-amber-400"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {a.doc} <span className="font-normal text-gray-400">·</span> {a.truck.registrationNumber}
                        </p>
                        <p className="text-[11px] text-gray-500">{a.truck.truckId}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold tabular-nums ${isExpired ? "text-red-600" : "text-amber-600"}`}>
                        {isExpired ? `${Math.abs(days).toLocaleString("en-IN")}d overdue` : `${days}d left`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recurring payments due soon */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-gray-800">Recurring Payments Due Soon</h2>
              {!loading && dueSoonRecurring.length > 0 && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-blue-700">
                  {dueSoonRecurring.length}
                </span>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : dueSoonRecurring.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium text-gray-600">Nothing due in the next 7 days</p>
                <p className="text-xs text-gray-400">Upcoming recurring payments will appear here</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto pr-1">
                {dueSoonRecurring.map((r) => {
                  const days = daysBetween(r.nextDueDate);
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{r.title}</p>
                        <p className="text-[11px] text-gray-500">{r.category} · {r.frequency}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{fmt(r.amount)}</p>
                        <p className={`text-[11px] ${days === 0 ? "font-semibold text-red-600" : days <= 3 ? "font-medium text-amber-600" : "text-gray-400"}`}>
                          {days === 0 ? "Due today" : `in ${days}d`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
