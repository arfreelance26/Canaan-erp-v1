"use client";

import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function AuditorDashboard() {
  const { user } = useAuth();

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Welcome, {user?.name ?? "Auditor"}</h1>
          <p className="mt-0.5 text-sm text-gray-500">Audit dashboard</p>
        </div>
      </div>
    </div>
  );
}
