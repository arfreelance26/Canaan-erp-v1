"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiDeleteBinLine as Trash2, RiArrowGoBackLine as RotateCcw, RiUserLine as User, RiShieldCheckLine as ShieldCheck, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil, RiFileList3Line as ClipboardList, RiCheckboxCircleLine as CheckCircle2, RiCloseCircleLine as XCircle } from "@remixicon/react";
import { deletionApprovalsApi, tripsApi, type DeletionApprovalRequest, type TripEditEventRow } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PillSearch } from "@/components/ui/PillSearch";
import { confirmDelete, showSuccess, showError } from "@/lib/feedback";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const ALLOWED_ROLES = ["Admin"];

const EDIT_EVENT_ICON: Record<TripEditEventRow["event"], typeof Plus> = {
  "Booking Created": Plus,
  "Booking Edited": Pencil,
  "Trip Sheet Saved": ClipboardList,
  "Trip Updated": Pencil,
  "Trip Closed": CheckCircle2,
  "Verification Confirmed": CheckCircle2,
  "Verification Rejected": XCircle,
  "Trip Deleted": Trash2,
  "Trip Restored": RotateCcw,
};

const EDIT_EVENT_COLOR: Record<TripEditEventRow["event"], string> = {
  "Booking Created": "bg-accent-surface-strong text-accent-text",
  "Booking Edited": "bg-warning-surface-strong text-warning-text",
  "Trip Sheet Saved": "bg-purple-surface-strong text-purple-text",
  "Trip Updated": "bg-warning-surface-strong text-warning-text",
  "Trip Closed": "bg-success-surface-strong text-success-text",
  "Verification Confirmed": "bg-success-surface-strong text-success-text",
  "Verification Rejected": "bg-danger-surface-strong text-danger-text",
  "Trip Deleted": "bg-danger-surface-strong text-danger-text",
  "Trip Restored": "bg-success-surface-strong text-success-text",
};

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const s = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  return new Date(s).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(/\//g, "-") + " IST";
}

