"use client";

import { useState } from "react";
import Link from "next/link";
import { RiArrowRightLine as ArrowRight, RiFileTextLine as FileText, RiLockLine as Lock } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { fileUrl } from "@/lib/api";
import { COMPLIANCE_DOCS, COMPLIANCE_MANAGER_ROLES, formatRupees } from "@/lib/compliance-docs";
import { getComplianceStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const FileViewer = dynamic(() => import("@/components/ui/FileViewer").then((m) => m.FileViewer));

const STATUS_TEXT = {
  Valid: "text-success-text",
  "Expiring Soon": "text-warning-text",
  Expired: "text-danger-text",
  "Not Uploaded": "text-text-tertiary",
} as const;

/** Edit Truck → the truck's documents, view-only. Renewing / correcting
 *  happens on Compliance & Renewals so every change keeps its history. */
export function ComplianceDocsReadOnly({ truck }: { truck: Truck }) {
  const { user } = useAuth();
  const canManage = COMPLIANCE_MANAGER_ROLES.includes(user?.softwareDesignation ?? "");
  const [viewing, setViewing] = useState<{ url: string; title: string } | null>(null);

  return (
    <div className="rounded-lg border border-separator-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-surface px-3 py-2">
        <p className="flex items-center gap-1.5 text-caption-1-semibold text-accent-text-strong">
          <Lock className="h-3.5 w-3.5" /> Compliance Documents
        </p>
        {canManage && (
          <Link
            href="/maintenance/compliance"
            className="flex items-center gap-1 text-caption-1-semibold text-accent-text hover:text-accent-text-strong hover:underline"
          >
            Renew in Compliance &amp; Renewals <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <p className="mb-3 text-xs text-text-secondary">
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
            <div key={d.key} className="flex flex-col gap-1 rounded-lg border border-separator-border bg-fill-1 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption-2-semibold text-text-secondary">{d.label}</span>
                {status && <span className={cn("text-caption-2-semibold", STATUS_TEXT[status])}>{status}</span>}
              </div>
              <p className="text-body-semibold tabular-nums text-text-primary">
                {date ? `Valid until ${formatDate(date)}` : "Not on record"}
              </p>
              <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                <span className="truncate">
                  {Number.isNaN(cost) || cost <= 0 ? "No cost" : formatRupees(cost)}
                  {number && <> · No. {number}</>}
                </span>
                {hasFile && (
                  <button
                    type="button"
                    onClick={() => setViewing({ url: fileUrl("trucks", truck.id, d.key), title: `${truck.registrationNumber} — ${d.label}` })}
                    className="flex shrink-0 items-center gap-1 font-semibold text-accent-text hover:text-accent-text-strong"
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
