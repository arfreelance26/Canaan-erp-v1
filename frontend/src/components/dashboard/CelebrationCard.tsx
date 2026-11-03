"use client";

import { useEffect, useState, type ComponentType } from "react";
import { RiAwardLine, RiCakeLine, RiCalendarEventLine, RiCloseLine } from "@remixicon/react";
import { useBirthday } from "@/context/BirthdayContext";
import { useSeason } from "@/context/SeasonContext";
import { useFounding } from "@/context/FoundingContext";
import { useAuth } from "@/context/AuthContext";

/**
 * The one quiet celebration note on the Dashboard: the person's birthday, the
 * season greeting (Christmas / New Year) or the company anniversary, in that
 * order. Same data and the same "close for today" behaviour as the old cards,
 * without confetti, gradients or decoration.
 */

const closedKey = (uid: string, kind: string, date: string) => `erp_celebration_card_closed_${uid}_${kind}_${date}`;

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, "1"); } catch {}
}

type Note = {
  kind: string;
  date: string;
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  message: string;
  signature: string;
};

function useCelebrationNote(): Note | null {
  const bday = useBirthday();
  const season = useSeason();
  const founding = useFounding();

  if (bday.mine && bday.name && bday.date) {
    const pretty = new Date(`${bday.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
    return {
      kind: "birthday",
      date: bday.date,
      icon: RiCakeLine,
      eyebrow: `${pretty} · Your birthday`,
      title: `Happy birthday, ${bday.name}`,
      message: bday.message || "Wishing you a good year ahead. Thank you for everything you bring to the team.",
      signature: bday.signature || "Team Canaan Global",
    };
  }
  if (season.greeting && season.date) {
    const xmas = season.greeting === "christmas";
    return {
      kind: season.greeting,
      date: season.date,
      icon: RiCalendarEventLine,
      eyebrow: xmas ? "Season's greetings" : `New year ${season.newYear}`,
      title: xmas ? "Merry Christmas" : `Happy new year ${season.newYear}`,
      message: xmas
        ? season.messages.christmas || "Wishing you and your family joy and peace this Christmas."
        : season.messages.newyear || "Thank you for a good year. Here's to the next one together.",
      signature: season.messages.signature || "Team Canaan Global",
    };
  }
  if (founding.decorated && founding.date && founding.years > 0) {
    return {
      kind: "founding",
      date: founding.date,
      icon: RiAwardLine,
      eyebrow: `${founding.ordinal} anniversary · Since 5 January 2015`,
      title: `${founding.years} ${founding.years === 1 ? "year" : "years"} of Canaan Global`,
      message: founding.message || "Thank you for being part of the journey.",
      signature: founding.signature || "Team Canaan Global",
    };
  }
  return null;
}

export function CelebrationCard() {
  const note = useCelebrationNote();
  const { user } = useAuth();
  const uid = String(user?.id ?? user?.name ?? "");
  const [closed, setClosed] = useState(true); // decided after mount (localStorage)

  useEffect(() => {
    if (!note) return;
    setClosed(readFlag(closedKey(uid, note.kind, note.date)));
  }, [note?.kind, note?.date, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!note || closed) return null;
  const Icon = note.icon;

  return (
    <section className="relative mb-6 flex items-start gap-4 rounded-2xl border border-separator-border bg-background-primary-default p-5 pr-12">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-surface text-gold-text">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-caption-1-regular text-text-tertiary">{note.eyebrow}</p>
        <h2 className="mt-0.5 text-headline-medium text-text-primary">{note.title}</h2>
        <p className="mt-1 text-body-regular text-text-secondary">{note.message}</p>
        <p className="mt-2 text-caption-1-regular text-text-tertiary">{note.signature}</p>
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={() => { writeFlag(closedKey(uid, note.kind, note.date)); setClosed(true); }}
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-foreground-icon-tertiary outline-none transition-colors hover:bg-fill-2 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <RiCloseLine className="size-4" />
      </button>
    </section>
  );
}
