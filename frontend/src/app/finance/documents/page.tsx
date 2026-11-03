"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiAlertLine as AlertTriangle, RiArrowRightUpLine as ArrowUpRight, RiEyeLine as Eye, RiFileTextLine as FileText, RiFolderOpenLine as FolderOpen, RiLoader4Line as Loader2 } from "@remixicon/react";
import { documentsApi, type DocumentItem } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { formatDate } from "@/lib/format-date";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
import { GlassSelect } from "@/components/ui/GlassSelect";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const FileViewer = dynamic(() => import("@/components/ui/FileViewer").then((m) => m.FileViewer));
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

const TYPE_STYLE: Record<string, string> = {
  maintenance: "bg-accent-surface text-accent-text border-accent-border",
  request: "bg-warning-surface text-warning-text border-warning-border",
  tyre: "bg-success-surface text-success-text border-success-border",
  retread: "bg-teal-surface text-teal-text border-teal-border",
  truck_doc: "bg-purple-surface text-purple-text border-purple-border",
  truck_doc_old: "bg-fill-1 text-text-secondary border-separator-border",
  truck_photo: "bg-teal-surface text-teal-text border-teal-border",
  driver_id: "bg-danger-surface text-danger-text border-danger-border",
  staff_id: "bg-danger-surface text-danger-text border-danger-border",
};

const ALLOWED_ROLES = ["Admin", "Accounts"];

/**
 * Proof and Documents — every proof of payment and document in the app in
 * one searchable list, plus the costs that still have no proof. Read-only:
 * files are attached where the work happens; "Open" goes there. Admin and
 * Accounts only; personal ID documents are Admin only (decided by the server).
 */
