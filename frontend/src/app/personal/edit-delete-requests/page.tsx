"use client";

import { useEffect, useMemo, useState } from "react";
import { RiFileShieldLine as FileCheck, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiCheckboxCircleLine as CheckCircle2, RiCloseCircleLine as XCircle, RiTimeLine as Clock } from "@remixicon/react";
import { editApprovalsApi, deletionApprovalsApi, type DeletionApprovalRequest } from "@/lib/api";
import type { EditApprovalRequest } from "@/types/edit-approval";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { PagedTbody } from "@/components/ui/PagedTbody";
type Tab = "edit" | "delete";
type StatusFilter = "All" | "Pending" | "Approved" | "Rejected";

const STATUS_CLASS: Record<string, string> = {
  Pending: "bg-warning-surface-strong text-warning-text",
  Approved: "bg-success-surface-strong text-success-text",
  Rejected: "bg-danger-surface-strong text-danger-text",
};

const STATUS_ICON: Record<string, typeof Clock> = {
  Pending: Clock,
  Approved: CheckCircle2,
  Rejected: XCircle,
};

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICON[status] ?? Clock;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", STATUS_CLASS[status] ?? "bg-fill-2 text-text-secondary")}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <EmptyState illustration="all-done" title={text} />
  );
}

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "All", label: "All statuses" },
  { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" },
  { value: "Rejected", label: "Rejected" },
];

export default function EditDeleteRequestsPage() {
  const [tab, setTab] = useState<Tab>("edit");
  const [editRows, setEditRows] = useState<EditApprovalRequest[]>([]);
  const [deleteRows, setDeleteRows] = useState<DeletionApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");

  useEffect(() => {
    Promise.allSettled([editApprovalsApi.getMine(), deletionApprovalsApi.listMine()])
      .then(([e, d]) => {
        if (e.status === "fulfilled") setEditRows(e.value);
        if (d.status === "fulfilled") setDeleteRows(d.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filteredEdit = useMemo(
    () =>
      editRows.filter(
        (r) =>
          (status === "All" || r.status === status) &&
          (!q || r.resourceName.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q))
      ),
    [editRows, status, q]
  );
  const filteredDelete = useMemo(
    () =>
      deleteRows.filter(
        (r) =>
          (status === "All" || r.status === status) &&
          (!q || r.resourceName.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q))
      ),
    [deleteRows, status, q]
  );

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  const th = "px-4 py-3 text-left text-caption-1-semibold text-text-secondary";
  const td = "px-4 py-3 align-top text-sm text-text-primary";

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
          <FileCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Edit &amp; Delete Requests</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Read-only history of the edit and deletion requests you have sent, and their decisions
          </p>
        </div>
      </div>

      {/* Toolbar: search on the left, tab + status filter on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by record or reason…" value={search} onChange={setSearch} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5 rounded-full border border-separator-border bg-background-primary-default p-1 shadow-sm">
            {([
              { key: "edit", label: "Edit Requests", icon: Pencil },
              { key: "delete", label: "Deletion Requests", icon: Trash2 },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-caption-1-semibold transition-colors",
                  tab === key ? "bg-accent-solid text-on-solid" : "text-text-secondary hover:bg-fill-3"
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <GlassSelect variant="pill" aria-label="Status" value={status} onChange={(v) => setStatus(v as StatusFilter)} options={STATUS_FILTER_OPTIONS} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-separator-border bg-background-primary-default">
        {tab === "edit" ? (
          filteredEdit.length === 0 ? (
            <Empty text={editRows.length === 0 ? "You have not sent any edit requests." : "No edit requests match these filters."} />
          ) : (
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="border-b border-separator-border bg-fill-1">
                <tr>
                  <th className={th}>Record</th>
                  <th className={th}>Type</th>
                  <th className={th}>Requested By</th>
                  <th className={th}>Action</th>
                  <th className={th}>Reason</th>
                  <th className={th}>Status</th>
                  <th className={th}>Requested</th>
                  <th className={th}>Decided By</th>
                  <th className={th}>Decided At</th>
                  <th className={th}>Admin Note</th>
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={filteredEdit}>
                {(r) => (
                  <tr key={r.id} className="hover:bg-fill-2">
                    <td className={cn(td, "font-medium text-text-primary")}>{r.resourceName}</td>
                    <td className={td}>{r.resourceType}</td>
                    <td className={td}>{r.staffName}</td>
                    <td className={td}>{r.action}</td>
                    <td className={cn(td, "max-w-[280px] whitespace-normal")}>{r.reason}</td>
                    <td className={td}><StatusBadge status={r.status} /></td>
                    <td className={td}>{formatDateTime(r.createdAt)}</td>
                    <td className={td}>{r.approvedByName ?? "—"}</td>
                    <td className={td}>{formatDateTime(r.approvedAt)}</td>
                    <td className={cn(td, "max-w-[220px] whitespace-normal")}>{r.adminNote ?? "—"}</td>
                  </tr>
                )}
              </PagedTbody>
            </table>
          )
        ) : filteredDelete.length === 0 ? (
          <Empty text={deleteRows.length === 0 ? "You have not sent any deletion requests." : "No deletion requests match these filters."} />
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="border-b border-separator-border bg-fill-1">
              <tr>
                <th className={th}>Record</th>
                <th className={th}>Type</th>
                <th className={th}>Requested By</th>
                <th className={th}>Reason</th>
                <th className={th}>Status</th>
                <th className={th}>Requested</th>
                <th className={th}>Decided By</th>
                <th className={th}>Decided At</th>
                <th className={th}>Admin Note</th>
              </tr>
            </thead>
            <PagedTbody className="divide-y divide-separator-border" items={filteredDelete}>
              {(r) => (
                <tr key={r.id} className="hover:bg-fill-2">
                  <td className={cn(td, "font-medium text-text-primary")}>{r.resourceName}</td>
                  <td className={td}>{r.resourceType}</td>
                  <td className={td}>{r.requestedByName}</td>
                  <td className={cn(td, "max-w-[280px] whitespace-normal")}>{r.reason}</td>
                  <td className={td}><StatusBadge status={r.status} /></td>
                  <td className={td}>{formatDateTime(r.createdAt)}</td>
                  <td className={td}>{r.approvedByName ?? "—"}</td>
                  <td className={td}>{formatDateTime(r.approvedAt)}</td>
                  <td className={cn(td, "max-w-[220px] whitespace-normal")}>{r.adminNote ?? "—"}</td>
                </tr>
              )}
            </PagedTbody>
          </table>
        )}
      </div>
    </div>
  );
}
