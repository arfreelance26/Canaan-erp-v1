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
import { useTheme } from "@/context/ThemeContext";

// Allowed hrefs per software designation (Admin gets everything)
const ROLE_HREFS: Record<string, string[] | "all"> = {
  Admin: "all",
  "Commercial Manager": [
    "/",
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
  ],
  "Assistant Commercial Manager": [
    "/",
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
  ],
  Accounts: [
    "/",
    "/trips/verification",
    "/trips/history",
    "/resources/customers",
    "/finance/driver-compensation",
    "/finance/emi-tracking",
    "/maintenance/compliance",
    "/attendance/mark",
    "/attendance/leave-requests",
    "/admin/sac-codes",
  ],
  Maintenance: [
    "/",
    "/maintenance/tyre-management",
    "/maintenance/tyre-inventory",
    "/maintenance/trucks",
    "/attendance/mark",
    "/attendance/leave-requests",
  ],
  "Yard Supervisor": [
    "/trips/sheet-collection",
    "/attendance/mark",
    "/attendance/leave-requests",
  ],
  "Trip Sheet Register": [
    "/trips/reconciliation",
    "/maintenance/fuel-history",
    "/attendance/mark",
    "/attendance/leave-requests",
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
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const isAdmin = user?.softwareDesignation === "Admin";
  const logoBg = theme === "dark"
    ? { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }
    : {};

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
        "fixed inset-y-0 left-0 z-50 w-[280px] transition-transform duration-300 ease-in-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop (md+): in-layout, overrides fixed, collapsible
        "md:static md:inset-auto md:z-auto md:h-screen md:shrink-0 md:translate-x-0 md:transition-[width]",
        collapsed ? "md:w-16" : "md:w-[280px]"
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
