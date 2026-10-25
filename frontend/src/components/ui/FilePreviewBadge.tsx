"use client";

import { useState } from "react";
import { Eye, FileText } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { FileViewer } from "@/components/ui/FileViewer";

type FilePreviewBadgeProps = {
  fileName: string | null;
  fileObj?: File | null;
  entity?: string;
  entityId?: string | number;
  field?: string;
};

const badgeClass =
  "mt-1 flex w-fit items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95";

/** The file name under an upload field — click to preview it in the in-app
 *  viewer: a freshly picked file before it's uploaded, or the saved one. */
export function FilePreviewBadge({ fileName, fileObj, entity, entityId, field }: FilePreviewBadgeProps) {
  const [open, setOpen] = useState(false);
  if (!fileName) return null;

  const saved = !fileObj && entity && entityId && field ? fileUrl(entity, String(entityId), field) : null;
  if (!fileObj && !saved) {
    // A name with no file behind it yet (e.g. restored from a draft) — nothing to preview.
    return (
      <span className="mt-1 flex w-fit items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500">
        <FileText className="h-3.5 w-3.5" />
        <span className="max-w-[200px] truncate font-medium">{fileName}</span>
      </span>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={badgeClass} title="Preview this file">
        <FileText className="h-3.5 w-3.5" />
        <span className="max-w-[200px] truncate font-medium">{fileName}</span>
        <Eye className="h-3 w-3 opacity-50" />
      </button>
      <FileViewer
        open={open}
        onClose={() => setOpen(false)}
        title={fileName}
        filename={fileName}
        // A picked file is shown as-is; a saved one is fetched from the server.
        url={saved ?? `local:${fileName}:${fileObj?.size ?? 0}:${fileObj?.lastModified ?? 0}`}
        load={fileObj ? () => Promise.resolve(fileObj) : undefined}
      />
    </>
  );
}
