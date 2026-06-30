"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/context/AuthContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready } = useAuth();

  // Login page always renders without the shell
  if (pathname === "/login" || pathname === "/login/") {
    return <>{children}</>;
  }

  // While rehydrating from localStorage, render nothing to avoid flash
  if (!ready) return null;

  // Not authenticated: AuthContext will redirect to /login; render nothing in the meantime
  if (!user) return null;

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
