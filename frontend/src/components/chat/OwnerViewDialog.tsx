"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Lock, Loader2, MessageSquare, Mic, Image as ImageIcon, FileText, ShieldOff, History, Unlock, ShieldAlert, Eye, ArrowLeft } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { chatOwnerApi } from "@/lib/api";
import { showError, showSuccess } from "@/lib/swal";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Avatar, getInitials, formatTime, senderColor } from "@/components/chat/shared";
import type { ChatOwnerConversation, ChatMessage, ChatOwnerHistoryEntry } from "@/types/chat";

/** Title + avatar name for a direct or group owner-view thread — no "me" to
 * exclude from the label, since the owner isn't a participant in these. */
function threadTitle(c: Pick<ChatOwnerConversation, "kind" | "title" | "members">): string {
  return c.kind === "group" ? c.title : c.members.map((m) => m.name).join(" & ") || c.title;
}

const HISTORY_LABELS: Record<string, string> = {
  "chat.owner_view.unlock": "Unlock attempt",
  "chat.owner_view.change_password": "Password change",
  "chat.owner_view.view": "Conversation opened",
  "chat.owner_view.lock": "Locked (closed)",
};

function historyIcon(event: string) {
  if (event === "chat.owner_view.change_password") return KeyRound;
  if (event === "chat.owner_view.view") return Eye;
  if (event === "chat.owner_view.lock") return Lock;
  return Unlock;
}

export type OwnerViewToken = { token: string; expiresAt: number };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Lifted to the page so re-opening the dialog within its 30-minute window
   * doesn't ask for the password again — but it's still only ever kept in
   * memory (never localStorage), so a page refresh always re-locks it. */
  ownerToken: OwnerViewToken | null;
  onUnlocked: (token: OwnerViewToken) => void;
};

