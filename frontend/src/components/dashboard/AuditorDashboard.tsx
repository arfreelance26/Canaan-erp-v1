"use client";

import Link from "next/link";
import {
  Map,
  BarChart2,
  History,
  Wrench,
  Fuel,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const QUICK_LINKS = [
  { label: "Fleet Summary",            href: "/insights/fleet-summary",              icon: Map,         color: "bg-blue-50 text-blue-600 border-blue-200" },
  { label: "Trip Summary",             href: "/trips/pnl-mileage",                   icon: BarChart2,   color: "bg-violet-50 text-violet-600 border-violet-200" },
  { label: "Trip History",             href: "/trips/history",                       icon: History,     color: "bg-amber-50 text-amber-600 border-amber-200" },
  { label: "Truck Maintenance Record", href: "/maintenance/truck-records",           icon: Wrench,      color: "bg-orange-50 text-orange-600 border-orange-200" },
  { label: "Truck Fuel Record",        href: "/maintenance/truck-fuel-record",       icon: Fuel,        color: "bg-teal-50 text-teal-600 border-teal-200" },
  { label: "Truck EMI Record",         href: "/finance/truck-emi-record",            icon: Landmark,    color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  { label: "Truck Compliance Record",  href: "/maintenance/truck-compliance-record", icon: ShieldCheck, color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
];

export function AuditorDashboard() {
  const { user } = useAuth();

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name ?? "Auditor"}</h1>
        <p className="mt-1 text-sm text-gray-500">Audit dashboard</p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-600">Quick Access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-center text-xs font-semibold transition-all hover:-translate-y-1 hover:shadow-md ${color}`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
