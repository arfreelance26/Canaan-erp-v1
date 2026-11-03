"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiNotification3Line as Bell, RiCalendarScheduleLine as CalendarClock, RiAlertLine as AlertTriangle, RiUserLine as User, RiShieldCheckLine as ShieldCheck, RiToolsLine as Wrench, RiArrowGoBackLine as RotateCcw, RiSunFoggyLine as Sunrise } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications, maintenanceAlertHref, reverificationAlertHref } from "@/context/NotificationContext";
import { editApprovalsApi, deletionApprovalsApi, attendanceApi, maintenanceRequestsApi } from "@/lib/api";
import type { LeaveRequest } from "@/types/leave-request";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
// The Topbar bell is deliberately a short, capped preview (see its own
// grouping/cap logic) — this page is its uncapped counterpart: literally
// every notification across every category the bell tracks, in one
// searchable, filterable list. Same categories, same role gating, same
// "click to go review it" behavior, just nothing hidden or grouped away.

type Category =
  | "Edit Requests" | "Deletion Requests" | "Leave Requests"
  | "Trip Sheet Alerts" | "KM Variance Alerts" | "Compliance Alerts"
  | "Renewals & Payments" | "Your Request Updates" | "Maintenance Alerts" | "Maintenance Approvals"
  | "Re-Verification" | "Daily Summary";

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
  purple: { chip: "bg-purple-surface-strong", icon: "text-purple-text", hover: "hover:bg-purple-surface-strong/60", text: "text-purple-text" },
  red: { chip: "bg-danger-surface-strong", icon: "text-danger-text", hover: "hover:bg-danger-surface-strong/60", text: "text-danger-text" },
  rose: { chip: "bg-danger-surface-strong", icon: "text-danger-text", hover: "hover:bg-danger-surface-strong/60", text: "text-danger-text" },
  violet: { chip: "bg-purple-surface-strong", icon: "text-purple-text", hover: "hover:bg-purple-surface-strong/60", text: "text-purple-text" },
  orange: { chip: "bg-orange-surface-strong", icon: "text-orange-text", hover: "hover:bg-orange-surface-strong/60", text: "text-orange-text" },
  amber: { chip: "bg-warning-surface-strong", icon: "text-warning-text", hover: "hover:bg-warning-surface-strong/60", text: "text-warning-text" },
  blue: { chip: "bg-accent-surface-strong", icon: "text-accent-text", hover: "hover:bg-accent-surface-strong/60", text: "text-accent-text" },
  green: { chip: "bg-success-surface-strong", icon: "text-success-text", hover: "hover:bg-success-surface-strong/60", text: "text-success-text" },
  gray: { chip: "bg-fill-2", icon: "text-text-secondary", hover: "hover:bg-fill-2", text: "text-text-secondary" },
};

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { sheetAlerts, kmVarianceAlerts, maintenanceAlerts, dismissMaintenanceAlert, reverificationAlerts, dismissReverificationAlert, summaryAlerts, dismissSummaryAlert, reminders, complianceAlertCount } = useNotifications();

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

    const reverificationItems: NotifItem[] = reverificationAlerts.map((a) => ({
      key: `reverify-${a.serverId}`,
      category: "Re-Verification",
      icon: RotateCcw,
      tone: "violet",
      title: `${a.tripIdStr} came for Re-Verification`,
      detail: `${a.remark} — by ${a.by}${a.role ? ` (${a.role})` : ""}`,
      time: a.alertedAt,
      href: reverificationAlertHref(a.driverId),
      onOpen: () => dismissReverificationAlert(a.serverId),
    }));

    const summaryItems: NotifItem[] = summaryAlerts.map((a) => ({
      key: `summary-${a.serverId}`,
      category: "Daily Summary",
      icon: Sunrise,
      tone: "amber",
      title: a.title,
      detail: a.attention > 0 ? `${a.headline} ${a.attention} thing${a.attention === 1 ? "" : "s"} need${a.attention === 1 ? "s" : ""} your attention.` : a.headline,
      time: a.alertedAt,
      href: "/",
      onOpen: () => dismissSummaryAlert(a.serverId),
    }));

    return [...editRequests, ...deletionRequests, ...maintenanceRequests, ...leaveRequests, ...maintenanceItems, ...reverificationItems, ...summaryItems, ...sheetItems, ...kmItems, ...complianceItems, ...reminderItems, ...myUpdates]
      .sort((a, b) => (b.time || "").localeCompare(a.time || ""));
  }, [editRequests, deletionRequests, maintenanceRequests, leaveRequests, maintenanceAlerts, dismissMaintenanceAlert, reverificationAlerts, dismissReverificationAlert, summaryAlerts, dismissSummaryAlert, sheetAlerts, kmVarianceAlerts, complianceAlertCount, reminders, myUpdates, isAdmin, remindersLabel, user?.softwareDesignation]);

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
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Notifications</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Every notification relevant to you — the bell up top only shows a short preview of this.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search notifications…" value={search} onChange={setSearch} />
        <div className="flex flex-wrap gap-1.5 rounded-full border border-separator-border bg-background-primary-default p-1 shadow-sm">
          {(["All", ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "flex h-8 items-center whitespace-nowrap rounded-full px-3 text-caption-1-semibold transition-colors",
                category === c ? "bg-accent-solid text-on-solid" : "text-text-secondary hover:bg-fill-3"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-separator-border bg-background-primary-default">
        {filtered.length === 0 ? (
          <EmptyState size="compact" illustration="not-found" title={allItems.length === 0 ? "You're all caught up — nothing here" : "No notifications match these filters"} />
        ) : (
          <ul className="divide-y divide-separator-border">
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
                      <p className="text-caption-2-semibold text-text-tertiary">{item.category}</p>
                      <p className="text-body-semibold text-text-primary">{item.title}</p>
                      {item.detail && <p className="truncate text-xs text-text-secondary">{item.detail}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-text-tertiary">{timeAgo(item.time)}</span>
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
