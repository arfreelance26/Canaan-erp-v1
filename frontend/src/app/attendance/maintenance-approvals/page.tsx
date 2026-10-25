"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, XCircle, Clock, Wrench, User, FileText, Paperclip, Layers, Route, ClipboardList, Ban } from "lucide-react";
import { maintenanceRequestsApi } from "@/lib/api";
import type { MaintenanceRequest, MaintenanceRequestStatus } from "@/types/maintenance-request";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { confirmAction, showSuccess, showError } from "@/lib/swal";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { Dialog } from "@/components/ui/Dialog";
import { MaintenanceProofsDialog } from "@/components/maintenance/MaintenanceProofsDialog";
import { formatDate, formatDateTime } from "@/lib/format-date";

type Filter = "Pending" | "Approved" | "Rejected" | "all";
const TABS: Filter[] = ["Pending", "Approved", "Rejected", "all"];
const TAB_LABEL: Record<Filter, string> = { Pending: "Pending", Approved: "Approved", Rejected: "Rejected", all: "All" };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatusBadge({ status }: { status: MaintenanceRequestStatus }) {
  if (status === "Approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-bold text-green-700">
        <CheckCircle className="h-3 w-3" /> Approved
      </span>
    );
  if (status === "Rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    );
  if (status === "Cancelled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-600">
        <Ban className="h-3 w-3" /> Withdrawn
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function Detail({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <span className="whitespace-pre-line text-xs font-semibold text-gray-700">{value}</span>
    </div>
  );
}

function RequestCard({
  req, busy, onApprove, onReject, onProofs,
}: {
  req: MaintenanceRequest;
  busy: boolean;
  onApprove: (r: MaintenanceRequest) => void;
  onReject: (r: MaintenanceRequest) => void;
  onProofs: (r: MaintenanceRequest) => void;
}) {
  const fromTrip = req.source === "Trip Sheet";
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">
              {req.registrationNumber || req.truckIdStr}
              <span className="ml-2 align-middle text-[11px] font-medium text-gray-400">{req.truckIdStr}</span>
              <span
                className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-[10px] font-semibold ${
                  fromTrip ? "bg-purple-50 text-purple-700" : "bg-brand-navy/10 text-brand-navy"
                }`}
              >
                {fromTrip ? <Route className="h-3 w-3" /> : <ClipboardList className="h-3 w-3" />}
                {fromTrip ? `Trip Sheet${req.tripIdStr ? ` · ${req.tripIdStr}` : ""}` : "Maintenance form"}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Submitted {req.createdAt ? formatDateTime(req.createdAt) : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums text-gray-900">{rupees(req.cost)}</span>
          <StatusBadge status={req.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <User className="h-3 w-3" /> Submitted By
            </div>
            <p className="text-sm font-semibold text-gray-800">
              {req.submittedByName}
              {req.submittedByRole && <span className="ml-1.5 text-xs font-normal text-gray-400">{req.submittedByRole}</span>}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <Paperclip className="h-3 w-3" /> Proof of Payment
            </div>
            {req.proofCount > 0 ? (
              <button
                type="button"
                onClick={() => onProofs(req)}
                className="flex w-fit items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
              >
                <Paperclip className="h-3 w-3" /> View {req.proofCount} file{req.proofCount === 1 ? "" : "s"}
              </button>
            ) : (
              <p className="text-xs italic text-gray-400">
                {req.status === "Pending" || req.status === "Cancelled" ? "None attached" : req.status === "Approved" ? "Moved to the record" : "—"}
              </p>
            )}
          </div>

          {req.status !== "Pending" && (
            <div className="flex flex-col gap-1">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                <CheckCircle className="h-3 w-3" /> Decision
              </div>
              <p className="text-sm text-gray-700">
                {req.status === "Cancelled" ? "Withdrawn" : req.status}
                {req.decidedByName && <> by <span className="font-semibold">{req.decidedByName}</span></>}
                {req.decidedAt && <span className="text-gray-400"> · {formatDateTime(req.decidedAt)}</span>}
              </p>
              {req.rejectReason && <p className="mt-1 text-xs italic text-gray-500">&ldquo;{req.rejectReason}&rdquo;</p>}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <Layers className="h-3 w-3" /> Record Details
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Detail label="Maintenance Type" value={req.maintenanceType} />
            <Detail label="Repair Type" value={req.repairType} />
            <Detail label="Start Date" value={req.date ? formatDate(req.date) : ""} />
            <Detail label="End Date" value={req.maintenanceEndDate ? formatDate(req.maintenanceEndDate) : ""} />
            <Detail label="Odometer" value={`${req.odometer.toLocaleString("en-IN")} km`} />
            <Detail label="Cost" value={rupees(req.cost)} />
            <Detail label="Location" value={req.maintenanceLocation} />
            <Detail
              label="Maintenance By"
              value={req.maintenanceBy ? `${req.maintenanceBy}${req.maintenanceByType ? ` (${req.maintenanceByType})` : ""}` : ""}
            />
            <Detail label="Invoice Number" value={req.invoiceNumber} />
            <Detail label="Invoice Date" value={req.invoiceDate ? formatDate(req.invoiceDate) : ""} />
            <Detail label="Remind At" value={req.remindAtOdometer ? `${req.remindAtOdometer.toLocaleString("en-IN")} km` : ""} />
            <Detail label="Compliant" value={req.compliant} wide />
            <Detail label="Remarks" value={req.description} wide />
          </div>
        </div>
      </div>

      {req.status === "Pending" && (
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/40 px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(req)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" /> Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(req)}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" /> Approve &amp; Add to Record
          </button>
        </div>
      )}
    </div>
  );
}

export default function MaintenanceApprovalsPage() {
  const { user } = useAuth();
  const canDecide = user?.softwareDesignation === "Admin" || user?.softwareDesignation === "Accounts";

  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [filter, setFilter] = useState<Filter>("Pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<MaintenanceRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [proofsFor, setProofsFor] = useState<MaintenanceRequest | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(() => {
    if (!canDecide) return;
    maintenanceRequestsApi
      .list(filter === "all" ? {} : { status: filter })
      .then((rows) => {
        setRequests(rows);
        if (filter === "Pending") setPendingCount(rows.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    if (filter !== "Pending") {
      maintenanceRequestsApi.list({ status: "Pending" }).then((r) => setPendingCount(r.length)).catch(() => {});
    }
  }, [filter, canDecide]);

  useEffect(() => { load(); }, [load]);
  useWebSocketEvent("maintenance_request_updated", load);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      [r.registrationNumber, r.truckIdStr, r.maintenanceType, r.repairType, r.submittedByName, r.maintenanceBy, r.invoiceNumber, r.tripIdStr ?? ""]
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [requests, search]);

  async function handleApprove(r: MaintenanceRequest) {
    const ok = await confirmAction(
      "Approve this maintenance record?",
      `${r.maintenanceType} · ${rupees(r.cost)} will be added to ${r.registrationNumber || r.truckIdStr}'s record, its running cost and P&L.`,
      "Yes, approve",
    );
    if (!ok.isConfirmed) return;
    setBusyId(r.id);
    try {
      await maintenanceRequestsApi.approve(r.id);
      showSuccess("Approved — the record has been added to the truck.");
      load();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to approve.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject() {
    if (!rejecting || !rejectReason.trim()) return;
    setBusyId(rejecting.id);
    try {
      await maintenanceRequestsApi.reject(rejecting.id, rejectReason.trim());
      showSuccess("Request rejected. The person who submitted it will see your reason.");
      setRejecting(null);
      load();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to reject.");
    } finally {
      setBusyId(null);
    }
  }

  if (!canDecide) {
    return <p className="py-16 text-center text-sm text-gray-500">Only Admin and Accounts can review maintenance approvals.</p>;
  }
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={1} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Maintenance Approvals</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              New maintenance records reach the truck&apos;s record only after approval.
              {pendingCount > 0 && <span className="ml-1 font-semibold text-amber-700">{pendingCount} waiting.</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setLoading(true); setFilter(t); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {TAB_LABEL[t]}
              {t === "Pending" && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-px text-[10px] font-bold text-white">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <PillSearch placeholder="Search by truck, type, vendor, invoice or submitter…" value={search} onChange={setSearch} />

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <FileText className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-600">
            {search ? "No requests match this search" : `No ${filter === "all" ? "" : filter.toLowerCase()} requests`}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Records from the maintenance form and trip-sheet repairs appear here for approval.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((r) => (
            <RequestCard
              key={r.id}
              req={r}
              busy={busyId === r.id}
              onApprove={handleApprove}
              onReject={(x) => { setRejectReason(""); setRejecting(x); }}
              onProofs={setProofsFor}
            />
          ))}
        </div>
      )}

      <Dialog open={rejecting !== null} onClose={() => setRejecting(null)} title="Reject maintenance record">
        {rejecting && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              {rejecting.registrationNumber || rejecting.truckIdStr} · {rejecting.maintenanceType} · {rupees(rejecting.cost)}
              <span className="block text-xs text-gray-400">
                Submitted by {rejecting.submittedByName} — they&apos;ll see this reason and can submit a corrected record.
              </span>
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-gray-700">Reason <span className="text-red-500">*</span></span>
              <textarea
                autoFocus
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Cost doesn't match the invoice"
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none transition placeholder-gray-400 focus:border-red-300 focus:bg-white focus:ring-2 focus:ring-red-100"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={!rejectReason.trim() || busyId === rejecting.id}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {busyId === rejecting.id ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        )}
      </Dialog>

      <MaintenanceProofsDialog
        open={proofsFor !== null}
        recordId={proofsFor?.id ?? null}
        source="request"
        subtitle={proofsFor ? `${proofsFor.registrationNumber} · ${proofsFor.maintenanceType} · ${formatDate(proofsFor.date)}` : undefined}
        canDelete={false}
        onClose={() => setProofsFor(null)}
      />
    </div>
  );
}
