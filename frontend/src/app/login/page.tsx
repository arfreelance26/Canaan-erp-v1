"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Truck,
  User,
  Lock,
  ShieldCheck,
  Globe,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function useDeviceOS(): string {
  const [os, setOS] = useState("");
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) setOS("Windows");
    else if (/iPhone|iPad/i.test(ua)) setOS("iOS");
    else if (/Android/i.test(ua)) setOS("Android");
    else if (/Mac/i.test(ua)) setOS("macOS");
    else if (/Linux/i.test(ua)) setOS("Linux");
    else setOS("Unknown");
  }, []);
  return os;
}

/**
 * The S-curve that divides the hero from the form, in objectBoundingBox units so
 * the same geometry drives both the panel's clip-path and the gold edge stroke.
 */
const CURVE =
  "M0.855,0 C0.985,0.16 1.0,0.30 0.995,0.44 C0.99,0.60 0.895,0.70 0.885,0.82 C0.877,0.91 0.900,0.96 0.905,1";

const HIGHLIGHTS = [
  { Icon: ShieldCheck, lines: ["Trusted", "Operations"] },
  { Icon: Globe, lines: ["Global", "Reach"] },
  { Icon: Users, lines: ["Stronger", "Together"] },
];

export default function LoginPage() {
  const { login, completeLogin } = useAuth();
  const deviceOS = useDeviceOS(); // "Windows" | "macOS" | "iOS" | "Android" | "Linux" | ...
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginState, setLoginState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoginState("loading");
    try {
      const authUser = await login(username.trim(), password, true, deviceOS);
      if (!authUser) throw new Error("Failed to get user context");

      setLoginState("success");
      setTimeout(() => {
        completeLogin(authUser);
      }, 1500);
    } catch (err) {
      setLoginState("error");
      setError(err instanceof Error ? err.message : "Login failed");
      setTimeout(() => {
        setLoginState((s) => (s === "error" ? "idle" : s));
      }, 2000);
    }
  }

  return (
    <div className="login-shell relative flex h-screen w-full overflow-hidden">
      {/* The clip path is shared by the hero panel and its gold edge. */}
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <defs>
          <clipPath id="canaanHeroCurve" clipPathUnits="objectBoundingBox">
            <path d={`M0,0 L${CURVE.slice(1)} L0,1 Z`} />
          </clipPath>
        </defs>
      </svg>

      {/* ── Hero panel ─────────────────────────────────────────────────────── */}
      <div className="login-hero relative hidden w-[52%] shrink-0 lg:block">
        <div
          className="absolute inset-0 bg-[#0b1a3a]"
          style={{ clipPath: "url(#canaanHeroCurve)" }}
        >
          {/* Photograph, if one has been dropped in — the gradient below stands
              in for it otherwise, so the panel never renders empty. */}
          <div className="login-hero-photo absolute inset-0" />
          {/* Deep-sea gradient + navy scrim so the headline always clears the art */}
          <div className="login-hero-wash absolute inset-0" />
        </div>

        {/* Gold edge — same path, stroked rather than filled */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          <path
            d={CURVE}
            fill="none"
            stroke="#e0a92b"
            strokeWidth={5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Hero content */}
        <div className="relative z-10 flex h-full w-[86%] flex-col justify-between py-8 pl-12 xl:pl-16">
          <img
            src="/companylogo.png"
            alt="Canaan Global"
            className="h-16 w-auto object-contain object-left animate-cinematic-enter xl:h-20"
            style={{ animationDelay: "100ms" }}
          />

          <div
            className="animate-cinematic-enter max-w-[30ch]"
            style={{ animationDelay: "300ms" }}
          >
            <h1 className="text-3xl font-bold leading-[1.25] tracking-tight text-white xl:text-4xl">
              Moving Together.
              <br />
              <span className="text-[#e0a92b]">Growing Together.</span>
            </h1>
          </div>

          <div
            className="animate-cinematic-enter flex items-stretch"
            style={{ animationDelay: "500ms" }}
          >
            {HIGHLIGHTS.map(({ Icon, lines }, i) => (
              <div
                key={lines.join(" ")}
                className={`flex flex-1 max-w-[150px] flex-col items-center gap-2.5 px-4 text-center ${
                  i > 0 ? "border-l border-white/15" : ""
                }`}
              >
                <Icon className="h-6 w-6 text-[#e0a92b]" strokeWidth={1.6} />
                <p className="text-[13px] leading-snug text-white/90">
                  {lines[0]}
                  <br />
                  {lines[1]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form side ──────────────────────────────────────────────────────── */}
      <div className="login-form-side relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-6">
        {/* Subtle depth glows, top-right and bottom-right corners, drifting slowly */}
        <div className="login-glass-blobs pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />

        {/* Fine grain — keeps the flat fill from looking like a solid color swatch */}
        <div className="login-grain pointer-events-none absolute inset-0" aria-hidden="true" />

        <div
          className="animate-cinematic-enter relative z-10 w-full max-w-[440px]"
          style={{ animationDelay: "200ms" }}
        >
          <div className="login-card rounded-3xl px-8 py-8">
            {/* Brand mark — the lockup's navy text/waves vanish on a dark card,
                so dark mode gets a light plate behind it; see .login-logo-wrap */}
            <div className="login-logo-wrap mb-4 flex justify-center">
              <img
                src="/companylogo.png"
                alt="Canaan Global"
                className="h-24 w-auto object-contain"
              />
            </div>

            <h2 className="text-center text-2xl font-bold tracking-tight text-[#0b1a3a]">
              Welcome Back
            </h2>
            <p className="mt-1.5 text-center text-[14px] text-gray-500">
              Sign in to access your account
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
              {/* Username */}
              <div className="login-field">
                <User className="login-field-icon h-[18px] w-[18px]" strokeWidth={2.2} />
                <input
                  id="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username or Email"
                  className="input-no-transform w-full bg-transparent text-[15px] text-[#0b1a3a] placeholder:text-gray-400 focus:outline-none"
                />
              </div>

              {/* Password */}
              <div className="login-field">
                <Lock className="login-field-icon h-[18px] w-[18px]" strokeWidth={2.2} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="input-no-transform w-full bg-transparent pr-8 text-[15px] text-[#0b1a3a] placeholder:text-gray-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>

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
                disabled={loginState === "loading" || loginState === "success"}
                className={`relative mt-1 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[16px] font-semibold text-white transition-all duration-200 ${
                  loginState === "error"
                    ? "bg-red-600"
                    : loginState === "success"
                      ? "bg-green-600"
                      : "bg-[#0b1a3a] shadow-[0_10px_24px_-10px_rgba(11,26,58,0.7)] hover:bg-[#122550] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
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
                    <Truck className="h-5 w-5 animate-truck-stall text-white" />
                    <span className="animate-fade-in-delayed text-[13px] font-medium tracking-wide">
                      Access Denied
                    </span>
                  </div>
                )}
                {loginState === "success" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Truck className="h-6 w-6 animate-truck-success text-white" />
                  </div>
                )}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-[13px] text-gray-500">
            © {new Date().getFullYear()} Canaan Global. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
