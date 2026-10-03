"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive as ArchiveIcon,
  RotateCcw,
  Trash2,
  User,
  ShieldCheck,
  IdCard,
  Truck as TruckIcon,
  Users,
  Building2,
  Handshake,
  History,
  Plus,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { deletionApprovalsApi, driversApi, trucksApi, staffApi, customersApi, vendorsApi, type DeletionApprovalRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

const ALLOWED_ROLES = ["Admin"];

type ArchivedResource = "Driver" | "Truck" | "Staff" | "Customer" | "Vendor";
type ArchiveRow = DeletionApprovalRequest & { kind: ArchivedResource };

type KindConfig = {
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
  Driver: { homeLabel: "Our Drivers", icon: IdCard, badgeClass: "bg-indigo-50 text-indigo-700", api: driversApi },
  Truck: { homeLabel: "Our Fleet", icon: TruckIcon, badgeClass: "bg-amber-50 text-amber-700", api: trucksApi },
  Staff: { homeLabel: "Our Staff", icon: Users, badgeClass: "bg-emerald-50 text-emerald-700", api: staffApi },
  Customer: { homeLabel: "Our Customers", icon: Building2, badgeClass: "bg-blue-50 text-blue-700", api: customersApi },
  Vendor: { homeLabel: "Our Vendors", icon: Handshake, badgeClass: "bg-purple-50 text-purple-700", api: vendorsApi },
};
const ARCHIVED_KINDS: ArchivedResource[] = ["Driver", "Truck", "Staff", "Customer", "Vendor"];

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
  if (event.endsWith("Created")) return "bg-blue-100 text-blue-700";
  if (event.endsWith("Edited")) return "bg-amber-100 text-amber-700";
  if (event.endsWith("Deleted")) return "bg-red-100 text-red-700";
  if (event.endsWith("Restored")) return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-700";
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
      showSuccess(`${row.kind} ${row.resourceName} restored — it's back in ${KIND_CONFIG[row.kind].homeLabel}.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : `Failed to restore ${row.kind.toLowerCase()}.`);
    } finally {
      setActingId(null);
    }
  }

  async function handlePermanentDelete(row: ArchiveRow) {
    const res = await confirmDelete(
      `${row.kind} ${row.resourceName} and ALL its data will be permanently and irreversibly deleted. This cannot be undone.`
    );
    if (!res.isConfirmed) return;
    setActingId(row.id);
    try {
      await KIND_CONFIG[row.kind].api.removePermanent(String(row.resourceId));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showSuccess(`${row.kind} ${row.resourceName} permanently deleted.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : `Failed to permanently delete ${row.kind.toLowerCase()}.`);
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
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white text-slate-600 shadow-sm">
            <ArchiveIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Archive</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Staff, drivers, trucks, customers, and vendors removed from the Resource Hub — restore them or permanently delete
            </p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by name, requester, or approver" value={search} onChange={setSearch} />
        <div className="flex gap-1.5 rounded-lg border border-gray-200 bg-white/60 p-1">
          {(["All", ...ARCHIVED_KINDS] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                typeFilter === t ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {t === "All" ? "All" : t === "Driver" ? "Drivers" : t === "Truck" ? "Trucks" : t === "Customer" ? "Customers" : t === "Vendor" ? "Vendors" : "Staff"}
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

      <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/40 shadow-sm backdrop-blur-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ArchiveIcon className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              {rows.length === 0 ? "The archive is empty." : "No archived items match this search."}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Deleted By</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Approved By</th>
                  <th className="px-4 py-3">Deletion Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((row) => (
                  <tr key={`${row.kind}-${row.id}`} className="transition-colors hover:bg-white/60">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_CONFIG[row.kind].badgeClass}`}
                      >
                        {(() => {
                          const KindIcon = KIND_CONFIG[row.kind].icon;
                          return <KindIcon className="h-3 w-3" />;
                        })()}
                        {row.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.resourceName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                          <User className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <p className="font-medium text-gray-900">{row.requestedByName}</p>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(row)}
                        className="block max-w-[260px] truncate text-left text-blue-600 hover:text-blue-800 hover:underline"
                        title="Click to view full details"
                      >
                        {row.reason}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="font-medium text-gray-700">{row.approvedByName ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(row.approvedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => handleRestore(row)}
                          className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                          title={`Put this ${row.kind.toLowerCase()} back in ${KIND_CONFIG[row.kind].homeLabel}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => handlePermanentDelete(row)}
                          className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                          title={`Permanently and irreversibly delete this ${row.kind.toLowerCase()}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Permanently Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
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
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white p-6 shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Archived {viewing.kind}</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">{viewing.resourceName}</p>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Deleted By</p>
                <p className="mt-0.5 font-medium text-gray-900">{viewing.requestedByName}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reason for Deletion</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-gray-700">
                  {viewing.reason || "—"}
                </p>
              </div>
              {viewing.adminNote && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Admin Note</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-amber-800">
                    {viewing.adminNote}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Approved By</p>
                  <p className="mt-0.5 font-medium text-gray-900">{viewing.approvedByName ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Deletion Date</p>
                  <p className="mt-0.5 text-gray-700">{formatDate(viewing.approvedAt)}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setViewing(null)}
              className="mt-5 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
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
            <div className="flex gap-1.5 rounded-lg border border-gray-200 bg-white/60 p-1">
              {(["All", ...ARCHIVED_KINDS] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEditHistoryKindFilter(t)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    editHistoryKindFilter === t ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  {t === "All" ? "All" : t === "Driver" ? "Drivers" : t === "Truck" ? "Trucks" : t === "Customer" ? "Customers" : t === "Vendor" ? "Vendors" : "Staff"}
                </button>
              ))}
            </div>
          </div>
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              (editHistoryKindFilter === "All" || ev.kind === editHistoryKindFilter) &&
              (!q || ev.name.toLowerCase().includes(q) || ev.actorName.toLowerCase().includes(q))
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Type</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Name</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((ev) => {
                      const Icon = iconForEvent(ev.event);
                      const KindIcon = KIND_CONFIG[ev.kind].icon;
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", KIND_CONFIG[ev.kind].badgeClass)}>
                              <KindIcon className="h-3 w-3" /> {ev.kind}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-gray-800">{ev.name}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", colorForEvent(ev.event))}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-gray-400"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
