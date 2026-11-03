"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import { useAuth } from "@/context/AuthContext";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { useJoshine, type JoshineExpression } from "@/lib/joshine";
import { cx } from "@/utils/cx";
import { JoshineFace } from "./JoshineFace";
import dynamic from "next/dynamic";

// The creator (colour picker, slider…) loads when Joshine is first clicked.
const JoshineCreator = dynamic(() => import("./JoshineCreator").then((m) => m.JoshineCreator));

/**
 * Joshine, sitting in the bottom-right corner of every page. It breathes,
 * watches the cursor and blinks; hover shows its name, a click opens the
 * creator. Tucked away, only its top peeks out of the corner until clicked.
 */
export function JoshinePet() {
  const { user } = useAuth();
  const { settings, update, reset } = useJoshine(user?.id);
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<JoshineExpression | null>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const moodTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(moodTimer.current), []);

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
          onTuck={() => {
            setOpen(false);
            update({ tucked: true });
          }}
        />
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
          className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <span ref={bodyRef} className="block origin-bottom">
            <span className={cx("block origin-bottom", settings.lively && "joshine-breathe")}>
              <JoshineFace
                shape={settings.shape}
                color={settings.color}
                expression={mood ?? (settings.tucked ? "sleepy" : settings.expression)}
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
