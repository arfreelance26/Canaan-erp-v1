"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, AlertCircle, Truck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function useBackendStatus() {
  const [online, setOnline] = useState<boolean | null>(null);
  if (typeof window !== "undefined") {
    // intentionally light — just show status, no useEffect needed here;
    // done via inline effect below
  }
  return online;
}

export default function LoginPage() {
  const { login, completeLogin } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginState, setLoginState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // Check backend connectivity once on mount
  if (typeof window !== "undefined" && backendOnline === null) {
    fetch(`${API_URL}/`)
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoginState("loading");
    try {
      const authUser = await login(username.trim(), password, true);
      if (!authUser) throw new Error("Failed to get user context");
      
      setLoginState("success");
      setTimeout(() => {
        completeLogin(authUser);
      }, 1500);
    } catch (err) {
      setLoginState("error");
      setError(err instanceof Error ? err.message : "Login failed");
      setTimeout(() => {
        setLoginState(s => s === "error" ? "idle" : s);
      }, 2000);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-200">
      
      {/* 1. Topographic Lines Base */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 mix-blend-multiply opacity-10"
        style={{
          backgroundImage: `
            repeating-radial-gradient( circle at 0 0, transparent 0, #000 1px, transparent 1px, transparent 40px ),
            repeating-radial-gradient( circle at 100% 100%, transparent 0, #000 1px, transparent 1px, transparent 60px )
          `
        }}
      />

      {/* 2. Soft Silk Waves / Folded Paper */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Soft edge 1 */}
        <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] origin-top-left bg-gradient-to-br from-white/90 via-slate-50/10 to-transparent shadow-[0_20px_100px_rgba(0,0,0,0.03)] border-b border-white/80 animate-silk-drift" />
        {/* Soft edge 2 */}
        <div className="absolute bottom-[-10%] right-[-10%] w-[120%] h-[120%] origin-bottom-right bg-gradient-to-tl from-slate-200/50 via-slate-50/10 to-transparent shadow-[0_-20px_100px_rgba(0,0,0,0.03)] border-t border-white/60 animate-silk-drift-reverse" />
      </div>

      {/* 3. Light Beams */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden mix-blend-overlay">
        <div className="absolute top-[-20%] left-[10%] w-[800px] h-[300px] bg-gradient-to-r from-transparent via-white/80 to-transparent blur-[80px] animate-beam-sweep" />
        <div className="absolute top-[-20%] left-[40%] w-[1200px] h-[400px] bg-gradient-to-r from-transparent via-white/60 to-transparent blur-[120px] animate-beam-sweep-delayed" />
      </div>

      {/* Main Card Container */}
      <div
        className="relative z-10 w-full max-w-xl animate-cinematic-enter px-4"
        style={{ animationDelay: "0ms" }}
      >
        <div className="relative overflow-hidden rounded-2xl bg-white/70 px-8 py-10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] backdrop-blur-2xl ring-1 ring-black/5">
          {/* Card Glass Highlight & Inner Border */}
          <div className="absolute inset-0 z-0 pointer-events-none rounded-2xl border-t border-white/80 border-l border-white/30" />
          {/* Card Noise Texture */}
          <div 
            className="absolute inset-0 z-0 opacity-[0.03] mix-blend-overlay pointer-events-none" 
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} 
          />
          {/* Brand */}
          <div className="relative z-10 mb-8 flex flex-col items-center animate-cinematic-enter" style={{ animationDelay: "300ms" }}>
            <div className="login-logo-wrap">
              <img
                src="/companylogo.png"
                alt="Canaan Global"
                className="h-[100px] w-full object-contain"
              />
            </div>
          </div>

          {/* Heading */}
          <div className="relative z-10 mb-7 text-center animate-cinematic-enter" style={{ animationDelay: "700ms" }}>
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">
              Sign in to your account to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="relative z-10 flex flex-col gap-5">
            {/* Email */}
            <div className="relative group animate-cinematic-enter" style={{ animationDelay: "900ms" }}>
              <input
                id="username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder=" "
                className="input-no-transform peer w-full rounded-xl border border-gray-200 bg-white/50 px-4 pt-6 pb-2 text-sm text-gray-900 transition-all duration-300 focus:border-[#D4AF37] focus:bg-white focus:shadow-[0_0_15px_rgba(212,175,55,0.15)] focus:outline-none hover:border-gray-300 backdrop-blur-sm"
              />
              <label
                htmlFor="username"
                className="pointer-events-none absolute left-4 top-4 text-xs text-gray-400 transition-all duration-300 -translate-y-2.5 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:text-sm peer-focus:-translate-y-2.5 peer-focus:text-xs peer-focus:text-[#D4AF37]"
              >
                Username
              </label>
            </div>

            {/* Password */}
            <div className="relative animate-cinematic-enter" style={{ animationDelay: "1050ms" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                className="input-no-transform peer w-full rounded-xl border border-gray-200 bg-white/50 px-4 pt-6 pb-2 pr-10 text-sm text-gray-900 transition-all duration-300 focus:border-[#D4AF37] focus:bg-white focus:shadow-[0_0_15px_rgba(212,175,55,0.15)] focus:outline-none hover:border-gray-300 backdrop-blur-sm"
              />
              <label
                htmlFor="password"
                className="pointer-events-none absolute left-4 top-4 text-xs text-gray-400 transition-all duration-300 -translate-y-2.5 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:text-sm peer-focus:-translate-y-2.5 peer-focus:text-xs peer-focus:text-[#D4AF37]"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600 animate-cinematic-enter" style={{ animationDelay: "0ms" }}>
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="animate-cinematic-enter" style={{ animationDelay: "1200ms" }}>
              <button
                type="submit"
                disabled={loginState === "loading" || loginState === "success"}
                className={`mt-1 flex w-full h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(27,43,94,0.35)] transition-all duration-200 overflow-hidden relative ${
                loginState === "error" ? "bg-red-600" : ""
              } ${
                loginState === "success" ? "bg-green-600" : ""
              } ${
                loginState === "idle" || loginState === "loading"
                  ? "bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                  : ""
              }`}
            >
              {loginState === "loading" && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              )}
              {loginState === "idle" && "Sign In"}
              {loginState === "error" && (
                <div className="absolute inset-0 flex items-center justify-center gap-2">
                  <Truck className="h-5 w-5 text-white animate-truck-stall" />
                  <span className="font-medium animate-fade-in-delayed tracking-wide text-[13px]">Access Denied</span>
                </div>
              )}
              {loginState === "success" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Truck className="h-6 w-6 text-white animate-truck-success" />
                </div>
              )}
              </button>
            </div>
          </form>
        </div>

        {/* Backend status */}
        {/* <div className="mt-4 flex justify-center">
          {backendOnline === false && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Backend offline — run start.sh
            </span>
          )}
          {backendOnline === true && (
            <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Connected
            </span>
          )}
        </div> */}
      </div>
    </div>
  );
}
