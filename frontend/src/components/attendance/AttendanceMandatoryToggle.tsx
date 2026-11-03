"use client";

import { useEffect, useState } from "react";
import { RiShieldCheckLine as ShieldCheck, RiShieldLine as ShieldOff, RiLoader4Line as Loader2 } from "@remixicon/react";
import { securityApi } from "@/lib/api";
import { showError, showSuccess } from "@/lib/feedback";
import { cn } from "@/lib/utils";

// Standalone header control for the "Set Marking Attendance as Mandatory"
// flag — pulled out of Set Working Hours into its own button so it's visible
// (and toggleable) without opening that dialog first. Same stored flag as
// before (see securityApi.getAttendanceMandatory / useAttendanceGate), just a
// different entry point.
export function AttendanceMandatoryToggle() {
  const [mandatory, setMandatory] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    securityApi.getAttendanceMandatory().then(setMandatory).catch(() => setMandatory(null));
  }, []);

  async function toggle() {
    if (mandatory === null || saving) return;
    const next = !mandatory;
    setSaving(true);
    try {
      const saved = await securityApi.updateAttendanceMandatory(next);
      setMandatory(saved);
      showSuccess(saved ? "Marking attendance is now mandatory for staff." : "Marking attendance is no longer mandatory.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update this setting.");
    } finally {
      setSaving(false);
    }
  }

  if (mandatory === null) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      title="Requires staff to mark attendance before using the rest of the app"
      className={cn(
        "flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-body-semibold shadow-sm transition duration-300 disabled:opacity-60",
        mandatory
          ? "border-success-border bg-success-surface text-success-text hover:bg-success-surface-strong"
          : "border-border-button-default bg-background-primary-default text-text-primary hover:bg-fill-2"
      )}
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : mandatory ? (
        <ShieldCheck className="h-4 w-4" />
      ) : (
        <ShieldOff className="h-4 w-4" />
      )}
      Mandatory Attendance: {mandatory ? "On" : "Off"}
    </button>
  );
}
