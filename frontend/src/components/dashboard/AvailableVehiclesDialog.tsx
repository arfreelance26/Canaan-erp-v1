"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { EmptyState } from "@/components/ui/EmptyState";
import { getComplianceStatus } from "@/lib/compliance";
import { showError } from "@/lib/feedback";
import { RiFileTextLine as FileText, RiLoader4Line as Loader2 } from "@remixicon/react";
import type { Truck } from "@/types/truck";

/** Documents checked for the "expired" badge. A blank date is not counted:
 *  that's a missing record, which the compliance pages already chase. */
const DOCS: Array<{ label: string; field: keyof Truck }> = [
  { label: "RC", field: "rcValidityDate" },
  { label: "FC", field: "fcExpiryDate" },
  { label: "Road Tax", field: "roadTaxDate" },
  { label: "Insurance", field: "insuranceExpiryDate" },
  { label: "Nat. Permit", field: "nationalPermitDate" },
  { label: "Local Permit", field: "localPermitDate" },
  { label: "Pollution", field: "pollutionCertificateDate" },
];

function expiredDocs(truck: Truck): string[] {
  return DOCS.filter(({ field }) => {
    const date = truck[field];
    return typeof date === "string" && date !== "" && getComplianceStatus(date) === "Expired";
  }).map((d) => d.label);
}

type Props = { open: boolean; onClose: () => void; trucks: Truck[] };

/** The trucks free for a new trip: not sold, not on an Assigned or running trip. */
export function AvailableVehiclesDialog({ open, onClose, trucks }: Props) {
  const [search, setSearch] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trucks
      .filter((t) => !q || [t.registrationNumber, t.truckId, t.truckType, t.branchRegisteredTo]
        .some((v) => (v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => (a.registrationNumber ?? "").localeCompare(b.registrationNumber ?? ""))
      .map((t) => ({ truck: t, expired: expiredDocs(t) }));
  }, [trucks, search]);

  // The list as shown (search and order) as a PDF, expired documents named.
  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { downloadAvailableVehiclesPdf } = await import("@/lib/available-vehicles-pdf");
      await downloadAvailableVehiclesPdf({
        total: trucks.length,
        search,
        rows: rows.map(({ truck, expired }) => ({
          registration: truck.registrationNumber ?? "",
          truckId: truck.truckId ?? "",
          type: truck.truckType ?? "",
          branch: truck.branchRegisteredTo ?? "",
          odometer: truck.odometer ? Number(truck.odometer) : null,
          expired,
        })),
      });
    } catch {
      showError("Couldn't make the PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${trucks.length} available vehicle${trucks.length !== 1 ? "s" : ""}`}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <PillSearch value={search} onChange={setSearch} placeholder="Search registration, ID, type or branch…" size="sm" />
          <button
            type="button"
            onClick={downloadPdf}
            disabled={pdfBusy || rows.length === 0}
            className="flex shrink-0 items-center gap-2 rounded-full border border-danger-border bg-danger-surface px-4 py-2 text-body-medium text-danger-text hover:bg-danger-surface-strong disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Download PDF
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            size="compact"
            title={trucks.length === 0 ? "No trucks are free right now" : "No trucks match your search"}
            description={trucks.length === 0 ? "Every truck is booked or on the road." : undefined}
          />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-separator-border">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-background-secondary-default text-caption-1-semibold text-text-secondary">
                <tr>
                  <th className="px-3 py-2">Truck</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2 text-right">Odometer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border text-body-2-medium text-text-primary">
                {rows.map(({ truck, expired }) => (
                  <tr key={truck.id}>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">{truck.registrationNumber || "—"}</span>
                        <span className="text-text-tertiary">· {truck.truckId}</span>
                        {expired.length > 0 && (
                          <span
                            title={`Expired: ${expired.join(", ")}`}
                            className="rounded-full bg-danger-surface px-1.5 text-caption-2-semibold text-danger-text"
                          >
                            ⚠ {expired.length === 1 ? `${expired[0]} expired` : `${expired.length} docs expired`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{truck.truckType || "—"}</td>
                    <td className="px-3 py-2 text-text-secondary">{truck.branchRegisteredTo || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                      {truck.odometer ? `${Number(truck.odometer).toLocaleString("en-IN")} km` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
