"use client";

import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { useEffect, useState } from "react";
import { RiEyeLine as Eye, RiFileTextLine as FileText, RiAttachment2 as Paperclip, RiRefreshLine as RefreshCw, RiCloseLine as X } from "@remixicon/react";
import { tyreApi, vendorsApi } from "@/lib/api";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PROOF_MAX_BYTES, proofAccepted, fileSize } from "@/components/tyre-inventory/TyreInventoryFormDialog";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { Vendor } from "@/types/vendor";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Dialog } from "@/components/ui/Dialog";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { showSuccess, showError } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const FileViewer = dynamic(() => import("@/components/ui/FileViewer").then((m) => m.FileViewer));
const TyreDataDialog = dynamic(() => import("@/components/tyre-inventory/TyreDataDialog").then((m) => m.TyreDataDialog));
const DiscardReasonDialog = dynamic(() => import("@/components/tyre-inventory/DiscardReasonDialog").then((m) => m.DiscardReasonDialog));
const columns = [
  "Brand",
  "Tyre Type",
  "Tyre Number",
  "Tyre Size",
  "Range (km)",
  "Cost",
  "Purchase Date",
  "Condition",
  "Flagged On",
  "Flagged By",
  "Actions",
];

export default function RetreadQueuePage() {
  const [tyres, setTyres] = useState<TyreInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [moveTarget, setMoveTarget] = useState<TyreInventoryItem | null>(null);
  const [retreadCostInput, setRetreadCostInput] = useState("");
  const [expectedRangeInput, setExpectedRangeInput] = useState("");
  const [moving, setMoving] = useState(false);
  const [dataTyreId, setDataTyreId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<TyreInventoryItem | null>(null);
  // Rethreading Done by — Vendor (Our Vendors, so it shows on the vendor's
  // View Record) or Individual (a typed name) — plus the invoice and proof.
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [moveByType, setMoveByType] = useState<"Vendor" | "Individual">("Vendor");
  const [moveVendorId, setMoveVendorId] = useState("");
  const [moveIndividual, setMoveIndividual] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState("");
  const [viewingProof, setViewingProof] = useState(false);

  useEffect(() => {
    vendorsApi.list().then(setVendors).catch(() => {});
  }, []);
  const vendorOptions = [...vendors]
    .sort((a, b) => a.name.localeCompare(b.name))
    // Two vendors can share a name — the category tells them apart.
    .map((v) => ({ value: v.id, label: v.category ? `${v.name} · ${v.category}` : v.name }));
  const [moveError, setMoveError] = useState<string | null>(null);

  function openMoveDialog(tyre: TyreInventoryItem) {
    setMoveTarget(tyre);
    setRetreadCostInput("");
    setExpectedRangeInput("");
    setMoveByType("Vendor");
    setMoveVendorId("");
    setMoveIndividual("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setProofFile(null);
    setProofError("");
    setMoveError(null);
  }

  function pickProof(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!proofAccepted(file)) setProofError(`"${file.name}" isn't a PDF or an image.`);
    else if (file.size > PROOF_MAX_BYTES) setProofError(`"${file.name}" is over 15 MB.`);
    else { setProofFile(file); setProofError(""); }
  }

  async function handleDiscardConfirm(tyre: TyreInventoryItem, reason: string) {
    try {
      await tyreApi.flagForDiscard(tyre.id, reason);
      setTyres((prev) => prev.filter((t) => t.id !== tyre.id));
      setDiscardTarget(null);
      showSuccess("Tyre moved to Discarded Tyres.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to discard tyre.");
    }
  }

  async function handleMoveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!moveTarget) return;
    const cost = parseFloat(retreadCostInput);
    const range = parseInt(expectedRangeInput, 10);
    if (isNaN(cost) || cost < 0) return setMoveError("Enter a valid retread cost.");
    if (isNaN(range) || range <= 0) return setMoveError("Enter an expected range greater than zero.");
    if (moveByType === "Vendor" && !moveVendorId) return setMoveError("Select the vendor that did the retreading.");
    if (moveByType === "Individual" && !moveIndividual.trim()) return setMoveError("Enter the name of the person who did the retreading.");
    setMoving(true);
    setMoveError(null);
    try {
      await tyreApi.moveToInventory(moveTarget.id, {
        retreadCost: retreadCostInput, expectedRange: expectedRangeInput,
        retreadByType: moveByType, vendorId: moveVendorId, retreadDoneBy: moveIndividual,
        invoiceNumber, invoiceDate, proof: proofFile,
      });
      setTyres((prev) => prev.filter((t) => t.id !== moveTarget.id));
      setMoveTarget(null);
      showSuccess("Tyre moved back to Tyre Inventory.");
    } catch (err: unknown) {
      setMoveError(err instanceof Error ? err.message : "Failed to move tyre to inventory.");
    } finally {
      setMoving(false);
    }
  }

  useEffect(() => {
    tyreApi.listRetreadQueue()
      .then(setTyres)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 5000);
  useWebSocketEvent("tyre_updated", () => setRefreshKey((k) => k + 1));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <RefreshCw className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Retread Queue</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Tyres waiting to be sent for retreading</p>
          </div>
        </div>
        {/* The designed report (tyre_reports.py). */}
        <ReportViewButton
          path="/exports/resource-report"
          filename="Retread_Queue.xlsx"
          title={`Retread Queue Report`}
          params={{ kind: "tyre_retread",  }}
          pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-10 text-center text-sm text-text-secondary">Loading…</div>
      ) : tyres.length === 0 ? (
        <EmptyState size="compact" illustration="logistics" title="No tyres in the retread queue" description="Use &ldquo;Flag for Retreading&rdquo; on Tyre Inventory to add one" />
      ) : (
        <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
          <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-separator-border bg-fill-1">
                {columns.map((column) => (
                  <th key={column} className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <PagedTbody className="divide-y divide-separator-border" items={tyres}>
              {(tyre) => (
                <tr key={tyre.id} className="hover:bg-fill-2">
                  <td className="px-4 py-3 font-medium text-text-primary">{tyre.brand}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.tyreType}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.tyreNumber}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.size}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.rangeKm}</td>
                  <td className="px-4 py-3 text-text-secondary">₹{Number(tyre.cost || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(tyre.purchaseDate)}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.condition}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.retreadFlaggedAt ? formatDateTime(tyre.retreadFlaggedAt) : "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.retreadFlaggedBy ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDataTyreId(tyre.id)}
                        className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-primary hover:bg-fill-2 transition-colors"
                      >
                        View Tyre Data
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscardTarget(tyre)}
                        className="rounded-lg border border-danger-border bg-danger-surface px-3 py-1.5 text-caption-1-medium text-danger-text hover:bg-danger-surface-strong transition-colors"
                      >
                        Flag as Discarded
                      </button>
                      <button
                        type="button"
                        onClick={() => openMoveDialog(tyre)}
                        className="rounded-lg border border-accent-border bg-accent-surface px-3 py-1.5 text-caption-1-medium text-accent-text hover:bg-accent-surface-strong transition-colors"
                      >
                        Move to Inventory
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </PagedTbody>
          </table>
        </div>
      )}

      <TyreDataDialog tyreId={dataTyreId} onClose={() => setDataTyreId(null)} />
      <DiscardReasonDialog tyre={discardTarget} onClose={() => setDiscardTarget(null)} onConfirm={handleDiscardConfirm} />

      <Dialog
        open={moveTarget !== null}
        onClose={() => !moving && setMoveTarget(null)}
        title={moveTarget ? `Move ${moveTarget.tyreNumber} to Inventory` : "Move to Inventory"}
      >
        <form onSubmit={handleMoveSubmit} className="flex flex-col gap-4 p-1">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-primary">Retread Cost (₹)</span>
            <DecimalInput
              required
              min="0"
              value={retreadCostInput}
              onChange={(e) => setRetreadCostInput(e.target.value)}
              placeholder="e.g. 4500"
              className="rounded-lg border border-border-button-default px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-primary">Expected Range (km)</span>
            <input
              type="number"
              required
              min="1"
              step="1"
              value={expectedRangeInput}
              onChange={(e) => setExpectedRangeInput(e.target.value)}
              placeholder="e.g. 60000"
              className="rounded-lg border border-border-button-default px-3 py-2"
            />
          </label>
          {/* Not a <label>: a click on the text would be forwarded to the first toggle button. */}
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-text-primary">Rethreading Done by *</span>
              <div role="radiogroup" aria-label="Rethreading done by" className="flex shrink-0 gap-0.5 rounded-full border border-separator-border bg-fill-2 p-0.5 shadow-inner">
                {(["Vendor", "Individual"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={moveByType === t}
                    onClick={() => setMoveByType(t)}
                    className={`rounded-full px-3 py-1 text-caption-1-semibold transition duration-200 ${
                      moveByType === t
                        ? "bg-accent-solid text-on-solid shadow-md"
                        : "text-text-secondary hover:bg-fill-2 hover:text-text-primary"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {moveByType === "Vendor" ? (
              <GlassCombobox
                required
                strictSelect
                value={moveVendorId}
                onChange={setMoveVendorId}
                options={vendorOptions}
                placeholder={vendorOptions.length === 0 ? "No active vendors — add one in Our Vendors" : "Search or select a vendor"}
              />
            ) : (
              <input
                type="text"
                required
                maxLength={200}
                aria-label="Rethreading done by (individual)"
                value={moveIndividual}
                onChange={(e) => setMoveIndividual(e.target.value)}
                placeholder="e.g. the person's name"
                className="rounded-lg border border-border-button-default px-3 py-2"
              />
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">Invoice Number (given by the {moveByType === "Vendor" ? "vendor" : "individual"})</span>
              <input
                type="text"
                maxLength={100}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-0412"
                className="rounded-lg border border-border-button-default px-3 py-2"
              />
            </label>
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text-primary">Invoice Date</span>
              <DatePickerInput value={invoiceDate} onChange={setInvoiceDate} className="rounded-lg border border-border-button-default px-3 py-2" />
            </div>
          </div>
          {/* Proof of Payment/Invoice — sent with the move in one request. */}
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-text-primary">Proof of Payment/Invoice</span>
              <span className="text-xs text-text-tertiary">PDF or image · max 15 MB</span>
            </div>
            {proofFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-separator-border bg-background-primary-default px-2.5 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent-surface text-accent-text">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text-primary">{proofFile.name}</span>
                  <span className="block text-xs text-text-tertiary">{fileSize(proofFile.size)} · saved with the move</span>
                </span>
                <button type="button" onClick={() => setViewingProof(true)} aria-label="View proof"
                  className="rounded-full p-1 text-text-tertiary transition-colors hover:bg-accent-surface-strong hover:text-accent-text">
                  <Eye className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => { setProofFile(null); setProofError(""); }} aria-label="Remove proof"
                  className="rounded-full p-1 text-text-tertiary transition-colors hover:bg-danger-surface-strong hover:text-danger-text">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-button-default px-4 py-4 text-sm text-text-secondary transition-colors hover:border-accent-border-strong hover:bg-accent-surface-strong/40 hover:text-accent-text">
                <Paperclip className="h-4 w-4" />
                Upload a PDF or image (max 15 MB)
                <input
                  type="file"
                  accept="application/pdf,.pdf,image/*,.heic,.heif,.tif,.tiff,.avif"
                  className="sr-only"
                  onChange={(e) => { pickProof(e.target.files); e.target.value = ""; }}
                />
              </label>
            )}
            {proofError && <p className="text-xs text-danger-text">{proofError}</p>}
          </div>
          <FileViewer
            open={viewingProof && !!proofFile}
            onClose={() => setViewingProof(false)}
            url={proofFile ? `picked:${proofFile.name}:${proofFile.size}` : ""}
            title={proofFile?.name ?? "Proof of Payment/Invoice"}
            filename={proofFile?.name}
            load={() => Promise.resolve<Blob>(proofFile as File)}
          />
          <div className="flex items-center justify-between rounded-lg bg-fill-1 px-3 py-2 text-sm">
            <span className="font-medium text-text-primary">Retread Count</span>
            <span className="text-text-secondary">
              {moveTarget?.retreadCount || 0} → {(parseInt(moveTarget?.retreadCount ?? "0", 10) || 0) + 1}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            The retread cost will become this tyre&apos;s purchase cost in Tyre Inventory.
          </p>
          {moveError && <p className="text-sm text-danger-text">{moveError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setMoveTarget(null)}
              disabled={moving}
              className="rounded-lg border border-border-button-default px-4 py-2 text-body-medium text-text-primary hover:bg-fill-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={moving}
              className="rounded-lg bg-accent-solid px-4 py-2 text-body-medium text-on-solid hover:bg-accent-solid-hover disabled:opacity-50"
            >
              {moving ? "Moving…" : "Move to Inventory"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
