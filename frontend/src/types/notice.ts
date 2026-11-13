/** Notice Board (B) — backend/routers/notices.py. */

export type NoticeImage = { id: number; mime: string; fileName: string; sizeBytes: number };

export type NoticeReactionGroup = {
  emoji: string;
  count: number;
  /** I reacted with this emoji (tapping it again takes it back). */
  mine: boolean;
  /** Who reacted, for the hover title. */
  names: string[];
};

export type Notice = {
  id: number;
  staffId: number | null;
  authorName: string;
  authorRole: string | null;
  title: string;
  body: string;
  important: boolean;
  pinned: boolean;
  expiresAt: string | null;
  editedAt: string | null;
  createdAt: string;
  images: NoticeImage[];
  reactions: NoticeReactionGroup[];
  seenCount: number;
  seenByMe: boolean;
  mine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSeeSeenBy: boolean;
};

/** A notice I haven't seen yet — the bell's Notice Board section. */
export type UnseenNotice = {
  id: number;
  title: string;
  preview: string;
  authorName: string;
  important: boolean;
  imageCount: number;
  createdAt: string;
};

export type NoticeSeenRow = { name: string; role: string | null; seenAt: string };

/** "Remove after": null keeps it until deleted. */
export type NoticeExpiry = 1 | 7 | 30 | null;

// Mirrors backend/routers/notices.py.
export const NOTICE_MAX_TITLE = 200;
export const NOTICE_MAX_BODY = 10_000;
export const NOTICE_MAX_IMAGES = 4;
export const NOTICE_MAX_IMAGE_BYTES = 3 * 1024 * 1024;
