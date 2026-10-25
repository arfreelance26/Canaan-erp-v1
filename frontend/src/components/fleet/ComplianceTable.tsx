"use client";

import { useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { getComplianceStatus, type ComplianceField } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { trucksApi, complianceRecordsApi } from "@/lib/api";

// Calendar days in an average month (365.25 ÷ 12) — see backend cost_units.py.
const DAYS_PER_MONTH = 365.25 / 12;
import { RenewDocumentsDialog } from "@/components/fleet/RenewDocumentsDialog";
import { TruckComplianceView } from "@/components/fleet/TruckComplianceView";
import { UpdationHistoryDialog } from "@/components/fleet/UpdationHistoryDialog";
import type { Truck } from "@/types/truck";
import { useTruckRunStats, missingSheetsNote } from "@/hooks/useTruckTripRuns";
import {
  X, History,
  IdCard, ClipboardCheck, Receipt, Globe, MapPin, Wind, ShieldCheck,
  Loader2, IndianRupee, Info,
  CalendarDays, Clock3, Gauge, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const STAT_CELL_ACCENTS: Record<"emerald" | "indigo" | "muted", { icon: string; label: string; value: string; border: string; bg: string }> = {
  // Calm, neutral cells — the Cost Breakdown keeps colour for status only.
  emerald: {
    icon: "bg-slate-100 text-slate-500",
    label: "text-slate-400",
    value: "text-slate-800",
    border: "border-slate-200",
    bg: "bg-white",
  },
  indigo: {
    icon: "bg-brand-navy/10 text-brand-navy",
    label: "text-slate-400",
    value: "text-brand-navy",
    border: "border-slate-200",
    bg: "bg-white",
  },
  muted: {
    icon: "bg-slate-50 text-slate-300",
    label: "text-slate-300",
    value: "text-slate-300",
    border: "border-dashed border-slate-200",
    bg: "bg-slate-50/60",
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
        <p className={cn("text-[9px] font-semibold uppercase leading-tight tracking-wide", s.label)}>{label}</p>
      </div>
      <p className={cn("text-sm font-semibold tabular-nums", s.value)}>{children}</p>
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
  // The current version's "Valid from" per document, when one was entered on a renewal.
  const [validFrom,    setValidFrom]    = useState<Record<string, string>>({});
  const [kmPerDay,     setKmPerDay]     = useState<number | null>(null);
  const [loadingHx,    setLoadingHx]    = useState(true);
  const [showCalcInfo, setShowCalcInfo] = useState(false);

  // Real, trip-history-based Monthly Distance Average for this truck — same
  // source and formula as the Truck Run Record page's "View Breakdown"
  // dialog — used for Cost Per KM (Advanced) below.
  const { stats: runStats } = useTruckRunStats(truck, true);

  useEffect(() => {
    Promise.all([
      trucksApi.getComplianceHistory(truck.id),
      trucksApi.getRunConfig(),
      complianceRecordsApi.listForTruck(truck.id).catch(() => []),
    ])
      .then(([hx, runRows, records]) => {
        setHistory(hx);
        const from: Record<string, string> = {};
        for (const r of records) if (r.isCurrent && r.validFrom) from[r.docType] = r.validFrom;
        setValidFrom(from);
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

    // Validity period = its start → expiryDate. The start is the "Valid from"
    // typed in on a renewal when there is one, else history.updated_at (when
    // the doc was last set via Add Truck or a Renew) — the same rule as
    // Running Cost and the P&L (backend/compliance_cost.py).
    // Add Truck and every Renew log a history row (a correction doesn't; undoing a
    // renewal removes its row), so this is always available for form-entered data.
    let perDay:   number | null = null;
    let perMonth: number | null = null;

    if (history && expiryDate && raw > 0) {
      const entries = history
        .filter((h) => h.document_type === doc.historyDocType)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      const typedFrom = validFrom[RECORD_DOC[doc.historyDocType]];
      if (typedFrom || entries.length > 0) {
        const issuedAt = typedFrom
          ? typedFrom
          : entries[0].updated_at.endsWith("Z") || entries[0].updated_at.includes("+")
            ? entries[0].updated_at
            : entries[0].updated_at + "Z";
        const validityDays = daysBetween(issuedAt, expiryDate);
        if (validityDays > 0) {
          // Per working day (26 a month), like every other per-day cost:
          // cost per calendar day × 30.44 days a month ÷ 26.
          perDay   = (raw / validityDays) * DAYS_PER_MONTH / 26;
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
  // Advanced = the month's cost ÷ the month's km (Per Day × 26 ÷ Monthly
  // Distance Average from Truck Run Record) — no km/day involved.
  const totalPerKmAdvanced = totalPerDay > 0 && runStats.monthlyAvg > 0
    ? (totalPerDay * 26) / runStats.monthlyAvg
    : null;

  const portal = createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 ring-1 ring-slate-200/70">
            <IndianRupee className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">Cost Breakdown</h2>
            <p className="text-xs text-slate-400">
              {truck.truckId} · {truck.registrationNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCalcInfo(true)}
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
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
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-5 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {computed.map(({ doc, raw, expiryDate, daysLeft, perDay, perMonth, perKm }) => {
                  const { Icon } = doc;
                  const isExpired = daysLeft !== null && daysLeft <= 0;
                  const hasDate   = !!expiryDate;

                  return (
                    <div
                      key={doc.expKey as string}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 transition-colors hover:border-slate-300"
                    >
                      {/* Icon + document name */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-sm font-semibold text-slate-800">{doc.label}</p>
                      </div>

                      {/* Validity Date + Last Updated Expense — two labeled fields */}
                      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Validity Date</p>
                          {hasDate ? (
                            <>
                              <p className="text-sm font-semibold tabular-nums text-slate-800">{formatDate(expiryDate)}</p>
                              {daysLeft !== null && (
                                <p className={cn(
                                  "text-[10px] font-semibold",
                                  isExpired ? "text-rose-500" : daysLeft <= 30 ? "text-amber-600" : "text-slate-400"
                                )}>
                                  {isExpired
                                    ? `${Math.abs(daysLeft)}d overdue`
                                    : daysLeft === 0 ? "Expires today" : `${daysLeft}d remaining`}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] italic text-slate-400">Not set</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Last Updated Expense</p>
                          <p className={cn("text-sm font-semibold tabular-nums", raw > 0 ? "text-slate-900" : "text-slate-300")}>
                            {raw > 0 ? fmtCost(raw) : "—"}
                          </p>
                        </div>
                      </div>

                      {/* Per month / per day / per km — only shown when history anchor exists */}
                      {perDay !== null ? (
                        <div className="grid grid-cols-3 divide-x divide-slate-100 pt-1">
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
                        <p className="pt-1 text-[11px] italic text-rose-400">
                          Document expired — renew to recalculate costs
                        </p>
                      ) : raw > 0 && !hasDate ? (
                        <p className="pt-1 text-[11px] italic text-gray-400">
                          Set validity date to calculate costs
                        </p>
                      ) : raw > 0 ? (
                        <p className="pt-1 text-[11px] italic text-gray-400">
                          Update document to calculate costs
                        </p>
                      ) : (
                        <p className="pt-1 text-[11px] italic text-gray-400">No expense recorded</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals footer — visually distinct from the scroll area above via a
                real border + lifted shadow, so it never reads as overlapping the
                last row of cards. */}
            <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-5">
              <div className="flex flex-col gap-3 sm:flex-row">

                {/* Total Compliance Cost — primary card */}
                <div className="relative flex min-h-[92px] flex-1 items-center gap-4 overflow-hidden rounded-2xl bg-brand-navy px-5 py-4">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                    <IndianRupee className="h-5 w-5 text-white/90" />
                  </div>
                  <div className="relative min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Total Compliance Cost</p>
                    <p className="mt-0.5 truncate text-[26px] font-semibold leading-tight tracking-tight tabular-nums text-white">
                      {totalExpense > 0 ? fmtCost(totalExpense) : <span className="text-base font-medium text-white/60">No expenses recorded</span>}
                    </p>
                  </div>
                </div>

                {/* Per Month / Per Day / Cost/km (Basic) / Cost/km (Advanced) — compact stat grid */}
                <div className="grid grid-cols-2 gap-2.5 sm:w-[320px] sm:shrink-0">
                  <StatCell icon={CalendarDays} label="Per Month" accent="emerald">
                    {totalPerMonth > 0 ? fmtCost(totalPerMonth) : <span className="text-xs font-medium text-gray-300">—</span>}
                  </StatCell>
                  <StatCell icon={Clock3} label="Per Day" accent="emerald">
                    {totalPerDay > 0 ? fmtCost(totalPerDay) : <span className="text-xs font-medium text-gray-300">—</span>}
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
              <div className="mt-3 flex flex-col gap-1 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <p className="text-[10px] leading-relaxed text-slate-400">
                  <span className="font-semibold text-slate-500">Per month</span> = 26 working days &nbsp;·&nbsp;
                  <span className="font-semibold text-slate-500"> Per day</span> = amortized daily &nbsp;·&nbsp;
                  <span className="font-semibold text-slate-500"> Cost/km (Basic)</span> = {totalPerKm !== null ? "total daily cost ÷ km/day" : "set km/day in Admin → Truck Run Config to unlock"}
                </p>
                <p className="text-[10px] leading-relaxed text-slate-400">
                  <span className="font-semibold text-slate-500">Cost/km (Advanced)</span> = Per day × 26 ÷ Monthly Distance Average
                  {runStats.monthlyAvg > 0
                    ? ` (${runStats.monthlyAvg.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km/mo, from Truck Run Record)`
                    : " — no trip run history for this truck yet"}
                  {missingSheetsNote(runStats) && <span className="block text-amber-600">{missingSheetsNote(runStats)}</span>}
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

const COLUMNS = [
  "Truck ID", "Registration No.",
  "RC Validity", "FC Validity", "Road Tax",
  "National Permit", "Local Permit", "Pollution Cert.", "Insurance",
  "",
];

export function ComplianceTable({ trucks, onChanged }: ComplianceTableProps) {
  const [viewTruck,    setViewTruck]    = useState<Truck | null>(null);
  const [historyTruck, setHistoryTruck] = useState<Truck | null>(null);
  const [renewTruck,   setRenewTruck]   = useState<Truck | null>(null);
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
                      onClick={() => setRenewTruck(truck)}
                      className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                    >
                      Update Document
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
