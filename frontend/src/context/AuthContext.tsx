"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { disconnectRealtime } from "@/lib/realtime";
import { cacheClear } from "@/lib/api-cache";

export type AuthUser = {
  id: number | null;
  name: string;
  email: string;
  softwareDesignation: string;
  staffId: string | null;
  photoUrl: string | null;
  token?: string;
};

type AuthContextType = {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string, preventRedirect?: boolean, deviceOS?: string) => Promise<AuthUser | void>;
  completeLogin: (user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "canaan_erp_user";
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  // Redirect unauthenticated users to /login, authenticated users away from /login
  useEffect(() => {
    if (!ready) return;
    if (!user && pathname !== "/login") {
      router.replace("/login");
    } else if (user) {
      // Every role now has a dashboard at "/" — send authenticated users there.
      if (pathname === "/login") {
        router.replace("/");
      }
    }
  }, [user, ready, pathname, router]);

  async function login(username: string, password: string, preventRedirect: boolean = false, deviceOS?: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Tag the device-lock binding with the OS so admins can identify devices.
        ...(deviceOS ? { "X-Device-OS": deviceOS } : {}),
      },
      credentials: "include", // send/receive the device-lock httpOnly cookie
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? "Invalid credentials");
    }
    const data = await res.json();
    const authUser: AuthUser = {
      id: data.id ?? null,
      name: data.name,
      email: data.email,
      softwareDesignation: data.software_designation,
      staffId: data.staff_id ?? null,
      photoUrl: data.photo_url ?? null,
      token: data.access_token,
    };
    
    if (preventRedirect) {
      return authUser;
    }
    
    completeLogin(authUser);
  }

  function completeLogin(authUser: AuthUser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
    // All roles land on their dashboard at "/".
    router.replace("/");
  }

  function logout() {
    // Best-effort server-side token revocation so a stolen-but-unexpired token
    // can't be reused after logout (SECURITY_PLAN.md MEDIUM-2). Fire-and-forget.
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const token = stored ? (JSON.parse(stored) as { token?: string }).token : undefined;
      if (token) {
        void fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
    localStorage.removeItem(STORAGE_KEY);
    disconnectRealtime();
    cacheClear();
    setUser(null);
    router.replace("/login");
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, completeLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
