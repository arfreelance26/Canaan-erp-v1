"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { attendanceApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";
import type { StaffAttendanceRecord } from "@/types/attendance";

/** The signed-in user's own open shift today — self-checked-in (has a
 * check-in time), not yet closed — or null. Used to require closing it
 * before logging out (see Sidebar.tsx's logout handler); the check-out time
 * it eventually gets is their real last activity, not the moment it's
 * closed (see backend's _activity_checkout_time). */
export function useOpenShift(): StaffAttendanceRecord | null {
  const { user } = useAuth();
  const [record, setRecord] = useState<StaffAttendanceRecord | null>(null);
  const staffId = user?.id ?? null;

  const refresh = useCallback(() => {
    if (!staffId) { setRecord(null); return; }
    attendanceApi
      .listStaff(todayIst(), staffId)
      .then((recs) => {
        const r = recs[0];
        setRecord(r && r.status === "Present" && r.checkInTime && !r.checkOutTime ? r : null);
      })
      .catch(() => setRecord(null));
  }, [staffId]);

  useEffect(() => { refresh(); }, [refresh]);
  useWebSocketEvent("attendance_updated", refresh);

  return record;
}
