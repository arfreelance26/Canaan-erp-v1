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
        // Shared
        "flex flex-col border-r border-white/50 bg-white/60 backdrop-blur-xl shadow-sm overflow-hidden",
        // Mobile: fixed overlay drawer, slides in/out
        "fixed inset-y-0 left-0 z-50 w-[310px] transition-transform duration-300 ease-in-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop (md+): in-layout, overrides fixed, collapsible
        "md:static md:inset-auto md:z-auto md:h-screen md:shrink-0 md:translate-x-0 md:transition-[width]",
        collapsed ? "md:w-16" : "md:w-[310px]"
      )}
    >
      {/* Header — logo + toggle */}
      <div className="relative flex h-[88px] shrink-0 items-center justify-center border-b border-white/50">
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

      {/* Expand chevron — only shown when collapsed */}
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand sidebar"
        className={cn(
          "mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all duration-300",
          collapsed ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none h-0 mt-0 overflow-hidden"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            {/* Section title — fades out when collapsed */}
            <p className={cn(
              "px-3 text-[11px] font-bold tracking-wider text-blue-600 uppercase overflow-hidden transition-all duration-300",
              collapsed ? "max-h-0 opacity-0 pb-0" : "max-h-8 opacity-100 pb-2"
            )}>
              {section.title}
            </p>
            <div className={cn(
              "mx-auto mb-2 h-px bg-gray-200 transition-all duration-300",
              collapsed ? "w-8 opacity-100" : "w-0 opacity-0"
            )} />

            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                const badge = badgeFor(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "relative flex items-center rounded-lg transition-all duration-300 ease-out hover:-translate-y-0.5",
                        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2 text-[15px] font-medium",
                        isActive
                          ? "border border-blue-200/60 bg-blue-50/60 backdrop-blur-md text-blue-700 shadow-[0_4px_20px_rgba(27,43,94,0.15)]"
                          : "border border-transparent text-gray-600 hover:border-white/30 hover:bg-white/40 hover:text-gray-900"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {/* Label — always rendered, fades + collapses width */}
                      <span className={cn(
                        "flex-1 whitespace-nowrap overflow-hidden transition-all duration-300",
                        collapsed ? "max-w-0 opacity-0" : "max-w-full opacity-100"
                      )}>
                        {item.label}
                      </span>
                      {/* Badge count pill */}
                      {badge > 0 && (
                        <span className={cn(
                          "flex h-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white transition-all duration-300 overflow-hidden",
                          collapsed ? "min-w-0 w-0 px-0 opacity-0" : "min-w-5 px-1.5 opacity-100"
                        )}>
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                      {/* Badge dot — only when collapsed */}
                      {badge > 0 && (
                        <span className={cn(
                          "absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 transition-all duration-300",
                          collapsed ? "opacity-100 scale-100" : "opacity-0 scale-0"
                        )} />
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
        "flex items-center border-t border-white/50 transition-all duration-300",
        collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3"
      )}>
        {user?.photoUrl ? (
          <img src={user.photoUrl} alt={user.name} className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            {getInitials(user?.name ?? "U")}
          </div>
        )}
        <div className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300",
          collapsed ? "max-w-0 opacity-0" : "max-w-full opacity-100"
        )}>
          <span className="truncate text-sm font-semibold text-gray-900">{user?.name ?? "—"}</span>
          <span className="truncate text-[11px] text-gray-500">{user?.softwareDesignation ?? ""}</span>
        </div>
        <button
          type="button"
          aria-label="Log out"
          onClick={logout}
          className={cn(
            "shrink-0 text-gray-400 transition-all duration-300 hover:text-red-500",
            collapsed ? "max-w-0 opacity-0 pointer-events-none overflow-hidden" : "max-w-full opacity-100"
          )}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
    </>
  );
}
