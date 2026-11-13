"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Maintenance Requests now lives in My Requests (Personal), as its
 * Maintenance Requests tab. This address forwards there, keeping the bell's
 * ?focus=<request id> so old links still open the right card.
 */
export default function MaintenanceRequestsRedirect() {
  const router = useRouter();
  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    router.replace(`/personal/edit-delete-requests?tab=maintenance${focus ? `&focus=${encodeURIComponent(focus)}` : ""}`);
  }, [router]);
  return null;
}
