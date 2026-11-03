"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArchiveLine as ArchiveIcon, RiArrowGoBackLine as RotateCcw, RiDeleteBinLine as Trash2, RiUserLine as User, RiShieldCheckLine as ShieldCheck, RiProfileLine as IdCard, RiTruckLine as TruckIcon, RiGroupLine as Users, RiBuilding2Line as Building2, RiShakeHandsLine as Handshake, RiStore2Line as Warehouse, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil, type RemixiconComponentType as LucideIcon } from "@remixicon/react";
import { deletionApprovalsApi, driversApi, trucksApi, staffApi, customersApi, vendorsApi, cfsYardApi, type DeletionApprovalRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { confirmDelete, showSuccess, showError } from "@/lib/feedback";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const ALLOWED_ROLES = ["Admin"];

type ArchivedResource = "Driver" | "Truck" | "Staff" | "Customer" | "Vendor" | "CfsYardEntry";
type ArchiveRow = DeletionApprovalRequest & { kind: ArchivedResource };

type KindConfig = {
  label: string;
  homeLabel: string;
  icon: LucideIcon;
  badgeClass: string;
  api: {
    restore: (id: string) => Promise<unknown>;
    removePermanent: (id: string) => Promise<void>;
    listDeletedIds: () => Promise<number[]>;
  };
};

const KIND_CONFIG: Record<ArchivedResource, KindConfig> = {
  Driver: { label: "Driver", homeLabel: "Our Drivers", icon: IdCard, badgeClass: "bg-purple-surface text-purple-text", api: driversApi },
  Truck: { label: "Truck", homeLabel: "Our Fleet", icon: TruckIcon, badgeClass: "bg-warning-surface text-warning-text", api: trucksApi },
  Staff: { label: "Staff", homeLabel: "Our Staff", icon: Users, badgeClass: "bg-success-surface text-success-text", api: staffApi },
  Customer: { label: "Customer", homeLabel: "Our Customers", icon: Building2, badgeClass: "bg-accent-surface text-accent-text", api: customersApi },
  Vendor: { label: "Vendor", homeLabel: "Our Vendors", icon: Handshake, badgeClass: "bg-purple-surface text-purple-text", api: vendorsApi },
  CfsYardEntry: { label: "CFS/Yard", homeLabel: "the CFS/Yard Directory", icon: Warehouse, badgeClass: "bg-teal-surface text-teal-text", api: cfsYardApi },
};
const ARCHIVED_KINDS: ArchivedResource[] = ["Driver", "Truck", "Staff", "Customer", "Vendor", "CfsYardEntry"];
const PLURAL_LABEL: Record<ArchivedResource, string> = {
  Driver: "Drivers", Truck: "Trucks", Staff: "Staff", Customer: "Customers", Vendor: "Vendors", CfsYardEntry: "CFS/Yard",
};

// A unified row across all 5 entities' own edit-event logs (DriverEditEvent,
// TruckEditEvent, StaffEditEvent, CustomerEditEvent, VendorEditEvent) — each
// already exists and already logs Create/Edit/Delete/Restore, this page just
// merges and displays them in one combined log, same reuse pattern as Tyre
// Archive reusing Tyre Inventory's log.
type CombinedEditEvent = {
  id: string;
  kind: ArchivedResource;
  name: string;
  event: string;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

function iconForEvent(event: string) {
  if (event.endsWith("Created")) return Plus;
  if (event.endsWith("Edited")) return Pencil;
  if (event.endsWith("Deleted")) return Trash2;
  if (event.endsWith("Restored")) return RotateCcw;
  return Pencil;
}

function colorForEvent(event: string) {
  if (event.endsWith("Created")) return "bg-accent-surface-strong text-accent-text";
  if (event.endsWith("Edited")) return "bg-warning-surface-strong text-warning-text";
  if (event.endsWith("Deleted")) return "bg-danger-surface-strong text-danger-text";
  if (event.endsWith("Restored")) return "bg-success-surface-strong text-success-text";
  return "bg-fill-2 text-text-primary";
}

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

export default function ArchivePage() {
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

  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"All" | ArchivedResource>("All");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewing, setViewing] = useState<ArchiveRow | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<CombinedEditEvent[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");
  const [editHistoryKindFilter, setEditHistoryKindFilter] = useState<"All" | ArchivedResource>("All");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    Promise.allSettled([
      driversApi.listEditEvents(),
      trucksApi.listEditEvents(),
      staffApi.listEditEvents(),
      customersApi.listEditEvents(),
      vendorsApi.listEditEvents(),
    ])
      .then(([drivers, trucks, staff, customers, vendors]) => {
        const combined: CombinedEditEvent[] = [];
        if (drivers.status === "fulfilled") {
          for (const e of drivers.value) combined.push({ id: `Driver-${e.id}`, kind: "Driver", name: e.driverName, event: e.event, actorName: e.actorName, actorRole: e.actorRole, createdAt: e.createdAt });
        }
        if (trucks.status === "fulfilled") {
          for (const e of trucks.value) combined.push({ id: `Truck-${e.id}`, kind: "Truck", name: e.registrationNumber, event: e.event, actorName: e.actorName, actorRole: e.actorRole, createdAt: e.createdAt });
        }
        if (staff.status === "fulfilled") {
          for (const e of staff.value) combined.push({ id: `Staff-${e.id}`, kind: "Staff", name: e.staffName, event: e.event, actorName: e.actorName, actorRole: e.actorRole, createdAt: e.createdAt });
        }
        if (customers.status === "fulfilled") {
          for (const e of customers.value) combined.push({ id: `Customer-${e.id}`, kind: "Customer", name: e.customerName, event: e.event, actorName: e.actorName, actorRole: e.actorRole, createdAt: e.createdAt });
        }
        if (vendors.status === "fulfilled") {
          for (const e of vendors.value) combined.push({ id: `Vendor-${e.id}`, kind: "Vendor", name: e.vendorName, event: e.event, actorName: e.actorName, actorRole: e.actorRole, createdAt: e.createdAt });
        }
        combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setEditHistoryEvents(combined);
      })
      .finally(() => setEditHistoryLoading(false));
  }

  async function loadData() {
    try {
      // Same cross-check pattern as "Deleted Trips": deletion_approval_requests is a
      // historical audit log that never changes on restore, so "currently archived" is
      // verified against each resource's own live deleted_at (via /{resource}/deleted-ids).
      // Keep only the most recent Approved row per resource id, in case it was archived,
      // restored, then archived again.
      //
      // Each kind is fetched independently (allSettled, not Promise.all) so a transient
      // failure on one resource type (e.g. Vendor) can't blank out the other four kinds'
      // data — and a fully failed load keeps showing the last-known-good rows instead of
      // silently rendering the "archive is empty" state.
      const settled = await Promise.allSettled(
        ARCHIVED_KINDS.map((kind) =>
          Promise.all([deletionApprovalsApi.list("Approved", kind), KIND_CONFIG[kind].api.listDeletedIds()])
        )
      );

      const failedKinds: ArchivedResource[] = [];
      const latest = new Map<string, ArchiveRow>();
      settled.forEach((result, i) => {
        const kind = ARCHIVED_KINDS[i];
        if (result.status === "rejected") {
          failedKinds.push(kind);
          // Preserve whatever rows we already had for this kind rather than dropping them.
          for (const row of rows) {
            if (row.kind === kind) latest.set(`${kind}:${row.resourceId}`, row);
          }
          return;
        }
        const [reqs, deletedIds] = result.value;
        const stillDeleted = new Set(deletedIds);
        for (const r of reqs as DeletionApprovalRequest[]) {
          if (!stillDeleted.has(r.resourceId)) continue;
          const key = `${kind}:${r.resourceId}`;
          const existing = latest.get(key);
          if (!existing || (r.approvedAt ?? "") > (existing.approvedAt ?? "")) {
            latest.set(key, { ...r, kind });
          }
        }
      });

      setRows([...latest.values()]);
      if (failedKinds.length > 0) {
        showError(`Couldn't refresh ${failedKinds.join(", ")} archive data — showing last known list.`);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAllowed) return;
    loadData();
  }, [refreshKey, isAllowed]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("driver_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("customer_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("vendor_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("deletion_approval_updated", () => setRefreshKey((k) => k + 1));

  async function handleRestore(row: ArchiveRow) {
    setActingId(row.id);
    try {
      await KIND_CONFIG[row.kind].api.restore(String(row.resourceId));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showSuccess(`${KIND_CONFIG[row.kind].label} ${row.resourceName} restored — it's back in ${KIND_CONFIG[row.kind].homeLabel}.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : `Failed to restore ${KIND_CONFIG[row.kind].label.toLowerCase()}.`);
    } finally {
      setActingId(null);
    }
  }

  async function handlePermanentDelete(row: ArchiveRow) {
    const res = await confirmDelete(
      `${KIND_CONFIG[row.kind].label} ${row.resourceName} and ALL its data will be permanently and irreversibly deleted. This cannot be undone.`
    );
    if (!res.isConfirmed) return;
    setActingId(row.id);
    try {
      await KIND_CONFIG[row.kind].api.removePermanent(String(row.resourceId));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showSuccess(`${KIND_CONFIG[row.kind].label} ${row.resourceName} permanently deleted.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : `Failed to permanently delete ${KIND_CONFIG[row.kind].label.toLowerCase()}.`);
    } finally {
      setActingId(null);
    }
  }

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter !== "All") list = list.filter((r) => r.kind === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.requestedByName.toLowerCase().includes(q) ||
          r.resourceName.toLowerCase().includes(q) ||
          (r.approvedByName ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, typeFilter, search]);

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-separator-border bg-fill-1 text-text-secondary shadow-sm">
            <ArchiveIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Archive</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Staff, drivers, trucks, customers, and vendors removed from the Resource Hub — restore them or permanently delete
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

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by name, requester, or approver" value={search} onChange={setSearch} />
        <div className="flex gap-1.5 rounded-lg border border-separator-border bg-background-primary-default p-1">
          {(["All", ...ARCHIVED_KINDS] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-md px-3 py-1.5 text-caption-1-semibold transition-colors ${
                typeFilter === t ? "bg-accent-solid text-on-solid" : "text-text-secondary hover:bg-fill-3"
              }`}
            >
              {t === "All" ? "All" : PLURAL_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DownloadExcelButton
            path="/deletion-approvals/archive-export"
            params={typeFilter === "All" ? undefined : { resource_type: typeFilter }}
            filename={typeFilter === "All" ? "archive.xlsx" : `archive_${typeFilter.toLowerCase()}.xlsx`}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-separator-border bg-background-primary-default shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState size="compact" illustration="not-found" title={rows.length === 0 ? "The archive is empty" : "No archived items match this search"} />
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1 text-left text-caption-1-semibold text-text-secondary">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Deleted By</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Approved By</th>
                  <th className="px-4 py-3">Deletion Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                {(row) => (
                  <tr key={`${row.kind}-${row.id}`} className="transition-colors hover:bg-fill-2">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-1-semibold ${KIND_CONFIG[row.kind].badgeClass}`}
                      >
                        {(() => {
                          const KindIcon = KIND_CONFIG[row.kind].icon;
                          return <KindIcon className="h-3 w-3" />;
                        })()}
                        {KIND_CONFIG[row.kind].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{row.resourceName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-surface-strong">
                          <User className="h-3.5 w-3.5 text-accent-text" />
                        </div>
                        <p className="font-medium text-text-primary">{row.requestedByName}</p>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(row)}
                        className="block max-w-[260px] truncate text-left text-accent-text hover:text-accent-text-strong hover:underline"
                        title="Click to view full details"
                      >
                        {row.reason}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-success-text" />
                        <span className="font-medium text-text-primary">{row.approvedByName ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.approvedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => handleRestore(row)}
                          className="flex items-center gap-1 rounded-lg border border-success-border bg-success-surface px-2.5 py-1 text-caption-1-semibold text-success-text hover:bg-success-surface-strong transition-colors disabled:opacity-50"
                          title={`Put this ${KIND_CONFIG[row.kind].label.toLowerCase()} back in ${KIND_CONFIG[row.kind].homeLabel}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => handlePermanentDelete(row)}
                          className="flex items-center gap-1 rounded-lg border border-danger-border bg-danger-surface px-2.5 py-1 text-caption-1-semibold text-danger-text hover:bg-danger-surface-strong transition-colors disabled:opacity-50"
                          title={`Permanently and irreversibly delete this ${KIND_CONFIG[row.kind].label.toLowerCase()}`}
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
            <p className="text-caption-2-semibold text-text-tertiary">Archived {viewing.kind}</p>
            <p className="mt-0.5 text-title-3-semibold text-text-primary">{viewing.resourceName}</p>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Deleted By</p>
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
                  <p className="text-caption-2-semibold text-text-tertiary">Deletion Date</p>
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

      {/* Edit History — combines every Create/Edit/Delete/Restore ever
          logged, across Drivers, Trucks, Staff, Customers, and Vendors (each
          entity's own log, already shown on its own page), into one
          searchable, filterable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <PillSearch placeholder="Search by name or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
            <div className="flex gap-1.5 rounded-lg border border-separator-border bg-background-primary-default p-1">
              {(["All", ...ARCHIVED_KINDS] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEditHistoryKindFilter(t)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-caption-1-semibold transition-colors",
                    editHistoryKindFilter === t ? "bg-accent-solid text-on-solid" : "text-text-secondary hover:bg-fill-3"
                  )}
                >
                  {t === "All" ? "All" : PLURAL_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              (editHistoryKindFilter === "All" || ev.kind === editHistoryKindFilter) &&
              (!q || ev.name.toLowerCase().includes(q) || ev.actorName.toLowerCase().includes(q))
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Type</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Name</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = iconForEvent(ev.event);
                      const KindIcon = KIND_CONFIG[ev.kind].icon;
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", KIND_CONFIG[ev.kind].badgeClass)}>
                              <KindIcon className="h-3 w-3" /> {ev.kind}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.name}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", colorForEvent(ev.event))}>
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
