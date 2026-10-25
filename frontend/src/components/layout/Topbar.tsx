"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ChevronRight, Bell, ChevronDown, CalendarClock, User, AlertTriangle, MessageSquare, Menu, Wrench } from "lucide-react";
import { sidebarSections } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { ProfileModal } from "./ProfileModal";
import { DisplaySettings } from "./DisplaySettings";
import { NetworkStatus } from "./NetworkStatus";
import { CalculatorButton } from "./CalculatorButton";
import { AlertsButton } from "./AlertsButton";
import { EventsButton } from "./EventsButton";
import { GreetingPill } from "./GreetingPill";
import { NotesButton } from "./NotesButton";
import { TodoButton } from "./TodoButton";
import { PrivacyNoticeButton } from "./PrivacyNoticeButton";
import { attendanceApi, editApprovalsApi, deletionApprovalsApi, maintenanceRequestsApi } from "@/lib/api";
import type { LeaveRequest } from "@/types/leave-request";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { formatDate } from "@/lib/format-date";
import { useNotifications, maintenanceAlertHref } from "@/context/NotificationContext";
import { useBirthday } from "@/context/BirthdayContext";
import { useSeason } from "@/context/SeasonContext";
import { useFounding } from "@/context/FoundingContext";
import { GoldWave, EstMark, FitMark } from "./FoundingDecor";
import { PineGarland, Snowfall, Streamers, NewYearMark, SantaOnDashboard } from "./SeasonDecor";
import { Bunting, BirthdayBadge, Balloons } from "./BirthdayDecor";
import { useOpenShift } from "@/hooks/useOpenShift";
import { CloseShiftBeforeLogoutDialog } from "./CloseShiftBeforeLogoutDialog";
// import { useChat } from "@/context/ChatContext"; // Next phase
import { showToast } from "@/lib/swal";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

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
  const backendOnline = useBackendStatus();
  const { user, logout } = useAuth();

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
  const birthday         = useBirthday();
  const season           = useSeason();
  const founding         = useFounding();

  // Compliance Alerts and Renewals & Payments no longer come through here —
  // see the comment where their bell sections used to render, further down.
  const { sheetAlerts, kmVarianceAlerts, maintenanceAlerts, pushSheetAlert, dismissSheetAlert, pushKmVarianceAlert, dismissKmVarianceAlert, dismissMaintenanceAlert } = useNotifications();
  // const { isOpen: isChatOpen, toggle: toggleChat } = useChat(); // Next phase

  const [isProfileOpen, setIsProfileOpen]         = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
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

  return (
    <>
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-white/50 bg-white/60 backdrop-blur-xl px-3 sm:px-6 shadow-sm">
      {birthday.decorated ? (
        <>
          {/* behind the pill / buttons, like the December snow */}
          <Balloons count={9} className="-z-10" />
          <Bunting className="z-[1]" />
        </>
      ) : founding.decorated ? (
        <GoldWave />
      ) : season.decorated ? (
        <>
          {/* Negative z inside the header's stacking context: painted over the
              header background but under the pill, buttons and profile. */}
          <Snowfall className="-z-10" glitter={season.day === "newyearday"} />
          {season.day === "newyearday" ? (
            <Streamers className="-z-10" />
          ) : (
            <PineGarland className="-z-10" />
          )}
          {season.day === "christmas" && <SantaOnDashboard uid={String(user?.id ?? user?.name ?? "")} className="-z-10" />}
        </>
      ) : null}

      {/* Hamburger — mobile only */}
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuOpen}
        className="mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <GreetingPill userKey={String(user?.id ?? user?.email ?? "")} name={user?.name ?? ""}>
        {attendanceLocked ? (
          // Every other way out of this page (sidebar links, direct URLs) is
          // already blocked by the gate in AppShell — this breadcrumb Home
          // icon was the one spot that still linked straight to "/" with no
          // awareness of the lock, letting someone dodge mandatory attendance
          // by clicking it before the redirect-back effect caught up.
          <button
            type="button"
            aria-label="Home"
            onClick={() => showToast("Mark today's attendance first.", "info")}
            className="flex h-7 w-7 shrink-0 cursor-not-allowed items-center justify-center rounded-full text-gray-300"
          >
            <Home className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Link
            href="/"
            aria-label="Home"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-all duration-300 hover:bg-blue-50 hover:text-blue-600"
          >
            <Home className="h-3.5 w-3.5" />
          </Link>
        )}
        {breadcrumbs.slice(1).map((crumb, index, arr) => {
          const isLast = index === arr.length - 1;
          return (
            <span key={crumb.label} className={`flex min-w-0 items-center gap-1 ${isLast ? "hidden sm:flex" : ""}`}>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="truncate text-sm font-medium tracking-[-0.006em] text-gray-500 transition-colors duration-300 hover:text-gray-900">
                  {crumb.label}
                </Link>
              ) : (
                <span className={`truncate text-sm tracking-[-0.006em] ${isLast ? "font-semibold text-gray-900" : "font-medium text-gray-500"}`}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </GreetingPill>

      {/* Founding Day / New Year mark — in the free space between the
          breadcrumb and the buttons (hidden when it wouldn't fit). */}
      {!birthday.decorated && founding.decorated ? (
        <FitMark><EstMark years={founding.years} /></FitMark>
      ) : !birthday.decorated && season.decorated && season.day === "newyearday" ? (
        <FitMark><NewYearMark year={season.newYear} /></FitMark>
      ) : null}

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

        {/* Invite — Admin only */}
        {isAdmin && <AlertsButton />}

        {/* Events — everyone sees upcoming meetings, only Admin schedules one */}
        <EventsButton />

        {/* Notes — private per-user notepad */}
        <NotesButton />

        {/* To-do — private per-user task list */}
        <TodoButton />

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
              recentSheetAlerts.length +
              recentKmVarianceAlerts.length +
              maintenanceAlerts.length +
              maintRequestNotifs.length +
              (isAdmin ? recentLeaveRequests.length + recentDeletionRequestNotifs.length : 0) +
              ((isAdmin || isFleetManager) ? recentEditRequestNotifs.length : 0) +
              recentMyDecidedRequests.length;
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
            <div className="absolute right-0 z-[100] mt-3 w-[calc(100vw-24px)] sm:w-[380px] origin-top-right rounded-2xl border border-white/60 bg-white/95 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-gray-400" />
                  <span className="text-[13px] font-semibold text-gray-900">Notifications</span>
                </div>
                {(() => {
                  const count =
                    recentSheetAlerts.length +
                    recentKmVarianceAlerts.length +
                    maintenanceAlerts.length +
                    maintRequestNotifs.length +
                    (isAdmin ? recentLeaveRequests.length + recentEditRequestNotifs.length + recentDeletionRequestNotifs.length : 0) +
                    recentMyDecidedRequests.length;
                  return count > 0 ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      {count} unread
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Body */}
              {!isAdmin && !isFleetManager && !isFinanceManager && !isStaff && !isMaintenance && recentMyDecidedRequests.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Bell className="h-8 w-8 text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">No notifications yet</p>
                  <p className="text-xs text-gray-400">Role-specific alerts coming soon</p>
                </div>
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
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-purple-600">
                        Edit Requests
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {shown.map((g) => {
                          const first = g.items[0];
                          return (
                          <li key={`edit-req-${g.key}`}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push("/attendance/edit-approvals"); }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-purple-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100">
                                <CalendarClock className="h-3.5 w-3.5 text-purple-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                {g.items.length > 1 ? (
                                  <p className="text-[12px] font-semibold text-gray-900">
                                    {g.key} — <span className="text-purple-700">{g.items.length} requests</span> pending
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-[12px] font-semibold text-gray-900">
                                      {g.key} is requesting{" "}
                                      <span className="text-purple-700">{first.action.toLowerCase()}</span> access
                                    </p>
                                    <p className="truncate text-[11px] text-gray-600">
                                      {first.resourceType}: <span className="font-semibold">{first.resourceName}</span>
                                    </p>
                                  </>
                                )}
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(first.createdAt)}</span>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                      <div className="border-t border-gray-100 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => { setIsNotifOpen(false); router.push("/attendance/edit-approvals"); }}
                          className="text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors"
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
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-600">
                        Maintenance Approvals
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {maintRequestNotifs.slice(0, NOTIF_ROW_CAP).map((n) => (
                          <li key={`maint-req-${n.id}`}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push("/attendance/maintenance-approvals"); }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-blue-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                                <Wrench className="h-3.5 w-3.5 text-blue-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-gray-900">
                                  {n.submittedByName} added <span className="text-blue-700">{n.maintenanceType}</span>
                                </p>
                                <p className="truncate text-[11px] text-gray-600">
                                  <span className="font-semibold">{n.registration}</span> · ₹{n.cost.toLocaleString("en-IN")}
                                  {n.source === "Trip Sheet" ? " · from a trip sheet" : ""}
                                </p>
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(n.createdAt)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-gray-100 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => { setIsNotifOpen(false); router.push("/attendance/maintenance-approvals"); }}
                          className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-800"
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
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-red-600">
                        Deletion Requests
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {shown.map((g) => {
                          const first = g.items[0];
                          return (
                          <li key={`del-req-${g.key}`}>
                            <button
                              type="button"
                              onClick={() => { setIsNotifOpen(false); router.push("/attendance/deletion-approvals"); }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-red-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                {g.items.length > 1 ? (
                                  <p className="text-[12px] font-semibold text-gray-900">
                                    {g.key} — <span className="text-red-700">{g.items.length} deletions</span> requested
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-[12px] font-semibold text-gray-900">
                                      {g.key} is requesting <span className="text-red-700">deletion</span>
                                    </p>
                                    <p className="truncate text-[11px] text-gray-600">
                                      {first.resourceType}: <span className="font-semibold">{first.resourceName}</span>
                                    </p>
                                  </>
                                )}
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(first.createdAt)}</span>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                      <div className="border-t border-gray-100 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => { setIsNotifOpen(false); router.push("/attendance/deletion-approvals"); }}
                          className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors"
                        >
                          {hiddenCount > 0 ? `+${hiddenCount} more — view all in Deletion Approvals →` : "View all in Deletion Approvals →"}
                        </button>
                      </div>
                    </div>
                    );
                  })()}

                  {/* ── Maintenance Alerts (Admin, Commercial Managers, Maintenance) —
                      "Notify me when this is due again" on a maintenance record. ── */}
                  {maintenanceAlerts.length > 0 && (() => {
                    const shown = maintenanceAlerts.slice(0, NOTIF_ROW_CAP);
                    const hiddenCount = maintenanceAlerts.length - shown.length;
                    return (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-rose-600">
                        Maintenance Alerts
                      </p>
                      <ul className="divide-y divide-gray-50">
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
                              className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors", due ? "hover:bg-rose-50/60" : "hover:bg-amber-50/60")}
                            >
                              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", due ? "bg-rose-100" : "bg-amber-100")}>
                                <Wrench className={cn("h-3.5 w-3.5", due ? "text-rose-600" : "text-amber-600")} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-gray-900">
                                  {alert.maintenanceType} {due ? "is due" : "due soon"}
                                </p>
                                <p className="text-[11px] text-gray-600">
                                  Truck: <span className="font-semibold">{alert.registration}</span>
                                </p>
                                <p className="text-[11px] text-gray-500">
                                  Reminder at <span className="font-semibold">{alert.remindAt.toLocaleString("en-IN")} km</span>
                                  <span className="ml-1 text-gray-400">· now {alert.odometer.toLocaleString("en-IN")} km</span>
                                </p>
                              </div>
                              <span className="shrink-0 text-right text-[10px] text-gray-400">
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
                        <div className="border-t border-gray-100 px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { setIsNotifOpen(false); router.push("/personal/notifications"); }}
                            className="text-xs font-medium text-rose-600 hover:text-rose-800 transition-colors"
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
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-orange-600">
                        Trip Sheet Alerts
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {shown.map((alert, i) => (
                          <li key={`${alert.tripDbId}-${i}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissSheetAlert(i);
                                setIsNotifOpen(false);
                                router.push(target);
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
                      {hiddenCount > 0 && (
                        <div className="border-t border-gray-100 px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { setIsNotifOpen(false); router.push(target); }}
                            className="text-xs font-medium text-orange-600 hover:text-orange-800 transition-colors"
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
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-600">
                        KM Variance Alerts
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {shown.map((alert, i) => (
                          <li key={`km-${alert.tripDbId}-${i}`}>
                            <button
                              type="button"
                              onClick={() => {
                                dismissKmVarianceAlert(i);
                                setIsNotifOpen(false);
                                router.push(target);
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
                      {hiddenCount > 0 && (
                        <div className="border-t border-gray-100 px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { setIsNotifOpen(false); router.push(target); }}
                            className="text-xs font-medium text-amber-600 hover:text-amber-800 transition-colors"
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
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-600">
                        Leave Requests
                      </p>
                      <ul className="divide-y divide-gray-50">
                        {recentLeaveRequests.slice(0, NOTIF_ROW_CAP).map((req) => (
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
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500">
                        Your Request Updates
                      </p>
                      <ul className="divide-y divide-gray-50">
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
                                <p className="text-[11px] text-gray-600">
                                  {isMaint ? "" : isEdit ? `${notif.action} access for: ` : "Delete: "}
                                  <span className="font-semibold">{notif.resourceName}</span>
                                </p>
                                <p className={cn(
                                  "text-[11px] font-medium",
                                  approved ? "text-green-700" : "text-red-700"
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
                              <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(notif.approvedAt ?? "")}</span>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                      {recentMyDecidedRequests.length > NOTIF_ROW_CAP && (
                        <div className="border-t border-gray-100 px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { setIsNotifOpen(false); router.push("/personal/edit-delete-requests"); }}
                            className="text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
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
                   recentMyDecidedRequests.length === 0 &&
                   maintRequestNotifs.length === 0 &&
                   (isStaff || isFinanceManager || isMaintenance || (isFleetManager && recentEditRequestNotifs.length === 0) || (isAdmin && recentLeaveRequests.length === 0 && recentEditRequestNotifs.length === 0 && recentDeletionRequestNotifs.length === 0)) && (
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
            {birthday.decorated && birthday.mine && <BirthdayBadge className="left-5 right-auto -top-1" />}
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-gray-900">{user?.name ?? "—"}</span>
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
                  <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-gray-900">{user?.name}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-blue-600">{user?.softwareDesignation}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 animate-stagger">
                <button
                  className="relative block w-full rounded-xl px-4 py-2.5 text-left text-[15px] font-medium text-gray-700 transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-white/80 hover:text-gray-900 hover:shadow-[0_4px_15px_rgba(0,0,0,0.05)] border border-transparent hover:border-white/50 after:absolute after:-inset-2"
                  onClick={() => { setIsProfileOpen(false); setIsProfileModalOpen(true); }}
                >
                  Profile
                </button>
                {(birthday.festive || season.festive || founding.festive) && (
                  <button
                    className="relative block w-full rounded-xl px-4 py-2.5 text-left text-[15px] font-medium text-gray-700 transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-white/80 hover:text-gray-900 hover:shadow-[0_4px_15px_rgba(0,0,0,0.05)] border border-transparent hover:border-white/50 after:absolute after:-inset-2"
                    onClick={() => { setIsProfileOpen(false); birthday.hideForToday(); season.hideForToday(); founding.hideForToday(); }}
                  >
                    Hide decorations today
                  </button>
                )}
                {season.festive && (
                  <button
                    className="relative block w-full rounded-xl px-4 py-2.5 text-left text-[15px] font-medium text-gray-700 transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-white/80 hover:text-gray-900 hover:shadow-[0_4px_15px_rgba(0,0,0,0.05)] border border-transparent hover:border-white/50 after:absolute after:-inset-2"
                    onClick={() => { setIsProfileOpen(false); season.hideForSeason(); }}
                  >
                    Hide for the season
                  </button>
                )}
                <button
                  className="relative block w-full rounded-xl px-4 py-2.5 text-left text-[15px] font-medium text-red-600 transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-red-50/80 hover:shadow-[0_4px_15px_rgba(239,68,68,0.1)] border border-transparent hover:border-red-100/50 after:absolute after:-inset-2"
                  onClick={handleLogoutClick}
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
