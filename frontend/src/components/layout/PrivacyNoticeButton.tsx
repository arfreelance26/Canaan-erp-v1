"use client";

import { useState } from "react";
import { RiInformationLine as Info, RiCalendarCheckLine as CalendarCheck, RiPulseLine as Activity, RiTimeLine as Clock, RiShieldCheckLine as ShieldCheck, RiSmartphoneLine as Smartphone, RiForbidLine as Ban, RiEyeLine as Eye } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";

// Topbar "i" button — everyone can open this, any role. Keeps the wording
// plain ("you're being monitored", not legal/technical) since the point is
// making sure staff actually know what's tracked, not satisfying a compliance
// checklist. Update TRACKED_ITEMS/NOT_TRACKED below if the tracking surface
// changes (new attendance/activity features, etc.) — this is a living notice,
// not a one-time document.
const TRACKED_ITEMS = [
  {
    icon: CalendarCheck,
    title: "Your attendance",
    body: "When you check in and out each day, and your working hours.",
  },
  {
    icon: Activity,
    title: "What you do in the app",
    body: "The pages you visit, and actions like creating, editing, deleting, or exporting records, along with when you did them.",
  },
  {
    icon: Clock,
    title: "How active you are",
    body: "Whether you're actively using the system or idle, used to calculate your working time for the day.",
  },
  {
    icon: ShieldCheck,
    title: "Login activity",
    body: "Successful and failed login attempts, and the device/browser you're using, to keep your account secure.",
  },
  {
    icon: Smartphone,
    title: "Your device",
    body: "Your account may be limited to a small number of devices, to stop login details from being shared or misused.",
  },
];

const NOT_TRACKED = [
  "We do not access your camera, microphone, or location.",
  "We do not look at anything on your phone or computer outside this app.",
  "We do not track you once you've logged out.",
];

export function PrivacyNoticeButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Privacy & monitoring notice"
        title="Privacy & monitoring notice"
        onClick={() => setOpen(true)}
        className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-separator-border bg-background-primary-default text-text-secondary shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition duration-300 hover:border-purple-border hover:bg-purple-surface-strong hover:text-purple-text hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-purple-solid/10"
      >
        <Info className="h-5 w-5 transition-transform duration-300" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Privacy & Monitoring Notice" className="sm:max-w-lg">
        <div className="flex flex-col gap-5">
          {/* Intro */}
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
              <Info className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-text-primary">You&apos;re being monitored while using this system</p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                To keep attendance records accurate, protect company data, and maintain accountability,
                this system keeps track of certain things while you&apos;re logged in. Please read this so
                you know exactly what&apos;s being recorded.
              </p>
            </div>
          </div>

          {/* What we track */}
          <div>
            <p className="text-caption-2-semibold text-text-tertiary">What we track</p>
            <div className="mt-2 flex flex-col divide-y divide-separator-border">
              {TRACKED_ITEMS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fill-1 text-text-secondary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-body-semibold text-text-primary">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What we don't do */}
          <div>
            <p className="text-caption-2-semibold text-text-tertiary">What we do NOT do</p>
            <div className="mt-2 flex flex-col gap-2">
              {NOT_TRACKED.map((line) => (
                <div key={line} className="flex items-start gap-2.5 text-xs leading-relaxed text-text-secondary">
                  <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-text" />
                  {line}
                </div>
              ))}
            </div>
          </div>

          {/* Who can see this */}
          <div className="flex items-start gap-2.5 rounded-xl border border-separator-border bg-fill-1 px-4 py-3 text-xs leading-relaxed text-text-secondary">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
            <span>
              <span className="font-semibold text-text-primary">Who can see this: </span>
              Only Admin and relevant management roles, for attendance, payroll, and security purposes.
              It is never shared outside the company.
            </span>
          </div>

          <p className="text-xs leading-relaxed text-text-tertiary">
            As we&apos;ve added more attendance and monitoring features to the system, we want to be
            upfront with you — not hide it. If you have any questions about this, please reach out to
            your Admin.
          </p>
        </div>
      </Dialog>
    </>
  );
}
