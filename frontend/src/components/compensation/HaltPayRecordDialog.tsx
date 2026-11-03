"use client";

import { useEffect, useMemo, useState } from "react";
import { RiBookOpenLine as BookOpen, RiEyeLine as Eye, RiLoader4Line as Loader2 } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PillSearch } from "@/components/ui/PillSearch";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";
import { tripsApi } from "@/lib/api";
import { showError } from "@/lib/feedback";
import { haltPayFromClosure } from "@/lib/halt-pay";
import { cn } from "@/lib/utils";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { Truck } from "@/types/truck";
import type { CompensationPerson } from "./CompensationTable";

import { EmptyState } from "@/components/ui/EmptyState";
type Props = {
  open: boolean;
  onClose: () => void;
  driver: CompensationPerson | null;
  trips: Trip[];
  trucks: Truck[];
  /** Opens Driver Compensation's "How is this Calculated?" guide on this record's tab. */
  onShowGuide?: () => void;
};

type FilterMode = "all" | "thisMonth" | "custom";
type HaltType = "Company" | "Party";
type TypeFilter = "All" | HaltType;

const fmtCur = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

type Row = {
  key: string;
  tripId: string;
  completedDate: string;
  truckReg: string;
  truckBranch: string;
  containerSpec: string;
  tripCategory: string;
  route: string;
  haltType: HaltType;
  days: number;
  ratePerDay: number;
  amount: number;
  remarks: string;
};

/**
 * Driver Compensation → Halt Pay Record: every halt on this driver's closed
 * trips — one row per halt type (Company / Party) — and what the driver is
 * owed for it. View-only: admins handle the payments themselves.
 *
 * Amounts come from what was saved at Close Trip: the rate is the total halt
 * compensation ÷ total halt days (the same split the Trip Sheet uses).
 */
