"use client";

import { useState } from "react";
import {
  RiFlagLine as Flag,
  RiArrowGoBackLine as Undo2,
  RiCheckboxCircleLine as CheckCircle2,
  RiArrowGoBackLine as RotateCcw,
  RiHistoryLine as HistoryIcon,
} from "@remixicon/react";
import { tripsApi, type TripRecheckEventRow } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
import { formatDateTime } from "@/lib/format-date";
import { showError } from "@/lib/feedback";
import { cn } from "@/lib/utils";

type RecheckEvent = TripRecheckEventRow["event"];

const EVENT_ICON: Record<RecheckEvent, typeof Flag> = {
  Flagged: Flag,
  "Returned for Review": Undo2,
  Verified: CheckCircle2,
  "Verification Undone": RotateCcw,
  "Flagged for Re-Verification": RotateCcw,
};

const EVENT_COLOR: Record<RecheckEvent, string> = {
  Flagged: "bg-danger-surface-strong text-danger-text",
  "Returned for Review": "bg-accent-surface-strong text-accent-text",
  Verified: "bg-success-surface-strong text-success-text",
  "Verification Undone": "bg-fill-3 text-text-primary",
  "Flagged for Re-Verification": "bg-purple-surface-strong text-purple-text",
};

/**
 * Which page the history is for:
 *   verified  Audit Verified Trips — sign-offs, undone sign-offs and trips sent back for re-verification
 *   driver    Driver Based Record — every audit action, with the driver
 *   vehicle   Vehicle Based Record — every audit action, with the truck
 */
export type AuditHistoryScope = "verified" | "driver" | "vehicle";

const SCOPE: Record<AuditHistoryScope, { events: RecheckEvent[] | null; search: string; empty: string }> = {
  verified: {
    events: ["Verified", "Verification Undone", "Flagged for Re-Verification"],
    search: "Search by trip ID, driver, actor, or remark…",
    empty: "No trips have been audit verified yet",
  },
  driver: {
    events: null,
    search: "Search by driver, trip ID, actor, or remark…",
    empty: "No audit actions have been logged yet",
  },
  vehicle: {
    events: null,
    search: "Search by registration, truck ID, trip ID, actor, or remark…",
    empty: "No audit actions have been logged yet",
  },
};

/**
 * The Admin-only "Edit History" button and its log for the audit pages: every
 * audit event (Flag, Return for Review, Verify, Undo, Re-Verification) across
 * every trip, newest first, from GET /trips/recheck-events. Loads when opened.
 */
export function AuditHistoryButton({ scope }: { scope: AuditHistoryScope }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TripRecheckEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  if (user?.softwareDesignation !== "Admin") return null;

  const cfg = SCOPE[scope];

  function openHistory() {
    setOpen(true);
    setSearch("");
    setLoading(true);
    tripsApi
      .listRecheckEvents()
      .then((all) => setRows(cfg.events ? all.filter((r) => cfg.events!.includes(r.event)) : all))
      .catch(() => showError("Couldn't load the edit history"))
      .finally(() => setLoading(false));
  }

  const q = search.trim().toLowerCase();
  const has = (v: string | null | undefined) => Boolean(v && v.toLowerCase().includes(q));
  const filtered = q
    ? rows.filter((ev) =>
        has(ev.tripIdStr) || has(ev.driverName) || has(ev.actorName) || has(ev.remark) ||
        (scope === "vehicle" && (has(ev.truckRegistration) || has(ev.vehicleId))),
      )
    : rows;
  const extra = scope === "driver" ? "Driver" : scope === "vehicle" ? "Truck" : null;
  const th = "px-3 py-2 text-caption-2-semibold text-text-tertiary";

  return (
    <>
      <button
        type="button"
        onClick={openHistory}
        data-tour="edit-history"
        className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
      >
        <HistoryIcon className="h-4 w-4" />
        Edit History
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Edit History" className="sm:max-w-3xl">
        <div className="flex flex-col gap-4">
          <PillSearch placeholder={cfg.search} value={search} onChange={setSearch} />
          {loading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              size="compact"
              illustration={rows.length === 0 ? "all-done" : "not-found"}
              title={rows.length === 0 ? cfg.empty : "No history matches this search"}
            />
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-fill-1">
                  <tr className="border-b border-separator-border">
                    <th className={th}>Trip</th>
                    {extra && <th className={th}>{extra}</th>}
                    <th className={th}>Event</th>
                    <th className={th}>By</th>
                    <th className={th}>Remark</th>
                    <th className={th}>When</th>
                  </tr>
                </thead>
                <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                  {(ev) => {
                    const Icon = EVENT_ICON[ev.event];
                    return (
                      <tr key={ev.id}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-text-primary">{ev.tripIdStr}</p>
                          {scope === "verified" && ev.driverName && <p className="text-[11px] text-text-tertiary">{ev.driverName}</p>}
                        </td>
                        {scope === "driver" && <td className="px-3 py-2 text-text-secondary">{ev.driverName || "—"}</td>}
                        {scope === "vehicle" && (
                          <td className="px-3 py-2">
                            <p className="whitespace-nowrap text-text-secondary">{ev.truckRegistration || "—"}</p>
                            {ev.vehicleId && <p className="text-[11px] text-text-tertiary">{ev.vehicleId}</p>}
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption-2-semibold", EVENT_COLOR[ev.event])}>
                            <Icon className="h-3 w-3" /> {ev.event}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {ev.actorName}
                          {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                        </td>
                        <td className="max-w-[220px] whitespace-normal px-3 py-2 text-text-secondary">{ev.remark || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                      </tr>
                    );
                  }}
                </PagedTbody>
              </table>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
