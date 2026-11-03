"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "animejs";
import { useAuth } from "@/context/AuthContext";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { useJoshine, type JoshineExpression } from "@/lib/joshine";
import { cx } from "@/utils/cx";
import { JoshineFace } from "./JoshineFace";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { APP_TOUR, pageTourFor, type Tour } from "@/lib/tours";
import { hasSeenTour, markTourSeen, pageOffersOff, startTour, turnOffPageOffers, useTourState } from "./joshine-tour";

// The creator (colour picker, slider…) loads when Joshine is first clicked.
const JoshineCreator = dynamic(() => import("./JoshineCreator").then((m) => m.JoshineCreator));

/**
 * Joshine, sitting in the bottom-right corner of every page. It breathes,
 * watches the cursor and blinks; hover shows its name, a click opens the
 * creator. Tucked away, only its top peeks out of the corner until clicked.
 *
 * Joshine also gives the guided tours (lib/tours.ts, lib/page-tours.ts): it
 * offers the app tour on a person's first visit, then each page's tour the
 * first time they open that page (until they say "Don't offer page tours").
 * Its panel offers both any time, and during a tour its face follows each step.
 */
export function JoshinePet() {
  const { user } = useAuth();
  const { settings, update, reset } = useJoshine(user?.id);
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<JoshineExpression | null>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const moodTimer = useRef(0);
  const tour = useTourState();
  const pathname = usePathname();
  const pageTour = useMemo(() => pageTourFor(pathname), [pathname]);
  // The tour Joshine is offering from the corner, if any.
  const [offer, setOffer] = useState<Tour | null>(null);

  useEffect(() => () => window.clearTimeout(moodTimer.current), []);

  // Offer, once each: the app tour on the first visit, then each page's tour
  // the first time that page is opened. Waits for the page to settle.
  useEffect(() => {
    setOffer(null);
    if (!user) return;
    const next = !hasSeenTour(user.id, APP_TOUR.id)
      ? APP_TOUR
      : pageTour && !pageOffersOff(user.id) && !hasSeenTour(user.id, pageTour.id)
        ? pageTour
        : null;
    if (!next) return;
    const t = window.setTimeout(() => setOffer(next), next === APP_TOUR ? 2500 : 1500);
    return () => window.clearTimeout(t);
  }, [user, pageTour]);

  function runTour(t: Tour) {
    setOpen(false);
    setOffer(null);
    if (settings.tucked) update({ tucked: false });
    void startTour(t, settings, { userId: user?.id });
  }

  function declineOffer() {
    if (offer) markTourSeen(user?.id, offer.id);
    setOffer(null);
    react("calm", [1.04, 0.97]);
  }

  function stopPageOffers() {
    if (offer) markTourSeen(user?.id, offer.id);
    turnOffPageOffers(user?.id);
    setOffer(null);
    react("sad", [1.04, 0.97]);
  }

  // A short reaction: a squash and a passing expression.
  function react(expression: JoshineExpression, squash: [number, number]) {
    window.clearTimeout(moodTimer.current);
    setMood(expression);
    moodTimer.current = window.setTimeout(() => setMood(null), 900);
    const el = bodyRef.current;
    if (!el || prefersReducedMotion()) return;
    animate(el, {
      scaleX: [1, squash[0], 1],
      scaleY: [1, squash[1], 1],
      duration: 420,
      ease: MOTION.easeOut,
      onComplete: () => {
        el.style.transform = "";
      },
    });
  }

  function onClick() {
    if (settings.tucked) {
      update({ tucked: false });
      react("happy", [0.9, 1.1]);
      return;
    }
    setOpen((o) => !o);
    react(open ? "calm" : "happy", [1.1, 0.9]);
  }

  if (!user) return null;

  return (
    <>
      {open && (
        <JoshineCreator
          settings={settings}
          onChange={update}
          onReset={reset}
          petSize={settings.size}
          onClose={() => setOpen(false)}
          tours={[
            ...(pageTour ? [{ label: "This page", onStart: () => runTour(pageTour) }] : []),
            { label: pageTour ? "The app" : "Tour the app", onStart: () => runTour(APP_TOUR) },
          ]}
          onTuck={() => {
            setOpen(false);
            update({ tucked: true });
          }}
        />
      )}

      {/* First-visit offer, said by Joshine from the corner. */}
      {offer && !open && !tour.active && !settings.tucked && (
        <div
          role="dialog"
          aria-label={`${settings.name || "Joshine"} offers a tour of ${offer.title}`}
          style={{ bottom: settings.size + 28 }}
          className="animate-pop-in fixed right-5 z-pet w-[min(300px,calc(100vw-2.5rem))] origin-bottom-right rounded-3xl border border-border-button-default bg-background-primary-default p-4 shadow-sidebar"
        >
          {offer === APP_TOUR ? (
            <>
              <p className="text-headline-semibold text-text-primary">Hi, I&apos;m {settings.name || "Joshine"}</p>
              <p className="mt-1 text-body-regular text-text-secondary">New here? I can show you around in under a minute.</p>
            </>
          ) : (
            <>
              <p className="text-headline-semibold text-text-primary">First time on {offer.title}?</p>
              <p className="mt-1 text-body-regular text-text-secondary">I can walk you through this page.</p>
            </>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            {offer !== APP_TOUR && (
              <button
                type="button"
                onClick={stopPageOffers}
                className="me-auto rounded-md text-caption-1-regular text-text-tertiary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                Don&apos;t offer page tours
              </button>
            )}
            <Button variant="ghost" size="small" onClick={declineOffer}>
              Not now
            </Button>
            <Button size="small" onClick={() => runTour(offer)}>
              Show me
            </Button>
          </div>
        </div>
      )}

      <div
        className={cx(
          "group fixed bottom-4 right-5 z-pet transition-transform duration-500 ease-out",
          settings.tucked && "translate-y-[58%]",
        )}
      >
        {/* Name tag on hover */}
        {!settings.tucked && !open && (
          <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-separator-border bg-background-primary-default px-2.5 py-1 text-body-regular text-text-primary opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
            {settings.name || "Joshine"}
            <span className="text-text-tertiary"> · {settings.label}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onClick}
          onPointerEnter={() => !settings.tucked && !open && react("curious", [1.04, 0.97])}
          aria-label={settings.tucked ? `Bring ${settings.name || "Joshine"} back` : `${settings.name || "Joshine"}, customise`}
          aria-expanded={open}
          data-icon-motion="off"
          data-tour="joshine"
          className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <span ref={bodyRef} className="block origin-bottom">
            <span className={cx("block origin-bottom", settings.lively && "joshine-breathe")}>
              <JoshineFace
                shape={settings.shape}
                color={settings.color}
                expression={mood ?? tour.expression ?? (settings.tucked ? "sleepy" : settings.expression)}
                size={settings.size}
                lively={settings.lively && !settings.tucked}
                className="drop-shadow-[0_6px_8px_color-mix(in_srgb,var(--color-scrim)_22%,transparent)]"
              />
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
