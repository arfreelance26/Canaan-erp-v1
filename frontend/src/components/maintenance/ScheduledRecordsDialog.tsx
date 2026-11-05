"use client";

import { useState } from "react";
import {
  RiAddLine as Plus,
  RiDeleteBinLine as Trash,
  RiTimeLine as Clock,
  RiAttachment2 as Paperclip,
} from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format-date";
import { confirm, showError, showSuccess } from "@/lib/feedback";
import { maintenanceRequestsApi } from "@/lib/api";
import { byText, money } from "@/components/maintenance/RepairLines";
import { SCHEDULED_REMIND_DAYS, type MaintenanceRequest } from "@/types/maintenance-request";
import type { Truck } from "@/types/truck";
import { cx } from "@/utils/cx";


/** Whole days since the job was scheduled. */
export function daysWaiting(job: MaintenanceRequest): number {
  if (!job.createdAt) return 0;
  const iso = /[zZ]|[+-]\d{2}:\d{2}$/.test(job.createdAt) ? job.createdAt : `${job.createdAt}Z`;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

type Props = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
  /** This truck's jobs waiting for their cost, oldest first. */
  jobs: MaintenanceRequest[];
  /** Opens Update Maintenance Record prefilled, to add the costs. */
  onAddCosts: (job: MaintenanceRequest) => void;
  canAddCosts: (job: MaintenanceRequest) => boolean;
  canRemove: (job: MaintenanceRequest) => boolean;
  onRemoved: () => void;
};

/**
 * Truck Maintenance → Scheduled Records: work saved before its bill came in.
 * Nothing here is counted (records, P&L, running cost) until its costs are
 * added and it's approved — then it lands on its own start date.
 */
export function ScheduledRecordsDialog({ open, onClose, truck, jobs, onAddCosts, canAddCosts, canRemove, onRemoved }: Props) {
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(job: MaintenanceRequest) {
    const ok = await confirm({
      title: "Remove this scheduled job?",
      description: `${job.maintenanceType || "This job"} from ${formatDate(job.date)} will be removed with any files attached to it.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setRemoving(job.id);
    try {
      await maintenanceRequestsApi.removeScheduled(job.id);
      showSuccess("The scheduled job was removed.");
      onRemoved();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Couldn't remove the scheduled job.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={truck ? `Scheduled Records — ${truck.registrationNumber}` : "Scheduled Records"}
      className="sm:max-w-2xl"
      tour="scheduled-records"
    >
      {jobs.length === 0 ? (
        <EmptyState
          illustration="maintenance"
          title="Nothing waiting for a cost"
          description="When the cost isn't known yet, choose “Not yet” on Update Maintenance Record — the job waits here until you add it."
        />
      ) : (
        <div className="flex flex-col gap-3" data-tour="scheduled-list">
          <p className="rounded-lg border border-teal-border bg-teal-surface px-4 py-2.5 text-xs text-teal-text-strong">
            {jobs.length} job{jobs.length === 1 ? " is" : "s are"} waiting for {jobs.length === 1 ? "its" : "their"} cost. They aren&apos;t in the truck&apos;s records or the P&amp;L yet — add the costs to send them for approval.
          </p>
          {jobs.map((job) => {
            const days = daysWaiting(job);
            const late = days >= SCHEDULED_REMIND_DAYS;
            const known = job.repairLines.filter((l) => l.cost.trim() !== "");
            return (
              <section key={job.id} className="rounded-xl border border-separator-border bg-background-primary-default shadow-xs">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-separator-border bg-fill-1 px-4 py-2.5">
                  <span className="text-body-semibold text-text-primary">{job.maintenanceType || "Maintenance"}</span>
                  <span className="text-caption-1-regular tabular-nums text-text-secondary">
                    {formatDate(job.date)}
                    {job.maintenanceEndDate && job.maintenanceEndDate !== job.date ? ` – ${formatDate(job.maintenanceEndDate)}` : ""}
                    {job.odometer ? ` · ${job.odometer.toLocaleString("en-IN")} km` : ""}
                  </span>
                  <span
                    className={cx(
                      "ml-auto flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption-2-semibold",
                      late ? "bg-warning-surface-strong text-warning-text" : "bg-teal-surface text-teal-text",
                    )}
                  >
                    <Clock className="size-3.5" />
                    {days === 0 ? "Scheduled today" : `Waiting ${days} day${days === 1 ? "" : "s"}`}
                  </span>
                </header>
                <div className="flex flex-col gap-2 px-4 py-3">
                  <ul className="flex flex-col gap-1">
                    {job.repairLines.map((l, i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-medium text-text-primary">{l.repairType}</span>
                        {byText(l) && <span className="text-xs text-text-tertiary">by {byText(l)}</span>}
                        <span className={cx("ml-auto tabular-nums text-xs", l.cost.trim() ? "text-text-secondary" : "italic text-text-tertiary")}>
                          {l.cost.trim() ? money(l.cost) : "cost to come"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {job.description && <p className="text-xs text-text-secondary">{job.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-caption-1-regular text-text-tertiary">
                      By {job.submittedByName || "—"}
                      {known.length > 0 && ` · ${known.length} of ${job.repairLines.length} costs known`}
                    </span>
                    {job.proofCount > 0 && (
                      <span className="flex items-center gap-1 text-caption-1-regular text-text-tertiary">
                        <Paperclip className="size-3.5" />
                        {job.proofCount} file{job.proofCount === 1 ? "" : "s"}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {canRemove(job) && (
                        <button
                          type="button"
                          onClick={() => remove(job)}
                          disabled={removing === job.id}
                          className="flex h-8 items-center gap-1 rounded-full border border-separator-border px-3 text-caption-1-semibold text-text-secondary transition duration-200 hover:border-danger-border hover:bg-danger-surface hover:text-danger-text disabled:opacity-50"
                        >
                          <Trash className="size-3.5" />
                          {removing === job.id ? "Removing…" : "Remove"}
                        </button>
                      )}
                      {canAddCosts(job) && (
                        <button
                          type="button"
                          onClick={() => onAddCosts(job)}
                          data-tour="scheduled-add-costs"
                          className="flex h-8 items-center gap-1 rounded-full bg-teal-solid px-3.5 text-caption-1-semibold text-on-solid shadow-sm transition duration-200 hover:bg-teal-solid-hover"
                        >
                          <Plus className="size-3.5" />
                          Add costs
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
