"use client";

import { useEffect, useState } from "react";
import { RiEyeLine as Eye, RiLoader4Line as Loader2, RiAttachment2 as Paperclip, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { tyreApi } from "@/lib/api";
import type { TyreData, TyreMovementEvent } from "@/types/tyre-inventory";
import { Dialog } from "@/components/ui/Dialog";
import { FileViewer } from "@/components/ui/FileViewer";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";
import { confirmDelete, showError, showSuccess } from "@/lib/feedback";
import { PROOF_MAX_BYTES, proofAccepted, fileSize } from "@/components/tyre-inventory/TyreInventoryFormDialog";

const EVENT_LABEL: Record<TyreMovementEvent["event"], string> = {
  "Flagged for Retreading": "Moved for retreading",
  "Moved to Inventory": "Moved back to inventory",
  "Flagged as Discarded": "Moved to discarded tyres",
  "Restored from Discard": "Restored from discarded tyres",
  "Sold with Truck": "Left the business with its truck",
};

type Props = {
  tyreId: string | null;
  onClose: () => void;
};

// Full record for one tyre: its details, when it was first added to inventory,
// and every move to/from the Retread Queue or Discarded Tyres, with what was entered.
export function TyreDataDialog({ tyreId, onClose }: Props) {
  const [data, setData] = useState<TyreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // A retread's Proof of Payment/Invoice: view it, or add/replace it afterwards.
  const { user } = useAuth();
  const role = user?.softwareDesignation;
  const canUpload = role === "Admin" || role === "Maintenance";
  const [viewingProof, setViewingProof] = useState<TyreMovementEvent | null>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);

  useEffect(() => {
    if (!tyreId) return;
    setLoading(true);
    setError(null);
    if (reloadKey === 0) setData(null);
    tyreApi.getTyreData(tyreId)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load tyre data."))
      .finally(() => setLoading(false));
  }, [tyreId, reloadKey]);

  async function uploadProof(m: TyreMovementEvent, list: FileList | null) {
    const file = list?.[0];
    if (!file || !tyreId) return;
    if (!proofAccepted(file)) return showError(`"${file.name}" isn't a PDF or an image.`);
    if (file.size > PROOF_MAX_BYTES) return showError(`"${file.name}" is over 15 MB.`);
    setUploadingFor(m.id);
    try {
      await tyreApi.uploadRetreadProof(tyreId, m.id, file);
      showSuccess("Proof saved.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingFor(null);
    }
  }

  async function removeProof(m: TyreMovementEvent) {
    if (!tyreId || !(await confirmDelete("this retread's proof")).isConfirmed) return;
    try {
      await tyreApi.deleteRetreadProof(tyreId, m.id);
      setReloadKey((k) => k + 1);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not remove the proof.");
    }
  }

  const tyre = data?.tyre;

  return (
    <Dialog
      open={tyreId !== null}
      onClose={onClose}
      title={tyre ? `Tyre ${tyre.tyreNumber}` : "Tyre Data"}
    >
      {loading && !data && <p className="p-4 text-sm text-text-secondary">Loading…</p>}
      {error && <p className="p-4 text-sm text-danger-text">{error}</p>}
      {data && tyre && (
        <div className="flex flex-col gap-5 p-1">
          <section>
            <h3 className="mb-2 text-caption-1-semibold text-text-secondary">Details</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row label="Brand" value={tyre.brand} />
              <Row label="Tyre Type" value={tyre.tyreType} />
              <Row label="Tyre Size" value={tyre.size} />
              <Row label="Condition" value={tyre.condition} />
              <Row label="Purchase Date" value={tyre.purchaseDate ? formatDate(tyre.purchaseDate) : "—"} />
              <Row label="Purchase Cost" value={tyre.cost ? `₹${Number(tyre.cost).toLocaleString()}` : "—"} />
              <Row label="Expected Range" value={tyre.rangeKm && tyre.rangeKm !== "0" ? `${Number(tyre.rangeKm).toLocaleString()} km` : "—"} />
              <Row label="Cost Per KM" value={tyre.costPerKm ? `₹${Number(tyre.costPerKm).toFixed(4)}` : "—"} />
              <Row label="Retread Count" value={tyre.retreadCount || "0"} />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-caption-1-semibold text-text-secondary">History</h3>
            <ol className="flex flex-col gap-3 border-l border-separator-border pl-4 text-sm">
              <li>
                <p className="font-medium text-text-primary">Added to inventory</p>
                <p className="text-xs text-text-secondary">
                  {data.addedToInventoryAt ? formatDateTime(data.addedToInventoryAt) : "—"}
                </p>
              </li>
              {data.movements.length === 0 && (
                <li className="text-xs text-text-secondary">No retread or discard moves yet.</li>
              )}
              {data.movements.map((m) => (
                <li key={m.id}>
                  <p className="font-medium text-text-primary">{EVENT_LABEL[m.event]}</p>
                  <p className="text-xs text-text-secondary">
                    {formatDateTime(m.createdAt)} · {m.actorName}
                    {m.actorRole ? ` (${m.actorRole})` : ""}
                  </p>
                  {m.retreadDoneBy && (
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Retreaded by <span className="font-semibold">{m.retreadDoneBy}</span>
                      {m.retreadByType && <> ({m.retreadByType})</>}
                    </p>
                  )}
                  {(m.invoiceNumber || m.invoiceDate) && (
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Invoice {m.invoiceNumber ? <span className="font-semibold">{m.invoiceNumber}</span> : "—"}
                      {m.invoiceDate && <> dated {formatDate(m.invoiceDate)}</>}
                    </p>
                  )}
                  {m.event === "Moved to Inventory" && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {m.proofFileName ? (
                        <button
                          type="button"
                          onClick={() => setViewingProof(m)}
                          className="inline-flex items-center gap-1 rounded-full border border-accent-border bg-accent-surface px-2.5 py-0.5 font-semibold text-accent-text hover:bg-accent-surface-strong"
                          title={`${m.proofFileName}${m.proofSizeBytes ? ` · ${fileSize(m.proofSizeBytes)}` : ""}`}
                        >
                          <Eye className="h-3 w-3" /> View proof
                        </button>
                      ) : (
                        <span className="italic text-text-tertiary">No proof of payment</span>
                      )}
                      {canUpload && (
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-accent-text hover:bg-accent-surface-strong">
                          {uploadingFor === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                          {m.proofFileName ? "Replace proof" : "Add proof"}
                          <input
                            type="file"
                            accept="application/pdf,.pdf,image/*,.heic,.heif,.tif,.tiff,.avif"
                            className="sr-only"
                            disabled={uploadingFor !== null}
                            onChange={(e) => { void uploadProof(m, e.target.files); e.target.value = ""; }}
                          />
                        </label>
                      )}
                      {role === "Admin" && m.proofFileName && (
                        <button type="button" onClick={() => removeProof(m)} aria-label="Remove proof"
                          className="rounded-full p-1 text-text-tertiary hover:bg-danger-surface-strong hover:text-danger-text">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                  {(m.retreadCost != null || m.expectedRange != null || m.retreadCount != null) && (
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {m.retreadCost != null && <>Retread cost ₹{Number(m.retreadCost).toLocaleString()} · </>}
                      {m.expectedRange != null && <>Range {m.expectedRange.toLocaleString()} km · </>}
                      {m.retreadCount != null && <>Retread count {m.retreadCount}</>}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      <FileViewer
        open={viewingProof !== null}
        onClose={() => setViewingProof(null)}
        url={viewingProof && tyreId ? `retread-proof:${tyreId}:${viewingProof.id}:${viewingProof.proofSizeBytes ?? ""}` : ""}
        title={viewingProof?.proofFileName ?? "Proof of Payment/Invoice"}
        filename={viewingProof?.proofFileName ?? undefined}
        load={() => tyreApi.fetchRetreadProofBlob(tyreId as string, viewingProof!.id)}
      />
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="font-medium text-text-primary">{value || "—"}</dd>
    </div>
  );
}
