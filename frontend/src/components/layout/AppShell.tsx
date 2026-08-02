"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/context/AuthContext";
// import { ERPChatWidget } from "@/components/ai/ERPChatWidget"; // Next phase

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
