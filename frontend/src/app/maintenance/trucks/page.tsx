"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { TruckMaintenanceTable } from "@/components/maintenance/TruckMaintenanceTable";
import { trucksApi, maintenanceApi, maintenanceRequestsApi, type MaintenanceRecordEditEventRow } from "@/lib/api";
import { RiToolsLine as Wrench, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime, inDateRange } from "@/lib/format-date";
import { showSuccess, showError } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const MaintenanceRecordFormDialog = dynamic(() => import("@/components/maintenance/MaintenanceRecordFormDialog").then((m) => m.MaintenanceRecordFormDialog));
const MaintenanceRecordHistoryDialog = dynamic(() => import("@/components/maintenance/MaintenanceRecordHistoryDialog").then((m) => m.MaintenanceRecordHistoryDialog));
const TruckStatusDialog = dynamic(() => import("@/components/maintenance/TruckStatusDialog").then((m) => m.TruckStatusDialog));
const EDIT_EVENT_ICON: Record<MaintenanceRecordEditEventRow["event"], typeof Plus> = {
  "Record Created": Plus,
  "Record Edited": Pencil,
  "Record Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<MaintenanceRecordEditEventRow["event"], string> = {
  "Record Created": "bg-accent-surface-strong text-accent-text",
  "Record Edited": "bg-warning-surface-strong text-warning-text",
  "Record Deleted": "bg-danger-surface-strong text-danger-text",
};

export default function TruckMaintenancePage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // ?search=<registration> — a maintenance alert in the bell opens its truck.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearchQuery(q);
  }, []);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<MaintenanceRecordEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every maintenance record
  // edit ever logged — searching by registration/truck ID doubles as that
  // truck's own history. A deleted record's row still shows (it's a
  // snapshot, not a live join), which is the whole point of this log.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    maintenanceApi.listRecordEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    Promise.all([trucksApi.list(), maintenanceApi.listRecords()])
      .then(([t, r]) => {
        setTrucks(t);
        setRecords(r);
      })
      .catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);
  useWebSocketEvent("maintenance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));


  function handleUpdateRecord(truck: Truck) {
    setSelectedTruck(truck);
    setUpdateDialogOpen(true);
  }

  function handleViewRecord(truck: Truck) {
    setSelectedTruck(truck);
    setHistoryDialogOpen(true);
  }

  function handleViewStatus(truck: Truck) {
    setSelectedTruck(truck);
    setStatusDialogOpen(true);
  }

  async function handleSaveRecord(record: MaintenanceRecord, proofs: File[]) {
    const truck = trucks.find((t) => t.id === record.truckId);
    if (!truck || savingRecord) return;
    setSavingRecord(true);
    try {
      // Every new record goes to Maintenance Approvals first — it reaches the
      // truck's record (and costs) only once Admin or Accounts approves it.
      const request = await maintenanceRequestsApi.submit(record, truck.id);
      // Proof of Payment needs the request's id, so it uploads afterwards.
      // One at a time keeps a slow connection from timing out several at once.
      const failed: string[] = [];
      for (const file of proofs) {
        try {
          await maintenanceRequestsApi.uploadProof(request.id, file);
        } catch (err: unknown) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
      }
      setUpdateDialogOpen(false);
      if (failed.length) {
        showError(
          `The record was sent for approval, but ${failed.length} proof file(s) didn't upload:\n${failed.join("\n")}`,
          "Some files weren't uploaded",
        );
      } else {
        showSuccess("Sent for approval. It's added to the truck's record once Admin or Accounts approves it.", "Submitted");
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to submit the maintenance record.");
    } finally {
      setSavingRecord(false);
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

  const hasRange = Boolean(exportFrom || exportTo);
  const datedRecords = records.filter((r) => inDateRange(r.date, exportFrom, exportTo));
  const filteredTrucks = trucks.filter(
    (t) =>
      (!hasRange || datedRecords.some((r) => r.truckId === t.id)) &&
      (!searchQuery ||
        t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-border bg-orange-surface text-orange-text shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Truck Maintenance</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Track the reliability of every truck in the fleet</p>
          </div>
        </div>
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
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/maintenance-records"
            filename="maintenance_records.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <TruckMaintenanceTable
        trucks={filteredTrucks}
        records={datedRecords}
        onUpdateRecord={handleUpdateRecord}
        onViewRecord={handleViewRecord}
        onViewStatus={handleViewStatus}
      />

      <MaintenanceRecordFormDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
        onSave={handleSaveRecord}
        truck={selectedTruck}
        saving={savingRecord}
      />

      <MaintenanceRecordHistoryDialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        truck={selectedTruck}
        records={records}
        onDelete={(id) => setRecords((prev) => prev.filter((r) => r.id !== id))}
        onUpdate={(saved) => {
          setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
        }}
      />

      <TruckStatusDialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
        truckDbId={selectedTruck?.id}
        records={selectedTruck ? records.filter((r) => r.truckId === selectedTruck.id) : []}
        tyreLayout={selectedTruck?.tyreLayout}
        truck={selectedTruck}
      />

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          maintenance record (not just the ones currently on this page), in
          one searchable log instead of having to open each truck
          individually. Searching by registration/truck ID doubles as that
          truck's own history. A deleted record's row still shows since
          it's logged as a snapshot, not a live join. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by registration, truck ID, type, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.truckIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.registrationNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.maintenanceType.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No maintenance record edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Truck</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Record</th>
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
                          <td className="px-3 py-2">
                            <p className="font-semibold text-text-primary">{ev.registrationNumber}</p>
                            <p className="text-[11px] text-text-tertiary">{ev.truckIdStr}</p>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{ev.maintenanceType}</td>
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
