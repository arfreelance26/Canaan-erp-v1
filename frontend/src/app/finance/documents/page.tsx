"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Eye, FileText, FolderOpen, Loader2 } from "lucide-react";
import { documentsApi, type DocumentItem } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { FileViewer } from "@/components/ui/FileViewer";
import { formatDate } from "@/lib/format-date";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { cn } from "@/lib/utils";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

const TYPE_STYLE: Record<string, string> = {
  maintenance: "bg-blue-50 text-blue-700 border-blue-100",
  request: "bg-amber-50 text-amber-700 border-amber-100",
  tyre: "bg-emerald-50 text-emerald-700 border-emerald-100",
  retread: "bg-teal-50 text-teal-700 border-teal-100",
  truck_doc: "bg-violet-50 text-violet-700 border-violet-100",
  truck_doc_old: "bg-slate-50 text-slate-600 border-slate-200",
  truck_photo: "bg-sky-50 text-sky-700 border-sky-100",
  driver_id: "bg-rose-50 text-rose-700 border-rose-100",
  staff_id: "bg-rose-50 text-rose-700 border-rose-100",
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
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <FolderOpen className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Proof and Documents</h1>
            <p className="mt-0.5 text-sm text-gray-500">Every proof of payment and document in one place</p>
          </div>
        </div>
      </div>

      {/* All documents | Missing proof */}
      <div role="tablist" className="flex w-fit gap-0.5 rounded-full border border-gray-200 bg-gray-100 p-0.5 shadow-inner">
        {([["all", `All documents (${items.length})`], ["missing", `Missing proof (${missing.length})`]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => { setTab(k); setCategory(""); }}
            className={cn("rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200",
              tab === k ? "bg-brand-navy text-white shadow" : "text-gray-500 hover:bg-white/70 hover:text-gray-800")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search invoice no., vendor, truck, tyre, file…" value={search} onChange={setSearch} />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Type"
          className="h-10 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm outline-none"
        >
          <option value="">All types</option>
          {typeOptions.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
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
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {rows.length.toLocaleString("en-IN")} cost{rows.length !== 1 ? "s" : ""} worth {money(missingTotal)} {rows.length !== 1 ? "have" : "has"} no proof of payment yet.
          Use “Open” to go to the record and attach it there.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <FileText className="h-10 w-10 text-gray-200" />
          <p className="text-sm font-medium text-gray-400">
            {source.length === 0
              ? tab === "all" ? "No documents have been uploaded yet." : "Every cost has its proof. 🎉"
              : "Nothing matches these filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
              <tr>
                {["Date", "Type", "Document", "Truck", "Vendor / Person", "Invoice / Doc No.", "Amount", tab === "all" ? "File" : "", ""]
                  .filter((h, i) => tab === "all" || i !== 7)
                  .map((h, i) => (
                    <th key={i} className="whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key} className="transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">{r.date ? formatDate(r.date.slice(0, 10)) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold", TYPE_STYLE[r.category] ?? "bg-gray-50 text-gray-600 border-gray-200")}>
                      {r.categoryLabel}
                    </span>
                    {r.status && <span className="mt-0.5 block text-[10px] text-slate-400">{r.status}</span>}
                  </td>
                  <td className="max-w-[240px] px-4 py-2.5">
                    <span className="block truncate font-medium text-slate-800" title={r.title}>{r.title}</span>
                    {r.ref && <span className="block truncate text-[11px] text-slate-400">{r.ref}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {r.registrationNumber || r.truckId ? (
                      <>
                        <span className="block font-medium text-slate-800">{r.registrationNumber || "—"}</span>
                        {r.truckId && <span className="block text-[11px] text-slate-400">{r.truckId}</span>}
                      </>
                    ) : <span className="italic text-slate-400">—</span>}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-slate-600" title={r.party ?? undefined}>{r.party || <span className="italic text-slate-400">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                    {r.invoiceNumber || <span className="italic text-slate-400">—</span>}
                    {r.invoiceDate && <span className="block text-[11px] text-slate-400">{formatDate(r.invoiceDate)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums font-semibold text-blue-700">{r.amount != null ? money(r.amount) : <span className="font-normal italic text-slate-400">—</span>}</td>
                  {tab === "all" && (
                    <td className="max-w-[200px] px-4 py-2.5">
                      <span className="block truncate text-slate-700" title={r.fileName ?? undefined}>{r.fileName}</span>
                      <span className="block text-[11px] text-slate-400">
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
                          className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                        >
                          <Eye className="h-3 w-3" /> View
                        </button>
                      )}
                      {r.link && (
                        <Link
                          href={r.link}
                          title={r.ref ? `Go to ${r.ref}` : "Go to the record"}
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                        >
                          Open <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
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
