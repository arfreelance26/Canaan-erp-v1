import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
};

export function StatCard({ label, value, caption, icon: Icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
          {label}
        </p>
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{caption}</p>
    </div>
  );
}
