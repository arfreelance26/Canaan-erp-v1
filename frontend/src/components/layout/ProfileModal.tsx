"use client";

import { useEffect, useState } from "react";
import { RiCloseLine as X, RiMailLine as Mail, RiBriefcaseLine as Briefcase, RiBuilding2Line as Building2, RiHashtag as Hash, RiGitBranchLine as GitBranch, RiCalendarScheduleLine as CalendarClock, RiInformationLine as Info, RiZoomInLine as ZoomIn } from "@remixicon/react";
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
      <span className="flex shrink-0 items-center gap-2 text-caption-1-medium text-text-tertiary">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="truncate text-body-semibold text-text-primary">{value}</span>
    </div>
  );
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<StaffSelfSummary | null>(null);
  // Profile photo opened full size (click the avatar).
  const [photoOpen, setPhotoOpen] = useState(false);
  useEffect(() => { if (!open) setPhotoOpen(false); }, [open]);

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
      if (e.key !== "Escape") return;
      // Escape closes the full-size photo first, then the profile.
      if (photoOpen) setPhotoOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, photoOpen]);

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
    ? "bg-success-surface/70"
    : okay
      ? "bg-warning-surface/70"
      : "bg-danger-surface/70";

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
      {photoOpen && photoSrc && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-scrim/85 p-4"
          onClick={() => setPhotoOpen(false)}
          role="dialog"
          aria-label={`${displayName} — profile photo`}
        >
          <button
            type="button"
            onClick={() => setPhotoOpen(false)}
            aria-label="Close photo"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-on-solid/15 text-on-solid transition hover:bg-on-solid/25"
          >
            <X className="h-5 w-5" />
          </button>
          {/* Original size; only scaled down if it's bigger than the screen. */}
          <img
            src={photoSrc}
            alt={displayName}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
      {/* Backdrop */}
      <div className="absolute inset-0 bg-scrim/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-[0_24px_64px_rgba(0,0,0,0.15)] animate-[slideUpFade_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_both]">
        {/* Banner — the Canaan Global brand banner, with the avatar
            overlapping its lower edge. */}
        <div className="relative h-32 w-full overflow-hidden bg-accent-solid">
          <img
            src="/banner.png"
            alt="Canaan Global"
            className="absolute inset-0 h-full w-full object-contain"
          />
          <div className="absolute inset-0 bg-scrim/30 " />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-on-solid/25 text-on-solid/90 transition hover:bg-fill-2 hover:text-on-solid"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Avatar — centered, overlapping the banner/body boundary */}
        <div className="relative flex flex-col items-center px-6 pb-1">
          <div className="relative -mt-12">
            {photoSrc ? (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                title="View photo"
                aria-label="View profile photo full size"
                className="group relative block cursor-zoom-in rounded-full"
              >
                <img
                  src={photoSrc}
                  alt={displayName}
                  className="h-24 w-24 rounded-full border-4 border-background-primary-default object-cover shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition group-hover:brightness-90"
                />
                <span className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-full bg-scrim/0 text-on-solid opacity-0 transition group-hover:bg-scrim/25 group-hover:opacity-100">
                  <ZoomIn className="h-5 w-5" />
                </span>
              </button>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-background-primary-default bg-accent-solid text-title-1-semibold text-on-solid shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
                {initials}
              </div>
            )}
            {photoSrc && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background-primary-default bg-purple-solid text-caption-2-semibold text-on-solid">
                {initials}
              </span>
            )}
          </div>

          <h2 className="mt-3 text-title-2-semibold text-text-primary">{displayName}</h2>

          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-purple-solid px-3 py-0.5 text-caption-1-semibold text-on-solid">{roleLabel}</span>
            {profile?.designation && (
              <span className="text-caption-1-medium text-text-secondary">{profile.designation}</span>
            )}
          </div>

          {metaItems.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-caption-1-medium text-text-tertiary">
              {metaItems.map(({ icon: Icon, text }, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-on-solid/80">&middot;</span>}
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
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-solid border-t-transparent" />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Attendance — a quiet flat tint (no border, no gradient) so it
                  reads as a highlight within the card, not a separate card */}
              {summary && (
                <div className={`flex items-center gap-4 rounded-xl px-4 py-3.5 ${standingTint}`}>
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r={r} fill="none" className="stroke-foreground-icon-secondary" strokeWidth="8" />
                      <circle
                        cx="48" cy="48" r={r} fill="none"
                        stroke={ringColor} strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        className="transition duration-700"
                      />
                    </svg>
                    <span className="absolute text-body-semibold tabular-nums text-text-primary">{pct}%</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-caption-2-semibold text-text-secondary">
                      Attendance This Month
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-body-semibold" style={{ color: ringColor }}>
                      {standingLabel}
                      <Info className="h-3.5 w-3.5 opacity-50" aria-label="Based on this calendar month's marked attendance" />
                    </p>
                  </div>
                </div>
              )}

              {/* Details list */}
              <div className="flex flex-col divide-y divide-separator-border">
                <DetailRow icon={Mail} label="Email" value={profile?.email} />
                <DetailRow icon={CalendarClock} label="With Canaan" value={joiningLine} />
              </div>

              {/* Closing note — same flow, no separate colored panel */}
              <div className="border-t border-separator-border pt-4 text-center">
                <p className="text-caption-2-semibold text-purple-text">
                  Thank You
                </p>
                <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-relaxed text-text-secondary">
                  Thank you for your dedication, commitment, and faithful service. Your contributions are valued, and the work you do makes a difference to our organisation.
                </p>
                <p className="mx-auto mt-2.5 max-w-xs text-[11px] leading-relaxed text-text-secondary">
                  &ldquo;Thou hast been faithful over a few things, I will make thee ruler over many things.&rdquo;
                </p>
                <p className="mt-1 text-caption-2-semibold text-text-tertiary">
                  &mdash; Matthew 25:21
                </p>
                <p className="mt-1 text-[10px] text-text-tertiary">
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
