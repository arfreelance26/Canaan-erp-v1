"use client";

import { useEffect, useState } from "react";
import {
  X,
  Mail,
  Briefcase,
  Building2,
  Hash,
  GitBranch,
  CalendarClock,
  Info,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { staffApi, attendanceApi, fileUrl } from "@/lib/api";
import { formatDateLong } from "@/lib/format-date";
import type { StaffSelfSummary } from "@/types/attendance";

type StaffDetail = {
  name: string;
  staff_id: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  software_designation: string;
  branch: string | null;
  date_of_joining: string | null;
  photo_url: string | null;
};

type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// "2 yrs 3 mos", "7 mos", "Joined today" — more personal than a raw date.
function tenureFrom(dateOfJoining: string): string {
  const joined = new Date(dateOfJoining);
  if (Number.isNaN(joined.getTime())) return "";
  const now = new Date();
  let months = (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
  if (now.getDate() < joined.getDate()) months -= 1;
  if (months <= 0) return "Joined today";
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (remMonths > 0 || years === 0) parts.push(`${remMonths} mo${remMonths === 1 ? "" : "s"}`);
  return parts.join(" ");
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-gray-400 dark:text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<StaffSelfSummary | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setProfile(null);

    // Only a login with no linked Staff row at all (id === null) has no
    // real record to fetch — everyone else, Admin included, has one.
    if (user.id === null) {
      setProfile({
        name: user.name,
        staff_id: "ADMIN",
        email: user.email,
        department: "Administration",
        designation: "System Administrator",
        software_designation: "Admin",
        branch: "All Branches",
        date_of_joining: null,
        photo_url: user.photoUrl,
      });
      return;
    }

    setLoading(true);
    staffApi
      .getDetail(String(user.id))
      .then((data) =>
        setProfile({
          name: String(data.name ?? user.name),
          staff_id: String(data.staff_id ?? user.staffId ?? ""),
          email: (data.email as string | null) ?? user.email,
          department: (data.department as string | null) ?? null,
          designation: (data.designation as string | null) ?? null,
          software_designation: String(data.software_designation ?? user.softwareDesignation),
          branch: (data.branch as string | null) ?? null,
          date_of_joining: (data.date_of_joining as string | null) ?? null,
          // data.photo_url here is just the original uploaded filename
          // (metadata), not a servable path — resolve it the same way every
          // other staff photo in the app does (toStaff() in lib/api.ts).
          photo_url: data.photo_url ? fileUrl("staff", String(user.id), "photo") : user.photoUrl,
        })
      )
      .catch(() =>
        setProfile({
          name: user.name,
          staff_id: user.staffId ?? "",
          email: user.email,
          department: null,
          designation: null,
          software_designation: user.softwareDesignation,
          branch: null,
          date_of_joining: null,
          photo_url: user.photoUrl,
        })
      )
      .finally(() => setLoading(false));
  }, [open, user]);

  // This month's attendance % — same source as the "Mark Attendance" ring.
  // Only a login with no linked Staff row (id === null) has no attendance.
  useEffect(() => {
    if (!open || !user || user.id === null) {
      setSummary(null);
      return;
    }
    const now = new Date();
    attendanceApi
      .getStaffSelfSummary(user.id, now.getFullYear(), now.getMonth() + 1)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [open, user]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const displayName = profile?.name ?? user?.name ?? "User";
  const photoSrc = profile?.photo_url ?? user?.photoUrl;
  const initials = getInitials(displayName);

  const pct = Math.round(summary?.percentage ?? 0);
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct / 100);
  const good = pct >= 75;
  const okay = !good && pct >= 50;
  const ringColor = good ? "#10b981" : okay ? "#f59e0b" : "#ef4444";
  const standingLabel = good ? "Good standing" : okay ? "Needs improvement" : "Below threshold";
  const standingTint = good
    ? "bg-emerald-50/70 dark:bg-emerald-500/10"
    : okay
      ? "bg-amber-50/70 dark:bg-amber-500/10"
      : "bg-red-50/70 dark:bg-red-500/10";

  const tenure = profile?.date_of_joining ? tenureFrom(profile.date_of_joining) : "";
  const joiningLine = profile?.date_of_joining
    ? tenure
      ? `${tenure} · Joined ${formatDateLong(profile.date_of_joining)}`
      : `Joined ${formatDateLong(profile.date_of_joining)}`
    : null;

  const metaItems = [
    { icon: Hash, text: profile?.staff_id },
    { icon: Building2, text: profile?.department },
    { icon: GitBranch, text: profile?.branch },
  ].filter((m): m is { icon: typeof Hash; text: string } => !!m.text);

  const roleLabel = profile?.software_designation ?? user?.softwareDesignation;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/60 bg-white dark:bg-[#1a2035] dark:border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.15)] animate-[slideUpFade_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_both]">
        {/* Banner — the Canaan Global brand banner, with the avatar
            overlapping its lower edge. */}
        <div className="relative h-32 w-full overflow-hidden bg-[#0b172e]">
          <img
            src="/banner.png"
            alt="Canaan Global"
            className="absolute inset-0 h-full w-full object-contain"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-white/90 backdrop-blur-sm transition-all hover:bg-white/35 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Avatar — centered, overlapping the banner/body boundary */}
        <div className="relative flex flex-col items-center px-6 pb-1">
          <div className="relative -mt-12">
            {photoSrc ? (
              <img
                src={photoSrc}
                alt={displayName}
                className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-[0_8px_24px_rgba(0,0,0,0.2)] dark:border-[#1a2035]"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] dark:border-[#1a2035]">
                {initials}
              </div>
            )}
            {photoSrc && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-indigo-700 text-[10px] font-bold text-white dark:border-[#1a2035]">
                {initials}
              </span>
            )}
          </div>

          <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-white">{displayName}</h2>

          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">{roleLabel}</span>
            {profile?.designation && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{profile.designation}</span>
            )}
          </div>

          {metaItems.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-gray-400 dark:text-gray-500">
              {metaItems.map(({ icon: Icon, text }, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-gray-200 dark:text-gray-700">&middot;</span>}
                  <span className="flex items-center gap-1">
                    <Icon className="h-3 w-3" />
                    {text}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Body — one continuous flow (no stacked, differently-tinted boxes) */}
        <div className="max-h-[52vh] overflow-y-auto px-6 pb-6 pt-5">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Attendance — a quiet flat tint (no border, no gradient) so it
                  reads as a highlight within the card, not a separate card */}
              {summary && (
                <div className={`flex items-center gap-4 rounded-xl px-4 py-3.5 ${standingTint}`}>
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r={r} fill="none" className="stroke-black/5 dark:stroke-white/10" strokeWidth="8" />
                      <circle
                        cx="48" cy="48" r={r} fill="none"
                        stroke={ringColor} strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        className="transition-all duration-700"
                      />
                    </svg>
                    <span className="absolute text-sm font-bold tabular-nums text-gray-900 dark:text-white">{pct}%</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Attendance This Month
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold" style={{ color: ringColor }}>
                      {standingLabel}
                      <Info className="h-3.5 w-3.5 opacity-50" aria-label="Based on this calendar month's marked attendance" />
                    </p>
                  </div>
                </div>
              )}

              {/* Details list */}
              <div className="flex flex-col divide-y divide-gray-100 dark:divide-white/10">
                <DetailRow icon={Mail} label="Email" value={profile?.email} />
                <DetailRow icon={CalendarClock} label="With Canaan" value={joiningLine} />
              </div>

              {/* Closing note — same flow, no separate colored panel */}
              <div className="border-t border-gray-100 pt-4 text-center dark:border-white/10">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
                  Thank You
                </p>
                <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  Thank you for your dedication, commitment, and faithful service. Your contributions are valued, and the work you do makes a difference to our organisation.
                </p>
                <p className="mx-auto mt-2.5 max-w-xs text-[11px] italic leading-relaxed text-gray-600 dark:text-gray-300">
                  &ldquo;Thou hast been faithful over a few things, I will make thee ruler over many things.&rdquo;
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  &mdash; Matthew 25:21
                </p>
                <p className="mt-1 text-[10px] text-gray-300 dark:text-gray-600">
                  &copy; 2026 Canaan Global. All rights reserved.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
