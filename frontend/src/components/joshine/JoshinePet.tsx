"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "animejs";
import { useAuth } from "@/context/AuthContext";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { BEHAVIOUR_RULES, useJoshine, type JoshineExpression } from "@/lib/joshine";
import { cx } from "@/utils/cx";
import { JoshineFace } from "./JoshineFace";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { pageTourFor, type Tour } from "@/lib/tours";
import { APP_TOUR_ID, appTourFor } from "@/lib/app-tour";
import { formTourFor } from "@/lib/form-tours";
import { FORM_TOUR_OPENED, FORM_TOUR_START } from "@/components/ui/Dialog";
import { hasSeenTour, markTourSeen, pageOffersOff, startTour, turnOffPageOffers, useTourState } from "./joshine-tour";
import { JoshineGreeting } from "./JoshineGreeting";
import { celebrationsApi } from "@/lib/api";
import { claimTeaTime, greetingUserKey, markGreeted, pickGreeting, resetVisitGreeting, shouldGreet, teaTimeDue, teaTimeGreeting, type Greeting } from "@/lib/greetings";
import { PREVIEW_EVENT } from "@/lib/celebration-preview";
import { callName } from "@/lib/call-name";
import { GUM_FACE, JoshineGum, useGumBubble } from "./JoshineGum";
import { JoshineOutfit } from "./JoshineOutfit";
import { CHAI_BLUSH, CHAI_FACE, JoshineChai, useChai } from "./JoshineChai";
import type { JoshineOutfitKey } from "@/lib/api";
import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";
import { JOSHINE_PEEK_EVENT, SHORTCUTS } from "@/lib/shortcuts";

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
 *
 * And Joshine says hello: once per visit (lib/greetings.ts picks the line)
 * a speech bubble beside it, with its face to match, fading after 8 seconds.
 *
 * Now and then, when things are quiet, it blows a chewing-gum bubble (JoshineGum.tsx).
 *
 * What it wears (JoshineOutfit.tsx): reading glasses while a form is open; a
 * party hat on the person's birthday, a crown on Founding Day, a Santa hat at
 * Christmas; and a glass of chai at tea time (11:00–11:02 and 16:00–16:02 IST),
 * sipped step by step (JoshineChai.tsx).
 * Energetic or Calm (her panel, "Adjust Joshine's Behaviour"): lib/joshine.ts
 * BEHAVIOUR_RULES says which of these play, and how; Calm keeps only gentle touches.
 * Only one surprise at a time: the gum waits while any of these is on, and for
 * five quiet minutes after the glasses, the chai or a new outfit.
 *
 * Peek mode (settings.tucked): sent down by hand — the ↓ handle on hover,
 * dragging it down, J, or the panel's ↓ — only its top shows, still awake
 * (eyes follow the cursor). It rises to greet, offer a tour or give one, then
 * sinks back; a click, ↑, dragging it up or J brings it back for good.
 *
 * It never sits in the way: when the mouse heads for the corner and there's
 * something clickable under Joshine, it ducks down to a peek until the mouse
 * moves away; and the page keeps room at the bottom for it (--joshine-space,
 * AppShell's padding), so the last rows and buttons scroll clear of it.
 */

// What counts as "something clickable" under Joshine.
const INTERACTIVE = [
  "button", "a[href]", "input", "select", "textarea", "label", "summary",
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="checkbox"]', '[role="switch"]',
  '[role="option"]', '[role="menuitem"]', "tbody tr",
].join(", ");
// How close the mouse gets before Joshine ducks, and how long it waits to come back.
const DUCK_REACH = 120;
const DUCK_RETURN_MS = 1000;
// Joshine's spot: right-5 (20px), bottom-4 (16px).
const PET_RIGHT = 20;
const PET_BOTTOM = 16;
export function JoshinePet() {
  const { user } = useAuth();
  const { settings, update, reset } = useJoshine(user?.id);
  const rules = BEHAVIOUR_RULES[settings.behaviour];
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<JoshineExpression | null>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const moodTimer = useRef(0);
  const tour = useTourState();
  const pathname = usePathname();
  const pageTour = useMemo(() => pageTourFor(pathname), [pathname]);
  // The app tour is built for this person's role: every page they can open.
  const appTour = useMemo(() => appTourFor(user?.softwareDesignation), [user?.softwareDesignation]);
  const myPagesTour = useMemo(() => appTourFor(user?.softwareDesignation, { pagesOnly: true }), [user?.softwareDesignation]);
  // The tour Joshine is offering from the corner, if any.
  const [offer, setOffer] = useState<Tour | null>(null);

  useEffect(() => () => window.clearTimeout(moodTimer.current), []);

  // Hello after every login, and after a 30-minute break. Asks the server
  // about last visit / birthday / festival; without an answer it still greets
  // by the time of day. "Greeted" is recorded only once the bubble is shown,
  // so a cancelled run (React runs effects twice in development) can't use it up.
  const [greeting, setGreeting] = useState<Greeting | null>(null);
  // Hovering Joshine: she smiles, blushes, bobs and leans toward the cursor.
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState(0);
  const calm = prefersReducedMotion();
  // Admin previewing a day on Celebrations Management gets that day's hello.
  const [previewTick, setPreviewTick] = useState(0);
  useEffect(() => {
    const onPreview = () => {
      if (user) resetVisitGreeting(greetingUserKey(user));
      setPreviewTick((n) => n + 1);
    };
    window.addEventListener(PREVIEW_EVENT, onPreview);
    return () => window.removeEventListener(PREVIEW_EVENT, onPreview);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const userKey = greetingUserKey(user);
    if (!shouldGreet(userKey)) return;
    let cancelled = false;
    const context = Promise.race([
      celebrationsApi.greeting().catch(() => null),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000)),
    ]);
    // Let the page settle first, so the hello isn't lost in the loading.
    const wait = new Promise((resolve) => window.setTimeout(resolve, 1200));
    void Promise.all([context, wait]).then(([ctx]) => {
      if (cancelled || !shouldGreet(userKey)) return;
      markGreeted(userKey);
      const g = pickGreeting(userKey, callName(user.name, user.preferredName), ctx);
      setGreeting(g);
      // A curious little hop as the thought starts; its face settles on the line's.
      react("curious", [0.92, 1.08]);
    });
    return () => {
      cancelled = true;
    };
    // Once per signed-in person (and again for Admin's celebration preview).
  }, [user?.id, previewTick]);

  // Switching Energetic / Calm: a preview of the mode — a happy hop, or a slow nod with a blush.
  const [nod, setNod] = useState(false);
  const shownBehaviour = useRef(settings.behaviour);
  useEffect(() => {
    if (shownBehaviour.current === settings.behaviour) return;
    shownBehaviour.current = settings.behaviour;
    if (settings.behaviour === "energetic") {
      react("happy", [0.88, 1.12], true);
      return;
    }
    setNod(true);
    react("calm", [1, 1]);
    const t = window.setTimeout(() => setNod(false), 1400);
    return () => window.clearTimeout(t);
  }, [settings.behaviour]);

  // ── What Joshine wears ─────────────────────────────────────────────────────
  // Today's outfit (birthday / Founding Day / Christmas), asked on arrival and
  // hourly (the day can turn over while the app stays open).
  const [outfit, setOutfit] = useState<{ key: JoshineOutfitKey | null; years: number | null }>({ key: null, years: null });
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const ask = () => void celebrationsApi.greeting().then((ctx) => {
      if (!cancelled) setOutfit({ key: ctx.outfit, years: ctx.foundingYears });
    }).catch(() => {});
    ask();
    const id = window.setInterval(ask, 60 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id, previewTick]);

  // Reading glasses while a form is open: any open window (a dialog or a
  // full-screen overlay) with a field to type in, select or tick — not
  // Joshine's own panels. Looked for every 600 ms; it's a single query.
  const [formOpen, setFormOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    const FIELD = 'input:not([type="hidden"]):not([readonly]):not([disabled]), textarea:not([readonly]), select:not([disabled]), [contenteditable="true"]';
    const look = () => {
      const open = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], .fixed.inset-0'))
        .some((el) => !el.closest("[data-joshine-ui]") && el.offsetParent !== null && Boolean(el.querySelector(FIELD)));
      setFormOpen((was) => (was === open ? was : open));
    };
    look();
    const id = window.setInterval(look, 600);
    return () => window.clearInterval(id);
  }, [user?.id]);

  // Chai at tea time: 11:00–11:02 and 16:00–16:02 (India). Follows the same
  // switches as the tea-time greeting: Joshine's own and Admin's for everyone.
  const [chai, setChai] = useState(false);
  useEffect(() => {
    if (!user || !settings.teaTime) {
      setChai(false);
      return;
    }
    let adminOn: boolean | null = null;
    const tick = () => {
      const ist = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60_000);
      const inWindow = (ist.getHours() === 11 || ist.getHours() === 16) && ist.getMinutes() < 2;
      if (!inWindow) {
        setChai(false);
        return;
      }
      if (adminOn === null) {
        adminOn = true;   // until the answer comes
        void celebrationsApi.teaTime().catch(() => true).then((on) => {
          adminOn = on;
          setChai(on);
        });
        return;
      }
      setChai(adminOn);
    };
    tick();
    const id = window.setInterval(tick, 5_000);
    // Try it: window.dispatchEvent(new CustomEvent("joshine:chai")) — two minutes of chai.
    let demo = 0;
    const onDemand = () => {
      setChai(true);
      window.clearTimeout(demo);
      demo = window.setTimeout(() => setChai(false), 120_000);
    };
    window.addEventListener("joshine:chai", onDemand);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(demo);
      window.removeEventListener("joshine:chai", onDemand);
    };
  }, [user?.id, settings.teaTime]);

  // Five quiet minutes for the gum after the glasses or chai come off, or a new outfit goes on.
  const [cooling, setCooling] = useState(false);
  const busyLook = formOpen || chai;
  const lastLook = useRef({ busy: false, outfit: null as JoshineOutfitKey | null });
  useEffect(() => {
    const before = lastLook.current;
    lastLook.current = { busy: busyLook, outfit: outfit.key };
    if ((before.busy && !busyLook) || (outfit.key && outfit.key !== before.outfit)) {
      setCooling(true);
      const t = window.setTimeout(() => setCooling(false), 5 * 60_000);
      return () => window.clearTimeout(t);
    }
  }, [busyLook, outfit.key]);

  // The chai, step by step (JoshineChai.tsx): her face and blush follow it.
  const { phase: chaiPhase, level: chaiLevel } = useChai(chai && !tour.active, rules.chai);

  // Tea time at 11 AM and 4 PM (India): "Tea time, right Manuel?". Waits
  // while Joshine is busy or the tab is hidden, up to 10 minutes late.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = Boolean(greeting) || open || tour.active;
  });
  useEffect(() => {
    if (!user || !settings.teaTime) return;
    const userKey = greetingUserKey(user);
    let asking = false;
    const check = () => {
      if (asking || busyRef.current || document.hidden) return;
      const due = teaTimeDue(userKey);
      if (!due) return;
      // Admin may have switched it off for everyone (Celebrations Management).
      asking = true;
      void celebrationsApi.teaTime().catch(() => true).then((on) => {
        asking = false;
        if (busyRef.current || !teaTimeDue(userKey)) return;
        claimTeaTime(userKey, due.slot);
        if (!on) return;
        setGreeting(teaTimeGreeting(userKey, callName(user.name, user.preferredName), due.slot, due.late));
        react("sparkle", [0.9, 1.1]);
      });
    };
    // Try it: window.dispatchEvent(new CustomEvent("joshine:tea", { detail: "16" }))
    const onDemand = (e: Event) => {
      const slot = (e as CustomEvent<unknown>).detail === "16" ? "16" : "11";
      setGreeting(teaTimeGreeting(userKey, callName(user.name, user.preferredName), slot, false));
      react("sparkle", [0.9, 1.1]);
    };
    check();
    const id = window.setInterval(check, 10_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("joshine:tea", onDemand);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("joshine:tea", onDemand);
    };
  }, [user?.id, user?.name, user?.preferredName, settings.teaTime]);

  // Offer, once each: the app tour on the first visit, then each page's tour
  // the first time that page is opened. Waits for the page to settle.
  useEffect(() => {
    setOffer(null);
    if (!user) return;
    const next = !hasSeenTour(user.id, APP_TOUR_ID)
      ? appTour
      : pageTour && !pageOffersOff(user.id) && !hasSeenTour(user.id, pageTour.id)
        ? pageTour
        : null;
    if (!next) return;
    const t = window.setTimeout(() => setOffer(next), next === appTour ? 2500 : 1500);
    return () => window.clearTimeout(t);
  }, [user, pageTour, appTour]);

  // The open form's tour, if it has one (Dialog `tour`). Offered the first
  // time each form opens; the ? in the form's header runs it any time.
  const [formTour, setFormTour] = useState<Tour | null>(null);
  useEffect(() => {
    const onOpened = (e: Event) => setFormTour(formTourFor((e as CustomEvent<string | null>).detail));
    const onStart = (e: Event) => {
      const t = formTourFor((e as CustomEvent<string>).detail);
      if (t) runTourRef.current(t);
    };
    window.addEventListener(FORM_TOUR_OPENED, onOpened);
    window.addEventListener(FORM_TOUR_START, onStart);
    return () => {
      window.removeEventListener(FORM_TOUR_OPENED, onOpened);
      window.removeEventListener(FORM_TOUR_START, onStart);
    };
  }, []);
  useEffect(() => {
    if (!user || !formTour || pageOffersOff(user.id) || hasSeenTour(user.id, formTour.id)) return;
    const t = window.setTimeout(() => setOffer(formTour), 700);
    return () => window.clearTimeout(t);
  }, [user, formTour]);
  // A form closing takes its offer with it.
  useEffect(() => {
    if (!formTour) setOffer((o) => (o?.id.startsWith("form:") ? null : o));
  }, [formTour]);

  const runTourRef = useRef<(t: Tour) => void>(() => {});
  useEffect(() => {
    runTourRef.current = runTour;
  });

  function runTour(t: Tour) {
    setOpen(false);
    setOffer(null);
    // In peek mode it rises for the tour on its own and sinks back after.
    void startTour(t, settings, { userId: user?.id, role: user?.softwareDesignation });
  }

  // ── Peek mode ──────────────────────────────────────────────────────────────
  // Down to peek, or back up: a wink going down, a happy hop coming back.
  function setPeek(on: boolean) {
    if (on === settings.tucked) return;
    setOpen(false);
    update({ tucked: on });
    react(on ? "wink" : "happy", on ? [1.06, 0.95] : [0.9, 1.1]);
  }
  const setPeekRef = useRef(setPeek);
  useEffect(() => {
    setPeekRef.current = setPeek;
  });
  const tuckedRef = useRef(settings.tucked);
  useEffect(() => {
    tuckedRef.current = settings.tucked;
  }, [settings.tucked]);
  // J (components/layout/KeyboardShortcuts.tsx) toggles it.
  useEffect(() => {
    const onPeek = () => setPeekRef.current(!tuckedRef.current);
    window.addEventListener(JOSHINE_PEEK_EVENT, onPeek);
    return () => window.removeEventListener(JOSHINE_PEEK_EVENT, onPeek);
  }, []);
  // Dragging Joshine down sends it to peek; dragging it up brings it back.
  const drag = useRef<{ y: number; done: boolean } | null>(null);
  const dragged = useRef(false);

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
  // Calm: the face changes, no hop (`force`: the Energetic preview hops anyway).
  function react(expression: JoshineExpression, squash: [number, number], force = false) {
    window.clearTimeout(moodTimer.current);
    setMood(expression);
    moodTimer.current = window.setTimeout(() => setMood(null), 900);
    const el = bodyRef.current;
    if (!el || prefersReducedMotion() || (!rules.hop && !force)) return;
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
    if (dragged.current) {   // the end of a drag, not a click
      dragged.current = false;
      return;
    }
    if (peeking) {
      setPeek(false);
      return;
    }
    setOpen((o) => !o);
    react(open ? "calm" : "happy", [1.1, 0.9]);
  }

  // Ducking out of the way (see the top of this file).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ducked, setDucked] = useState(false);
  const canDuck = Boolean(user) && !settings.tucked && !open && !tour.active;
  useEffect(() => {
    if (!canDuck) {
      setDucked(false);
      return;
    }
    const size = settings.size;
    // Where Joshine normally sits, whether or not it's ducked right now.
    const home = () => {
      const right = window.innerWidth - PET_RIGHT;
      const bottom = window.innerHeight - PET_BOTTOM;
      return { left: right - size, top: bottom - size, right, bottom };
    };
    // Is anything clickable under that spot? (Looks through Joshine.)
    let checkedAt = 0;
    let covers = false;
    const coversSomething = () => {
      const now = Date.now();
      if (now - checkedAt < 400) return covers;
      checkedAt = now;
      const h = home();
      covers = [[0.5, 0.5], [0.2, 0.25], [0.8, 0.25], [0.2, 0.8], [0.8, 0.8]].some(([fx, fy]) => {
        const x = h.left + (h.right - h.left) * fx;
        const y = h.top + (h.bottom - h.top) * fy;
        for (const el of document.elementsFromPoint(x, y)) {
          if (wrapRef.current?.contains(el) || el.closest("[data-joshine]")) continue;
          // The first thing under Joshine decides (a modal's scrim isn't clickable).
          return Boolean(el.closest(INTERACTIVE));
        }
        return false;
      });
      return covers;
    };

    let isDucked = false;
    let returnTimer = 0;
    let raf = 0;
    const set = (v: boolean) => {
      if (v === isDucked) return;
      isDucked = v;
      setDucked(v);
    };
    const comeBackSoon = () => {
      if (!isDucked || returnTimer) return;
      returnTimer = window.setTimeout(() => {
        returnTimer = 0;
        set(false);
      }, DUCK_RETURN_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      const { clientX: x, clientY: y } = e;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = home();
        const dx = Math.max(h.left - x, 0, x - h.right);
        const dy = Math.max(h.top - y, 0, y - h.bottom);
        const near = Math.hypot(dx, dy) <= DUCK_REACH;
        const onJoshine = dx === 0 && dy === 0;
        if (!near) {
          comeBackSoon();
          return;
        }
        window.clearTimeout(returnTimer);
        returnTimer = 0;
        // Heading for the corner (not for Joshine itself) with something to click there.
        if (!isDucked && !onJoshine && coversSomething()) set(true);
      });
    };
    const onLeaveWindow = () => comeBackSoon();
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeaveWindow);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeaveWindow);
      window.clearTimeout(returnTimer);
      cancelAnimationFrame(raf);
    };
  }, [canDuck, settings.size]);

  // Room at the bottom of every page for Joshine (AppShell's padding).
  useEffect(() => {
    const root = document.documentElement;
    if (!user) return;
    const space = settings.tucked ? Math.round(settings.size * 0.42) + PET_BOTTOM + 8 : settings.size + PET_BOTTOM + 12;
    root.style.setProperty("--joshine-space", `${space}px`);
    return () => {
      root.style.removeProperty("--joshine-space");
    };
  }, [user, settings.size, settings.tucked]);

  // Peeking right now: in peek mode and not risen to greet, offer or give a tour.
  const peeking = settings.tucked && !tour.active && !greeting && !offer && !open;

  // The gum bubble waits while Joshine is busy with anything else.
  const { run: gumRun, phase: gum } = useGumBubble(Boolean(user) && settings.lively && rules.gum && !settings.tucked && !ducked && !open && !greeting && !offer && !tour.active
    && !formOpen && !chai && !chaiPhase && !cooling);

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
            { label: pageTour ? "The app" : "Tour the app", onStart: () => runTour(appTour) },
            { label: "Just my pages", onStart: () => runTour(myPagesTour) },
          ]}
          onTuck={() => {
            setOpen(false);
            update({ tucked: true });
          }}
        />
      )}

      {/* First-visit offer, said by Joshine from the corner. */}
      {/* Hello, beside Joshine (also when tucked: it peeks up to say it). */}
      {greeting && !open && !tour.active && (
        <JoshineGreeting
          greeting={greeting}
          name={callName(user.name, user.preferredName)}
          color={settings.color}
          petSize={settings.size}
          tucked={ducked}
          onDone={() => setGreeting(null)}
        />
      )}

      {/* A tour offer waits until the greeting has gone. */}
      {offer && !greeting && !open && !tour.active && (
        <div
          role="dialog"
          data-joshine-ui
          aria-label={`${settings.name || "Joshine"} offers a tour of ${offer.title}`}
          style={{ bottom: settings.size + 28 }}
          className={cx("animate-pop-in fixed right-5", offer.id.startsWith("form:") ? "z-popover" : "z-pet",
            " w-[min(300px,calc(100vw-2.5rem))] origin-bottom-right rounded-3xl border border-border-button-default bg-background-primary-default p-4 shadow-sidebar")}
        >
          {offer.id === APP_TOUR_ID ? (
            <>
              <p className="text-headline-semibold text-text-primary">Hi, I&apos;m {settings.name || "Joshine"}</p>
              <p className="mt-1 text-body-regular text-text-secondary">I can walk you through every page you can open, and the bar along the top. Stop any time with Esc.</p>
            </>
          ) : offer.id.startsWith("form:") ? (
            <>
              <p className="text-headline-semibold text-text-primary">First time filling in {offer.title}?</p>
              <p className="mt-1 text-body-regular text-text-secondary">I can show you what each part is for. I won&apos;t change anything.</p>
            </>
          ) : (
            <>
              <p className="text-headline-semibold text-text-primary">First time on {offer.title}?</p>
              <p className="mt-1 text-body-regular text-text-secondary">I can walk you through this page.</p>
            </>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            {offer.id !== APP_TOUR_ID && (
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
        ref={wrapRef}
        data-joshine
        data-joshine-ui
        className={cx(
          "group fixed bottom-4 right-5 z-pet transition-transform ease-out",
          // Ducking is quick; coming back up (and tucking) is gentler.
          ducked ? "duration-200" : "duration-500",
          (peeking || ducked) && (hovered ? "translate-y-[36%]" : "translate-y-[58%]"),
        )}
      >
        {/* Peek handle on hover: ↓ to peek, ↑ to come back (or J, or drag). */}
        {!open && !tour.active && (
          <button
            type="button"
            onClick={() => setPeek(!settings.tucked)}
            title={settings.tucked ? `Bring ${settings.name || "Joshine"} back (${SHORTCUTS.joshine.key})` : `Peek — slide down out of the way (${SHORTCUTS.joshine.key})`}
            aria-label={settings.tucked ? `Bring ${settings.name || "Joshine"} back` : `${settings.name || "Joshine"}: peek`}
            className={cx(
              "absolute -left-1 -top-1 z-10 flex size-6 items-center justify-center rounded-full border border-separator-border bg-background-primary-default text-text-secondary shadow-sm outline-none transition-opacity duration-150 hover:text-text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              peeking ? "opacity-70 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            {settings.tucked ? <RiArrowUpSLine className="size-4" /> : <RiArrowDownSLine className="size-4" />}
          </button>
        )}
        {/* Name tag on hover */}
        {!peeking && !ducked && !open && (
          <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-separator-border bg-background-primary-default px-2.5 py-1 text-body-regular text-text-primary opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
            {settings.name || "Joshine"}
            <span className="text-text-tertiary"> · {settings.label}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onClick}
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, done: false };
            dragged.current = false;
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerEnter={() => {
            if (open) return;
            setHovered(true);
            react(peeking ? "curious" : "happy", [1.08, 0.93]);
          }}
          onPointerMove={(e) => {
            // Dragged far enough down (or up, when peeking): peek / come back.
            const d = drag.current;
            if (d && !d.done && e.buttons === 1) {
              const dy = e.clientY - d.y;
              if (dy > 24 && !settings.tucked) { d.done = true; dragged.current = true; setPeek(true); }
              else if (dy < -24 && settings.tucked) { d.done = true; dragged.current = true; setPeek(false); }
            }
            if (calm || peeking || !rules.hoverBob) return;
            const box = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - box.left) / box.width - 0.5;
            setTilt(Math.round(x * 14));
          }}
          onPointerLeave={() => {
            setHovered(false);
            setTilt(0);
          }}
          aria-label={peeking ? `Bring ${settings.name || "Joshine"} back` : `${settings.name || "Joshine"}, customise`}
          aria-expanded={open}
          data-icon-motion="off"
          data-tour="joshine"
          className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <span ref={bodyRef} className="block origin-bottom">
            <span
              className={cx("relative block origin-bottom", gum === "shake" ? "gum-shake" : settings.lively && (hovered && !calm && rules.hoverBob ? "joshine-bob" : rules.breathe))}
              style={{ transform: `rotate(${tilt}deg)`, transition: "transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
            >
              <JoshineFace
                shape={settings.shape}
                color={settings.color}
                expression={mood ?? tour.expression ?? (gum ? GUM_FACE[gum] : null) ?? (chaiPhase ? CHAI_FACE[chaiPhase] : null) ?? (hovered ? (peeking || ducked ? "curious" : "happy") : null) ?? (ducked ? "dots" : null) ?? greeting?.expression ?? settings.expression}
                blush={(hovered && !peeking && !ducked) || gum === "sheepish" || nod || Boolean(chaiPhase && CHAI_BLUSH[chaiPhase])}
                size={settings.size}
                // Awake while peeking too: the eyes keep following the cursor.
                lively={settings.lively}
                className="drop-shadow-[0_6px_8px_color-mix(in_srgb,var(--color-scrim)_22%,transparent)]"
              />
              <JoshineOutfit
                size={settings.size}
                glasses={formOpen && !tour.active}
                outfit={outfit.key}
                foundingYears={outfit.years}
                gentle={!rules.bounceOn}
              />
              <JoshineChai phase={chaiPhase} level={chaiLevel} color={settings.color} size={settings.size} gentle={rules.chai === "calm"} />
              <JoshineGum run={gumRun} phase={gum} size={settings.size} />
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
