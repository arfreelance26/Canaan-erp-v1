"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  AlertTriangle,
  User,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications, maintenanceAlertHref } from "@/context/NotificationContext";
import { editApprovalsApi, deletionApprovalsApi, attendanceApi, maintenanceRequestsApi } from "@/lib/api";
import type { LeaveRequest } from "@/types/leave-request";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

// The Topbar bell is deliberately a short, capped preview (see its own
// grouping/cap logic) — this page is its uncapped counterpart: literally
// every notification across every category the bell tracks, in one
// searchable, filterable list. Same categories, same role gating, same
// "click to go review it" behavior, just nothing hidden or grouped away.

type Category =
  | "Edit Requests" | "Deletion Requests" | "Leave Requests"
  | "Trip Sheet Alerts" | "KM Variance Alerts" | "Compliance Alerts"
  | "Renewals & Payments" | "Your Request Updates" | "Maintenance Alerts" | "Maintenance Approvals";

type NotifItem = {
  key: string;
  category: Category;
  icon: typeof Bell;
  tone: string;     // tailwind color stem, e.g. "purple"
  title: string;
  detail?: string;
  time: string;      // ISO-ish, for sorting + relative display
  href: string;
  /** Runs before navigating — e.g. marks a maintenance alert read for this person. */
  onOpen?: () => void;
};

