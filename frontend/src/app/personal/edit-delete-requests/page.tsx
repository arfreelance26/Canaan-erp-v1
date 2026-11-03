"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RiFileShieldLine as FileCheck, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiCheckboxCircleLine as CheckCircle2, RiCloseCircleLine as XCircle, RiTimeLine as Clock, RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import { editApprovalsApi, deletionApprovalsApi, type DeletionApprovalRequest } from "@/lib/api";
import type { EditApprovalRequest } from "@/types/edit-approval";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
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

// A plain <select>'s open dropdown is rendered by the OS/browser, not by us —
// looked noticeably cheaper than everything else on this page, and its native
// arrow box threw off the pill's padding balance. This is a lightweight
// custom version matching the app's dropdown language (e.g. GlassSelect)
// scoped to this page, so neither the trigger's nor the menu's size moves.
// The menu is portaled to document.body (same as GlassSelect) rather than
// simply absolutely-positioned under the trigger — the table card right
// below this toolbar turned out to share a stacking context with it and
// painted on top, burying the menu behind a blank white corner instead of
// showing it. Portaling escapes that regardless of which ancestor caused it.
function StatusFilterPill({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = STATUS_FILTER_OPTIONS.find((o) => o.value === value) ?? STATUS_FILTER_OPTIONS[0];

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuStyle({ position: "fixed", top: rect.bottom + 8, right: window.innerWidth - rect.right, minWidth: rect.width });
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  return (
    <div ref={triggerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 min-w-[150px] items-center justify-between gap-2 rounded-full border bg-background-primary-default px-4 text-body-medium text-text-primary shadow-sm transition duration-200",
          open ? "border-accent-border-strong ring-4 ring-accent-solid/10" : "border-separator-border hover:border-border-button-default hover:shadow-md"
        )}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200", open && "rotate-180 text-accent-text")} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-[9999] w-44 overflow-hidden rounded-xl border border-separator-border bg-background-primary-default p-1 shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
                opt.value === value ? "bg-accent-surface font-semibold text-accent-text" : "text-text-primary hover:bg-fill-2"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

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
          <StatusFilterPill value={status} onChange={setStatus} />
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
              <tbody className="divide-y divide-separator-border">
                {filteredEdit.map((r) => (
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
                ))}
              </tbody>
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
            <tbody className="divide-y divide-separator-border">
              {filteredDelete.map((r) => (
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
