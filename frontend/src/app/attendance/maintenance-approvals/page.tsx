"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RiCheckboxCircleLine as CheckCircle, RiCloseCircleLine as XCircle, RiTimeLine as Clock, RiToolsLine as Wrench, RiUserLine as User, RiFileTextLine as FileText, RiAttachment2 as Paperclip, RiStackLine as Layers, RiRouteLine as Route, RiFileList3Line as ClipboardList, RiForbidLine as Ban } from "@remixicon/react";
import { maintenanceRequestsApi } from "@/lib/api";
import type { MaintenanceRequest, MaintenanceRequestStatus } from "@/types/maintenance-request";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { confirmAction, showSuccess, showError } from "@/lib/feedback";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate, formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const MaintenanceProofsDialog = dynamic(() => import("@/components/maintenance/MaintenanceProofsDialog").then((m) => m.MaintenanceProofsDialog));
type Filter = "Pending" | "Approved" | "Rejected" | "all";
const TABS: Filter[] = ["Pending", "Approved", "Rejected", "all"];
const TAB_LABEL: Record<Filter, string> = { Pending: "Pending", Approved: "Approved", Rejected: "Rejected", all: "All" };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatusBadge({ status }: { status: MaintenanceRequestStatus }) {
  if (status === "Approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-success-text">
        <CheckCircle className="h-3 w-3" /> Approved
      </span>
    );
  if (status === "Rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-danger-text">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    );
  if (status === "Cancelled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-fill-2 px-2.5 py-0.5 text-caption-2-semibold text-text-secondary">
        <Ban className="h-3 w-3" /> Withdrawn
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-warning-text">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function Detail({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[9px] font-semibold text-text-tertiary">{label}</span>
      <span className="whitespace-pre-line text-caption-1-semibold text-text-primary">{value}</span>
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
    <div className="overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-separator-border bg-fill-1 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-surface-strong text-accent-text">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <p className="text-body-semibold text-text-primary">
              {req.registrationNumber || req.truckIdStr}
              <span className="ml-2 align-middle text-caption-2-medium text-text-tertiary">{req.truckIdStr}</span>
              <span
                className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-caption-2-semibold ${
                  fromTrip ? "bg-purple-surface text-purple-text" : "bg-accent-solid/10 text-accent-text-strong"
                }`}
              >
                {fromTrip ? <Route className="h-3 w-3" /> : <ClipboardList className="h-3 w-3" />}
                {fromTrip ? `Trip Sheet${req.tripIdStr ? ` · ${req.tripIdStr}` : ""}` : "Maintenance form"}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              Submitted {req.createdAt ? formatDateTime(req.createdAt) : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-title-3-semibold tabular-nums text-text-primary">{rupees(req.cost)}</span>
          <StatusBadge status={req.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="mb-1 flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
              <User className="h-3 w-3" /> Submitted By
            </div>
            <p className="text-body-semibold text-text-primary">
              {req.submittedByName}
              {req.submittedByRole && <span className="ml-1.5 text-caption-1-regular text-text-tertiary">{req.submittedByRole}</span>}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="mb-1 flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
              <Paperclip className="h-3 w-3" /> Proof of Payment
            </div>
            {req.proofCount > 0 ? (
              <button
                type="button"
                onClick={() => onProofs(req)}
                className="flex w-fit items-center gap-1 rounded-full border border-accent-border bg-accent-surface px-2.5 py-0.5 text-caption-1-semibold text-accent-text transition-colors hover:bg-accent-surface-strong"
              >
                <Paperclip className="h-3 w-3" /> View {req.proofCount} file{req.proofCount === 1 ? "" : "s"}
              </button>
            ) : (
              <p className="text-xs text-text-tertiary">
                {req.status === "Pending" || req.status === "Cancelled" ? "None attached" : req.status === "Approved" ? "Moved to the record" : "—"}
              </p>
            )}
          </div>

          {req.status !== "Pending" && (
            <div className="flex flex-col gap-1">
              <div className="mb-1 flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
                <CheckCircle className="h-3 w-3" /> Decision
              </div>
              <p className="text-sm text-text-primary">
                {req.status === "Cancelled" ? "Withdrawn" : req.status}
                {req.decidedByName && <> by <span className="font-semibold">{req.decidedByName}</span></>}
                {req.decidedAt && <span className="text-text-tertiary"> · {formatDateTime(req.decidedAt)}</span>}
              </p>
              {req.rejectReason && <p className="mt-1 text-xs text-text-secondary">&ldquo;{req.rejectReason}&rdquo;</p>}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
          <div className="mb-3 flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
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
        <div className="flex items-center justify-end gap-2 border-t border-separator-border bg-fill-1 px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(req)}
            className="flex items-center gap-1.5 rounded-lg border border-separator-border px-4 py-2 text-body-semibold text-text-secondary transition-colors hover:border-danger-border hover:bg-danger-surface-strong hover:text-danger-text disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" /> Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(req)}
            className="flex items-center gap-1.5 rounded-lg bg-success-solid px-5 py-2 text-body-semibold text-on-solid transition-colors hover:bg-success-solid-hover disabled:opacity-50"
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
    return <p className="py-16 text-center text-sm text-text-secondary">Only Admin and Accounts can review maintenance approvals.</p>;
  }
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={1} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Maintenance Approvals</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              New maintenance records reach the truck&apos;s record only after approval.
              {pendingCount > 0 && <span className="ml-1 font-semibold text-warning-text">{pendingCount} waiting.</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-separator-border bg-fill-1 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setLoading(true); setFilter(t); }}
              className={`rounded-lg px-3 py-1.5 text-caption-1-semibold transition-colors ${
                filter === t ? "bg-background-primary-default text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {TAB_LABEL[t]}
              {t === "Pending" && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-warning-solid px-1.5 py-px text-caption-2-semibold text-on-solid">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <PillSearch placeholder="Search by truck, type, vendor, invoice or submitter…" value={search} onChange={setSearch} />

      {shown.length === 0 ? (
        <EmptyState size="compact" illustration="not-found" title={search ? "No requests match this search" : `No ${filter === "all" ? "" : filter.toLowerCase()} requests`} description="Records from the maintenance form and trip-sheet repairs appear here for approval" className="rounded-2xl border border-separator-border bg-background-primary-default" />
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
            <p className="text-sm text-text-secondary">
              {rejecting.registrationNumber || rejecting.truckIdStr} · {rejecting.maintenanceType} · {rupees(rejecting.cost)}
              <span className="block text-xs text-text-tertiary">
                Submitted by {rejecting.submittedByName} — they&apos;ll see this reason and can submit a corrected record.
              </span>
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-body-semibold text-text-primary">Reason <span className="text-danger-text">*</span></span>
              <textarea
                autoFocus
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Cost doesn't match the invoice"
                className="w-full resize-none rounded-xl border border-separator-border bg-fill-1 px-4 py-3 text-sm text-text-primary outline-none transition placeholder-text-placeholder focus:border-danger-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-danger-border"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded-lg border border-separator-border px-4 py-2 text-body-semibold text-text-secondary transition-colors hover:bg-fill-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={!rejectReason.trim() || busyId === rejecting.id}
                className="rounded-lg bg-danger-solid px-5 py-2 text-body-semibold text-on-solid transition-colors hover:bg-danger-solid-hover disabled:opacity-50"
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
