"use client";

import { useState } from "react";
import { LogOut, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { attendanceApi } from "@/lib/api";
import { showError } from "@/lib/swal";
import type { StaffAttendanceRecord } from "@/types/attendance";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The open shift that's blocking logout — see useOpenShift. */
  openShift: StaffAttendanceRecord;
  onClosedAndLoggedOut: () => void;
  /** Logging out without closing — a real break, not a bypass: the check-out
   * time a shift eventually gets is always the real last activity (see
   * backend's _activity_checkout_time), and logging out itself is logged as
   * activity, so stepping away this way can never pad recorded hours. */
  onLogoutWithoutClosing: () => void;
};

// Logout is gated on an open self-checked-in shift, but not on closing it —
// closing it is one choice, not the only way out (see the conversation that
// led here: a break shouldn't force "I'm done for the day" as the only
// option). "Cancel" is the third, separate choice: don't log out at all.
export function CloseShiftBeforeLogoutDialog({ open, onClose, openShift, onClosedAndLoggedOut, onLogoutWithoutClosing }: Props) {
  const [closing, setClosing] = useState(false);

  async function handleCloseAndLogout() {
    setClosing(true);
    try {
      await attendanceApi.closeShiftStaff(parseInt(openShift.staffId));
      onClosedAndLoggedOut();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Could not close your shift.");
      setClosing(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => !closing && onClose()} title="Your shift is still open">
      <div className="flex flex-col items-center gap-4 px-2 py-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">Checked in at {openShift.checkInTime}, never closed</p>
          <p className="mt-1 text-xs text-gray-500">
            Done for the day, or just stepping away for a bit?
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={handleCloseAndLogout}
            disabled={closing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {closing ? "Closing…" : "Close Shift & Log Out"}
          </button>
          <button
            type="button"
            onClick={onLogoutWithoutClosing}
            disabled={closing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            Log Out (taking a break)
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={closing}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
