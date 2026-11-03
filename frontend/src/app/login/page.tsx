"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  RiCheckLine,
  RiErrorWarningLine,
  RiEyeLine,
  RiEyeOffLine,
  RiLockLine,
  RiUserLine,
} from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { LOGOUT_REASON_KEY } from "@/lib/api";
import { Button } from "@/components/base/buttons/button";
import { InputBase, TextField } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { TruckScene } from "@/components/illustrations/TruckScene";

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
 * The S-curve dividing the brand panel from the form, in objectBoundingBox
 * units so one path drives both the panel's clip-path and the gold edge.
 */
const CURVE =
  "M0.855,0 C0.985,0.16 1.0,0.30 0.995,0.44 C0.99,0.60 0.895,0.70 0.885,0.82 C0.877,0.91 0.900,0.96 0.905,1";

export default function LoginPage() {
  const { login, completeLogin } = useAuth();
  const deviceOS = useDeviceOS(); // "Windows" | "macOS" | "iOS" | "Android" | "Linux" | ...
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginState, setLoginState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Why the last session ended (e.g. the account was frozen) — shown once.
  useEffect(() => {
    try {
      const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
      if (reason) {
        sessionStorage.removeItem(LOGOUT_REASON_KEY);
        setError(reason);
      }
    } catch {}
  }, []);

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

  const busy = loginState === "loading" || loginState === "success";

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-background-full">
      {/* The S-curve clip shared by the brand panel and its gold edge. */}
      <svg aria-hidden="true" className="absolute size-0">
        <defs>
          <clipPath id="canaanHeroCurve" clipPathUnits="objectBoundingBox">
            <path d={`M0,0 L${CURVE.slice(1)} L0,1 Z`} />
          </clipPath>
        </defs>
      </svg>

      {/* Brand panel — fixed navy in both themes, bounded by the S curve */}
      <aside className="relative hidden w-[52%] shrink-0 lg:block">
        <div
          // eslint-disable-next-line no-restricted-syntax -- the brand S-curve panel: navy is the brand, the same in both themes
          className="absolute inset-0 bg-linear-to-b from-brand-navy to-brand-navy-deep"
          style={{ clipPath: "url(#canaanHeroCurve)" }}
        />
        <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible" viewBox="0 0 1 1" preserveAspectRatio="none">
          <path d={CURVE} fill="none" className="stroke-gold-500" strokeWidth={4} vectorEffect="non-scaling-stroke" />
        </svg>

        <div className="illo-on-brand relative flex h-full w-[84%] flex-col justify-between py-10 pl-12 xl:pl-16">
          <img src="/companylogo-dark.png" alt="Canaan Global" className="h-14 w-auto self-start object-contain xl:h-16" />

          <div className="flex flex-col gap-8 pr-8">
            {/* The fleet truck between its plants, as on the dashboard. */}
            <TruckScene className="h-56 max-w-[34rem] xl:h-64" />
            <div className="flex max-w-md flex-col gap-2">
              <h1 className="text-title-1-medium text-on-solid">
                Moving together. <span className="text-gold-400">Growing together</span>
              </h1>
              <p className="text-body-regular text-on-solid/70">
                Trips, trucks, tyres, drivers, attendance and accounts for Canaan Global International
              </p>
            </div>
          </div>

          <p className="text-caption-1-regular text-on-solid/50">© {new Date().getFullYear()} Canaan Global International</p>
        </div>
      </aside>

      {/* Sign-in */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="flex w-full max-w-sm flex-col gap-8">
          {/* The login page is always light (ThemeContext), so one logo. */}
          <img src="/companylogo.png" alt="Canaan Global" className="h-12 w-auto self-start object-contain lg:hidden" />

          <div className="flex flex-col gap-1">
            <h2 className="text-title-1-medium text-text-primary">Sign in</h2>
            <p className="text-body-regular text-text-secondary">Use your Canaan ERP username and password</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <TextField isRequired value={username} onChange={setUsername} autoComplete="username" className="flex flex-col gap-1.5">
              <Label>Username or email</Label>
              <InputBase leadingIcon={RiUserLine} className="input-no-transform" />
            </TextField>

            <TextField
              isRequired
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              className="flex flex-col gap-1.5"
            >
              <Label>Password</Label>
              <InputBase
                leadingIcon={RiLockLine}
                className="input-no-transform"
                trailingAddon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="flex size-6 items-center justify-center rounded-md text-foreground-icon-tertiary outline-none transition-colors hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    {showPassword ? <RiEyeOffLine className="size-4" aria-hidden /> : <RiEyeLine className="size-4" aria-hidden />}
                  </button>
                }
              />
            </TextField>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-surface px-3 py-2.5 text-body-regular text-danger-text">
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={busy}
              variant={loginState === "error" ? "danger" : "primary"}
              leadingIcon={loginState === "success" ? RiCheckLine : undefined}
              className="mt-2 w-full"
            >
              {loginState === "loading"
                ? "Signing in…"
                : loginState === "success"
                  ? "Signed in"
                  : loginState === "error"
                    ? "Access denied"
                    : "Sign in"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
