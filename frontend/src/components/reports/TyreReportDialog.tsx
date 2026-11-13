"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { tyreReportApi, type TyreReportCounts } from "@/lib/api";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * The Tyre Records reports from Reports Center — each the same designed
 * report as its page's View (backend tyre_reports.py). Tyre Inventory also
 * takes a status and a brand, both with live counts.
 */

export type TyreKind = "tyre_inventory" | "tyre_management" | "tyre_retread" | "tyre_discarded" | "tyre_archive";

const REPORTS: Record<TyreKind, { title: string; filename: string; about: string; date: string; search: string }> = {
  tyre_inventory: { title: "Tyre Inventory Report", filename: "Tyre_Inventory.xlsx",
    about: "A sheet per status (fitted, in stock, waiting for retread, discarded) with every tyre's cost, km run against its expected range and where it is; money spent; by brand, size, type and vendor.",
    date: "Tyres are picked by their invoice date (else the purchase date).", search: "Tyre no., brand, size, vendor or truck" },
  tyre_management: { title: "Tyre Management Report", filename: "Tyre_Management.xlsx",
    about: "A sheet per truck: each fitted tyre with its km run against its expected range, empty positions, the truck's tyre cost per km, and its fitting history.",
    date: "The tyres fitted are as of today; the period picks which fittings and removals the history lists.", search: "Registration or truck ID" },
  tyre_retread: { title: "Retread Queue Report", filename: "Retread_Queue.xlsx",
    about: "Tyres waiting for retreading and for how long, and the retreads done: who did them, invoice, cost and the new expected range.",
    date: "The period picks the retreads done (the tyres waiting are as of today).", search: "Tyre no., brand or truck" },
  tyre_discarded: { title: "Discarded Tyres Report", filename: "Discarded_Tyres.xlsx",
    about: "Every discarded tyre: why, who and when, the km it gave against its expected range, and what it cost — by reason and by brand.",
    date: "Tyres are picked by the day they were discarded.", search: "Tyre no. or brand" },
  tyre_archive: { title: "Tyre Archive Report", filename: "Tyre_Archive.xlsx",
    about: "Every deleted tyre with who asked, who approved it and why, and the tyre change log: created, edited, deleted, restored.",
    date: "Picked by the day the tyre was deleted, or the change was made.", search: "Tyre no., brand, or who asked" },
};

const STATUSES = ["Fitted", "In stock", "Waiting for retread", "Discarded"];
const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function TyreReportDialog({ kind, onClose }: { kind: TyreKind; onClose: () => void }) {
  const r = REPORTS[kind];
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const [status, setStatus] = useState("");
  const [brand, setBrand] = useState("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<TyreReportCounts | null>(null);
  const { start, end } = period;
  const backwards = !!start && !!end && start > end;
  const term = search.trim();
  const isInventory = kind === "tyre_inventory";

  const dates = { ...(start ? { from_date: start } : {}), ...(end ? { to_date: end } : {}) };
  const params: Record<string, string> = {
    kind, ...dates,
    ...(isInventory && status ? { stage: status } : {}),
    ...(isInventory && brand ? { resource_type: brand } : {}),
    ...(term ? { search: term } : {}),
  };
  const countKey = JSON.stringify(params);

  useEffect(() => {
    if (!isInventory || backwards) return;
    let cancelled = false;
    const id = setTimeout(() => {
      const { kind: _k, ...q } = JSON.parse(countKey) as Record<string, string>;
      void _k;
      tyreReportApi.counts(q).then((c) => { if (!cancelled) setCounts(c); }).catch(() => { if (!cancelled) setCounts(null); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [countKey, isInventory, backwards]);

  const n = (v: number | undefined) => (counts ? ` (${v ?? 0})` : "");
  const brands = Object.keys(counts?.brands ?? {});
  if (brand && !brands.includes(brand)) brands.unshift(brand);
  const span = start || end ? `${start ? dmy(start) : "start"} to ${end ? dmy(end) : "today"}` : "all time";

  return (
    <Dialog open onClose={onClose} title={r.title} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />
        <p className="-mt-3 text-caption-1-regular text-text-tertiary">{r.date}</p>

        {isInventory && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-caption-2-semibold text-text-tertiary">Status</span>
              <GlassSelect aria-label="Status" value={status} onChange={setStatus}
                options={[{ value: "", label: `All${n(counts?.stageTotal)}` }, ...STATUSES.map((s) => ({ value: s, label: `${s}${n(counts?.stages[s])}` }))]} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-caption-2-semibold text-text-tertiary">Brand</span>
              <GlassSelect aria-label="Brand" value={brand} onChange={setBrand}
                options={[{ value: "", label: `All brands${n(counts?.brandTotal)}` }, ...brands.map((b) => ({ value: b, label: `${b}${n(counts?.brands[b])}` }))]} />
            </label>
          </div>
        )}

        <OnlyTheseField value={search} onChange={setSearch} placeholder={r.search} />

        <p className="text-caption-1-regular text-text-tertiary">{r.about}</p>

        <div className="flex items-center justify-end gap-2 border-t border-separator-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-separator-border px-4 text-body-medium text-text-primary transition-colors hover:bg-fill-2"
          >
            Cancel
          </button>
          {backwards ? (
            <span className="text-caption-1-regular text-text-tertiary">Fix the dates to view the report</span>
          ) : (
            <ReportViewButton
              path="/exports/resource-report"
              filename={r.filename}
              title={`${r.title} — ${span}${isInventory && status ? ` — ${status}` : ""}${isInventory && brand ? ` — ${brand}` : ""}${term ? ` — "${term}"` : ""}`}
              params={params}
              pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
