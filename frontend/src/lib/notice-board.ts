"use client";

import { useSyncExternalStore } from "react";
import type { UnseenNotice } from "@/types/notice";

/**
 * Shared state for the Notice Board (components/layout/NoticeBoard.tsx):
 * the notices I haven't seen yet, read by the bell's "Notice Board" section.
 * The board itself fetches and updates it; everyone else only reads.
 */

const EMPTY: UnseenNotice[] = [];
let unseen: UnseenNotice[] = EMPTY;
const listeners = new Set<() => void>();

export function setUnseenNotices(list: UnseenNotice[]) {
  unseen = list.length ? list : EMPTY;
  listeners.forEach((l) => l());
}

export function getUnseenNotices(): UnseenNotice[] {
  return unseen;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUnseenNotices(): UnseenNotice[] {
  return useSyncExternalStore(subscribe, () => unseen, () => EMPTY);
}

/** Open the board (scrolled to a notice, if given) — the bell's rows and My profile's tile. */
export const NOTICE_BOARD_OPEN_EVENT = "notice-board:open";
export function openNoticeBoard(noticeId?: number) {
  window.dispatchEvent(new CustomEvent(NOTICE_BOARD_OPEN_EVENT, { detail: { noticeId } }));
}
