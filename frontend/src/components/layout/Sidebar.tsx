"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { sidebarSections, type NavSection } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { editApprovalsApi, deletionApprovalsApi, chatApi, paymentRequestsApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useTheme } from "@/context/ThemeContext";

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
    "/trips/pnl-mileage",
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
    "/trips/pnl-mileage",
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
  ],
  Accounts: [
    "/",
    "/connect/chat",
    "/trips/verification",
    "/trips/history",
    "/resources/customers",
    "/finance/driver-compensation",
    "/finance/emi-tracking",
    "/maintenance/compliance",
    "/attendance/mark",
    "/attendance/leave-requests",
    "/attendance/payment-requests",
    "/admin/sac-codes",
  ],
  Maintenance: [
    "/",
    "/connect/chat",
    "/maintenance/tyre-management",
    "/maintenance/tyre-inventory",
    "/maintenance/trucks",
    "/maintenance/air-filter-rr",
    "/maintenance/fuel-history",
    "/admin/adblue",
    "/attendance/mark",
    "/attendance/leave-requests",
  ],
  "Yard Supervisor": [
    "/connect/chat",
    "/trips/sheet-collection",
    "/attendance/mark",
    "/attendance/leave-requests",
    "/admin/repairs",
  ],
  "Trip Sheet Register": [
    "/connect/chat",
    "/trips/reconciliation",
    "/maintenance/fuel-history",
    "/attendance/mark",
    "/attendance/leave-requests",
  ],
  // Audit-specific pages are being added one by one.
  Auditor: [
    "/",
    "/connect/chat",
    "/insights/fleet-summary",
    "/trips/pnl-mileage",
    "/maintenance/truck-records",
    "/maintenance/truck-fuel-record",
    "/finance/truck-emi-record",
    "/maintenance/truck-compliance-record",
    "/trips/history",
  ],
};

// These live under Insights in nav-config.ts (that's where Auditor sees them,
// alongside the rest of their read-only analytics pages) but Admin gets them
// regrouped into their own "Auditor Pages" section, right after Insights —
// Admin has every other page too, so leaving them mixed into Insights would
// bury them among a much longer, unrelated list.
const AUDITOR_ONLY_HREFS = ["/maintenance/truck-records", "/maintenance/truck-fuel-record", "/finance/truck-emi-record", "/maintenance/truck-compliance-record"];

function regroupAuditorPagesForAdmin(sections: NavSection[]): NavSection[] {
  const extracted: NavSection["items"] = [];
  const withoutAuditorPages = sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!AUDITOR_ONLY_HREFS.includes(item.href)) return true;
      extracted.push(item);
      return false;
    }),
  }));
  if (extracted.length === 0) return withoutAuditorPages;

  const insightsIndex = withoutAuditorPages.findIndex((s) => s.title === "Insights");
  const auditorSection: NavSection = { title: "Auditor Pages", items: extracted };
  const insertAt = insightsIndex === -1 ? withoutAuditorPages.length : insightsIndex + 1;
  return [
    ...withoutAuditorPages.slice(0, insertAt),
    auditorSection,
    ...withoutAuditorPages.slice(insertAt),
  ];
}

function getFilteredSections(role: string): NavSection[] {
  const allowed = ROLE_HREFS[role] ?? ["/"];
  if (allowed === "all") return regroupAuditorPagesForAdmin(sidebarSections);

  return sidebarSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowed.includes(item.href)),
    }))
    .filter((section) => section.items.length > 0);
}

