"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RiFileChart2Line as FileChart } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { DailySummaryCard } from "@/components/dashboard/DailySummaryCard";

/** Admin only: the sidebar hides it from other roles, and this guard sends
 *  anyone else who opens the link back to the dashboard. */
const ALLOWED_ROLES = ["Admin"];

export default function RecapReportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);

  useEffect(() => {
    if (!isAllowed) router.replace("/");
  }, [isAllowed, router]);

  if (!isAllowed) return null;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div data-tour="recap-report-header" className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
          <FileChart className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Recap Report</h1>
          <p className="mt-0.5 text-sm text-text-secondary">The daily recaps, gathered in one place</p>
        </div>
      </div>

      {/* The Morning / Live recap, moved here from the dashboard to free its space. */}
      <div data-tour="recap-report-card">
        <DailySummaryCard />
      </div>
    </div>
  );
}
