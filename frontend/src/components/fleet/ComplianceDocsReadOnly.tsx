"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fileUrl } from "@/lib/api";
import { COMPLIANCE_DOCS, COMPLIANCE_MANAGER_ROLES, formatRupees } from "@/lib/compliance-docs";
import { getComplianceStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { FileViewer } from "@/components/ui/FileViewer";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";

const STATUS_TEXT = {
  Valid: "text-emerald-600",
  "Expiring Soon": "text-amber-600",
  Expired: "text-red-600",
} as const;

/** Edit Truck → the truck's documents, view-only. Renewing / correcting
 *  happens on Compliance & Renewals so every change keeps its history. */
export function ComplianceDocsReadOnly({ truck }: { truck: Truck }) {
  const { user } = useAuth();
  const canManage = COMPLIANCE_MANAGER_ROLES.includes(user?.softwareDesignation ?? "");
  const [viewing, setViewing] = useState<{ url: string; title: string } | null>(null);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-900">
          <Lock className="h-3.5 w-3.5" /> Compliance Documents
        </p>
        {canManage && (
          <Link
            href="/maintenance/compliance"
            className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
          >
            Renew in Compliance &amp; Renewals <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Documents can&apos;t be changed here. They&apos;re renewed or corrected on{" "}
        <b>Compliance &amp; Renewals</b>, which keeps every past document in the truck&apos;s Compliance History.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {COMPLIANCE_DOCS.map((d) => {
          const date = truck[d.dateKey] as string;
          const cost = parseFloat(truck[d.expensesKey] as string);
          const number = d.numberKey ? (truck[d.numberKey] as string) : "";
          const hasFile = !!truck[d.fileNameKey];
          const status = date ? getComplianceStatus(date, d.statusField) : null;
          return (
            <div key={d.key} className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{d.label}</span>
                {status && <span className={cn("text-[10px] font-semibold", STATUS_TEXT[status])}>{status}</span>}
              </div>
              <p className="text-sm font-semibold tabular-nums text-gray-900">
                {date ? `Valid until ${formatDate(date)}` : "Not on record"}
              </p>
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span className="truncate">
                  {Number.isNaN(cost) || cost <= 0 ? "No cost" : formatRupees(cost)}
                  {number && <> · No. {number}</>}
                </span>
                {hasFile && (
                  <button
                    type="button"
                    onClick={() => setViewing({ url: fileUrl("trucks", truck.id, d.key), title: `${truck.registrationNumber} — ${d.label}` })}
                    className="flex shrink-0 items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"
                  >
                    <FileText className="h-3.5 w-3.5" /> View
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <FileViewer open={!!viewing} onClose={() => setViewing(null)} url={viewing?.url ?? ""} title={viewing?.title ?? ""} />
    </div>
  );
}
