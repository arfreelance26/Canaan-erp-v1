"use client";

import { RiShieldCheckLine as ShieldCheck } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";

import { DashboardHero } from "@/components/dashboard/DashboardHero";
export function AuditorDashboard() {
  const { user } = useAuth();

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <DashboardHero role="Auditor" description="Review trips and flag anything that needs a recheck" />
    </div>
  );
}
