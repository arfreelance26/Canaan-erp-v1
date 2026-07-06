"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ChevronRight, Search, Bell, ChevronDown, CalendarClock, User, AlertTriangle } from "lucide-react";
import { sidebarSections } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { ProfileModal } from "./ProfileModal";
import { attendanceApi, editApprovalsApi } from "@/lib/api";
import type { LeaveRequest } from "@/types/leave-request";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useNotifications } from "@/context/NotificationContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  expiresAt: string;
  notifiedAt: string;
};

export function Topbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: getPageLabel(pathname) }];
  const backendOnline = useBackendStatus();
  const { user, logout } = useAuth();

  const isAdmin        = user?.softwareDesignation === "Admin";
  const isFleetManager = user?.softwareDesignation === "Fleet Manager";
  const isStaff        = user?.softwareDesignation === "Staff";

  const { sheetAlerts, pushSheetAlert, dismissSheetAlert } = useNotifications();

  const [isProfileOpen, setIsProfileOpen]         = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen]             = useState(false);
  const [leaveRequests, setLeaveRequests]         = useState<LeaveRequest[]>([]);
  const [editRequestNotifs, setEditRequestNotifs] = useState<EditRequestNotif[]>([]);   // Admin
  const [editApprovalNotifs, setEditApprovalNotifs] = useState<EditApprovalNotif[]>([]); // Staff

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);

  function getInitials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  useEffect(() => {
    if (!isAdmin) return;
    attendanceApi.listLeaveRequests("Pending").then(setLeaveRequests).catch(() => {});
    editApprovalsApi.list("Pending").then((reqs) =>
      setEditRequestNotifs(reqs.map((r) => ({
        id: Number(r.id),
        staffName: r.staffName,
        resourceType: r.resourceType,
        resourceName: r.resourceName,
        action: r.action,
        createdAt: r.createdAt ?? new Date().toISOString(),
      })))
    ).catch(() => {});
  }, [isAdmin]);

  // New leave request submitted by any staff — add immediately
  useWebSocketEvent("leave_request_created", (payload) => {
    if (!isAdmin) return;
    const req: LeaveRequest = {
      id: String(payload.id),
      category: (payload.category as LeaveRequest["category"]) ?? "Staff",
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

  // Staff submitted an edit request — Admin gets notified
  useWebSocketEvent("edit_approval_created", (payload) => {
    if (!isAdmin) return;
    setEditRequestNotifs((prev) => [{
      id: Number(payload.id),
      staffName: String(payload.staff_name ?? ""),
      resourceType: String(payload.resource_type ?? ""),
      resourceName: String(payload.resource_name ?? ""),
      action: String(payload.action ?? ""),
      createdAt: String(payload.created_at ?? new Date().toISOString()),
    }, ...prev]);
  });

  // Admin approved/rejected — remove from admin list; notify Staff if it's their own
  useWebSocketEvent("edit_approval_updated", (payload) => {
    if (isAdmin) {
      setEditRequestNotifs((prev) => prev.filter((n) => n.id !== Number(payload.id)));
    }
    if (isStaff && Number(payload.staff_db_id) === user?.id && payload.status === "Approved") {
      setEditApprovalNotifs((prev) => [{
        id: Number(payload.id),
        resourceName: String(payload.resource_name ?? ""),
        action: String(payload.action ?? ""),
        expiresAt: String(payload.expires_at ?? ""),
        notifiedAt: new Date().toISOString(),
      }, ...prev]);
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
          {(() => {
            const totalBadge =
              sheetAlerts.length +
              (isAdmin ? leaveRequests.length + editRequestNotifs.length : 0) +
              (isStaff ? editApprovalNotifs.length : 0);
            return (
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setIsNotifOpen((v) => !v)}
                className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-blue-500/10"
              >
                <Bell className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
                {totalBadge > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                    {totalBadge > 99 ? "99+" : totalBadge}
                  </span>
                )}
              </button>
            );
          })()}

          {isNotifOpen && (
            <div className="absolute right-0 z-[100] mt-3 w-[380px] origin-top-right rounded-2xl border border-white/60 bg-white/95 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-gray-400" />
                  <span className="text-[13px] font-semibold text-gray-900">Notifications</span>
                </div>
                {(() => {
                  const count =
                    sheetAlerts.length +
                    (isAdmin ? leaveRequests.length + editRequestNotifs.length : 0) +
                    (isStaff ? editApprovalNotifs.length : 0);
                  return count > 0 ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      {count} unread
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Body */}
              {!isAdmin && !isFleetManager && !isStaff ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Bell className="h-8 w-8 text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">No notifications yet</p>
                  <p className="text-xs text-gray-400">Role-specific alerts coming soon</p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto">

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
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(alert.alertedAt)}</span>
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
                                  Leave: {req.fromDate} → {req.toDate}
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

                  {/* ── Edit Requests (Admin only) ── */}
                  {isAdmin && editRequestNotifs.length > 0 && (
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
                                <p className="text-[11px] text-purple-700 font-medium">Please follow up</p>
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

                  {/* ── Edit Approval notifications (Staff only) ── */}
                  {isStaff && editApprovalNotifs.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-green-600">
                        Edit Access Approved
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {editApprovalNotifs.map((notif, i) => (
                          <li key={`edit-appr-${notif.id}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditApprovalNotifs((prev) => prev.filter((_, idx) => idx !== i));
                                setIsNotifOpen(false);
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-green-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
                                <User className="h-3.5 w-3.5 text-green-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-gray-900">
                                  Your Edit Access has been approved by the Admin
                                </p>
                                <p className="text-[11px] text-gray-600">
                                  {notif.action} access for: <span className="font-semibold">{notif.resourceName}</span>
                                </p>
                                <p className="text-[11px] text-green-700 font-medium">
                                  Please do the changes within a Hour.
                                </p>
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(notif.notifiedAt)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Empty state */}
                  {sheetAlerts.length === 0 &&
                   editApprovalNotifs.length === 0 &&
                   (isStaff || isFleetManager || (isAdmin && leaveRequests.length === 0 && editRequestNotifs.length === 0)) && (
                    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                      <Bell className="h-8 w-8 text-gray-200" />
                      <p className="text-sm font-medium text-gray-500">No notifications</p>
                    </div>
                  )}
                </div>
              )}
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
