"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowRightUpLine as TrendingUp, RiArrowRightDownLine as TrendingDown, RiRouteLine as Route, RiArrowLeftSLine as ChevronLeft, RiArrowRightSLine as ChevronRight, RiCompass3Line as Compass, RiCalculatorLine as Calculator, RiCloseLine as X, RiFileTextLine as FileText, RiWallet3Line as Wallet, RiCursorLine as MousePointerClick, RiCalendar2Line as CalendarDays, RiFileExcel2Line as FileSpreadsheet } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { tripsApi, type TripPnlSummaryData } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { showError } from "@/lib/feedback";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const TripSheetDialog = dynamic(() => import("@/components/trips/TripSheetDialog").then((m) => m.TripSheetDialog));

const PAGE_SIZE = 10;

type Row = TripPnlSummaryData["rows"][number];

function fmt(v: number) {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

// ── Guide modal shell ────────────────────────────────────────────────────────────
function ModalShell({ title, subtitle, icon, onClose, children }: {
  title: string; subtitle?: string; icon: React.ReactNode; onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4">
      <div className="bg-background-primary-default rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-separator-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg bg-accent-surface p-2 text-accent-text shrink-0">{icon}</div>
            <div className="min-w-0">
              <h2 className="text-title-3-semibold text-text-primary">{title}</h2>
              {subtitle && <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-fill-3 hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-accent-solid px-4 py-3 font-mono text-[11px] leading-relaxed text-on-solid/90 overflow-x-auto">
      {children}
    </div>
  );
}

function GuideSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2 flex items-center gap-1.5 text-caption-1-semibold text-text-tertiary">
        {icon}{title}
      </p>
      <div className="space-y-2 text-sm text-text-primary leading-relaxed">{children}</div>
    </div>
  );
}

// ── "How is it Calculated" modal ─────────────────────────────────────────────────
function HowCalculatedModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      title="How is it Calculated"
      subtitle="Formulas behind every figure on this page"
      icon={<Calculator className="h-5 w-5" />}
      onClose={onClose}
    >
      <GuideSection title="Data source" icon={<FileText className="h-3.5 w-3.5" />}>
        <p>
          This page lists every trip that has a saved <b>Trip Sheet</b>. Trips without one (nothing filled in on the
          trip sheet yet) don&rsquo;t appear here, since there&rsquo;s no expense/KM data to show.
        </p>
      </GuideSection>

      <GuideSection title="Hire Amount" icon={<Wallet className="h-3.5 w-3.5" />}>
        <p>
          Same figure as the <b>&ldquo;Hire Amount (excluding Commission Amount)&rdquo;</b> field on the trip
          assignment form — the trip sheet&rsquo;s hire amount minus whatever commission was set on the route:
        </p>
        <Formula>Hire Amount&nbsp;&nbsp;=&nbsp;&nbsp;Trip Sheet Hire Amount − Transport Commission Amount</Formula>
      </GuideSection>

      <GuideSection title="Total Expense" icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
        <p>Everything the company bears for the trip, taken straight from the trip sheet:</p>
        <Formula>
          Total Expense&nbsp;&nbsp;=&nbsp;&nbsp;Driver Batta + Port Pass + Weight Sheet + Mamol + Claimable Mamol
          + Traffic/RTO + Lift On/Off + Crane Operator + Parking + Other Expenses + Toll Charges + Halt Pay
        </Formula>
      </GuideSection>

      <GuideSection title="P&L" icon={<TrendingUp className="h-3.5 w-3.5" />}>
        <Formula>P&amp;L&nbsp;&nbsp;=&nbsp;&nbsp;Hire Amount − Total Expense</Formula>
        <p className="text-xs text-text-secondary">Green with an up arrow means profit; red with a down arrow means loss.</p>
      </GuideSection>

      <GuideSection title="KM" icon={<Route className="h-3.5 w-3.5" />}>
        <Formula>KM&nbsp;&nbsp;=&nbsp;&nbsp;Trip Sheet End KM − Start KM</Formula>
      </GuideSection>

      <GuideSection title="Filters &amp; sorting" icon={<CalendarDays className="h-3.5 w-3.5" />}>
        <p>
          From/To filters by the trip&rsquo;s <b>Scheduled Date</b>. Search matches Trip ID, vehicle, origin, or
          destination. Rows are always sorted latest-scheduled first, then by highest P&amp;L. The totals row at the
          bottom of the table sums every filtered trip, not just the current page.
        </p>
      </GuideSection>
    </ModalShell>
  );
}

