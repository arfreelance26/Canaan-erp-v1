import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] focus:outline-none hover:border-gray-300 hover:bg-white/90";

type FieldProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
};

export function Field({ label, children, className, required }: FieldProps) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
