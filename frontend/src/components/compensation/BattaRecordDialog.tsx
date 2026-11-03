"use client";

import { useEffect, useMemo, useState } from "react";
import { RiBookOpenLine as BookOpen, RiEyeLine as Eye, RiLoader4Line as Loader2, RiErrorWarningLine as WarnIcon } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PillSearch } from "@/components/ui/PillSearch";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";
import { financeApi, type BattaRow } from "@/lib/api";
import { containerLabel } from "@/lib/halt-pay";
import { showError } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import type { CompensationPerson } from "./CompensationTable";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
export type BattaKind = "cleaner" | "workshop" | "workshopAdvance";

/** What differs between the daily records. */
const KIND = {
  cleaner: {
    title: "Cleaner Batta Record",
    feeLabel: "Cleaner Batta Fee",
    amountLabel: "Amount",
    totalLabel: "Total Cleaner Batta",
    totalCardLabel: "Total Cleaner Batta Owed",
    empty: "No attendance days earning Cleaner Batta for this driver.",
    showVehicleType: true,
    showFee: true,
    load: financeApi.getDriverCleanerBatta,
  },
  workshop: {
    title: "Workshop Batta Record",
    feeLabel: "On Workshop Batta Fee",
    amountLabel: "Amount",
    totalLabel: "Total Workshop Batta",
    totalCardLabel: "Total Workshop Batta Owed",
    empty: "No On Workshop days for this driver.",
    showVehicleType: false,
    showFee: true,
    load: financeApi.getDriverWorkshopBatta,
  },
  workshopAdvance: {
    title: "Workshop Advance Record",
    feeLabel: "",
    amountLabel: "Advance Paid",
    totalLabel: "Total Workshop Advance",
    totalCardLabel: "Total Workshop Advance Paid",
    empty: "No workshop advances paid to this driver.",
    showVehicleType: false,
    showFee: false,
    load: financeApi.getDriverWorkshopAdvance,
  },
} as const;

type Props = {
  kind: BattaKind;
  open: boolean;
  onClose: () => void;
  driver: CompensationPerson | null;
  /** Opens Driver Compensation's "How is this Calculated?" guide on this record's tab. */
  onShowGuide?: () => void;
};

type FilterMode = "all" | "thisMonth" | "custom";

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

const STATUS_STYLE: Record<string, string> = {
  Present: "bg-success-surface-strong text-success-text",
  "On Trip": "bg-accent-surface-strong text-accent-text",
  "On Halt": "bg-warning-surface-strong text-warning-text",
  "On Workshop": "bg-purple-surface-strong text-purple-text",
};

/**
 * Driver Compensation → Cleaner Batta Record / Workshop Batta Record: one row
 * per attendance day that earns it, priced at that branch fee (Cleaner Batta
 * Fee / On Workshop Batta Fee) of the branch of the truck driven that day, at
 * the fee that applied that day. View-only — admins handle the payments.
 * Worked out by the backend (finance._daily_batta_rows).
 */
