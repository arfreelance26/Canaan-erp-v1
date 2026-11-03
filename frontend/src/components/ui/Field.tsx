import { cn } from "@/lib/utils";

// NOTE: dark mode is handled by the CSS-variable remap in globals.css (the gray
// scale inverts + bg-white is overridden). Do NOT add `dark:` variants here —
// they resolve against the inverted scale and produce dark text on dark surfaces.
export const inputClass =
  "w-full rounded-lg border border-separator-border px-3 py-2 text-sm text-text-primary bg-background-primary-default transition duration-200 focus:border-accent-solid focus:bg-background-primary-default shadow-md focus:outline-none hover:border-border-button-default hover:bg-fill-2 uppercase placeholder:normal-case placeholder:text-text-placeholder";

export const inputClassLower =
  "w-full rounded-lg border border-separator-border px-3 py-2 text-sm text-text-primary bg-background-primary-default transition duration-200 focus:border-accent-solid focus:bg-background-primary-default shadow-md focus:outline-none hover:border-border-button-default hover:bg-fill-2 placeholder:normal-case placeholder:text-text-placeholder input-no-transform";

type FieldProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
};

export function Field({ label, children, className, required }: FieldProps) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-body-medium text-text-primary">
        {label}
        {required && <span className="text-danger-text ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
