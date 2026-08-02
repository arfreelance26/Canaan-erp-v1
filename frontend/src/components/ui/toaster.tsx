"use client";

import { Toast } from "@base-ui-components/react/toast";
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastManager } from "@/lib/toast-manager";

const TYPE_STYLES: Record<string, string> = {
  success: "border-emerald-200 bg-white dark:bg-[#141929]",
  error:   "border-red-200 bg-white dark:bg-[#141929]",
  warning: "border-amber-200 bg-white dark:bg-[#141929]",
  info:    "border-blue-200 bg-white dark:bg-[#141929]",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error:   <XCircle className="h-4 w-4 text-red-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  info:    <Info className="h-4 w-4 text-blue-500" />,
};

function ToastItem({ toast }: { toast: Toast.Root.ToastObject }) {
  const type = (toast.type as string) ?? "info";
  const borderClass = TYPE_STYLES[type] ?? TYPE_STYLES.info;
  const icon = TYPE_ICON[type] ?? TYPE_ICON.info;

  return (
    <Toast.Root
      toast={toast}
      className={cn(
        "flex w-80 items-start gap-3 rounded-xl border p-4 shadow-lg",
        "transition-all duration-300 data-[ending]:opacity-0 data-[ending]:translate-x-2",
        borderClass,
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <Toast.Title className="text-sm font-semibold text-gray-900 leading-snug">
            {toast.title}
          </Toast.Title>
        )}
        {toast.description && (
          <Toast.Description className="mt-0.5 text-xs text-gray-500 leading-relaxed">
            {toast.description}
          </Toast.Description>
        )}
      </div>
      <Toast.Close className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
        <X className="h-3.5 w-3.5" />
      </Toast.Close>
    </Toast.Root>
  );
}

function ToastViewport() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Viewport className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 outline-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </Toast.Viewport>
  );
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} timeout={6000} limit={5}>
      <ToastViewport />
    </Toast.Provider>
  );
}