// ── "Quick Start Guide" modal ─────────────────────────────────────────────────────
function QuickStartModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { n: 1, title: "Pick a date range", body: "Use From/To to narrow trips to a period, based on each trip's Scheduled Date. Leave both blank to see every trip with a saved trip sheet." },
    { n: 2, title: "Search if needed", body: "Type a Trip ID, vehicle registration, or origin/destination to jump straight to a specific trip." },
    { n: 3, title: "Read the summary cards", body: "Trips, Total Hire, and Net P&L for everything currently matching your filters — updates live as you filter." },
    { n: 4, title: "Scan the table", body: "Each row shows Hire Amount, Total Expense, P&L and KM for one trip. Rows are sorted latest first." },
    { n: 5, title: "Click a row for details", body: "Opens the full read-only Trip Sheet — every expense line item, driver batta, and KM reading behind the numbers." },
    { n: 6, title: "Check \"How is it Calculated\"", body: "Click that button any time to see the exact formulas behind Hire Amount, Total Expense, P&L, and KM." },
  ];
  return (
    <ModalShell
      title="Quick Start Guide"
      subtitle="Get comfortable with this page in under a minute"
      icon={<Compass className="h-5 w-5" />}
      onClose={onClose}
    >
      <div className="space-y-4">
        {steps.map((s) => (
          <div key={s.n} className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-surface-strong text-caption-1-semibold text-accent-text">{s.n}</div>
            <div>
              <p className="text-body-semibold text-text-primary">{s.title}</p>
              <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{s.body}</p>
            </div>
          </div>
        ))}
        <div className="flex gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill-2 text-text-secondary">
            <MousePointerClick className="h-3.5 w-3.5" />
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Tip: this page is read-only — to add or edit a trip sheet, go to the trip in <b>Trip Sheet Collection</b>.
          </p>
        </div>
      </div>
    </ModalShell>
  );
}