export function BattaRecordDialog({ kind, open, onClose, driver, onShowGuide }: Props) {
  const cfg = KIND[kind];
  const [rows, setRows] = useState<BattaRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[] } | null>(null);
  const [preparing, setPreparing] = useState(false);

  const driverCode = driver?.driverId ?? driver?.id ?? "";

  useEffect(() => {
    if (!open || !driverCode) return;
    setFilterMode("all");
    setCustomFrom("");
    setCustomTo("");
    setSearch("");
    setRows([]);
    setLoading(true);
    cfg.load(driverCode)
      .then((res) => { setRows(res.rows); setStatuses(res.statuses); })
      .catch(() => showError(`Could not load the ${cfg.title}.`))
      .finally(() => setLoading(false));
  }, [open, driverCode, cfg]);

  const visible = useMemo(() => {
    let r = rows;
    if (filterMode !== "all") {
      const { from, to } = filterMode === "thisMonth" ? thisMonthRange() : { from: customFrom, to: customTo };
      r = r.filter((x) => (!from || x.date >= from) && (!to || x.date <= to));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter((x) =>
        [x.status, containerLabel(x.container_specification) ?? "", x.truck_id ?? "", x.truck_registration ?? "", x.branch ?? "", fmtDate(x.date)]
          .some((v) => v.toLowerCase().includes(q)),
      );
    }
    return r;
  }, [rows, filterMode, customFrom, customTo, search]);

  const total = visible.reduce((s, r) => s + r.amount, 0);
  const missing = visible.filter((r) => r.note).length;
  const fileBase = `${cfg.title.replace(/\s+/g, "_")}_${(driver?.name ?? "Driver").replace(/\s+/g, "_")}_${filterMode}`;

  async function openPreview() {
    setPreparing(true);
    try {
      const data: Record<string, string | number>[] = visible.map((r) => ({
        "Date": fmtDate(r.date),
        "Attendance": r.status,
        ...(cfg.showVehicleType ? { "Vehicle Type": containerLabel(r.container_specification) ?? "—" } : {}),
        "Truck Reg": r.truck_registration ?? "—",
        "Truck ID": r.truck_id ?? "—",
        "Truck From": r.truck_source,
        "Branch": r.branch ?? "—",
        ...(cfg.showFee ? { [`${cfg.feeLabel} (Rs)`]: r.rate } : {}),
        [`${cfg.amountLabel} (Rs)`]: r.amount,
        ...(cfg.showFee ? { "Note": r.note ?? "" } : {}),
      }));
      data.push({ "Date": cfg.totalLabel, [`${cfg.amountLabel} (Rs)`]: Number(total.toFixed(2)) });
      const { utils, write } = await import("xlsx");
      const wb = utils.book_new();
      utils.book_append_sheet(wb, utils.json_to_sheet(data), cfg.title);
      const buf = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const header = Object.keys(data[0] ?? {});
      setPreview({
        blob,
        filename: `${fileBase}.xlsx`,
        sheets: [{ name: cfg.title, rows: [header, ...data.map((d) => header.map((h) => String(d[h] ?? "")))] }],
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
        title={`${cfg.title} — ${driver?.name ?? ""}`}
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
        {/* Filters + search + View */}
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
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PillSearch placeholder="Search dates, trucks, branches..." value={search} onChange={setSearch} />
            <button
              type="button"
              onClick={openPreview}
              disabled={visible.length === 0 || preparing}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {preparing ? "Preparing…" : "View"}
            </button>
          </div>
        </div>

        {cfg.showFee && statuses.length > 0 && (
          <p className="mb-3 text-xs text-text-secondary">
            Counts attendance days marked{" "}
            {statuses.map((s, i) => (
              <span key={s}>
                <span className="font-semibold text-text-primary">{s}</span>
                {i < statuses.length - 2 ? ", " : i === statuses.length - 2 ? " or " : ""}
              </span>
            ))}
            .
          </p>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-text-secondary">Loading attendance…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-text-secondary">{cfg.empty}</div>
        ) : visible.length === 0 ? (
          <EmptyState size="compact" illustration="not-found" title="No days match the selected filters" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="max-h-[calc(90vh-320px)] overflow-auto rounded-lg border border-separator-border">
              <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-separator-border bg-fill-1">
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Attendance</th>
                    {cfg.showVehicleType && <th className={thClass}>Vehicle Type</th>}
                    <th className={thClass}>Truck</th>
                    <th className={thClass}>Branch</th>
                    {cfg.showFee && <th className={thRClass}>{cfg.feeLabel}</th>}
                    <th className={thRClass}>{cfg.amountLabel}</th>
                  </tr>
                </thead>
                <PagedTbody className="divide-y divide-separator-border" items={visible}>
                  {(r) => (
                    <tr key={r.date} className={cn("hover:bg-fill-2", r.note && "bg-warning-surface/40")}>
                      <td className="px-3 py-2.5 tabular-nums text-text-primary">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-caption-2-semibold", STATUS_STYLE[r.status] ?? "bg-fill-2 text-text-secondary")}>
                          {r.status}
                        </span>
                      </td>
                      {cfg.showVehicleType && (
                        <td className="px-3 py-2.5 font-medium text-text-primary">{containerLabel(r.container_specification) ?? "—"}</td>
                      )}
                      <td className="px-3 py-2.5">
                        {r.truck_registration ? (
                          <>
                            <span className="font-mono text-text-primary">{r.truck_registration}</span>
                            <span className="ml-1.5 text-[10px] text-text-tertiary">{r.truck_source}</span>
                          </>
                        ) : <span className="text-text-tertiary">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        {r.branch ?? "—"}
                        {r.note && <span className="ml-1.5 text-caption-2-medium inline-flex items-center gap-1 text-warning-text"><WarnIcon className="size-3.5" />{r.note}</span>}
                      </td>
                      {cfg.showFee && <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{fmtCur(r.rate)}</td>}
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-accent-text-strong">{fmtCur(r.amount)}</td>
                    </tr>
                  )}
                </PagedTbody>
              </table>
            </div>

            {/* Summary */}
            <div className={cn("grid grid-cols-1 gap-3", cfg.showFee ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              <div className="rounded-xl border border-separator-border bg-background-primary-default px-4 py-3">
                <p className="text-caption-2-semibold text-text-tertiary">Days counted</p>
                <p className="mt-1 text-title-3-semibold tabular-nums text-text-primary">{visible.length}</p>
              </div>
              {cfg.showFee && (
                <div className={cn("rounded-xl border px-4 py-3", missing > 0 ? "border-warning-border bg-warning-surface/60" : "border-separator-border bg-background-primary-default")}>
                  <p className={cn("text-caption-2-semibold", missing > 0 ? "text-warning-text" : "text-text-tertiary")}>
                    Days without a fee
                  </p>
                  <p className={cn("mt-1 text-title-3-semibold tabular-nums", missing > 0 ? "text-warning-text" : "text-text-primary")}>{missing}</p>
                </div>
              )}
              <div className="rounded-xl bg-accent-solid px-4 py-3">
                <p className="text-caption-2-semibold text-on-solid/60">{cfg.totalCardLabel}</p>
                <p className="mt-1 text-title-3-semibold tabular-nums text-on-solid">{fmtCur(total)}</p>
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
          title={`${cfg.title} — ${driver?.name ?? ""}`}
          filename={preview.filename}
          blob={preview.blob}
          sheets={preview.sheets}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
