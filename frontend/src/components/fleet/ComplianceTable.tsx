"use client";

import { useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { getComplianceStatus, isMissingCost, NO_COST_TAG, type ComplianceField } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { trucksApi, complianceRecordsApi } from "@/lib/api";

// Calendar days in an average month (365.25 ÷ 12) — see backend cost_units.py.
const DAYS_PER_MONTH = 365.25 / 12;
import { TruckComplianceView } from "@/components/fleet/TruckComplianceView";
import type { Truck } from "@/types/truck";
import { useTruckRunStats, missingSheetsNote } from "@/hooks/useTruckTripRuns";
import { RiCloseLine as X, RiHistoryLine as History, RiProfileLine as IdCard, RiClipboardLine as ClipboardCheck, RiReceiptLine as Receipt, RiGlobalLine as Globe, RiMapPin2Line as MapPin, RiWindyLine as Wind, RiShieldCheckLine as ShieldCheck, RiLoader4Line as Loader2, RiMoneyRupeeCircleLine as IndianRupee, RiInformationLine as Info, RiCalendar2Line as CalendarDays, RiTimeLine as Clock3, RiDashboard3Line as Gauge, RiStarLine as Sparkles } from "@remixicon/react";
import { type RemixiconComponentType as LucideIcon } from "@remixicon/react";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const RenewDocumentsDialog = dynamic(() => import("@/components/fleet/RenewDocumentsDialog").then((m) => m.RenewDocumentsDialog));
const UpdationHistoryDialog = dynamic(() => import("@/components/fleet/UpdationHistoryDialog").then((m) => m.UpdationHistoryDialog));
const STAT_CELL_ACCENTS: Record<"emerald" | "indigo" | "muted", { icon: string; label: string; value: string; border: string; bg: string }> = {
  // Calm, neutral cells — the Cost Breakdown keeps colour for status only.
  emerald: {
    icon: "bg-fill-2 text-text-secondary",
    label: "text-text-tertiary",
    value: "text-text-primary",
    border: "border-separator-border",
    bg: "bg-background-primary-default",
  },
  indigo: {
    icon: "bg-accent-solid/10 text-accent-text-strong",
    label: "text-text-tertiary",
    value: "text-accent-text-strong",
    border: "border-separator-border",
    bg: "bg-background-primary-default",
  },
  muted: {
    icon: "bg-fill-1 text-text-tertiary",
    label: "text-text-tertiary",
    value: "text-text-tertiary",
    border: "border-dashed border-separator-border",
    bg: "bg-fill-1",
  },
};

function StatCell({
  icon: Icon,
  label,
  accent,
  children,
}: {
  icon: LucideIcon;
  label: string;
  accent: "emerald" | "indigo" | "muted";
  children: ReactNode;
}) {
  const s = STAT_CELL_ACCENTS[accent];
  return (
    <div className={cn("flex min-h-[92px] flex-col justify-center gap-1.5 rounded-xl border px-3 py-2.5", s.border, s.bg)}>
      <div className="flex items-center gap-1.5">
        <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", s.icon)}>
          <Icon className="h-3 w-3" />
        </div>
        <p className={cn("text-[9px] font-semibold leading-tight", s.label)}>{label}</p>
      </div>
      <p className={cn("text-body-semibold tabular-nums", s.value)}>{children}</p>
    </div>
  );
}

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

type ComplianceTableProps = {
  trucks: Truck[];
  /** After a document is renewed / corrected / undone — the page reloads trucks. */
  onChanged: () => void;
  /** The page's document filter: that column is tinted (the list is sorted by it). */
  highlight?: ComplianceField;
};

const TABLE_STATUS: Record<string, string> = {
  Valid:           "bg-success-surface text-success-text",
  "Expiring Soon": "bg-warning-surface text-warning-text",
  Expired:         "bg-danger-surface text-danger-text",
  "Not Uploaded":  "bg-fill-2 text-text-secondary",
};

// ---------------------------------------------------------------------------
// Inline table cell
// ---------------------------------------------------------------------------

function ComplianceCell({ date, cost, field = "default" }: { date: string; cost: string | number; field?: ComplianceField }) {
  const status = getComplianceStatus(date, field);
  return (
    <div className="flex flex-col gap-1">
      <span className="whitespace-nowrap text-text-secondary">{formatDate(date)}</span>
      <div className="flex flex-wrap gap-1">
        <span className={cn("inline-flex w-fit rounded-full px-2 py-0.5 text-caption-1-medium whitespace-nowrap", TABLE_STATUS[status])}>
          {status}
        </span>
        {isMissingCost(date, cost) && (
          <span
            title="Uploaded without a cost: counts as ₹0 in Profitability and the Running Cost Calculator until it's entered."
            className={cn("inline-flex w-fit rounded-full px-2 py-0.5 text-caption-1-medium whitespace-nowrap", NO_COST_TAG)}
          >
            No Cost
          </span>
        )}
      </div>
    </div>
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
  { label: "RC",                    expKey: "rcExpenses",                   dateKey: "rcValidityDate",           historyDocType: "RC",                      Icon: IdCard,         iconBg: "bg-accent-surface-strong",    iconText: "text-accent-text",    accentText: "text-accent-text"    },
  { label: "FC (Fitness Cert.)",    expKey: "fcExpenses",                   dateKey: "fcExpiryDate",             historyDocType: "FC (Fitness Certificate)", Icon: ClipboardCheck, iconBg: "bg-purple-surface-strong",  iconText: "text-purple-text",  accentText: "text-purple-text"  },
  { label: "Road Tax",              expKey: "roadTaxExpenses",              dateKey: "roadTaxDate",              historyDocType: "Road Tax",                Icon: Receipt,        iconBg: "bg-orange-surface-strong",  iconText: "text-orange-text",  accentText: "text-orange-text"  },
  { label: "National Permit",       expKey: "nationalPermitExpenses",       dateKey: "nationalPermitDate",       historyDocType: "National Permit",         Icon: Globe,          iconBg: "bg-teal-surface-strong",    iconText: "text-teal-text",    accentText: "text-teal-text"    },
  { label: "Local Permit",          expKey: "localPermitExpenses",          dateKey: "localPermitDate",          historyDocType: "Local Permit",            Icon: MapPin,         iconBg: "bg-teal-surface-strong",    iconText: "text-teal-text",    accentText: "text-teal-text"    },
  { label: "Pollution Certificate", expKey: "pollutionCertificateExpenses", dateKey: "pollutionCertificateDate", historyDocType: "Pollution Certificate",   Icon: Wind,           iconBg: "bg-success-surface-strong", iconText: "text-success-text", accentText: "text-success-text" },
  { label: "Insurance",             expKey: "insuranceExpenses",            dateKey: "insuranceExpiryDate",      historyDocType: "Insurance",               Icon: ShieldCheck,    iconBg: "bg-purple-surface-strong",  iconText: "text-purple-text",  accentText: "text-purple-text"  },
];

// Cost Breakdown's history label → the compliance record's doc key.
const RECORD_DOC: Record<string, string> = {
  "RC": "rc", "FC (Fitness Certificate)": "fc", "Road Tax": "road_tax", "National Permit": "national_permit",
  "Local Permit": "local_permit", "Pollution Certificate": "pollution_cert", "Insurance": "insurance",
};

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
  blue:    { wrap: "border-accent-border bg-accent-surface",     heading: "text-accent-text"    },
  violet:  { wrap: "border-purple-border bg-purple-surface", heading: "text-purple-text"  },
  emerald: { wrap: "border-success-border bg-success-surface",heading: "text-success-text"},
  amber:   { wrap: "border-warning-border bg-warning-surface",   heading: "text-warning-text"   },
  gray:    { wrap: "border-separator-border bg-fill-1",     heading: "text-text-secondary"    },
};

function CalcSection({ title, color, children }: { title: string; color: SectionColor; children: ReactNode }) {
  const { wrap, heading } = SECTION_COLORS[color];
  return (
    <div className={cn("rounded-xl border px-4 py-3 space-y-3", wrap)}>
      <p className={cn("text-caption-2-semibold", heading)}>{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FormulaRow({ label, formula, desc }: { label: string; formula: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption-1-semibold text-text-primary">{label}</span>
        <span className="rounded border border-separator-border bg-background-primary-default px-2 py-0.5 font-mono text-[10px] text-text-secondary">
          {formula}
        </span>
      </div>
      <p className="text-[10px] leading-relaxed text-text-secondary">{desc}</p>
    </div>
  );
}

function CalcInfoDialog({ kmPerDay, onClose }: { kmPerDay: number | null; onClose: () => void }) {
  const kpdLabel = kmPerDay
    ? `${kmPerDay.toLocaleString("en-IN")} km/day`
    : "km/day (set in Truck Run Config)";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim/60 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-background-primary-default shadow-2xl sm:rounded-2xl max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-separator-border px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-surface-strong">
            <Info className="h-4 w-4 text-accent-text" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-body-semibold text-text-primary">How Values Are Calculated</h2>
            <p className="text-xs text-text-tertiary">Methodology behind every figure in the Cost Breakdown</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-text-tertiary hover:bg-fill-3 hover:text-text-secondary transition-colors"
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
              formula="Expiry Date − Start Date"
              desc="The full duration (in days) for which the expense was paid. The start is the 'Valid from' date entered when the document was renewed; if none was entered, it's the day the document was added or renewed in the app (from the document update history). The P&L and Running Cost use this same start. This prevents inflated costs mid-period (dividing by remaining days instead of the full period would make the same document appear more expensive the longer you wait)."
            />
          </CalcSection>

          <CalcSection title="Per-Document Costs" color="emerald">
            <FormulaRow
              label="Per Day"
              formula="Expense ÷ Validity Period (days) × 30.44 ÷ 26"
              desc="The document's cost per working day: its expense spread over the validity window you paid for, counted in 26 working days a month — the same working days EMI and maintenance use."
            />
            <FormulaRow
              label="Per Month"
              formula="Per Day × 26"
              desc="The document's cost per month (26 working days). Not divided by the number of remaining days — it is always derived from Per Day."
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

          <div className="flex gap-2.5 rounded-xl border border-warning-border bg-warning-surface px-4 py-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-text" />
            <p className="text-[10px] leading-relaxed text-warning-text-strong">
              Per Day, Per Month, and Per KM are only shown for documents that have both an expense
              and a history record. Documents registered or updated through the app always have a
              history record. Documents without one show <span className="font-semibold">—</span> in those fields.
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
  // Each document's cost and validity from the server — the same figures as
  // the Running Cost Calculator and Profitability (backend compliance_docs_all).
  const [costRows,     setCostRows]     = useState<Awaited<ReturnType<typeof trucksApi.getComplianceCost>> | null>(null);
  const [kmPerDay,     setKmPerDay]     = useState<number | null>(null);
  const [loadingHx,    setLoadingHx]    = useState(true);
  const [showCalcInfo, setShowCalcInfo] = useState(false);

  // Real, trip-history-based Monthly Distance Average for this truck — same
  // source and formula as the Truck Run Record page's "View Breakdown"
  // dialog — used for Cost Per KM (Advanced) below.
  const { stats: runStats } = useTruckRunStats(truck, true);

  useEffect(() => {
    Promise.all([
      trucksApi.getComplianceCost(truck.id),
      trucksApi.getRunConfig(),
    ])
      .then(([rows, runRows]) => {
        setCostRows(rows);
        const row = (runRows as { tyre_layout: string; km_per_day: string | null }[])
          .find((r) => r.tyre_layout === truck.tyreLayout);
        if (row?.km_per_day) setKmPerDay(parseFloat(row.km_per_day));
      })
      .catch(() => setCostRows([]))
      .finally(() => setLoadingHx(false));
  }, [truck.id, truck.tyreLayout]);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const computed = COST_DOCS.map((doc) => {
    // The document's record as the server costs it (its period covering today,
    // else its latest): cost, start ("Valid from", else the day it was entered)
    // → expiry — the same rule as Running Cost and the P&L (backend/compliance_cost.py).
    const rec        = costRows?.find((r) => r.label === doc.historyDocType);
    const raw        = rec?.expense ?? (parseFloat((truck[doc.expKey] as string) || "0") || 0);
    const expiryDate = truck[doc.dateKey] as string;
    const daysLeft   = expiryDate ? daysBetween(today, expiryDate) : null;

    // Per working day (26 a month), like every other per-day cost:
    // cost per calendar day × 30.44 days a month ÷ 26.
    const perDay:   number | null = rec?.per_calendar_day ? rec.per_calendar_day * DAYS_PER_MONTH / 26 : null;
    const perMonth: number | null = perDay !== null ? perDay * 26 : null;

    const perKm = perDay !== null && kmPerDay !== null && kmPerDay > 0
      ? perDay / kmPerDay
      : null;

    return { doc, raw, expiryDate, daysLeft, perDay, perMonth, perKm };
  });

  const totalExpense  = computed.reduce((s, c) => s + c.raw,           0);
  const totalPerMonth = computed.reduce((s, c) => s + (c.perMonth ?? 0), 0);
  const totalPerDay   = computed.reduce((s, c) => s + (c.perDay   ?? 0), 0);
  const totalPerKm    = kmPerDay && kmPerDay > 0 ? totalPerDay / kmPerDay : null;
  // Advanced = the month's cost ÷ the truck's normal km a month (the months
  // it worked, in the last 6) — no km/day involved.
  const totalPerKmAdvanced = totalPerDay > 0 && runStats.normalKm > 0
    ? (totalPerDay * 26) / runStats.normalKm
    : null;

  const portal = createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/60 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-background-primary-default shadow-2xl sm:rounded-2xl max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-separator-border px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fill-2 text-text-secondary ring-1 ring-separator-border">
            <IndianRupee className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-headline-semibold text-text-primary">Cost Breakdown</h2>
            <p className="text-xs text-text-tertiary">
              {truck.truckId} · {truck.registrationNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCalcInfo(true)}
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-secondary transition-colors hover:border-border-button-default hover:bg-fill-2 hover:text-text-primary"
          >
            <Info className="h-3.5 w-3.5" />
            How is it Calculated?
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-text-tertiary hover:bg-fill-3 hover:text-text-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingHx ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-tertiary">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Loading cost data…</span>
          </div>
        ) : (
          <>
            {/* Document cost cards */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-fill-1 px-5 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {computed.map(({ doc, raw, expiryDate, daysLeft, perDay, perMonth, perKm }) => {
                  const { Icon } = doc;
                  const isExpired = daysLeft !== null && daysLeft <= 0;
                  const hasDate   = !!expiryDate;

                  return (
                    <div
                      key={doc.expKey as string}
                      className="flex flex-col gap-3 rounded-2xl border border-separator-border bg-background-primary-default p-4 transition-colors hover:border-border-button-default"
                    >
                      {/* Icon + document name */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fill-2 text-text-secondary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-body-semibold text-text-primary">{doc.label}</p>
                      </div>

                      {/* Validity Date + Last Updated Expense — two labeled fields */}
                      <div className="grid grid-cols-2 gap-3 rounded-xl bg-fill-1 px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-caption-2-semibold text-text-tertiary">Validity Date</p>
                          {hasDate ? (
                            <>
                              <p className="text-body-semibold tabular-nums text-text-primary">{formatDate(expiryDate)}</p>
                              {daysLeft !== null && (
                                <p className={cn(
                                  "text-caption-2-semibold",
                                  isExpired ? "text-danger-text" : daysLeft <= 30 ? "text-warning-text" : "text-text-tertiary"
                                )}>
                                  {isExpired
                                    ? `${Math.abs(daysLeft)}d overdue`
                                    : daysLeft === 0 ? "Expires today" : `${daysLeft}d remaining`}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] text-text-tertiary">Not set</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <p className="text-caption-2-semibold text-text-tertiary">Last Updated Expense</p>
                          <p className={cn("text-body-semibold tabular-nums", raw > 0 ? "text-text-primary" : "text-text-tertiary")}>
                            {raw > 0 ? fmtCost(raw) : "—"}
                          </p>
                        </div>
                      </div>

                      {/* Per month / per day / per km — only shown when history anchor exists */}
                      {perDay !== null ? (
                        <div className="grid grid-cols-3 divide-x divide-separator-border pt-1">
                          <div className="pr-3">
                            <p className="text-body-semibold tabular-nums text-text-primary">{fmtCost(perMonth ?? 0)}</p>
                            <p className="mt-0.5 text-caption-2-medium text-text-tertiary">per month</p>
                          </div>
                          <div className="px-3">
                            <p className="text-body-semibold tabular-nums text-text-primary">{fmtCost(perDay)}</p>
                            <p className="mt-0.5 text-caption-2-medium text-text-tertiary">per day</p>
                          </div>
                          <div className="pl-3">
                            <p className="text-body-semibold tabular-nums text-text-primary">
                              {perKm !== null ? `₹${perKm.toFixed(4)}` : "—"}
                            </p>
                            <p className="mt-0.5 text-caption-2-medium text-text-tertiary">per km</p>
                          </div>
                        </div>
                      ) : raw > 0 && isExpired ? (
                        <p className="pt-1 text-[11px] text-danger-text">
                          Document expired — renew to recalculate costs
                        </p>
                      ) : raw > 0 && !hasDate ? (
                        <p className="pt-1 text-[11px] text-text-tertiary">
                          Set validity date to calculate costs
                        </p>
                      ) : raw > 0 ? (
                        <p className="pt-1 text-[11px] text-text-tertiary">
                          Update document to calculate costs
                        </p>
                      ) : (
                        <p className="pt-1 text-[11px] text-text-tertiary">No expense recorded</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals footer — visually distinct from the scroll area above via a
                real border + lifted shadow, so it never reads as overlapping the
                last row of cards. */}
            <div className="shrink-0 border-t border-separator-border bg-background-primary-default px-5 py-5">
              <div className="flex flex-col gap-3 sm:flex-row">

                {/* Total Compliance Cost — primary card */}
                <div className="relative flex min-h-[92px] flex-1 items-center gap-4 overflow-hidden rounded-2xl bg-accent-solid px-5 py-4">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-on-solid/10 ring-1 ring-background-primary-default">
                    <IndianRupee className="h-5 w-5 text-on-solid/90" />
                  </div>
                  <div className="relative min-w-0">
                    <p className="text-caption-2-semibold text-on-solid/50">Total Compliance Cost</p>
                    <p className="mt-0.5 truncate text-[26px] font-semibold leading-tight tracking-tight tabular-nums text-on-solid">
                      {totalExpense > 0 ? fmtCost(totalExpense) : <span className="text-headline-medium text-on-solid/60">No expenses recorded</span>}
                    </p>
                  </div>
                </div>

                {/* Per Month / Per Day / Cost/km (Basic) / Cost/km (Advanced) — compact stat grid */}
                <div className="grid grid-cols-2 gap-2.5 sm:w-[320px] sm:shrink-0">
                  <StatCell icon={CalendarDays} label="Per Month" accent="emerald">
                    {totalPerMonth > 0 ? fmtCost(totalPerMonth) : <span className="text-caption-1-medium text-text-tertiary">—</span>}
                  </StatCell>
                  <StatCell icon={Clock3} label="Per Day" accent="emerald">
                    {totalPerDay > 0 ? fmtCost(totalPerDay) : <span className="text-caption-1-medium text-text-tertiary">—</span>}
                  </StatCell>
                  <StatCell icon={Gauge} label="Cost/km (Basic)" accent={totalPerKm !== null ? "emerald" : "muted"}>
                    {totalPerKm !== null ? `₹${totalPerKm.toFixed(4)}` : "—"}
                  </StatCell>
                  <StatCell icon={Sparkles} label="Cost/km (Advanced)" accent={totalPerKmAdvanced !== null ? "indigo" : "muted"}>
                    {totalPerKmAdvanced !== null ? `₹${totalPerKmAdvanced.toFixed(6)}` : "—"}
                  </StatCell>
                </div>
              </div>

              {/* Formula footnote */}
              <div className="mt-3 flex flex-col gap-1 rounded-xl bg-fill-1 px-3.5 py-2.5">
                <p className="text-[10px] leading-relaxed text-text-tertiary">
                  <span className="font-semibold text-text-secondary">Per month</span> = 26 working days &nbsp;·&nbsp;
                  <span className="font-semibold text-text-secondary"> Per day</span> = amortized daily &nbsp;·&nbsp;
                  <span className="font-semibold text-text-secondary"> Cost/km (Basic)</span> = {totalPerKm !== null ? "total daily cost ÷ km/day" : "set km/day in Admin → Truck Run Config to unlock"}
                </p>
                <p className="text-[10px] leading-relaxed text-text-tertiary">
                  <span className="font-semibold text-text-secondary">Cost/km (Advanced)</span> = Per day × 26 ÷ normal km a month
                  {runStats.normalKm > 0
                    ? ` (${runStats.normalKm.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km/mo, the months it worked in the last 6)`
                    : " — no trip run history for this truck yet"}
                  {missingSheetsNote(runStats) && <span className="block text-warning-text">{missingSheetsNote(runStats)}</span>}
                </p>
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

/** The column index of each document (for the highlight). */
const DOC_COLUMN: Partial<Record<ComplianceField, number>> = {
  rc: 2, fc: 3, roadTax: 4, nationalPermit: 5, localPermit: 6, pollution: 7, insurance: 8,
};
const HIGHLIGHT = "bg-accent-surface/60";

const COLUMNS = [
  "Truck ID", "Registration No.",
  "RC Validity", "FC Validity", "Road Tax",
  "National Permit", "Local Permit", "Pollution Cert.", "Insurance",
  "",
];

export function ComplianceTable({ trucks, onChanged, highlight }: ComplianceTableProps) {
  const hl = highlight ? DOC_COLUMN[highlight] : undefined;
  const [viewTruck,    setViewTruck]    = useState<Truck | null>(null);
  const [historyTruck, setHistoryTruck] = useState<Truck | null>(null);
  const [renewTruck,   setRenewTruck]   = useState<Truck | null>(null);
  const [costTruck,    setCostTruck]    = useState<Truck | null>(null);

  if (trucks.length === 0) {
    return (
      <EmptyState size="compact" illustration="logistics" title="No trucks yet" description="Add trucks under &ldquo;Our Fleet&rdquo; to get started" />
    );
  }

  return (
    <>
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-separator-border bg-fill-1">
              {COLUMNS.map((col, i) => (
                <th key={i} className={`whitespace-nowrap px-4 py-3 text-caption-1-semibold ${i === hl ? "bg-accent-surface text-accent-text" : "text-text-secondary"}`}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <PagedTbody className="divide-y divide-separator-border" items={trucks}>
            {(truck) => (
              <tr key={truck.truckId} className="hover:bg-fill-2">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-text-primary">{truck.truckId}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{truck.registrationNumber}</td>
                <td className={`px-4 py-3 ${hl === DOC_COLUMN.rc ? HIGHLIGHT : ""}`}><ComplianceCell date={truck.rcValidityDate}           cost={truck.rcExpenses}                   field="rc"             /></td>
                <td className={`px-4 py-3 ${hl === DOC_COLUMN.fc ? HIGHLIGHT : ""}`}><ComplianceCell date={truck.fcExpiryDate}             cost={truck.fcExpenses}                   field="fc"             /></td>
                <td className={`px-4 py-3 ${hl === DOC_COLUMN.roadTax ? HIGHLIGHT : ""}`}><ComplianceCell date={truck.roadTaxDate}              cost={truck.roadTaxExpenses}              field="roadTax"        /></td>
                <td className={`px-4 py-3 ${hl === DOC_COLUMN.nationalPermit ? HIGHLIGHT : ""}`}><ComplianceCell date={truck.nationalPermitDate}       cost={truck.nationalPermitExpenses}       field="nationalPermit" /></td>
                <td className={`px-4 py-3 ${hl === DOC_COLUMN.localPermit ? HIGHLIGHT : ""}`}><ComplianceCell date={truck.localPermitDate}          cost={truck.localPermitExpenses}          field="localPermit"    /></td>
                <td className={`px-4 py-3 ${hl === DOC_COLUMN.pollution ? HIGHLIGHT : ""}`}><ComplianceCell date={truck.pollutionCertificateDate} cost={truck.pollutionCertificateExpenses} field="pollution"      /></td>
                <td className={`px-4 py-3 ${hl === DOC_COLUMN.insurance ? HIGHLIGHT : ""}`}><ComplianceCell date={truck.insuranceExpiryDate}      cost={truck.insuranceExpenses}            field="insurance"      /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewTruck(truck)}
                      className="whitespace-nowrap rounded-lg border border-accent-border bg-accent-surface px-3 py-1.5 text-caption-1-semibold text-accent-text transition-colors hover:border-accent-border-strong hover:bg-accent-surface-strong"
                    >
                      View Truck Data
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenewTruck(truck)}
                      className="whitespace-nowrap rounded-lg bg-accent-solid px-3 py-1.5 text-caption-1-semibold text-on-solid shadow-sm transition-colors hover:bg-accent-solid-hover"
                    >
                      Update Document
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTruck(truck)}
                      className="whitespace-nowrap rounded-lg border border-purple-border bg-purple-surface px-3 py-1.5 text-caption-1-semibold text-purple-text transition-colors hover:border-purple-border-strong hover:bg-purple-surface-strong"
                    >
                      View Updation History
                    </button>
                    <button
                      type="button"
                      onClick={() => setCostTruck(truck)}
                      className="whitespace-nowrap rounded-lg border border-success-border bg-success-surface px-3 py-1.5 text-caption-1-semibold text-success-text transition-colors hover:border-success-border-strong hover:bg-success-surface-strong"
                    >
                      View Cost Breakdown
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </PagedTbody>
        </table>
      </div>

      {viewTruck && (
        <TruckComplianceView truck={viewTruck} onClose={() => setViewTruck(null)} />
      )}
      <RenewDocumentsDialog truck={renewTruck} onClose={() => setRenewTruck(null)} onSaved={onChanged} />
      <UpdationHistoryDialog truck={historyTruck} onClose={() => setHistoryTruck(null)} onSaved={onChanged} />
      {costTruck && (
        <CostBreakdownDialog truck={costTruck} onClose={() => setCostTruck(null)} />
      )}
    </>
  );
}
