"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Search,
  Send,
  MessageSquare,
  Smile,
  Paperclip,
  Mic,
  MoreVertical,
  CheckCheck,
  Users,
  Plus,
  X,
  Loader2,
  Image as ImageIcon,
  Link2,
  FileText,
  Calendar,
  Crown,
  Pencil,
  Check,
  UserPlus,
  UserMinus,
  LogOut,
  Trash2,
  Play,
  Pause,
  Download,
  File as FileIcon,
  IndianRupee,
  Camera,
} from "lucide-react";
import { chatApi, toChatMessage } from "@/lib/api";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import type { ChatConversation, ChatConversationDetail, ChatMember, ChatMessage } from "@/types/chat";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showError, confirmAction } from "@/lib/swal";

const PAGE_SIZE = 50;
const MAX_ATTACHMENT_MB = 25;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Deterministic per-sender color for group chats — so at a glance you can tell
 * two consecutive senders apart by their avatar/name color alone, not just by
 * re-reading the name label on every run.
 */
const SENDER_PALETTE = [
  { bg: "bg-rose-500", text: "text-rose-600" },
  { bg: "bg-orange-500", text: "text-orange-600" },
  { bg: "bg-amber-500", text: "text-amber-700" },
  { bg: "bg-emerald-500", text: "text-emerald-600" },
  { bg: "bg-teal-500", text: "text-teal-600" },
  { bg: "bg-cyan-600", text: "text-cyan-700" },
  { bg: "bg-blue-500", text: "text-blue-600" },
  { bg: "bg-indigo-500", text: "text-indigo-600" },
  { bg: "bg-violet-500", text: "text-violet-600" },
  { bg: "bg-fuchsia-500", text: "text-fuchsia-600" },
  { bg: "bg-pink-500", text: "text-pink-600" },
] as const;

function senderColor(id: number | null): (typeof SENDER_PALETTE)[number] {
  const key = id ?? 0;
  return SENDER_PALETTE[Math.abs(key) % SENDER_PALETTE.length];
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Day separator label — "Today" / "Yesterday" / a date, like WhatsApp. */
function dayLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

/** Full readable date — used for "Created on ..." in the group info panel. */
function formatFullDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { day: "2-digit", month: "long", year: "numeric" });
}

/** mm:ss — used both for the live recording timer and voice-note playback. */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Recorder codec preference, best browser support first. */
const VOICE_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return VOICE_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

function Avatar({
  name,
  photoUrl,
  size = 44,
  group = false,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  group?: boolean;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white"
    >
      {group ? <Users className="h-1/2 w-1/2 text-brand-gold" /> : getInitials(name || "?")}
    </div>
  );
}

/**
 * A WhatsApp-style voice note bubble: play/pause, a scrub bar, and the elapsed
 * / total time. Audio is fetched lazily — nothing downloads until Play is first
 * pressed — because it's an authenticated fetch (encrypted at rest server-side,
 * so a plain <audio src> can't be used), not a static URL.
 */
function VoiceBubble({ message }: { message: ChatMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((message.durationMs ?? 0) / 1000);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function handleToggle() {
    if (playing) {
      audioRef.current?.pause();
      return;
    }
    if (!url) {
      setLoadingUrl(true);
      try {
        const blobUrl = await chatApi.getVoiceBlobUrl(message.id);
        urlRef.current = blobUrl;
        setUrl(blobUrl);
        // Play once the <audio> element has mounted with the new src.
        requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not load this voice message.");
      } finally {
        setLoadingUrl(false);
      }
      return;
    }
    audioRef.current?.play().catch(() => {});
  }

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="flex w-56 items-center gap-2 py-0.5">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loadingUrl}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white transition-colors hover:bg-brand-navy/90 disabled:opacity-60"
      >
        {loadingUrl ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="ml-0.5 h-4 w-4" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-brand-navy transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-brand-navy">
          {formatDuration(playing || currentTime > 0 ? currentTime : duration)}
        </span>
      </div>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrentTime(0);
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          className="hidden"
        />
      )}
    </div>
  );
}

/** Payment notes carry their {amount, note} as a JSON string in `text` (see
 * chatApi.sendPayment) — this is the single place that ever parses it back. */
function parsePayment(text: string): { amount: string; note: string } | null {
  try {
    const parsed = JSON.parse(text) as { amount?: unknown; note?: unknown };
    if (typeof parsed.amount !== "string") return null;
    return { amount: parsed.amount, note: typeof parsed.note === "string" ? parsed.note : "" };
  } catch {
    return null;
  }
}

