"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { RiEditLine as Pencil } from "@remixicon/react";
import { MaintenanceRequestCard } from "@/components/maintenance/MaintenanceRequestCard";
import { maintenanceRequestsApi, trucksApi } from "@/lib/api";
import type { MaintenanceRequest } from "@/types/maintenance-request";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";
import { showError, showSuccess } from "@/lib/feedback";
import { formatDate } from "@/lib/format-date";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * My Requests → Maintenance Requests: the maintenance records submitted (from
 * the maintenance form or a trip sheet's repairs) and what was decided, as
 * cards. A rejected one is fixed and sent back by the person who submitted it:
 * Edit & Submit for Re-Verification puts the same request back in Maintenance
 * Approvals as Pending (backend/routers/maintenance_requests.resubmit_request,
 * which refuses anyone else).
 */

// Dialogs load on demand, after the page has drawn (next/dynamic).
const MaintenanceRecordFormDialog = dynamic(() => import("@/components/maintenance/MaintenanceRecordFormDialog").then((m) => m.MaintenanceRecordFormDialog));
const MaintenanceProofsDialog = dynamic(() => import("@/components/maintenance/MaintenanceProofsDialog").then((m) => m.MaintenanceProofsDialog));

type Props = {
  requests: MaintenanceRequest[];
  /** Whether this viewer can fix and resend this one (they submitted it). */
  canFix: (r: MaintenanceRequest) => boolean;
  /** Card to highlight and scroll to (the bell's ?focus=). */
  focusId: string | null;
  onChanged: () => void;
  emptyTitle: string;
};

export function MaintenanceRequestsList({ requests, canFix, focusId, onChanged, emptyTitle }: Props) {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [fixing, setFixing] = useState<MaintenanceRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [proofsFor, setProofsFor] = useState<MaintenanceRequest | null>(null);

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => {});
  }, []);

  useEffect(() => {
    if (!focusId) return;
    const t = window.setTimeout(() => {
      document.getElementById(`maintenance-request-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusId, requests]);

  const fixingTruck = fixing ? trucks.find((t) => t.id === fixing.truckId) ?? null : null;

  function openFix(r: MaintenanceRequest) {
    if (!trucks.some((t) => t.id === r.truckId)) {
      showError("This truck's details couldn't be loaded. Refresh the page and try again.");
      return;
    }
    setFixing(r);
  }

  async function handleResubmit(record: MaintenanceRecord, proofs: File[]) {
    if (!fixing || saving) return;
    setSaving(true);
    try {
      const request = await maintenanceRequestsApi.resubmit(fixing.id, record, fixing.truckId);
      // Proof of Payment uploads afterwards, one at a time (as on a new record).
      const failed: string[] = [];
      for (const file of proofs) {
        try {
          await maintenanceRequestsApi.uploadProof(request.id, file);
        } catch (err: unknown) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
      }
      setFixing(null);
      onChanged();
      if (failed.length) {
        showError(
          `It was sent for re-verification, but ${failed.length} proof file(s) didn't upload:\n${failed.join("\n")}`,
          "Some files weren't uploaded",
        );
      } else {
        showSuccess("Sent back to Maintenance Approvals for re-verification.", "Submitted");
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to send it for re-verification.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {requests.length === 0 ? (
        <EmptyState
          size="compact"
          illustration="not-found"
          title={emptyTitle}
          description="Records submitted from Truck Maintenance, or repairs from saved trip sheets, appear here"
          className="rounded-2xl border border-separator-border bg-background-primary-default"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((r) => (
            <MaintenanceRequestCard
              key={r.id}
              req={r}
              highlight={r.id === focusId}
              onProofs={setProofsFor}
              footer={r.status === "Rejected" ? (
                canFix(r) ? (
                  <button
                    type="button"
                    onClick={() => openFix(r)}
                    className="flex items-center gap-1.5 rounded-lg bg-accent-solid px-5 py-2 text-body-semibold text-on-solid transition-colors hover:bg-accent-solid-hover"
                  >
                    <Pencil className="h-4 w-4" /> Edit &amp; Submit for Re-Verification
                  </button>
                ) : (
                  <p className="text-xs text-text-tertiary">Waiting for {r.submittedByName || "the person who submitted it"} to fix it and send it back.</p>
                )
              ) : r.status === "Pending" ? (
                <p className="text-xs text-text-tertiary">
                  {r.resubmitCount > 0 ? "Sent back — waiting for re-verification by Admin or Accounts." : "Waiting for Admin or Accounts to approve."}
                </p>
              ) : null}
            />
          ))}
        </div>
      )}

      <MaintenanceRecordFormDialog
        open={fixing !== null && fixingTruck !== null}
        onClose={() => { if (!saving) setFixing(null); }}
        onSave={(record, proofs) => { void handleResubmit(record, proofs); }}
        truck={fixingTruck}
        saving={saving}
        rejectedRequest={fixing}
      />

      <MaintenanceProofsDialog
        open={proofsFor !== null}
        recordId={proofsFor?.id ?? null}
        source="request"
        subtitle={proofsFor ? `${proofsFor.registrationNumber} · ${proofsFor.maintenanceType} · ${formatDate(proofsFor.date)}` : undefined}
        canDelete={false}
        onClose={() => setProofsFor(null)}
      />
    </>
  );
}
