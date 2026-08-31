"use client";

import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Placeholder landing dashboard for the Auditor role. Audit-specific pages will
 * be added one by one (see ROLE_HREFS in Sidebar.tsx) — this just gives the role
 * its own neutral, read-only-flavored view instead of falling through to the
 * full Admin dashboard, which would expose privileged widgets/actions Auditor
 * has no business seeing.
 */
export function AuditorDashboard() {
  const { user } = useAuth();

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name ?? "Auditor"}</h1>
        <p className="mt-1 text-sm text-gray-500">Audit dashboard</p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-white/10 dark:bg-[#141929]">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/30">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
        </span>
        <p className="text-sm font-semibold text-gray-700 dark:text-white">Audit pages coming soon</p>
        <p className="max-w-sm text-xs text-gray-400">
          This dashboard will fill in as audit-specific pages are added. For now, you can mark
          your own attendance, apply for leave, and use Canaan Chat from the sidebar.
        </p>
      </div>
    </div>
  );
}
