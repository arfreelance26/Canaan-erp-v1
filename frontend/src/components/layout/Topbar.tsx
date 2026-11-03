"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RiHome5Line as Home, RiArrowRightSLine as ChevronRight, RiNotification3Line as Bell, RiArrowDownSLine as ChevronDown, RiCalendarScheduleLine as CalendarClock, RiUserLine as User, RiAlertLine as AlertTriangle, RiMessage3Line as MessageSquare, RiMenuLine as Menu, RiToolsLine as Wrench, RiArrowGoBackLine as RotateCcw, RiSunFoggyLine as Sunrise } from "@remixicon/react";
import { EXTRA_PAGE_LABELS, sidebarSections } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { DisplaySettings } from "./DisplaySettings";
import { NetworkStatus } from "./NetworkStatus";
import { CalculatorButton } from "./CalculatorButton";
import { AlertsButton } from "./AlertsButton";
import { UniversalSearch } from "./UniversalSearch";
import { PrivacyNoticeButton } from "./PrivacyNoticeButton";
import { attendanceApi, editApprovalsApi, deletionApprovalsApi, maintenanceRequestsApi } from "@/lib/api";
import type { LeaveRequest } from "@/types/leave-request";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { formatDate } from "@/lib/format-date";
import { useNotifications, maintenanceAlertHref, reverificationAlertHref } from "@/context/NotificationContext";
import { useOpenShift } from "@/hooks/useOpenShift";
import { CloseShiftBeforeLogoutDialog } from "./CloseShiftBeforeLogoutDialog";
// import { useChat } from "@/context/ChatContext"; // Next phase
import { showToast } from "@/lib/feedback";


import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar as PersonAvatar } from "@/components/ui/Avatar";
import { useBirthday } from "@/context/BirthdayContext";
import { useSeason } from "@/context/SeasonContext";
import { useFounding } from "@/context/FoundingContext";
import dynamic from "next/dynamic";

// Celebration decor only draws on festive days, so it loads on demand.
const GoldWave = dynamic(() => import("./FoundingDecor").then((m) => m.GoldWave));
const EstMark = dynamic(() => import("./FoundingDecor").then((m) => m.EstMark));
const FitMark = dynamic(() => import("./FoundingDecor").then((m) => m.FitMark));
const PineGarland = dynamic(() => import("./SeasonDecor").then((m) => m.PineGarland));
const Snowfall = dynamic(() => import("./SeasonDecor").then((m) => m.Snowfall));
const Streamers = dynamic(() => import("./SeasonDecor").then((m) => m.Streamers));
const NewYearMark = dynamic(() => import("./SeasonDecor").then((m) => m.NewYearMark));
const SantaOnDashboard = dynamic(() => import("./SeasonDecor").then((m) => m.SantaOnDashboard));
const Bunting = dynamic(() => import("./BirthdayDecor").then((m) => m.Bunting));
const BirthdayBadge = dynamic(() => import("./BirthdayDecor").then((m) => m.BirthdayBadge));
const Balloons = dynamic(() => import("./BirthdayDecor").then((m) => m.Balloons));
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

