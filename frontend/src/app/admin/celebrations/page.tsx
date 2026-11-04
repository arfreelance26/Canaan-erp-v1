"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiCake2Line as Cake, RiCalendarEventLine as CalendarHeart, RiEyeLine as Eye, RiHistoryLine as History, RiBankLine as Landmark, RiLoader4Line as Loader2, RiGiftLine as PartyPopper, RiResetLeftLine as RotateCcw, RiSave3Line as Save, RiPlantLine as TreePine, RiCloseLine as X } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import {
  celebrationsApi, type CelebrationKey, type CelebrationMessages, type CelebrationsOverview,
} from "@/lib/api";
import { getPreview, setPreview, PREVIEW_EVENT, type CelebrationPreview } from "@/lib/celebration-preview";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { inputClass } from "@/components/ui/Field";
import { showError, showToast } from "@/lib/feedback";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { FestivalGreetings } from "@/components/celebrations/FestivalGreetings";

const FOUNDED_YEAR = 2015;

const niceDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const inDays = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `in ${n} days`);

function Switch({ on, busy, onChange, label }: { on: boolean; busy?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60", on ? "bg-success-solid" : "bg-fill-3")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background-primary-default shadow transition-[left]", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

const MESSAGE_FIELDS: { key: keyof CelebrationMessages; label: string; hint: string }[] = [
  { key: "birthday", label: "Birthday card", hint: "Shown to the birthday person on their Dashboard." },
  { key: "christmas", label: "Christmas card (24 – 25 Dec)", hint: "Shown to everyone." },
  { key: "newyear", label: "New Year card (31 Dec – 4 Jan)", hint: "Shown to everyone." },
  { key: "founding", label: "Founding Day card (5 Jan)", hint: "Shown to everyone, under “N Years of Canaan Global”." },
  { key: "signature", label: "Signature", hint: "Signs every card." },
];

const EVENT_LABEL: Record<string, string> = {
  "celebrations.switch": "Switched",
  "celebrations.messages": "Card text",
  "celebrations.festival": "Festival",
  "settings.festive_season": "December Season",
  "settings.founding_day": "Founding Day",
};
const SWITCH_LABEL: Record<string, string> = { birthdays: "Staff Birthdays", season: "December Season", founding: "Founding Day" };

export default function CelebrationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  const [data, setData] = useState<CelebrationsOverview | null>(null);
  const [busy, setBusy] = useState<CelebrationKey | null>(null);
  const [draft, setDraft] = useState<CelebrationMessages | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreviewState] = useState<CelebrationPreview | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [customBirthday, setCustomBirthday] = useState(false);

  const load = useCallback(() => {
    celebrationsApi.overview()
      .then((d) => { setData(d); setDraft(d.messages); })
      .catch((e: unknown) => showError(e instanceof Error ? e.message : "Couldn't load celebrations."));
  }, []);

  useEffect(() => {
    if (user && !isAdmin) { router.replace("/"); return; }
    load();
  }, [user, isAdmin, load, router]);

  useEffect(() => {
    const sync = () => setPreviewState(getPreview());
    sync();
    window.addEventListener(PREVIEW_EVENT, sync);
    return () => window.removeEventListener(PREVIEW_EVENT, sync);
  }, []);

  // Dates for the quick previews: this coming season / Founding Day.
  const quick = useMemo(() => {
    if (!data) return null;
    const t = new Date(`${data.today}T00:00:00`);
    const y = t.getFullYear(), m = t.getMonth() + 1, d = t.getDate();
    const seasonYear = m === 1 && d <= 4 ? y - 1 : y;
    const foundingYear = m === 1 && d <= 5 ? y : y + 1;
    let milestoneYear = foundingYear;
    while ((milestoneYear - FOUNDED_YEAR) % 5 !== 0) milestoneYear++;
    return {
      december: `${seasonYear}-12-10`, christmasEve: `${seasonYear}-12-24`, christmas: `${seasonYear}-12-25`,
      nye: `${seasonYear}-12-31`, newYear: `${seasonYear + 1}-01-01`,
      founding: `${foundingYear}-01-05`, foundingYears: foundingYear - FOUNDED_YEAR,
      milestone: `${milestoneYear}-01-05`, milestoneYears: milestoneYear - FOUNDED_YEAR,
    };
  }, [data]);

  function startPreview(p: CelebrationPreview) {
    setPreview(p);
    showToast("Preview on — only you can see it. Opening the Dashboard…", "info");
    router.push("/");
  }

  async function toggle(key: CelebrationKey, enabled: boolean) {
    setBusy(key);
    try {
      await celebrationsApi.setSwitch(key, enabled);
      showToast(`${SWITCH_LABEL[key]} turned ${enabled ? "on" : "off"} for everyone.`, "success");
      load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Couldn't change the setting.");
    } finally {
      setBusy(null);
    }
  }

  async function saveMessages() {
    if (!draft) return;
    setSaving(true);
    try {
      await celebrationsApi.setMessages(draft);
      showToast("Card text saved.", "success");
      load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Couldn't save the card text.");
    } finally {
      setSaving(false);
    }
  }

  if (!data || !draft || !quick) return <PageSkeleton hasButton={false} columns={3} />;

  const next = (kind: "birthday" | "season" | "founding") => data.upcoming.find((u) => u.kind === kind);
  const nextBirthday = next("birthday");
  const nextSeason = next("season");
  const nextFounding = next("founding");
  const t = new Date(`${data.today}T00:00:00`);
  const seasonActive = t.getMonth() === 11 || (t.getMonth() === 0 && t.getDate() <= 4);
  const dirty = (Object.keys(draft) as (keyof CelebrationMessages)[]).some((k) => draft[k] !== data.messages[k]);

  const cards: {
    key: CelebrationKey; title: string; icon: typeof Cake; tone: string; when: string; detail: string[];
    status: string; previews: { label: string; p: CelebrationPreview }[];
  }[] = [
    {
      key: "birthdays", title: "Staff Birthdays", icon: Cake, tone: "bg-warning-surface text-warning-text border-warning-border",
      when: "On each staff member's birthday",
      detail: ["Everyone: flags, balloons, lights (sidebar)", "Birthday person: their card + confetti, 🥳 on their photo", "Nobody else is told whose birthday it is"],
      status: nextBirthday ? `${nextBirthday.title.replace("'s birthday", "")} · ${inDays(nextBirthday.days)}` : "No birthdays in the next 90 days",
      previews: [{ label: "Preview my birthday", p: { birthday: true, label: "Your birthday" } }],
    },
    {
      key: "season", title: "December Season", icon: TreePine, tone: "bg-success-surface text-success-text border-success-border",
      when: "1 December – 4 January",
      detail: ["Christmas lights, garland, snow", "24–25 Dec: Christmas card · 25th: Santa's sleigh", "31 Dec: countdown · 1–4 Jan: fireworks, streamers"],
      status: seasonActive ? "Active now" : nextSeason ? `Starts ${inDays(nextSeason.days)}` : "",
      previews: [
        { label: "December day", p: { date: quick.december, label: "December day" } },
        { label: "Christmas Eve", p: { date: quick.christmasEve, label: "Christmas Eve" } },
        { label: "Christmas Day", p: { date: quick.christmas, label: "Christmas Day" } },
        { label: "New Year's Eve", p: { date: quick.nye, label: "New Year's Eve" } },
        { label: "New Year welcome", p: { date: quick.newYear, label: "New Year welcome" } },
      ],
    },
    {
      key: "founding", title: "Founding Day", icon: Landmark, tone: "bg-accent-surface text-accent-text border-accent-border",
      when: "5 January · est. 2015",
      detail: ["Anniversary card with live company totals", "Gold wave, “EST. 2015”, logo shine", "Fireworks on every 5th year"],
      status: nextFounding ? `${nextFounding.detail} · ${inDays(nextFounding.days)}` : "",
      previews: [
        { label: `Founding Day (${quick.foundingYears} yrs)`, p: { date: quick.founding, label: "Founding Day" } },
        { label: `Milestone (${quick.milestoneYears} yrs)`, p: { date: quick.milestone, label: "Founding Day milestone" } },
      ],
    },
  ];

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning-border bg-warning-surface text-warning-text">
          <PartyPopper className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Celebrations Management</h1>
          <p className="mt-0.5 text-body-regular text-text-secondary">
            Birthdays, the December season and Founding Day — switch them on or off for everyone, edit the card text, and preview any day.
          </p>
        </div>
      </div>

      {/* Preview state */}
      {preview && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-border bg-warning-surface px-4 py-3 text-body-regular text-warning-text">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            You&apos;re previewing <b>{preview.label ?? "a celebration"}</b>
            {preview.date ? <> ({niceDate(preview.date)})</> : null}{preview.birthday ? " as your birthday" : ""} — only on your screen.
          </span>
          <button type="button" onClick={() => router.push("/")} className="rounded-lg border border-warning-border-strong bg-background-primary-default px-3 py-1.5 text-caption-1-semibold hover:bg-warning-surface-strong">
            Open Dashboard
          </button>
          <button type="button" onClick={() => setPreview(null)} className="flex items-center gap-1 rounded-lg bg-warning-solid px-3 py-1.5 text-caption-1-semibold text-on-solid hover:bg-warning-solid-hover">
            <X className="h-3.5 w-3.5" /> Exit preview
          </button>
        </div>
      )}

      {/* Celebration cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {cards.map((c) => {
          const on = data.switches[c.key];
          const Icon = c.icon;
          return (
            <div key={c.key} className={cn("flex flex-col rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm transition-opacity", !on && "opacity-75")}>
              <div className="flex items-start gap-3">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", c.tone)}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-headline-semibold text-text-primary">{c.title}</p>
                  <p className="text-caption-1-regular text-text-secondary">{c.when}</p>
                </div>
                <Switch on={on} busy={busy === c.key} onChange={(v) => toggle(c.key, v)} label={`${c.title} on/off`} />
              </div>
              <span className={cn(
                "mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                !on ? "bg-fill-2 text-text-secondary" : "bg-success-surface text-success-text",
              )}>
                <i className="h-1.5 w-1.5 rounded-full bg-current" />
                {on ? c.status || "On" : "Off for everyone"}
              </span>
              <ul className="mt-3 flex-1 space-y-1 text-caption-1-regular text-text-secondary">
                {c.detail.map((d) => <li key={d} className="flex gap-1.5"><span className="text-text-placeholder">•</span>{d}</li>)}
              </ul>
              <div className="mt-4 border-t border-separator-border pt-3">
                <p className="mb-2 text-caption-1-semibold text-text-tertiary">Preview</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.previews.map((p) => (
                    <button key={p.label} type="button" onClick={() => startPreview(p.p)}
                      className="rounded-full border border-separator-border px-2.5 py-1 text-caption-1-medium text-text-secondary transition-colors hover:border-warning-border-strong hover:bg-warning-surface hover:text-warning-text">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Festival greetings — Joshine's greeting on festival days */}
        {data.festivals && <FestivalGreetings festivals={data.festivals} onSaved={load} />}

        {/* Upcoming */}
        <section className="rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm xl:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <CalendarHeart className="h-4 w-4 text-danger-text" />
            <h2 className="text-headline-semibold text-text-primary">Upcoming · next 90 days</h2>
          </div>
          {data.upcoming.length === 0 ? (
            <p className="py-6 text-center text-body-regular text-text-tertiary">Nothing in the next 90 days.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-separator-border overflow-y-auto">
              {data.upcoming.map((u, i) => {
                const Icon = u.kind === "birthday" ? Cake : u.kind === "season" ? TreePine : Landmark;
                const off = !data.switches[u.kind === "birthday" ? "birthdays" : u.kind];
                return (
                  <li key={`${u.date}-${i}`} className={cn("flex items-center gap-3 py-2.5", off && "opacity-50")}>
                    <span className="w-14 shrink-0 text-center">
                      <span className="block text-caption-2-semibold uppercase text-text-tertiary">
                        {new Date(`${u.date}T00:00:00`).toLocaleDateString("en-IN", { month: "short" })}
                      </span>
                      <span className="block text-title-3-semibold leading-none tabular-nums text-text-primary">{new Date(`${u.date}T00:00:00`).getDate()}</span>
                    </span>
                    <Icon className={cn("h-4 w-4 shrink-0", u.kind === "birthday" ? "text-warning-text" : u.kind === "season" ? "text-success-text" : "text-accent-text")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-medium text-text-primary">{u.title}</span>
                      {u.detail && <span className="block truncate text-caption-1-regular text-text-secondary">{u.detail}</span>}
                    </span>
                    <span className="shrink-0 text-caption-1-regular text-text-tertiary">{off ? "off" : inDays(u.days)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Card text */}
        <section className="rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm xl:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-headline-semibold text-text-primary">Card text</h2>
            <button type="button" disabled={!dirty || saving} onClick={saveMessages}
              className="flex items-center gap-1.5 rounded-lg bg-accent-solid px-3.5 py-2 text-body-medium text-on-solid transition-colors hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
          </div>
          <div className="flex flex-col gap-4">
            {MESSAGE_FIELDS.map((f) => {
              const value = draft[f.key];
              const isDefault = value === data.defaults[f.key];
              return (
                <div key={f.key}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor={`msg-${f.key}`} className="text-body-medium text-text-primary">{f.label}</label>
                    <span className="flex items-center gap-2">
                      {!isDefault && (
                        <button type="button" onClick={() => setDraft({ ...draft, [f.key]: data.defaults[f.key] })}
                          className="flex items-center gap-1 text-caption-1-medium text-text-tertiary hover:text-text-primary">
                          <RotateCcw className="h-3 w-3" /> Default
                        </button>
                      )}
                      <span className={cn("text-[11px] tabular-nums", value.length > data.maxMessage - 20 ? "text-warning-text" : "text-text-tertiary")}>
                        {value.length}/{data.maxMessage}
                      </span>
                    </span>
                  </div>
                  {f.key === "signature" ? (
                    <input id={`msg-${f.key}`} type="text" maxLength={data.maxMessage} value={value}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={inputClass} />
                  ) : (
                    <textarea id={`msg-${f.key}`} rows={2} maxLength={data.maxMessage} value={value}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={inputClass} />
                  )}
                  <p className="mt-1 text-caption-1-regular text-text-tertiary">{f.hint} Leave blank to use the default.</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Custom preview */}
        <section className="rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm xl:col-span-2">
          <div className="mb-1 flex items-center gap-2">
            <Eye className="h-4 w-4 text-warning-text" />
            <h2 className="text-headline-semibold text-text-primary">Preview any day</h2>
          </div>
          <p className="mb-3 text-caption-1-regular text-text-secondary">See the app as it will look on a chosen date — on your screen only. Nobody else is affected.</p>
          <div className="flex flex-col gap-3">
            <DatePickerInput value={customDate} onChange={setCustomDate} className={inputClass} clearable={false} />
            <label className="flex items-center gap-2 text-body-regular text-text-primary">
              <input type="checkbox" checked={customBirthday} onChange={(e) => setCustomBirthday(e.target.checked)} className="h-4 w-4 rounded border-separator-border-strong accent-accent-solid" />
              Also treat it as my birthday
            </label>
            <button type="button" disabled={!customDate && !customBirthday}
              onClick={() => startPreview({ date: customDate || undefined, birthday: customBirthday || undefined, label: "Custom date" })}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-warning-solid px-3.5 py-2 text-body-medium text-on-solid transition-colors hover:bg-warning-solid-hover disabled:cursor-not-allowed disabled:opacity-50">
              <Eye className="h-4 w-4" /> Preview on the Dashboard
            </button>
          </div>
        </section>

        {/* History */}
        <section className="rounded-2xl border border-separator-border bg-background-primary-default p-5 shadow-sm xl:col-span-3">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-foreground-icon-secondary" />
            <h2 className="text-headline-semibold text-text-primary">Change history</h2>
          </div>
          {data.history.length === 0 ? (
            <p className="py-6 text-center text-body-regular text-text-tertiary">No changes yet.</p>
          ) : (
            <ul className="max-h-[260px] divide-y divide-separator-border overflow-y-auto">
              {data.history.map((h, i) => {
                let text = h.detail ?? "";
                const m = /^(\w+)=(on|off)$/.exec(text);
                if (m) text = `${SWITCH_LABEL[m[1]] ?? m[1]} turned ${m[2]}`;
                const legacy = /^enabled=(True|False)$/.exec(text);
                if (legacy) text = `turned ${legacy[1] === "True" ? "on" : "off"}`;
                return (
                  <li key={i} className="flex items-center gap-3 py-2 text-body-regular">
                    <span className="w-24 shrink-0 text-caption-1-semibold text-text-tertiary">{EVENT_LABEL[h.event] ?? h.event}</span>
                    <span className="min-w-0 flex-1 truncate text-text-primary">{text}</span>
                    <span className="shrink-0 text-right text-caption-1-regular text-text-tertiary">
                      {h.actor ?? "—"}<br />{h.at ? formatDateTime(h.at) : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
