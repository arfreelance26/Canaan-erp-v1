"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Paperclip, Timer, Undo2, Upload, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { detentionApi, type DetentionRow, type DetentionStatus, type DetentionTotals } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { FileViewer } from "@/components/ui/FileViewer";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { formatDate, formatDateTime, inDateRange, todayIst } from "@/lib/format-date";
import { confirmAction, showError, showSuccess } from "@/lib/swal";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { cn } from "@/lib/utils";

/** Who can open the page (backend: routers/party_halt.py ROLES, plus Admin). */
const ALLOWED_ROLES = ["Admin", "Accounts"];
const MAX_PROOF_BYTES = 15 * 1024 * 1024;
const STATUSES: DetentionStatus[] = ["Not billed", "Missed on invoice", "Billed", "Paid", "Invoice waived"];
const STATUS_STYLE: Record<DetentionStatus, string> = {
  "Not billed": "bg-gray-100 text-gray-700",
  "Missed on invoice": "bg-red-100 text-red-700",
  "Invoice waived": "bg-purple-100 text-purple-700",
  Billed: "bg-blue-100 text-blue-700",
  Paid: "bg-emerald-100 text-emerald-700",
};

function money(v: number): string {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

type PaidForm = { receivedOn: string; amount: string; note: string; proof: File | null };

export default function CustomerDetentionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);
  const isAdmin = user?.softwareDesignation === "Admin";

  const [rows, setRows] = useState<DetentionRow[]>([]);
  const [totals, setTotals] = useState<DetentionTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState<DetentionStatus | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paying, setPaying] = useState<DetentionRow | null>(null);
  const [form, setForm] = useState<PaidForm>({ receivedOn: "", amount: "", note: "", proof: null });
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<DetentionRow | null>(null);

  useEffect(() => {
    if (!isAllowed) router.replace("/");
  }, [isAllowed, router]);

  useEffect(() => {
    if (!isAllowed) return;
    detentionApi.list()
      .then((d) => { setRows(d.rows); setTotals(d.totals); })
      .catch(() => { if (refreshKey === 0) showError("Could not load customer detention."); })
      .finally(() => setLoading(false));
  }, [refreshKey, isAllowed]);
  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);
  useAutoRefresh(reload, 30000);

  const search = searchQuery.trim();
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) =>
      (status === "All" || r.status === status) &&
      inDateRange(r.completedDate, dateFrom, dateTo) &&
      (!q || [r.tripId, r.customer, r.invoiceNo].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [rows, status, search, dateFrom, dateTo]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  function openPay(r: DetentionRow) {
    setPaying(r);
    setForm({ receivedOn: todayIst(), amount: String(r.amount), note: "", proof: null });
  }

  function pickProof(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PROOF_BYTES) {
      showError("The proof can be at most 15 MB.");
      return;
    }
    if (!(file.type === "application/pdf" || file.type.startsWith("image/"))) {
      showError("Only PDF files and images can be uploaded as proof of payment.");
      return;
    }
    setForm((f) => ({ ...f, proof: file }));
  }

  async function savePaid(e: FormEvent) {
    e.preventDefault();
    if (!paying || saving || !form.receivedOn) return;
    setSaving(true);
    try {
      const saved = await detentionApi.markPaid(paying.tripDbId, form);
      setRows((prev) => prev.map((r) => (r.tripDbId === saved.tripDbId ? saved : r)));
      showSuccess(`${saved.tripId} marked as paid.`);
      setPaying(null);
      reload();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Could not save the payment.");
    } finally {
      setSaving(false);
    }
  }

  async function undoPaid(r: DetentionRow) {
    const ok = await confirmAction(`Undo the payment for ${r.tripId}?`, "The payment details and the proof will be removed.", "Yes, undo");
    if (!ok.isConfirmed) return;
    try {
      await detentionApi.undoPaid(r.tripDbId);
      showSuccess(`Payment for ${r.tripId} undone.`);
      reload();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Could not undo the payment.");
    }
  }

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={4} columns={8} />;

  const tiles = totals ? [
    { label: "To recover", value: money(totals.outstandingAmount), sub: `${totals.outstandingTrips} trip${totals.outstandingTrips === 1 ? "" : "s"}`, tone: "text-amber-600", filter: "All" as const },
    { label: "Missed on invoice", value: String(totals.missedOnInvoice), sub: "invoiced without halting charges", tone: totals.missedOnInvoice ? "text-red-600" : "text-gray-900", filter: "Missed on invoice" as const },
    { label: "Billed, awaiting payment", value: String(totals.billedTrips), sub: money(totals.billedAmount), tone: "text-blue-600", filter: "Billed" as const },
    { label: "Paid this month", value: money(totals.paidThisMonth), sub: `${money(totals.paidAmount)} in all`, tone: "text-emerald-600", filter: "Paid" as const },
  ] : [];

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white text-amber-600 shadow-sm">
          <Timer className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Customer Detention</h1>
          <p className="mt-0.5 text-sm text-gray-500">Party halt the driver is paid for, to be recovered from the customer</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setStatus(t.filter)}
            className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-gray-300"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", t.tone)}>{t.value}</p>
            <p className="mt-0.5 text-xs text-gray-500">{t.sub}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by trip ID, customer, or invoice no…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          <DownloadExcelButton
            path="/party-halt/export"
            filename="customer_detention.xlsx"
            title="Customer Detention"
            params={{
              ...(status !== "All" ? { status } : {}),
              ...(search ? { search } : {}),
              ...(dateFrom ? { from_date: dateFrom } : {}),
              ...(dateTo ? { to_date: dateTo } : {}),
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["All", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              status === s ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}
          >
            {s} <span className="ml-1 opacity-70">{counts[s] ?? 0}</span>
          </button>
        ))}
        {(dateFrom || dateTo) && (
          <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="ml-2 text-xs font-medium text-blue-600 hover:text-blue-700">
            Clear dates
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {rows.length === 0 ? "No trips have party halt yet." : "No detention matches these filters."}
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Trip", "Customer", "Completed", "Days", "Amount", "Invoice", "Status", ""].map((h, i) => (
                  <th key={i} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400", (i === 3 || i === 4) && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r) => (
                <tr key={r.tripDbId} className="align-top hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-900">{r.tripId}</td>
                  <td className="max-w-[220px] px-4 py-3 text-gray-700">{r.customer}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDate(r.completedDate)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.partyDays}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{money(r.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {r.invoiceNo ?? "—"}
                    {r.invoiceNo && r.billedAmount > 0 && <span className="block text-[11px] text-gray-400">Halt on invoice {money(r.billedAmount)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", STATUS_STYLE[r.status])}>
                      {r.status === "Paid" && r.paidAmount !== null && r.paidAmount < r.amount ? "Part paid" : r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "Paid" ? (
                      <div className="flex flex-col items-end gap-1 text-right text-xs text-gray-500">
                        <span className="flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {money(r.paidAmount ?? 0)} on {formatDate(r.paidOn)}
                        </span>
                        <span>Saved by <span className="font-medium text-gray-700">{r.paidBy ?? "—"}</span> · {formatDateTime(r.paidSavedAt)}</span>
                        {r.paidNote && <span className="italic">“{r.paidNote}”</span>}
                        <span className="flex items-center gap-3">
                          {r.proofFileName && (
                            <button type="button" onClick={() => setViewing(r)} className="flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
                              <Paperclip className="h-3.5 w-3.5" /> Proof
                            </button>
                          )}
                          {isAdmin && (
                            <button type="button" onClick={() => undoPaid(r)} className="flex items-center gap-1 font-semibold text-gray-500 hover:text-red-600">
                              <Undo2 className="h-3.5 w-3.5" /> Undo
                            </button>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openPay(r)}
                          className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          Mark as Paid
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={paying !== null} onClose={() => !saving && setPaying(null)} title={`Mark ${paying?.tripId ?? ""} as Paid`} className="sm:max-w-md">
        {paying && (
          <form onSubmit={savePaid} className="flex flex-col gap-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">{paying.customer}</p>
              <p className="mt-0.5">{paying.partyDays} party halt day{paying.partyDays === 1 ? "" : "s"} · {money(paying.amount)}{paying.invoiceNo ? ` · ${paying.invoiceNo}` : ""}</p>
            </div>
            <Field label="Date received" required>
              <DatePickerInput required value={form.receivedOn} onChange={(v) => setForm((f) => ({ ...f, receivedOn: v }))} />
            </Field>
            <Field label="Amount received (₹)" required>
              <DecimalInput
                type="number"
                min="0"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className={inputClass}
              />
              {Number(form.amount) > 0 && Number(form.amount) < paying.amount && (
                <span className="mt-1 text-xs text-amber-700">Part payment: {money(paying.amount - Number(form.amount))} less than the detention.</span>
              )}
            </Field>
            <Field label="Note">
              <input value={form.note} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={inputClass} placeholder="e.g. Paid via NEFT" />
            </Field>
            <Field label="Proof of payment (optional)">
              {form.proof ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-gray-700"><Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{form.proof.name}</span></span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, proof: null }))} aria-label="Remove file" className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 hover:bg-gray-50">
                  <Upload className="h-4 w-4" /> Choose a PDF or image (max 15 MB)
                  <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => pickProof(e.target.files?.[0])} />
                </label>
              )}
            </Field>
            <p className="text-xs text-gray-400">Your name and the date and time are saved with the payment.</p>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setPaying(null)} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={saving || !form.receivedOn || !(Number(form.amount) > 0)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Save payment"}
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <FileViewer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        url={viewing ? `detention-proof:${viewing.tripDbId}:${viewing.proofSizeBytes ?? ""}` : ""}
        title={viewing?.proofFileName ?? "Proof of payment"}
        filename={viewing?.proofFileName ?? undefined}
        load={() => detentionApi.fetchProofBlob(viewing!.tripDbId)}
      />
    </div>
  );
}
