"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  RiErrorWarningLine,
  RiEyeLine,
  RiEyeOffLine,
  RiGlobalLine,
  RiLoader4Line,
  RiLockLine,
  RiShieldCheckLine,
  RiTeamLine,
  RiTruckLine,
  RiUserLine,
} from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { LOGOUT_REASON_KEY } from "@/lib/api";
import { Button } from "@/components/base/buttons/button";
import { InputBase, TextField } from "@/components/base/input/input";
import { useEnter } from "@/lib/motion";
import { cx } from "@/utils/cx";

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

/** The three promises along the foot of the brand panel. */
const HIGHLIGHTS = [
  { Icon: RiShieldCheckLine, lines: ["Trusted", "Operations"] },
  { Icon: RiGlobalLine, lines: ["Global", "Reach"] },
  { Icon: RiTeamLine, lines: ["Stronger", "Together"] },
];

export default function LoginPage() {
  const { login, completeLogin } = useAuth();
  const deviceOS = useDeviceOS(); // "Windows" | "macOS" | "iOS" | "Android" | "Linux" | ...
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginState, setLoginState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useEnter(pageRef);

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
    if (loginState === "loading" || loginState === "success") return;
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
    <div ref={pageRef} className="relative flex min-h-screen w-full overflow-hidden bg-linear-to-b from-background-tertiary-default via-background-secondary-default to-warning-surface">
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
          <path d={CURVE} fill="none" className="stroke-gold-strong" strokeWidth={4} vectorEffect="non-scaling-stroke" />
        </svg>

        <div className="relative flex h-full w-[86%] flex-col justify-between py-10 pl-12 xl:pl-16">
          <img data-enter src="/companylogo-dark.png" alt="Canaan Global" className="h-16 w-auto self-start object-contain xl:h-20" />

          <h1 data-enter className="text-center text-display-3-semibold text-on-solid xl:text-display-2-semibold">
            Moving Together.
            <br />
            <span className="text-gold-strong">Growing Together.</span>
          </h1>

          <div data-enter className="flex items-stretch">
            {HIGHLIGHTS.map(({ Icon, lines }, i) => (
              <div
                key={lines.join(" ")}
                className={`flex max-w-[150px] flex-1 flex-col items-center gap-2.5 px-4 text-center ${i > 0 ? "border-l border-on-solid/15" : ""}`}
              >
                <Icon className="size-7 text-gold-strong" aria-hidden />
                <p className="text-body-2-medium text-on-solid">
                  {lines[0]}
                  <br />
                  {lines[1]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Sign-in — on the page's soft grey, which warms toward the bottom */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div data-enter className="flex w-full max-w-[440px] flex-col items-center gap-6">
          <div className="w-full rounded-3xl border border-separator-border bg-background-primary-default px-8 py-9 shadow-2xl">
            {/* The login page is always light (ThemeContext), so one logo. */}
            <div className="mb-6 flex flex-col items-center gap-4 text-center">
              <img src="/companylogo.png" alt="Canaan Global" className="h-24 w-auto object-contain" />
              <div className="flex flex-col gap-1">
                <h2 className="text-title-1-semibold text-text-primary">Welcome Back</h2>
                <p className="text-body-regular text-text-secondary">Sign in to access your account</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <TextField isRequired aria-label="Username or email" value={username} onChange={setUsername} autoComplete="username">
                <InputBase placeholder="Username or Email" leadingIcon={RiUserLine} className="input-no-transform autofill:shadow-[inset_0_0_0_1000px_var(--color-background-primary-default)]" fieldClassName="h-12 rounded-xl bg-background-primary-default ring-1 ring-border-button-default" />
              </TextField>

              <TextField
                isRequired
                aria-label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              >
                <InputBase
                  placeholder="Password"
                  leadingIcon={RiLockLine}
                  className="input-no-transform autofill:shadow-[inset_0_0_0_1000px_var(--color-background-primary-default)]"
                  fieldClassName="h-12 rounded-xl bg-background-primary-default ring-1 ring-border-button-default"
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
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-surface px-3 py-2.5 text-body-regular text-danger-text">
                  <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {error}
                </div>
              )}

              {/* Not disabled while busy (a disabled BoardUI button greys out
                  and would hide the success truck); handleSubmit ignores
                  clicks instead. */}
              <Button
                type="submit"
                aria-busy={busy}
                variant={loginState === "error" ? "danger" : "primary"}
                className={cx(
                  "relative mt-2 h-12 w-full overflow-hidden rounded-xl shadow-md",
                  // eslint-disable-next-line no-restricted-syntax -- the brand navy Sign In, as on the old login page
                  (loginState === "idle" || loginState === "loading") && "bg-brand-navy-deep hover:bg-brand-navy",
                  loginState === "success" && "bg-success-solid text-on-solid hover:bg-success-solid",
                  loginState === "error" && "bg-danger-solid text-on-solid hover:bg-danger-solid",
                )}
              >
                {loginState === "idle" && "Sign In"}
                {loginState === "loading" && (
                  <span className="flex items-center gap-2">
                    <RiLoader4Line className="size-4 animate-spin" aria-hidden />
                    Signing in…
                  </span>
                )}
                {loginState === "success" && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <RiTruckLine className="size-6 animate-login-truck-go" aria-hidden />
                    <span className="sr-only">Signed in</span>
                  </span>
                )}
                {loginState === "error" && (
                  <span className="absolute inset-0 flex items-center justify-center gap-2">
                    <RiTruckLine className="size-5 animate-login-truck-stall" aria-hidden />
                    <span className="animate-login-denied-text text-body-2-medium">Access denied</span>
                  </span>
                )}
              </Button>
            </form>
          </div>

          <p className="text-caption-1-regular text-text-secondary">© {new Date().getFullYear()} Canaan Global. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}
