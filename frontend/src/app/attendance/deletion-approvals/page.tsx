"use client";

import { useEffect, useState } from "react";
import { deletionApprovalsApi, type DeletionApprovalRequest, type DeletionApprovalEditEventRow } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { showSuccess, showError } from "@/lib/feedback";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { RiCheckboxCircleLine as CheckCircle, RiCloseCircleLine as XCircle, RiTimeLine as Clock, RiDropLine as Droplets, RiGasStationLine as Fuel, RiToolsLine as Wrench, RiTruckLine as Truck, RiUserLine as User, RiCalendarLine as Calendar, RiFileTextLine as FileText, RiStackLine as Layers, RiProfileLine as IdCard, RiDeleteBinLine as Trash2, RiGroupLine as Users, RiBuilding2Line as Building2, RiShakeHandsLine as Handshake, RiStackLine as Boxes, RiHistoryLine as History } from "@remixicon/react";
import { formatDate, formatDateTime, inDateRange } from "@/lib/format-date";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { cn } from "@/lib/utils";
import { TYRE_ACTION_LABEL, type TyreAction } from "@/components/fleet/TruckTyreStepDialog";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const EDIT_EVENT_ICON: Record<DeletionApprovalEditEventRow["event"], typeof CheckCircle> = {
  "Deletion Approved": CheckCircle,
  "Deletion Rejected": XCircle,
};

