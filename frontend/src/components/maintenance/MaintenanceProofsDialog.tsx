"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, FileText, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { FileViewer } from "@/components/ui/FileViewer";
import { maintenanceApi, maintenanceRequestsApi } from "@/lib/api";
import { confirmDelete, showError } from "@/lib/swal";
import type { MaintenanceProof } from "@/types/truck-maintenance";
import { proofTypeLabel } from "./MaintenanceRecordFormDialog";

type Props = {
  open: boolean;
  recordId: string | null;
  /** Which record this is — shown as a line under the title, e.g. "SUSPENSION WORK · 11-10-2026". */
  subtitle?: string;
  canDelete: boolean;
  /** "request": recordId is a pending Maintenance Approvals request (read-only files). */
  source?: "record" | "request";
  onClose: () => void;
  /** Called with the new count after a file is deleted. */
  onCountChange?: (count: number) => void;
};

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A pending request's files have the same shape; they just live under the request.
function listProofsFor(source: "record" | "request", id: string): Promise<MaintenanceProof[]> {
  return source === "request"
    ? maintenanceRequestsApi.listProofs(id).then((l) => l.map((p) => ({ ...p, recordId: p.requestId })))
    : maintenanceApi.listProofs(id);
}

function fetchProofFor(source: "record" | "request", id: string, proofId: string): Promise<Blob> {
  return source === "request" ? maintenanceRequestsApi.fetchProofBlob(id, proofId) : maintenanceApi.fetchProofBlob(id, proofId);
}

/**
 * Proof of Payment files on one maintenance record. Files are fetched with the
 * normal auth header and shown/opened as blob URLs, so no token ever goes into
 * a link that could be copied or end up in browser history.
 */
export function MaintenanceProofsDialog({ open, recordId, subtitle, canDelete, source = "record", onClose, onCountChange }: Props) {

  const [proofs, setProofs] = useState<MaintenanceProof[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<MaintenanceProof | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    if (!open || !recordId) return;
    let cancelled = false;
    setLoading(true);
    setProofs([]);
    setThumbs({});
    listProofsFor(source, recordId)
      .then(async (list) => {
        if (cancelled) return;
        setProofs(list);
        for (const p of list.filter((x) => x.kind === "image")) {
          try {
            const blob = await fetchProofFor(source, recordId, p.id);
            if (cancelled) return;
            const url = URL.createObjectURL(blob);
            urls.current.push(url);
            setThumbs((prev) => ({ ...prev, [p.id]: url }));
          } catch {
            /* thumbnail just stays as an icon */
          }
        }
      })
      .catch(() => showError("Could not load the proof files."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, [open, recordId, source]);

  // Opens in the in-app viewer (fetched with the auth header, never a new tab).
  function openProof(p: MaintenanceProof) {
    if (!recordId) return;
    setViewing(p);
  }

  async function deleteProof(p: MaintenanceProof) {
    if (!recordId) return;
    const ok = await confirmDelete(`"${p.fileName}"`);
    if (!ok.isConfirmed) return;
    setBusyId(p.id);
    try {
      await maintenanceApi.deleteProof(recordId, p.id);
      const next = proofs.filter((x) => x.id !== p.id);
      setProofs(next);
      onCountChange?.(next.length);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not delete the file.");
    } finally {
      setBusyId(null);
    }
  }

  const images = proofs.filter((p) => p.kind === "image");
  const pdfs = proofs.filter((p) => p.kind === "pdf");

  return (
    <Dialog open={open} onClose={onClose} title="Proof of Payment" className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        {/* Which record + how many files — kept out of the title so a long
            maintenance type never wraps it mid-date. */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {subtitle && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold text-gray-700">{subtitle}</span>
          )}
          {proofs.length > 0 && (
            <span className="text-gray-400">
              {images.length > 0 && `${images.length} image${images.length === 1 ? "" : "s"}`}
              {images.length > 0 && pdfs.length > 0 && " · "}
              {pdfs.length > 0 && `${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"}`}
            </span>
          )}
        </div>

        {loading && proofs.length === 0 ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : proofs.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <ImageIcon className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-600">No proof of payment</p>
            <p className="mt-1 text-xs text-gray-400">Nothing was uploaded for this record.</p>
          </div>
        ) : (
          <>
            {images.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Images</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {images.map((p) => (
                    <div key={p.id} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
                      <button
                        type="button"
                        onClick={() => openProof(p)}
                        title={`Open ${p.fileName}`}
                        className="block w-full text-left"
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                          {thumbs[p.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbs[p.id]} alt={p.fileName} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                            </span>
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                            {busyId === p.id ? (
                              <Loader2 className="h-5 w-5 animate-spin text-white" />
                            ) : (
                              <span className="flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-gray-800 shadow">
                                <Eye className="h-3.5 w-3.5" /> Open
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="px-3 py-2">
                          <p className="truncate text-xs font-medium text-gray-800">{p.fileName}</p>
                          <p className="truncate text-[11px] text-gray-400">
                            {proofTypeLabel(p.fileName, p.kind)} · {fileSize(p.sizeBytes)}
                          </p>
                        </div>
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteProof(p)}
                          disabled={busyId === p.id}
                          aria-label={`Delete ${p.fileName}`}
                          className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-gray-500 opacity-0 shadow transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {pdfs.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">PDFs</h3>
                <ul className="flex flex-col gap-2">
                  {pdfs.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                        <FileText className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{p.fileName}</span>
                        <span className="block text-xs text-gray-400">PDF · {fileSize(p.sizeBytes)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => openProof(p)}
                        disabled={busyId === p.id}
                        className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        Open
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteProof(p)}
                          disabled={busyId === p.id}
                          aria-label={`Delete ${p.fileName}`}
                          className="shrink-0 rounded-full p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {proofs[0]?.uploadedByName && (
              <p className="text-[11px] text-gray-400">Uploaded by {proofs[0].uploadedByName}</p>
            )}
          </>
        )}
      </div>
      <FileViewer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.fileName ?? ""}
        filename={viewing?.fileName}
        url={viewing && recordId ? `${source}-proof:${recordId}:${viewing.id}` : ""}
        load={viewing && recordId ? () => fetchProofFor(source, recordId, viewing.id) : undefined}
      />
    </Dialog>
  );
}
