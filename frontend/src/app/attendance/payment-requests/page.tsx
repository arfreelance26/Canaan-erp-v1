"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee, Clock, CircleDollarSign, Check, X, Banknote, Loader2, Upload, ImageIcon } from "lucide-react";
import { paymentRequestsApi } from "@/lib/api";
import type { PaymentRequest } from "@/types/payment-request";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { confirmAction, showError, showSuccess } from "@/lib/swal";
import { formatDateTime } from "@/lib/format-date";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useAuth } from "@/context/AuthContext";

const ALLOWED_ROLES = ["Admin", "Accounts"];

/**
 * A request moves through this pipeline once a colleague has peer-approved it
 * in chat (that's the only way it lands here at all):
 *   pending  — financeStatus NULL, awaiting an Accounts/Admin decision
 *   unpaid   — financeStatus "approved": authorized ("Approve for Payment"),
 *              money hasn't actually moved yet
 *   paid     — financeStatus "paid": actually disbursed, via a separate later
 *              "Mark as Paid" action, only reachable from "unpaid"
 *   rejected — financeStatus "rejected": finance overrode the peer approval
 */
type FilterStatus = "pending" | "unpaid" | "paid" | "rejected";

const STATUS_LABELS: Record<FilterStatus, string> = {
  pending: "Pending",
  unpaid: "Unpaid",
  paid: "Paid",
  rejected: "Rejected",
};

const STATUS_CARDS: {
  status: FilterStatus;
  icon: typeof Check;
  activeClasses: string;
  iconWrapClasses: string;
}[] = [
  {
    status: "pending",
    icon: Clock,
    activeClasses: "border-amber-300 bg-amber-50",
    iconWrapClasses: "bg-amber-100 text-amber-600",
  },
  {
    status: "unpaid",
    icon: CircleDollarSign,
    activeClasses: "border-sky-300 bg-sky-50",
    iconWrapClasses: "bg-sky-100 text-sky-600",
  },
  {
    status: "paid",
    icon: Check,
    activeClasses: "border-emerald-300 bg-emerald-50",
    iconWrapClasses: "bg-emerald-100 text-emerald-600",
  },
  {
    status: "rejected",
    icon: X,
    activeClasses: "border-red-300 bg-red-50",
    iconWrapClasses: "bg-red-100 text-red-500",
  },
];

const STATUS_PILL_CLASSES: Record<FilterStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  unpaid: "bg-sky-50 text-sky-700",
  paid: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
};

