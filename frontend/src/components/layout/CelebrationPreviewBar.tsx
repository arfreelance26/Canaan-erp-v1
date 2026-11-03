"use client";

import { useEffect, useState } from "react";
import { RiEyeLine as Eye, RiCloseLine as X } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { getPreview, setPreview, PREVIEW_EVENT, type CelebrationPreview } from "@/lib/celebration-preview";

/** Gold strip across the top of the page while an Admin is previewing a
 *  celebration (Celebrations Management) — so it can't be forgotten. */
export function CelebrationPreviewBar() {
  const { user } = useAuth();
  const [preview, setState] = useState<CelebrationPreview | null>(null);

  useEffect(() => {
    const sync = () => setState(getPreview());
    sync();
    window.addEventListener(PREVIEW_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(PREVIEW_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);

  if (!preview || user?.softwareDesignation !== "Admin") return null;
  const when = preview.date
    ? new Date(`${preview.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "today";

  return (
    <div className="flex items-center justify-center gap-3 border-b border-gold-border bg-gold-surface px-4 py-1.5 text-caption-1-medium text-gold-text-strong">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        Preview mode{preview.label ? `: ${preview.label}` : ""} · {when}{preview.birthday ? " · your birthday" : ""}
        <span className="ml-2 hidden text-gold-text sm:inline">Only you can see this</span>
      </span>
      <button
        type="button"
        onClick={() => setPreview(null)}
        className="flex shrink-0 items-center gap-1 rounded-md border border-gold-border-strong px-2 py-0.5 text-caption-1-medium text-gold-text-strong outline-none transition-colors hover:bg-gold-surface-strong focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <X className="h-3 w-3" /> Exit preview
      </button>
    </div>
  );
}
