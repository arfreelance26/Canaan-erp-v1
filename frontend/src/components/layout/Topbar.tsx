"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ChevronRight, Search, Bell, ChevronDown, ShieldAlert, ShieldCheck } from "lucide-react";
import { sidebarSections } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { ProfileModal } from "./ProfileModal";
import { trucksApi, financeApi } from "@/lib/api";
import { getComplianceStatus } from "@/lib/compliance";
import type { Truck } from "@/types/truck";
import type { EmiRecord } from "@/types/finance";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type AppNotification = {
  category: "Compliance" | "EMI Payment" | "EMI Ending";
  severity: "danger" | "warning";
  title: string;
  subtitle: string;
  timeLabel: string;
};

const DOC_FIELDS: { label: string; key: keyof Truck }[] = [
  { label: "RC",                    key: "rcValidityDate" },
  { label: "FC",                    key: "fcExpiryDate" },
  { label: "Road Tax",              key: "roadTaxDate" },
  { label: "National Permit",       key: "nationalPermitDate" },
  { label: "Local Permit",          key: "localPermitDate" },
  { label: "Pollution Certificate", key: "pollutionCertificateDate" },
  { label: "Insurance",             key: "insuranceExpiryDate" },
];

function useBackendStatus() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () =>
      fetch(`${API_URL}/`)
        .then(() => setOnline(true))
        .catch(() => setOnline(false));
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);
  return online;
}

function getPageLabel(pathname: string): string {
  for (const section of sidebarSections) {
    for (const item of section.items) {
      if (item.href === pathname) return item.label;
    }
  }
  return "Dashboard";
}