export default function PnlMileagePage() {
  // Profit figures — Admin only (backend: GET /trips/pnl-summary).
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || user.softwareDesignation === "Admin";
  const [summary, setSummary] = useState<TripPnlSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<TripSheetData | undefined>(undefined);
  const [selectedClosure, setSelectedClosure] = useState<TripClosureData | undefined>(undefined);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHowCalculated, setShowHowCalculated] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isAllowed) router.replace("/");
  }, [isAllowed, router]);

  // Debounce the search box so every keystroke doesn't fire a request —
  // only the aggregate fetch below depends on `debouncedSearch`, so typing
  // stays instant while the network call settles 300ms after the user pauses.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, dateFrom, dateTo]);

  useEffect(() => {
    // Lazy — only the current page's rows are fetched. Total Hire/Expense/Net
    // P&L are computed server-side across every filtered trip, so they stay
    // accurate even though the browser never holds more than one page of data.
    if (!isAllowed) return;
    setLoading(true);
    tripsApi.getPnlSummary({
      search: debouncedSearch || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
      .then(setSummary)
      .catch(() => showError("Couldn't load trip summary — showing last known data, not necessarily current."))
      .finally(() => setLoading(false));
  }, [debouncedSearch, dateFrom, dateTo, page, refreshKey, isAllowed]);

  // A trip sheet closed, edited, or a trip soft-deleted elsewhere previously
  // left this page's totals/table stale until a manual reload.
  useWebSocketEvent("trip_closed", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));

  function openRow(row: Row) {
    if (detailLoading) return;
    setDetailLoading(true);
    Promise.all([
      tripsApi.get(row.id),
      tripsApi.getSheet(row.id),
      tripsApi.getClosure(row.id).catch(() => undefined),
    ])
      .then(([trip, sheet, closure]) => {
        setSelectedTrip(trip);
        setSelectedSheet(sheet ?? undefined);
        setSelectedClosure(closure);
      })
      .catch(() => showError("Couldn't load this trip's sheet."))
      .finally(() => setDetailLoading(false));
  }

  const rows: Row[] = summary?.rows ?? [];
  const totalCount = summary?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const totalPnl = summary?.total_pnl ?? 0;
  const totalHire = summary?.total_hire ?? 0;
  const totalExpense = summary?.total_expense ?? 0;

  const clearFilters = () => { setDateFrom(""); setDateTo(""); setSearch(""); };
  const hasFilters = !!(dateFrom || dateTo || search);

  if (!isAllowed) return null;
  if (loading && !summary) return <PageSkeleton hasButton={false} hasSearch statCards={3} columns={9} rows={10} />;

  return (
    <div className="flex flex-col gap-6">
      {/* Page title */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Trip Summary</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Profit / Loss breakdown for all completed trip sheets
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button" onClick={() => setShowQuickStart(true)}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-5 text-body-medium text-text-primary shadow-sm transition duration-300 hover:border-accent-border-strong hover:text-accent-text hover:shadow-md"
          >
            <Compass className="h-4 w-4" />
            Quick Start Guide
          </button>
          <button
            type="button" onClick={() => setShowHowCalculated(true)}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-5 text-body-medium text-text-primary shadow-sm transition duration-300 hover:border-accent-border-strong hover:text-accent-text hover:shadow-md"
          >
            <Calculator className="h-4 w-4" />
            How is it Calculated
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Trips", value: String(totalCount), icon: Route, chip: "bg-accent-surface-strong text-accent-text", text: "text-text-primary" },
          { label: "Total Hire", value: fmt(totalHire), icon: Wallet, chip: "bg-teal-surface-strong text-teal-text", text: "text-text-primary" },
          { label: "Total Expense", value: fmt(totalExpense), icon: Calculator, chip: "bg-warning-surface-strong text-warning-text", text: "text-text-primary" },
          {
            label: "Net P&L",
            value: fmt(totalPnl),
            icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
            chip: totalPnl >= 0 ? "bg-success-surface-strong text-success-text" : "bg-danger-surface-strong text-danger-text",
            text: totalPnl >= 0 ? "text-success-text" : "text-danger-text",
          },
        ].map(({ label, value, icon: Icon, chip, text }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-separator-border bg-background-primary-default px-5 py-4 shadow-sm">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${chip}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-caption-2-semibold text-text-secondary">{label}</p>
              <p className={`truncate text-title-2-semibold tabular-nums ${text}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar: search on the left, date range on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trip ID, vehicle or route…" value={search} onChange={setSearch} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-body-medium text-text-secondary transition-colors hover:bg-fill-3 hover:text-text-primary"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
          <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          {/* The designed report (profit_reports.py): by month, category, customer and truck, a sheet per month. */}
          <ReportViewButton
            path="/exports/resource-report"
            filename="Trip_Summary.xlsx"
            title={`Trip Summary Report — ${dateFrom || dateTo ? `${dateFrom ? dateFrom.split("-").reverse().join("-") : "start"} to ${dateTo ? dateTo.split("-").reverse().join("-") : "today"}` : "all time"}${search.trim() ? ` — "${search.trim()}"` : ""}`}
            params={{
              kind: "tripsummary",
              ...(dateFrom ? { from_date: dateFrom } : {}),
              ...(dateTo ? { to_date: dateTo } : {}),
              ...(search.trim() ? { search: search.trim() } : {}),
            }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>

      {/* Table */}
      <div className={`max-h-[75vh] overflow-auto rounded-2xl border border-separator-border bg-background-primary-default shadow-sm transition-opacity ${detailLoading ? "pointer-events-none opacity-60" : ""}`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-text-tertiary">
            <Route className="h-8 w-8 text-text-tertiary" />
            <span>No trips found matching your filters.</span>
          </div>
        ) : (
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-separator-border bg-fill-1">
                {["Trip ID", "Date", "Driver", "Reg. No.", "Route", "Hire Amount", "Total Expense", "P&L", "KM"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-caption-1-semibold text-text-secondary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-accent-surface-strong transition-colors"
                  onClick={() => openRow(r)}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-text-primary">{r.trip_id}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                    {r.scheduled_date
                      ? new Date(r.scheduled_date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }).replace(/\//g, "-")
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{r.driver_name || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{r.truck_registration || "—"}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{r.origin} → {r.destination}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-accent-text">{fmt(r.hire)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{fmt(r.expense)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption-1-semibold tabular-nums ${r.pnl >= 0 ? "bg-success-surface text-success-text" : "bg-danger-surface text-danger-text"}`}>
                      {r.pnl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {fmt(r.pnl)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{r.km > 0 ? `${r.km} km` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-separator-border bg-fill-1 font-semibold">
                <td colSpan={5} className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                  Total ({totalCount} trips)
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-accent-text">{fmt(totalHire)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-primary">{fmt(totalExpense)}</td>
                <td className={`whitespace-nowrap px-4 py-3 ${totalPnl >= 0 ? "text-success-text" : "text-danger-text"}`}>
                  {fmt(totalPnl)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalCount)} of {totalCount} trips
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-separator-border bg-background-primary-default text-text-secondary shadow-sm transition duration-200 hover:border-accent-border-strong hover:text-accent-text disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-text-tertiary text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p as number)}
                    className={`inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-full border px-3 text-body-medium tabular-nums transition duration-200 ${
                      p === safePage
                        ? "border-accent-solid bg-accent-solid text-on-solid shadow-sm"
                        : "border-separator-border bg-background-primary-default text-text-secondary hover:border-accent-border-strong hover:text-accent-text"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-separator-border bg-background-primary-default text-text-secondary shadow-sm transition duration-200 hover:border-accent-border-strong hover:text-accent-text disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Trip sheet popup — sheet/closure are lazy-fetched on row click (see openRow) */}
      <TripSheetDialog
        open={selectedTrip !== null}
        trip={selectedTrip}
        closure={selectedClosure}
        existingSheet={selectedSheet}
        readOnly
        drivers={[]}
        trucks={[]}
        onSubmit={() => {}}
        onClose={() => { setSelectedTrip(null); setSelectedSheet(undefined); setSelectedClosure(undefined); }}
      />

      {showHowCalculated && <HowCalculatedModal onClose={() => setShowHowCalculated(false)} />}
      {showQuickStart && <QuickStartModal onClose={() => setShowQuickStart(false)} />}
    </div>
  );
}