function formatRupees(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function statusOf(r: PaymentRequest): FilterStatus {
  if (r.paymentStatus === "rejected") return "rejected"; // rejected by the peer in chat
  if (r.financeStatus === "approved") return "unpaid";
  if (r.financeStatus === "paid") return "paid";
  if (r.financeStatus === "rejected") return "rejected"; // rejected by Accounts/Admin
  return "pending"; // financeStatus is NULL — awaiting an Accounts/Admin decision
}

export default function PaymentRequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.softwareDesignation)) {
      router.replace("/");
    }
  }, [user, router]);

  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FilterStatus | null>("pending");
  const [actingId, setActingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [markPaidTarget, setMarkPaidTarget] = useState<PaymentRequest | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewingProofUrl, setViewingProofUrl] = useState<string | null>(null);
  const [loadingProofId, setLoadingProofId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAllowed) return;
    paymentRequestsApi
      .list()
      .then(setRequests)
      .catch(() => showError("Could not load payment requests."))
      .finally(() => setLoading(false));
  }, [refreshKey, isAllowed]);

  // No dedicated realtime event for this yet — a light poll keeps the queue
  // reasonably fresh without needing a new WebSocket event type just for this.
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 15000);

  const counts = useMemo(() => {
    const base: Record<FilterStatus, number> = { pending: 0, unpaid: 0, paid: 0, rejected: 0 };
    for (const r of requests) base[statusOf(r)] += 1;
    return base;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const sorted = [...requests].sort(
      (a, b) => new Date(b.approvedAt ?? 0).getTime() - new Date(a.approvedAt ?? 0).getTime()
    );
    return statusFilter ? sorted.filter((r) => statusOf(r) === statusFilter) : sorted;
  }, [requests, statusFilter]);

  async function handleDecision(request: PaymentRequest, status: "approved" | "rejected") {
    if (actingId) return;
    const verb = status === "approved" ? "approve this request for payment" : "reject this request";
    const result = await confirmAction(
      status === "approved" ? "Approve for Payment?" : "Reject this request?",
      `₹${formatRupees(request.amount)} requested by ${request.askedByName ?? "this staff member"} — ${verb}. This can't be undone.`,
      status === "approved" ? "Approve for Payment" : "Reject"
    );
    if (!result.isConfirmed) return;

    setActingId(request.id);
    try {
      const updated = await paymentRequestsApi.decide(request.id, status);
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      showSuccess(status === "approved" ? "Approved for payment." : "Request rejected.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not record your decision.");
    } finally {
      setActingId(null);
    }
  }

  function openMarkPaidDialog(request: PaymentRequest) {
    if (actingId) return;
    setMarkPaidTarget(request);
    setProofFile(null);
    setProofPreviewUrl(null);
  }

  function closeMarkPaidDialog() {
    if (submittingProof) return;
    setMarkPaidTarget(null);
    setProofFile(null);
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofPreviewUrl(null);
  }

  function handleProofFileChange(file: File | null) {
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofFile(file);
    setProofPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleConfirmMarkPaid() {
    if (!markPaidTarget || !proofFile || submittingProof) return;
    setSubmittingProof(true);
    try {
      const updated = await paymentRequestsApi.markPaid(markPaidTarget.id, proofFile);
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      showSuccess("Marked as paid.");
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
      setMarkPaidTarget(null);
      setProofFile(null);
      setProofPreviewUrl(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not mark this as paid.");
    } finally {
      setSubmittingProof(false);
    }
  }

  async function handleViewProof(request: PaymentRequest) {
    if (loadingProofId) return;
    setLoadingProofId(request.id);
    try {
      const url = await paymentRequestsApi.getProofBlobUrl(request.id);
      setViewingProofUrl(url);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not load the proof photo.");
    } finally {
      setLoadingProofId(null);
    }
  }

  function closeProofViewer() {
    if (viewingProofUrl) URL.revokeObjectURL(viewingProofUrl);
    setViewingProofUrl(null);
  }

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} statCards={4} columns={7} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Requests</h1>
        <p className="mt-1 text-sm text-gray-500">Review and manage payment requests raised by staff</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_CARDS.map(({ status, icon: Icon, activeClasses, iconWrapClasses }) => {
          const isActive = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === status ? null : status))}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                isActive ? activeClasses : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconWrapClasses}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500">{STATUS_LABELS[status]}</p>
                <p className="text-xl font-bold text-gray-900">{counts[status]}</p>
              </div>
            </button>
          );
        })}
      </div>

      {filteredRequests.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-16 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-navy/10">
            <IndianRupee className="h-6 w-6 text-brand-navy" />
          </div>
          <p className="text-sm font-semibold text-gray-700">
            {statusFilter ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} payment requests` : "No payment requests yet"}
          </p>
          <p className="max-w-sm text-sm text-gray-500">
            Requests appear here once a colleague approves a payment note in Canaan Chat.
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <table className="w-full min-w-[960px] text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Description", "Amount", "Requested By", "Requested At", "Peer Decision By", "Peer Decision At", "Status", "Actions"].map(
                  (col) => (
                    <th key={col} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRequests.map((r) => {
                const status = statusOf(r);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="max-w-[220px] truncate px-4 py-3 text-gray-700" title={r.description}>
                      {r.description || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">₹{formatRupees(r.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.askedByName ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(r.askedAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.approvedByName ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(r.approvedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_PILL_CLASSES[status]}`}>
                        {STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {status === "pending" ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDecision(r, "approved")}
                            disabled={actingId === r.id}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
                          >
                            {actingId === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Banknote className="h-3.5 w-3.5" />
                            )}
                            Approve for Payment
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision(r, "rejected")}
                            disabled={actingId === r.id}
                            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      ) : status === "unpaid" ? (
                        <button
                          type="button"
                          onClick={() => openMarkPaidDialog(r)}
                          disabled={actingId === r.id}
                          className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-60"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Mark as Paid
                        </button>
                      ) : status === "paid" ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{r.paidByName ? `paid by ${r.paidByName}` : "—"}</span>
                          {r.hasProof && (
                            <button
                              type="button"
                              onClick={() => handleViewProof(r)}
                              disabled={loadingProofId === r.id}
                              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
                            >
                              {loadingProofId === r.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ImageIcon className="h-3 w-3" />
                              )}
                              View Proof
                            </button>
                          )}
                        </div>
                      ) : r.paymentStatus === "rejected" ? (
                        <span className="text-xs text-gray-400">
                          {r.approvedByName ? `rejected in chat by ${r.approvedByName}` : "rejected in chat"}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{r.financeDecidedByName ? `by ${r.financeDecidedByName}` : "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {markPaidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={closeMarkPaidDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900">Mark as Paid</h2>
            <p className="mt-1 text-sm text-gray-500">
              Confirm ₹{formatRupees(markPaidTarget.amount)} to {markPaidTarget.askedByName ?? "this staff member"} has
              actually been paid out. A proof-of-payment photo is required and can&apos;t be undone.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleProofFileChange(e.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 transition-colors hover:border-brand-navy/40 hover:bg-brand-navy/5"
            >
              {proofPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proofPreviewUrl} alt="Proof preview" className="max-h-40 rounded-lg object-contain" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span>Click to upload a proof-of-payment photo</span>
                </>
              )}
            </button>
            {proofFile && (
              <p className="mt-2 truncate text-xs text-gray-500" title={proofFile.name}>
                {proofFile.name}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeMarkPaidDialog}
                disabled={submittingProof}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMarkPaid}
                disabled={!proofFile || submittingProof}
                className="flex items-center gap-1.5 rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-navy/90 disabled:opacity-50"
              >
                {submittingProof && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Mark as Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingProofUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={closeProofViewer}
        >
          <button
            type="button"
            onClick={closeProofViewer}
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewingProofUrl}
            alt="Proof of payment"
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
