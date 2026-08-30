"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { chatApi } from "@/lib/api";
import { showToast } from "@/lib/swal";

// A burst of messages arriving together (e.g. someone sending several lines
// in a row) should read as one summary popup, not one stacking on top of
// another — this is how long to wait after the last arrival before showing it.
const BURST_WINDOW_MS = 1500;

function announce(count: number) {
  if (count <= 0) return;
  showToast(count === 1 ? "You have a new message" : `You have ${count} new Messages`, "chat");
}

/**
 * Site-wide Canaan Chat popup notifications — mounted once at the app shell
 * so they fire no matter which page the user is on.
 *
 *  - Live: a "chat_message" WS event while the app is open. The backend only
 *    emits this to a message's recipients (never back to its own sender —
 *    see routers/chat.py's _commit_new_message/_post_system_message), so
 *    everything this hook receives is genuinely new to the viewer.
 *  - Catch-up: on every login (including switching accounts, or the same
 *    account logging back in), in case there's unread history already
 *    waiting (the "was offline" case) — summarized as a single popup with
 *    the total count, not one per missed message.
 *
 * Suppressed entirely while the user is already on /connect/chat — they're
 * looking at the inbox already, so a popup on top of it would be redundant.
 */
export function useChatMessageToasts() {
  const { user } = useAuth();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const onChatPage = () => pathnameRef.current?.startsWith("/connect/chat") ?? false;

  // Tracks the id of whichever user we last ran the catch-up check for —
  // not just a fired-once boolean. AppShell (and this hook) stays mounted
  // across a logout→login cycle (logout is a client-side router.replace, not
  // a full page reload), so a plain "have I fired yet" flag would only ever
  // fire for the FIRST account used in a browser tab and stay silent for
  // every account that logs in afterwards. Comparing ids instead re-arms on
  // every genuine login transition — a different account, or the same
  // account logging back in after a logout — while still not re-firing on
  // an unrelated re-render that leaves the user unchanged.
  const lastCatchUpUserIdRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const currentId = user?.id ?? null;
    const previousId = lastCatchUpUserIdRef.current;
    lastCatchUpUserIdRef.current = currentId;
    if (currentId === null || currentId === previousId) return;
    if (onChatPage()) return;
    chatApi
      .listConversations()
      .then((convs) => announce(convs.reduce((sum, c) => sum + c.unreadCount, 0)))
      .catch(() => {});
  }, [user]);

  const burstCountRef = useRef(0);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useWebSocketEvent("chat_message", () => {
    if (onChatPage()) return;
    burstCountRef.current += 1;
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => {
      announce(burstCountRef.current);
      burstCountRef.current = 0;
    }, BURST_WINDOW_MS);
  });

  useEffect(() => {
    return () => {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    };
  }, []);
}
