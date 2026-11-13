"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MaintenanceRequestCard, rupees } from "@/components/maintenance/MaintenanceRequestCard";
import { RiCheckboxCircleLine as CheckCircle, RiCloseCircleLine as XCircle, RiToolsLine as Wrench } from "@remixicon/react";
import { maintenanceRequestsApi } from "@/lib/api";
import type { MaintenanceRequest } from "@/types/maintenance-request";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { confirmAction, showSuccess, showError } from "@/lib/feedback";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ApprovalsReport } from "@/lib/approvals-report-pdf";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate, formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const MaintenanceProofsDialog = dynamic(() => import("@/components/maintenance/MaintenanceProofsDialog").then((m) => m.MaintenanceProofsDialog));
type Filter = "Pending" | "Approved" | "Rejected" | "all";
const TABS: Filter[] = ["Pending", "Approved", "Rejected", "all"];
const TAB_LABEL: Record<Filter, string> = { Pending: "Pending", Approved: "Approved", Rejected: "Rejected", all: "All" };

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

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by truck, type, vendor, invoice or submitter…" value={search} onChange={setSearch} />
        <div className="ml-auto">
          {/* The report: Summary + a sheet per status, follows the tab and search (+ its PDF). */}
          <ReportViewButton
            path="/exports/approvals-report"
            filename="Maintenance_Approvals.xlsx"
            title={`Maintenance Approvals Report — all time`}
            params={{ kind: "maintenance", tab: filter, ...(search.trim() ? { search: search.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/approvals-report-pdf").then((m) => m.downloadApprovalsReportPdf({ report: report as ApprovalsReport, filename: file }))}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState size="compact" illustration="not-found" title={search ? "No requests match this search" : `No ${filter === "all" ? "" : filter.toLowerCase()} requests`} description="Records from the maintenance form and trip-sheet repairs appear here for approval" className="rounded-2xl border border-separator-border bg-background-primary-default" />
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((r) => (
            <MaintenanceRequestCard
              key={r.id}
              req={r}
              onProofs={setProofsFor}
              footer={r.status === "Pending" && (
                <>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => { setRejectReason(""); setRejecting(r); }}
                    className="flex items-center gap-1.5 rounded-lg border border-separator-border px-4 py-2 text-body-semibold text-text-secondary transition-colors hover:border-danger-border hover:bg-danger-surface-strong hover:text-danger-text disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => handleApprove(r)}
                    className="flex items-center gap-1.5 rounded-lg bg-success-solid px-5 py-2 text-body-semibold text-on-solid transition-colors hover:bg-success-solid-hover disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" /> Approve &amp; Add to Record
                  </button>
                </>
              )}
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
                Submitted by {rejecting.submittedByName} — they&apos;ll see this reason and can fix it and send it back for re-verification.
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
