"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";

/**
 * The Resource Hub reports from Reports Center — Our Staff, Our Drivers,
 * Our Fleet, Our Customers, Our Vendors and Archive — each the same "file"
 * report as its page's "View" (/exports/resource-report, backend
 * resource_report.py), with its designed PDF. They cover the last 12 months
 * up to today (no period to pick); an optional search narrows it to the
 * matching ones, as the page's search box does. Archive can take one type.
 */

export type ResourceKind = "staff" | "drivers" | "fleet" | "customers" | "vendors" | "archive";

export const RESOURCE_REPORTS: Record<ResourceKind, { title: string; filename: string; about: string; search: string }> = {
  staff: {
    title: "Our Staff Report",
    filename: "Our_Staff.xlsx",
    about: "A sheet per role: each person's details and tenure, birthdays, Aadhaar (masked to the last 4) and their attendance over the last 12 months.",
    search: "Name or staff ID",
  },
  drivers: {
    title: "Our Drivers Report",
    filename: "Our_Drivers.xlsx",
    about: "A sheet per driver: details, licence and its expiry, IDs and bank (masked to the last 4), current truck, and the last 12 months month by month.",
    search: "Name or driver ID",
  },
  fleet: {
    title: "Our Fleet Report",
    filename: "Our_Fleet.xlsx",
    about: "A sheet per truck: details, current driver, every document with its expiry, the loan, last service and fuel, and the last 12 months' trips.",
    search: "Registration or truck ID",
  },
  customers: {
    title: "Our Customers Report",
    filename: "Our_Customers.xlsx",
    about: "A sheet per customer type, with Destinations and Pricing, and each customer's trips over the last 12 months.",
    search: "Customer name",
  },
  vendors: {
    title: "Our Vendors Report",
    filename: "Our_Vendors.xlsx",
    about: "A sheet per vendor category, with each vendor's details and what was spent with them over the last 12 months.",
    search: "Vendor name",
  },
  archive: {
    title: "Archive Report",
    filename: "Archive.xlsx",
    about: "A sheet per record type: everything still deleted, with who asked, who approved, when and why.",
    search: "Name, or who asked or approved",
  },
};

const ARCHIVE_TYPES = [
  { value: "", label: "Everything" },
  { value: "Driver", label: "Drivers" },
  { value: "Truck", label: "Trucks" },
  { value: "Staff", label: "Staff" },
  { value: "Customer", label: "Customers" },
  { value: "Vendor", label: "Vendors" },
  { value: "CfsYardEntry", label: "CFS/Yard" },
];

export function ResourceReportDialog({ kind, onClose }: { kind: ResourceKind; onClose: () => void }) {
  const r = RESOURCE_REPORTS[kind];
  const [search, setSearch] = useState("");
  const [archiveType, setArchiveType] = useState("");
  const term = search.trim();
  const typeLabel = ARCHIVE_TYPES.find((t) => t.value === archiveType)?.label ?? "Everything";
  const when = kind === "archive" ? typeLabel.toLowerCase() : "last 12 months";

  return (
    <Dialog open onClose={onClose} title={r.title} className="sm:max-w-xl">
      <div className="flex flex-col gap-5">
        <div className={kind === "archive" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-col"}>
          {kind === "archive" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-caption-2-semibold text-text-tertiary">Type</span>
              <GlassSelect aria-label="Type" value={archiveType} onChange={setArchiveType} options={ARCHIVE_TYPES} />
            </label>
          )}
          <OnlyTheseField value={search} onChange={setSearch} placeholder={r.search} />
        </div>

        <p className="text-caption-1-regular text-text-tertiary">
          {r.about}
          {kind !== "archive" && " It always covers the last 12 months up to today."}
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-separator-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-separator-border px-4 text-body-medium text-text-primary transition-colors hover:bg-fill-2"
          >
            Cancel
          </button>
          <ReportViewButton
            path="/exports/resource-report"
            filename={r.filename}
            title={`${r.title} — ${when}${term ? ` — "${term}"` : ""}`}
            params={{
              kind,
              ...(kind === "archive" && archiveType ? { resource_type: archiveType } : {}),
              ...(term ? { search: term } : {}),
            }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>
    </Dialog>
  );
}
