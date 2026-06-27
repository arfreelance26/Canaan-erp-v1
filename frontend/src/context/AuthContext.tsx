"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

export type AuthUser = {
  id: number | null;
  name: string;
  email: string;
  softwareDesignation: string;
  staffId: string | null;
  photoUrl: string | null;
};

type AuthContextType = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string, preventRedirect?: boolean) => Promise<AuthUser | void>;
  completeLogin: (user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "canaan_erp_user";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Rehydrate from localStorage on mount
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
    } else if (user && pathname === "/login") {
      router.replace("/");
    }
  }, [user, ready, pathname, router]);

  async function login(email: string, password: string, preventRedirect: boolean = false) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
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
    };
    
    if (preventRedirect) {
      return authUser;
    }
    
    completeLogin(authUser);
  }

  function completeLogin(authUser: AuthUser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
    router.replace("/");
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
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