function getPageLabel(pathname: string): string {
  // next.config's trailingSlash:true means the live pathname always ends in
  // "/" (e.g. "/insights/running-cost-calculator/"), but nav-config's hrefs
  // don't — normalize both sides so the lookup actually matches.
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  const here = norm(pathname);
  for (const section of sidebarSections) {
    for (const item of section.items) {
      if (norm(item.href) === here) return item.label;
    }
  }
  if (here in EXTRA_PAGE_LABELS) return EXTRA_PAGE_LABELS[here];
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

// The bell dropdown only ever shows the last 24h of a notification's life —
// anything older is still fully there, just on the dedicated Notifications
// page (/personal/notifications, which doesn't filter by age) instead of
// cluttering this quick preview forever. Doesn't apply to Compliance Alerts
// or Renewals & Payments: both are live-recomputed from "days until this
// expires" on every fetch, with no real "first seen" timestamp to measure
// age from, so they stay always-visible here by design.
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
function isRecent(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  const t = new Date(s).getTime();
  return !Number.isNaN(t) && Date.now() - t < RECENT_WINDOW_MS;
}

// Collapses repeated notifications from the same person (e.g. 5 separate
// "Siva is requesting edit access" rows) into one group, so the bell shows
// "Siva — 5 requests pending" instead of 5 near-identical cards. The real
// fix for a dropdown that grows unbounded over months is to never render
// one row per item in the first place.
function groupByKey<T>(items: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

// Same list-length problem even after grouping (many different people, not
// just one person many times) — cap how many rows render and fold the rest
// into the existing "View all" link's label instead of growing forever.
const NOTIF_ROW_CAP = 4;

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

// A decided (Approved/Rejected) edit or deletion request this user raised,
// that they haven't been shown yet (requesterSeenAt is null server-side) —
// unlike the old live-only toast, this is backed by the DB (see
// editApprovalsApi/deletionApprovalsApi .getMine()/.listMine()), so it
// survives being offline when the decision happened and still shows up the
// next time they open the bell.
type MyDecidedRequest = {
  key: string;                      // `${kind}-${id}`, unique across both kinds
  kind: "edit" | "deletion" | "maintenance";
  id: string | number;
  resourceName: string;
  resourceType: string;
  action?: string;                  // edit requests only ("Edit" | "Delete")
  status: "Approved" | "Rejected";
  approvedAt: string | null;
  expiresAt?: string | null;        // edit-approve only — the 8h edit window
  rejectReason?: string | null;     // maintenance only
};

// A new maintenance record waiting in Maintenance Approvals (Admin / Accounts).
type MaintenanceRequestNotif = {
  id: string;
  submittedByName: string;
  registration: string;
  maintenanceType: string;
  cost: number;
  source: "Web" | "Trip Sheet";
  createdAt: string;
};

type DeletionRequestNotif = {
  id: number;
  requestedByName: string;
  resourceType: string;
  resourceName: string;
  createdAt: string;
};

export function Topbar({ onMenuOpen, attendanceLocked }: { onMenuOpen?: () => void; attendanceLocked?: boolean }) {
  const pathname = usePathname();
  const router   = useRouter();
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: getPageLabel(pathname) }];
  const { user, logout } = useAuth();
  // Celebrations (managed in /admin/celebrations): decor, the centre mark and
  // the "Hide decorations" menu items.
  const birthday = useBirthday();
  const season = useSeason();
  const founding = useFounding();

  // Logout is gated on closing an open self-checked-in shift first — same
  // rule as Sidebar.tsx's logout icon, duplicated here since this profile
  // menu is a separate logout entry point, not routed through the sidebar.
  const openShift = useOpenShift();
  const [showCloseShiftPrompt, setShowCloseShiftPrompt] = useState(false);
  function handleLogoutClick() {
    setIsProfileOpen(false);
    if (openShift) setShowCloseShiftPrompt(true);
    else logout();
  }

  const isAdmin          = user?.softwareDesignation === "Admin";
  const isFleetManager   = user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";
  const isFinanceManager = user?.softwareDesignation === "Accounts";
  const isStaff          = user?.softwareDesignation === "Trip Sheet Register";
  const isMaintenance    = user?.softwareDesignation === "Maintenance";

  // Compliance Alerts and Renewals & Payments no longer come through here —
  // see the comment where their bell sections used to render, further down.
  const { sheetAlerts, kmVarianceAlerts, maintenanceAlerts, pushSheetAlert, dismissSheetAlert, pushKmVarianceAlert, dismissKmVarianceAlert, dismissMaintenanceAlert, reverificationAlerts, dismissReverificationAlert, summaryAlerts, dismissSummaryAlert } = useNotifications();
  // const { isOpen: isChatOpen, toggle: toggleChat } = useChat(); // Next phase

  const [isProfileOpen, setIsProfileOpen]         = useState(false);
  const [isNotifOpen, setIsNotifOpen]             = useState(false);
  const [leaveRequests, setLeaveRequests]         = useState<LeaveRequest[]>([]);
  const [editRequestNotifs, setEditRequestNotifs] = useState<EditRequestNotif[]>([]);       // Admin
  const [deletionRequestNotifs, setDeletionRequestNotifs] = useState<DeletionRequestNotif[]>([]); // Admin
  const [myDecidedRequests, setMyDecidedRequests] = useState<MyDecidedRequest[]>([]);       // everyone
  const [maintRequestNotifs, setMaintRequestNotifs] = useState<MaintenanceRequestNotif[]>([]); // Admin + Accounts

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);
  const shownEditReqIds     = useRef(new Set<number>());
  const shownDeletionReqIds = useRef(new Set<number>());
  const shownMaintReqIds    = useRef<Set<string> | null>(null);
  const editReqFirstLoad     = useRef(true);
  const deletionReqFirstLoad = useRef(true);

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

  const loadDeletionRequests = useCallback(() => {
    if (!isAdmin) return;
    deletionApprovalsApi.list("Pending").then((reqs) => {
      const updated: DeletionRequestNotif[] = reqs.map((r) => ({
        id: r.id,
        requestedByName: r.requestedByName,
        resourceType: r.resourceType,
        resourceName: r.resourceName,
        createdAt: r.createdAt ?? new Date().toISOString(),
      }));
      if (deletionReqFirstLoad.current) {
        for (const r of updated) shownDeletionReqIds.current.add(r.id);
        deletionReqFirstLoad.current = false;
      } else {
        for (const req of updated) {
          if (!shownDeletionReqIds.current.has(req.id)) {
            shownDeletionReqIds.current.add(req.id);
            showToast(
              `${req.requestedByName} is requesting deletion of "${req.resourceName}"`,
              "warning",
              "New Deletion Request",
            );
          }
        }
      }
      setDeletionRequestNotifs(updated);
    }).catch(() => {});
  }, [isAdmin]);

  // New maintenance records waiting on Admin / Accounts — every one stays in
  // the bell until it's decided (not age-limited); a toast for each new one.
  const canApproveMaintenance = isAdmin || isFinanceManager;
  const loadMaintRequests = useCallback(() => {
    if (!canApproveMaintenance) return;
    maintenanceRequestsApi.list({ status: "Pending" }).then((reqs) => {
      const updated: MaintenanceRequestNotif[] = reqs.map((r) => ({
        id: r.id, submittedByName: r.submittedByName, registration: r.registrationNumber || r.truckIdStr,
        maintenanceType: r.maintenanceType, cost: r.cost, source: r.source, createdAt: r.createdAt,
      }));
      if (shownMaintReqIds.current) {
        for (const r of updated) {
          if (!shownMaintReqIds.current.has(r.id)) {
            showToast(`${r.submittedByName}: ${r.maintenanceType} on ${r.registration}`, "info", "Maintenance record to approve");
          }
        }
      }
      shownMaintReqIds.current = new Set(updated.map((r) => r.id));
      setMaintRequestNotifs(updated);
    }).catch(() => {});
  }, [canApproveMaintenance]);

  useEffect(() => {
    loadMaintRequests();
    const id = setInterval(loadMaintRequests, 20000);
    return () => clearInterval(id);
  }, [loadMaintRequests]);

  // Decided (Approved/Rejected) edit/deletion requests THIS user raised that
  // they haven't been shown yet — persisted server-side (requesterSeenAt),
  // so unlike a live-only toast this survives being offline when the
  // decision happened. Every role can have filed a request, so unlike the
  // Admin-only loaders above this always runs.
  const loadMyDecidedRequests = useCallback(() => {
    if (user?.id == null) return;
    Promise.allSettled([editApprovalsApi.getMine(), deletionApprovalsApi.listMine(), maintenanceRequestsApi.listMine()]).then(([e, d, m]) => {
      const fromMaintenance: MyDecidedRequest[] = m.status === "fulfilled"
        ? m.value
            .filter((r) => (r.status === "Approved" || r.status === "Rejected") && !r.requesterSeenAt)
            .map((r) => ({
              key: `maintenance-${r.id}`, kind: "maintenance" as const, id: r.id,
              resourceName: `${r.registrationNumber || r.truckIdStr} · ${r.maintenanceType}`,
              resourceType: "MaintenanceRecord",
              status: r.status as "Approved" | "Rejected", approvedAt: r.decidedAt,
              rejectReason: r.rejectReason,
            }))
        : [];
      const fromEdit: MyDecidedRequest[] = e.status === "fulfilled"
        ? e.value
            .filter((r) => r.status !== "Pending" && !r.requesterSeenAt)
            .map((r) => ({
              key: `edit-${r.id}`, kind: "edit" as const, id: r.id,
              resourceName: r.resourceName, resourceType: r.resourceType,
              action: r.action, status: r.status as "Approved" | "Rejected",
              approvedAt: r.approvedAt, expiresAt: r.expiresAt,
            }))
        : [];
      const fromDeletion: MyDecidedRequest[] = d.status === "fulfilled"
        ? d.value
            .filter((r) => r.status !== "Pending" && !r.requesterSeenAt)
            .map((r) => ({
              key: `deletion-${r.id}`, kind: "deletion" as const, id: r.id,
              resourceName: r.resourceName, resourceType: r.resourceType,
              status: r.status as "Approved" | "Rejected", approvedAt: r.approvedAt,
            }))
        : [];
      setMyDecidedRequests(
        [...fromEdit, ...fromDeletion, ...fromMaintenance].sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""))
      );
    });
  }, [user?.id]);

  useEffect(() => {
    loadMyDecidedRequests();
    const id = setInterval(loadMyDecidedRequests, 20000);
    return () => clearInterval(id);
  }, [loadMyDecidedRequests]);
  useWebSocketEvent("maintenance_request_updated", () => { loadMaintRequests(); loadMyDecidedRequests(); });

  // Mark seen once the bell is actually opened — clears the badge server-side
  // so it doesn't come back on the next poll/reload, but the list stays
  // visible for this viewing (cleared locally only when the dropdown closes).
  useEffect(() => {
    if (!isNotifOpen || myDecidedRequests.length === 0) return;
    Promise.allSettled([editApprovalsApi.markMineSeen(), deletionApprovalsApi.markMineSeen(), maintenanceRequestsApi.markMineSeen()]).catch(() => {});
  }, [isNotifOpen]);

  useEffect(() => {
    if (!isAdmin && !isFleetManager) return;
    if (isAdmin) {
      attendanceApi.listLeaveRequests("Pending").then(setLeaveRequests).catch(() => {});
      loadDeletionRequests();
      const delId = setInterval(loadDeletionRequests, 5000);
      loadEditRequests();
      const editId = setInterval(loadEditRequests, 5000);
      return () => { clearInterval(delId); clearInterval(editId); };
    }
    loadEditRequests();
    const id = setInterval(loadEditRequests, 5000);
    return () => clearInterval(id);
  }, [isAdmin, isFleetManager, loadEditRequests, loadDeletionRequests]);

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

  // Staff submitted a deletion request — Admin gets notified
  useWebSocketEvent("deletion_approval_created", (payload) => {
    if (!isAdmin) return;
    const reqId = Number(payload.id);
    if (shownDeletionReqIds.current.has(reqId)) return;
    shownDeletionReqIds.current.add(reqId);
    const notif: DeletionRequestNotif = {
      id: reqId,
      requestedByName: String(payload.requested_by_name ?? ""),
      resourceType: String(payload.resource_type ?? ""),
      resourceName: String(payload.resource_name ?? ""),
      createdAt: new Date().toISOString(),
    };
    setDeletionRequestNotifs((prev) => [notif, ...prev]);
    showToast(
      `${notif.requestedByName} is requesting deletion of "${notif.resourceName}"`,
      "warning",
      "New Deletion Request",
    );
  });

  // Admin approved / rejected deletion — remove from pending list
  useWebSocketEvent("deletion_approval_updated", (payload) => {
    if (isAdmin) {
      setDeletionRequestNotifs((prev) => prev.filter((n) => n.id !== Number(payload.id)));
    }
    // The staff member who raised this request gets a pop-up toast now, and
    // loadMyDecidedRequests picks up the persisted row for the bell/badge —
    // same two-layer notice (instant if online, persistent either way) as
    // the edit-approval handler below.
    if (!isAdmin && user?.id != null && Number(payload.requested_by_staff_id) === user.id) {
      const status = String(payload.status ?? "") as "Approved" | "Rejected";
      const resourceName = String(payload.resource_name ?? "");
      if (status === "Approved") {
        showToast(`"${resourceName}" has been deleted.`, "success", "Deletion approved");
      } else if (status === "Rejected") {
        showToast(`Your deletion request for "${resourceName}" was rejected by the Admin.`, "error", "Deletion rejected");
      }
      loadMyDecidedRequests();
    }
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
    // The staff member who raised this request gets a pop-up toast now, and
    // loadMyDecidedRequests picks up the persisted row for the bell/badge —
    // instant if they're online, but no longer the only way to find out.
    if (!isAdmin && user?.id != null && Number(payload.staff_db_id) === user.id) {
      const status = String(payload.status ?? "") as "Approved" | "Rejected";
      const resourceName = String(payload.resource_name ?? "");
      if (status === "Approved") {
        showToast(
          `You have 8 hours to edit "${resourceName}".`,
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
      loadMyDecidedRequests();
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

  // Recent-only (<24h) views of each timestamped category — these, not the
  // raw state, drive both the badge counts and the dropdown sections below.
  // Anything older still exists and is fully actionable, just on
  // /personal/notifications instead of here. See isRecent's comment for why
  // Compliance Alerts / reminders are deliberately excluded from this.
  const recentEditRequestNotifs = editRequestNotifs.filter((n) => isRecent(n.createdAt));
  const recentDeletionRequestNotifs = deletionRequestNotifs.filter((n) => isRecent(n.createdAt));
  const recentLeaveRequests = leaveRequests.filter((r) => isRecent(r.appliedAt));
  const recentSheetAlerts = sheetAlerts.filter((a) => isRecent(a.alertedAt));
  const recentKmVarianceAlerts = kmVarianceAlerts.filter((a) => isRecent(a.alertedAt));
  const recentMyDecidedRequests = myDecidedRequests.filter((n) => isRecent(n.approvedAt));
  // Maintenance alerts aren't age-limited: each person's stays in the bell
  // until they open it (read state is per person), however old it is.

  // Founding Day / New Year mark, between the breadcrumb and the buttons.
  const centerMark = birthday.decorated ? null
    : founding.decorated ? <EstMark years={founding.years} />
    : season.decorated && season.day === "newyearday" ? <NewYearMark year={season.newYear} />
    : null;

  return (
    <>
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-separator-border bg-background-primary-default px-4 md:px-6">
      {/* Negative z inside the header's stacking context: painted over the
          header background but under the breadcrumb, buttons and profile. */}
      {birthday.decorated ? (
        <>
          <Balloons count={9} className="-z-10" />
          <Bunting className="-z-10" />
        </>
      ) : founding.decorated ? (
        <GoldWave />
      ) : season.decorated ? (
        <>
          <Snowfall className="-z-10" glitter={season.day === "newyearday"} />
          {season.day === "newyearday" ? <Streamers className="-z-10" /> : <PineGarland className="-z-10" />}
          {season.day === "christmas" && <SantaOnDashboard uid={String(user?.id ?? user?.name ?? "")} className="-z-10" />}
        </>
      ) : null}

      {/* Hamburger — mobile only */}
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuOpen}
        className="flex size-9 items-center justify-center rounded-lg text-foreground-icon-secondary outline-none transition-colors hover:bg-fill-2 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-1", !centerMark && "flex-1")}>
        {attendanceLocked ? (
          // Every other way out of this page is blocked by the gate in AppShell;
          // the Home crumb must not link straight to "/" while it's on.
          <button
            type="button"
            aria-label="Home"
            onClick={() => showToast("Mark today's attendance first.", "info")}
            className="flex size-7 shrink-0 cursor-not-allowed items-center justify-center rounded-md text-foreground-icon-quaternary"
          >
            <Home className="size-4" />
          </button>
        ) : (
          <Link
            href="/"
            aria-label="Home"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-icon-tertiary outline-none transition-colors hover:bg-fill-2 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <Home className="size-4" />
          </Link>
        )}
        {breadcrumbs.slice(1).map((crumb, index, arr) => {
          const isLast = index === arr.length - 1;
          return (
            <span key={crumb.label} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-4 shrink-0 text-foreground-icon-quaternary" />
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="truncate text-body-medium text-text-secondary transition-colors hover:text-text-primary">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className={isLast ? "truncate text-body-medium text-text-primary" : "truncate text-body-regular text-text-secondary"}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {centerMark && <FitMark>{centerMark}</FitMark>}

      <div className="flex items-center gap-4">

        {/* Universal search — pages and records, ⌘K / "/" */}
        <UniversalSearch locked={attendanceLocked} />

        {/* {backendOnline === false && (
          <span className="hidden items-center gap-1.5 rounded-full bg-danger-surface px-2.5 py-1 text-caption-1-medium text-danger-text ring-1 ring-danger-border sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-danger-solid" />
            Backend offline
          </span>
        )}
        {backendOnline === true && (
          <span className="hidden items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 text-caption-1-medium text-success-text ring-1 ring-success-border sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success-solid" />
            Connected
          </span>
        )} */}

        {/* Invite — Admin only */}
        {isAdmin && <AlertsButton />}

        {/* Meetings, Notes and To-do live on My profile (/personal/profile). */}

        {/* Calculator */}
        <CalculatorButton />

        {/* Network status indicator */}
        <NetworkStatus />

        {/* Display settings — theme + font size */}
        <DisplaySettings />

        {/* Privacy & monitoring notice — visible to every role */}
        <PrivacyNoticeButton />

        {/* Next phase — AI Assistant button
        {process.env.NEXT_PUBLIC_OR_API_KEY && (
          <button
            type="button"
            aria-label="AI Assistant"
            onClick={toggleChat}
            title="AI Assistant"
            className={[
              "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition duration-300",
              "hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4",
              isChatOpen
                ? "border-gold-solid/60 bg-accent-solid text-gold-text focus:ring-gold-solid/20"
                : "border-separator-border bg-background-primary-default text-text-secondary hover:border-accent-solid/30 hover:bg-accent-solid-hover/5 hover:text-accent-text-strong focus:ring-accent-solid/10",
            ].join(" ")}
          >
            <MessageSquare className="h-5 w-5 transition-transform duration-300" />
          </button>
        )}
        */}

        {/* Notification bell — hidden for Yard Supervisor */}
        {user?.softwareDesignation !== "Yard Supervisor" && <div className="relative" ref={notifRef}>
          {(() => {
            const totalBadge =
              recentSheetAlerts.length +
              recentKmVarianceAlerts.length +
              maintenanceAlerts.length +
              reverificationAlerts.length +
              summaryAlerts.length +
              maintRequestNotifs.length +
              (isAdmin ? recentLeaveRequests.length + recentDeletionRequestNotifs.length : 0) +
              ((isAdmin || isFleetManager) ? recentEditRequestNotifs.length : 0) +
              recentMyDecidedRequests.length;
            return (
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setIsNotifOpen((v) => !v)}
                className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-separator-border bg-background-primary-default text-text-secondary shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition duration-300 hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-accent-solid/10"
              >
                <Bell className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12" />
                {totalBadge > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger-solid text-caption-2-semibold text-on-solid ring-2 ring-background-primary-default">
                    {totalBadge > 99 ? "99+" : totalBadge}
                  </span>
                )}
              </button>
            );
          })()}

          {isNotifOpen && (
            <div className="absolute right-0 z-[100] mt-3 w-[calc(100vw-24px)] sm:w-[380px] origin-top-right rounded-2xl border border-separator-border bg-background-primary-default shadow-[0_10px_40px_rgba(0,0,0,0.12)]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-separator-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-text-tertiary" />
                  <span className="text-body-2-semibold text-text-primary">Notifications</span>
                </div>
                {(() => {
                  const count =
                    recentSheetAlerts.length +
                    recentKmVarianceAlerts.length +
                    maintenanceAlerts.length +
                    reverificationAlerts.length +
                    summaryAlerts.length +
                    maintRequestNotifs.length +
                    (isAdmin ? recentLeaveRequests.length + recentEditRequestNotifs.length + recentDeletionRequestNotifs.length : 0) +
                    recentMyDecidedRequests.length;
                  return count > 0 ? (
                    <span className="rounded-full bg-danger-surface-strong px-2 py-0.5 text-caption-2-semibold text-danger-text">
                      {count} unread
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Body */}
              {!isAdmin && !isFleetManager && !isFinanceManager && !isStaff && !isMaintenance && recentMyDecidedRequests.length === 0 && reverificationAlerts.length === 0 ? (
                <EmptyState size="compact" illustration="inbox-empty" title="No notifications yet" description="Role-specific alerts coming soon" />
              ) : (
                <div className="max-h-[420px] overflow-y-auto">

                  {/* ── Edit Requests (Admin + Commercial Manager) — always on top ──
                      Grouped by requester + capped: dozens of individual
                      "X is requesting edit access" rows (some literally
                      months old and never actioned) used to render as dozens
                      of full cards. Now each requester gets one row
                      regardless of how many resources they've asked about,
                      and only NOTIF_ROW_CAP rows render at all — the rest
                      are folded into the "View all" count below. */}
                  {(isAdmin || isFleetManager) && recentEditRequestNotifs.length > 0 && (() => {
                    const groups = groupByKey(recentEditRequestNotifs, (n) => n.staffName);
                    const shown = groups.slice(0, NOTIF_ROW_CAP);
                    const hiddenCount = recentEditRequestNotifs.length - shown.reduce((sum, g) => sum + g.items.length, 0);
                    return (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-purple-text">
                        Edit Requests
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {shown.map((g) => {
                          const first = g.items[0];
                          return (
                          <li key={`edit-req-${g.key}`}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push("/attendance/edit-approvals"); }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-purple-surface-strong/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-surface-strong">
                                <CalendarClock className="h-3.5 w-3.5 text-purple-text" />
                              </div>
                              <div className="min-w-0 flex-1">
                                {g.items.length > 1 ? (
                                  <p className="text-[12px] font-semibold text-text-primary">
                                    {g.key} — <span className="text-purple-text">{g.items.length} requests</span> pending
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-[12px] font-semibold text-text-primary">
                                      {g.key} is requesting{" "}
                                      <span className="text-purple-text">{first.action.toLowerCase()}</span> access
                                    </p>
                                    <p className="truncate text-[11px] text-text-secondary">
                                      {first.resourceType}: <span className="font-semibold">{first.resourceName}</span>
                                    </p>
                                  </>
                                )}
                              </div>
                              <span className="shrink-0 text-[10px] text-text-tertiary">{timeAgo(first.createdAt)}</span>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                      <div className="border-t border-separator-border px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => { setIsNotifOpen(false); router.push("/attendance/edit-approvals"); }}
                          className="text-caption-1-medium text-purple-text hover:text-purple-text-strong transition-colors"
                        >
                          {hiddenCount > 0 ? `+${hiddenCount} more — view all in Edit Approvals →` : "View all in Edit Approvals →"}
                        </button>
                      </div>
                    </div>
                    );
                  })()}

                  {/* ── Maintenance Approvals (Admin + Accounts) — new records waiting. ── */}
                  {maintRequestNotifs.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-accent-text">
                        Maintenance Approvals
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {maintRequestNotifs.slice(0, NOTIF_ROW_CAP).map((n) => (
                          <li key={`maint-req-${n.id}`}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push("/attendance/maintenance-approvals"); }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent-surface-strong/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-surface-strong">
                                <Wrench className="h-3.5 w-3.5 text-accent-text" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-text-primary">
                                  {n.submittedByName} added <span className="text-accent-text">{n.maintenanceType}</span>
                                </p>
                                <p className="truncate text-[11px] text-text-secondary">
                                  <span className="font-semibold">{n.registration}</span> · ₹{n.cost.toLocaleString("en-IN")}
                                  {n.source === "Trip Sheet" ? " · from a trip sheet" : ""}
                                </p>
                              </div>
                              <span className="shrink-0 text-[10px] text-text-tertiary">{timeAgo(n.createdAt)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-separator-border px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => { setIsNotifOpen(false); router.push("/attendance/maintenance-approvals"); }}
                          className="text-caption-1-medium text-accent-text transition-colors hover:text-accent-text-strong"
                        >
                          {maintRequestNotifs.length > NOTIF_ROW_CAP
                            ? `+${maintRequestNotifs.length - NOTIF_ROW_CAP} more — view all in Maintenance Approvals →`
                            : "Review in Maintenance Approvals →"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Deletion Requests (Admin only) — grouped + capped, same
                      reasoning as Edit Requests above. ── */}
                  {isAdmin && recentDeletionRequestNotifs.length > 0 && (() => {
                    const groups = groupByKey(recentDeletionRequestNotifs, (n) => n.requestedByName);
                    const shown = groups.slice(0, NOTIF_ROW_CAP);
                    const hiddenCount = recentDeletionRequestNotifs.length - shown.reduce((sum, g) => sum + g.items.length, 0);
                    return (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-danger-text">
                        Deletion Requests
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {shown.map((g) => {
                          const first = g.items[0];
                          return (
                          <li key={`del-req-${g.key}`}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push("/attendance/deletion-approvals"); }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-danger-surface-strong/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-surface-strong">
                                <AlertTriangle className="h-3.5 w-3.5 text-danger-text" />
                              </div>
                              <div className="min-w-0 flex-1">
                                {g.items.length > 1 ? (
                                  <p className="text-[12px] font-semibold text-text-primary">
                                    {g.key} — <span className="text-danger-text">{g.items.length} deletions</span> requested
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-[12px] font-semibold text-text-primary">
                                      {g.key} is requesting <span className="text-danger-text">deletion</span>
                                    </p>
                                    <p className="truncate text-[11px] text-text-secondary">
                                      {first.resourceType}: <span className="font-semibold">{first.resourceName}</span>
                                    </p>
                                  </>
                                )}
                              </div>
                              <span className="shrink-0 text-[10px] text-text-tertiary">{timeAgo(first.createdAt)}</span>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                      <div className="border-t border-separator-border px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => { setIsNotifOpen(false); router.push("/attendance/deletion-approvals"); }}
                          className="text-caption-1-medium text-danger-text hover:text-danger-text-strong transition-colors"
                        >
                          {hiddenCount > 0 ? `+${hiddenCount} more — view all in Deletion Approvals →` : "View all in Deletion Approvals →"}
                        </button>
                      </div>
                    </div>
                    );
                  })()}

                  {/* ── Morning summary (Admin) — stays until it's opened. ── */}
                  {summaryAlerts.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-warning-text">
                        Your Daily Summary
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {summaryAlerts.slice(0, NOTIF_ROW_CAP).map((alert) => (
                          <li key={`summary-${alert.serverId}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissSummaryAlert(alert.serverId);
                                setIsNotifOpen(false);
                                router.push("/");
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-warning-surface-strong/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-surface-strong">
                                <Sunrise className="h-3.5 w-3.5 text-warning-text" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-text-primary">{alert.title}</p>
                                <p className="text-[11px] text-text-secondary">{alert.headline}</p>
                                {alert.attention > 0 && (
                                  <p className="text-caption-2-medium text-warning-text">{alert.attention} thing{alert.attention === 1 ? "" : "s"} need{alert.attention === 1 ? "s" : ""} your attention</p>
                                )}
                              </div>
                              <span className="shrink-0 text-right text-[10px] text-text-tertiary">
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

                  {/* ── Re-Verification (Auditor) — stays until it's opened. ── */}
                  {reverificationAlerts.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-purple-text">
                        Sent for Re-Verification
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {reverificationAlerts.slice(0, NOTIF_ROW_CAP).map((alert) => (
                          <li key={`reverify-${alert.serverId}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissReverificationAlert(alert.serverId);
                                setIsNotifOpen(false);
                                router.push(reverificationAlertHref(alert.driverId));
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-purple-surface-strong/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-surface-strong">
                                <RotateCcw className="h-3.5 w-3.5 text-purple-text" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-text-primary">{alert.tripIdStr} came for Re-Verification</p>
                                <p className="text-[11px] text-text-secondary">{alert.remark}</p>
                                <p className="text-[11px] text-text-secondary">By {alert.by}{alert.role ? ` (${alert.role})` : ""}</p>
                              </div>
                              <span className="shrink-0 text-right text-[10px] text-text-tertiary">
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

                  {/* ── Maintenance Alerts (Admin, Commercial Managers, Maintenance) —
                      "Notify me when this is due again" on a maintenance record. ── */}
                  {maintenanceAlerts.length > 0 && (() => {
                    const shown = maintenanceAlerts.slice(0, NOTIF_ROW_CAP);
                    const hiddenCount = maintenanceAlerts.length - shown.length;
                    return (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-danger-text">
                        Maintenance Alerts
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {shown.map((alert) => {
                          const due = alert.kind === "due";
                          return (
                          <li key={`maint-${alert.serverId}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissMaintenanceAlert(alert.serverId);
                                setIsNotifOpen(false);
                                router.push(maintenanceAlertHref(user?.softwareDesignation, alert.registration));
                              }}
                              className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors", due ? "hover:bg-danger-surface-strong/60" : "hover:bg-warning-surface-strong/60")}
                            >
                              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", due ? "bg-danger-surface-strong" : "bg-warning-surface-strong")}>
                                <Wrench className={cn("h-3.5 w-3.5", due ? "text-danger-text" : "text-warning-text")} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-text-primary">
                                  {alert.maintenanceType} {due ? "is due" : "due soon"}
                                </p>
                                <p className="text-[11px] text-text-secondary">
                                  Truck: <span className="font-semibold">{alert.registration}</span>
                                </p>
                                <p className="text-[11px] text-text-secondary">
                                  Reminder at <span className="font-semibold">{alert.remindAt.toLocaleString("en-IN")} km</span>
                                  <span className="ml-1 text-text-tertiary">· now {alert.odometer.toLocaleString("en-IN")} km</span>
                                </p>
                              </div>
                              <span className="shrink-0 text-right text-[10px] text-text-tertiary">
                                {timeAgo(alert.alertedAt)}
                                <br />
                                {fmtIST(alert.alertedAt)}
                              </span>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                      {hiddenCount > 0 && (
                        <div className="border-t border-separator-border px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { setIsNotifOpen(false); router.push("/personal/notifications"); }}
                            className="text-caption-1-medium text-danger-text hover:text-danger-text-strong transition-colors"
                          >
                            +{hiddenCount} more maintenance alert{hiddenCount === 1 ? "" : "s"} →
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* ── Sheet Alerts (Admin + Fleet Manager) — capped, same
                      reasoning as Edit/Deletion Requests above (no natural
                      grouping key here, each alert is its own trip). ── */}
                  {recentSheetAlerts.length > 0 && (() => {
                    const shown = recentSheetAlerts.slice(0, NOTIF_ROW_CAP);
                    const hiddenCount = recentSheetAlerts.length - shown.length;
                    const target = isAdmin ? "/trips/sheet-collection" : "/trips/current";
                    return (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-orange-text">
                        Trip Sheet Alerts
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {shown.map((alert, i) => (
                          <li key={`${alert.tripDbId}-${i}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissSheetAlert(i);
                                setIsNotifOpen(false);
                                router.push(target);
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-orange-surface-strong/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-surface-strong">
                                <AlertTriangle className="h-3.5 w-3.5 text-orange-text" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-text-primary">Trip sheet not yet received</p>
                                <p className="text-[11px] text-text-secondary">
                                  Booking ref: <span className="font-semibold">{alert.bookingRef}</span>
                                  {alert.tripIdStr && <span className="ml-1 text-text-tertiary">({alert.tripIdStr})</span>}
                                </p>
                                {alert.reportedBy && (
                                  <p className="text-[11px] text-text-secondary">Reported by: <span className="font-medium">{alert.reportedBy}</span></p>
                                )}
                              </div>
                              <span className="shrink-0 text-right text-[10px] text-text-tertiary">
                                {timeAgo(alert.alertedAt)}
                                <br />
                                {fmtIST(alert.alertedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {hiddenCount > 0 && (
                        <div className="border-t border-separator-border px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { setIsNotifOpen(false); router.push(target); }}
                            className="text-caption-1-medium text-orange-text hover:text-orange-text-strong transition-colors"
                          >
                            +{hiddenCount} more trip sheet alert{hiddenCount === 1 ? "" : "s"} →
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* ── KM Variance Alerts (Admin + Commercial Manager) — capped. ── */}
                  {recentKmVarianceAlerts.length > 0 && (isAdmin || isFleetManager) && (() => {
                    const shown = recentKmVarianceAlerts.slice(0, NOTIF_ROW_CAP);
                    const hiddenCount = recentKmVarianceAlerts.length - shown.length;
                    const target = isAdmin ? "/trips/reconciliation" : "/trips/current";
                    return (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-warning-text">
                        KM Variance Alerts
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {shown.map((alert, i) => (
                          <li key={`km-${alert.tripDbId}-${i}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissKmVarianceAlert(i);
                                setIsNotifOpen(false);
                                router.push(target);
                              }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-warning-surface-strong/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-surface-strong">
                                <AlertTriangle className="h-3.5 w-3.5 text-warning-text" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-text-primary">KM distance variance recorded</p>
                                <p className="text-[11px] text-text-secondary">
                                  Booking: <span className="font-semibold">{alert.bookingRef}</span>
                                  {alert.tripIdStr && <span className="ml-1 text-text-tertiary">({alert.tripIdStr})</span>}
                                </p>
                                {(alert.actualKm || alert.approxKm) && (
                                  <p className="text-[11px] text-text-secondary">
                                    Actual: <span className="font-semibold">{alert.actualKm} km</span>
                                    {alert.approxKm && <span className="ml-1 text-text-tertiary">vs approx {alert.approxKm} km</span>}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-right text-[10px] text-text-tertiary">
                                {timeAgo(alert.alertedAt)}
                                <br />
                                {fmtIST(alert.alertedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {hiddenCount > 0 && (
                        <div className="border-t border-separator-border px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { setIsNotifOpen(false); router.push(target); }}
                            className="text-caption-1-medium text-warning-text hover:text-warning-text-strong transition-colors"
                          >
                            +{hiddenCount} more KM variance alert{hiddenCount === 1 ? "" : "s"} →
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* Compliance Alerts and Renewals & Payments used to live
                      here — both are now status cards on the pages they're
                      actually about (Our Fleet, Our Drivers, Compliance &
                      Renewals, EMI Tracking) instead of a notification feed
                      entry, since they're persistent state, not events, and
                      didn't fit the 24h recency model the rest of this
                      dropdown follows. See ReminderAlertBanner/
                      ComplianceAlertBanner on those pages. */}

                  {/* ── Leave Requests (Admin only) — capped. ── */}
                  {isAdmin && recentLeaveRequests.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-accent-text">
                        Leave Requests
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {recentLeaveRequests.slice(0, NOTIF_ROW_CAP).map((req) => (
                          <li key={req.id}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push("/attendance/leave-approvals"); }}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent-surface-strong/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-surface-strong">
                                <User className="h-3.5 w-3.5 text-accent-text" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-semibold text-text-primary">
                                  {req.applicantName}
                                  <span className="ml-1.5 font-normal text-text-tertiary">({req.category})</span>
                                </p>
                                <p className="text-[11px] text-text-secondary">
                                  Leave: {formatDate(req.fromDate)} → {formatDate(req.toDate)}
                                </p>
                                {req.reason && (
                                  <p className="truncate text-[11px] text-text-tertiary">{req.reason}</p>
                                )}
                              </div>
                              <span className="shrink-0 text-[10px] text-text-tertiary">{timeAgo(req.appliedAt)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-separator-border px-4 py-2.5">
                        <Link
                          href="/attendance/leave-approvals"
                          onClick={() => setIsNotifOpen(false)}
                          className="text-caption-1-medium text-accent-text hover:text-accent-text-strong transition-colors"
                        >
                          {recentLeaveRequests.length > NOTIF_ROW_CAP
                            ? `+${recentLeaveRequests.length - NOTIF_ROW_CAP} more — view all in Leave Approvals →`
                            : "View all in Leave Approvals →"}
                        </Link>
                      </div>
                    </div>
                  )}


                  {/* ── Your request updates (edit + deletion, whoever raised them) ── */}
                  {recentMyDecidedRequests.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-caption-2-semibold text-text-secondary">
                        Your Request Updates
                      </p>
                      <ul className="divide-y divide-separator-border">
                        {recentMyDecidedRequests.slice(0, NOTIF_ROW_CAP).map((notif) => {
                          const approved = notif.status === "Approved";
                          const isEdit = notif.kind === "edit";
                          const isMaint = notif.kind === "maintenance";
                          return (
                          <li key={notif.key}>
                            <button
                              type="button"
                              onClick={() => {
                                setMyDecidedRequests((prev) => prev.filter((n) => n.key !== notif.key));
                                setIsNotifOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                                approved ? "hover:bg-success-surface-strong/60" : "hover:bg-danger-surface-strong/60"
                              )}
                            >
                              <div className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                                approved ? "bg-success-surface-strong" : "bg-danger-surface-strong"
                              )}>
                                <User className={cn("h-3.5 w-3.5", approved ? "text-success-text" : "text-danger-text")} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-text-primary">
                                  {isMaint
                                    ? (approved
                                        ? "Your maintenance record was approved"
                                        : "Your maintenance record was rejected")
                                    : isEdit
                                    ? (approved
                                        ? "Your edit access has been approved by the Admin"
                                        : "Your edit request was rejected by the Admin")
                                    : (approved
                                        ? "Your deletion request has been approved by the Admin"
                                        : "Your deletion request was rejected by the Admin")}
                                </p>
                                <p className="text-[11px] text-text-secondary">
                                  {isMaint ? "" : isEdit ? `${notif.action} access for: ` : "Delete: "}
                                  <span className="font-semibold">{notif.resourceName}</span>
                                </p>
                                <p className={cn(
                                  "text-caption-2-medium",
                                  approved ? "text-success-text" : "text-danger-text"
                                )}>
                                  {isMaint
                                    ? (approved
                                        ? "It's now on the truck's record."
                                        : `Reason: ${notif.rejectReason ?? "—"} — submit a corrected record.`)
                                    : approved
                                    ? (isEdit ? "Please make your changes within 8 hours." : "The record has been deleted.")
                                    : "Contact the Admin if you have questions."}
                                </p>
                              </div>
                              <span className="shrink-0 text-[10px] text-text-tertiary">{timeAgo(notif.approvedAt ?? "")}</span>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                      {recentMyDecidedRequests.length > NOTIF_ROW_CAP && (
                        <div className="border-t border-separator-border px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { setIsNotifOpen(false); router.push("/personal/edit-delete-requests"); }}
                            className="text-caption-1-medium text-text-secondary hover:text-text-primary transition-colors"
                          >
                            +{recentMyDecidedRequests.length - NOTIF_ROW_CAP} more — view all in Edit & Delete Requests →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Empty state */}
                  {recentSheetAlerts.length === 0 &&
                   recentKmVarianceAlerts.length === 0 &&
                   maintenanceAlerts.length === 0 &&
                   reverificationAlerts.length === 0 &&
                   summaryAlerts.length === 0 &&
                   recentMyDecidedRequests.length === 0 &&
                   maintRequestNotifs.length === 0 &&
                   (isStaff || isFinanceManager || isMaintenance || (isFleetManager && recentEditRequestNotifs.length === 0) || (isAdmin && recentLeaveRequests.length === 0 && recentEditRequestNotifs.length === 0 && recentDeletionRequestNotifs.length === 0)) && (
                    <EmptyState size="compact" illustration="inbox-empty" title="No notifications" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>}

        <div className="h-6 w-px bg-separator-border" />

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            aria-expanded={isProfileOpen}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 outline-none transition-colors hover:bg-fill-2 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <span className="relative shrink-0">
              <PersonAvatar photoUrl={user?.photoUrl} label={user?.name ?? "You"} size={32} />
              {birthday.decorated && birthday.mine && <BirthdayBadge />}
            </span>
            <span className="hidden text-body-medium text-text-primary sm:inline">{user?.name ?? "—"}</span>
            <ChevronDown className={cn("size-4 text-foreground-icon-tertiary transition-transform duration-150", isProfileOpen && "rotate-180")} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 z-[100] mt-2 w-56 origin-top-right rounded-xl border border-separator-border bg-background-primary-default p-1 shadow-lg">
              <div className="flex items-center gap-2.5 border-b border-separator-border px-2.5 pb-2.5 pt-1.5">
                <PersonAvatar photoUrl={user?.photoUrl} label={user?.name ?? "You"} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-body-medium text-text-primary">{user?.name}</p>
                  <p className="truncate text-caption-1-regular text-text-tertiary">{user?.softwareDesignation}</p>
                </div>
              </div>
              <div className="flex flex-col gap-0.5 pt-1">
                <button
                  className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-body-regular text-text-primary outline-none transition-colors hover:bg-fill-2 focus-visible:bg-fill-2"
                  onClick={() => { setIsProfileOpen(false); router.push("/personal/profile"); }}
                >
                  Profile
                </button>
                {(birthday.festive || season.festive || founding.festive) && (
                  <button
                    className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-body-regular text-text-primary outline-none transition-colors hover:bg-fill-2 focus-visible:bg-fill-2"
                    onClick={() => { setIsProfileOpen(false); birthday.hideForToday(); season.hideForToday(); founding.hideForToday(); }}
                  >
                    Hide decorations today
                  </button>
                )}
                {season.festive && (
                  <button
                    className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-body-regular text-text-primary outline-none transition-colors hover:bg-fill-2 focus-visible:bg-fill-2"
                    onClick={() => { setIsProfileOpen(false); season.hideForSeason(); }}
                  >
                    Hide for the season
                  </button>
                )}
                <button
                  className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-body-regular text-danger-text outline-none transition-colors hover:bg-danger-surface focus-visible:bg-danger-surface"
                  onClick={handleLogoutClick}
                >
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    {openShift && (
      <CloseShiftBeforeLogoutDialog
        open={showCloseShiftPrompt}
        onClose={() => setShowCloseShiftPrompt(false)}
        openShift={openShift}
        onClosedAndLoggedOut={() => { setShowCloseShiftPrompt(false); logout(); }}
        onLogoutWithoutClosing={() => { setShowCloseShiftPrompt(false); logout(); }}
      />
    )}
    </>
  );
}
