import { cn } from "@/lib/utils";
import type { PersonStatus } from "@/types/compensation";

const statusStyles: Record<PersonStatus, string> = {
  Active: "bg-green-50 text-green-700",
  "On-Trip": "bg-blue-50 text-blue-700",
  Leave: "bg-yellow-50 text-yellow-700",
  "Non-Active": "bg-gray-100 text-gray-500",
};

export function StatusBadge({ status }: { status: PersonStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusStyles[status])}>
      {status}
    </span>
  );
}
