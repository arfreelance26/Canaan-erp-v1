"use client";

import { useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { getComplianceStatus, type ComplianceField } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { fileUrl, trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import {
  X, Truck as TruckIcon, ExternalLink, FileX2, History,
  IdCard, ClipboardCheck, Receipt, Globe, MapPin, Wind, ShieldCheck,
  User, Calendar, FileText, Loader2, IndianRupee, Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type HistoryRow = {
  id: number;
  truck_id: number;
  document_type: string;
  updated_at: string;
  updated_by_name: string;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ComplianceTableProps = { trucks: Truck[] };

type DocDef = {
  key:       ComplianceField;
  label:     string;
  date:      (t: Truck) => string;
  docUrl:    (t: Truck) => string | null;
  Icon:      LucideIcon;
  iconBg:    string;
  iconText:  string;
};

// ---------------------------------------------------------------------------
// Document definitions — maps each doc to its truck fields and styling
// ---------------------------------------------------------------------------

const DOCS: DocDef[] = [
  {
    key:      "rc",
    label:    "RC",
    date:     (t) => t.rcValidityDate,
    docUrl:   (t) => t.rcDocumentUrl || null,
    Icon:     IdCard,
    iconBg:   "bg-blue-100",
    iconText: "text-blue-700",
  },
  {
    key:      "fc",
    label:    "FC (Fitness Certificate)",
    date:     (t) => t.fcExpiryDate,
    docUrl:   (t) => t.fcDocumentFileName ? fileUrl("trucks", t.id, "fc_document_file_name") : null,
    Icon:     ClipboardCheck,
    iconBg:   "bg-violet-100",
    iconText: "text-violet-700",
  },
  {
    key:      "roadTax",
    label:    "Road Tax",
    date:     (t) => t.roadTaxDate,
    docUrl:   (t) => t.roadTaxDocumentFileName ? fileUrl("trucks", t.id, "road_tax_document_file_name") : null,
    Icon:     Receipt,
    iconBg:   "bg-orange-100",
    iconText: "text-orange-700",
  },
  {
    key:      "nationalPermit",
    label:    "National Permit",
    date:     (t) => t.nationalPermitDate,
    docUrl:   (t) => t.nationalPermitProofFileName ? fileUrl("trucks", t.id, "national_permit_proof_file_name") : null,
    Icon:     Globe,
    iconBg:   "bg-teal-100",
    iconText: "text-teal-700",
  },
  {
    key:      "localPermit",
    label:    "Local Permit",
    date:     (t) => t.localPermitDate,
    docUrl:   (t) => t.localPermitProofFileName ? fileUrl("trucks", t.id, "local_permit_proof_file_name") : null,
    Icon:     MapPin,
    iconBg:   "bg-cyan-100",
    iconText: "text-cyan-700",
  },
  {
    key:      "pollution",
    label:    "Pollution Certificate",
    date:     (t) => t.pollutionCertificateDate,
    docUrl:   (t) => t.pollutionCertificateProofFileName ? fileUrl("trucks", t.id, "pollution_certificate_proof_file_name") : null,
    Icon:     Wind,
    iconBg:   "bg-emerald-100",
    iconText: "text-emerald-700",
  },
  {
    key:      "insurance",
    label:    "Insurance",
    date:     (t) => t.insuranceExpiryDate,
    docUrl:   (t) => t.insuranceDocumentProofFileName ? fileUrl("trucks", t.id, "insurance_document_proof_file_name") : null,
    Icon:     ShieldCheck,
    iconBg:   "bg-indigo-100",
    iconText: "text-indigo-700",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDays(date: string): number | null {
  if (!date) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(date); exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

function daysLabel(days: number | null): string {
  if (days === null)  return "No date set";
  if (days === 0)     return "Expires today";
  if (days > 0)       return `${days} day${days !== 1 ? "s" : ""} remaining`;
  return `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`;
}

const STATUS_BORDER: Record<string, string> = {
  Valid:           "border-l-green-400",
  "Expiring Soon": "border-l-amber-400",
  Expired:         "border-l-red-400",
};

const STATUS_PILL: Record<string, string> = {
  Valid:           "bg-green-50  text-green-700  ring-green-200",
  "Expiring Soon": "bg-amber-50  text-amber-700  ring-amber-200",
  Expired:         "bg-red-50    text-red-600    ring-red-200",
};

const STATUS_DAYS: Record<string, string> = {
  Valid:           "text-green-600",
  "Expiring Soon": "text-amber-600",
  Expired:         "text-red-500",
};

const TABLE_STATUS: Record<string, string> = {
  Valid:           "bg-green-50  text-green-700",
  "Expiring Soon": "bg-amber-50  text-amber-700",
  Expired:         "bg-red-50    text-red-600",
};

// ---------------------------------------------------------------------------
// Inline table cell
// ---------------------------------------------------------------------------

function ComplianceCell({ date, field = "default" }: { date: string; field?: ComplianceField }) {
  const status = getComplianceStatus(date, field);
  return (
    <div className="flex flex-col gap-1">
      <span className="whitespace-nowrap text-gray-600">{formatDate(date)}</span>
      <span className={cn("inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TABLE_STATUS[status])}>
        {status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

function TruckComplianceDialog({ truck, onClose }: { truck: Truck; onClose: () => void }) {
  const counts = { Valid: 0, "Expiring Soon": 0, Expired: 0 };
  for (const doc of DOCS) counts[getComplianceStatus(doc.date(truck), doc.key)]++;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl max-h-[92vh]">

        {/* ── Header ── */}
        <div className="relative flex items-start gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
            <TruckIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-lg font-bold leading-tight text-gray-900">
              {truck.registrationNumber || truck.truckId}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {[truck.truckId, truck.manufacturer, truck.modelName].filter(Boolean).join(" · ")}
              {truck.tyreLayout ? ` · ${truck.tyreLayout}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 shrink-0 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Status summary strip ── */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 bg-gray-50">
          {(["Valid", "Expiring Soon", "Expired"] as const).map((s) => (
            <div key={s} className="flex flex-col items-center py-3">
              <span className={cn(
                "text-2xl font-black tabular-nums",
                s === "Valid" ? "text-green-600" : s === "Expiring Soon" ? "text-amber-500" : "text-red-500"
              )}>
                {counts[s]}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{s}</span>
            </div>
          ))}
        </div>

        {/* ── Document cards ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DOCS.map((doc) => {
              const date   = doc.date(truck);
              const status = getComplianceStatus(date, doc.key);
              const days   = getDays(date);
              const url    = doc.docUrl(truck);
              const { Icon } = doc;

              return (
                <div
                  key={doc.key}
                  className={cn(
                    "group flex flex-col gap-3 rounded-2xl border border-l-4 border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
                    STATUS_BORDER[status]
                  )}
                >
                  {/* Top row: icon + label + status pill */}
                  <div className="flex items-center gap-3">
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", doc.iconBg)}>
                      <Icon className={cn("h-4 w-4", doc.iconText)} />
                    </div>
                    <span className="flex-1 text-xs font-bold uppercase tracking-wider text-gray-500">
                      {doc.label}
                    </span>
                    <span className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1",
                      STATUS_PILL[status]
                    )}>
                      {status}
                    </span>
                  </div>

                  {/* Expiry date */}
                  <div>
                    <p className="text-xl font-black tabular-nums text-gray-900">
                      {date ? formatDate(date) : "—"}
                    </p>
                    <p className={cn("mt-0.5 text-xs font-semibold", days === null ? "text-gray-400" : STATUS_DAYS[status])}>
                      {daysLabel(days)}
                    </p>
                  </div>

                  {/* Document link */}
                  <div className="mt-auto">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Document
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400">
                        <FileX2 className="h-3 w-3" />
                        No document uploaded
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Updation History Dialog
// ---------------------------------------------------------------------------

function UpdateHistoryDialog({ truck, onClose }: { truck: Truck; onClose: () => void }) {
  const [rows, setRows]       = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  // Fetch on first render
  useState(() => {
    trucksApi.getComplianceHistory(truck.id)
      .then((data) => { setRows(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  });

  function formatDateTime(iso: string) {
    try {
      // Backend returns UTC without a 'Z' suffix — append it so JS parses as UTC,
      // then toLocaleString converts correctly to the local timezone (IST).
      const utc = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
      const d = new Date(utc);
      return d.toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
    } catch { return iso; }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            <History className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900">Updation History</h2>
            <p className="text-xs text-gray-400">
              {truck.truckId} · {truck.registrationNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Loading history…</span>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-400">
              Failed to load history. Please try again.
            </div>
          ) : rows && rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <History className="h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">No updates recorded yet</p>
              <p className="text-xs">Document updates will appear here after the first change</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" />Document</span>
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />Date of Updation</span>
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    <span className="flex items-center gap-1.5"><User className="h-3 w-3" />User</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows!.map((row, i) => (
                  <tr key={row.id} className={cn("transition-colors hover:bg-gray-50", i % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-2 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        <FileText className="h-3 w-3" />
                        {row.document_type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-gray-700">
                      {formatDateTime(row.updated_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-800">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                          {row.updated_by_name.charAt(0).toUpperCase()}
                        </span>
                        {row.updated_by_name}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer count */}
        {rows && rows.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-right text-xs text-gray-400">
            {rows.length} update{rows.length !== 1 ? "s" : ""} recorded
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}


// ---------------------------------------------------------------------------
// Cost Breakdown Dialog
// ---------------------------------------------------------------------------

type CostDocDef = {
  label:          string;
  expKey:         keyof Truck;
  dateKey:        keyof Truck;
  historyDocType: string;
  Icon:           typeof IdCard;
  iconBg:         string;
  iconText:       string;
  accentText:     string;
};

const COST_DOCS: CostDocDef[] = [
  { label: "RC",                    expKey: "rcExpenses",                   dateKey: "rcValidityDate",           historyDocType: "RC",                      Icon: IdCard,         iconBg: "bg-blue-100",    iconText: "text-blue-700",    accentText: "text-blue-700"    },
  { label: "FC (Fitness Cert.)",    expKey: "fcExpenses",                   dateKey: "fcExpiryDate",             historyDocType: "FC (Fitness Certificate)", Icon: ClipboardCheck, iconBg: "bg-violet-100",  iconText: "text-violet-700",  accentText: "text-violet-700"  },
  { label: "Road Tax",              expKey: "roadTaxExpenses",              dateKey: "roadTaxDate",              historyDocType: "Road Tax",                Icon: Receipt,        iconBg: "bg-orange-100",  iconText: "text-orange-700",  accentText: "text-orange-700"  },
  { label: "National Permit",       expKey: "nationalPermitExpenses",       dateKey: "nationalPermitDate",       historyDocType: "National Permit",         Icon: Globe,          iconBg: "bg-teal-100",    iconText: "text-teal-700",    accentText: "text-teal-700"    },
  { label: "Local Permit",          expKey: "localPermitExpenses",          dateKey: "localPermitDate",          historyDocType: "Local Permit",            Icon: MapPin,         iconBg: "bg-cyan-100",    iconText: "text-cyan-700",    accentText: "text-cyan-700"    },
  { label: "Pollution Certificate", expKey: "pollutionCertificateExpenses", dateKey: "pollutionCertificateDate", historyDocType: "Pollution Certificate",   Icon: Wind,           iconBg: "bg-emerald-100", iconText: "text-emerald-700", accentText: "text-emerald-700" },
  { label: "Insurance",             expKey: "insuranceExpenses",            dateKey: "insuranceExpiryDate",      historyDocType: "Insurance",               Icon: ShieldCheck,    iconBg: "bg-indigo-100",  iconText: "text-indigo-700",  accentText: "text-indigo-700"  },
];

function fmtCost(n: number): string {
  if (n <= 0) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysBetween(from: string | Date, to: string | Date): number {
  const d1 = new Date(from); d1.setHours(0, 0, 0, 0);
  const d2 = new Date(to);   d2.setHours(0, 0, 0, 0);
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Calculation-explanation helpers
// ---------------------------------------------------------------------------

type SectionColor = "blue" | "violet" | "emerald" | "amber" | "gray";

const SECTION_COLORS: Record<SectionColor, { wrap: string; heading: string }> = {
  blue:    { wrap: "border-blue-100 bg-blue-50",     heading: "text-blue-700"    },
  violet:  { wrap: "border-violet-100 bg-violet-50", heading: "text-violet-700"  },
  emerald: { wrap: "border-emerald-100 bg-emerald-50",heading: "text-emerald-700"},
  amber:   { wrap: "border-amber-100 bg-amber-50",   heading: "text-amber-700"   },
  gray:    { wrap: "border-gray-100 bg-gray-50",     heading: "text-gray-500"    },
};

function CalcSection({ title, color, children }: { title: string; color: SectionColor; children: ReactNode }) {
  const { wrap, heading } = SECTION_COLORS[color];
  return (
    <div className={cn("rounded-xl border px-4 py-3 space-y-3", wrap)}>
      <p className={cn("text-[10px] font-bold uppercase tracking-wider", heading)}>{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FormulaRow({ label, formula, desc }: { label: string; formula: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-gray-800">{label}</span>
        <span className="rounded border border-gray-200 bg-white/80 px-2 py-0.5 font-mono text-[10px] text-gray-600">
          {formula}
        </span>
      </div>
      <p className="text-[10px] leading-relaxed text-gray-500">{desc}</p>
    </div>
  );
}

function CalcInfoDialog({ kmPerDay, onClose }: { kmPerDay: number | null; onClose: () => void }) {
  const kpdLabel = kmPerDay
    ? `${kmPerDay.toLocaleString("en-IN")} km/day`
    : "km/day (set in Truck Run Config)";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
            <Info className="h-4 w-4 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-900">How Values Are Calculated</h2>
            <p className="text-xs text-gray-400">Methodology behind every figure in the Cost Breakdown</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          <CalcSection title="Source Data" color="blue">
            <FormulaRow
              label="Validity Date"
              formula="Stored on truck record"
              desc="The expiry date you entered when registering the truck (via Add Truck) or when renewing a document (via Update Document). It is stored exactly as entered — nothing is computed."
            />
            <FormulaRow
              label="Last Updated Expense"
              formula="Stored on truck record"
              desc="The expense amount entered alongside the validity date. It always reflects the most recent renewal cost for that document."
            />
          </CalcSection>

          <CalcSection title="Validity Period — the divisor" color="violet">
            <FormulaRow
              label="Total Validity Period"
              formula="Expiry Date − Date of Last Update"
              desc="The full duration (in days) for which the expense was paid. The 'Date of Last Update' comes from the document update history — a timestamped record is written every time a truck is registered or a document is updated. This prevents inflated costs mid-period (dividing by remaining days instead of the full period would make the same document appear more expensive the longer you wait)."
            />
          </CalcSection>

          <CalcSection title="Per-Document Costs" color="emerald">
            <FormulaRow
              label="Per Day"
              formula="Expense ÷ Validity Period (days)"
              desc="The true amortized daily cost for this document. Represents what each calendar day 'costs' across the full validity window you paid for."
            />
            <FormulaRow
              label="Per Month"
              formula="Per Day × 26"
              desc="Estimated monthly cost using 26 working days per month. Not divided by the number of remaining days — it is always derived from Per Day."
            />
            <FormulaRow
              label="Per KM"
              formula={`Per Day ÷ ${kpdLabel}`}
              desc="Compliance cost contribution per kilometer driven. Uses the expected daily distance for this truck's tyre layout, configured in Admin → Truck Run Config. Shown as — when km/day is not set."
            />
          </CalcSection>

          <CalcSection title="Footer Totals" color="gray">
            <FormulaRow
              label="Total Compliance Cost"
              formula="Sum of all 7 document expenses"
              desc="The total amount on record for all compliance documents. Only includes documents where an expense has been entered."
            />
            <FormulaRow
              label="Amortized /month"
              formula="Sum of all Per Month values"
              desc="Combined monthly cost across all documents. Each document is weighted by its own actual validity period, so this is more accurate than dividing the total by a fixed number of months."
            />
            <FormulaRow
              label="Amortized /day"
              formula="Sum of all Per Day values"
              desc="Combined daily compliance cost across all documents with a valid history anchor."
            />
            <FormulaRow
              label="Amortized /km"
              formula={`Total Per Day ÷ ${kpdLabel}`}
              desc="Total compliance cost per kilometer across all documents. Only shown when km/day is configured for this tyre layout."
            />
          </CalcSection>

          <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[10px] leading-relaxed text-amber-800">
              Per Day, Per Month, and Per KM are only shown for documents that have both an expense
              and a history record. Documents registered or updated through the app always have a
              history record. Documents without one show <span className="font-bold">—</span> in those fields.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Cost Breakdown Dialog
// ---------------------------------------------------------------------------

function CostBreakdownDialog({ truck, onClose }: { truck: Truck; onClose: () => void }) {
  const [history,      setHistory]      = useState<HistoryRow[] | null>(null);
  const [kmPerDay,     setKmPerDay]     = useState<number | null>(null);
  const [loadingHx,    setLoadingHx]    = useState(true);
  const [showCalcInfo, setShowCalcInfo] = useState(false);

  useEffect(() => {
    Promise.all([
      trucksApi.getComplianceHistory(truck.id),
      trucksApi.getRunConfig(),
    ])
      .then(([hx, runRows]) => {
        setHistory(hx);
        const row = (runRows as { tyre_layout: string; km_per_day: string | null }[])
          .find((r) => r.tyre_layout === truck.tyreLayout);
        if (row?.km_per_day) setKmPerDay(parseFloat(row.km_per_day));
      })
      .catch(() => setHistory([]))
      .finally(() => setLoadingHx(false));
  }, [truck.id, truck.tyreLayout]);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const computed = COST_DOCS.map((doc) => {
    const raw        = parseFloat((truck[doc.expKey] as string) || "0") || 0;
    const expiryDate = truck[doc.dateKey] as string;
    const daysLeft   = expiryDate ? daysBetween(today, expiryDate) : null;

    // Validity period = history.updated_at (when user last set this doc via
    // TruckFormDialog or UpdateDocumentDialog) → expiryDate.
    // Both create_truck and update_truck log a history row, so this is always
    // available for any truck whose data came through the forms.
    let perDay:   number | null = null;
    let perMonth: number | null = null;

    if (history && expiryDate && raw > 0) {
      const entries = history
        .filter((h) => h.document_type === doc.historyDocType)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      if (entries.length > 0) {
        const issuedAt = entries[0].updated_at.endsWith("Z") || entries[0].updated_at.includes("+")
          ? entries[0].updated_at
          : entries[0].updated_at + "Z";
        const validityDays = daysBetween(issuedAt, expiryDate);
        if (validityDays > 0) {
          perDay   = raw / validityDays;
          perMonth = perDay * 26;
        }
      }
    }

    const perKm = perDay !== null && kmPerDay !== null && kmPerDay > 0
      ? perDay / kmPerDay
      : null;

    return { doc, raw, expiryDate, daysLeft, perDay, perMonth, perKm };
  });

  const totalExpense  = computed.reduce((s, c) => s + c.raw,           0);
  const totalPerMonth = computed.reduce((s, c) => s + (c.perMonth ?? 0), 0);
  const totalPerDay   = computed.reduce((s, c) => s + (c.perDay   ?? 0), 0);
  const totalPerKm    = kmPerDay && kmPerDay > 0 ? totalPerDay / kmPerDay : null;

  const portal = createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <IndianRupee className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">Cost Breakdown</h2>
            <p className="text-xs text-gray-400">
              {truck.truckId} · {truck.registrationNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCalcInfo(true)}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
            How is it Calculated?
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingHx ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Loading cost data…</span>
          </div>
        ) : (
          <>
            {/* Document cost cards */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {computed.map(({ doc, raw, expiryDate, daysLeft, perDay, perMonth, perKm }) => {
                  const { Icon } = doc;
                  const isExpired = daysLeft !== null && daysLeft <= 0;
                  const hasDate   = !!expiryDate;

                  return (
                    <div
                      key={doc.expKey as string}
                      className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 transition-shadow hover:shadow-sm"
                    >
                      {/* Icon + document name */}
                      <div className="flex items-center gap-3">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", doc.iconBg)}>
                          <Icon className={cn("h-4 w-4", doc.iconText)} />
                        </div>
                        <p className={cn("text-xs font-bold uppercase tracking-wide", doc.accentText)}>{doc.label}</p>
                      </div>

                      {/* Validity Date + Last Updated Expense — two labeled fields */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Validity Date</p>
                          {hasDate ? (
                            <>
                              <p className="text-sm font-semibold tabular-nums text-gray-800">{formatDate(expiryDate)}</p>
                              {daysLeft !== null && (
                                <p className={cn(
                                  "text-[10px] font-semibold",
                                  isExpired ? "text-red-500" : daysLeft <= 30 ? "text-amber-500" : "text-green-600"
                                )}>
                                  {isExpired
                                    ? `${Math.abs(daysLeft)}d overdue`
                                    : daysLeft === 0 ? "Expires today" : `${daysLeft}d remaining`}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] italic text-gray-400">Not set</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Updated Expense</p>
                          <p className={cn("text-sm font-bold tabular-nums", raw > 0 ? doc.accentText : "text-gray-300")}>
                            {raw > 0 ? fmtCost(raw) : "—"}
                          </p>
                        </div>
                      </div>

                      {/* Per month / per day / per km — only shown when history anchor exists */}
                      {perDay !== null ? (
                        <div className="grid grid-cols-3 divide-x divide-gray-200 border-t border-gray-100 pt-3">
                          <div className="pr-3">
                            <p className="text-sm font-semibold tabular-nums text-gray-800">{fmtCost(perMonth ?? 0)}</p>
                            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">per month</p>
                          </div>
                          <div className="px-3">
                            <p className="text-sm font-semibold tabular-nums text-gray-800">{fmtCost(perDay)}</p>
                            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">per day</p>
                          </div>
                          <div className="pl-3">
                            <p className="text-sm font-semibold tabular-nums text-gray-800">
                              {perKm !== null ? `₹${perKm.toFixed(4)}` : "—"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">per km</p>
                          </div>
                        </div>
                      ) : raw > 0 && isExpired ? (
                        <p className="border-t border-gray-100 pt-3 text-[11px] italic text-red-400">
                          Document expired — renew to recalculate costs
                        </p>
                      ) : raw > 0 && !hasDate ? (
                        <p className="border-t border-gray-100 pt-3 text-[11px] italic text-gray-400">
                          Set validity date to calculate costs
                        </p>
                      ) : raw > 0 ? (
                        <p className="border-t border-gray-100 pt-3 text-[11px] italic text-gray-400">
                          Update document to calculate costs
                        </p>
                      ) : (
                        <p className="border-t border-gray-100 pt-3 text-[11px] italic text-gray-400">No expense recorded</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals footer */}
            <div className="border-t border-emerald-100 bg-gradient-to-b from-emerald-50 to-white px-6 py-5">
              {/* 2×2 stat grid */}
              <div className="grid grid-cols-2 gap-3">

                {/* Total Compliance Cost — primary card */}
                <div className="col-span-2 flex items-center justify-between rounded-2xl bg-emerald-600 px-5 py-4 shadow-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Total Compliance Cost</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-white">
                      {totalExpense > 0 ? fmtCost(totalExpense) : <span className="text-emerald-300 text-base font-semibold">No expenses recorded</span>}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
                    <IndianRupee className="h-5 w-5 text-white" />
                  </div>
                </div>

                {/* Per Month */}
                <div className="flex flex-col gap-1 rounded-xl border border-emerald-100 bg-white px-4 py-3.5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Per Month</p>
                  <p className="text-lg font-black tabular-nums text-emerald-700">
                    {totalPerMonth > 0 ? fmtCost(totalPerMonth) : <span className="text-sm font-medium text-gray-300">—</span>}
                  </p>
                  <p className="text-[10px] text-gray-400">26 working days</p>
                </div>

                {/* Per Day */}
                <div className="flex flex-col gap-1 rounded-xl border border-emerald-100 bg-white px-4 py-3.5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Per Day</p>
                  <p className="text-lg font-black tabular-nums text-emerald-700">
                    {totalPerDay > 0 ? fmtCost(totalPerDay) : <span className="text-sm font-medium text-gray-300">—</span>}
                  </p>
                  <p className="text-[10px] text-gray-400">Amortized daily</p>
                </div>

                {/* Per KM — full width */}
                <div className={cn(
                  "col-span-2 flex items-center justify-between rounded-xl border px-4 py-3.5 shadow-sm",
                  totalPerKm !== null
                    ? "border-emerald-100 bg-white"
                    : "border-dashed border-gray-200 bg-gray-50"
                )}>
                  <div className="flex flex-col gap-0.5">
                    <p className={cn("text-[10px] font-bold uppercase tracking-widest", totalPerKm !== null ? "text-emerald-400" : "text-gray-300")}>
                      Per KM
                    </p>
                    <p className={cn("text-lg font-black tabular-nums", totalPerKm !== null ? "text-emerald-700" : "text-gray-300")}>
                      {totalPerKm !== null ? `₹${totalPerKm.toFixed(4)}` : "—"}
                    </p>
                  </div>
                  <p className="text-right text-[10px] text-gray-400 max-w-[160px]">
                    {totalPerKm !== null
                      ? "Total daily cost ÷ km/day"
                      : "Set km/day in Admin → Truck Run Config to unlock"}
                  </p>
                </div>

              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {portal}
      {showCalcInfo && (
        <CalcInfoDialog kmPerDay={kmPerDay} onClose={() => setShowCalcInfo(false)} />
      )}
    </>
  );
}


// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const COLUMNS = [
  "Truck ID", "Registration No.",
  "RC Validity", "FC Validity", "Road Tax",
  "National Permit", "Local Permit", "Pollution Cert.", "Insurance",
  "",
];

export function ComplianceTable({ trucks }: ComplianceTableProps) {
  const [viewTruck,    setViewTruck]    = useState<Truck | null>(null);
  const [historyTruck, setHistoryTruck] = useState<Truck | null>(null);
  const [costTruck,    setCostTruck]    = useState<Truck | null>(null);

  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks yet. Add trucks under &ldquo;Our Fleet&rdquo; to get started.
      </div>
    );
  }

  return (
    <>
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-gray-50">
              {COLUMNS.map((col, i) => (
                <th key={i} className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {trucks.map((truck) => (
              <tr key={truck.truckId} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{truck.truckId}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{truck.registrationNumber}</td>
                <td className="px-4 py-3"><ComplianceCell date={truck.rcValidityDate}           field="rc"             /></td>
                <td className="px-4 py-3"><ComplianceCell date={truck.fcExpiryDate}             field="fc"             /></td>
                <td className="px-4 py-3"><ComplianceCell date={truck.roadTaxDate}              field="roadTax"        /></td>
                <td className="px-4 py-3"><ComplianceCell date={truck.nationalPermitDate}       field="nationalPermit" /></td>
                <td className="px-4 py-3"><ComplianceCell date={truck.localPermitDate}          field="localPermit"    /></td>
                <td className="px-4 py-3"><ComplianceCell date={truck.pollutionCertificateDate} field="pollution"      /></td>
                <td className="px-4 py-3"><ComplianceCell date={truck.insuranceExpiryDate}      field="insurance"      /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewTruck(truck)}
                      className="whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
                    >
                      View Truck Data
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTruck(truck)}
                      className="whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-100"
                    >
                      View Updation History
                    </button>
                    <button
                      type="button"
                      onClick={() => setCostTruck(truck)}
                      className="whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100"
                    >
                      View Cost Breakdown
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewTruck && (
        <TruckComplianceDialog truck={viewTruck} onClose={() => setViewTruck(null)} />
      )}
      {historyTruck && (
        <UpdateHistoryDialog truck={historyTruck} onClose={() => setHistoryTruck(null)} />
      )}
      {costTruck && (
        <CostBreakdownDialog truck={costTruck} onClose={() => setCostTruck(null)} />
      )}
    </>
  );
}
