"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/context/AuthContext";
import { useIdle } from "react-haiku";
import { showToast } from "@/lib/swal";
import { useChatMessageToasts } from "@/hooks/useChatMessageToasts";
// import { ERPChatWidget } from "@/components/ai/ERPChatWidget"; // Next phase

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // initialState:false — otherwise the hook reports "idle" on first render and
  // the effect below would log the user out immediately on every refresh.
  const isIdle = useIdle(IDLE_TIMEOUT_MS, { initialState: false });

  useChatMessageToasts();

  useEffect(() => {
    if (isIdle && user) {
      logout();
    }
  }, [isIdle, user, logout]);

  // Catch NetworkError instances that escape page-level useEffect calls
  // (pages that call Promise.all without a .catch()). Prevents a crash and
  // shows a non-blocking toast instead.
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      if (e.reason?.name === "NetworkError") {
        e.preventDefault();
        showToast(e.reason.message, "error", "Connection error");
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  if (pathname === "/login" || pathname === "/login/") {
    return <>{children}</>;
  }

  if (!ready) return null;
  if (!user) return null;

  return (
    <div className="flex h-full">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuOpen={() => setMobileMenuOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-3 dark:bg-[#090c14] sm:p-4 md:p-6">{children}</main>
      </div>
      {/* <ERPChatWidget /> */}{/* Next phase */}
    </div>
  );
}
