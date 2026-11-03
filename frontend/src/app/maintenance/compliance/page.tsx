"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { ComplianceTable } from "@/components/fleet/ComplianceTable";
import { getComplianceStatus } from "@/lib/compliance";
import { RiShieldCheckLine as ShieldCheck, RiHistoryLine as History, RiFileHistoryLine as FileClock } from "@remixicon/react";
import { trucksApi, type ComplianceEditEventRow } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { Dialog } from "@/components/ui/Dialog";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { useNotifications } from "@/context/NotificationContext";
import { ReminderAlertBanner } from "@/components/ui/ReminderAlertBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
export default function CompliancePage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  // Truck document renewal reminders used to only surface as "Renewals &
  // Payments" in the Topbar bell — lives here now, the page whose whole job
  // is already tracking these documents. "license" is driver-side (see
  // Our Drivers); everything else here is a truck document.
  const { reminders } = useNotifications();
  const docReminders = reminders.filter((r) => r.kind !== "license" && r.kind !== "recurring");
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<ComplianceEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every compliance document
  // update ever logged — searching by registration/truck ID doubles as that
  // truck's own compliance history.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    trucksApi.listComplianceEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
        trucksApi.list().then(setTrucks).catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));

  const summary = useMemo(() => {
    const counts = { Valid: 0, "Expiring Soon": 0, Expired: 0 };
    for (const truck of trucks) {
      const dates = [
        truck.rcValidityDate,
        truck.fcExpiryDate,
        truck.roadTaxDate,
        truck.nationalPermitDate,
        truck.localPermitDate,
        truck.pollutionCertificateDate,
        truck.insuranceExpiryDate,
      ];
      for (const date of dates) {
        counts[getComplianceStatus(date)] += 1;
      }
    }
    return counts;
  }, [trucks]);

  if (loading) return <PageSkeleton hasButton hasSearch statCards={3} columns={6} />;

  const filteredTrucks = trucks.filter((t) => !searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning-border bg-warning-surface text-warning-text shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Compliance &amp; Renewals</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Track RC, FC, Road Tax, National Permit, Local Permit, Pollution Certificate, and Insurance validity across the fleet
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
      </div>

      <ReminderAlertBanner items={docReminders} />

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/trucks"
            filename="fleet_compliance.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Valid</p>
          <p className="mt-1 text-title-1-semibold text-success-text">{summary.Valid}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Expiring Soon</p>
          <p className="mt-1 text-title-1-semibold text-warning-text">{summary["Expiring Soon"]}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Expired</p>
          <p className="mt-1 text-title-1-semibold text-danger-text">{summary.Expired}</p>
        </div>
      </div>

      <ComplianceTable trucks={filteredTrucks} onChanged={() => setRefreshKey((k) => k + 1)} />


      {/* Edit History — every compliance document update ever logged, across
          every truck (not just the ones currently on this page), in one
          searchable log instead of having to open each truck individually. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by registration, truck ID, document, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.truckIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.registrationNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.documentType.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              (ev.action ?? "").toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No compliance updates have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Truck</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Document</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => (
                      <tr key={ev.id}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-text-primary">{ev.registrationNumber}</p>
                          <p className="text-[11px] text-text-tertiary">{ev.truckIdStr}</p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-2-semibold text-warning-text">
                              <FileClock className="h-3 w-3" /> {ev.documentType}
                            </span>
                            {ev.action && (
                              <span className={`rounded-full px-2 py-0.5 text-caption-2-semibold ${ev.action === "Renewal undone" ? "bg-danger-surface-strong text-danger-text" : "bg-accent-surface-strong text-accent-text"}`}>
                                {ev.action}
                              </span>
                            )}
                          </div>
                          {ev.note && <p className="mt-1 max-w-md whitespace-pre-line text-[11px] text-text-secondary">{ev.note}</p>}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{ev.actorName}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                      </tr>
                    )}
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
