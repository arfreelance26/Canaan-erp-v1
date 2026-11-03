"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RiLogoutBoxRLine as LogOut, RiArrowLeftSLine as ChevronLeft } from "@remixicon/react";
import { sidebarSections, type NavSection } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { editApprovalsApi, deletionApprovalsApi, chatApi, paymentRequestsApi, maintenanceRequestsApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useOpenShift } from "@/hooks/useOpenShift";
import { CloseShiftBeforeLogoutDialog } from "./CloseShiftBeforeLogoutDialog";

// Allowed hrefs per software designation (Admin gets everything)
const ROLE_HREFS: Record<string, string[] | "all"> = {
  Admin: "all",
  "Commercial Manager": [
    "/",
    "/connect/chat",
    "/trips/assign-drivers",
    "/trips/assign",
    "/trips/current",
    "/trips/completed",
    "/trips/history",
    "/insights/trip-planner",
    "/resources/customers",
    "/resources/drivers",
    "/resources/fleet",
    "/attendance/mark",
    "/attendance/drivers",
    "/attendance/leave-requests",
    "/attendance/edit-approvals",
    "/attendance/report",
    "/admin/repairs",
    "/admin/default-batta",
    "/personal/edit-delete-requests",
    "/personal/notifications",
  ],
  // Assistant Commercial Manager has EQUAL access to Commercial Manager.
  "Assistant Commercial Manager": [
    "/",
    "/connect/chat",
    "/trips/assign-drivers",
    "/trips/assign",
    "/trips/current",
    "/trips/completed",
    "/trips/history",
    "/insights/trip-planner",
    "/resources/customers",
    "/resources/drivers",
    "/resources/fleet",
    "/attendance/mark",
    "/attendance/drivers",
    "/attendance/leave-requests",
    "/attendance/edit-approvals",
    "/attendance/report",
    "/admin/repairs",
    "/admin/default-batta",
    "/personal/edit-delete-requests",
    "/personal/notifications",
  ],
  Accounts: [
    "/",
    "/finance/documents",
    "/finance/customer-detention",
    "/connect/chat",
    "/trips/verification",
    "/trips/history",
    "/trips/flagged",
    "/trips/audit-verified",
    "/resources/customers",
    "/finance/driver-compensation",
    "/finance/emi-tracking",
    "/maintenance/compliance",
    "/attendance/mark",
    "/attendance/leave-requests",
    "/attendance/payment-requests",
    "/attendance/maintenance-approvals",
    "/admin/sac-codes",
    "/trips/pending-audit",
    "/personal/edit-delete-requests",
    "/personal/notifications",
  ],
  Maintenance: [
    "/",
    "/connect/chat",
    "/maintenance/tyre-management",
    "/maintenance/tyre-inventory",
    "/maintenance/tyre-archive",
    "/maintenance/retread-queue",
    "/maintenance/discarded-tyres",
    "/maintenance/trucks",
    "/maintenance/fuel-history",
    "/admin/adblue",
    "/admin/maintenance",
    "/resources/vendors",
    "/attendance/mark",
    "/attendance/leave-requests",
    "/personal/edit-delete-requests",
    "/personal/notifications",
  ],
  "Yard Supervisor": [
    "/",
    "/connect/chat",
    "/trips/sheet-collection",
    "/attendance/mark",
    "/attendance/leave-requests",
    "/admin/repairs",
    "/trips/pending-audit",
    "/personal/edit-delete-requests",
    "/personal/notifications",
  ],
  "Trip Sheet Register": [
    "/",
    "/connect/chat",
    "/trips/reconciliation",
    "/trips/flagged",
    "/trips/audit-verified",
    "/maintenance/fuel-history",
    "/attendance/mark",
    "/attendance/leave-requests",
    "/admin/repairs",
    "/trips/pending-audit",
    "/personal/edit-delete-requests",
    "/personal/notifications",
  ],
  // Auditor gets a bare dashboard + chat + their own Driver / Vehicle Record.
  Auditor: [
    "/",
    "/connect/chat",
    "/resources/driver-record",
    "/resources/vehicle-record",
    "/personal/edit-delete-requests",
    "/personal/notifications",
  ],
};