const EDIT_EVENT_COLOR: Record<DeletionApprovalEditEventRow["event"], string> = {
  "Deletion Approved": "bg-success-surface-strong text-success-text",
  "Deletion Rejected": "bg-danger-surface-strong text-danger-text",
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
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
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-warning-text">
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
      <span className="text-[9px] font-semibold text-text-tertiary">{label}</span>
      <span className="text-caption-1-semibold text-text-primary">{value}</span>
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
  // Only a real fuel log gets the fuel styling — an unrecognised/blank type
  // used to fall through to it, making every broken request look like one.
  const isFuel = req.resourceType === "FuelLog";
  const isAdBlue = req.resourceType === "AdBlueLog";
  // A truck request is either a sale ("Sell Truck") or a delete.
  const isSale = isTruck && d?.action === "sell";
  const sale = (isSale ? d?.sale : null) as { sold_date?: string; sold_odometer?: number; note?: string | null } | null;

  const badgeClass = isTrip
    ? "bg-purple-surface-strong text-purple-text"
    : isMaintenance
    ? "bg-accent-surface-strong text-accent-text"
    : isDriver
    ? "bg-purple-surface-strong text-purple-text"
    : isTruck
    ? "bg-warning-surface-strong text-warning-text"
    : isStaff
    ? "bg-success-surface-strong text-success-text"
    : isCustomer
    ? "bg-teal-surface-strong text-teal-text"
    : isVendor
    ? "bg-teal-surface-strong text-teal-text"
    : isTyre
    ? "bg-orange-surface-strong text-orange-text"
    : isFuel
    ? "bg-danger-surface-strong text-danger-text"
    : isAdBlue
    ? "bg-teal-surface-strong text-teal-text"
    : "bg-fill-2 text-text-secondary";
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
    : isFuel
    ? Fuel
    : isAdBlue
    ? Droplets
    : FileText;

  return (
    <div className="overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 border-b border-separator-border bg-fill-1 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${badgeClass}`}>
            <BadgeIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-body-semibold text-text-primary">
              {req.resourceName}
              {isTruck && (
                <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-caption-2-semibold ${isSale ? "bg-accent-solid/10 text-accent-text-strong" : "bg-danger-surface text-danger-text"}`}>
                  {isSale ? "Sell" : "Delete"}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
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
            <div className="flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary mb-1">
              <User className="h-3 w-3" /> Requested By
            </div>
            <p className="text-body-semibold text-text-primary">{req.requestedByName}</p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary mb-1">
              <FileText className="h-3 w-3" /> Reason
            </div>
            <p className="text-sm text-text-primary leading-relaxed">{req.reason}</p>
          </div>

          {req.status !== "Pending" && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary mb-1">
                <CheckCircle className="h-3 w-3" /> Admin Action
              </div>
              <p className="text-sm text-text-primary">
                {req.status} by <span className="font-semibold">{req.approvedByName}</span>
                {req.approvedAt && (
                  <span className="text-text-tertiary"> · {formatDate(req.approvedAt.slice(0, 10))}</span>
                )}
              </p>
              {req.adminNote && (
                <p className="mt-1 text-xs text-text-secondary">&ldquo;{req.adminNote}&rdquo;</p>
              )}
            </div>
          )}
        </div>

        {/* Right — a sell request's sale details */}
        {isSale && sale && (
          <div className="rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
            <div className="flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary mb-3">
              <Layers className="h-3 w-3" /> Sale
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <LogDetailRow label="Sale Date" value={sale.sold_date ? formatDate(sale.sold_date) : null} />
              <LogDetailRow label="Odometer" value={sale.sold_odometer != null ? `${Number(sale.sold_odometer).toLocaleString("en-IN")} km` : null} />
              {!!sale.note && <LogDetailRow label="Note" value={sale.note} />}
            </div>
          </div>
        )}

        {/* Right — a truck request's tyre choices */}
        {isTruck && Array.isArray(d?.tyre_rows) && (d.tyre_rows as unknown[]).length > 0 && (
          <div className="rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
            <div className="flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary mb-3">
              <Layers className="h-3 w-3" /> Tyres ({(d.tyre_rows as unknown[]).length})
            </div>
            <div className="flex max-h-56 flex-col gap-1.5 overflow-auto">
              {(d.tyre_rows as { tyre_number: string; position: string; action: TyreAction }[]).map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-text-primary">
                    <span className="font-mono">{r.tyre_number}</span>
                    <span className="text-text-tertiary"> · {r.position}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-background-primary-default px-2 py-0.5 font-semibold text-text-secondary ring-1 ring-separator-border">
                    {TYRE_ACTION_LABEL[r.action] ?? r.action}
                  </span>
                </div>
              ))}
            </div>
            {typeof (d.tyre_plan as { removed_odometer?: number } | undefined)?.removed_odometer === "number" && (
              <p className="mt-3 text-[11px] text-text-tertiary">
                Removed at {Number((d.tyre_plan as { removed_odometer: number }).removed_odometer).toLocaleString("en-IN")} km
                {" "}on {formatDate(String((d.tyre_plan as { removed_date?: string }).removed_date ?? ""))}
              </p>
            )}
          </div>
        )}

        {/* Right — log snapshot */}
        {d && !isTruck && (
          <div className="rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
            <div className="flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary mb-3">
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
                  <LogDetailRow label={isAdBlue ? "AdBlue Filled" : "Fuel Filled"} value={d.litres ? `${Number(d.litres).toFixed(1)} L` : null} />
                  <LogDetailRow label="Price / Litre" value={d.price_per_litre ? `₹${Number(d.price_per_litre).toFixed(2)}` : null} />
                  <LogDetailRow label="Total Cost" value={d.total_cost ? `₹${Number(d.total_cost).toFixed(2)}` : null} />
                  <LogDetailRow label="Distance" value={d.distance && Number(d.distance) > 0 ? `${Number(d.distance).toLocaleString()} km` : null} />
                  <LogDetailRow label="Mileage" value={d.mileage && Number(d.mileage) > 0 ? `${Number(d.mileage).toFixed(2)} km/L` : null} />
                  {!!d.fuel_station && <LogDetailRow label="Fuel Station" value={String(d.fuel_station)} />}
                  {!!d.supplier && <LogDetailRow label="Filling Location" value={String(d.supplier)} />}
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
        <div className="flex items-center justify-end gap-2 border-t border-separator-border bg-fill-1 px-5 py-3">
          <button
            type="button"
            onClick={() => onReject(req.id)}
            className="flex items-center gap-1.5 rounded-lg border border-separator-border px-4 py-2 text-body-semibold text-text-secondary hover:bg-danger-surface-strong hover:border-danger-border hover:text-danger-text transition-colors"
          >
            <XCircle className="h-4 w-4" /> Reject
          </button>
          <button
            type="button"
            onClick={() => onApprove(req.id)}
            className="flex items-center gap-1.5 rounded-lg bg-success-solid px-5 py-2 text-body-semibold text-on-solid hover:bg-success-solid-hover transition-colors"
          >
            <CheckCircle className="h-4 w-4" /> {isSale ? "Approve & Sell" : "Approve & Delete"}
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
  const datedRequests = requests.filter((r) => inDateRange(r.createdAt, exportFrom, exportTo));
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-danger-border bg-danger-surface text-danger-text shadow-sm">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Deletion Approvals</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Review deletion requests submitted by staff for admin approval.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isAdmin && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}

          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-xl border border-separator-border bg-fill-1 p-1">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={`rounded-lg px-3 py-1.5 text-caption-1-semibold transition-colors ${
                  filter === t
                    ? "bg-background-primary-default text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
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
      {datedRequests.length === 0 ? (
        <div className="rounded-2xl border border-separator-border bg-background-primary-default p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-fill-2">
            <Calendar className="h-5 w-5 text-text-tertiary" />
          </div>
          <p className="text-body-semibold text-text-secondary">No {filter === "all" ? "" : filter.toLowerCase()} requests</p>
          <p className="mt-1 text-xs text-text-tertiary">Deletion requests from staff will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {datedRequests.map((req) => (
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
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.requestedByName.toLowerCase().includes(q) ||
              ev.resourceName.toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No decisions have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Requested By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Resource</th>
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
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.requestedByName}</td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.resourceName} <span className="text-[11px] text-text-tertiary">({ev.resourceType})</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{ev.actorName}</td>
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
