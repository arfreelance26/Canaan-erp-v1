import { FileText, ExternalLink } from "lucide-react";
import { fileUrl } from "@/lib/api";

type FilePreviewBadgeProps = {
  fileName: string | null;
  fileObj?: File | null;
  entity?: string;
  entityId?: string;
  field?: string;
};

export function FilePreviewBadge({ fileName, fileObj, entity, entityId, field }: FilePreviewBadgeProps) {
  if (!fileName) return null;

  const handlePreview = (e: React.MouseEvent) => {
    e.preventDefault();
    let url = "";
    if (fileObj) {
      url = URL.createObjectURL(fileObj);
    } else if (entity && entityId && field) {
      url = fileUrl(entity, entityId, field);
    }
    
    if (url) {
      window.open(url, "_blank");
    }
  };

  return (
    <button
      type="button"
      onClick={handlePreview}
      className="mt-1 flex w-fit items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95"
      title="Click to preview document"
    >
      <FileText className="h-3.5 w-3.5" />
      <span className="truncate max-w-[200px] font-medium">{fileName}</span>
      <ExternalLink className="h-3 w-3 opacity-50" />
    </button>
  );
}