function formatRupees(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerBlobDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * An image attachment bubble. Fetched eagerly (unlike voice notes, which wait
 * for a Play click) — the whole point of an inline photo is that it's visible
 * without an extra tap, matching WhatsApp. Click opens it full-size.
 */
function ImageBubble({ message, onOpen }: { message: ChatMessage; onOpen: (url: string, name: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    chatApi
      .getAttachmentBlobUrl(message.id)
      .then((blobUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        urlRef.current = blobUrl;
        setUrl(blobUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [message.id]);

  if (failed) {
    return (
      <div className="flex h-40 w-56 flex-col items-center justify-center gap-1.5 rounded-lg bg-gray-100 text-gray-400">
        <ImageIcon className="h-6 w-6" />
        <span className="text-xs">Couldn&apos;t load image</span>
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-gray-100">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={message.mediaFilename ?? "Photo"}
      onClick={() => onOpen(url, message.mediaFilename ?? "photo")}
      className="max-h-72 w-full max-w-64 cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-95"
    />
  );
}

/** A generic file/document attachment bubble — icon, name, size, download-on-click. */
function FileBubble({ message }: { message: ChatMessage }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const url = await chatApi.getAttachmentBlobUrl(message.id);
      triggerBlobDownload(url, message.mediaFilename ?? "attachment");
      // Give the browser a moment to pick up the download before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not download this file.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className="flex w-56 items-center gap-3 rounded-lg bg-black/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-black/[0.06] disabled:opacity-70"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy/10">
        <FileIcon className="h-5 w-5 text-brand-navy" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800">{message.mediaFilename ?? "Attachment"}</p>
        <p className="text-xs text-gray-500">{formatFileSize(message.mediaSize)}</p>
      </div>
      {downloading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
      ) : (
        <Download className="h-4 w-4 shrink-0 text-gray-400" />
      )}
    </button>
  );
}

/**
 * A WhatsApp-Pay-style payment card — cosmetic only. It's a formatted note
 * ("₹500, for fuel"), not a real transfer: no bank/UPI integration, nothing
 * actually moves. The data arrives already decrypted in the message's `text`
 * (see parsePayment), so unlike voice/image/file this needs no extra fetch.
 */
function PaymentBubble({
  message,
  amount,
  note,
  fromMe,
  onDecide,
}: {
  message: ChatMessage;
  amount: string;
  note: string;
  fromMe: boolean;
  onDecide: (messageId: number, status: "approved" | "rejected") => Promise<void>;
}) {
  const [deciding, setDeciding] = useState<"approved" | "rejected" | null>(null);
  // Only the recipient can act, and only while the note is still pending — the
  // sender approving their own request would defeat the point of asking.
  const canDecide = !fromMe && message.paymentStatus === "pending";

  async function decide(status: "approved" | "rejected") {
    if (deciding) return;
    setDeciding(status);
    try {
      await onDecide(message.id, status);
    } finally {
      setDeciding(null);
    }
  }

  // Plays the celebration/shake once, exactly when this bubble is the one
  // flipping from "pending" — never on history load (mounts already-decided)
  // and never again on later re-renders, since the element stays mounted and
  // CSS animations don't replay just because a class stays applied.
  const prevStatusRef = useRef(message.paymentStatus);
  const [justDecided, setJustDecided] = useState<"approved" | "rejected" | null>(null);
  useEffect(() => {
    if (prevStatusRef.current === "pending" && message.paymentStatus !== "pending") {
      setJustDecided(message.paymentStatus === "approved" ? "approved" : "rejected");
    }
    prevStatusRef.current = message.paymentStatus;
  }, [message.paymentStatus]);

  const statusTint =
    message.paymentStatus === "approved"
      ? "border-emerald-100 bg-emerald-50/60"
      : message.paymentStatus === "rejected"
        ? "border-red-100 bg-red-50/60"
        : "border-gray-100 bg-gray-50/60";

  const cardAnim =
    justDecided === "approved" ? "animate-payment-approved" : justDecided === "rejected" ? "animate-payment-rejected" : "";

  return (
    <div className={`w-56 -mx-3 -mt-1.5 overflow-hidden rounded-2xl border p-3.5 transition-colors duration-500 ${statusTint} ${cardAnim}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy shadow-sm">
          <IndianRupee className="h-[18px] w-[18px] text-brand-gold" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">Payment</p>
          <p className="text-2xl font-bold leading-tight text-gray-900 tabular-nums">₹{formatRupees(amount)}</p>
        </div>
      </div>

      {note && (
        <p className="mt-2.5 truncate rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-gray-600 italic" title={note}>
          &ldquo;{note}&rdquo;
        </p>
      )}

      {canDecide ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => decide("rejected")}
            disabled={deciding !== null}
            className="flex-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            {deciding === "rejected" ? "…" : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => decide("approved")}
            disabled={deciding !== null}
            className="flex-1 rounded-lg bg-brand-navy py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-navy/90 disabled:opacity-60"
          >
            {deciding === "approved" ? "…" : "Approve"}
          </button>
        </div>
      ) : message.paymentStatus === "approved" ? (
        <div
          className={`relative mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-100/80 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 ${justDecided === "approved" ? "animate-payment-status-pop" : ""}`}
        >
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600">
            {justDecided === "approved" && (
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-payment-ring" />
            )}
            <Check className="relative h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
          Approved{message.paymentDecidedByName ? ` by ${message.paymentDecidedByName.split(" ")[0]}` : ""}
        </div>
      ) : message.paymentStatus === "rejected" ? (
        <div
          className={`mt-3 flex items-center gap-1.5 rounded-lg bg-red-100/80 px-2.5 py-1.5 text-xs font-semibold text-red-600 ${justDecided === "rejected" ? "animate-payment-status-pop" : ""}`}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500">
            <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
          Rejected{message.paymentDecidedByName ? ` by ${message.paymentDecidedByName.split(" ")[0]}` : ""}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-medium text-gray-400">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-gray-400" />
          Waiting for response…
        </div>
      )}
    </div>
  );
}

export default function CanaanChatPage() {
  const { user } = useAuth();
  const myId = user?.id ?? null;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [contacts, setContacts] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"chats" | "groups">("chats");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const draftInputRef = useRef<HTMLInputElement>(null);

  // -- attachments (paperclip) --------------------------------------------
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // -- payment note (WhatsApp-Pay-style, cosmetic only) --------------------
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [sendingPayment, setSendingPayment] = useState(false);
  const paymentAmountInputRef = useRef<HTMLInputElement>(null);

  // -- voice recording ----------------------------------------------------
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingCancelledRef = useRef(false);
  const recordingStartRef = useRef(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingConversationIdRef = useRef<number | null>(null);

  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<number[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // -- group info panel -------------------------------------------------
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupDetail, setGroupDetail] = useState<ChatConversationDetail | null>(null);
  const [loadingGroupDetail, setLoadingGroupDetail] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState<number[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [leavingGroup, setLeavingGroup] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const groupTitleInputRef = useRef<HTMLInputElement>(null);
  // Tracks which thread is open from inside WebSocket callbacks, which close over
  // the state at subscribe time and would otherwise see a stale selection.
  const selectedIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  // Which threads this client already knows about, readable from a WS callback
  // without depending on `conversations` (which would resubscribe on every message).
  const knownConvIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    knownConvIdsRef.current = new Set(conversations.map((c) => c.id));
  }, [conversations]);
  // Message ids that arrived *during this session* (sent or received live) vs.
  // ones pulled in by the initial history load or "load earlier" paging. Only
  // the former get an entrance animation — animating fifty history rows at once
  // on thread-open reads as noisy, not smooth. Reset whenever a new thread opens.
  // State rather than a ref because the value is read during render (to pick
  // the animation class), and React's ref rules forbid that.
  const [freshMessageOrigins, setFreshMessageOrigins] = useState<Record<number, "sent" | "received">>({});
  const markMessageFresh = useCallback((id: number, origin: "sent" | "received") => {
    setFreshMessageOrigins((prev) => ({ ...prev, [id]: origin }));
  }, []);

  // -- initial load ---------------------------------------------------------
  useEffect(() => {
    Promise.all([chatApi.listConversations(), chatApi.listContacts()])
      .then(([convs, people]) => {
        setConversations(convs);
        setContacts(people);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const refreshConversations = useCallback(() => {
    chatApi.listConversations().then(setConversations).catch(() => {});
  }, []);

  /** True for the backend's exact "you're not (or no longer) a participant" error —
   * distinguishing "this conversation is gone" from a real network/server failure. */
  const isConversationGoneError = (err: unknown) =>
    err instanceof Error && err.message === "Conversation not found.";

  /** A conversation vanished under us (deleted, or we were removed). Drop it from
   * the sidebar and clear the open thread instead of leaving a dead end on screen. */
  const handleConversationGone = useCallback(
    (conversationId: number) => {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setSelectedId((cur) => (cur === conversationId ? null : cur));
      if (selectedIdRef.current === conversationId) setMessages([]);
      showError("This conversation is no longer available.");
    },
    []
  );

  // -- open a thread --------------------------------------------------------
  const openConversation = useCallback((conversationId: number) => {
    setSelectedId(conversationId);
    setLoadingThread(true);
    setMessages([]);
    setFreshMessageOrigins({});
    chatApi
      .listMessages(conversationId, { limit: PAGE_SIZE })
      .then((msgs) => {
        setMessages(msgs);
        setHasMore(msgs.length === PAGE_SIZE);
        const newest = msgs[msgs.length - 1];
        if (newest) {
          chatApi.markRead(conversationId, newest.id).catch(() => {});
          setConversations((prev) =>
            prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
          );
        }
      })
      .catch((err) => {
        if (isConversationGoneError(err)) handleConversationGone(conversationId);
        else showError("Could not open this conversation.");
      })
      .finally(() => setLoadingThread(false));
  }, [handleConversationGone]);

  /** Start (or jump to) a direct thread with someone from the contact list. */
  const startDirect = useCallback(
    async (staffId: string) => {
      try {
        const conv = await chatApi.openDirect(Number(staffId));
        setConversations((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]));
        openConversation(conv.id);
        refreshConversations();
      } catch {
        showError("Could not start that conversation.");
      }
    },
    [openConversation, refreshConversations]
  );

  // -- realtime -------------------------------------------------------------
  useWebSocketEvent("chat_message", (payload) => {
    const incoming = toChatMessage(payload);

    if (incoming.conversationId === selectedIdRef.current) {
      // Thread is on screen — append it and immediately acknowledge the read.
      // This event only ever fires for messages someone else sent (the backend
      // excludes the sender from its own recipient list), so it's always "received".
      markMessageFresh(incoming.id, "received");
      setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
      chatApi.markRead(incoming.conversationId, incoming.id).catch(() => {});
      setConversations((prev) =>
        prev.map((c) =>
          c.id === incoming.conversationId
            ? { ...c, lastMessage: incoming, lastMessageAt: incoming.createdAt, unreadCount: 0 }
            : c
        )
      );
    } else if (!knownConvIdsRef.current.has(incoming.conversationId)) {
      // First message of a thread this client hasn't seen yet — pull it in.
      // Kept outside the state updater: React may run an updater more than once,
      // and a refetch must not be fired twice.
      refreshConversations();
    } else {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === incoming.conversationId
            ? {
                ...c,
                lastMessage: incoming,
                lastMessageAt: incoming.createdAt,
                unreadCount: c.unreadCount + 1,
              }
            : c
        )
      );
    }
  });

  // Covers both a plain text edit and a payment note's approve/reject decision
  // (the backend emits this same event for either) — replacing the whole
  // message keeps both cases correct without two separate patch shapes.
  useWebSocketEvent("chat_message_updated", (payload) => {
    const updated = toChatMessage(payload);
    setMessages((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  });

  useWebSocketEvent("chat_message_deleted", (payload) => {
    const deleted = toChatMessage(payload);
    setMessages((prev) => prev.map((x) => (x.id === deleted.id ? deleted : x)));
  });

  useWebSocketEvent("chat_conversation_created", () => refreshConversations());
  useWebSocketEvent("chat_conversation_updated", () => refreshConversations());

  const refreshContacts = useCallback(() => {
    chatApi.listContacts().then(setContacts).catch(() => {});
  }, []);

  // Every mutating request broadcasts "data_changed" with the resource it
  // touched (see the backend's realtime_broadcast middleware). When someone
  // adds, edits, or removes a staff member, refresh the contact list so a new
  // hire's name appears here without anyone needing to reload the page.
  useWebSocketEvent("data_changed", (payload) => {
    if ((payload as { resource?: string }).resource === "staff") refreshContacts();
  });

  // -- derived --------------------------------------------------------------
  const directConversations = useMemo(
    () => conversations.filter((c) => c.kind === "direct"),
    [conversations]
  );
  const groupConversations = useMemo(
    () => conversations.filter((c) => c.kind === "group"),
    [conversations]
  );

  /** Turn a conversation into a sidebar row (same shape for direct threads and groups). */
  const toRow = useCallback((c: ChatConversation) => {
    const isGroup = c.kind === "group";
    const lastText = c.lastMessage?.deleted
      ? "This message was deleted"
      : c.lastMessage?.contentType === "voice"
        ? "🎤 Voice message"
        : c.lastMessage?.contentType === "image"
          ? "📷 Photo"
          : c.lastMessage?.contentType === "file"
            ? `📎 ${c.lastMessage.mediaFilename ?? "Document"}`
            : c.lastMessage?.contentType === "payment"
              ? (() => {
                  const p = parsePayment(c.lastMessage!.text);
                  return p ? `💰 ₹${formatRupees(p.amount)}` : "💰 Payment";
                })()
              : c.lastMessage?.text;
    const preview = c.lastMessage
      ? // In a group, prefix the preview with who sent it, as WhatsApp does.
        `${isGroup && !c.lastMessage.deleted && c.lastMessage.senderName ? `${c.lastMessage.senderName.split(" ")[0]}: ` : ""}${lastText}`
      : isGroup
        ? `${c.memberCount} member${c.memberCount === 1 ? "" : "s"}`
        : c.peer?.designation || c.peer?.department || c.peer?.softwareDesignation || "";
    return {
      key: `conv-${c.id}`,
      conversation: c as ChatConversation | null,
      isGroup,
      photoUrl: isGroup ? (c.hasPhoto ? chatApi.groupPhotoUrl(c.id) : null) : (c.peer?.photoUrl ?? null),
      name: c.title ?? (isGroup ? "Group" : c.peer?.name ?? "Unknown"),
      subtitle: preview,
      time: formatTime(c.lastMessageAt),
      unread: c.unreadCount,
      startWith: undefined as string | undefined,
    };
  }, []);

  /** A staff member with no thread yet, shown as a startable row (WhatsApp-style contact entry). */
  const toContactRow = useCallback(
    (m: ChatMember) => ({
      key: `contact-${m.staffId}`,
      conversation: null as ChatConversation | null,
      isGroup: false,
      photoUrl: m.photoUrl,
      name: m.name,
      subtitle: m.designation || m.department || m.softwareDesignation || "",
      time: "",
      unread: 0,
      startWith: m.staffId,
    }),
    []
  );

  /**
   * Chats tab — direct conversations only (groups live exclusively under the
   * Groups tab), followed by every other staff member so the full directory is
   * always visible and one tap starts a thread — no separate "New chat" step.
   * New hires appear automatically: `contacts` refreshes on the "staff"
   * data_changed event above.
   */
  const chatRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const conversingIds = new Set(
      directConversations.map((c) => c.peer?.staffId).filter(Boolean) as string[]
    );
    const rows = [
      ...directConversations.map(toRow),
      ...contacts.filter((m) => !conversingIds.has(m.staffId)).map(toContactRow),
    ];
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.subtitle ?? "").toLowerCase().includes(q)
    );
  }, [directConversations, contacts, searchQuery, toRow, toContactRow]);

  /** Groups tab — the same list narrowed to group conversations. */
  const groupRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = groupConversations.map(toRow);
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [groupConversations, searchQuery, toRow]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, selectedId]);

  // Switching threads invalidates whatever group info panel was open, and
  // discards any in-progress recording rather than let it silently keep going
  // against a thread that's no longer on screen.
  useEffect(() => {
    setShowGroupInfo(false);
    setGroupDetail(null);
    setEditingTitle(false);
    setShowAddMembers(false);
    setAddMemberIds([]);
    setShowEmojiPicker(false);
    setLightbox(null);
    setShowPaymentDialog(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      recordingCancelledRef.current = true;
      mediaRecorderRef.current.stop();
    }
  }, [selectedId]);

  // Escape closes the lightbox, matching every other overlay in the app.
  useEffect(() => {
    if (!lightbox) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

  // -- actions --------------------------------------------------------------
  /** Insert an emoji at the composer's current cursor position (not just appended
   * to the end), then restore focus and place the cursor right after it — matching
   * how every native emoji picker behaves. */
  function insertEmoji(emoji: string) {
    const input = draftInputRef.current;
    if (!input) {
      setDraft((d) => d + emoji);
      return;
    }
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    const cursor = start + emoji.length;
    // The input's value updates on React's next render; setSelectionRange must
    // wait for that DOM update or it'll place the cursor against the old value.
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setDraft("");
    try {
      const msg = await chatApi.sendMessage(selectedId, text);
      markMessageFresh(msg.id, "sent");
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId ? { ...c, lastMessage: msg, lastMessageAt: msg.createdAt } : c
        )
      );
    } catch (err) {
      if (isConversationGoneError(err)) {
        handleConversationGone(selectedId);
      } else {
        setDraft(text); // hand the text back so nothing is lost
        showError(err instanceof Error ? err.message : "Message could not be sent.");
      }
    } finally {
      setSending(false);
    }
  }

  // -- attachments (paperclip) -------------------------------------------
  async function handleAttachmentSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // always reset — otherwise picking the same file twice in a row is a no-op
    if (!file || !selectedId || sendingAttachment) return;

    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      showError(`"${file.name}" is too large — the limit is ${MAX_ATTACHMENT_MB} MB.`);
      return;
    }

    const conversationId = selectedId;
    setSendingAttachment(true);
    try {
      const msg = await chatApi.sendAttachment(conversationId, file);
      markMessageFresh(msg.id, "sent");
      if (conversationId === selectedIdRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, lastMessage: msg, lastMessageAt: msg.createdAt } : c
        )
      );
    } catch (err) {
      if (isConversationGoneError(err)) handleConversationGone(conversationId);
      else showError(err instanceof Error ? err.message : "Could not send that file.");
    } finally {
      setSendingAttachment(false);
    }
  }

  // -- payment note (WhatsApp-Pay-style, cosmetic only) --------------------
  function openPaymentDialog() {
    if (!selectedId) return;
    setPaymentAmount("");
    setPaymentNote("");
    setShowPaymentDialog(true);
  }

  async function handleSendPayment() {
    if (!selectedId || sendingPayment) return;
    const amount = Number(paymentAmount);
    if (!paymentAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
      showError("Enter an amount greater than zero.");
      paymentAmountInputRef.current?.focus();
      return;
    }
    const conversationId = selectedId;
    setSendingPayment(true);
    try {
      const msg = await chatApi.sendPayment(conversationId, amount, paymentNote);
      markMessageFresh(msg.id, "sent");
      setShowPaymentDialog(false);
      if (conversationId === selectedIdRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, lastMessage: msg, lastMessageAt: msg.createdAt } : c
        )
      );
    } catch (err) {
      if (isConversationGoneError(err)) {
        setShowPaymentDialog(false);
        handleConversationGone(conversationId);
      } else {
        showError(err instanceof Error ? err.message : "Could not send that payment note.");
      }
    } finally {
      setSendingPayment(false);
    }
  }

  const handlePaymentDecision = useCallback(
    async (messageId: number, status: "approved" | "rejected") => {
      try {
        const updated = await chatApi.decidePayment(messageId, status);
        setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
        setConversations((prev) =>
          prev.map((c) =>
            c.lastMessage?.id === messageId ? { ...c, lastMessage: updated } : c
          )
        );
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not record your decision.");
      }
    },
    []
  );

  // -- voice recording --------------------------------------------------
  function stopRecordingInternal() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordingSeconds(0);
  }

  async function startRecording() {
    if (!selectedId || recording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      showError("Voice messages aren't supported in this browser.");
      return;
    }
    setShowEmojiPicker(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      showError("Microphone access was denied. Allow microphone access to send a voice message.");
      return;
    }

    const mimeType = pickRecorderMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recordedChunksRef.current = [];
    recordingCancelledRef.current = false;
    recordingConversationIdRef.current = selectedId;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const wasCancelled = recordingCancelledRef.current;
      const durationMs = Date.now() - recordingStartRef.current;
      const conversationId = recordingConversationIdRef.current;
      const chunks = recordedChunksRef.current;
      stopRecordingInternal();

      if (wasCancelled || !conversationId || chunks.length === 0 || durationMs < 400) return;

      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      setSendingVoice(true);
      try {
        const msg = await chatApi.sendVoiceMessage(conversationId, blob, durationMs);
        markMessageFresh(msg.id, "sent");
        if (conversationId === selectedIdRef.current) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, lastMessage: msg, lastMessageAt: msg.createdAt } : c
          )
        );
      } catch (err) {
        if (isConversationGoneError(err)) handleConversationGone(conversationId);
        else showError(err instanceof Error ? err.message : "Voice message could not be sent.");
      } finally {
        setSendingVoice(false);
      }
    };

    mediaRecorderRef.current = recorder;
    mediaStreamRef.current = stream;
    recordingStartRef.current = Date.now();
    recorder.start();
    setRecording(true);
    setRecordingSeconds(0);
    recordingIntervalRef.current = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartRef.current) / 1000));
    }, 250);
  }

  function sendRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    recordingCancelledRef.current = false;
    mediaRecorderRef.current.stop();
  }

  function cancelRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      stopRecordingInternal();
      return;
    }
    recordingCancelledRef.current = true;
    mediaRecorderRef.current.stop();
  }

  // A recording in progress must not silently keep the mic open if the user
  // navigates away or switches conversations mid-recording.
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        recordingCancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function loadOlder() {
    if (!selectedId || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const older = await chatApi.listMessages(selectedId, {
        beforeId: messages[0].id,
        limit: PAGE_SIZE,
      });
      setHasMore(older.length === PAGE_SIZE);
      if (older.length) {
        setMessages((prev) => [...older, ...prev]);
        // Hold the reader's position instead of jumping to the top.
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight;
        });
      }
    } catch {
      /* leave the thread as-is on a failed page fetch */
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleCreateGroup() {
    if (creatingGroup) return;
    const title = groupTitle.trim();
    if (!title) {
      showError("Please enter a group name to create the group.");
      groupTitleInputRef.current?.focus();
      return;
    }
    setCreatingGroup(true);
    try {
      const conv = await chatApi.createGroup(title, groupMembers);
      setShowNewGroup(false);
      setGroupTitle("");
      setGroupMembers([]);
      setActiveTab("groups");
      refreshConversations();
      openConversation(conv.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not create the group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  const loadGroupDetail = useCallback((conversationId: number) => {
    setLoadingGroupDetail(true);
    chatApi
      .getConversation(conversationId)
      .then(setGroupDetail)
      .catch(() => showError("Could not load group details."))
      .finally(() => setLoadingGroupDetail(false));
  }, []);

  function openGroupInfo() {
    if (!selected || selected.kind !== "group") return;
    setShowGroupInfo(true);
    setEditingTitle(false);
    setShowAddMembers(false);
    setAddMemberIds([]);
    loadGroupDetail(selected.id);
  }

  function closeGroupInfo() {
    setShowGroupInfo(false);
    setGroupDetail(null);
    setEditingTitle(false);
    setShowAddMembers(false);
    setAddMemberIds([]);
  }

  async function handleSaveTitle() {
    if (!selected || savingTitle) return;
    const title = editTitleValue.trim();
    if (!title) {
      showError("Group name cannot be empty.");
      return;
    }
    setSavingTitle(true);
    try {
      const detail = await chatApi.renameGroup(selected.id, title);
      setGroupDetail(detail);
      setEditingTitle(false);
      refreshConversations();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not rename the group.");
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleUploadGroupPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file || !selected || savingPhoto) return;
    if (file.size > 5 * 1024 * 1024) {
      showError("Image is too large. The maximum allowed size is 5 MB.");
      return;
    }
    setSavingPhoto(true);
    try {
      const detail = await chatApi.uploadGroupPhoto(selected.id, file);
      setGroupDetail(detail);
      refreshConversations();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not upload the group photo.");
    } finally {
      setSavingPhoto(false);
    }
  }

  async function handleRemoveGroupPhoto() {
    if (!selected || savingPhoto) return;
    const result = await confirmAction("Remove group photo?", "The group will fall back to its default icon.", "Remove");
    if (!result.isConfirmed) return;
    setSavingPhoto(true);
    try {
      const detail = await chatApi.removeGroupPhoto(selected.id);
      setGroupDetail(detail);
      refreshConversations();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not remove the group photo.");
    } finally {
      setSavingPhoto(false);
    }
  }

  async function handleAddMembers() {
    if (!selected || addMemberIds.length === 0 || addingMembers) return;
    setAddingMembers(true);
    try {
      const detail = await chatApi.addMembers(selected.id, addMemberIds);
      setGroupDetail(detail);
      setAddMemberIds([]);
      setShowAddMembers(false);
      refreshConversations();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not add members.");
    } finally {
      setAddingMembers(false);
    }
  }

  async function handleRemoveMember(staffId: string, name: string) {
    if (!selected) return;
    const result = await confirmAction(`Remove ${name}?`, "They will lose access to this group.", "Remove");
    if (!result.isConfirmed) return;
    setRemovingMemberId(staffId);
    try {
      const detail = await chatApi.removeMember(selected.id, Number(staffId));
      setGroupDetail(detail);
      refreshConversations();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not remove that member.");
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleLeaveGroup() {
    if (!selected || myId == null || leavingGroup) return;
    const result = await confirmAction(
      "Exit this group?",
      "You will stop receiving messages from this group until someone adds you back.",
      "Exit Group"
    );
    if (!result.isConfirmed) return;
    setLeavingGroup(true);
    try {
      await chatApi.removeMember(selected.id, Number(myId));
      closeGroupInfo();
      setSelectedId(null);
      setMessages([]);
      refreshConversations();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not leave the group.");
    } finally {
      setLeavingGroup(false);
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

  const rows = activeTab === "chats" ? chatRows : groupRows;

  return (
    <div className="animate-stagger flex h-[calc(100vh-6rem)] flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
        {/* Left panel — tabs, search, people/groups */}
        <div className="flex w-full max-w-[340px] shrink-0 flex-col bg-white">
          {/* Navy header bar */}
          <div className="flex shrink-0 items-center justify-between bg-brand-navy px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <MessageSquare className="h-4 w-4 text-brand-gold" />
              </div>
              <span className="text-base font-semibold text-white">Canaan Chat</span>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === "groups" && (
                <button
                  type="button"
                  onClick={() => setShowNewGroup(true)}
                  title="New group"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-brand-gold transition-colors hover:bg-white/25"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
              <Avatar name={user?.name ?? "Me"} photoUrl={null} size={32} />
            </div>
          </div>

          {/* Chats / Groups tabs */}
          <div className="flex shrink-0 gap-2 bg-white px-3 pt-2.5">
            {(["chats", "groups"] as const).map((tab) => {
              const count =
                tab === "chats"
                  ? directConversations.reduce((n, c) => n + c.unreadCount, 0)
                  : groupConversations.reduce((n, c) => n + c.unreadCount, 0);
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative flex-1 pb-2.5 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab ? "text-brand-navy" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab}
                  {count > 0 && (
                    <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand-gold px-1.5 py-0.5 text-[10px] font-bold text-brand-navy">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                  {activeTab === tab && (
                    <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-brand-gold" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="h-px shrink-0 bg-gray-200" />

          {/* Search */}
          <div className="shrink-0 bg-white px-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={activeTab === "chats" ? "Search chats..." : "Search groups..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-no-transform w-full rounded-lg border-none bg-gray-100 py-2 pl-9 pr-4 text-sm text-gray-700 outline-none transition-all placeholder:text-gray-500 focus:bg-white focus:ring-2 focus:ring-brand-gold/30"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-white">
            {rows.length === 0 ? (
              activeTab === "groups" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-navy/10">
                    <Users className="h-6 w-6 text-brand-navy" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">No groups yet</p>
                  <p className="text-xs text-gray-500">
                    Create a group to start chatting with your team together.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewGroup(true)}
                    className="mt-1 flex items-center gap-1.5 rounded-full bg-brand-navy px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-navy/90"
                  >
                    <Plus className="h-3.5 w-3.5 text-brand-gold" />
                    New Group
                  </button>
                </div>
              ) : (
                <p className="p-4 text-center text-sm text-gray-400">No people found</p>
              )
            ) : (
              rows.map((row) => {
                const isActive = row.conversation != null && row.conversation.id === selectedId;
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => {
                      if (row.conversation) openConversation(row.conversation.id);
                      else if (row.startWith) startDirect(row.startWith);
                    }}
                    className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-3 text-left transition-colors ${
                      isActive ? "bg-brand-navy/5" : "hover:bg-gray-50"
                    }`}
                  >
                    <Avatar
                      name={row.name}
                      photoUrl={row.photoUrl}
                      size={48}
                      group={row.isGroup}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[15px] font-medium text-gray-900">{row.name}</span>
                        {row.time && (
                          <span
                            className={`shrink-0 text-[11px] ${
                              row.unread > 0 ? "font-semibold text-brand-navy" : "text-gray-400"
                            }`}
                          >
                            {row.time}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-[13px] ${
                            row.unread > 0 ? "font-medium text-gray-700" : "text-gray-500"
                          }`}
                        >
                          {row.subtitle}
                        </p>
                        {row.unread > 0 && (
                          <span className="flex min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand-gold px-1.5 py-0.5 text-[10px] font-bold text-brand-navy">
                            {row.unread > 99 ? "99+" : row.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right panel — active conversation */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 bg-gray-100 px-4 py-2.5">
                <div
                  className={`flex min-w-0 items-center gap-3 ${
                    selected.kind === "group" ? "cursor-pointer" : ""
                  }`}
                  onClick={selected.kind === "group" ? openGroupInfo : undefined}
                  title={selected.kind === "group" ? "View group info" : undefined}
                >
                  <Avatar
                    name={selected.title ?? ""}
                    photoUrl={selected.kind === "group" ? (selected.hasPhoto ? chatApi.groupPhotoUrl(selected.id) : null) : selected.peer?.photoUrl}
                    size={40}
                    group={selected.kind === "group"}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-gray-900">
                      {selected.title ?? "Conversation"}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {selected.kind === "group"
                        ? `${selected.memberCount} member${selected.memberCount === 1 ? "" : "s"}`
                        : selected.peer?.designation ||
                          selected.peer?.department ||
                          selected.peer?.softwareDesignation ||
                          ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-gray-500">
                  <MoreVertical className="h-[18px] w-[18px] cursor-pointer hover:text-gray-700" />
                </div>
              </div>

              <div
                ref={scrollRef}
                className="relative flex-1 overflow-y-auto px-4 py-4 sm:px-10"
                style={{
                  backgroundColor: "#eef1f8",
                  backgroundImage:
                    "radial-gradient(rgba(27,43,94,0.05) 1px, transparent 1px), radial-gradient(rgba(27,43,94,0.05) 1px, transparent 1px)",
                  backgroundSize: "28px 28px",
                  backgroundPosition: "0 0, 14px 14px",
                }}
              >
                {loadingThread ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70">
                      <MessageSquare className="h-5 w-5 text-brand-navy" />
                    </div>
                    <p className="text-sm text-gray-500">
                      No messages yet. Say hello to {(selected.title ?? "them").split(" ")[0]}.
                    </p>
                  </div>
                ) : (
                  // min-h-full + justify-end anchors a short thread to the bottom of the
                  // pane (like WhatsApp) instead of leaving it floating at the top with a
                  // huge dead gap underneath once the thread grows past a full screen.
                  <div className="flex min-h-full flex-col justify-end gap-1 py-2">
                    {hasMore && (
                      <div className="mb-2 flex justify-center">
                        <button
                          type="button"
                          onClick={loadOlder}
                          disabled={loadingOlder}
                          className="rounded-full bg-white/80 px-4 py-1.5 text-xs font-medium text-brand-navy shadow-sm transition-colors hover:bg-white disabled:opacity-60"
                        >
                          {loadingOlder ? "Loading..." : "Load earlier messages"}
                        </button>
                      </div>
                    )}
                    {messages.map((m, i) => {
                      const fromMe = myId != null && m.senderId === Number(myId);
                      const prev = messages[i - 1];
                      const showDay =
                        !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                      // In groups, label a run of messages with the sender's name once.
                      const showSender =
                        selected.kind === "group" &&
                        !fromMe &&
                        (!prev || prev.senderId !== m.senderId || showDay);
                      // Tighten the gap between consecutive messages from the same
                      // sender, and open it back up across a sender change — reads as
                      // grouped "runs" instead of a uniform, monotonous stack.
                      const grouped = !showDay && prev && prev.senderId === m.senderId;
                      // Only messages that arrived live this session animate in — the
                      // initial history load and "load earlier" pages render instantly.
                      const origin = freshMessageOrigins[m.id];
                      const entranceAnim =
                        origin === "sent"
                          ? "animate-chat-bubble-sent"
                          : origin === "received"
                            ? "animate-chat-bubble-received"
                            : "";
                      const payment = m.contentType === "payment" ? parsePayment(m.text) : null;
                      return (
                        <div key={m.id} className={grouped ? "mt-0.5" : "mt-2.5"}>
                          {showDay && (
                            <div className="animate-chat-day mb-3 mt-1 flex justify-center">
                              <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm">
                                {dayLabel(m.createdAt)}
                              </span>
                            </div>
                          )}
                          {m.contentType === "system" ? (
                            // A plain app-generated notice ("Your Payment Request Has Been
                            // Approved") — centered like the day pill, not a bubble from
                            // either side, since it isn't a reply from either participant.
                            <div className={`${entranceAnim} my-1 flex justify-center`}>
                              <span className="rounded-full bg-white/90 px-3 py-1.5 text-center text-[11px] font-medium text-brand-navy shadow-sm">
                                {m.text}
                              </span>
                            </div>
                          ) : (
                          <div className={`flex items-end gap-1.5 ${fromMe ? "justify-end" : "justify-start"}`}>
                            {selected.kind === "group" && !fromMe && (
                              showSender ? (
                                <div
                                  className={`mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${senderColor(m.senderId).bg}`}
                                  title={m.senderName ?? "Unknown"}
                                >
                                  {getInitials(m.senderName || "?")}
                                </div>
                              ) : (
                                <div className="w-6 shrink-0" />
                              )
                            )}
                            <div
                              className={`${entranceAnim} max-w-[70%] text-[14px] shadow-[0_1px_2px_rgba(16,24,40,0.08)] ${
                                m.contentType === "image" && !m.deleted ? "p-1" : "px-3 py-1.5"
                              } ${
                                fromMe
                                  ? `rounded-l-2xl rounded-br-md bg-amber-100 text-gray-800 ${grouped ? "rounded-tr-md" : "rounded-tr-2xl"}`
                                  : `rounded-r-2xl rounded-bl-md bg-white text-gray-800 ${grouped ? "rounded-tl-md" : "rounded-tl-2xl"}`
                              }`}
                            >
                              {showSender && (
                                <p className={`mb-0.5 text-[11px] font-semibold ${senderColor(m.senderId).text}`}>
                                  {m.senderName ?? "Unknown"}
                                </p>
                              )}
                              {m.deleted ? (
                                <p className="flex items-center gap-2 py-0.5 italic text-gray-400">
                                  This message was deleted
                                  <span className="text-[10px] not-italic text-gray-400">
                                    {formatTime(m.createdAt)}
                                  </span>
                                </p>
                              ) : m.contentType === "voice" ? (
                                <>
                                  <VoiceBubble message={m} />
                                  <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-400">
                                    {formatTime(m.createdAt)}
                                    {fromMe && <CheckCheck className="h-3.5 w-3.5 text-brand-navy" />}
                                  </span>
                                </>
                              ) : m.contentType === "image" ? (
                                <div className="relative">
                                  <ImageBubble
                                    message={m}
                                    onOpen={(url, name) => setLightbox({ url, name })}
                                  />
                                  <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] text-white">
                                    {formatTime(m.createdAt)}
                                    {fromMe && <CheckCheck className="h-3 w-3" />}
                                  </span>
                                </div>
                              ) : m.contentType === "file" ? (
                                <>
                                  <FileBubble message={m} />
                                  <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-400">
                                    {formatTime(m.createdAt)}
                                    {fromMe && <CheckCheck className="h-3.5 w-3.5 text-brand-navy" />}
                                  </span>
                                </>
                              ) : payment ? (
                                <>
                                  <PaymentBubble
                                    message={m}
                                    amount={payment.amount}
                                    note={payment.note}
                                    fromMe={fromMe}
                                    onDecide={handlePaymentDecision}
                                  />
                                  <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-gray-400">
                                    {formatTime(m.createdAt)}
                                    {fromMe && <CheckCheck className="h-3.5 w-3.5 text-brand-navy" />}
                                  </span>
                                </>
                              ) : (
                                // The time+ticks float at the end of the text — WhatsApp's own
                                // trick: a right-floated span placed after the text sits on the
                                // last line if there's room, or wraps to its own line if not,
                                // instead of always reserving a full separate row underneath.
                                <p className="whitespace-pre-wrap break-words pr-1 leading-snug after:clear-both after:table after:content-['']">
                                  {m.text}
                                  <span className="float-right ml-2 mt-1 flex translate-y-0.5 items-center gap-1 whitespace-nowrap text-[10px] text-gray-400">
                                    {m.editedAt && <span className="italic">edited</span>}
                                    {formatTime(m.createdAt)}
                                    {fromMe && <CheckCheck className="h-3.5 w-3.5 text-brand-navy" />}
                                  </span>
                                </p>
                              )}
                            </div>
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {recording ? (
                <div className="flex shrink-0 items-center gap-3 bg-gray-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={cancelRecording}
                    title="Cancel recording"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                  <div className="flex flex-1 items-center gap-2 rounded-lg bg-white px-4 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
                    <span className="text-sm font-medium tabular-nums text-gray-700">
                      {formatDuration(recordingSeconds)}
                    </span>
                    <span className="text-xs text-gray-400">Recording voice message…</span>
                  </div>
                  <button
                    type="button"
                    onClick={sendRecording}
                    title="Send"
                    className="btn-interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white transition-all duration-200 hover:bg-brand-navy/90 active:scale-90"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative flex shrink-0 items-center gap-3 bg-gray-100 px-4 py-2.5">
                  <button
                    type="button"
                    data-emoji-toggle
                    onClick={() => setShowEmojiPicker((v) => !v)}
                    title="Emoji"
                    className={`shrink-0 rounded-lg p-0.5 transition-colors ${
                      showEmojiPicker ? "text-brand-navy" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <Smile className="h-6 w-6" />
                  </button>
                  {showEmojiPicker && (
                    <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmojiPicker(false)} />
                  )}
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    onChange={handleAttachmentSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={sendingAttachment}
                    title="Attach a file"
                    className="shrink-0 text-gray-500 transition-colors hover:text-gray-700 disabled:opacity-60"
                  >
                    {sendingAttachment ? (
                      <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
                    ) : (
                      <Paperclip className="h-5 w-5" />
                    )}
                  </button>
                  <input
                    ref={draftInputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend();
                    }}
                    placeholder="Type a message"
                    className="input-no-transform flex-1 rounded-lg border-none bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition-all placeholder:text-gray-500 focus:ring-2 focus:ring-brand-gold/30"
                  />
                  <button
                    type="button"
                    onClick={openPaymentDialog}
                    title="Send a payment note"
                    className="btn-interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-brand-navy transition-all duration-200 hover:bg-brand-gold/25 active:scale-90"
                  >
                    <IndianRupee className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={draft.trim() ? handleSend : startRecording}
                    disabled={sending || sendingVoice}
                    title={draft.trim() ? "Send" : "Record a voice message"}
                    className="btn-interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white transition-all duration-200 hover:bg-brand-navy/90 active:scale-90 disabled:opacity-60 disabled:active:scale-100"
                  >
                    {sending || sendingVoice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : draft.trim() ? (
                      <Send className="h-4 w-4 animate-chat-day" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-gray-50 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-navy/10">
                <MessageSquare className="h-7 w-7 text-brand-navy" />
              </div>
              <p className="text-base font-medium text-gray-700">Canaan Chat</p>
              <p className="max-w-sm text-sm text-gray-500">
                Pick a person from the list on the left to open the conversation.
              </p>
            </div>
          )}
        </div>

        {/* Group info panel — rightmost column, WhatsApp-style */}
        {showGroupInfo && selected && selected.kind === "group" && (
          <div className="flex w-full max-w-[320px] shrink-0 flex-col border-l border-gray-200 bg-white">
            <div className="flex shrink-0 items-center gap-3 bg-brand-navy px-4 py-3">
              <button
                type="button"
                onClick={closeGroupInfo}
                className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-sm font-bold text-white">Group Info</h2>
            </div>

            {loadingGroupDetail || !groupDetail ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {/* Identity */}
                <div className="flex flex-col items-center gap-2 border-b border-gray-100 px-5 py-6 text-center">
                  <div className="relative">
                    <Avatar
                      name={groupDetail.title ?? "Group"}
                      photoUrl={groupDetail.hasPhoto ? chatApi.groupPhotoUrl(groupDetail.id) : null}
                      size={88}
                      group
                    />
                    {groupDetail.myRole === "admin" && (
                      <>
                        <input
                          ref={groupPhotoInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleUploadGroupPhoto}
                          className="hidden"
                        />
                        <button
                          type="button"
                          title="Change group photo"
                          onClick={() => groupPhotoInputRef.current?.click()}
                          disabled={savingPhoto}
                          className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-navy text-white shadow-sm transition-colors hover:bg-brand-navy/90 disabled:opacity-60"
                        >
                          {savingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    )}
                  </div>
                  {groupDetail.myRole === "admin" && groupDetail.hasPhoto && (
                    <button
                      type="button"
                      onClick={handleRemoveGroupPhoto}
                      disabled={savingPhoto}
                      className="text-[11px] font-medium text-red-500 transition-colors hover:text-red-600 disabled:opacity-60"
                    >
                      Remove photo
                    </button>
                  )}

                  {editingTitle ? (
                    <div className="mt-2 flex w-full items-center gap-1.5">
                      <input
                        autoFocus
                        type="text"
                        value={editTitleValue}
                        onChange={(e) => setEditTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveTitle();
                          if (e.key === "Escape") setEditingTitle(false);
                        }}
                        className="input-no-transform flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
                      />
                      <button
                        type="button"
                        onClick={handleSaveTitle}
                        disabled={savingTitle}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white transition-colors hover:bg-brand-navy/90 disabled:opacity-60"
                      >
                        {savingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-1.5">
                      <p className="text-lg font-semibold text-gray-900">{groupDetail.title}</p>
                      {groupDetail.myRole === "admin" && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditTitleValue(groupDetail.title ?? "");
                            setEditingTitle(true);
                          }}
                          title="Rename group"
                          className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-navy"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Group · {groupDetail.memberCount} participant{groupDetail.memberCount === 1 ? "" : "s"}
                  </p>
                </div>

                {/* Created date */}
                <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3.5">
                  <Calendar className="h-4 w-4 shrink-0 text-brand-navy" />
                  <p className="text-xs text-gray-600">
                    {groupDetail.createdAt ? `Created on ${formatFullDate(groupDetail.createdAt)}` : "Creation date unavailable"}
                  </p>
                </div>

                {/* Media, links, docs — no attachment backend yet, so shown as empty */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                  {[
                    { icon: ImageIcon, label: "Media" },
                    { icon: Link2, label: "Links" },
                    { icon: FileText, label: "Docs" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex flex-col items-center gap-1 px-2 py-3.5">
                      <Icon className="h-4 w-4 text-gray-400" />
                      <span className="text-[11px] font-medium text-gray-500">{label}</span>
                      <span className="text-[10px] text-gray-400">None yet</span>
                    </div>
                  ))}
                </div>

                {/* Members */}
                <div className="px-5 py-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {groupDetail.memberCount} Participant{groupDetail.memberCount === 1 ? "" : "s"}
                    </p>
                    {groupDetail.myRole === "admin" && (
                      <button
                        type="button"
                        onClick={() => setShowAddMembers((v) => !v)}
                        className="flex items-center gap-1 text-xs font-semibold text-brand-navy hover:underline"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    )}
                  </div>

                  {showAddMembers && (
                    <div className="mb-3 rounded-lg border border-gray-200">
                      <div className="max-h-40 overflow-y-auto">
                        {contacts.filter((c) => !groupDetail.members.some((m) => m.staffId === c.staffId))
                          .length === 0 ? (
                          <p className="p-3 text-center text-xs text-gray-400">
                            Everyone is already in this group.
                          </p>
                        ) : (
                          contacts
                            .filter((c) => !groupDetail.members.some((m) => m.staffId === c.staffId))
                            .map((c) => {
                              const checked = addMemberIds.includes(Number(c.staffId));
                              return (
                                <label
                                  key={c.staffId}
                                  className="flex cursor-pointer items-center gap-2 border-b border-gray-100 px-2.5 py-1.5 last:border-b-0 hover:bg-gray-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setAddMemberIds((prev) =>
                                        e.target.checked
                                          ? [...prev, Number(c.staffId)]
                                          : prev.filter((x) => x !== Number(c.staffId))
                                      )
                                    }
                                    className="h-3.5 w-3.5 accent-[#1b2b5e]"
                                  />
                                  <Avatar name={c.name} photoUrl={c.photoUrl} size={24} />
                                  <span className="truncate text-xs text-gray-800">{c.name}</span>
                                </label>
                              );
                            })
                        )}
                      </div>
                      {addMemberIds.length > 0 && (
                        <div className="flex justify-end border-t border-gray-100 p-2">
                          <button
                            type="button"
                            onClick={handleAddMembers}
                            disabled={addingMembers}
                            className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-navy/90 disabled:opacity-60"
                          >
                            {addingMembers ? "Adding..." : `Add ${addMemberIds.length}`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col">
                    {groupDetail.members.map((m) => {
                      const isSelf = myId != null && m.staffId === String(myId);
                      return (
                        <div
                          key={m.staffId}
                          className="group flex items-center gap-3 rounded-lg px-1.5 py-2 hover:bg-gray-50"
                        >
                          <Avatar name={m.name} photoUrl={m.photoUrl} size={36} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-gray-900">
                              {m.name}
                              {isSelf && <span className="text-gray-400"> (You)</span>}
                            </p>
                            <p className="truncate text-[11px] text-gray-500">
                              {m.designation || m.department || m.softwareDesignation || ""}
                            </p>
                          </div>
                          {m.role === "admin" && (
                            <span
                              title="Group admin"
                              className="flex shrink-0 items-center gap-1 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-semibold text-brand-navy"
                            >
                              <Crown className="h-3 w-3" />
                              Admin
                            </span>
                          )}
                          {groupDetail.myRole === "admin" && !isSelf && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.staffId, m.name)}
                              disabled={removingMemberId === m.staffId}
                              title={`Remove ${m.name}`}
                              className="shrink-0 rounded-lg p-1 text-gray-300 opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
                            >
                              {removingMemberId === m.staffId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <UserMinus className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Exit group */}
                <div className="border-t border-gray-100 px-5 py-3.5">
                  <button
                    type="button"
                    onClick={handleLeaveGroup}
                    disabled={leavingGroup}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />
                    {leavingGroup ? "Leaving..." : "Exit Group"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image lightbox — full-size view of a tapped photo attachment */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Payment note dialog — cosmetic, WhatsApp-Pay-style. No real money moves;
          this just posts a formatted "₹amount, note" card into the chat. */}
      {showPaymentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-brand-navy px-5 py-4">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-brand-gold" />
                <h2 className="text-sm font-bold text-white">Send Payment Note</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentDialog(false)}
                className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-5 py-5">
              <p className="text-xs text-gray-500">
                Posts a formatted note in the chat — this doesn&apos;t move any real money.
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Amount <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={paymentAmountInputRef}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    autoFocus
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendPayment();
                    }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">Note (optional)</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendPayment();
                  }}
                  placeholder="e.g. Fuel reimbursement"
                  className="input-no-transform w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentDialog(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendPayment}
                  disabled={sendingPayment}
                  className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-navy/90 disabled:opacity-50"
                >
                  {sendingPayment ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New group dialog */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-brand-navy px-5 py-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-gold" />
                <h2 className="text-sm font-bold text-white">New Group</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNewGroup(false)}
                className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Group name <span className="text-red-500">*</span>
                </label>
                <input
                  ref={groupTitleInputRef}
                  type="text"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="e.g. Fleet Operations"
                  className="input-no-transform w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Members ({groupMembers.length} selected)
                </label>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
                  {contacts.map((m) => {
                    const checked = groupMembers.includes(Number(m.staffId));
                    return (
                      <label
                        key={m.staffId}
                        className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setGroupMembers((prev) =>
                              e.target.checked
                                ? [...prev, Number(m.staffId)]
                                : prev.filter((x) => x !== Number(m.staffId))
                            )
                          }
                          className="h-4 w-4 accent-[#1b2b5e]"
                        />
                        <Avatar name={m.name} photoUrl={m.photoUrl} size={32} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{m.name}</p>
                          <p className="truncate text-[11px] text-gray-500">
                            {m.designation || m.department || m.softwareDesignation || ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewGroup(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={creatingGroup}
                  className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-navy/90 disabled:opacity-50"
                >
                  {creatingGroup ? "Creating..." : "Create Group"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