// Role → accent color for the profile card's role pill. A quick, genuinely
// useful visual cue in an app used by many different roles side by side —
// not decoration.
const ROLE_ACCENT: Record<string, string> = {
  Admin: "bg-slate-800/10 text-slate-700",
  "Commercial Manager": "bg-blue-50 text-blue-600",
  "Assistant Commercial Manager": "bg-blue-50 text-blue-600",
  Accounts: "bg-emerald-50 text-emerald-600",
  Maintenance: "bg-amber-50 text-amber-600",
  "Yard Supervisor": "bg-violet-50 text-violet-600",
  "Trip Sheet Register": "bg-teal-50 text-teal-600",
  Auditor: "bg-rose-50 text-rose-600",
};

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
};

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const isAdmin = user?.softwareDesignation === "Admin";
  const isAccounts = user?.softwareDesignation === "Accounts";
  const isCommercialManager = user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";
  const logoBg = theme === "dark"
    ? { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }
    : {};

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
    if (href === "/connect/chat") return chatUnread;
    if (href === "/attendance/payment-requests") return pendingPaymentRequests;
    return 0;
  };

  const sections = getFilteredSections(user?.softwareDesignation ?? "Trip Sheet Register");

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden"
          onClick={onMobileClose}
        />
      )}

    <aside
      className={cn(
        // Shared — solid bg, not translucent: the page behind is flat white/navy
        // anyway, so backdrop-blur here bought nothing visually while forcing the
        // browser to recompute a blur sample every frame this panel resizes.
        "flex flex-col border-r border-gray-200/70 bg-white shadow-sm overflow-hidden",
        // `position: fixed` at EVERY breakpoint, not just mobile — this is the
        // whole fix. A fixed element is removed from document flow, so
        // animating its `width` never forces AppShell's main-content column
        // to reflow (that cross-sibling reflow, every frame, for the whole
        // transition, was the real source of the jank — no amount of
        // trimming the sidebar's own children could fix it, because the
        // expensive reflow was happening on the OTHER side, in whatever page
        // is currently mounted). AppShell reserves the equivalent horizontal
        // space with a plain, non-animated spacer div instead.
        "fixed inset-y-0 left-0 z-50 h-screen w-[310px] [contain:layout_style] [will-change:width,transform] transition-[width,transform] duration-200 ease-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-[310px]"
      )}
    >
      {/* Header — logo + toggle */}
      <div className="relative flex h-[88px] shrink-0 items-center justify-center border-b border-gray-100 bg-gradient-to-b from-blue-50/50 to-transparent">
        {/* Small icon — centered, in flow only when collapsed */}
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          className={cn(
            "flex flex-col items-center gap-1.5 transition-all duration-300",
            collapsed ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-75 pointer-events-none absolute"
          )}
        >
          <div style={logoBg} className="p-1.5">
            <img src="/logo.png" alt="Canaan" width={36} height={36} className="object-contain" />
          </div>
        </button>

        {/* Full logo + collapse button — absolutely positioned, in flow only when expanded */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-between px-4 transition-all duration-300",
          collapsed ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
        )}>
          <div style={logoBg} className="px-3 py-1">
            <img src="/companylogo.png" alt="Canaan Global" className="h-[72px] w-auto object-contain" />
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="ml-2 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expand chevron — only shown when collapsed. Conditionally rendered
          instead of height-animated: an animated h-0 forces a layout pass on
          this element every frame of the width transition for no visible gain. */}
      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            {/* Section title / divider — conditionally rendered rather than
                max-height/width-animated, same reasoning as the chevron above.
                A small waypoint dot precedes the label — ties section headers
                to the same "route" language as the nav rail below. */}
            {!collapsed && (
              <p className="flex items-center gap-1.5 px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-blue-600">
                <span className="h-1 w-1 shrink-0 rounded-full bg-blue-300" />
                {section.title}
              </p>
            )}
            {collapsed && <div className="mx-auto mb-2 h-px w-8 bg-gray-200" />}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                // next.config.ts sets trailingSlash: true, so the real
                // pathname for every route except "/" itself carries a
                // trailing slash (e.g. "/insights/pl-summary/") while every
                // href here is written without one — a bare equality check
                // only ever matched the root Dashboard link. Normalize both
                // sides (strip a trailing slash, but never turn "/" into "").
                const isActive = stripTrailingSlash(pathname) === stripTrailingSlash(item.href);
                const Icon = item.icon;
                const badge = badgeFor(item.href);
                return (
                  <li key={item.href} className="relative">
                    {/* Active-route rail — a short vertical bar at the row's
                        left edge, evoking a highway lane marker rather than
                        the generic "filled box" every dashboard sidebar uses.
                        Absolute + fixed height, so it costs nothing during
                        the width transition. */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-blue-600" />
                    )}
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        // Only color/transform animate — padding is NOT transitioned:
                        // it would force a layout reflow on every item, every frame,
                        // for the whole 300ms the sidebar width is animating.
                        "relative flex items-center rounded-lg transition-[color,background-color,transform] duration-200 ease-out hover:-translate-y-0.5",
                        collapsed ? "justify-center px-0 py-2" : "gap-2.5 py-1.5 pl-4 pr-2.5 text-[14px] font-medium",
                        isActive
                          ? "text-gray-900 font-semibold"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      {/* Icon chip — a small tinted waypoint that lights up
                          solid blue on the active route, quiet everywhere else. */}
                      <span className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                        isActive ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30" : "text-gray-400"
                      )}>
                        <Icon className="h-4 w-4" />
                      </span>
                      {/* Label — opacity-only fade; the real clip comes for free
                          from the parent Link's own (already-animating) width. */}
                      {!collapsed && (
                        <span className="flex-1 truncate opacity-100 transition-opacity duration-200">
                          {item.label}
                        </span>
                      )}
                      {/* Badge count pill */}
                      {badge > 0 && !collapsed && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                      {/* Badge dot — only when collapsed */}
                      {badge > 0 && collapsed && (
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User area */}
      <div className={cn(
        "shrink-0 border-t border-gray-100 transition-all duration-300",
        collapsed ? "px-2 py-3" : "px-3 py-3"
      )}>
        <div
          className={cn(
            "group flex items-center rounded-2xl border border-gray-200/70 bg-white shadow-[0_2px_10px_-4px_rgba(27,43,94,0.12)] transition-[border-color,box-shadow] duration-300 hover:border-blue-200/70 hover:shadow-[0_6px_20px_-4px_rgba(27,43,94,0.18)]",
            collapsed ? "justify-center p-1.5" : "gap-2.5 py-2 pl-2 pr-1.5"
          )}
        >
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.name}
              className="h-9 w-9 shrink-0 rounded-full object-cover shadow-inner ring-2 ring-white"
            />
          ) : (
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-[#1B2B5E] text-sm font-semibold text-white shadow-sm ring-2 ring-white">
              {getInitials(user?.name ?? "U")}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
            </div>
          )}
          {!collapsed && (
            <>
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <span className="truncate text-[13px] font-semibold leading-tight text-gray-900">{user?.name ?? "—"}</span>
                <span className={cn(
                  "mt-0.5 inline-flex w-fit items-center truncate rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                  ROLE_ACCENT[user?.softwareDesignation ?? ""] ?? "bg-blue-50 text-blue-600"
                )}>
                  {user?.softwareDesignation ?? ""}
                </span>
              </div>
              <button
                type="button"
                aria-label="Log out"
                title="Log out"
                onClick={logout}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-95"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}