// Admin-only, read-only window into every conversation in the company.
// See backend/routers/chat_owner_view.py for the server-side half of this —
// a separate password, a short-lived token, no send/edit/delete routes, and
// every unlock + every conversation opened is written to the audit log.
export function OwnerViewDialog({ open, onClose, ownerToken, onUnlocked }: Props) {
  // The page clears ownerToken on its own 30-minute timer (see page.tsx), so
  // presence alone is the source of truth here — re-checking Date.now() during
  // render would just be a second, impure copy of that same check.
  const unlocked = !!ownerToken;

  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  // Plays the unlock button's success animation before actually revealing
  // the unlocked view, so the correct-password moment feels like something
  // instead of the view just instantly swapping underneath the button.
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const unlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [conversations, setConversations] = useState<ChatOwnerConversation[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // Changing the password still requires the current one, even from inside an
  // already-unlocked session — see OwnerViewDialog's design note in chat.
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [changePwError, setChangePwError] = useState("");

  // "History" — every unlock/password-change/view event, visible to any
  // Admin (see chatOwnerApi.history's note: deliberately not gated by the
  // owner password itself, so it works as a check on its own use).
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ChatOwnerHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
      setActiveId(null);
      setMessages([]);
      setShowChangePw(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setChangePwError("");
      setShowHistory(false);
      setHistory([]);
      setUnlockSuccess(false);
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
    }
  }, [open]);

  useEffect(() => () => {
    if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!open || !unlocked || !showHistory) return;
    setLoadingHistory(true);
    chatOwnerApi.history()
      .then(setHistory)
      .catch((err: unknown) => showError(err instanceof Error ? err.message : "Could not load history."))
      .finally(() => setLoadingHistory(false));
  }, [open, unlocked, showHistory]);

  useEffect(() => {
    if (!open || !unlocked) return;
    setLoadingList(true);
    chatOwnerApi.listConversations(ownerToken!.token)
      .then(setConversations)
      .catch((err: unknown) => showError(err instanceof Error ? err.message : "Could not load conversations."))
      .finally(() => setLoadingList(false));
  }, [open, unlocked, ownerToken]);

  useEffect(() => {
    if (!open || !unlocked || activeId === null) return;
    setLoadingMessages(true);
    setMessages([]);
    chatOwnerApi.listMessages(activeId, ownerToken!.token)
      .then((msgs) => {
        setMessages(msgs);
        requestAnimationFrame(() => threadRef.current?.scrollTo(0, threadRef.current.scrollHeight));
      })
      .catch((err: unknown) => showError(err instanceof Error ? err.message : "Could not load this conversation."))
      .finally(() => setLoadingMessages(false));
  }, [open, unlocked, activeId, ownerToken]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setUnlocking(true);
    setError("");
    try {
      const res = await chatOwnerApi.unlock(password);
      setUnlocking(false);
      setPassword("");
      setUnlockSuccess(true);
      // Let the unlock animation play before swapping in the full unlocked
      // view — onUnlocked flips `unlocked`, which replaces this form.
      unlockTimeoutRef.current = setTimeout(() => {
        onUnlocked({ token: res.token, expiresAt: Date.parse(res.expires_at) });
      }, 650);
    } catch (err: unknown) {
      setUnlocking(false);
      setError(err instanceof Error ? err.message : "Could not unlock owner view.");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setChangePwError("");
    if (newPw.length < 8) {
      setChangePwError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setChangePwError("New password and confirmation don't match.");
      return;
    }
    setChangingPw(true);
    try {
      await chatOwnerApi.changePassword(currentPw, newPw);
      showSuccess("Owner password changed.");
      setShowChangePw(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      setChangePwError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setChangingPw(false);
    }
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Owner View"
      className={unlocked ? "max-w-5xl" : "max-w-sm"}
      headerRight={
        unlocked ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowHistory((v) => !v); setShowChangePw(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50",
                showHistory ? "border-brand-navy/30 bg-brand-navy/5 text-brand-navy" : "border-gray-200 text-gray-600"
              )}
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
            <button
              type="button"
              onClick={() => { setShowChangePw((v) => !v); setShowHistory(false); }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Change password
            </button>
          </div>
        ) : undefined
      }
    >
      {!unlocked ? (
        <form onSubmit={handleUnlock} className="flex flex-col items-center gap-4 px-2 py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Every conversation, read-only</p>
            <p className="mt-1 text-xs text-gray-500">
              This is a separate password, not your login. Every time it&apos;s used is recorded.
            </p>
          </div>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Owner password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center tracking-widest"
          />
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          <div className="relative w-full">
            <button
              type="submit"
              disabled={unlocking || unlockSuccess || !password.trim()}
              className={cn(
                "relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-100",
                unlockSuccess ? "bg-emerald-600 animate-owner-unlock-pop" : "bg-brand-navy hover:opacity-90 disabled:opacity-50"
              )}
            >
              {unlockSuccess && (
                <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/30 animate-owner-unlock-sweep" />
              )}
              {unlocking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : unlockSuccess ? (
                <Unlock className="h-4 w-4 animate-owner-unlock-key" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {unlocking ? "Checking…" : unlockSuccess ? "Unlocked" : "Unlock"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {showChangePw && (
            <form
              onSubmit={handleChangePassword}
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Current password
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-40"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                New password
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-40"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Confirm new password
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-40"
                  required
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={changingPw}
                  className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {changingPw ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowChangePw(false); setChangePwError(""); }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
              {changePwError && <p className="w-full text-xs font-medium text-red-600">{changePwError}</p>}
            </form>
          )}

          {showHistory ? (
            <div className="flex h-[70vh] flex-col overflow-hidden rounded-xl border border-gray-200">
              <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <p className="ml-1 text-sm font-semibold text-gray-900">Owner View history</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingHistory ? (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="pt-10 text-center text-sm text-gray-400">No history yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {history.map((h) => {
                      const Icon = historyIcon(h.event);
                      const denied = h.outcome === "denied";
                      return (
                        <div key={h.id} className="flex items-start gap-3 px-4 py-3">
                          <span
                            className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                              denied ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"
                            )}
                          >
                            {denied ? <ShieldAlert className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-sm font-semibold text-gray-900">
                                {HISTORY_LABELS[h.event] ?? h.event}
                              </span>
                              <span
                                className={cn(
                                  "text-[11px] font-medium",
                                  denied ? "text-red-500" : "text-emerald-600"
                                )}
                              >
                                {h.outcome}
                              </span>
                              <span className="text-[11px] text-gray-400">{formatDateTime(h.createdAt)}</span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {h.actorName ?? "Unknown"}
                              {h.resource ? ` · ${h.resource}` : ""}
                              {h.detail ? ` · ${h.detail}` : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
          <div className="flex h-[70vh] gap-0 overflow-hidden rounded-xl border border-gray-200">
          {/* Conversation list */}
          <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-gray-50/60">
            {loadingList ? (
              <div className="flex flex-1 items-center justify-center text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-400">No conversations yet.</p>
            ) : (
              conversations.map((c) => {
                const title = threadTitle(c);
                const preview = c.lastMessage
                  ? c.lastMessage.deleted
                    ? "Message deleted"
                    : c.lastMessage.contentType === "text"
                    ? c.lastMessage.text
                    : c.lastMessage.contentType === "voice"
                    ? "Voice message"
                    : c.lastMessage.mediaFilename || "Attachment"
                  : "No messages yet";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors",
                      activeId === c.id ? "bg-white shadow-[inset_3px_0_0_#1b2b5e]" : "hover:bg-white/70"
                    )}
                  >
                    <Avatar name={title} size={40} group={c.kind === "group"} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900">{title}</span>
                        {c.lastMessageAt && (
                          <span className="shrink-0 text-[11px] text-gray-400">{formatTime(c.lastMessageAt)}</span>
                        )}
                      </span>
                      <span className="truncate text-xs text-gray-400">{preview}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Thread */}
          <div className="flex min-w-0 flex-1 flex-col bg-white">
            {!active ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-300">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <MessageSquare className="h-7 w-7" />
                </span>
                <p className="text-sm font-medium text-gray-400">Owner View</p>
                <p className="text-xs text-gray-400">Pick a conversation on the left to view it.</p>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2.5">
                  <Avatar name={threadTitle(active)} size={36} group={active.kind === "group"} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{threadTitle(active)}</p>
                    <p className="truncate text-xs text-gray-400">{active.members.map((m) => m.name).join(", ")}</p>
                  </div>
                </div>
                <div ref={threadRef} className="flex-1 overflow-y-auto bg-gray-50/40 px-4 py-3">
                  {loadingMessages ? (
                    <div className="flex h-full items-center justify-center text-gray-400">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="pt-10 text-center text-sm text-gray-400">No messages in this conversation.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {messages.map((m) => {
                        const color = senderColor(m.senderId);
                        return (
                          <div key={m.id} className="flex items-start gap-2">
                            <div
                              className={cn(
                                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                                color.bg
                              )}
                            >
                              {getInitials(m.senderName || "?")}
                            </div>
                            <div className="flex min-w-0 max-w-lg flex-col gap-0.5">
                              <div className="flex items-baseline gap-2">
                                <span className={cn("text-xs font-semibold", color.text)}>{m.senderName ?? "—"}</span>
                                <span className="text-[11px] text-gray-400">{formatTime(m.createdAt)}</span>
                              </div>
                              <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
                                {m.deleted ? (
                                  <span className="italic text-gray-400">Message deleted</span>
                                ) : m.contentType === "text" ? (
                                  m.text
                                ) : (
                                  <span
                                    title="Attachments aren't retrievable in Owner View, by design — this view can only show what was said, not the files themselves"
                                    className="flex cursor-default items-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1.5 text-gray-400"
                                  >
                                    {m.contentType === "voice" ? (
                                      <Mic className="h-3.5 w-3.5" />
                                    ) : m.contentType === "image" ? (
                                      <ImageIcon className="h-3.5 w-3.5" />
                                    ) : (
                                      <FileText className="h-3.5 w-3.5" />
                                    )}
                                    <span className="truncate">
                                      {m.contentType === "voice" ? "Voice message" : m.mediaFilename || "Attachment"}
                                    </span>
                                    <ShieldOff className="h-3 w-3 shrink-0" />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
