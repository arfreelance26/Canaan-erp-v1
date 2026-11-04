"use client";

import { useState } from "react";
import { RiAddLine as Plus, RiCloseLine as X, RiSparkling2Line as Sparkle } from "@remixicon/react";
import { celebrationsApi, type Festival, type FestivalKey } from "@/lib/api";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { showError, showToast } from "@/lib/feedback";
import { cn } from "@/lib/utils";

const niceDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/**
 * Celebrations Management → Festival greetings. Pongal, Deepavali and Ayudha
 * Pooja move every year, so Admin adds each year's date here; on that day
 * Joshine greets everyone for it (lib/greetings.ts). Christmas and New Year
 * follow the December Season switch. Every change saves straight away.
 */
export function FestivalGreetings({ festivals, onSaved }: { festivals: Record<FestivalKey, Festival>; onSaved: () => void }) {
  const [busy, setBusy] = useState<FestivalKey | null>(null);
  const [adding, setAdding] = useState<Partial<Record<FestivalKey, string>>>({});
  const today = new Date().toISOString().slice(0, 10);

  async function save(key: FestivalKey, enabled: boolean, dates: string[], message: string) {
    setBusy(key);
    try {
      await celebrationsApi.setFestival(key, enabled, dates);
      showToast(message, "success");
      onSaved();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Couldn't save the festival.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm xl:col-span-5">
      <div className="mb-1 flex items-center gap-2">
        <Sparkle className="h-4 w-4 text-gold-text" />
        <h2 className="text-headline-semibold text-text-primary">Festival greetings</h2>
      </div>
      <p className="mb-4 text-caption-1-regular text-text-secondary">
        On these days Joshine greets everyone for the festival. Their dates change every year, so add each year&apos;s date.
        Christmas and New Year follow the December Season switch above.
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {(Object.entries(festivals) as [FestivalKey, Festival][]).map(([key, f]) => {
          const upcoming = f.dates.filter((d) => d >= today);
          const past = f.dates.filter((d) => d < today);
          const draft = adding[key] ?? "";
          return (
            <div key={key} className={cn("flex flex-col gap-3 rounded-xl border border-separator-border p-4 transition-opacity", !f.enabled && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-semibold text-text-primary">{f.name}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={`${f.name} greeting`}
                  disabled={busy === key}
                  onClick={() => save(key, !f.enabled, f.dates, `${f.name} greeting turned ${f.enabled ? "off" : "on"}.`)}
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60", f.enabled ? "bg-success-solid" : "bg-fill-3")}
                >
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background-primary-default shadow transition-[left]", f.enabled ? "left-[22px]" : "left-0.5")} />
                </button>
              </div>

              {upcoming.length === 0 ? (
                <p className="text-caption-1-regular text-warning-text">No date set yet. Add this year&apos;s date.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {upcoming.map((d) => (
                    <li key={d} className="flex items-center gap-1 rounded-full bg-gold-surface py-1 pl-2.5 pr-1 text-caption-1-semibold text-gold-text">
                      {niceDate(d)}
                      <button
                        type="button"
                        aria-label={`Remove ${niceDate(d)}`}
                        disabled={busy === key}
                        onClick={() => save(key, f.enabled, f.dates.filter((x) => x !== d), `${f.name} on ${niceDate(d)} removed.`)}
                        className="flex size-5 items-center justify-center rounded-full hover:bg-gold-surface-strong"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {past.length > 0 && (
                <p className="text-caption-2-medium text-text-tertiary">Past: {past.slice(-2).map(niceDate).join(", ")}</p>
              )}

              <div className="mt-auto flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <DatePickerInput
                    value={draft}
                    onChange={(v) => setAdding((a) => ({ ...a, [key]: v }))}
                    placeholder="Add a date"
                    aria-label={`Add a ${f.name} date`}
                    minDate={today}
                    clearable={false}
                  />
                </div>
                <button
                  type="button"
                  disabled={!draft || busy === key || f.dates.includes(draft)}
                  onClick={async () => {
                    await save(key, f.enabled, [...f.dates, draft], `${f.name} on ${niceDate(draft)} added.`);
                    setAdding((a) => ({ ...a, [key]: "" }));
                  }}
                  className="flex h-10 items-center gap-1 rounded-xl bg-accent-solid px-3 text-body-medium text-on-solid transition-colors hover:bg-accent-solid-hover disabled:opacity-50"
                >
                  <Plus className="size-4" /> Add
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
