"use client";

import { useEffect, useRef, useState } from "react";
import { celebrationsApi } from "@/lib/api";
import { animate } from "animejs";
import { RiArrowDownSLine, RiResetLeftLine, RiRouteLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { ColorWell } from "@/components/base/color-picker/color-picker";
import { Slider } from "@/components/base/slider/slider";
import { Switch } from "@/components/base/switch/switch";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import {
  EXPRESSION_LABELS,
  JOSHINE_COLORS,
  JOSHINE_EXPRESSIONS,
  JOSHINE_SHAPES,
  JOSHINE_SIZE,
  SHAPE_LABELS,
  type JoshineSettings,
  type JoshineShape,
  JOSHINE_BEHAVIOURS,
} from "@/lib/joshine";
import { cx } from "@/utils/cx";
import { Segmented } from "@/components/ui/Segmented";
import { JoshineFace } from "./JoshineFace";

/**
 * Joshine's creator: the face in the middle with its expressions in a ring
 * around it, body shapes, colours and the pet's size. Only the look is
 * editable here; every change saves as you make it and shows on the pet.
 */

const STAGE = 312; // px, square
const FACE = 164;
const RING = 128; // radius of the expression ring
const TILE = 44;

type Props = {
  settings: JoshineSettings;
  onChange: (patch: Partial<JoshineSettings>) => void;
  onReset: () => void;
  onClose: () => void;
  onTuck: () => void;
  /** The pet's current size, so the panel opens just above it. */
  petSize: number;
  /** Guided tours Joshine can give from here (this page, the whole app). */
  tours?: { label: string; onStart: () => void }[];
};

export function JoshineCreator({ settings, onChange, onReset, onClose, onTuck, petSize, tours = [] }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Admin's switch for everyone (Celebrations Management); null until known.
  const [teaForAll, setTeaForAll] = useState<boolean | null>(null);
  useEffect(() => {
    celebrationsApi.teaTime().then(setTeaForAll).catch(() => {});
  }, []);
  const custom = !JOSHINE_COLORS.some((c) => c.value.toLowerCase() === settings.color.toLowerCase());

  // Rises out of the pet: fade, small lift, slight blur, from the corner.
  useEffect(() => {
    const el = panelRef.current;
    if (!el || prefersReducedMotion()) return;
    const anim = animate(el, {
      opacity: [0, 1],
      translateY: [12, 0],
      scale: [0.96, 1],
      filter: ["blur(4px)", "blur(0px)"],
      duration: MOTION.duration.enter,
      ease: MOTION.easeOut,
      onComplete: () => {
        el.style.transform = "";
        el.style.filter = "";
      },
    });
    return () => {
      anim.pause();
    };
  }, []);

  return (
    <div
      ref={panelRef}
      role="dialog"
      data-joshine-ui
      aria-label={`Customise ${settings.name}`}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      style={{ bottom: petSize + 32, maxHeight: `calc(100dvh - ${petSize + 56}px)` }}
      className="fixed right-5 z-pet flex w-[min(420px,calc(100vw-2.5rem))] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-sidebar"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-headline-medium text-text-primary">{settings.name || "Joshine"}</h2>
          <p className="truncate text-body-regular text-text-tertiary">{settings.label}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTuck}
            title="Peek — slide down out of the way (J)"
            aria-label="Peek — slide down out of the way"
            className="flex size-8 items-center justify-center rounded-lg text-foreground-icon-tertiary outline-none transition-colors hover:bg-fill-2 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <RiArrowDownSLine className="size-5" />
          </button>
          <CloseButton size="sm" aria-label="Close" onClick={onClose} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-5">
        {/* Guided tours (lib/tours.ts) */}
        {tours.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-separator-border bg-background-secondary-default px-4 py-3">
            <span className="me-auto flex items-center gap-2 text-body-medium text-text-secondary">
              <RiRouteLine className="size-4 text-foreground-icon-secondary" aria-hidden />
              Show me around
            </span>
            {tours.map((t) => (
              <Button key={t.label} variant="secondary" size="small" onClick={t.onStart}>
                {t.label}
              </Button>
            ))}
          </div>
        )}

        {/* Face with its expressions around it */}
        <div className="relative mx-auto shrink-0" style={{ width: STAGE, height: STAGE }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <JoshineFace {...settings} size={FACE} lively={settings.lively} />
          </div>
          {JOSHINE_EXPRESSIONS.map((expression, i) => {
            const angle = (i / JOSHINE_EXPRESSIONS.length) * Math.PI * 2 - Math.PI / 2;
            const selected = expression === settings.expression;
            return (
              <button
                key={expression}
                type="button"
                data-icon-motion="off"
                aria-label={EXPRESSION_LABELS[expression]}
                aria-pressed={selected}
                title={EXPRESSION_LABELS[expression]}
                onClick={() => onChange({ expression })}
                className={cx(
                  "absolute flex items-center justify-center rounded-full outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  selected ? "bg-background-primary-default shadow-[0_0_0_2px_var(--color-accent-500)]" : "hover:bg-fill-2",
                )}
                style={{
                  width: TILE,
                  height: TILE,
                  left: STAGE / 2 + Math.cos(angle) * RING - TILE / 2,
                  top: STAGE / 2 + Math.sin(angle) * RING - TILE / 2,
                }}
              >
                <JoshineFace shape="pebble" expression={expression} color={settings.color} size={TILE - 6} />
              </button>
            );
          })}
        </div>

        {/* Body shapes */}
        <div className="flex items-center justify-center gap-1.5">
          {(Object.keys(JOSHINE_SHAPES) as JoshineShape[]).map((shape) => {
            const selected = shape === settings.shape;
            return (
              <button
                key={shape}
                type="button"
                aria-label={SHAPE_LABELS[shape]}
                aria-pressed={selected}
                title={SHAPE_LABELS[shape]}
                onClick={() => onChange({ shape })}
                className={cx(
                  "flex size-14 items-center justify-center rounded-2xl border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  selected ? "border-border-button-default bg-background-secondary-default" : "border-transparent hover:bg-fill-1",
                )}
              >
                <JoshineFace shape={shape} expression={settings.expression} color={settings.color} size={44} bodyOnly />
              </button>
            );
          })}
        </div>

        {/* Colours */}
        <div className="mx-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-separator-border bg-background-secondary-default p-1.5">
          {JOSHINE_COLORS.map((c) => {
            const selected = c.value.toLowerCase() === settings.color.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                aria-pressed={selected}
                title={c.name}
                onClick={() => onChange({ color: c.value })}
                className={cx(
                  "size-7 rounded-full outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  selected
                    ? "shadow-[0_0_0_2px_var(--color-background-primary-default),0_0_0_4px_var(--color-accent-500)]"
                    : "shadow-[inset_0_0_0_1px_var(--color-separator-border)]",
                )}
                style={{ backgroundColor: c.value }}
              />
            );
          })}
          <ColorWell
            aria-label="Custom colour"
            value={settings.color}
            onChange={(color) => onChange({ color: color.toString("hex") })}
            placement="top"
            wellClassName={cx("size-7", custom && "ring-2 ring-accent-500 ring-offset-2 ring-offset-background-primary-default")}
          />
        </div>

        {/* Size of the pet in the corner */}
        <div className="flex items-center gap-4 rounded-2xl border border-separator-border bg-background-secondary-default px-4 py-3">
          <span className="text-body-medium text-text-secondary">Size</span>
          <Slider
            aria-label="Size"
            thumbLabel="Size"
            minValue={JOSHINE_SIZE.min}
            maxValue={JOSHINE_SIZE.max}
            step={JOSHINE_SIZE.step}
            value={settings.size}
            onChange={(size) => onChange({ size: size as number })}
            className="min-w-0 flex-1"
          />
        </div>

        {/* Adjust Joshine's Behaviour: Energetic (everything) or Calm (gentle touches only) — lib/joshine.ts BEHAVIOUR_RULES */}
        <div className="flex flex-col gap-2 rounded-2xl border border-separator-border bg-background-secondary-default px-4 py-3">
          <span className="text-body-medium text-text-secondary">Adjust {settings.name || "Joshine"}&apos;s Behaviour</span>
          <Segmented
            label={`${settings.name || "Joshine"}'s behaviour`}
            value={settings.behaviour}
            onChange={(behaviour) => onChange({ behaviour })}
            options={JOSHINE_BEHAVIOURS.map((b) => ({ value: b.value, label: b.label }))}
          />
          <span className="text-caption-1-regular text-text-tertiary">
            {JOSHINE_BEHAVIOURS.find((b) => b.value === settings.behaviour)?.hint}
          </span>
        </div>

        {/* "Tea time, right?" at 11 AM and 4 PM */}
        <div className="flex items-center gap-4 rounded-2xl border border-separator-border bg-background-secondary-default px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-body-medium text-text-secondary">Tea-time reminders</span>
            <span className="block text-caption-1-regular text-text-tertiary">
              {teaForAll === false ? "Turned off for everyone by Admin" : "At 11 AM and 4 PM"}
            </span>
          </span>
          <Switch
            aria-label="Tea-time reminders"
            isDisabled={teaForAll === false}
            isSelected={settings.teaTime && teaForAll !== false}
            onChange={(teaTime) => onChange({ teaTime })}
          />
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-separator-border px-5 py-3">
        <Button variant="ghost" size="small" leadingIcon={RiResetLeftLine} onClick={onReset}>
          Reset
        </Button>
        <Button size="small" onClick={onClose}>
          Done
        </Button>
      </footer>
    </div>
  );
}
