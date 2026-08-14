"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ChevronRight, Bell, ChevronDown, CalendarClock, User, AlertTriangle, MessageSquare, Menu } from "lucide-react";
import { sidebarSections } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { ProfileModal } from "./ProfileModal";
import { DisplaySettings } from "./DisplaySettings";
import { NetworkStatus } from "./NetworkStatus";
import { attendanceApi, editApprovalsApi } from "@/lib/api";
import type { LeaveRequest } from "@/types/leave-request";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { formatDate } from "@/lib/format-date";
import { useNotifications } from "@/context/NotificationContext";
// import { useChat } from "@/context/ChatContext"; // Next phase
import { showToast } from "@/lib/swal";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

// Trip pages whose local search is driven by the Topbar global search
const SEARCHABLE_TRIP_PATHS = new Set([
  "/trips/assign",
  "/trips/available",
  "/trips/current",
  "/trips/completed",
  "/trips/history",
  "/trips/verification",
  "/trips/sheet-collection",
  "/trips/reconciliation",
]);

// Where the global search lands per role (their main trips page)
const SEARCH_TARGET_BY_ROLE: Record<string, string> = {
  Admin: "/trips/history",
  "Commercial Manager": "/trips/current",
  "Assistant Commercial Manager": "/trips/current",
  Accounts: "/trips/verification",
  "Yard Supervisor": "/trips/sheet-collection",
  "Trip Sheet Register": "/trips/reconciliation",
};

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