export default function DeletedTripsPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.softwareDesignation)) {
      router.replace("/");
    }
  }, [user, router]);

  const [requests, setRequests] = useState<DeletionApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewing, setViewing] = useState<DeletionApprovalRequest | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TripEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tripsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  async function loadData() {
    try {
      // deletion_approval_requests is a historical audit log — an "Approved" Trip
      // deletion row never changes when that trip is later restored, since it's a
      // record of what happened, not a live status flag. So "currently deleted" is
      // cross-checked against the trip's own live deleted_at (via /trips/deleted-ids)
      // and only rows whose trip is still deleted are shown. A trip deleted, restored,
      // then deleted again would have two Approved rows for the same id — keep only
      // the most recent one so each currently-deleted trip appears exactly once.
      const [approved, deletedIds] = await Promise.all([
        deletionApprovalsApi.list("Approved", "Trip"),
        tripsApi.listDeletedIds(),
      ]);
      const stillDeleted = new Set(deletedIds);
      const latestByTrip = new Map<number, DeletionApprovalRequest>();
      for (const r of approved) {
        if (!stillDeleted.has(r.resourceId)) continue;
        const existing = latestByTrip.get(r.resourceId);
        if (!existing || (r.approvedAt ?? "") > (existing.approvedAt ?? "")) {
          latestByTrip.set(r.resourceId, r);
        }
      }
      setRequests([...latestByTrip.values()]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAllowed) return;
    loadData();
  }, [refreshKey, isAllowed]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("deletion_approval_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_deleted", () => setRefreshKey((k) => k + 1));

  async function handleRestore(req: DeletionApprovalRequest) {
    setActingId(req.id);
    try {
      await tripsApi.restore(String(req.resourceId));
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      showSuccess(`Trip ${req.resourceName} restored — it's back in Trip History.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to restore trip.");
    } finally {
      setActingId(null);
    }
  }

  async function handlePermanentDelete(req: DeletionApprovalRequest) {
    const res = await confirmDelete(
      `Trip ${req.resourceName} and ALL its data (booking sheet, trip sheet, invoice) will be permanently and irreversibly deleted. This cannot be undone.`
    );
    if (!res.isConfirmed) return;
    setActingId(req.id);
    try {
      await tripsApi.removePermanent(String(req.resourceId));
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      showSuccess(`Trip ${req.resourceName} permanently deleted.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to permanently delete trip.");
    } finally {
      setActingId(null);
    }
  }

  // The date range beside View only scopes that export — the table lists every deleted trip.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) =>
        r.requestedByName.toLowerCase().includes(q) ||
        r.resourceName.toLowerCase().includes(q) ||
        (r.approvedByName ?? "").toLowerCase().includes(q)
    );
  }, [requests, search]);

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-danger-border bg-danger-surface text-danger-text shadow-sm">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Deleted Trips</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Audit trail of trips permanently deleted — who requested it, why, and who approved it
            </p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      {/* Toolbar: search on the left, deletion-date range + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch value={search} onChange={setSearch} placeholder="Search by trip, requester, or approver" />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div title="Deleted On — filters the list and the View report to trips deleted in this range">
            <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          </div>
          {/* The designed report: Summary, a sheet per stage, and its PDF (trip_pages_report.py). */}
          <ReportViewButton
            path="/exports/resource-report"
            filename="Deleted_Trips.xlsx"
            title={`Deleted Trips Report — ${exportFrom || exportTo ? `${exportFrom ? exportFrom.split("-").reverse().join("-") : "start"} to ${exportTo ? exportTo.split("-").reverse().join("-") : "today"}` : "all time"}${search.trim() ? ` — "${search.trim()}"` : ""}`}
            params={{ kind: "trips_deleted", ...(exportFrom ? { from_date: exportFrom } : {}), ...(exportTo ? { to_date: exportTo } : {}), ...(search.trim() ? { search: search.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-separator-border bg-background-primary-default shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState size="compact" illustration="not-found" title={requests.length === 0 ? "No trips have been deleted" : "No deleted trips match these filters"} />
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1 text-left text-caption-1-semibold text-text-secondary">
                  <th className="px-4 py-3">Trip</th>
                  <th className="px-4 py-3">Requested By</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Approved By</th>
                  <th className="px-4 py-3">Deleted At</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                {(req) => (
                  <tr key={req.id} className="transition-colors hover:bg-fill-2">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{req.resourceName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-surface-strong">
                          <User className="h-3.5 w-3.5 text-accent-text" />
                        </div>
                        <p className="font-medium text-text-primary">{req.requestedByName}</p>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(req)}
                        className="block max-w-[260px] truncate text-left text-accent-text hover:text-accent-text-strong hover:underline"
                        title="Click to view full details"
                      >
                        {req.reason}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-success-text" />
                        <span className="font-medium text-text-primary">{req.approvedByName ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(req.approvedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={actingId === req.id}
                          onClick={() => handleRestore(req)}
                          className="flex items-center gap-1 rounded-lg border border-success-border bg-success-surface px-2.5 py-1 text-caption-1-semibold text-success-text hover:bg-success-surface-strong transition-colors disabled:opacity-50"
                          title="Put this trip back in Trip History"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={actingId === req.id}
                          onClick={() => handlePermanentDelete(req)}
                          className="flex items-center gap-1 rounded-lg border border-danger-border bg-danger-surface px-2.5 py-1 text-caption-1-semibold text-danger-text hover:bg-danger-surface-strong transition-colors disabled:opacity-50"
                          title="Permanently and irreversibly delete this trip"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Permanently Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </PagedTbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="absolute inset-0 bg-scrim/40" />
          <div className="relative w-full max-w-md rounded-2xl border border-separator-border bg-background-primary-default p-6 shadow-2xl">
            <p className="text-caption-2-semibold text-text-tertiary">Deleted Trip</p>
            <p className="mt-0.5 text-title-3-semibold text-text-primary">{viewing.resourceName}</p>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Requested By</p>
                <p className="mt-0.5 font-medium text-text-primary">{viewing.requestedByName}</p>
              </div>
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Reason for Deletion</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-text-primary">
                  {viewing.reason || "—"}
                </p>
              </div>
              {viewing.adminNote && (
                <div>
                  <p className="text-caption-2-semibold text-text-tertiary">Admin Note</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-warning-text-strong">
                    {viewing.adminNote}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-separator-border pt-3">
                <div>
                  <p className="text-caption-2-semibold text-text-tertiary">Approved By</p>
                  <p className="mt-0.5 font-medium text-text-primary">{viewing.approvedByName ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption-2-semibold text-text-tertiary">Deleted At</p>
                  <p className="mt-0.5 text-text-primary">{formatDate(viewing.approvedAt)}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setViewing(null)}
              className="mt-5 w-full rounded-lg border border-separator-border bg-background-primary-default px-4 py-2 text-body-semibold text-text-secondary hover:bg-fill-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Edit History — every Create/Edit/Sheet/Close/Verify/Delete/Restore
          ever logged, across every trip (the same log shown on Trip
          History), in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by trip ID, driver, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.tripIdStr.toLowerCase().includes(q) ||
              (ev.driverName ?? "").toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "logistics" : "not-found"} title={editHistoryEvents.length === 0 ? "No trip edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Trip</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            {ev.tripIdStr}
                            {ev.driverName && <span className="text-caption-2-regular text-text-tertiary"> ({ev.driverName})</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    }}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
