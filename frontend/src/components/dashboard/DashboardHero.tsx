"use client";

import { useRef, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { useEnter } from "@/lib/motion";
import { Illustration } from "@/components/illustrations/Illustration";
import { HERO_TRUCK, TruckScene } from "@/components/illustrations/TruckScene";
import type { IllustrationName } from "@/components/illustrations/assets";
import { useAuth } from "@/context/AuthContext";
import { callName } from "@/lib/call-name";

/** The fleet truck photo every dashboard hero shows by default. */
export { HERO_TRUCK } from "@/components/illustrations/TruckScene";

/** Time-of-day greeting in India time. */
export function greetingFor(d: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(d));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type DashboardHeroProps = {
  /** Small line above the title; defaults to today's date (plus `role`). */
  eyebrow?: ReactNode;
  /** Which dashboard this is, shown after the date, e.g. "Yard Supervisor". */
  role?: string;
  /** Defaults to "Good afternoon, <first name>". */
  title?: ReactNode;
  /** One factual line under the title. */
  description?: ReactNode;
  /** Buttons / menus; the first should be the primary action. */
  actions?: ReactNode;
  /** An unDraw scene on the right instead of the truck (hidden on small screens)… */
  illustration?: IllustrationName;
  /** …or a different photo (transparent PNG). Defaults to the fleet truck with unDraw plants. */
  image?: { src: string; alt: string };
  /** Anything pinned to the top-right corner (e.g. a date badge). */
  aside?: ReactNode;
  className?: string;
};

/**
 * The top card of every dashboard: what day it is, who you are, the one line
 * that matters, the main actions, and an illustration of the role's world.
 * Token-only, so it reads the same in light and dark.
 */
export function DashboardHero({ eyebrow, role, title, description, actions, illustration, image, aside, className }: DashboardHeroProps) {
  const ref = useRef<HTMLElement>(null);
  useEnter(ref);
  const { user } = useAuth();
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const line = eyebrow ?? (role ? `${date} · ${role}` : date);
  const heading = title ?? `${greetingFor(new Date())}, ${callName(user?.name, user?.preferredName) || "there"}`;
  const photo = image ?? (illustration ? undefined : HERO_TRUCK);

  return (
    <section
      ref={ref}
      data-tour="dashboard-hero"
      className={cx(
        "relative w-full overflow-hidden rounded-3xl border border-separator-border bg-background-primary-default",
        className,
      )}
    >
      {/* A faint dot grid, strongest behind the truck and fading out before
          the greeting, so the card isn't a flat pale box (styles/brand.css). */}
      <div aria-hidden className="hero-dots pointer-events-none absolute inset-0" />

      {/* Soft tonal wash behind the illustration — accent surface only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 md:block"
        style={{ background: "radial-gradient(60% 80% at 75% 50%, var(--color-accent-surface) 0%, transparent 70%)" }}
      />

      <div className="relative grid items-center gap-6 px-6 py-8 sm:px-10 sm:py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col gap-3" data-enter>
          <p className="text-body-regular text-text-tertiary">{line}</p>
          <h1 className="text-display-2-semibold text-text-primary">{heading}</h1>
          {description && <p className="max-w-2xl text-headline-regular text-text-secondary">{description}</p>}
          {actions && <div className="mt-3 flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>

        <div className="relative hidden justify-end md:flex" data-enter>
          {photo ? (
            <TruckScene image={photo} className="h-44 max-w-[30rem] lg:h-52" />
          ) : illustration ? (
            <Illustration name={illustration} className="h-48 w-full max-w-[26rem] lg:h-56" />
          ) : null}
        </div>
      </div>

      {aside && <div className="absolute right-4 top-4">{aside}</div>}
    </section>
  );
}
