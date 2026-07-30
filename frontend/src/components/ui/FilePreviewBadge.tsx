import { FileText, ExternalLink } from "lucide-react";
import { fileUrl } from "@/lib/api";

type FilePreviewBadgeProps = {
  fileName: string | null;
  fileObj?: File | null;
  entity?: string;
  entityId?: string | number;
  field?: string;
};

const badgeClass =
  "mt-1 flex w-fit items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95";

export function FilePreviewBadge({ fileName, fileObj, entity, entityId, field }: FilePreviewBadgeProps) {
  if (!fileName) return null;

  // If we have a persisted backend URL, render as a plain <a> so browsers never
  // block it as a popup (window.open can be suppressed by popup blockers).
  if (!fileObj && entity && entityId && field) {
    return (
      <a
        href={fileUrl(entity, String(entityId), field)}
        target="_blank"
        rel="noopener noreferrer"
        className={badgeClass}
        title="Click to preview document"
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="truncate max-w-[200px] font-medium">{fileName}</span>
        <ExternalLink className="h-3 w-3 opacity-50" />
      </a>
    );
  }

  // Local blob (newly selected file, not yet uploaded) — blob URLs can only be
  // opened via window.open since there's no static href to set.
  const handlePreview = (e: React.MouseEvent) => {
    e.preventDefault();
    if (fileObj) {
      window.open(URL.createObjectURL(fileObj), "_blank");
    }
  };

  return (
    <button
      type="button"
      onClick={handlePreview}
      className={badgeClass}
      title="Click to preview document"
    >
      <FileText className="h-3.5 w-3.5" />
      <span className="truncate max-w-[200px] font-medium">{fileName}</span>
      <ExternalLink className="h-3 w-3 opacity-50" />
    </button>
  );
}
