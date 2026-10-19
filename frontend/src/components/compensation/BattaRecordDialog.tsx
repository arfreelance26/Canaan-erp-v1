"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Eye, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PillSearch } from "@/components/ui/PillSearch";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";
import { financeApi, type BattaRow } from "@/lib/api";
import { showError } from "@/lib/swal";
import { cn } from "@/lib/utils";
import type { CompensationPerson } from "./CompensationTable";

export type BattaKind = "cleaner" | "workshop";

/** What differs between the two daily batta records. */
const KIND = {
  cleaner: {
    title: "Cleaner Batta Record",
    feeLabel: "Cleaner Batta Fee",
    totalLabel: "Total Cleaner Batta",
    empty: "No attendance days earning Cleaner Batta for this driver.",
    load: financeApi.getDriverCleanerBatta,
  },
  workshop: {
    title: "Workshop Batta Record",
    feeLabel: "On Workshop Batta Fee",
    totalLabel: "Total Workshop Batta",
    empty: "No On Workshop days for this driver.",
    load: financeApi.getDriverWorkshopBatta,
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
  Present: "bg-emerald-100 text-emerald-700",
  "On Trip": "bg-blue-100 text-blue-700",
  "On Halt": "bg-amber-100 text-amber-700",
  "On Workshop": "bg-violet-100 text-violet-700",
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
        [x.status, x.truck_id ?? "", x.truck_registration ?? "", x.branch ?? "", fmtDate(x.date)]
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
        "Truck Reg": r.truck_registration ?? "—",
        "Truck ID": r.truck_id ?? "—",
        "Truck From": r.truck_source,
        "Branch": r.branch ?? "—",
        [`${cfg.feeLabel} (Rs)`]: r.rate,
        "Amount (Rs)": r.amount,
        "Note": r.note ?? "",
      }));
      data.push({ "Date": cfg.totalLabel, "Amount (Rs)": Number(total.toFixed(2)) });
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
      "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
      active ? "bg-brand-navy text-white shadow-sm" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50",
    );
  const thClass = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap text-left";
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
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
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
                <span className="text-gray-400">→</span>
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
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {preparing ? "Preparing…" : "View"}
            </button>
          </div>
        </div>

        {statuses.length > 0 && (
          <p className="mb-3 text-xs text-slate-500">
            Counts attendance days marked{" "}
            {statuses.map((s, i) => (
              <span key={s}>
                <span className="font-semibold text-slate-700">{s}</span>
                {i < statuses.length - 2 ? ", " : i === statuses.length - 2 ? " or " : ""}
              </span>
            ))}
            .
          </p>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading attendance…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">{cfg.empty}</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No days match the selected filters.</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="max-h-[calc(90vh-320px)] overflow-auto rounded-lg border border-gray-200">
              <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Attendance</th>
                    <th className={thClass}>Truck</th>
                    <th className={thClass}>Branch</th>
                    <th className={thRClass}>{cfg.feeLabel}</th>
                    <th className={thRClass}>Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((r) => (
                    <tr key={r.date} className={cn("hover:bg-gray-50", r.note && "bg-amber-50/40")}>
                      <td className="px-3 py-2.5 tabular-nums text-gray-700">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", STATUS_STYLE[r.status] ?? "bg-gray-100 text-gray-600")}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.truck_registration ? (
                          <>
                            <span className="font-mono text-gray-700">{r.truck_registration}</span>
                            <span className="ml-1.5 text-[10px] text-gray-400">{r.truck_source}</span>
                          </>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {r.branch ?? "—"}
                        {r.note && <span className="ml-1.5 text-[10px] font-medium text-amber-600">⚠ {r.note}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtCur(r.rate)}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-brand-navy">{fmtCur(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Days counted</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{visible.length}</p>
              </div>
              <div className={cn("rounded-xl border px-4 py-3", missing > 0 ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white")}>
                <p className={cn("text-[10px] font-semibold uppercase tracking-widest", missing > 0 ? "text-amber-600" : "text-slate-400")}>
                  Days without a fee
                </p>
                <p className={cn("mt-1 text-lg font-bold tabular-nums", missing > 0 ? "text-amber-700" : "text-slate-800")}>{missing}</p>
              </div>
              <div className="rounded-xl bg-brand-navy px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">{cfg.totalLabel} Owed</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-white">{fmtCur(total)}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
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