export default function ProofAndDocumentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);
  const [tab, setTab] = useState<"all" | "missing">("all");
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [missing, setMissing] = useState<DocumentItem[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewing, setViewing] = useState<DocumentItem | null>(null);

  useEffect(() => {
    if (!isAllowed) router.replace("/");
  }, [isAllowed, router]);

  useEffect(() => {
    if (!isAllowed) return;
    let cancelled = false;
    Promise.all([documentsApi.list(), documentsApi.missing()])
      .then(([d, m]) => {
        if (cancelled) return;
        setItems(d.items);
        setCategories(d.categories);
        setMissing(m);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load documents."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [reloadKey, isAllowed]);
  // A proof added or removed anywhere shows up here.
  const reload = () => setReloadKey((k) => k + 1);
  useWebSocketEvent("maintenance_updated", reload);
  useWebSocketEvent("maintenance_request_updated", reload);
  useWebSocketEvent("tyre_updated", reload);
  useWebSocketEvent("truck_updated", reload);

  const source = tab === "all" ? items : missing;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return source.filter((r) =>
      (!category || r.category === category) &&
      (!fromDate || (r.date ?? "").slice(0, 10) >= fromDate) &&
      (!toDate || ((r.date ?? "").slice(0, 10) || "9999") <= toDate) &&
      (!q || [r.title, r.categoryLabel, r.truckId, r.registrationNumber, r.party, r.invoiceNumber, r.fileName, r.ref, r.uploadedBy]
        .some((v) => (v ?? "").toLowerCase().includes(q))));
  }, [source, search, category, fromDate, toDate]);

  const typeOptions = categories.filter((c) => (tab === "all" ? items : missing).some((r) => r.category === c.key));
  const missingTotal = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  if (!isAllowed) return null;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <FolderOpen className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Proof and Documents</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Every proof of payment and document in one place</p>
          </div>
        </div>
      </div>

      {/* All documents | Missing proof */}
      <div role="tablist" className="flex w-fit gap-0.5 rounded-full border border-separator-border bg-fill-2 p-0.5 shadow-inner">
        {([["all", `All documents (${items.length})`], ["missing", `Missing proof (${missing.length})`]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => { setTab(k); setCategory(""); }}
            className={cn("rounded-full px-4 py-1.5 text-caption-1-semibold transition duration-200",
              tab === k ? "bg-accent-solid text-on-solid shadow" : "text-text-secondary hover:bg-fill-2 hover:text-text-primary")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search invoice no., vendor, truck, tyre, file…" value={search} onChange={setSearch} />
        <GlassSelect
          variant="pill"
          aria-label="Type"
          value={category}
          onChange={setCategory}
          options={[{ value: "", label: "All types" }, ...typeOptions.map((c) => ({ value: c.key, label: c.label }))]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
          <DownloadExcelButton
            path="/documents/export"
            filename={tab === "all" ? "proof_and_documents.xlsx" : "missing_proofs.xlsx"}
            title={tab === "all" ? "Proof and Documents" : "Missing Proofs"}
            params={{
              ...(tab === "missing" ? { missing: "true" } : {}),
              ...(category ? { category } : {}),
              ...(fromDate ? { from_date: fromDate } : {}),
              ...(toDate ? { to_date: toDate } : {}),
            }}
          />
        </div>
      </div>

      {tab === "missing" && rows.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-surface px-4 py-3 text-sm text-warning-text-strong">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {rows.length.toLocaleString("en-IN")} cost{rows.length !== 1 ? "s" : ""} worth {money(missingTotal)} {rows.length !== 1 ? "have" : "has"} no proof of payment yet.
          Use “Open” to go to the record and attach it there.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-text-tertiary" /></div>
      ) : error ? (
        <p className="rounded-xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-text">{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState size="compact" illustration="not-found" title={source.length === 0
              ? tab === "all" ? "No documents have been uploaded yet" : "Every cost has its proof"
              : "Nothing matches these filters"} className="rounded-xl border border-separator-border" />
      ) : (
        <div className="overflow-auto rounded-xl border border-separator-border bg-background-primary-default">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-separator-border bg-fill-1">
              <tr>
                {["Date", "Type", "Document", "Truck", "Vendor / Person", "Invoice / Doc No.", "Amount", tab === "all" ? "File" : "", ""]
                  .filter((h, i) => tab === "all" || i !== 7)
                  .map((h, i) => (
                    <th key={i} className="whitespace-nowrap px-4 py-2.5 text-caption-2-semibold text-text-tertiary">{h}</th>
                  ))}
              </tr>
            </thead>
            <PagedTbody className="divide-y divide-separator-border" items={rows}>
              {(r) => (
                <tr key={r.key} className="transition-colors hover:bg-fill-2">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-text-secondary">{r.date ? formatDate(r.date.slice(0, 10)) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-caption-2-semibold", TYPE_STYLE[r.category] ?? "bg-fill-1 text-text-secondary border-separator-border")}>
                      {r.categoryLabel}
                    </span>
                    {r.status && <span className="mt-0.5 block text-[10px] text-text-tertiary">{r.status}</span>}
                  </td>
                  <td className="max-w-[240px] px-4 py-2.5">
                    <span className="block truncate font-medium text-text-primary" title={r.title}>{r.title}</span>
                    {r.ref && <span className="block truncate text-[11px] text-text-tertiary">{r.ref}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {r.registrationNumber || r.truckId ? (
                      <>
                        <span className="block font-medium text-text-primary">{r.registrationNumber || "—"}</span>
                        {r.truckId && <span className="block text-[11px] text-text-tertiary">{r.truckId}</span>}
                      </>
                    ) : <span className="italic text-text-tertiary">—</span>}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-text-secondary" title={r.party ?? undefined}>{r.party || <span className="italic text-text-tertiary">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                    {r.invoiceNumber || <span className="italic text-text-tertiary">—</span>}
                    {r.invoiceDate && <span className="block text-[11px] text-text-tertiary">{formatDate(r.invoiceDate)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums font-semibold text-accent-text">{r.amount != null ? money(r.amount) : <span className="font-normal italic text-text-tertiary">—</span>}</td>
                  {tab === "all" && (
                    <td className="max-w-[200px] px-4 py-2.5">
                      <span className="block truncate text-text-primary" title={r.fileName ?? undefined}>{r.fileName}</span>
                      <span className="block text-[11px] text-text-tertiary">
                        {[r.sizeBytes ? size(r.sizeBytes) : "", r.uploadedBy ? `by ${r.uploadedBy}` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {tab === "all" && (
                        <button
                          type="button"
                          onClick={() => setViewing(r)}
                          className="inline-flex items-center gap-1 rounded-full border border-accent-border bg-accent-surface px-2.5 py-1 text-caption-2-semibold text-accent-text transition-colors hover:bg-accent-surface-strong"
                        >
                          <Eye className="h-3 w-3" /> View
                        </button>
                      )}
                      {r.link && (
                        <Link
                          href={r.link}
                          title={r.ref ? `Go to ${r.ref}` : "Go to the record"}
                          className="inline-flex items-center gap-1 rounded-full border border-separator-border px-2.5 py-1 text-caption-2-semibold text-text-secondary transition-colors hover:bg-fill-2"
                        >
                          Open <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </PagedTbody>
          </table>
        </div>
      )}

      <FileViewer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        url={viewing ? `document:${viewing.key}:${viewing.sizeBytes ?? ""}` : ""}
        title={viewing ? `${viewing.categoryLabel} — ${viewing.fileName ?? ""}` : "Document"}
        filename={viewing?.fileName ?? undefined}
        load={() => documentsApi.fetchBlob(viewing!.key)}
      />
    </div>
  );
}
