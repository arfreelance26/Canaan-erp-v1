"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { securityApi, attendanceApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";

/**
 * True once "Set Marking Attendance as Mandatory" (SetWorkingHoursDialog) is
 * on, the signed-in user hasn't marked attendance yet today, they aren't
 * Admin, AND today is a confirmed working day — Admin is always exempt (the
 * one person who can turn this back off from Settings can never be the one
 * locked out of reaching it), and a Sunday/company holiday is exempt too:
 * nobody is required to mark one (self-mark allows it, but doesn't require
 * it — some roles, e.g. Maintenance, Yard Supervisor, genuinely work through
 * them; most people don't). Without this, someone who isn't working a
 * holiday would be locked to Mark Attendance all day for no reason, and
 * someone who IS working one would be stuck unable to reach anything else
 * (self-mark used to flat-out refuse to let them create a record at all).
 *
 * `marked`/`isWorkingDay` both start `null` (unknown) and only a successful
 * fetch ever resolves them to `true`/`false`; a failed fetch leaves them
 * `null` rather than guessing, so a flaky request fails open (never locked)
 * instead of trapping someone for a reason they can't see or fix.
 */
export function useAttendanceGate() {
  const { user } = useAuth();
  const [mandatory, setMandatory] = useState(false);
  const [marked, setMarked] = useState<boolean | null>(null);
  const [isWorkingDay, setIsWorkingDay] = useState<boolean | null>(null);
  const staffId = user?.id ?? null;

  const refreshMarked = useCallback(() => {
    if (!staffId) { setMarked(null); return; }
    attendanceApi
      .listStaff(todayIst(), staffId)
      .then((recs) => setMarked(recs.length > 0))
      .catch(() => setMarked(null));
  }, [staffId]);

  useEffect(() => {
    if (!user) return;
    securityApi.getAttendanceMandatory().then(setMandatory).catch(() => setMandatory(false));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const today = todayIst();
    const sunday = new Date(`${today}T00:00:00`).getDay() === 0;
    attendanceApi.listHolidays(today, today)
      .then((hs) => setIsWorkingDay(!(sunday || hs.length > 0)))
      .catch(() => setIsWorkingDay(sunday ? false : null));
  }, [user]);

  useEffect(() => { refreshMarked(); }, [refreshMarked]);

  // Marking attendance is a POST to /attendance/staff, which broadcasts
  // data_changed with resource "attendance" — refresh on it so the lock
  // lifts the instant they mark, no reload needed.
  useWebSocketEvent("data_changed", (payload) => {
    if ((payload as { resource?: string }).resource === "attendance") refreshMarked();
  });

  // …but don't rely on the socket alone: if it's down (weak network, laptop
  // woke from sleep) the person would stay locked after marking until a
  // reload. While still unmarked, re-check every 10s and whenever the tab
  // regains focus.
  useEffect(() => {
    if (marked !== false) return;
    const id = window.setInterval(refreshMarked, 10_000);
    window.addEventListener("focus", refreshMarked);
    return () => { window.clearInterval(id); window.removeEventListener("focus", refreshMarked); };
  }, [marked, refreshMarked]);

  const isAdmin = user?.softwareDesignation === "Admin";
  const locked = Boolean(user) && mandatory && !isAdmin && isWorkingDay === true && marked === false;

  return { locked };
}
