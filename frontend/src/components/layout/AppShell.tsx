"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/context/AuthContext";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { showToast } from "@/lib/swal";
import { useChatMessageToasts } from "@/hooks/useChatMessageToasts";
import { cn } from "@/lib/utils";
// import { ERPChatWidget } from "@/components/ai/ERPChatWidget"; // Next phase

const IDLE_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // initialIdle=false — otherwise the hook reports "idle" on first render and
  // the effect below would log the user out immediately on every refresh.
  const isIdle = useIdleTimer(IDLE_TIMEOUT_MS, false);

  useChatMessageToasts();

  useEffect(() => {
    if (isIdle && user) {
      logout();
    }
  }, [isIdle, user, logout]);

  useEffect(() => {
    if (pathname?.startsWith("/connect/chat")) {
      setCollapsed(true);
    }
  }, [pathname]);

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
      {/* Sidebar is `position: fixed` at every breakpoint (see Sidebar.tsx),
          so it no longer participates in this flex row — this spacer exists
          purely to reserve its footprint. Its width snaps instantly (no
          transition) instead of animating alongside the sidebar: a single
          one-off reflow of main content at click-time is imperceptible,
          versus reflowing it on every frame of a 200ms transition. The fixed
          sidebar sits above (z-50) and visually covers this boundary while
          it animates, so the instant snap underneath is never seen. */}
      <div className={cn("hidden shrink-0 md:block", collapsed ? "md:w-16" : "md:w-[310px]")} />
      <div className="flex min-w-0 flex-1 flex-col [contain:layout_style]">
        <Topbar onMenuOpen={() => setMobileMenuOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-3 dark:bg-[#090c14] sm:p-4 md:p-6">{children}</main>
      </div>
      {/* <ERPChatWidget /> */}{/* Next phase */}
    </div>
  );
}
