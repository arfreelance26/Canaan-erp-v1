"use client";

import { useEffect, useState } from "react";
import { deletionApprovalsApi, type DeletionApprovalRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { showSuccess, showError } from "@/lib/swal";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { CheckCircle, XCircle, Clock, Fuel, Wrench, User, Calendar, FileText, Layers } from "lucide-react";
import { formatDate } from "@/lib/format-date";

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

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isMaintenance ? "bg-blue-100 text-blue-600" : "bg-red-100 text-red-600"}`}>
            {isMaintenance ? <Wrench className="h-4 w-4" /> : <Fuel className="h-4 w-4" />}
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
                <p className="mt-1 text-xs text-gray-500 italic">"{req.adminNote}"</p>
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

  function load() {
    setLoading(true);
    deletionApprovalsApi
      .list(filter === "all" ? undefined : filter, "MaintenanceRecord")
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deletion Approvals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review deletion requests submitted by staff for admin approval.
          </p>
        </div>

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
    </div>
  );
}
