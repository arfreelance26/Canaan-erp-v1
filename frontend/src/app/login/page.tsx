"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
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
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8fafc]">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-blue-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-100/40 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-50/80 blur-2xl" />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-xl animate-[slideUpFade_0.5s_cubic-bezier(0.175,0.885,0.32,1.275)_both]"
        style={{ animationDelay: "50ms" }}
      >
        <div className="rounded-2xl border border-white/70 bg-white/80 px-8 py-10 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center">
            <img
              src="/companylogo.png"
              alt="Canaan Global"
              className="h-[100px] w-full object-contain"
            />
          </div>

          {/* Heading */}
          <div className="mb-7 text-center">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">
              Sign in to your account to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Email */}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">
                Email address
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-gray-200 bg-white/80 px-3.5 py-2.5 text-sm text-gray-900 backdrop-blur-sm transition-all duration-200 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(27,43,94,0.1)] focus:outline-none hover:border-gray-300"
              />
            </label>

            {/* Password */}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-gray-200 bg-white/80 px-3.5 py-2.5 pr-10 text-sm text-gray-900 backdrop-blur-sm transition-all duration-200 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(27,43,94,0.1)] focus:outline-none hover:border-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(27,43,94,0.35)] transition-all duration-200 hover:bg-blue-700 hover:shadow-[0_6px_20px_rgba(27,43,94,0.4)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Backend status */}
        <div className="mt-4 flex justify-center">
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
        </div>
      </div>
    </div>
  );
}
