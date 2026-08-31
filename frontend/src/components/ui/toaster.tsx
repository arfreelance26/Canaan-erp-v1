"use client";

import { useEffect, useState } from "react";
import { Toast } from "@base-ui-components/react/toast";
import { X, CheckCircle2, AlertTriangle, Info, XCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastManager } from "@/lib/toast-manager";

const TYPE_STYLES: Record<string, string> = {
  success: "border-emerald-200 bg-white dark:bg-[#141929]",
  error:   "border-red-200 bg-white dark:bg-[#141929]",
  warning: "border-amber-200 bg-white dark:bg-[#141929]",
  info:    "border-blue-200 bg-white dark:bg-[#141929]",
  chat:    "border-brand-navy/20 bg-white dark:bg-[#141929]",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error:   <XCircle className="h-4 w-4 text-red-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  info:    <Info className="h-4 w-4 text-blue-500" />,
  chat:    (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy">
      <MessageSquare className="h-3.5 w-3.5 text-brand-gold" />
    </span>
  ),
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
        // Slide + fade, both directions. base-ui stamps data-starting-style on
        // mount (removed a frame later) and data-ending-style while closing —
        // matching both here is what actually makes this animate; the "closing"
        // half of this used to target a non-existent attribute and silently
        // did nothing.
        "transition-all duration-300 ease-out",
        "data-[starting-style]:opacity-0 data-[starting-style]:translate-x-8 data-[starting-style]:-translate-y-1",
        "data-[ending-style]:opacity-0 data-[ending-style]:translate-x-8",
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
  // Mount one tick after first paint, in its own commit. base-ui's Toast.Root
  // calls flushSync from a layout effect when it measures a toast's height;
  // if <Toaster/> mounts as part of the same giant initial commit as the rest
  // of the provider tree (RootLayout -> ThemeProvider -> ... -> AppShell),
  // React is still mid-commit for that whole tree and refuses the flush
  // ("flushSync was called from inside a lifecycle method"). Deferring the
  // real mount by a tick gives Toast's effects a standalone commit to run in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Toast.Provider toastManager={toastManager} timeout={6000} limit={5}>
      <ToastViewport />
    </Toast.Provider>
  );
}
