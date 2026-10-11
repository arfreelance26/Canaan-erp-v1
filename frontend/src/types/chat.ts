export type ChatConversationKind = "direct" | "group";
export type ChatParticipantRole = "member" | "admin";

export type ChatMember = {
  staffId: string;
  name: string;
  designation: string | null;
  department: string | null;
  softwareDesignation: string | null;
  photoUrl: string | null;
  role: ChatParticipantRole | null;
};

export type ChatMessage = {
  id: number;
  conversationId: number;
  senderId: number | null;
  senderName: string | null;
  text: string;
  /** "text" | "voice" | "image" | "file" */
  contentType: string;
  /** Voice/image/file only — the sniffed (or declared) MIME. */
  mediaMime: string | null;
  /** Voice notes only — recorded length in milliseconds. */
  durationMs: number | null;
  /** Image/file attachments only — original filename. */
  mediaFilename: string | null;
  /** Image/file attachments only — size in bytes. */
  mediaSize: number | null;
  /** Payment notes only — "pending" | "approved" | "rejected". */
  paymentStatus: string | null;
  paymentDecidedBy: number | null;
  paymentDecidedByName: string | null;
  paymentDecidedAt: string | null;
  replyToId: number | null;
  createdAt: string | null;
  editedAt: string | null;
  deleted: boolean;
};

export type ChatConversation = {
  id: number;
  kind: ChatConversationKind;
  /** Group name, or the peer's name for a direct thread. */
  title: string | null;
  peer: ChatMember | null;
  /** Groups only — whether a group icon has been set (fetch via chatApi.groupPhotoUrl). */
  hasPhoto: boolean;
  memberCount: number;
  unreadCount: number;
  muted: boolean;
  myRole: ChatParticipantRole;
  lastMessage: ChatMessage | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  /** Highest message id the other side has read — for blue read-ticks on load. */
  peerLastReadId: number;
};

export type ChatConversationDetail = ChatConversation & {
  members: ChatMember[];
};

/** Live "who's online" snapshot: online user ids + last-seen epoch (seconds). */
export type ChatPresence = {
  online: number[];
  lastSeen: Record<string, number>;
};

/** One conversation in the Admin-only, read-only "owner view" — every thread
 * in the company, not just the ones the viewer is a participant in. */
export type ChatOwnerConversation = {
  id: number;
  kind: ChatConversationKind;
  title: string;
  members: ChatMember[];
  lastMessage: ChatMessage | null;
  lastMessageAt: string | null;
  createdAt: string | null;
};

/** One row of Owner View's own audit trail — unlock attempts, password
 * changes, conversations opened. Visible to any Admin, not just whoever
 * holds the owner password (see backend/routers/chat_owner_view.py). */
export type ChatOwnerHistoryEntry = {
  id: number;
  event: string;
  outcome: string;
  actorName: string | null;
  resource: string | null;
  detail: string | null;
  createdAt: string;
};
