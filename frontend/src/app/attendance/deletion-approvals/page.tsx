"use client";

import { useEffect, useState } from "react";
import { deletionApprovalsApi, type DeletionApprovalRequest, type DeletionApprovalEditEventRow } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { showSuccess, showError } from "@/lib/swal";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { CheckCircle, XCircle, Clock, Fuel, Wrench, Truck, User, Calendar, FileText, Layers, IdCard, Trash2, Users, Building2, Handshake, Boxes, History } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { cn } from "@/lib/utils";

const EDIT_EVENT_ICON: Record<DeletionApprovalEditEventRow["event"], typeof CheckCircle> = {
  "Deletion Approved": CheckCircle,
  "Deletion Rejected": XCircle,
};

const EDIT_EVENT_COLOR: Record<DeletionApprovalEditEventRow["event"], string> = {
  "Deletion Approved": "bg-emerald-100 text-emerald-700",
  "Deletion Rejected": "bg-red-100 text-red-700",
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
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
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

// ---------------------------------------------------------------------------
// Request card
// ---------------------------------------------------------------------------

function LogDetailRow({ label, value }: { label: string; value: React.ReactNode | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-700">{value}</span>
    </div>
  );
}

function RequestCard({
  req,
  isAdmin,
  onApprove,
  onReject,
}: {
  req: DeletionApprovalRequest;
  isAdmin: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const d = req.logDetails;
  const isPending = req.status === "Pending";
  const isMaintenance = req.resourceType === "MaintenanceRecord";
  const isTrip = req.resourceType === "Trip";
  const isDriver = req.resourceType === "Driver";
  const isTruck = req.resourceType === "Truck";
  const isStaff = req.resourceType === "Staff";
  const isCustomer = req.resourceType === "Customer";
  const isVendor = req.resourceType === "Vendor";
  const isTyre = req.resourceType === "TyreInventory";

  const badgeClass = isTrip
    ? "bg-purple-100 text-purple-600"
    : isMaintenance
    ? "bg-blue-100 text-blue-600"
    : isDriver
    ? "bg-indigo-100 text-indigo-600"
    : isTruck
    ? "bg-amber-100 text-amber-600"
    : isStaff
    ? "bg-emerald-100 text-emerald-600"
    : isCustomer
    ? "bg-sky-100 text-sky-600"
    : isVendor
    ? "bg-teal-100 text-teal-600"
    : isTyre
    ? "bg-orange-100 text-orange-600"
    : "bg-red-100 text-red-600";
  const BadgeIcon = isTrip
    ? Truck
    : isMaintenance
    ? Wrench
    : isDriver
    ? IdCard
    : isTruck
    ? Truck
    : isStaff
    ? Users
    : isCustomer
    ? Building2
    : isVendor
    ? Handshake
    : isTyre
    ? Boxes
    : Fuel;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${badgeClass}`}>
            <BadgeIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{req.resourceName}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Requested {req.createdAt ? formatDate(req.createdAt.slice(0, 10)) : "—"}
            </p>
          </div>
        </div>
        <StatusBadge status={req.status} />
      </div>

      <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-2">
        {/* Left — request info */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
              <User className="h-3 w-3" /> Requested By
            </div>
            <p className="text-sm font-semibold text-gray-800">{req.requestedByName}</p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
              <FileText className="h-3 w-3" /> Reason
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{req.reason}</p>
          </div>

          {req.status !== "Pending" && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                <CheckCircle className="h-3 w-3" /> Admin Action
              </div>
              <p className="text-sm text-gray-700">
                {req.status} by <span className="font-semibold">{req.approvedByName}</span>
                {req.approvedAt && (
                  <span className="text-gray-400"> · {formatDate(req.approvedAt.slice(0, 10))}</span>
                )}
              </p>
              {req.adminNote && (
                <p className="mt-1 text-xs text-gray-500 italic">&ldquo;{req.adminNote}&rdquo;</p>
              )}
            </div>
          )}
        </div>

        {/* Right — log snapshot */}
        {d && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              <Layers className="h-3 w-3" /> Log Details
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <LogDetailRow label="Date" value={d.date ? formatDate(String(d.date)) : null} />
              <LogDetailRow label="Truck" value={String(d.truck_id ?? "")} />
              <LogDetailRow label="Odometer" value={d.odometer ? `${Number(d.odometer).toLocaleString()} km` : null} />
              {isMaintenance ? (
                <>
                  <LogDetailRow label="Type" value={String(d.maintenance_type ?? "")} />
                  <LogDetailRow label="Description" value={d.description ? String(d.description) : null} />
                  <LogDetailRow label="Cost" value={d.cost ? `₹${Number(d.cost).toFixed(2)}` : null} />
                </>
              ) : (
                <>
                  <LogDetailRow label="Fuel Filled" value={d.litres ? `${Number(d.litres).toFixed(1)} L` : null} />
                  <LogDetailRow label="Price / Litre" value={d.price_per_litre ? `₹${Number(d.price_per_litre).toFixed(2)}` : null} />
                  <LogDetailRow label="Total Cost" value={d.total_cost ? `₹${Number(d.total_cost).toFixed(2)}` : null} />
                  <LogDetailRow label="Distance" value={d.distance && Number(d.distance) > 0 ? `${Number(d.distance).toLocaleString()} km` : null} />
                  <LogDetailRow label="Mileage" value={d.mileage && Number(d.mileage) > 0 ? `${Number(d.mileage).toFixed(2)} km/L` : null} />
                  {!!d.fuel_station && <LogDetailRow label="Fuel Station" value={String(d.fuel_station)} />}
                </>
              )}
              <LogDetailRow label="User Modified" value={String(d.entered_by_name ?? "")} />
              <LogDetailRow label="Source" value={String(d.source ?? "")} />
            </div>
          </div>
        )}
      </div>

      {/* Admin actions */}
      {isAdmin && isPending && (
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/40 px-5 py-3">
          <button
            type="button"
            onClick={() => onReject(req.id)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
          >
            <XCircle className="h-4 w-4" /> Reject
          </button>
          <button
            type="button"
            onClick={() => onApprove(req.id)}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            <CheckCircle className="h-4 w-4" /> Approve & Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Filter = "all" | "Pending" | "Approved" | "Rejected";

export default function DeletionApprovalsPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  const [requests, setRequests] = useState<DeletionApprovalRequest[]>([]);
  const [filter, setFilter] = useState<Filter>("Pending");
  const [loading, setLoading] = useState(true);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<DeletionApprovalEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    deletionApprovalsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  function load() {
    setLoading(true);
    // No resource_type filter — Fuel Log, Maintenance Record, and Trip deletion
    // requests are all reviewed from this one page, distinguished by icon/color.
    deletionApprovalsApi
      .list(filter === "all" ? undefined : filter)
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filter]);
  useWebSocketEvent("deletion_approval_created", load);
  useWebSocketEvent("deletion_approval_updated", load);

  async function handleApprove(id: number) {
    try {
      await deletionApprovalsApi.approve(id);
      showSuccess("Deletion approved and record removed.");
      load();
    } catch (err: any) {
      showError(err.message ?? "Failed to approve.");
    }
  }

  async function handleReject(id: number) {
    try {
      await deletionApprovalsApi.reject(id);
      showSuccess("Deletion request rejected.");
      load();
    } catch (err: any) {
      showError(err.message ?? "Failed to reject.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} columns={1} />;

  const tabs: Filter[] = ["Pending", "Approved", "Rejected", "all"];
  const tabLabel: Record<Filter, string> = { Pending: "Pending", Approved: "Approved", Rejected: "Rejected", all: "All" };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white text-red-600 shadow-sm">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Deletion Approvals</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Review deletion requests submitted by staff for admin approval.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isAdmin && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}

          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === t
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tabLabel[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar: export range + View, right-aligned (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/deletion-approvals/export"
            filename="deletion_approvals.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      {/* Content */}
      {requests.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Calendar className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-600">No {filter === "all" ? "" : filter.toLowerCase()} requests</p>
          <p className="mt-1 text-xs text-gray-400">Deletion requests from staff will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              isAdmin={isAdmin}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      {/* Edit History — every Approved/Rejected decision ever logged, across
          every deletion approval request, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by requester, resource, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.requestedByName.toLowerCase().includes(q) ||
              ev.resourceName.toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No decisions have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Requested By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Resource</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-gray-800">{ev.requestedByName}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {ev.resourceName} <span className="text-[11px] text-gray-400">({ev.resourceType})</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{ev.actorName}</td>
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