export function HaltPayRecordDialog({ open, onClose, driver, trips, trucks, onShowGuide }: Props) {
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [search, setSearch] = useState("");
  // "View" — the same Excel/PDF preview as the rest of the app, built here
  // since these rows are worked out in the browser.
  const [preview, setPreview] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[] } | null>(null);
  const [preparing, setPreparing] = useState(false);

  // Halt days are saved at Close Trip, so every closed trip counts (a trip
  // sheet isn't needed).
  const driverTrips = useMemo(
    () => trips.filter((t) => driver && t.driverId === (driver.driverId ?? driver.id) && t.hasClosure),
    [trips, driver],
  );

  useEffect(() => {
    if (!open || !driver) return;
    setFilterMode("all");
    setCustomFrom("");
    setCustomTo("");
    setTypeFilter("All");
    setSearch("");
    if (driverTrips.length === 0) {
      setClosures(new Map());
      return;
    }
    setLoading(true);
    setClosures(new Map());
    tripsApi.getClosuresBulk(driverTrips.map((t) => t.id))
      .then(setClosures)
      .catch(() => {})
      .finally(() => setLoading(false));
    // Re-fetch only when the dialog opens for a (different) driver.
  }, [open, driver?.id]);

  const allRows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const t of driverTrips) {
      const c = closures.get(t.id);
      if (!c) continue;
      // Each halt type at its own rate (lib/halt-pay — saved parts, or the
      // old equal split for trips closed before the rates were separated).
      const h = haltPayFromClosure(c);
      if (h.companyDays + h.partyDays <= 0) continue;
      const truck = trucks.find((tr) => tr.truckId === t.vehicleId);
      const base = {
        tripId: t.tripId,
        completedDate: c.tripCompletedDate ?? "",
        truckReg: t.truckRegistration ?? "—",
        truckBranch: truck?.branchRegisteredTo || "—",
        containerSpec: t.containerSpecification || "—",
        tripCategory: t.tripCategory || "—",
        route: [t.origin, t.destination].filter(Boolean).join(" → ") || "—",
        remarks: c.haltRemarks ?? "",
      };
      if (h.companyDays > 0) out.push({ ...base, key: `${t.id}-company`, haltType: "Company", days: h.companyDays, ratePerDay: h.companyRate, amount: h.companyPay });
      if (h.partyDays > 0) out.push({ ...base, key: `${t.id}-party`, haltType: "Party", days: h.partyDays, ratePerDay: h.partyRate, amount: h.partyPay });
    }
    return out.sort((a, b) => (a.completedDate < b.completedDate ? 1 : a.completedDate > b.completedDate ? -1 : 0));
  }, [driverTrips, closures, trucks]);

  const rows = useMemo<Row[]>(() => {
    let r = allRows;
    if (typeFilter !== "All") r = r.filter((x) => x.haltType === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter((x) =>
        [x.tripId, x.truckReg, x.truckBranch, x.containerSpec, x.tripCategory, x.route, x.haltType, x.remarks]
          .some((v) => v.toLowerCase().includes(q)),
      );
    }
    if (filterMode === "all") return r;
    const { from, to } = filterMode === "thisMonth" ? thisMonthRange() : { from: customFrom, to: customTo };
    if (!from && !to) return r;
    return r.filter((x) => {
      if (!x.completedDate) return false;
      if (from && x.completedDate < from) return false;
      if (to && x.completedDate > to) return false;
      return true;
    });
  }, [allRows, typeFilter, search, filterMode, customFrom, customTo]);

  const companyTotal = rows.filter((r) => r.haltType === "Company").reduce((s, r) => s + r.amount, 0);
  const partyTotal = rows.filter((r) => r.haltType === "Party").reduce((s, r) => s + r.amount, 0);
  const totalOwed = companyTotal + partyTotal;
  const totalDays = rows.reduce((s, r) => s + r.days, 0);

  const fileBase = `Halt_Pay_Record_${(driver?.name ?? "Driver").replace(/\s+/g, "_")}_${filterMode}`;

  async function openPreview() {
    setPreparing(true);
    try {
      const data: Record<string, string | number>[] = rows.map((r) => ({
        "Trip ID": r.tripId,
        "Completed": fmtDate(r.completedDate),
        "Truck Reg": r.truckReg,
        "Branch": r.truckBranch,
        "Container": r.containerSpec,
        "Trip Category": r.tripCategory,
        "Route": r.route,
        "Halt Type": r.haltType,
        "Days": r.days,
        "Rate / Day (Rs)": Number(r.ratePerDay.toFixed(2)),
        "Amount Owed (Rs)": Number(r.amount.toFixed(2)),
        "Halt Remarks": r.remarks,
      }));
      data.push({ "Trip ID": "Company Halt Total", "Amount Owed (Rs)": Number(companyTotal.toFixed(2)) });
      data.push({ "Trip ID": "Party Halt Total", "Amount Owed (Rs)": Number(partyTotal.toFixed(2)) });
      data.push({ "Trip ID": "Total Owed to Driver", "Amount Owed (Rs)": Number(totalOwed.toFixed(2)) });

      const { utils, write } = await import("xlsx");
      const wb = utils.book_new();
      utils.book_append_sheet(wb, utils.json_to_sheet(data), "Halt Pay Record");
      const buf = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const header = Object.keys(data[0] ?? {});
      setPreview({
        blob,
        filename: `${fileBase}.xlsx`,
        sheets: [{ name: "Halt Pay Record", rows: [header, ...data.map((d) => header.map((h) => String(d[h] ?? "")))] }],
      });
    } catch {
      showError("Could not prepare the export.");
    } finally {
      setPreparing(false);
    }
  }

  const pill = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-caption-1-semibold transition-colors",
      active ? "bg-accent-solid text-on-solid shadow-sm" : "border border-border-button-default bg-background-primary-default text-text-secondary hover:bg-fill-2",
    );
  const thClass = "px-3 py-2.5 text-caption-2-semibold text-text-secondary whitespace-nowrap text-left";
  const thRClass = `${thClass} text-right`;

  return (
    <>
    <Dialog
      open={open}
      onClose={onClose}
      title={`Halt Pay Record — ${driver?.name ?? ""}`}
      className="w-[95vw] max-w-[95vw] h-[90vh]"
      headerRight={onShowGuide ? (
        <button
          type="button"
          onClick={onShowGuide}
          className="flex items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-secondary transition-colors hover:border-border-button-default hover:bg-fill-2 hover:text-text-primary"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Full guide
        </button>
      ) : undefined}
    >
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setFilterMode("all")} className={pill(filterMode === "all")}>All</button>
          <button type="button" onClick={() => setFilterMode("thisMonth")} className={pill(filterMode === "thisMonth")}>This Month</button>
          <button type="button" onClick={() => setFilterMode("custom")} className={pill(filterMode === "custom")}>Custom Range</button>
          {filterMode === "custom" && (
            <div className="flex items-center gap-2 text-sm">
              <DatePickerInput value={customFrom} onChange={setCustomFrom} />
              <span className="text-text-tertiary">→</span>
              <DatePickerInput value={customTo} onChange={setCustomTo} />
            </div>
          )}
          <span className="mx-1 h-5 w-px bg-fill-3" />
          {(["All", "Company", "Party"] as TypeFilter[]).map((t) => (
            <button key={t} type="button" onClick={() => setTypeFilter(t)} className={pill(typeFilter === t)}>
              {t === "All" ? "All Halts" : `${t} Halt`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PillSearch placeholder="Search trips, trucks, routes..." value={search} onChange={setSearch} />
          <button
            type="button"
            onClick={openPreview}
            disabled={rows.length === 0 || preparing}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {preparing ? "Preparing…" : "View"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-text-secondary">Loading halt data…</div>
      ) : allRows.length === 0 ? (
        <EmptyState size="compact" illustration="logistics" title="No halts recorded on this driver&apos;s closed trips" />
      ) : rows.length === 0 ? (
        <EmptyState size="compact" illustration="not-found" title="No halts match the selected filters" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="max-h-[calc(90vh-300px)] overflow-auto rounded-lg border border-separator-border">
            <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1">
                  <th className={thClass}>Trip ID</th>
                  <th className={thClass}>Completed</th>
                  <th className={thClass}>Truck Reg</th>
                  <th className={thClass}>Branch</th>
                  <th className={thClass}>Container</th>
                  <th className={thClass}>Trip Category</th>
                  <th className={thClass}>Route</th>
                  <th className={thClass}>Halt Type</th>
                  <th className={thRClass}>Days</th>
                  <th className={thRClass}>Rate / Day</th>
                  <th className={thRClass}>Amount Owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-fill-2" title={r.remarks ? `Halt remarks: ${r.remarks}` : undefined}>
                    <td className="px-3 py-2.5 font-medium text-accent-text-strong">{r.tripId}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{fmtDate(r.completedDate)}</td>
                    <td className="px-3 py-2.5 font-mono text-text-primary">{r.truckReg}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{r.truckBranch}</td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 text-text-secondary">{r.containerSpec}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{r.tripCategory}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-text-primary" title={r.route}>{r.route}</td>
                    <td className="px-3 py-2.5">
                      {r.haltType === "Company" ? (
                        <span className="rounded-full bg-fill-2 px-2 py-0.5 text-caption-2-semibold text-text-secondary">Company</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-2-semibold text-warning-text">Party</span>
                          <span className="text-[10px] text-warning-text">recoverable from customer</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-primary">{r.days}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{fmtCur(r.ratePerDay)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-accent-text-strong">{fmtCur(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-separator-border bg-background-primary-default px-4 py-3">
              <p className="text-caption-2-semibold text-text-tertiary">Company Halt</p>
              <p className="mt-1 text-title-3-semibold tabular-nums text-text-primary">{fmtCur(companyTotal)}</p>
            </div>
            <div className="rounded-xl border border-warning-border bg-warning-surface/60 px-4 py-3">
              <p className="text-caption-2-semibold text-warning-text">Party Halt · recoverable from customer</p>
              <p className="mt-1 text-title-3-semibold tabular-nums text-warning-text">{fmtCur(partyTotal)}</p>
            </div>
            <div className="rounded-xl bg-accent-solid px-4 py-3">
              <p className="text-caption-2-semibold text-on-solid/60">
                Total Owed to Driver · {totalDays} day{totalDays === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-title-3-semibold tabular-nums text-on-solid">{fmtCur(totalOwed)}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-button-default px-4 py-2 text-body-semibold text-text-primary hover:bg-fill-2"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Dialog>
    {preview && (
      <ExportPreviewDialog
        title={`Halt Pay Record — ${driver?.name ?? ""}`}
        filename={preview.filename}
        blob={preview.blob}
        sheets={preview.sheets}
        onClose={() => setPreview(null)}
      />
    )}
    </>
  );
}
