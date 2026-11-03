"use client";

import { RiShieldCheckLine as ShieldCheck } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";

import { DashboardHero } from "@/components/dashboard/DashboardHero";
export function AuditorDashboard() {
  const { user } = useAuth();

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <DashboardHero illustration="documents" title={`Welcome, ${user?.name ?? "Auditor"}`} description="Audit dashboard" />
    </div>
  );
}
