"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { sidebarSections, type NavSection } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { editApprovalsApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

// Allowed hrefs per software designation (Admin gets everything)
const ROLE_HREFS: Record<string, string[] | "all"> = {
  Admin: "all",
  "Fleet Manager": [
    "/",
    "/trips/assign-drivers",
    "/trips/assign",
    "/trips/current",
    "/trips/completed",
    "/trips/history",
    "/resources/customers",
    "/resources/drivers",
    "/resources/fleet",
    "/attendance/drivers",
    "/attendance/leave-requests",
  ],
  "Finance Manager": [
    "/",
    "/trips/verification",
    "/trips/finalization",
    "/trips/history",
    "/finance/driver-compensation",
    "/finance/emi-tracking",
    "/maintenance/compliance",
    "/attendance/leave-requests",
  ],
  "Tyre Manager": [
    "/",
    "/maintenance/tyre-management",
    "/maintenance/tyre-inventory",
    "/maintenance/trucks",
    "/attendance/leave-requests",
  ],
  "Yard Staff": [
    "/trips/sheet-collection",
    "/attendance/leave-requests",
  ],
  "Trip Sheet Register": [
    "/trips/reconciliation",
    "/maintenance/fuel-history",
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
};

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  const [pendingEditApprovals, setPendingEditApprovals] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    editApprovalsApi.list("Pending").then((r) => setPendingEditApprovals(r.length)).catch(() => {});
  }, [isAdmin]);
  const refreshPendingEditApprovals = () => {
    if (!isAdmin) return;
    editApprovalsApi.list("Pending").then((r) => setPendingEditApprovals(r.length)).catch(() => {});
  };
  useWebSocketEvent("edit_approval_created", refreshPendingEditApprovals);
  useWebSocketEvent("edit_approval_updated", refreshPendingEditApprovals);

  const badgeFor = (href: string): number =>
    href === "/attendance/edit-approvals" ? pendingEditApprovals : 0;

  const sections = getFilteredSections(user?.softwareDesignation ?? "Trip Sheet Register");

  return (
    <aside
      className={cn(
        "relative flex h-screen shrink-0 flex-col border-r border-white/50 bg-white/60 backdrop-blur-xl shadow-sm transition-[width] duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-16" : "w-[280px]"
      )}
    >
      {/* Header — logo + toggle */}
      <div className={cn(
        "flex items-center border-b border-white/50 transition-all duration-300",
        collapsed ? "justify-center px-0 py-3" : "justify-between px-4 py-3"
      )}>
        {collapsed ? (
          <button type="button" onClick={onToggle} aria-label="Expand sidebar" className="flex flex-col items-center gap-1.5">
            <img src="/logo.png" alt="Canaan" width={36} height={36} className="object-contain" />
          </button>
        ) : (
          <>
            <img src="/companylogo.png" alt="Canaan Global" className="h-[72px] w-auto object-contain" />
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="ml-2 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Expand button when collapsed (below logo) */}
      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            {/* Section title — hidden when collapsed */}
            {!collapsed && (
              <p className="px-3 pb-2 text-[11px] font-bold tracking-wider text-blue-600 uppercase">
                {section.title}
              </p>
            )}
            {collapsed && <div className="mx-auto mb-2 h-px w-8 bg-gray-200" />}

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
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {badge > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          )}
                        </>
                      )}
                      {/* Badge dot when collapsed */}
                      {collapsed && badge > 0 && (
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
        {!collapsed && (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-gray-900">{user?.name ?? "—"}</span>
              <span className="truncate text-[11px] text-gray-500">{user?.softwareDesignation ?? ""}</span>
            </div>
            <button
              type="button"
              aria-label="Log out"
              onClick={logout}
              className="shrink-0 text-gray-400 transition-colors hover:text-red-500"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
