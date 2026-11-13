"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { RiEyeLine as Eye, RiLoader4Line as Loader2, RiAlertLine as AlertTriangle } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { documentsApi, trucksApi, type ProofPackSummary } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { problemFromMessage, reportProblem } from "@/lib/connection-problem";
import { showError } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { PeriodFields, PERIOD_PRESETS } from "@/components/reports/PeriodFields";

const FileViewer = dynamic(() => import("@/components/ui/FileViewer").then((m) => m.FileViewer));

/**
 * The Proof Pack from Reports Center: every proof and document in a period
 * as one PDF — a cover, an index with page numbers, then each file behind a
 * header strip naming it (backend proof_pack.py). Filters: period, type,
 * truck; optionally the costs still without proof, and (Admin) ID documents.
 * The count updates as filters change, so a pack that's too big is caught
 * before anything is built.
 */

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-start gap-3 rounded-xl border border-separator-border px-3.5 py-3 text-left transition-colors hover:bg-fill-1"
    >
      <span className={cn("mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-accent-solid" : "bg-fill-3")}>
        <span className={cn("h-4 w-4 rounded-full bg-background-primary-default shadow transition-transform", on && "translate-x-4")} />
      </span>
      <span className="min-w-0">
        <span className="block text-caption-1-semibold text-text-primary">{label}</span>
        <span className="block text-caption-1-regular text-text-tertiary">{hint}</span>
      </span>
    </button>
  );
}

export function ProofPackDialog({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState(() => ({ ...PERIOD_PRESETS[0].fn(), preset: PERIOD_PRESETS[0].label as string }));
  const [category, setCategory] = useState("");
  const [truck, setTruck] = useState("");
  const [withMissing, setWithMissing] = useState(false);
  const [withIds, setWithIds] = useState(false);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [summary, setSummary] = useState<ProofPackSummary | null>(null);
  const [counting, setCounting] = useState(true);
  const [building, setBuilding] = useState(false);
  const [pdf, setPdf] = useState<{ blob: Blob; filename: string } | null>(null);

  const { start, end } = period;
  const backwards = !!start && !!end && start > end;

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (start) p.from_date = start;
    if (end) p.to_date = end;
    if (category) p.category = category;
    if (truck) p.truck = truck;
    if (withMissing) p.include_missing = "true";
    if (withIds) p.include_ids = "true";
    return p;
  }, [start, end, category, truck, withMissing, withIds]);

  useEffect(() => {
    trucksApi.list().then((list) => setTrucks([...list].sort((a, b) => (a.registrationNumber || "").localeCompare(b.registrationNumber || "")))).catch(() => {});
  }, []);

  // The count for these filters (debounced, latest answer wins).
  useEffect(() => {
    if (backwards) return;
    let cancelled = false;
    setCounting(true);
    const id = setTimeout(() => {
      documentsApi.packSummary(params)
        .then((s) => { if (!cancelled) setSummary(s); })
        .catch(() => { if (!cancelled) setSummary(null); })
        .finally(() => { if (!cancelled) setCounting(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [params, backwards]);

  // A type that's no longer offered (ID documents switched off) is cleared.
  useEffect(() => {
    if (category && summary && !summary.categories.some((c) => c.key === category)) setCategory("");
  }, [summary, category]);

  async function build() {
    if (building || backwards || !summary || summary.tooBig || summary.documents === 0) return;
    setBuilding(true);
    try {
      setPdf(await documentsApi.pack(params));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not build the Proof Pack.";
      const problem = problemFromMessage(message);
      if (problem) reportProblem({ ...problem, onRetry: build });
      else showError(message);
    } finally {
      setBuilding(false);
    }
  }

  if (pdf) {
    return (
      <FileViewer
        open
        onClose={() => setPdf(null)}
        url={pdf.filename}
        title="Proof Pack"
        kind="pdf"
        filename={pdf.filename}
        load={() => Promise.resolve(pdf.blob)}
      />
    );
  }

  const empty = !!summary && summary.documents === 0;
  const blocked = backwards || !summary || summary.tooBig || empty;

  return (
    <Dialog open onClose={onClose} title="Proof Pack" className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption-2-semibold text-text-tertiary">Type</span>
            <GlassSelect
              aria-label="Type"
              value={category}
              onChange={setCategory}
              options={[{ value: "", label: "All types" }, ...(summary?.categories ?? []).map((c) => ({ value: c.key, label: c.label }))]}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-caption-2-semibold text-text-tertiary">Truck</span>
            <GlassSelect
              aria-label="Truck"
              value={truck}
              onChange={setTruck}
              options={[{ value: "", label: "All trucks" }, ...trucks.map((t) => ({ value: t.truckId, label: `${t.registrationNumber || t.truckId} · ${t.truckId}` }))]}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <Toggle
            on={withMissing}
            onChange={setWithMissing}
            label="Add the missing proof list"
            hint="A list at the end of the costs in this period that have no proof attached yet."
          />
          {summary?.canIncludeIds && (
            <Toggle
              on={withIds}
              onChange={setWithIds}
              label="Include driver and staff ID documents"
              hint="Aadhaar, licences and identity images. Left out unless you need them; the download is logged."
            />
          )}
        </div>

        {/* What it will hold */}
        <div className={cn(
          "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-caption-1-regular",
          summary?.tooBig ? "bg-warning-surface text-warning-text" : "bg-fill-1 text-text-secondary",
        )}>
          {counting ? (
            <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting…</span>
          ) : backwards ? (
            <span>Fix the dates to see what the pack holds.</span>
          ) : !summary ? (
            <span>Couldn&apos;t count the documents. Check the connection and try again.</span>
          ) : summary.tooBig ? (
            <>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>{summary.documents} documents · {mb(summary.bytes)}</b> is too much for one pack (up to {summary.maxDocuments} files, {mb(summary.maxBytes)}).
                Pick a shorter period, one type or one truck.
              </span>
            </>
          ) : empty ? (
            <span>No documents match these filters.{summary.missing ? ` ${summary.missing} cost${summary.missing === 1 ? "" : "s"} in this period have no proof.` : ""}</span>
          ) : (
            <span>
              <b className="text-text-primary">{summary.documents} document{summary.documents === 1 ? "" : "s"}</b>
              {" · "}{mb(summary.bytes)}
              {summary.amount > 0 && <> · {money(summary.amount)}</>}
              {withMissing && <> · {summary.missing} without proof listed at the end</>}
            </span>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-separator-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-separator-border px-4 py-2 text-body-medium text-text-primary transition-colors hover:bg-fill-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={build}
            disabled={blocked || counting || building}
            className="flex items-center gap-2 rounded-full bg-accent-solid px-5 py-2 text-body-medium text-on-solid shadow-sm transition-colors hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {building ? "Building the pack…" : "View PDF"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