export function Topbar() {
  const pathname = usePathname();
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: getPageLabel(pathname) }];
  const backendOnline = useBackendStatus();
  const { user, logout } = useAuth();

  const [isProfileOpen, setIsProfileOpen]     = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen]         = useState(false);
  const [trucks, setTrucks]                   = useState<Truck[]>([]);
  const [emiRecords, setEmiRecords]           = useState<EmiRecord[]>([]);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);

  function getInitials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => {});
    financeApi.listEmi().then(setEmiRecords).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const notifications = useMemo<AppNotification[]>(() => {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const todayStr = todayDate.toISOString().slice(0, 10);

    function daysBetween(dateStr: string): number {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      return Math.round((d.getTime() - todayDate.getTime()) / 86400000);
    }

    const result: AppNotification[] = [];

    // Compliance notifications
    for (const truck of trucks) {
      for (const { label, key } of DOC_FIELDS) {
        const dateStr = truck[key] as string;
        if (!dateStr) continue;
        const status = getComplianceStatus(dateStr);
        if (status === "Valid") continue;
        const days = daysBetween(dateStr);
        const daysAbs = Math.abs(days);
        const isExpired = status === "Expired";
        result.push({
          category: "Compliance",
          severity: isExpired ? "danger" : "warning",
          title: `${label} — ${truck.truckId}`,
          subtitle: truck.registrationNumber,
          timeLabel: isExpired
            ? daysAbs === 0 ? "Expired today" : `Expired ${daysAbs} day${daysAbs !== 1 ? "s" : ""} ago`
            : days === 0 ? "Expires today" : `Expires in ${days} day${days !== 1 ? "s" : ""}`,
        });
      }
    }

    // EMI notifications — only active EMIs (emiEndDate >= today)
    for (const record of emiRecords) {
      if (record.emiEndDate < todayStr) continue;

      const daysUntilEnd = daysBetween(record.emiEndDate);
      const daysOverdue = -daysBetween(record.emiPaymentDate);

      // Payment due / overdue
      if (record.emiPaymentDate <= todayStr) {
        result.push({
          category: "EMI Payment",
          severity: "danger",
          title: record.emiName,
          subtitle: `${record.truckRegistration} · ${record.bankName}`,
          timeLabel: daysOverdue === 0
            ? "Payment due today"
            : `Payment ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`,
        });
      }

      // Last month — ending within 30 days
      if (daysUntilEnd <= 30) {
        result.push({
          category: "EMI Ending",
          severity: "warning",
          title: `${record.emiName} — Final Month`,
          subtitle: `${record.truckRegistration} · ${record.bankName}`,
          timeLabel: daysUntilEnd === 0
            ? "Loan ends today"
            : `Loan ends in ${daysUntilEnd} day${daysUntilEnd !== 1 ? "s" : ""}`,
        });
      }
    }

    // Sort: danger first, then warning; within each group by urgency
    return result.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "danger" ? -1 : 1;
      return 0;
    });
  }, [trucks, emiRecords]);

  const badgeCount = notifications.length;
  const dangerCount = notifications.filter((n) => n.severity === "danger").length;
  const warningCount = notifications.filter((n) => n.severity === "warning").length;

  return (
    <>
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-white/50 bg-white/60 backdrop-blur-xl px-6 shadow-sm">
      <nav className="flex items-center gap-2 text-[15px]">
        <Link href="/" className="text-gray-400 hover:text-gray-900 transition-all duration-300 hover:-translate-y-0.5 hover:scale-110">
          <Home className="h-4 w-4" />
        </Link>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <span key={crumb.label} className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-gray-300" />
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="text-gray-500 hover:text-gray-900 transition-colors duration-300">
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? "font-semibold text-gray-900" : "text-gray-500"}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search jobs, LR, trips..."
            className="w-64 rounded-full border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-700 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05),0_4px_6px_-2px_rgba(0,0,0,0.025)] placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:border-blue-200 focus:w-72"
          />
        </div>

        {backendOnline === false && (
          <span className="hidden items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Backend offline — run start.sh
          </span>
        )}
        {backendOnline === true && (
          <span className="hidden items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        )}

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => setIsNotifOpen((v) => !v)}
            className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-blue-500/10"
          >
            <Bell className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            {badgeCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 z-[100] mt-3 w-[360px] origin-top-right rounded-2xl border border-white/60 bg-white/95 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-gray-500" />
                  <span className="text-[13px] font-semibold text-gray-900">Notifications</span>
                </div>
                <div className="flex items-center gap-2">
                  {dangerCount > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                      {dangerCount} Urgent
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-700">
                      {warningCount} Warning
                    </span>
                  )}
                </div>
              </div>

              {/* Notification list */}
              <div className="max-h-[380px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <ShieldCheck className="h-8 w-8 text-green-400" />
                    <p className="text-[13px] font-medium text-gray-700">Everything looks good</p>
                    <p className="text-xs text-gray-400">No compliance issues or EMI alerts</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50 py-1">
                    {notifications.map((n, i) => {
                      const isDanger = n.severity === "danger";
                      const categoryColors: Record<AppNotification["category"], string> = {
                        "Compliance":  "bg-blue-50 text-blue-600",
                        "EMI Payment": "bg-red-50 text-red-600",
                        "EMI Ending":  "bg-orange-50 text-orange-600",
                      };
                      return (
                        <li key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/80 transition-colors">
                          <span
                            className={cn(
                              "mt-1 h-2 w-2 shrink-0 rounded-full",
                              isDanger ? "bg-red-500" : "bg-yellow-400"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[13px] font-medium text-gray-900 leading-snug">
                                {n.title}
                              </p>
                              <span className={cn(
                                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                categoryColors[n.category]
                              )}>
                                {n.category}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500 truncate">{n.subtitle}</p>
                            <p className={cn(
                              "mt-0.5 text-[11px] font-medium",
                              isDanger ? "text-red-600" : "text-yellow-600"
                            )}>
                              {n.timeLabel}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-around border-t border-gray-100 px-4 py-2.5 gap-3">
                <Link
                  href="/maintenance/compliance"
                  onClick={() => setIsNotifOpen(false)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Compliance &amp; Renewals →
                </Link>
                <span className="h-3 w-px bg-gray-200" />
                <Link
                  href="/finance/emi-tracking"
                  onClick={() => setIsNotifOpen(false)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  EMI Tracking →
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="group relative flex items-center gap-2.5 rounded-full border border-white/60 bg-white/60 p-1 pr-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)] backdrop-blur-md transition-all duration-300 hover:bg-white hover:shadow-md hover:-translate-y-0.5 after:absolute after:-inset-2"
          >
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.name}
                className="h-8 w-8 rounded-full object-cover ring-2 ring-white"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-xs font-bold text-white ring-2 ring-white">
                {getInitials(user?.name ?? "U")}
              </div>
            )}
            <span className="text-[14px] font-semibold text-gray-900">{user?.name ?? "—"}</span>
            <ChevronDown className={cn("h-4 w-4 text-gray-900 transition-transform duration-200", isProfileOpen ? "rotate-180" : "")} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 z-[100] mt-3 w-52 origin-top-right rounded-2xl border border-white/60 bg-white/95 p-2 shadow-[0_10px_40px_rgba(0,0,0,0.1)] backdrop-blur-2xl focus:outline-none">
              <div className="mb-2 flex items-center gap-2.5 px-3 pt-1.5 pb-2.5 border-b border-gray-100">
                {user?.photoUrl ? (
                  <img
                    src={user.photoUrl}
                    alt={user.name}
                    className="h-9 w-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-bold text-white">
                    {getInitials(user?.name ?? "U")}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-gray-900">{user?.name}</p>
                  <p className="text-[11px] text-blue-600 font-medium">{user?.softwareDesignation}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 animate-stagger">
                <button
                  className="relative block w-full rounded-xl px-4 py-2.5 text-left text-[15px] font-medium text-gray-700 transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-white/80 hover:text-gray-900 hover:shadow-[0_4px_15px_rgba(0,0,0,0.05)] border border-transparent hover:border-white/50 after:absolute after:-inset-2"
                  onClick={() => { setIsProfileOpen(false); setIsProfileModalOpen(true); }}
                >
                  Profile
                </button>
                <button
                  className="relative block w-full rounded-xl px-4 py-2.5 text-left text-[15px] font-medium text-red-600 transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-red-50/80 hover:shadow-[0_4px_15px_rgba(239,68,68,0.1)] border border-transparent hover:border-red-100/50 after:absolute after:-inset-2"
                  onClick={() => { setIsProfileOpen(false); logout(); }}
                >
                  Log Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    <ProfileModal
      open={isProfileModalOpen}
      onClose={() => setIsProfileModalOpen(false)}
    />
    </>
  );
}