function timeAgo(raw: string): string {
  if (!raw) return "";
  const s = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TONE_CLASSES: Record<string, { chip: string; icon: string; hover: string; text: string }> = {
  purple: { chip: "bg-purple-100", icon: "text-purple-600", hover: "hover:bg-purple-50/60", text: "text-purple-700" },
  red: { chip: "bg-red-100", icon: "text-red-600", hover: "hover:bg-red-50/60", text: "text-red-700" },
  rose: { chip: "bg-rose-100", icon: "text-rose-600", hover: "hover:bg-rose-50/60", text: "text-rose-700" },
  orange: { chip: "bg-orange-100", icon: "text-orange-600", hover: "hover:bg-orange-50/60", text: "text-orange-700" },
  amber: { chip: "bg-amber-100", icon: "text-amber-600", hover: "hover:bg-amber-50/60", text: "text-amber-700" },
  blue: { chip: "bg-blue-100", icon: "text-blue-600", hover: "hover:bg-blue-50/60", text: "text-blue-700" },
  green: { chip: "bg-green-100", icon: "text-green-600", hover: "hover:bg-green-50/60", text: "text-green-700" },
  gray: { chip: "bg-gray-100", icon: "text-gray-500", hover: "hover:bg-gray-50", text: "text-gray-600" },
};

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { sheetAlerts, kmVarianceAlerts, maintenanceAlerts, dismissMaintenanceAlert, reminders, complianceAlertCount } = useNotifications();

  const isAdmin = user?.softwareDesignation === "Admin";
  const isFleetManager = user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";
  const isFinanceManager = user?.softwareDesignation === "Accounts";
  const canSeeEditApprovals = isAdmin || isFleetManager;
  const remindersLabel: Category = "Renewals & Payments";

  const [loading, setLoading] = useState(true);
  const [editRequests, setEditRequests] = useState<NotifItem[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<NotifItem[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<NotifItem[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<NotifItem[]>([]);
  const [myUpdates, setMyUpdates] = useState<NotifItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");

  useEffect(() => {
    const loaders: Promise<void>[] = [];

    if (canSeeEditApprovals) {
      loaders.push(
        editApprovalsApi.list("Pending").then((rows) => {
          setEditRequests(
            rows.map((r) => ({
              key: `edit-${r.id}`,
              category: "Edit Requests",
              icon: CalendarClock,
              tone: "purple",
              title: `${r.staffName} is requesting ${r.action.toLowerCase()} access`,
              detail: `${r.resourceType}: ${r.resourceName}`,
              time: r.createdAt ?? "",
              href: "/attendance/edit-approvals",
            }))
          );
        }).catch(() => {})
      );
    }

    if (isAdmin) {
      loaders.push(
        deletionApprovalsApi.list("Pending").then((rows) => {
          setDeletionRequests(
            rows.map((r) => ({
              key: `deletion-${r.id}`,
              category: "Deletion Requests",
              icon: AlertTriangle,
              tone: "red",
              title: `${r.requestedByName} is requesting deletion`,
              detail: `${r.resourceType}: ${r.resourceName}`,
              time: r.createdAt ?? "",
              href: "/attendance/deletion-approvals",
            }))
          );
        }).catch(() => {})
      );
      loaders.push(
        attendanceApi.listLeaveRequests("Pending").then((rows: LeaveRequest[]) => {
          setLeaveRequests(
            rows.map((r) => ({
              key: `leave-${r.id}`,
              category: "Leave Requests",
              icon: User,
              tone: "blue",
              title: `${r.applicantName} (${r.category})`,
              detail: `Leave: ${formatDate(r.fromDate)} → ${formatDate(r.toDate)}${r.reason ? ` — ${r.reason}` : ""}`,
              time: r.appliedAt ?? "",
              href: "/attendance/leave-approvals",
            }))
          );
        }).catch(() => {})
      );
    }

    if (isAdmin || isFinanceManager) {
      loaders.push(
        maintenanceRequestsApi.list({ status: "Pending" }).then((rows) => {
          setMaintenanceRequests(
            rows.map((r) => ({
              key: `maint-req-${r.id}`,
              category: "Maintenance Approvals",
              icon: Wrench,
              tone: "blue",
              title: `${r.submittedByName} added ${r.maintenanceType} — ${r.registrationNumber || r.truckIdStr}`,
              detail: `₹${r.cost.toLocaleString("en-IN")}${r.source === "Trip Sheet" ? ` · from trip sheet ${r.tripIdStr ?? ""}` : ""} · waiting for approval`,
              time: r.createdAt,
              href: "/attendance/maintenance-approvals",
            }))
          );
        }).catch(() => {})
      );
    }

    if (user?.id != null) {
      loaders.push(
        Promise.allSettled([editApprovalsApi.getMine(), deletionApprovalsApi.listMine(), maintenanceRequestsApi.listMine()]).then(([e, d, m]) => {
          const fromEdit: NotifItem[] = e.status === "fulfilled"
            ? e.value.filter((r) => r.status !== "Pending" && !r.requesterSeenAt).map((r) => ({
                key: `my-edit-${r.id}`,
                category: "Your Request Updates",
                icon: User,
                tone: r.status === "Approved" ? "green" : "red",
                title: r.status === "Approved" ? "Your edit access has been approved" : "Your edit request was rejected",
                detail: `${r.action} access for: ${r.resourceName}`,
                time: r.approvedAt ?? "",
                href: "/personal/edit-delete-requests",
              }))
            : [];
          const fromDeletion: NotifItem[] = d.status === "fulfilled"
            ? d.value.filter((r) => r.status !== "Pending" && !r.requesterSeenAt).map((r) => ({
                key: `my-deletion-${r.id}`,
                category: "Your Request Updates",
                icon: User,
                tone: r.status === "Approved" ? "green" : "red",
                title: r.status === "Approved" ? "Your deletion request has been approved" : "Your deletion request was rejected",
                detail: `Delete: ${r.resourceName}`,
                time: r.approvedAt ?? "",
                href: "/personal/edit-delete-requests",
              }))
            : [];
          const fromMaintenance: NotifItem[] = m.status === "fulfilled"
            ? m.value.filter((r) => (r.status === "Approved" || r.status === "Rejected") && !r.requesterSeenAt).map((r) => ({
                key: `my-maint-${r.id}`,
                category: "Your Request Updates",
                icon: Wrench,
                tone: r.status === "Approved" ? "green" : "red",
                title: r.status === "Approved" ? "Your maintenance record was approved" : "Your maintenance record was rejected",
                detail: `${r.registrationNumber || r.truckIdStr} · ${r.maintenanceType}${r.status === "Rejected" && r.rejectReason ? ` — ${r.rejectReason}` : ""}`,
                time: r.decidedAt ?? "",
                href: "/maintenance/trucks",
              }))
            : [];
          setMyUpdates([...fromEdit, ...fromDeletion, ...fromMaintenance]);
        })
      );
    }

    Promise.allSettled(loaders).finally(() => setLoading(false));
  }, [canSeeEditApprovals, isAdmin, isFinanceManager, user?.id]);

  const allItems = useMemo<NotifItem[]>(() => {
    const sheetItems: NotifItem[] = sheetAlerts.map((a, i) => ({
      key: `sheet-${a.tripIdStr}-${i}`,
      category: "Trip Sheet Alerts",
      icon: AlertTriangle,
      tone: "orange",
      title: "Trip sheet not yet received",
      detail: `Booking ref: ${a.bookingRef}${a.tripIdStr ? ` (${a.tripIdStr})` : ""}${a.reportedBy ? ` — reported by ${a.reportedBy}` : ""}`,
      time: a.alertedAt,
      href: isAdmin ? "/trips/sheet-collection" : "/trips/current",
    }));
    const kmItems: NotifItem[] = kmVarianceAlerts.map((a, i) => ({
      key: `km-${a.tripIdStr}-${i}`,
      category: "KM Variance Alerts",
      icon: AlertTriangle,
      tone: "amber",
      title: "KM distance variance recorded",
      detail: `Booking: ${a.bookingRef}${a.tripIdStr ? ` (${a.tripIdStr})` : ""} — ${a.kmRemark}`,
      time: a.alertedAt,
      href: isAdmin ? "/trips/reconciliation" : "/trips/current",
    }));
    const complianceItems: NotifItem[] = isAdmin && complianceAlertCount > 0
      ? [{
          key: "compliance",
          category: "Compliance Alerts",
          icon: AlertTriangle,
          tone: "red",
          title: `${complianceAlertCount} truck document${complianceAlertCount === 1 ? "" : "s"} need attention`,
          detail: "Renew expired documents immediately.",
          time: new Date().toISOString(),
          href: "/resources/fleet",
        }]
      : [];
    const reminderItems: NotifItem[] = reminders.map((r, i) => ({
      key: `reminder-${r.entity}-${i}`,
      category: remindersLabel,
      icon: CalendarClock,
      tone: r.severity === "overdue" ? "red" : "amber",
      title: r.title,
      detail: r.detail,
      time: new Date().toISOString(),
      href: r.href,
    }));

    const maintenanceItems: NotifItem[] = maintenanceAlerts.map((a) => ({
      key: `maint-${a.serverId}`,
      category: "Maintenance Alerts",
      icon: Wrench,
      tone: a.kind === "due" ? "rose" : "amber",
      title: `${a.maintenanceType} ${a.kind === "due" ? "is due" : "due soon"} — ${a.registration}`,
      detail: `Reminder at ${a.remindAt.toLocaleString("en-IN")} km · odometer ${a.odometer.toLocaleString("en-IN")} km when alerted`,
      time: a.alertedAt,
      href: maintenanceAlertHref(user?.softwareDesignation, a.registration),
      onOpen: () => dismissMaintenanceAlert(a.serverId),
    }));

    return [...editRequests, ...deletionRequests, ...maintenanceRequests, ...leaveRequests, ...maintenanceItems, ...sheetItems, ...kmItems, ...complianceItems, ...reminderItems, ...myUpdates]
      .sort((a, b) => (b.time || "").localeCompare(a.time || ""));
  }, [editRequests, deletionRequests, maintenanceRequests, leaveRequests, maintenanceAlerts, dismissMaintenanceAlert, sheetAlerts, kmVarianceAlerts, complianceAlertCount, reminders, myUpdates, isAdmin, remindersLabel, user?.softwareDesignation]);

  const categories = useMemo<Category[]>(
    () => [...new Set(allItems.map((i) => i.category))],
    [allItems]
  );

  const q = search.trim().toLowerCase();
  const filtered = allItems.filter(
    (i) =>
      (category === "All" || i.category === category) &&
      (!q || i.title.toLowerCase().includes(q) || (i.detail ?? "").toLowerCase().includes(q))
  );

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 shadow-sm">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Notifications</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Every notification relevant to you — the bell up top only shows a short preview of this.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search notifications…" value={search} onChange={setSearch} />
        <div className="flex flex-wrap gap-1.5 rounded-full border border-gray-200 bg-white p-1 shadow-sm">
          {(["All", ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "flex h-8 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors",
                category === c ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ShieldCheck className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              {allItems.length === 0 ? "You're all caught up — nothing here." : "No notifications match these filters."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((item) => {
              const t = TONE_CLASSES[item.tone] ?? TONE_CLASSES.gray;
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => { item.onOpen?.(); router.push(item.href); }}
                    className={cn("flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors", t.hover)}
                  >
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", t.chip)}>
                      <Icon className={cn("h-4 w-4", t.icon)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{item.category}</p>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      {item.detail && <p className="truncate text-xs text-gray-500">{item.detail}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">{timeAgo(item.time)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
