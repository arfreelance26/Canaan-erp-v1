"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";

// Phone/scanner formats most browsers can't draw — offered as Download instead.
const NO_PREVIEW_IMAGES = new Set(["image/heic", "image/heif", "image/tiff"]);

type Props = {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  /** Unused hint, kept for callers — the file's real type is read from the
   *  server's response (a PDF shows in an embedded viewer, an image as itself). */
  kind?: "image" | "pdf";
  /** Filename for Download. */
  filename?: string;
  /** Get the file some other way than fetching `url` — e.g. a file picked but
   *  not uploaded yet, or one that needs the auth header. `url` is then just a
   *  key: the file is (re)loaded whenever it changes. */
  load?: () => Promise<Blob>;
};

/**
 * In-app preview for an uploaded file (photo, ID, Aadhaar, compliance
 * document…) — opens over the page instead of sending the user to a new
 * browser tab. Esc / ✕ / clicking outside closes it. Download saves the file
 * without leaving the app.
 *
 * The file is fetched into a local blob first: the server sends PDFs as
 * attachments (so a stored file can never run in the app), which an <iframe>
 * pointed at the server would download instead of showing.
 */
export function FileViewer({ open, onClose, url, title, filename, load }: Props) {
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<{ href: string; type: string; blob: Blob } | null>(null);
  const [failed, setFailed] = useState(false);

  // Latest `load`, kept out of the fetch effect's deps so a new inline function
  // on each parent render doesn't refetch. Synced first (effects run in order).
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !url) return;
    let href: string | null = null;
    let cancelled = false;
    setFile(null);
    setFailed(false);
    const getBlob = loadRef.current
      ?? (() => fetch(url).then((res) => {
        if (!res.ok) throw new Error();
        return res.blob();
      }));
    getBlob()
      .then((blob) => {
        if (cancelled) return;
        href = URL.createObjectURL(blob);
        setFile({ href, type: blob.type, blob });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (href) URL.revokeObjectURL(href);
    };
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    // Capture phase, so Esc closes this viewer before any dialog underneath.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  function download() {
    if (!file) return;
    const a = document.createElement("a");
    a.href = file.href;
    const ext = file.type === "application/pdf" ? ".pdf" : file.type.startsWith("image/") ? `.${file.type.slice(6)}` : "";
    a.download = filename || `${title.replace(/\s+/g, "_")}${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={download}
            disabled={!file}
            className="flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        {failed ? (
          <p className="rounded-lg bg-white/10 px-4 py-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
            This file couldn&apos;t be loaded.
          </p>
        ) : !file ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        ) : file.type === "application/pdf" ? (
          <iframe
            src={file.href}
            title={title}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-5xl rounded-lg bg-white shadow-2xl"
          />
        ) : file.type.startsWith("image/") && !NO_PREVIEW_IMAGES.has(file.type) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.href}
            alt={title}
            onClick={(e) => e.stopPropagation()}
            onError={() => setFailed(true)}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        ) : (
          <p className="rounded-lg bg-white/10 px-4 py-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
            This file can&apos;t be previewed here — use Download.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
