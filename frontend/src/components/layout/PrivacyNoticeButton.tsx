"use client";

import { useState } from "react";
import {
  Info,
  CalendarCheck,
  Activity,
  Clock,
  ShieldCheck,
  Smartphone,
  Ban,
  Eye,
} from "lucide-react";
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
        className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
      >
        <Info className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Privacy & Monitoring Notice" className="sm:max-w-lg">
        <div className="flex flex-col gap-5">
          {/* Intro */}
          <div className="flex items-start gap-3.5">
            <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 shadow-sm">
              <Info className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-gray-900">You&apos;re being monitored while using this system</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                To keep attendance records accurate, protect company data, and maintain accountability,
                this system keeps track of certain things while you&apos;re logged in. Please read this so
                you know exactly what&apos;s being recorded.
              </p>
            </div>
          </div>

          {/* What we track */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">What we track</p>
            <div className="mt-2 flex flex-col divide-y divide-gray-100">
              {TRACKED_ITEMS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-500">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What we don't do */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">What we do NOT do</p>
            <div className="mt-2 flex flex-col gap-2">
              {NOT_TRACKED.map((line) => (
                <div key={line} className="flex items-start gap-2.5 text-xs leading-relaxed text-gray-600">
                  <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {line}
                </div>
              ))}
            </div>
          </div>

          {/* Who can see this */}
          <div className="flex items-start gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>
              <span className="font-semibold text-gray-800">Who can see this: </span>
              Only Admin and relevant management roles, for attendance, payroll, and security purposes.
              It is never shared outside the company.
            </span>
          </div>

          <p className="text-xs leading-relaxed text-gray-400">
            As we&apos;ve added more attendance and monitoring features to the system, we want to be
            upfront with you — not hide it. If you have any questions about this, please reach out to
            your Admin.
          </p>
        </div>
      </Dialog>
    </>
  );
}