function getFilteredSections(role: string): NavSection[] {
  const allowed = ROLE_HREFS[role] ?? ["/"];
  if (allowed === "all") return sidebarSections;

  return sidebarSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowed.includes(item.href)),
    }))
    .filter((section) => section.items.length > 0);
}


// Strips one trailing slash, but never reduces "/" itself to "" — used to
// compare a route href against usePathname() under next.config.ts's
// trailingSlash: true (see isActive below).
function stripTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** Pointer entered/left the sidebar (AppShell uses it to pause the auto-collapse timer). */
  onHoverChange?: (hovered: boolean) => void;
  /** Mandatory-attendance gate is active (see useAttendanceGate) — only Mark
   * Attendance and Chat stay in the menu until today's attendance is marked. */
  locked?: boolean;
};

const ATTENDANCE_LOCK_HREFS = ["/attendance/mark", "/connect/chat"];

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, onHoverChange, locked }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Logout is gated on closing an open self-checked-in shift first — see
  // CloseShiftBeforeLogoutDialog for why this isn't skippable.
  const openShift = useOpenShift();
  const [showCloseShiftPrompt, setShowCloseShiftPrompt] = useState(false);
  function handleLogoutClick() {
    if (openShift) setShowCloseShiftPrompt(true);
    else logout();
  }
  const isAdmin = user?.softwareDesignation === "Admin";
  const isAccounts = user?.softwareDesignation === "Accounts";
  const isCommercialManager = user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";

  // Edit Requests — visible to both Admin and Commercial Manager (both can review/approve
  // them, see routers/edit_approvals.py's require_roles("Admin", "Commercial Manager")).
  // Deletion approvals stay Admin-only — Commercial Manager has no route to that page.
  const canSeeEditApprovals = isAdmin || isCommercialManager;
  const [pendingEditApprovals, setPendingEditApprovals] = useState(0);
  const [pendingDeletionApprovals, setPendingDeletionApprovals] = useState(0);

  useEffect(() => {
    if (canSeeEditApprovals) {
      editApprovalsApi.list("Pending").then((r) => setPendingEditApprovals(r.length)).catch(() => {});
    }
    if (isAdmin) {
      deletionApprovalsApi.list("Pending").then((r) => setPendingDeletionApprovals(r.length)).catch(() => {});
    }
  }, [isAdmin, canSeeEditApprovals]);

  const refreshPendingEditApprovals = () => {
    if (!canSeeEditApprovals) return;
    editApprovalsApi.list("Pending").then((r) => setPendingEditApprovals(r.length)).catch(() => {});
  };
  const refreshPendingDeletionApprovals = () => {
    if (!isAdmin) return;
    deletionApprovalsApi.list("Pending").then((r) => setPendingDeletionApprovals(r.length)).catch(() => {});
  };

  // Maintenance Approvals — Admin and Accounts decide new maintenance records.
  const canSeeMaintenanceApprovals = isAdmin || isAccounts;
  const [pendingMaintenanceApprovals, setPendingMaintenanceApprovals] = useState(0);
  const refreshPendingMaintenanceApprovals = useCallback(() => {
    if (!canSeeMaintenanceApprovals) return;
    maintenanceRequestsApi.list({ status: "Pending" }).then((r) => setPendingMaintenanceApprovals(r.length)).catch(() => {});
  }, [canSeeMaintenanceApprovals]);
  useEffect(() => { refreshPendingMaintenanceApprovals(); }, [refreshPendingMaintenanceApprovals]);
  useWebSocketEvent("maintenance_request_updated", refreshPendingMaintenanceApprovals);

  useWebSocketEvent("edit_approval_created", refreshPendingEditApprovals);
  useWebSocketEvent("edit_approval_updated", refreshPendingEditApprovals);
  useWebSocketEvent("deletion_approval_created", refreshPendingDeletionApprovals);
  useWebSocketEvent("deletion_approval_updated", refreshPendingDeletionApprovals);

  // Canaan Chat — total unread messages across every conversation. Chat isn't
  // covered by the generic "data_changed" realtime channel (it's exempted —
  // see main.py), and reading a thread happens via mark-read calls that don't
  // themselves emit a WS event, so this refreshes on the chat-specific events
  // that DO fire (new/edited/deleted messages, conversations appearing), plus
  // whenever the route changes (covers leaving /connect/chat after reading),
  // plus a light poll as a final fallback.
  const [chatUnread, setChatUnread] = useState(0);
  const refreshChatUnread = useCallback(() => {
    chatApi
      .listConversations()
      .then((convs) => setChatUnread(convs.reduce((sum, c) => sum + c.unreadCount, 0)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshChatUnread();
  }, [refreshChatUnread]);

  useEffect(() => {
    const t = setTimeout(refreshChatUnread, 400);
    return () => clearTimeout(t);
  }, [pathname, refreshChatUnread]);

  useEffect(() => {
    const id = setInterval(refreshChatUnread, 20000);
    return () => clearInterval(id);
  }, [refreshChatUnread]);

  useWebSocketEvent("chat_message", refreshChatUnread);
  useWebSocketEvent("chat_message_updated", refreshChatUnread);
  useWebSocketEvent("chat_message_deleted", refreshChatUnread);
  useWebSocketEvent("chat_conversation_created", refreshChatUnread);
  useWebSocketEvent("chat_conversation_updated", refreshChatUnread);

  // Payment Requests — count of notes peer-approved but still awaiting an
  // Accounts/Admin decision (the page's "Pending" bucket: paymentStatus
  // "approved" and financeStatus still NULL). Only Admin/Accounts ever see
  // this page (see ROLE_HREFS above), so the fetch is gated the same way.
  const canSeePaymentRequests = isAdmin || isAccounts;
  const [pendingPaymentRequests, setPendingPaymentRequests] = useState(0);
  const refreshPendingPaymentRequests = useCallback(() => {
    if (!canSeePaymentRequests) return;
    paymentRequestsApi
      .list()
      .then((reqs) =>
        setPendingPaymentRequests(
          reqs.filter((r) => r.paymentStatus === "approved" && r.financeStatus === null).length
        )
      )
      .catch(() => {});
  }, [canSeePaymentRequests]);

  useEffect(() => {
    refreshPendingPaymentRequests();
  }, [refreshPendingPaymentRequests]);

  useEffect(() => {
    const t = setTimeout(refreshPendingPaymentRequests, 400);
    return () => clearTimeout(t);
  }, [pathname, refreshPendingPaymentRequests]);

  useEffect(() => {
    const id = setInterval(refreshPendingPaymentRequests, 20000);
    return () => clearInterval(id);
  }, [refreshPendingPaymentRequests]);

  // A payment note becomes/leaves this bucket only via chat events (peer
  // approves/rejects in Canaan Chat) — there's no dedicated payment-request
  // WS event, so reuse the same chat message events chatUnread listens to.
  useWebSocketEvent("chat_message", refreshPendingPaymentRequests);
  useWebSocketEvent("chat_message_updated", refreshPendingPaymentRequests);

  const badgeFor = (href: string): number => {
    if (href === "/attendance/edit-approvals") return pendingEditApprovals;
    if (href === "/attendance/deletion-approvals") return pendingDeletionApprovals;
    if (href === "/attendance/maintenance-approvals") return pendingMaintenanceApprovals;
    if (href === "/connect/chat") return chatUnread;
    if (href === "/attendance/payment-requests") return pendingPaymentRequests;
    return 0;
  };

  const sections = locked
    ? sidebarSections
        .map((section) => ({ ...section, items: section.items.filter((item) => ATTENDANCE_LOCK_HREFS.includes(item.href)) }))
        .filter((section) => section.items.length > 0)
    : getFilteredSections(user?.softwareDesignation ?? "Trip Sheet Register");

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-scrim/50 md:hidden"
          onClick={onMobileClose}
        />
      )}

    <aside
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      className={cn(
        // Shared — solid bg, not translucent: the page behind is flat white/navy
        // anyway, so backdrop-blur here bought nothing visually while forcing the
        // browser to recompute a blur sample every frame this panel resizes.
        "flex flex-col border-r border-separator-border bg-background-primary-default overflow-hidden",
        // `position: fixed` at EVERY breakpoint, not just mobile — this is the
        // whole fix. A fixed element is removed from document flow, so
        // animating its `width` never forces AppShell's main-content column
        // to reflow (that cross-sibling reflow, every frame, for the whole
        // transition, was the real source of the jank — no amount of
        // trimming the sidebar's own children could fix it, because the
        // expensive reflow was happening on the OTHER side, in whatever page
        // is currently mounted). AppShell reserves the equivalent horizontal
        // space with a plain, non-animated spacer div instead.
        "fixed inset-y-0 left-0 z-50 h-screen w-64 [contain:layout_style] [will-change:width,transform] transition-[width,transform] duration-200 ease-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-64"
      )}
    >
      {/* Header — logo + collapse toggle */}
      <div className="relative flex h-16 shrink-0 items-center border-b border-separator-border">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="mx-auto flex size-10 items-center justify-center rounded-lg outline-none transition-colors hover:bg-fill-2 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <img src="/logo.png" alt="Canaan" width={28} height={28} className="object-contain dark:hidden" />
            <img src="/logo-dark.png" alt="Canaan" width={28} height={28} className="hidden object-contain dark:block" />
          </button>
        ) : (
          <div className="flex w-full items-center justify-between gap-2 pl-4 pr-3">
            {/* Dark mode has its own logo (navy parts in off-white). */}
            <img src="/companylogo.png" alt="Canaan Global" className="h-11 w-auto object-contain dark:hidden" />
            <img src="/companylogo-dark.png" alt="Canaan Global" className="hidden h-11 w-auto object-contain dark:block" />
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground-icon-tertiary outline-none transition-colors hover:bg-fill-2 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {sections.map((section, i) => (
          <div key={section.title} className={cn(i > 0 && (collapsed ? "mt-3" : "mt-5"))}>
            {collapsed ? (
              i > 0 && <div className="mx-auto mb-3 h-px w-6 bg-separator-border" />
            ) : (
              <p className="px-3 pb-1.5 text-caption-1-medium text-text-tertiary">{section.title}</p>
            )}

            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                // trailingSlash: true makes every pathname except "/" end in "/";
                // hrefs don't, so normalise both sides before comparing.
                const isActive = stripTrailingSlash(pathname) === stripTrailingSlash(item.href);
                const Icon = item.icon;
                const badge = badgeFor(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-[34px] items-center rounded-lg text-body-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                        collapsed ? "justify-center" : "gap-2.5 px-2.5",
                        isActive
                          ? "bg-fill-2 text-text-primary shadow-[inset_0_0_0_1px_var(--color-separator-border)]"
                          : "text-text-secondary hover:bg-fill-1 hover:text-text-primary"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-[18px] shrink-0",
                          isActive ? "text-accent-text" : "text-foreground-icon-tertiary"
                        )}
                      />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {badge > 0 && !collapsed && (
                        <span className="min-w-5 rounded-md bg-danger-surface px-1.5 text-center font-mono text-caption-1-medium tabular-nums text-danger-text">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                      {badge > 0 && collapsed && (
                        <span className="absolute right-2 top-1.5 size-2 rounded-full bg-danger-solid ring-2 ring-background-primary-default" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="shrink-0 border-t border-separator-border p-2">
        <div className={cn("flex items-center rounded-lg", collapsed ? "justify-center py-1" : "gap-2.5 py-1.5 pl-1.5 pr-1")}>
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user.name} className="size-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-surface-strong text-caption-1-semibold text-accent-text-strong">
              {getInitials(user?.name ?? "U")}
            </div>
          )}
          {!collapsed && (
            <>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-medium text-text-primary">{user?.name ?? "—"}</span>
                <span className="truncate text-caption-1-regular text-text-tertiary">{user?.softwareDesignation ?? ""}</span>
              </div>
              <button
                type="button"
                aria-label="Log out"
                title="Log out"
                onClick={handleLogoutClick}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground-icon-tertiary outline-none transition-colors hover:bg-danger-surface hover:text-danger-text focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <LogOut className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
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
