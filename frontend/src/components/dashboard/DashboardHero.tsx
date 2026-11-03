"use client";

import { useRef, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { useEnter } from "@/lib/motion";
import { Illustration } from "@/components/illustrations/Illustration";
import type { IllustrationName } from "@/components/illustrations/assets";

type DashboardHeroProps = {
  /** Small line above the title; defaults to today's date. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One factual line under the title. */
  description?: ReactNode;
  /** Buttons / menus; the first should be the primary action. */
  actions?: ReactNode;
  /** unDraw scene on the right (hidden on small screens)… */
  illustration?: IllustrationName;
  /** …or a real photo instead, e.g. the fleet truck (transparent PNG). */
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
export function DashboardHero({ eyebrow, title, description, actions, illustration, image, aside, className }: DashboardHeroProps) {
  const ref = useRef<HTMLElement>(null);
  useEnter(ref);
  const line =
    eyebrow ??
    new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  return (
    <section
      ref={ref}
      className={cx(
        "relative overflow-hidden rounded-3xl border border-separator-border bg-background-primary-default",
        className,
      )}
    >
      {/* Soft tonal wash behind the illustration — accent surface only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 md:block"
        style={{ background: "radial-gradient(60% 80% at 75% 50%, var(--color-accent-surface) 0%, transparent 70%)" }}
      />

      <div className="relative grid items-center gap-6 px-6 py-8 sm:px-10 sm:py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col gap-3" data-enter>
          <p className="text-body-regular text-text-tertiary">{line}</p>
          <h1 className="text-display-2-semibold text-text-primary">{title}</h1>
          {description && <p className="max-w-2xl text-headline-regular text-text-secondary">{description}</p>}
          {actions && <div className="mt-3 flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>

        <div className="relative hidden justify-end md:flex" data-enter>
          {image ? (
            <div className="relative w-full max-w-[30rem]">
              {/* unDraw plants (from "on the way") frame the truck: tall one behind on the left, a shrub in front on the right. */}
              <Illustration name="plant-a" className="absolute bottom-1 left-0 h-44 lg:h-52" />
              {/* Ground shadow so the truck sits on the card instead of floating. */}
              <span aria-hidden className="absolute bottom-1 left-1/2 h-4 w-3/4 -translate-x-1/2 rounded-[50%] bg-scrim/15 blur-md" />
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
              <img src={image.src} alt={image.alt} className="relative ml-auto h-44 w-[80%] object-contain object-bottom lg:h-52" draggable={false} />
              <Illustration name="plant-b" className="absolute bottom-1 right-0 h-12 lg:h-14" />
            </div>
          ) : illustration ? (
            <Illustration name={illustration} className="h-48 w-full max-w-[26rem] lg:h-56" />
          ) : null}
        </div>
      </div>

      {aside && <div className="absolute right-4 top-4">{aside}</div>}
    </section>
  );
}
