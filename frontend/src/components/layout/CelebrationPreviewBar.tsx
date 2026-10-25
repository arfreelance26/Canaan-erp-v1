"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
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
    <div className="flex items-center justify-center gap-3 bg-gradient-to-r from-[#b8860b] via-[#d4a017] to-[#b8860b] px-4 py-1.5 text-[12.5px] font-semibold text-[#1b2b5e] shadow-sm">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        Preview mode{preview.label ? `: ${preview.label}` : ""} · {when}{preview.birthday ? " · your birthday" : ""}
        <span className="ml-2 hidden font-normal opacity-80 sm:inline">Only you can see this.</span>
      </span>
      <button
        type="button"
        onClick={() => setPreview(null)}
        className="flex shrink-0 items-center gap-1 rounded-full bg-[#1b2b5e] px-2.5 py-0.5 text-[11px] font-bold text-[#f3d98b] transition-transform hover:scale-105 active:scale-95"
      >
        <X className="h-3 w-3" /> Exit preview
      </button>
    </div>
  );
}
