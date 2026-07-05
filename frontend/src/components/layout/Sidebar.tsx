"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { sidebarSections, type NavSection } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

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
    "/resources/drivers",
    "/resources/fleet",
    "/attendance/drivers",
    "/attendance/leave-requests",
  ],
  "Finance Manager": [
    "/",
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
  "Trip Sheet Coordinator": [
    "/",
    "/trips/sheet-collection",
    "/attendance/leave-requests",
  ],
  Staff: [
    "/",
    "/trips/reconciliation",
    "/resources/customers",
    "/resources/vendors",
    "/maintenance/trucks",
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

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const sections = getFilteredSections(user?.softwareDesignation ?? "Staff");

  return (
    <aside className="flex h-screen w-[280px] shrink-0 flex-col border-r border-white/50 bg-white/60 backdrop-blur-xl shadow-sm">
      <div className="flex items-center justify-center border-b border-white/50 px-5 py-3">
        <img
          src="/companylogo.png"
          alt="Canaan Global"
          className="h-[80px] w-auto object-contain"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="px-3 pb-2 text-[11px] font-bold tracking-wider text-blue-600 uppercase">
              {section.title}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-all duration-500 ease-out hover:-translate-y-1",
                        isActive
                          ? "border border-blue-200/60 bg-blue-50/60 backdrop-blur-md text-blue-700 shadow-[0_4px_20px_rgba(27,43,94,0.15)] hover:shadow-[0_8px_25px_rgba(27,43,94,0.2)]"
                          : "border border-transparent text-gray-600 hover:border-white/30 hover:bg-white/40 hover:backdrop-blur-sm hover:text-gray-900 hover:shadow-[0_4px_15px_rgba(0,0,0,0.05)]"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-3 border-t border-white/50 px-4 py-3">
        {user?.photoUrl ? (
          <img
            src={user.photoUrl}
            alt={user.name}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            {getInitials(user?.name ?? "U")}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-gray-900">
            {user?.name ?? "—"}
          </span>
          <span className="truncate text-[11px] text-gray-500">
            {user?.softwareDesignation ?? ""}
          </span>
        </div>
        <button
          type="button"
          aria-label="Log out"
          onClick={logout}
          className="text-gray-400 transition-colors hover:text-red-500"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