function timeAgo(raw: string): string {
  if (!raw) return "";
  const s = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtIST(raw: string): string {
  if (!raw) return "";
  const s = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).replace(/\//g, "-");
}

type EditRequestNotif = {
  id: number;
  staffName: string;
  resourceType: string;
  resourceName: string;
  action: string;
  createdAt: string;
};

type EditApprovalNotif = {
  id: number;
  resourceName: string;
  action: string;
  status: "Approved" | "Rejected";
  expiresAt: string;
  notifiedAt: string;
};

export function Topbar({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: getPageLabel(pathname) }];
  const backendOnline = useBackendStatus();
  const { user, logout } = useAuth();

  const isAdmin          = user?.softwareDesignation === "Admin";
  const isFleetManager   = user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";
  const isFinanceManager = user?.softwareDesignation === "Accounts";
  const isStaff          = user?.softwareDesignation === "Trip Sheet Register";
  // Header for the reminders block depends on what the role actually receives
  const remindersHeading = isAdmin
    ? "Renewals & Payments"
    : isFleetManager
    ? "Renewals"
    : isFinanceManager
    ? "Payments"
    : "Reminders";

  const { sheetAlerts, kmVarianceAlerts, reminders, complianceAlertCount, pushSheetAlert, dismissSheetAlert, pushKmVarianceAlert, dismissKmVarianceAlert } = useNotifications();
  // const { isOpen: isChatOpen, toggle: toggleChat } = useChat(); // Next phase

  const [isProfileOpen, setIsProfileOpen]         = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen]             = useState(false);
  const [leaveRequests, setLeaveRequests]         = useState<LeaveRequest[]>([]);
  const [editRequestNotifs, setEditRequestNotifs] = useState<EditRequestNotif[]>([]);   // Admin
  const [editApprovalNotifs, setEditApprovalNotifs] = useState<EditApprovalNotif[]>([]); // Staff

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);
  const shownEditReqIds = useRef(new Set<number>());
  const editReqFirstLoad = useRef(true);

  function getInitials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  const loadEditRequests = useCallback(() => {
    if (!isAdmin && !isFleetManager) return;
    editApprovalsApi.list("Pending").then((reqs) => {
      const updated: EditRequestNotif[] = reqs.map((r) => ({
        id: Number(r.id),
        staffName: r.staffName,
        resourceType: r.resourceType,
        resourceName: r.resourceName,
        action: r.action,
        createdAt: r.createdAt ?? new Date().toISOString(),
      }));
      if (editReqFirstLoad.current) {
        for (const r of updated) shownEditReqIds.current.add(r.id);
        editReqFirstLoad.current = false;
      } else {
        for (const req of updated) {
          if (!shownEditReqIds.current.has(req.id)) {
            shownEditReqIds.current.add(req.id);
            showToast(
              `${req.staffName} is requesting ${req.action.toLowerCase()} access for "${req.resourceName}"`,
              "info",
              "New Edit Request",
            );
          }
        }
      }
      setEditRequestNotifs(updated);
    }).catch(() => {});
  }, [isAdmin, isFleetManager]);

  useEffect(() => {
    if (!isAdmin && !isFleetManager) return;
    if (isAdmin) {
      attendanceApi.listLeaveRequests("Pending").then(setLeaveRequests).catch(() => {});
    }
    loadEditRequests();
    const id = setInterval(loadEditRequests, 5000);
    return () => clearInterval(id);
  }, [isAdmin, isFleetManager, loadEditRequests]);

  // New leave request submitted by any staff — add immediately
  useWebSocketEvent("leave_request_created", (payload) => {
    if (!isAdmin) return;
    const req: LeaveRequest = {
      id: String(payload.id),
      category: (payload.category as LeaveRequest["category"]) ?? "Trip Sheet Register",
      applicantId: String(payload.applicant_id ?? ""),
      applicantName: String(payload.applicant_name ?? ""),
      applicantCode: "",
      fromDate: String(payload.from_date ?? ""),
      toDate: String(payload.to_date ?? ""),
      reason: String(payload.reason ?? ""),
      status: "Pending",
      appliedAt: String(payload.applied_at ?? ""),
    };
    setLeaveRequests((prev) => [req, ...prev]);
  });

  // Admin approved / rejected — remove from pending list
  useWebSocketEvent("leave_request_updated", (payload) => {
    if (!isAdmin) return;
    setLeaveRequests((prev) => prev.filter((r) => r.id !== String(payload.id)));
  });

  // Sheet marked as not received — alert Admin + Fleet Manager via WebSocket (realtime for OTHER tabs)
  useWebSocketEvent("sheet_unmarked", (payload) => {
    if (!isAdmin && !isFleetManager) return;
    pushSheetAlert({
      tripDbId: Number(payload.trip_db_id),
      tripIdStr: String(payload.trip_id_str ?? ""),
      bookingRef: String(payload.booking_reference_no ?? ""),
      reportedBy: String((payload as { reported_by?: string }).reported_by ?? ""),
    });
  });

  // Coordinator explicitly flagged sheet as missing — dedicated alert event
  useWebSocketEvent("sheet_alert", (payload) => {
    if (!isAdmin && !isFleetManager) return;
    pushSheetAlert({
      tripDbId: Number(payload.trip_db_id),
      tripIdStr: String(payload.trip_id_str ?? ""),
      bookingRef: String(payload.booking_reference_no ?? ""),
      reportedBy: "",
    });
  });

  // Also handle sheet_not_received_alert (emitted alongside sheet_unmarked)
  useWebSocketEvent("sheet_not_received_alert", (payload) => {
    if (!isAdmin && !isFleetManager) return;
    pushSheetAlert({
      tripDbId: Number(payload.trip_db_id),
      tripIdStr: String(payload.trip_id_str ?? ""),
      bookingRef: String(payload.booking_reference_no ?? ""),
      reportedBy: String((payload as { reported_by?: string }).reported_by ?? ""),
    });
  });

  // Docs team logged a KM variance remark — alert Admin + Commercial Manager
  useWebSocketEvent("km_variance_alert", (payload) => {
    if (!isAdmin && !isFleetManager) return;
    pushKmVarianceAlert({
      tripDbId: Number(payload.trip_db_id),
      tripIdStr: String(payload.trip_id_str ?? ""),
      bookingRef: String(payload.booking_ref ?? ""),
      actualKm: String(payload.actual_km ?? ""),
      approxKm: String(payload.approx_km ?? ""),
      kmRemark: String(payload.km_remark ?? ""),
    });
  });

  // Staff submitted an edit request — Admin + Commercial Manager get notified
  useWebSocketEvent("edit_approval_created", (payload) => {
    if (!isAdmin && !isFleetManager) return;
    const reqId = Number(payload.id);
    if (shownEditReqIds.current.has(reqId)) return;
    shownEditReqIds.current.add(reqId);
    const notif: EditRequestNotif = {
      id: reqId,
      staffName: String(payload.staff_name ?? ""),
      resourceType: String(payload.resource_type ?? ""),
      resourceName: String(payload.resource_name ?? ""),
      action: String(payload.action ?? ""),
      createdAt: String(payload.created_at ?? new Date().toISOString()),
    };
    setEditRequestNotifs((prev) => [notif, ...prev]);
    showToast(
      `${notif.staffName} is requesting ${notif.action.toLowerCase()} access for "${notif.resourceName}"`,
      "info",
      "New Edit Request",
    );
  });

  // Admin/CM approved/rejected — remove from list; notify the requester in realtime
  useWebSocketEvent("edit_approval_updated", (payload) => {
    if (isAdmin || isFleetManager) {
      setEditRequestNotifs((prev) => prev.filter((n) => n.id !== Number(payload.id)));
    }
    // The staff member who raised this request gets a pop-up toast + bell entry
    if (!isAdmin && user?.id != null && Number(payload.staff_db_id) === user.id) {
      const status = String(payload.status ?? "") as "Approved" | "Rejected";
      const resourceName = String(payload.resource_name ?? "");
      setEditApprovalNotifs((prev) => [{
        id: Number(payload.id),
        resourceName,
        action: String(payload.action ?? ""),
        status,
        expiresAt: String(payload.expires_at ?? ""),
        notifiedAt: new Date().toISOString(),
      }, ...prev]);
      if (status === "Approved") {
        showToast(
          `You have 1 hour to edit "${resourceName}".`,
          "success",
          "Edit access approved",
        );
      } else if (status === "Rejected") {
        showToast(
          `Your edit request for "${resourceName}" was rejected by the Admin.`,
          "error",
          "Edit request rejected",
        );
      }
    }
  });

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

  return (
    <>
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-white/50 bg-white/60 backdrop-blur-xl px-3 sm:px-6 shadow-sm">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuOpen}
        className="mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <nav className="flex items-center gap-2 text-[15px] min-w-0 flex-1">
        <Link href="/" className="text-gray-400 hover:text-gray-900 transition-all duration-300 hover:-translate-y-0.5 hover:scale-110">
          <Home className="h-4 w-4" />
        </Link>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <span key={crumb.label} className={`flex items-center gap-2 min-w-0 ${isLast ? "hidden sm:flex" : ""}`}>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="truncate text-gray-500 hover:text-gray-900 transition-colors duration-300">
                  {crumb.label}
                </Link>
              ) : (
                <span className={`truncate ${isLast ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        {/* {backendOnline === false && (
          <span className="hidden items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Backend offline
          </span>
        )}
        {backendOnline === true && (
          <span className="hidden items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        )} */}

        {/* Network status indicator */}
        <NetworkStatus />

        {/* Display settings — theme + font size */}
        <DisplaySettings />

        {/* Next phase — AI Assistant button
        {process.env.NEXT_PUBLIC_OR_API_KEY && (
          <button
            type="button"
            aria-label="AI Assistant"
            onClick={toggleChat}
            title="AI Assistant"
            className={[
              "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300",
              "hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4",
              isChatOpen
                ? "border-brand-gold/60 bg-brand-navy text-brand-gold focus:ring-brand-gold/20"
                : "border-gray-200 bg-white text-gray-500 hover:border-brand-navy/30 hover:bg-brand-navy/5 hover:text-brand-navy focus:ring-brand-navy/10",
            ].join(" ")}
          >
            <MessageSquare className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
          </button>
        )}
        */}

        {/* Notification bell — hidden for Yard Supervisor */}
        {user?.softwareDesignation !== "Yard Supervisor" && <div className="relative" ref={notifRef}>
          {(() => {
            const totalBadge =
              sheetAlerts.length +
              kmVarianceAlerts.length +
              reminders.length +
              (isAdmin ? leaveRequests.length + complianceAlertCount : 0) +
              ((isAdmin || isFleetManager) ? editRequestNotifs.length : 0) +
              editApprovalNotifs.length;
            return (
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setIsNotifOpen((v) => !v)}
                className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-blue-500/10"
              >
                <Bell className={cn(
                  "h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110",
                  complianceAlertCount > 0 && !isNotifOpen && "animate-bounce"
                )} />
                {totalBadge > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                    {totalBadge > 99 ? "99+" : totalBadge}
                  </span>
                )}
              </button>
            );
          })()}

          {isNotifOpen && (
            <div className="absolute right-0 z-[100] mt-3 w-[calc(100vw-24px)] sm:w-[380px] origin-top-right rounded-2xl border border-white/60 bg-white/95 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-gray-400" />
                  <span className="text-[13px] font-semibold text-gray-900">Notifications</span>
                </div>
                {(() => {
                  const count =
                    sheetAlerts.length +
                    kmVarianceAlerts.length +
                    reminders.length +
                    (isAdmin ? leaveRequests.length + editRequestNotifs.length + complianceAlertCount : 0) +
                    editApprovalNotifs.length;
                  return count > 0 ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      {count} unread
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Body */}
              {!isAdmin && !isFleetManager && !isFinanceManager && !isStaff && editApprovalNotifs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Bell className="h-8 w-8 text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">No notifications yet</p>
                  <p className="text-xs text-gray-400">Role-specific alerts coming soon</p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto">

                  {/* ── Edit Requests (Admin + Commercial Manager) — always on top ── */}
                  {(isAdmin || isFleetManager) && editRequestNotifs.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-purple-600">
                        Edit Requests
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {editRequestNotifs.map((notif, i) => (
                          <li key={`edit-req-${notif.id}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditRequestNotifs((prev) => prev.filter((_, idx) => idx !== i));
                                setIsNotifOpen(false);
                                router.push("/attendance/edit-approvals");
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-purple-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100">
                                <CalendarClock className="h-3.5 w-3.5 text-purple-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-gray-900">
                                  {notif.staffName} is requesting{" "}
                                  <span className="text-purple-700">{notif.action.toLowerCase()}</span> access
                                </p>
                                <p className="text-[11px] text-gray-600">
                                  {notif.resourceType}: <span className="font-semibold">{notif.resourceName}</span>
                                </p>
                                <p className="text-[11px] text-purple-700 font-medium">Tap to review — approve or reject</p>
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(notif.createdAt)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-gray-100 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => { setIsNotifOpen(false); router.push("/attendance/edit-approvals"); }}
                          className="text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors"
                        >
                          View all in Edit Approvals →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Sheet Alerts (Admin + Fleet Manager) ── */}
                  {sheetAlerts.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-orange-600">
                        Trip Sheet Alerts
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {sheetAlerts.map((alert, i) => (
                          <li key={`${alert.tripDbId}-${i}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissSheetAlert(i);
                                setIsNotifOpen(false);
                                router.push(isAdmin ? "/trips/sheet-collection" : "/trips/current");
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-orange-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100">
                                <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-gray-900">Trip sheet not yet received</p>
                                <p className="text-[11px] text-gray-600">
                                  Booking ref: <span className="font-semibold">{alert.bookingRef}</span>
                                  {alert.tripIdStr && <span className="ml-1 text-gray-400">({alert.tripIdStr})</span>}
                                </p>
                                {alert.reportedBy && (
                                  <p className="text-[11px] text-gray-500">Reported by: <span className="font-medium">{alert.reportedBy}</span></p>
                                )}
                                <p className="text-[11px] text-orange-700 font-medium">Please follow up immediately.</p>
                              </div>
                              <span className="shrink-0 text-right text-[10px] text-gray-400">
                                {timeAgo(alert.alertedAt)}
                                <br />
                                {fmtIST(alert.alertedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ── KM Variance Alerts (Admin + Commercial Manager) ── */}
                  {kmVarianceAlerts.length > 0 && (isAdmin || isFleetManager) && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                        KM Variance Alerts
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {kmVarianceAlerts.map((alert, i) => (
                          <li key={`km-${alert.tripDbId}-${i}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissKmVarianceAlert(i);
                                setIsNotifOpen(false);
                                router.push(isAdmin ? "/trips/reconciliation" : "/trips/current");
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-amber-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-gray-900">KM distance variance recorded</p>
                                <p className="text-[11px] text-gray-600">
                                  Booking: <span className="font-semibold">{alert.bookingRef}</span>
                                  {alert.tripIdStr && <span className="ml-1 text-gray-400">({alert.tripIdStr})</span>}
                                </p>
                                {(alert.actualKm || alert.approxKm) && (
                                  <p className="text-[11px] text-gray-500">
                                    Actual: <span className="font-semibold">{alert.actualKm} km</span>
                                    {alert.approxKm && <span className="ml-1 text-gray-400">vs approx {alert.approxKm} km</span>}
                                  </p>
                                )}
                                <p className="mt-0.5 text-[11px] text-amber-800 font-medium line-clamp-2">
                                  Reason: {alert.kmRemark}
                                </p>
                              </div>
                              <span className="shrink-0 text-right text-[10px] text-gray-400">
                                {timeAgo(alert.alertedAt)}
                                <br />
                                {fmtIST(alert.alertedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ── Compliance Alerts (Admin only) ── */}
                  {isAdmin && complianceAlertCount > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-red-600">
                        Compliance Alerts
                      </p>
                      <button
                        type="button"
                        onClick={() => { setIsNotifOpen(false); router.push("/resources/fleet"); }}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-red-50/60"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-gray-900">
                            {complianceAlertCount} truck document{complianceAlertCount === 1 ? "" : "s"} need attention
                          </p>
                          <p className="text-[11px] text-red-700 font-medium">
                            View Fleet page for details → renew expired documents immediately
                          </p>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* ── Renewals / Payments (role-dependent) ── */}
                  {reminders.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-red-600">
                        {remindersHeading}
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {reminders.map((rem, i) => (
                          <li key={`rem-${rem.kind}-${rem.entity}-${i}`}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push(rem.href); }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-red-50/60"
                            >
                              <div className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                                rem.severity === "overdue" ? "bg-red-100" : "bg-amber-100"
                              )}>
                                <CalendarClock className={cn(
                                  "h-3.5 w-3.5",
                                  rem.severity === "overdue" ? "text-red-600" : "text-amber-600"
                                )} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-gray-900">{rem.title}</p>
                                <p className="text-[11px] text-gray-600">{rem.detail}</p>
                                <p className={cn(
                                  "text-[11px] font-medium",
                                  rem.severity === "overdue" ? "text-red-700" : "text-amber-700"
                                )}>
                                  {rem.daysLeft < 0
                                    ? `Overdue by ${Math.abs(rem.daysLeft)} day${Math.abs(rem.daysLeft) === 1 ? "" : "s"}`
                                    : rem.daysLeft === 0
                                    ? "Due today"
                                    : `${rem.daysLeft} day${rem.daysLeft === 1 ? "" : "s"} left`}
                                </p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ── Leave Requests (Admin only) ── */}
                  {isAdmin && leaveRequests.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                        Leave Requests
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {leaveRequests.map((req) => (
                          <li key={req.id}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push("/attendance/leave-approvals"); }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                                <User className="h-3.5 w-3.5 text-blue-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-semibold text-gray-900">
                                  {req.applicantName}
                                  <span className="ml-1.5 font-normal text-gray-400">({req.category})</span>
                                </p>
                                <p className="text-[11px] text-gray-500">
                                  Leave: {formatDate(req.fromDate)} → {formatDate(req.toDate)}
                                </p>
                                {req.reason && (
                                  <p className="truncate text-[11px] text-gray-400">{req.reason}</p>
                                )}
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(req.appliedAt)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-gray-100 px-4 py-2.5">
                        <Link
                          href="/attendance/leave-approvals"
                          onClick={() => setIsNotifOpen(false)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          View all in Leave Approvals →
                        </Link>
                      </div>
                    </div>
                  )}


                  {/* ── Edit Request outcomes (the staff member who raised them) ── */}
                  {editApprovalNotifs.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Edit Request Updates
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {editApprovalNotifs.map((notif, i) => {
                          const approved = notif.status === "Approved";
                          return (
                          <li key={`edit-appr-${notif.id}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditApprovalNotifs((prev) => prev.filter((_, idx) => idx !== i));
                                setIsNotifOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                                approved ? "hover:bg-green-50/60" : "hover:bg-red-50/60"
                              )}
                            >
                              <div className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                                approved ? "bg-green-100" : "bg-red-100"
                              )}>
                                <User className={cn("h-3.5 w-3.5", approved ? "text-green-600" : "text-red-600")} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-gray-900">
                                  {approved
                                    ? "Your edit access has been approved by the Admin"
                                    : "Your edit request was rejected by the Admin"}
                                </p>
                                <p className="text-[11px] text-gray-600">
                                  {notif.action} access for: <span className="font-semibold">{notif.resourceName}</span>
                                </p>
                                <p className={cn(
                                  "text-[11px] font-medium",
                                  approved ? "text-green-700" : "text-red-700"
                                )}>
                                  {approved ? "Please make your changes within 1 hour." : "Contact the Admin if you need access."}
                                </p>
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(notif.notifiedAt)}</span>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Empty state */}
                  {sheetAlerts.length === 0 &&
                   kmVarianceAlerts.length === 0 &&
                   reminders.length === 0 &&
                   editApprovalNotifs.length === 0 &&
                   (isStaff || isFinanceManager || (isFleetManager && editRequestNotifs.length === 0) || (isAdmin && leaveRequests.length === 0 && editRequestNotifs.length === 0 && complianceAlertCount === 0)) && (
                    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                      <Bell className="h-8 w-8 text-gray-200" />
                      <p className="text-sm font-medium text-gray-500">No notifications</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>}

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
