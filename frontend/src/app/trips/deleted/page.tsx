"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, RotateCcw, User, ShieldCheck } from "lucide-react";
import { deletionApprovalsApi, tripsApi, type DeletionApprovalRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";

const ALLOWED_ROLES = ["Admin"];

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
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewing, setViewing] = useState<DeletionApprovalRequest | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Deleted Trips</h1>
        <p className="mt-1 text-sm text-gray-500">
          Audit trail of trips permanently deleted — who requested it, why, and who approved it
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by trip, requester, or approver"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/40 shadow-sm backdrop-blur-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Trash2 className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              {requests.length === 0 ? "No trips have been deleted." : "No deleted trips match this search."}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Trip</th>
                  <th className="px-4 py-3">Requested By</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Approved By</th>
                  <th className="px-4 py-3">Deleted At</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((req) => (
                  <tr key={req.id} className="transition-colors hover:bg-white/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{req.resourceName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                          <User className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <p className="font-medium text-gray-900">{req.requestedByName}</p>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(req)}
                        className="block max-w-[260px] truncate text-left text-blue-600 hover:text-blue-800 hover:underline"
                        title="Click to view full details"
                      >
                        {req.reason}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="font-medium text-gray-700">{req.approvedByName ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(req.approvedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={actingId === req.id}
                          onClick={() => handleRestore(req)}
                          className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                          title="Put this trip back in Trip History"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={actingId === req.id}
                          onClick={() => handlePermanentDelete(req)}
                          className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                          title="Permanently and irreversibly delete this trip"
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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Deleted Trip</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">{viewing.resourceName}</p>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Requested By</p>
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
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Deleted At</p>
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
    </div>
  );
}
